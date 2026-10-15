#!/usr/bin/env node
// workflow-retro collector: reads Claude Code session logs (JSONL) and prints the numbers of one
// multi-agent workflow as JSON. No dependencies. Read-only: it never writes anything.
//
//   node collect.mjs --list [--project <dir>]                 sessions of this project, newest first
//   node collect.mjs --session <id|path> --prompts            user prompts of a session (to pick a window)
//   node collect.mjs --session <id|path> [--from ISO] [--to ISO] [--deep]
//
// Without --deep only the parent log is read: a subagent is then known only by what its tool result
// reports (ONE request's usage, i.e. its final context size — not what it spent). --deep reads
// <session>/subagents/agent-*.jsonl and sums every request of every agent, nested ones included.

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
};

const AGENT_TOOLS = new Set(['Agent', 'Task']);
/** A file read by this many actors (main thread + agents) or more is reported as duplicated context. */
const DUP_MIN_ACTORS = 2;
/** A pause between two records longer than this is idle time, not work. */
const IDLE_GAP_MS = 180_000;
/** Rough size of a tool result in tokens. */
const approxTokens = (chars) => Math.ceil(chars / 4);

function projectDir() {
  const given = opt('project');
  if (given) return given;
  // Claude Code names the folder after the working directory, every non-alphanumeric as "-".
  return join(homedir(), '.claude', 'projects', process.cwd().replace(/[^a-zA-Z0-9]/g, '-'));
}

function readJsonl(path) {
  const out = [];
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      // a half-written last line of a live session
    }
  }
  return out;
}

function sessionPath() {
  const s = opt('session');
  if (!s) throw new Error('--session <id|path> is required (see --list)');
  if (s.endsWith('.jsonl') && existsSync(s)) return s;
  const p = join(projectDir(), `${s}.jsonl`);
  if (!existsSync(p)) throw new Error(`no session log at ${p}`);
  return p;
}

const textOf = (content) =>
  typeof content === 'string'
    ? content
    : Array.isArray(content)
      ? content.filter((b) => b.type === 'text').map((b) => b.text).join('\n')
      : '';

