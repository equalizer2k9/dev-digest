import type {
  AgentPerformance,
  AgentPerformanceRow,
  AgentStats,
  PerfCostBreakdown,
  PerfCostLine,
  PerfPeriodQuery,
} from '@devdigest/shared';
import {
  COST_SCALE,
  COUNTED_STATUSES,
  DAY_MS,
  DEFAULT_PRESET,
  LOW_SAMPLE_THRESHOLD,
  PRESET_DAYS,
} from './constants.js';

/** One agent run with the decision / severity counts of its review's findings. */
export interface PerfRunRow {
  id: string;
  workspaceId: string;
  agentId: string | null;
  status: string | null;
  source: string;
  ranAt: Date;
  model: string | null;
  durationMs: number | null;
  costUsd: number | null;
  accepted: number;
  dismissed: number;
  pending: number;
  critical: number;
  warning: number;
  suggestion: number;
}

/** The resolved half-open interval `[from, to)`. */
export interface ResolvedPeriod {
  preset: PerfPeriodQuery['period'];
  from: Date;
  to: Date;
}

/** The query as a caller may pass it: every field optional (default 30 days). */
export type PeriodInput = Partial<Pick<PerfPeriodQuery, 'period' | 'from' | 'to'>>;

/** AC-3: presets are rolling windows ending at `now`; custom dates are UTC days, `to` inclusive. */
export function resolvePeriod(q: PeriodInput, now: Date): ResolvedPeriod {
  const preset = q.period ?? DEFAULT_PRESET;
  if (preset === 'custom' && q.from && q.to) {
    return {
      preset,
      from: new Date(`${q.from}T00:00:00.000Z`),
      to: new Date(new Date(`${q.to}T00:00:00.000Z`).getTime() + DAY_MS),
    };
  }
  const days = PRESET_DAYS[preset === '1d' ? '1d' : '30d'];
  return { preset, from: new Date(now.getTime() - days * DAY_MS), to: now };
}

