import { readdir } from 'node:fs/promises';
import { z } from 'zod';
import type { RepoRef } from '@devdigest/shared';
import {
  ConventionCategory,
  type ConventionCandidate,
  type ConventionSkillDraft,
} from '@devdigest/shared';
import { wrapUntrusted } from '@devdigest/reviewer-core';
import type { Container } from '../../platform/container.js';
import {
  ACCEPTED_STATUS,
  COMMENT_PREFIXES,
  CONFIG_FAMILIES,
  DEFAULT_SKILL_NAME,
  DEFAULT_SKILL_TYPE,
  DRAFT_INTRO,
  IGNORED_DIRS,
  MAX_CANDIDATES,
  MAX_EVIDENCE_SPAN,
  MAX_RANKED_SAMPLES,
  MAX_SAMPLE_BYTES,
  MAX_SAMPLE_LINES,
  MAX_SLUG_CHARS,
  NO_RANKED_SAMPLES_WARNING,
  PACKAGE_MANIFEST,
} from './constants.js';
import type { ConventionRowWithSha } from './repository.js';

/**
 * Conventions helpers — the deterministic half of the feature.
 *
 * Everything the model does NOT decide lives here: which files are sampled
 * (§2), whether a cited evidence range is real (§4), how two rules are judged
 * to be the same rule (§5) and what the merged skill body looks like (§6).
 * No function here resolves a model or touches `container.llm`.
 */

// ---- What the model returns (spec §3) ------------------------------------

export const LlmConventionCandidate = z.object({
  category: ConventionCategory,
  rule: z.string().min(8).max(240),
  evidence: z.object({
    file: z.string(),
    start_line: z.number().int().positive(),
    end_line: z.number().int().positive(),
  }),
  confidence: z.number().min(0).max(1),
});
export type LlmConventionCandidate = z.infer<typeof LlmConventionCandidate>;

export const LlmConventionResult = z.object({
  candidates: z.array(LlmConventionCandidate).max(MAX_CANDIDATES),
});
export type LlmConventionResult = z.infer<typeof LlmConventionResult>;

// ---- Sample selection (spec §2) ------------------------------------------

/** One sampled file: its real lines (post-cap) plus the numbered rendering. */
export interface ConventionSample {
  path: string;
  /** The file's REAL lines, capped — the only source of an evidence snippet. */
  lines: string[];
  /** `   1| code` rendering, so the model can only cite lines it has seen. */
  numbered: string;
}

export interface SampleSelection {
  samples: ConventionSample[];
  warnings: string[];
}

/** The repo fields sample selection needs — no row type, so it stays testable. */
export interface SampleRepo {
  id: string;
  owner: string;
  name: string;
}

/**
 * Pick the files one scan looks at. Plain code: configs + repo-intel's ranked
 * paths, read through `container.git`. It MUST NOT touch `container.llm` —
 * `helpers.test.ts` passes a container whose `llm` throws and still expects
 * samples (AC-39).
 *
 * First-level package directories come from listing the clone, unioned with the
 * leading segment of each ranked path. Two sources because neither alone covers
 * the spec: a repo-intel that returned nothing (unindexed / disabled) yields no
 * segments, and a unit test with a mocked git adapter has no clone to list. Each
 * candidate is confirmed by an actual `package.json` read either way, and a
 * failed listing degrades to the segments silently.
 */
export async function selectSamples(
  container: Container,
  repo: SampleRepo,
): Promise<SampleSelection> {
  const ref: RepoRef = { owner: repo.owner, name: repo.name };
  const warnings: string[] = [];

  // 1. Ranked source paths (already minus tests/configs/migrations). A degraded
  //    or unindexed repo-intel returns [] — configs alone are still a scan.
  let ranked: string[] = [];
  try {
    ranked = await container.repoIntel.getConventionSamples(repo.id, MAX_RANKED_SAMPLES);
  } catch {
    ranked = [];
  }
  if (ranked.length === 0) warnings.push(NO_RANKED_SAMPLES_WARNING);

  // 2. Config files: the repo root plus every first-level dir that is a package.
  const dirs = [''];
  for (const dir of await packageDirCandidates(container, ref, ranked)) {
    if (await exists(container, ref, join(dir, PACKAGE_MANIFEST))) dirs.push(dir);
  }

  const samples: ConventionSample[] = [];
  const seen = new Set<string>();
  for (const dir of dirs) {
    for (const family of CONFIG_FAMILIES) {
      for (const candidate of family) {
        const path = join(dir, candidate);
        const sample = await readSample(container, ref, path);
        if (!sample) continue;
        if (!seen.has(path)) {
          seen.add(path);
          samples.push(sample);
        }
        break; // first match of the family wins
      }
    }
  }

  // 3. The ranked source files themselves.
  for (const path of ranked) {
    if (seen.has(path)) continue;
    const sample = await readSample(container, ref, path);
    if (!sample) continue;
    seen.add(path);
    samples.push(sample);
  }

  return { samples, warnings };
}