/** A prompt typed (or pasted) by the user — not a tool result, a hand-back or a notification. */
function userPrompt(rec) {
  if (rec.type !== 'user' || rec.isSidechain || rec.toolUseResult !== undefined || rec.isMeta) return null;
  const text = textOf(rec.message?.content).trim();
  if (!text) return null;
  if (/^(<task-notification|<system-reminder|Another Claude session sent a message|\[Image:)/.test(text)) return null;
  return text;
}

// ---- --list ------------------------------------------------------------------------------------

if (flag('list')) {
  const dir = projectDir();
  const rows = readdirSync(dir)
    .filter((f) => f.endsWith('.jsonl'))
    .map((f) => {
      const id = f.slice(0, -6);
      const st = statSync(join(dir, f));
      const sub = join(dir, id, 'subagents');
      const agents = existsSync(sub) ? readdirSync(sub).filter((x) => x.endsWith('.jsonl')).length : 0;
      return { session: id, modified: st.mtime.toISOString(), kb: Math.round(st.size / 1024), subagents: agents };
    })
    .sort((a, b) => b.modified.localeCompare(a.modified))
    .slice(0, Number(opt('limit') ?? 30));
  console.log(JSON.stringify({ projectDir: dir, sessions: rows }, null, 2));
  process.exit(0);
}

// ---- --prompts ---------------------------------------------------------------------------------

const mainPath = sessionPath();
const main = readJsonl(mainPath);

if (flag('prompts')) {
  const prompts = [];
  for (const rec of main) {
    const text = userPrompt(rec);
    if (text) prompts.push({ at: rec.timestamp, text: text.replace(/\s+/g, ' ').slice(0, 200) });
  }
  console.log(JSON.stringify({ session: basename(mainPath, '.jsonl'), prompts }, null, 2));
  process.exit(0);
}

// ---- collect -----------------------------------------------------------------------------------

const from = opt('from') ?? '';
const to = opt('to') ?? '￿';
const inWindow = (ts) => typeof ts === 'string' && ts >= from && ts < to;
const deep = flag('deep');

const emptyTokens = () => ({ input: 0, cache_write: 0, cache_read: 0, output: 0, requests: 0, peak_context: 0, output_estimated_requests: 0 });

const blockChars = (b) =>
  b.type === 'tool_use' ? JSON.stringify(b.input ?? '').length : (b.text ?? b.thinking ?? '').length;

function addUsage(tokens, { usage, final, chars }) {
  const input = usage.input_tokens ?? 0;
  const write = usage.cache_creation_input_tokens ?? 0;
  const read = usage.cache_read_input_tokens ?? 0;
  tokens.input += input;
  tokens.cache_write += write;
  tokens.cache_read += read;
  // A message whose final record never reached the log carries a streaming snapshot of
  // output_tokens (a handful). Its content is in the log, so estimate from that: a LOWER bound,
  // thinking is not stored in full.
  const logged = usage.output_tokens ?? 0;
  if (final) tokens.output += logged;
  else {
    tokens.output += Math.max(logged, approxTokens(chars));
    tokens.output_estimated_requests += 1;
  }
  tokens.requests += 1;
  tokens.peak_context = Math.max(tokens.peak_context, input + write + read);
}

/**
 * One actor's log (the main thread or one agent) → tokens, tool calls, files read, time span.
 * An assistant message is written once per content block; the usage on the early blocks is a
 * streaming snapshot (output_tokens still small), so the LAST record of a message id is the one counted
 * (see addUsage for a message that has no final record at all).
 */
function summarize(records, windowed) {
  const tokens = emptyTokens();
  const tools = {};
  const reads = []; // { path, toolUseId }
  const resultChars = new Map(); // tool_use id → size of its result
  const agentCalls = []; // Agent tool calls made by this actor
  const usageById = new Map();
  const seenTools = new Set();
  let first = null;
  let last = null;
  let promptChars = 0;
  let activeMs = 0;

  for (const rec of records) {
    if (windowed && !inWindow(rec.timestamp)) continue;
    if (rec.timestamp && (rec.type === 'assistant' || rec.type === 'user')) {
      first ??= rec.timestamp;
      // A gap longer than IDLE_GAP_MS is waiting (for the parent, for a resume), not work.
      const gap = last ? Date.parse(rec.timestamp) - Date.parse(last) : 0;
      if (gap > 0 && gap <= IDLE_GAP_MS) activeMs += gap;
      last = rec.timestamp;
    }
    if (rec.type === 'user') {
      const content = rec.message?.content;
      if (promptChars === 0 && rec.toolUseResult === undefined) promptChars = textOf(content).length;
      if (Array.isArray(content)) {
        for (const b of content) {
          if (b.type !== 'tool_result') continue;
          const size = typeof b.content === 'string' ? b.content.length : textOf(b.content).length;
          resultChars.set(b.tool_use_id, size);
        }
      }
      continue;
    }
    if (rec.type !== 'assistant') continue;
    const msg = rec.message ?? {};
    if (msg.usage && msg.id) {
      const seen = usageById.get(msg.id) ?? { chars: 0 };
      const chars = seen.chars + (msg.content ?? []).reduce((n, b) => n + blockChars(b), 0);
      usageById.set(msg.id, { usage: msg.usage, final: Boolean(msg.stop_reason), chars });
    }
    for (const b of msg.content ?? []) {
      if (b.type !== 'tool_use' || seenTools.has(b.id)) continue;
      seenTools.add(b.id);
      tools[b.name] = (tools[b.name] ?? 0) + 1;
      if (b.name === 'Read' && b.input?.file_path) reads.push({ path: b.input.file_path, toolUseId: b.id });
      if (AGENT_TOOLS.has(b.name)) {
        agentCalls.push({
          toolUseId: b.id,
          at: rec.timestamp,
          type: b.input?.subagent_type ?? 'general-purpose',
          description: b.input?.description ?? '',
          background: b.input?.run_in_background !== false,
          promptChars: (b.input?.prompt ?? '').length,
        });
      }
    }
  }
  for (const entry of usageById.values()) addUsage(tokens, entry);
  const toolCalls = Object.values(tools).reduce((a, b) => a + b, 0);
  return { tokens, tools, toolCalls, reads, resultChars, agentCalls, first, last, promptChars, activeMs };
}

const mainSum = summarize(main, true);

// What the parent log alone says about each agent: the tool result of its Agent call.
const reported = new Map(); // toolUseId → { tokens, durationMs, toolUses, agentId }
for (const rec of main) {
  const r = rec.toolUseResult;
  if (rec.type !== 'user' || !r || typeof r !== 'object' || r.totalTokens === undefined) continue;
  const block = Array.isArray(rec.message?.content) ? rec.message.content.find((b) => b.type === 'tool_result') : null;
  if (!block) continue;
  reported.set(block.tool_use_id, {
    agentId: r.agentId,
    reportedTokens: r.totalTokens,
    reportedDurationMs: r.totalDurationMs,
    reportedToolUses: r.totalToolUseCount,
  });
}

const sessionId = basename(mainPath, '.jsonl');
const subDir = join(mainPath.slice(0, -6), 'subagents');
const agents = [];

if (deep && existsSync(subDir)) {
  for (const f of readdirSync(subDir).filter((x) => x.endsWith('.jsonl'))) {
    const agentId = f.slice('agent-'.length, -'.jsonl'.length);
    const metaPath = join(subDir, `agent-${agentId}.meta.json`);
    const meta = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, 'utf8')) : {};
    const sum = summarize(readJsonl(join(subDir, f)), false);
    if (!sum.first || !inWindow(sum.first)) continue; // an agent belongs to the window it STARTED in
    const rep = reported.get(meta.toolUseId) ?? {};
    agents.push({
      agentId,
      type: meta.agentType ?? 'unknown',
      description: meta.description ?? '',
      depth: meta.spawnDepth ?? 1,
      background: meta.requestShape === 'background',
      start: sum.first,
      end: sum.last,
      durationMs: Date.parse(sum.last) - Date.parse(sum.first),
      activeMs: sum.activeMs,
      // Hand-backs past the first mean the parent sent it back for another round.
      handbacks: sum.tools.SubagentHandback ?? 0,
      promptChars: sum.promptChars,
      tokens: sum.tokens,
      toolCalls: sum.toolCalls,
      tools: sum.tools,
      spawned: sum.agentCalls.map((c) => c.type),
      reportedTokens: rep.reportedTokens ?? null,
      _reads: sum.reads,
      _resultChars: sum.resultChars,
    });
  }
  agents.sort((a, b) => a.start.localeCompare(b.start));
} else {
  // Parent log only: order and type from the Agent calls, numbers from their tool results.
  for (const call of mainSum.agentCalls) {
    const rep = reported.get(call.toolUseId) ?? {};
    agents.push({
      agentId: rep.agentId ?? null,
      type: call.type,
      description: call.description,
      depth: 1,
      background: call.background,
      start: call.at,
      end: rep.reportedDurationMs ? new Date(Date.parse(call.at) + rep.reportedDurationMs).toISOString() : null,
      durationMs: rep.reportedDurationMs ?? null,
      promptChars: call.promptChars,
      tokens: null,
      toolCalls: rep.reportedToolUses ?? null,
      reportedTokens: rep.reportedTokens ?? null,
    });
  }
}

