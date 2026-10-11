/* PrBriefBlock — the Overview PR Brief: generate/refresh, stale marker, summary,
   Risk areas, Review focus. Presentational: data and callbacks arrive as props.
   All model text is rendered as React text nodes only. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, SectionLabel, Skeleton } from "@devdigest/ui";
import type { PrBrief, Risk } from "@devdigest/shared";
import { SEVERITY_COLORS, SEVERITY_KEYS } from "./constants";
import { focusLabel, isStale } from "./helpers";
import { s } from "./styles";

interface PrBriefBlockProps {
  status: "loading" | "loadError" | "ready";
  brief: PrBrief | null;
  headSha: string;
  prFilePaths: ReadonlySet<string>;
  generating: boolean;
  generateError: "noFiles" | "failed" | null;
  onGenerate(): void;
  onRetryLoad(): void;
  onOpenFile(path: string, line: number | null): void;
}

export function PrBriefBlock(props: PrBriefBlockProps) {
  const { status, brief, headSha, prFilePaths, generating, generateError } = props;
  const t = useTranslations("brief");

  if (status === "loading") {
    return (
      <section style={s.root}>
        <SectionLabel icon="Zap">{t("title")}</SectionLabel>
        <div data-testid="brief-loading" style={s.note}>{t("loading")}</div>
      </section>
    );
  }
  if (status === "loadError") {
    return (
      <section style={s.root}>
        <SectionLabel icon="Zap">{t("title")}</SectionLabel>
        <div style={s.error}>
          <span>{t("error.load")}</span>
          <Button size="sm" onClick={props.onRetryLoad}>{t("error.retry")}</Button>
        </div>
      </section>
    );
  }

  return (
    <section style={s.root}>
      <SectionLabel icon="Zap">{t("title")}</SectionLabel>

      <div style={s.header}>
        <div style={s.actions}>
          <Button
            kind={brief ? "secondary" : "primary"}
            size="sm"
            disabled={generating}
            onClick={props.onGenerate}
          >
            {brief ? t("refresh") : t("generate")}
          </Button>
        </div>
      </div>

      {brief && isStale(brief.head_sha, headSha) && (
        <div data-testid="brief-stale" style={s.stale}>{t("stale")}</div>
      )}

      {generateError && (
        <div style={s.error}>
          <span>{generateError === "noFiles" ? t("error.noFiles") : t("error.generate")}</span>
          {generateError === "failed" && (
            <Button size="sm" disabled={generating} onClick={props.onGenerate}>
              {t("error.retry")}
            </Button>
          )}
        </div>
      )}

      {generating && (
        <div data-testid="brief-skeleton" aria-label={t("generating")} style={s.card}>
          <Skeleton width={200} height={14} />
          <Skeleton height={48} />
          <Skeleton height={48} />
        </div>
      )}

      {brief && (
        <div style={s.card}>
          <div style={s.subhead}>{t("block.summary")}</div>
          <div style={s.summary}>{brief.summary}</div>
          <div style={s.note}>{t("inputs.noIntent")}</div>
          <div style={s.note}>{t("inputs.noSpecs")}</div>

          <div style={s.subhead}>{t("block.riskAreas")}</div>
          {brief.risks.length === 0 ? (
            <div style={s.note}>{t("noRisks")}</div>
          ) : (
            <ul style={s.list}>
              {brief.risks.map((r, i) => (
                <RiskRow
                  key={`${r.title}:${i}`}
                  risk={r}
                  prFilePaths={prFilePaths}
                  onOpenFile={props.onOpenFile}
                />
              ))}
            </ul>
          )}

          <div style={s.subhead}>{t("block.reviewFocus")}</div>
          {brief.review_focus.length === 0 ? (
            <div style={s.note}>{t("noFocus")}</div>
          ) : (
            <ul style={s.list}>
              {brief.review_focus.map((f, i) => {
                const inDiff = prFilePaths.has(f.file);
                const label = focusLabel(f.file, f.line);
                return (
                  <li key={`${label}:${i}`} style={s.itemStatic}>
                    <div style={s.row}>
                      {inDiff ? (
                        <button
                          type="button"
                          style={s.link}
                          onClick={() => props.onOpenFile(f.file, f.line)}
                        >
                          {label}
                        </button>
                      ) : (
                        <>
                          <span style={s.path}>{label}</span>
                          <span style={s.note}>{t("notInDiff")}</span>
                        </>
                      )}
                    </div>
                    <div style={s.reason}>{f.reason}</div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function RiskRow({
  risk,
  prFilePaths,
  onOpenFile,
}: {
  risk: Risk;
  prFilePaths: ReadonlySet<string>;
  onOpenFile(path: string, line: number | null): void;
}) {
  const t = useTranslations("brief");
  const [open, setOpen] = React.useState(false);
  const sev = SEVERITY_COLORS[risk.severity];
  return (
    <li style={s.item} onClick={() => setOpen((o) => !o)}>
      <div style={s.row}>
        <Badge color={sev.color} bg={sev.bg}>{t(SEVERITY_KEYS[risk.severity])}</Badge>
        <button type="button" aria-expanded={open} style={s.riskTitle}>{risk.title}</button>
      </div>
      <div style={s.row}>
        {risk.file_refs.map((p, i) =>
          prFilePaths.has(p) ? (
            <button
              key={`${p}:${i}`}
              type="button"
              style={s.link}
              onClick={(e) => {
                e.stopPropagation();
                onOpenFile(p, null);
              }}
            >
              {p}
            </button>
          ) : (
            <span key={`${p}:${i}`} style={s.row}>
              <span style={s.path}>{p}</span>
              <span style={s.note}>{t("notInDiff")}</span>
            </span>
          ),
        )}
      </div>
      {open && <div style={s.explanation}>{risk.explanation}</div>}
    </li>
  );
}