/**
 * First-level directories worth probing for a `package.json`: everything the
 * clone's root lists, plus the leading segment of every ranked path. Dot-dirs
 * and `node_modules` are never packages we author, so they are skipped.
 */
async function packageDirCandidates(
  container: Container,
  ref: RepoRef,
  ranked: string[],
): Promise<string[]> {
  const dirs: string[] = [];
  const add = (segment: string | undefined) => {
    if (!segment || segment.startsWith('.') || IGNORED_DIRS.includes(segment)) return;
    if (!dirs.includes(segment)) dirs.push(segment);
  };

  // Listing the clone is what covers a repo whose ranked paths are empty (the
  // spec's "configs only → proceed"). An unavailable clone degrades to nothing.
  try {
    const entries = await readdir(container.git.clonePathFor(ref), { withFileTypes: true });
    for (const entry of entries) if (entry.isDirectory()) add(entry.name);
  } catch {
    /* no checkout (or a mocked git adapter in a unit test) — segments only */
  }

  for (const path of ranked) {
    const segment = path.split('/')[0];
    if (segment === path) continue; // a root-level file, not a dir
    add(segment);
  }
  return dirs;
}

function join(dir: string, name: string): string {
  return dir ? `${dir}/${name}` : name;
}

async function exists(container: Container, ref: RepoRef, path: string): Promise<boolean> {
  try {
    await container.git.readFile(ref, path);
    return true;
  } catch {
    return false;
  }
}

/** Read + cap one file; a missing/unreadable path is skipped silently. */
async function readSample(
  container: Container,
  ref: RepoRef,
  path: string,
): Promise<ConventionSample | null> {
  let content: string;
  try {
    content = await container.git.readFile(ref, path);
  } catch {
    return null;
  }
  const lines = capLines(content);
  // A file with nothing but blank lines is not evidence of anything, and an
  // adapter that answers a missing path with '' (rather than throwing) would
  // otherwise turn every probed config name into a sample.
  if (lines.every((line) => line.trim() === '')) return null;
  return { path, lines, numbered: numberLines(lines) };
}

/** `MAX_SAMPLE_LINES` lines, then `MAX_SAMPLE_BYTES` bytes — whichever bites first. */
export function capLines(content: string): string[] {
  const lines = content.split('\n').slice(0, MAX_SAMPLE_LINES);
  const out: string[] = [];
  let bytes = 0;
  for (const line of lines) {
    const size = Buffer.byteLength(line, 'utf8') + 1; // + the newline
    if (bytes + size > MAX_SAMPLE_BYTES) break;
    bytes += size;
    out.push(line);
  }
  return out;
}

/** 1-based line-number prefixes, so a cited line is a line the model saw. */
export function numberLines(lines: string[]): string {
  const width = String(lines.length).length;
  return lines.map((line, i) => `${String(i + 1).padStart(width, ' ')}| ${line}`).join('\n');
}

/**
 * The user message: the allowed paths, then each sample's numbered body wrapped
 * with `wrapUntrusted` — repo code is DATA, never instructions.
 */
export function buildUserMessage(repoFullName: string, samples: ConventionSample[]): string {
  const paths = samples.map((s) => `- ${s.path}`).join('\n');
  const blocks = samples
    .map((s) => wrapUntrusted(`sample:${s.path}`, s.numbered))
    .join('\n\n');
  return [
    `Repository: ${repoFullName}`,
    '',
    `## Sample files (${samples.length}) — cite ONLY these paths`,
    paths,
    '',
    '## Sample contents (numbered lines)',
    blocks,
  ].join('\n');
}

// ---- Evidence verification (spec §4) -------------------------------------

export interface VerifiedEvidence {
  path: string;
  startLine: number;
  endLine: number;
  /** Sliced out of the file's real lines — never the model's text. */
  snippet: string;
}

export type EvidenceCheck =
  | { ok: true; evidence: VerifiedEvidence }
  | { ok: false; reason: string };

/**
 * Verify a cited range against the samples THIS scan sent. Code decides, not the
 * model: an invented path fails without touching the filesystem, a range past
 * EOF or a blank/comment-only range fails, and a survivor's snippet is re-read
 * from the file's own lines (AC-40b).
 */
