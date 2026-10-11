import type { BlastRadius, DownstreamImpact } from '@devdigest/shared';
import type { BlastCallerRow, BlastResult } from '../repo-intel/types.js';

export interface SummaryCounts {
  symbols: number;
  callers: number;
  endpoints: number;
  crons: number;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** "2 symbols · 14 callers · 3 endpoints · 1 cron" — singular for 1. */
export function buildSummary(c: SummaryCounts): string {
  return [
    plural(c.symbols, 'symbol'),
    plural(c.callers, 'caller'),
    plural(c.endpoints, 'endpoint'),
    plural(c.crons, 'cron'),
  ].join(' · ');
}

const byRankFileLine = (a: BlastCallerRow, b: BlastCallerRow) =>
  b.rank - a.rank || a.file.localeCompare(b.file) || a.line - b.line;

/**
 * Pure mapping of the facade's flat `BlastResult` to the `BlastRadius` contract:
 * callers grouped by `viaSymbol`, facts taken from each group's own caller files.
 * Applies no limit — capping is the facade's job.
 */
export function toBlastRadius(result: BlastResult): BlastRadius {
  // Files that declare each changed symbol name — a caller there is the symbol's
  // own file, not downstream impact.
  const declFiles = new Map<string, Set<string>>();
  for (const s of result.changedSymbols) {
    const files = declFiles.get(s.name);
    if (files) files.add(s.file);
    else declFiles.set(s.name, new Set([s.file]));
  }

  const groups = new Map<string, BlastCallerRow[]>();
  for (const c of result.callers) {
    if (declFiles.get(c.viaSymbol)?.has(c.file)) continue;
    const g = groups.get(c.viaSymbol);
    if (g) g.push(c);
    else groups.set(c.viaSymbol, [c]);
  }

  const entries = [...groups.entries()].map(([symbol, rows]) => {
    rows.sort(byRankFileLine);
    const endpoints = new Set<string>();
    const crons = new Set<string>();
    for (const file of new Set(rows.map((r) => r.file))) {
      const facts = result.factsByFile?.[file];
      if (!facts) continue;
      for (const e of facts.endpoints) endpoints.add(e);
      for (const c of facts.crons) crons.add(c);
    }
    const impact: DownstreamImpact = {
      symbol,
      callers: rows.map((r) => ({ name: r.symbol, file: r.file, line: r.line })),
      endpoints_affected: [...endpoints],
      crons_affected: [...crons],
    };
    return { impact, topRank: rows[0]!.rank };
  });
  entries.sort((a, b) => b.topRank - a.topRank || a.impact.symbol.localeCompare(b.impact.symbol));

  const downstream = entries.map((e) => e.impact);
  const allEndpoints = new Set(downstream.flatMap((d) => d.endpoints_affected));
  const allCrons = new Set(downstream.flatMap((d) => d.crons_affected));

  return {
    changed_symbols: result.changedSymbols.map((s) => ({ name: s.name, file: s.file, kind: s.kind })),
    downstream,
    summary: buildSummary({
      symbols: result.changedSymbols.length,
      callers: downstream.reduce((n, d) => n + d.callers.length, 0),
      endpoints: allEndpoints.size,
      crons: allCrons.size,
    }),
  };
}