/** AC-2: workspace, status done/failed, and `from <= ranAt < to`. */
export function isCountedRun(
  run: PerfRunRow,
  workspaceId: string,
  p: Pick<ResolvedPeriod, 'from' | 'to'>,
): boolean {
  if (run.workspaceId !== workspaceId) return false;
  if (!run.status || !(COUNTED_STATUSES as readonly string[]).includes(run.status)) return false;
  const t = run.ranAt.getTime();
  return t >= p.from.getTime() && t < p.to.getTime();
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

export interface PerfAgentRef {
  id: string;
  name: string;
}

const toNano = (usd: number) => Math.round(usd * COST_SCALE);
const fromNano = (n: number) => n / COST_SCALE;
const sumOf = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** Cost lines in integer nano-USD; converted to USD only when the DTO is built. */
interface NanoLine {
  key: string | null;
  label: string | null;
  runs: number;
  nano: number;
}

function toBreakdown(lines: NanoLine[], unpriced: number): PerfCostBreakdown {
  const sorted = [...lines].sort(
    (a, b) => b.nano - a.nano || (a.label ?? '').localeCompare(b.label ?? ''),
  );
  const out: PerfCostLine[] = sorted.map((l) => ({
    key: l.key,
    label: l.label,
    runs: l.runs,
    cost_usd: fromNano(l.nano),
  }));
  return { lines: out, unpriced_runs: unpriced };
}

/** Priced runs grouped by model; a null model is one `key: null` line (EC-6). */
function modelLines(runs: PerfRunRow[]): NanoLine[] {
  const byModel = new Map<string | null, NanoLine>();
  for (const r of runs) {
    if (r.costUsd === null) continue;
    const line = byModel.get(r.model) ?? { key: r.model, label: r.model, runs: 0, nano: 0 };
    line.runs += 1;
    line.nano += toNano(r.costUsd);
    byModel.set(r.model, line);
  }
  return [...byModel.values()];
}

interface RowAcc {
  row: AgentPerformanceRow;
  nano: number;
}

function buildRow(
  agent: PerfAgentRef | null,
  runs: PerfRunRow[],
): RowAcc {
  const priced = runs.filter((r) => r.costUsd !== null);
  const nano = sumOf(priced.map((r) => toNano(r.costUsd as number)));
  const timed = runs.filter((r) => r.durationMs !== null);
  const accepted = sumOf(runs.map((r) => r.accepted));
  const dismissed = sumOf(runs.map((r) => r.dismissed));
  const pending = sumOf(runs.map((r) => r.pending));
  const decided = accepted + dismissed;
  const findingsTotal = decided + pending;
  const last = runs.reduce<number | null>(
    (m, r) => (m === null || r.ranAt.getTime() > m ? r.ranAt.getTime() : m),
    null,
  );
  const row: AgentPerformanceRow = {
    agent_id: agent?.id ?? null,
    agent_name: agent?.name ?? null,
    runs: runs.length,
    priced_runs: priced.length,
    unpriced_runs: runs.length - priced.length,
    findings_total: findingsTotal,
    accepted,
    dismissed,
    pending,
    decided,
    accept_rate: decided > 0 ? accepted / decided : null,
    dismiss_rate: decided > 0 ? dismissed / decided : null,
    low_sample: decided < LOW_SAMPLE_THRESHOLD,
    avg_findings_per_run: runs.length > 0 ? findingsTotal / runs.length : null,
    total_cost_usd: priced.length > 0 ? fromNano(nano) : null,
    avg_cost_usd: priced.length > 0 ? fromNano(nano / priced.length) : null,
    avg_latency_ms:
      timed.length > 0 ? sumOf(timed.map((r) => r.durationMs as number)) / timed.length : null,
    last_run_at: last === null ? null : new Date(last).toISOString(),
    findings_by_severity: {
      CRITICAL: sumOf(runs.map((r) => r.critical)),
      WARNING: sumOf(runs.map((r) => r.warning)),
      SUGGESTION: sumOf(runs.map((r) => r.suggestion)),
    },
    trend: [],
    by_model: toBreakdown(modelLines(runs), runs.length - priced.length),
  };
  return { row, nano };
}

export interface AggregateInput {
  workspaceId: string;
  period: ResolvedPeriod;
  runs: PerfRunRow[];
  agents: PerfAgentRef[];
}

/** One pure pass over the counted runs: rows, pooled totals, most active, breakdowns. */
export function aggregatePerformance(input: AggregateInput): AgentPerformance {
  const { workspaceId, period } = input;
  const counted = input.runs.filter((r) => isCountedRun(r, workspaceId, period));
  const agents = [...input.agents].sort((a, b) => a.name.localeCompare(b.name));
  const known = new Set(agents.map((a) => a.id));

  const byAgent = new Map<string, PerfRunRow[]>();
  const deleted: PerfRunRow[] = [];
  for (const r of counted) {
    if (r.agentId !== null && known.has(r.agentId)) {
      const list = byAgent.get(r.agentId) ?? [];
      list.push(r);
      byAgent.set(r.agentId, list);
    } else {
      deleted.push(r);
    }
  }

  const accs: RowAcc[] = agents.map((a) => buildRow(a, byAgent.get(a.id) ?? []));
  if (deleted.length > 0) accs.push(buildRow(null, deleted));
  const rows = accs.map((a) => a.row);

  const pricedAll = counted.filter((r) => r.costUsd !== null);
  const totalNano = sumOf(pricedAll.map((r) => toNano(r.costUsd as number)));
  const accepted = sumOf(counted.map((r) => r.accepted));
  const dismissed = sumOf(counted.map((r) => r.dismissed));
  const decided = accepted + dismissed;
  const unpriced = counted.length - pricedAll.length;

  const agentLines: NanoLine[] = accs
    .filter((a) => a.row.priced_runs > 0)
    .map((a) => ({
      key: a.row.agent_id,
      label: a.row.agent_name,
      runs: a.row.priced_runs,
      nano: a.nano,
    }));

  const lastOf = (r: AgentPerformanceRow) => (r.last_run_at ? Date.parse(r.last_run_at) : 0);
  const eligible = rows.filter((r) => r.agent_id !== null && r.runs > 0);
  eligible.sort(
    (a, b) =>
      b.runs - a.runs || lastOf(b) - lastOf(a) || (a.agent_name ?? '').localeCompare(b.agent_name ?? ''),
  );
  const top = eligible[0];

  return {
    period: toPerfPeriod(period),
    totals: {
      runs: counted.length,
      priced_runs: pricedAll.length,
      unpriced_runs: unpriced,
      total_cost_usd: pricedAll.length > 0 ? fromNano(totalNano) : null,
      accepted,
      dismissed,
      decided,
      accept_rate: decided > 0 ? accepted / decided : null,
    },
    most_active: top
      ? { agent_id: top.agent_id as string, agent_name: top.agent_name as string, runs: top.runs }
      : null,
    rows,
    by_agent: toBreakdown(agentLines, unpriced),
    by_model: toBreakdown(modelLines(counted), unpriced),
  };
}

function toPerfPeriod(p: ResolvedPeriod): AgentPerformance['period'] {
  return { preset: p.preset, from: p.from.toISOString(), to: p.to.toISOString() };
}

/** AC-1: Stats is the agent's dashboard row plus id, name and period. */
export function toAgentStats(perf: AgentPerformance, agent: PerfAgentRef): AgentStats {
  const row = perf.rows.find((r) => r.agent_id === agent.id);
  const base = row ?? buildRow(agent, []).row;
  return { ...base, agent_id: agent.id, agent_name: agent.name, period: perf.period };
}
