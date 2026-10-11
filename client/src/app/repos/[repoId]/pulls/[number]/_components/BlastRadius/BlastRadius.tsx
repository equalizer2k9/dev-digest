/* BlastRadius — the Overview block: stats row, an incomplete-index marker,
   and one card per changed symbol that has callers. Presentational: the
   response arrives as a prop; order and limits are the server's. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel } from "@devdigest/ui";
import type { BlastRadiusResponse } from "@devdigest/shared";
import { githubBlobUrl } from "@/lib/github-urls";
import { REASON_KEYS, FALLBACK_REASON } from "./constants";
import { blastStats, callerLabel } from "./helpers";
import { s } from "./styles";

interface BlastRadiusProps {
  blast: BlastRadiusResponse;
  repoFullName: string | null;
  headSha: string;
}

export function BlastRadius({ blast, repoFullName, headSha }: BlastRadiusProps) {
  const t = useTranslations("blast");
  const stats = blastStats(blast);
  const reasonKey = REASON_KEYS[blast.reason ?? FALLBACK_REASON];

  return (
    <section style={s.root}>
      <SectionLabel icon="Zap">{t("title")}</SectionLabel>

      <div style={s.stats}>
        <span style={s.stat}>{t("stat.symbols", { count: stats.symbols })}</span>
        <span style={s.stat}>{t("stat.callers", { count: stats.callers })}</span>
        <span style={s.stat}>{t("stat.endpoints", { count: stats.endpoints })}</span>
        <span style={s.stat}>{t("stat.crons", { count: stats.crons })}</span>
      </div>

      {blast.degraded && (
        <div data-testid="blast-degraded" role="status" style={s.degraded}>
          <span style={s.degradedLabel}>{t("degraded.label")}</span>
          <span>{t(reasonKey)}</span>
        </div>
      )}

      {stats.symbols === 0 && <div style={s.note}>{t("noSymbols")}</div>}
      {stats.symbols > 0 && blast.downstream.length === 0 && (
        <div style={s.note}>{t("noDownstream", { count: stats.symbols })}</div>
      )}

      {blast.downstream.map((d) => (
        <div key={d.symbol} data-testid="blast-card" style={s.card}>
          <div style={s.cardHeader}>
            <span style={s.symbol}>{d.symbol}</span>
            <span style={s.count}>{t("callerCount", { count: d.callers.length })}</span>
          </div>

          {d.callers.map((c, i) => {
            const label = callerLabel(c.file, c.line);
            return (
              <div key={`${c.file}:${c.line}:${c.name}:${i}`} style={s.row}>
                {repoFullName ? (
                  <a
                    href={githubBlobUrl(repoFullName, headSha, c.file, c.line)}
                    target="_blank"
                    rel="noreferrer"
                    style={s.link}
                  >
                    {label}
                  </a>
                ) : (
                  <span style={s.location}>{label}</span>
                )}
                <span style={s.callerName}>{c.name}</span>
              </div>
            );
          })}

          {d.endpoints_affected.length > 0 && (
            <div data-testid="blast-endpoints" style={s.chips}>
              {d.endpoints_affected.map((e) => (
                <span key={e} style={s.endpointChip}>{e}</span>
              ))}
            </div>
          )}
          {d.crons_affected.length > 0 && (
            <div data-testid="blast-crons" style={s.chips}>
              {d.crons_affected.map((c) => (
                <span key={c} style={s.cronChip}>{c}</span>
              ))}
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