export function verifyEvidence(
  candidate: LlmConventionCandidate,
  samples: ConventionSample[],
): EvidenceCheck {
  const { file, start_line: start, end_line: end } = candidate.evidence;
  const sample = samples.find((s) => s.path === file);
  if (!sample) return { ok: false, reason: `file not in this scan's samples: ${file}` };
  if (start < 1 || end < start) {
    return { ok: false, reason: `inverted range ${file}:${start}-${end}` };
  }
  if (end > sample.lines.length) {
    return {
      ok: false,
      reason: `range past end of file ${file}:${start}-${end} (${sample.lines.length} lines)`,
    };
  }
  if (end - start >= MAX_EVIDENCE_SPAN) {
    return { ok: false, reason: `range too wide ${file}:${start}-${end}` };
  }
  const cited = sample.lines.slice(start - 1, end);
  if (!cited.some(isCodeLine)) {
    return { ok: false, reason: `blank or comment-only range ${file}:${start}-${end}` };
  }
  return {
    ok: true,
    evidence: { path: file, startLine: start, endLine: end, snippet: cited.join('\n') },
  };
}

/** A line that carries code: non-blank and not a comment opener/continuation. */
export function isCodeLine(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length === 0) return false;
  return !COMMENT_PREFIXES.some((p) => trimmed.startsWith(p));
}

// ---- Rescan merge key (spec §5) ------------------------------------------

/**
 * The merge key: lowercased, punctuation and whitespace collapsed to single
 * spaces. Two rules that differ only in wording noise hash to one key, which is
 * what lets a `rejected` tombstone block its rediscovery.
 */
export function normalizeRule(rule: string): string {
  return rule
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

// ---- DTOs ----------------------------------------------------------------

/** A persisted row (+ its scan's head sha) as the wire candidate. */
export function toCandidateDto({ row, headSha }: ConventionRowWithSha): ConventionCandidate {
  return {
    id: row.id,
    category: row.category,
    rule: row.rule,
    evidence_path: row.evidencePath ?? '',
    evidence_start_line: row.evidenceStartLine ?? 0,
    evidence_end_line: row.evidenceEndLine ?? 0,
    evidence_snippet: row.evidenceSnippet ?? '',
    head_sha: headSha,
    confidence: row.confidence ?? 0,
    status: row.status,
    accepted: row.status === ACCEPTED_STATUS,
  };
}

// ---- Accepted → skill (spec §6) ------------------------------------------

/**
 * Merge the ACCEPTED candidates into one editable skill draft. `pending` and
 * `rejected` rows are ignored here, not filtered by the caller, so no path can
 * leak a rule the user did not accept (AC-42, AC-48).
 */
export function buildSkillDraft(
  repoName: string,
  rows: ConventionRowWithSha[],
): ConventionSkillDraft {
  const accepted = rows.filter((r) => r.row.status === ACCEPTED_STATUS);
  const sections = accepted.map(({ row }) => {
    const range = `${row.evidencePath ?? ''}:L${row.evidenceStartLine ?? 0}-L${row.evidenceEndLine ?? 0}`;
    const snippet = row.evidenceSnippet ?? '';
    return [
      `## ${slugifyRule(row.rule)}`,
      '',
      row.rule,
      '',
      `Detected in \`${range}\``,
      '',
      fence(snippet),
    ].join('\n');
  });

  return {
    name: DEFAULT_SKILL_NAME,
    description: `${accepted.length} house conventions extracted from ${repoName}`,
    type: DEFAULT_SKILL_TYPE,
    enabled: true,
    body: [`# Conventions of ${repoName}`, '', DRAFT_INTRO, '', ...sections].join('\n').trimEnd(),
    count: accepted.length,
  };
}

/** `## <slug>` heading text for a rule — kebab-cased, clipped. */
export function slugifyRule(rule: string): string {
  const slug = normalizeRule(rule).replace(/ /g, '-');
  if (slug.length <= MAX_SLUG_CHARS) return slug;
  return slug.slice(0, MAX_SLUG_CHARS).replace(/-[^-]*$/, '');
}

/** Fence a snippet with a run of backticks longer than any inside it. */
function fence(snippet: string): string {
  const longest = Math.max(0, ...[...snippet.matchAll(/`+/g)].map((m) => m[0].length));
  const ticks = '`'.repeat(Math.max(3, longest + 1));
  return `${ticks}\n${snippet}\n${ticks}`;
}

/** Distinct evidence paths of the accepted rows — the skill's `evidence_files`. */
export function acceptedEvidenceFiles(rows: ConventionRowWithSha[]): string[] {
  const out: string[] = [];
  for (const { row } of rows) {
    const path = row.evidencePath;
    if (row.status !== ACCEPTED_STATUS || !path || out.includes(path)) continue;
    out.push(path);
  }
  return out;
}