// ---- parallelism -------------------------------------------------------------------------------

const timed = agents.filter((a) => a.start && a.end);
const overlapSet = new Set();
for (const a of timed) {
  for (const b of timed) {
    if (a !== b && b.start < a.end && a.start < b.end) overlapSet.add([a.type, b.type].sort().join(' ∥ '));
  }
}
const overlaps = [...overlapSet];
// Sweep over start/end events for the true peak.
let maxConcurrent = 0;
let running = 0;
const events = timed.flatMap((a) => [[a.start, 1], [a.end, -1]]).sort((x, y) => x[0].localeCompare(y[0]) || x[1] - y[1]);
for (const [, delta] of events) {
  running += delta;
  maxConcurrent = Math.max(maxConcurrent, running);
}
const agentMs = timed.reduce((n, a) => n + (a.durationMs ?? 0), 0);
// Time with at least one agent running (union of the intervals).
let busyMs = 0;
let cursor = '';
for (const a of [...timed].sort((x, y) => x.start.localeCompare(y.start))) {
  const s = a.start > cursor ? a.start : cursor;
  if (a.end > s) busyMs += Date.parse(a.end) - Date.parse(s);
  if (a.end > cursor) cursor = a.end;
}

// ---- duplicated context ------------------------------------------------------------------------

const duplicated = [];
let duplicatedTokens = 0;
if (deep) {
  const byPath = new Map(); // path → [{ actor, tokens }]
  const note = (actor, reads, resultChars) => {
    for (const r of reads) {
      const list = byPath.get(r.path) ?? [];
      list.push({ actor, tokens: approxTokens(resultChars.get(r.toolUseId) ?? 0) });
      byPath.set(r.path, list);
    }
  };
  note('main', mainSum.reads, mainSum.resultChars);
  for (const a of agents) note(`${a.type}#${a.agentId.slice(0, 6)}`, a._reads, a._resultChars);
  for (const [path, list] of byPath) {
    const actors = [...new Set(list.map((x) => x.actor))];
    if (actors.length < DUP_MIN_ACTORS && list.length < 3) continue;
    const size = Math.max(...list.map((x) => x.tokens));
    const extra = list.reduce((n, x) => n + x.tokens, 0) - size; // everything past the first full read
    duplicatedTokens += extra;
    duplicated.push({ path: path.replace(`${process.cwd()}/`, ''), reads: list.length, actors: actors.length, approxTokensEach: size, approxTokensRepeated: extra, by: actors });
  }
  duplicated.sort((a, b) => b.approxTokensRepeated - a.approxTokensRepeated);
}

// ---- rounds and totals -------------------------------------------------------------------------

const rounds = {};
for (const a of agents) rounds[a.type] = (rounds[a.type] ?? 0) + 1;

const total = emptyTokens();
const add = (t) => {
  if (!t) return;
  for (const k of ['input', 'cache_write', 'cache_read', 'output', 'requests', 'output_estimated_requests']) total[k] += t[k];
  total.peak_context = Math.max(total.peak_context, t.peak_context);
};
add(mainSum.tokens);
for (const a of agents) add(a.tokens);

const spent = (t) => (t ? t.input + t.cache_write + t.cache_read + t.output : 0);
const allSpent = spent(total);

const start = mainSum.first ?? agents[0]?.start ?? null;
const endCandidates = [mainSum.last, ...agents.map((a) => a.end)].filter(Boolean).sort();
const end = endCandidates.at(-1) ?? null;

console.log(
  JSON.stringify(
    {
      session: sessionId,
      mode: deep ? 'deep (subagent logs read from disk)' : 'parent log only — agent tokens are NOT included in totals',
      window: { from: from || null, to: to === '￿' ? null : to, start, end, wallClockMs: start && end ? Date.parse(end) - Date.parse(start) : null },
      totals: {
        tokens: total,
        toolCalls: mainSum.toolCalls + agents.reduce((n, a) => n + (a.toolCalls ?? 0), 0),
        agents: agents.length,
        nestedAgents: agents.filter((a) => a.depth > 1).length,
      },
      main: { tokens: mainSum.tokens, activeMs: mainSum.activeMs, toolCalls: mainSum.toolCalls, tools: mainSum.tools, shareOfTokens: allSpent ? +(spent(mainSum.tokens) / allSpent).toFixed(2) : null },
      agents: agents.map(({ _reads, _resultChars, ...a }) => ({
        ...a,
        shareOfTokens: a.tokens && allSpent ? +(spent(a.tokens) / allSpent).toFixed(2) : null,
      })),
      order: agents.map((a) => a.type),
      rounds,
      parallelism: {
        maxConcurrent,
        overlaps,
        agentMs,
        busyMs,
        // 1.0 = strictly one after another; 2.0 = two agents running the whole time.
        factor: busyMs ? +(agentMs / busyMs).toFixed(2) : null,
      },
      duplicatedContext: deep ? { approxTokensRepeated: duplicatedTokens, files: duplicated.slice(0, Number(opt('top') ?? 15)) } : null,
    },
    null,
    2,
  ),
);
