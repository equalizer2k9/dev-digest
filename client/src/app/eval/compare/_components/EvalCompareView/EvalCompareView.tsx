/* EvalCompareView — two completed runs of one agent side by side: metric deltas, a header
   per run, the case changes, the prompt diff and the skill difference. The server computes
   everything; this view only renders it. Every string from the payload is a text node. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, ErrorState, Skeleton } from "@devdigest/ui";
import type { EvalCaseRef, EvalRunRecord, EvalRunSkill } from "@devdigest/shared";
import { AppShell } from "@/components/app-shell";
import { formatCostDelta, formatDeltaPp } from "@/components/eval/EvalMetrics";
import { useEvalCompare } from "@/lib/hooks/evals";
import { diffPrefix, skillLabel } from "./helpers";
import { s } from "./styles";

export function EvalCompareView({ a, b }: { a: string | null; b: string | null }) {
  const t = useTranslations("eval");
  const { data, isLoading, isError, refetch } = useEvalCompare(a, b);
  const missing = !a || !b;

  const crumb = [
    { label: t("page.crumbSkillsLab") },
    { label: t("page.crumbEvalDashboard"), href: "/eval" },
    { label: data?.agent_name ?? t("page.crumbAgents") },
  ];

  const location = (c: EvalCaseRef) =>
    c.start_line === c.end_line ? `${c.file}:${c.start_line}` : `${c.file}:${c.start_line}-${c.end_line}`;
  const typeLabel = (c: EvalCaseRef) => t(c.type === "must_find" ? "type.mustFind" : "type.mustNotFlag");

  const body = () => {
    if (missing) return <ErrorState title={t("compare.missingIds")} />;
    if (isLoading) {
      return (
        <div>
          <div style={s.note}>{t("dashboard.loading")}</div>
          <Skeleton height={80} />
        </div>
      );
    }
    if (isError || !data) return <ErrorState title={t("compare.loadError")} onRetry={() => refetch()} />;

    const deltas = [
      { key: "recall", label: t("dashboard.metrics.recall"), text: formatDeltaPp(data.delta.recall) },
      { key: "precision", label: t("dashboard.metrics.precision"), text: formatDeltaPp(data.delta.precision) },
      { key: "citation", label: t("dashboard.metrics.citationAccuracy"), text: formatDeltaPp(data.delta.citation_accuracy) },
      { key: "cost", label: t("compare.cost"), text: formatCostDelta(data.delta.cost_usd) },
    ];

    const runHead = (title: string, r: EvalRunRecord) => (
      <section aria-label={title} style={s.runHead}>
        <span style={s.runTitle}>{title}</span>
        <span className="tnum">{new Date(r.started_at).toLocaleString()}</span>
        <div style={s.chips}>
          <Badge>{`v${r.agent_version}`}</Badge>
          <Badge mono>{r.model}</Badge>
          {r.has_errors && (
            <span role="img" aria-label={t("hasErrors")} title={t("hasErrors")} style={s.errorMark}>
              !
            </span>
          )}
        </div>
        <div style={s.chips}>
          {r.skills.length === 0 ? (
            <span style={s.muted}>{t("compare.noSkills")}</span>
          ) : (
            r.skills.map((k) => <Badge key={`${k.name}-${k.version}`}>{skillLabel(k)}</Badge>)
          )}
        </div>
      </section>
    );

    const refList = (title: string, items: EvalCaseRef[]) =>
      items.length > 0 && (
        <section aria-label={title} style={s.section}>
          <h2 style={s.h2}>{title}</h2>
          {items.map((c) => (
            <div key={c.case_id} style={s.row}>
              <span style={s.rowName}>{c.name}</span>
              <Badge>{typeLabel(c)}</Badge>
              <span className="mono" style={s.location}>
                {location(c)}
              </span>
            </div>
          ))}
        </section>
      );

    const skillList = (title: string, items: EvalRunSkill[]) =>
      items.length > 0 && (
        <div>
          <div style={s.runTitle}>{title}</div>
          <div style={s.chips}>
            {items.map((k) => (
              <Badge key={`${k.name}-${k.version}`}>{skillLabel(k)}</Badge>
            ))}
          </div>
        </div>
      );

    const noCaseChange = data.changed.length + data.added.length + data.removed.length === 0;
    const noSkillChange =
      data.skills.only_earlier.length + data.skills.only_later.length === 0 && !data.skills.reordered;

    return (
      <>
        <div style={s.deltas}>
          {deltas.map((d) => (
            <div key={d.key} style={s.card}>
              <span style={s.cardLabel}>{d.label}</span>
              <span className="tnum" style={s.cardValue}>
                {d.text ?? t("na")}
              </span>
            </div>
          ))}
        </div>

        <div style={s.runs}>
          {runHead(t("compare.earlier"), data.earlier)}
          {runHead(t("compare.later"), data.later)}
        </div>

        {noCaseChange && <div style={{ ...s.note, ...s.section }}>{t("compare.noChanges")}</div>}
        {data.changed.length > 0 && (
        <section aria-label={t("compare.changedCases")} style={s.section}>
          <h2 style={s.h2}>{t("compare.changedCases")}</h2>
          {data.changed.map((c) => (
            <div key={c.case_id} style={s.row}>
              <span style={s.rowName}>{c.name}</span>
              <Badge>{typeLabel(c)}</Badge>
              <span className="mono" style={s.location}>
                {location(c)}
              </span>
              <span>{t("compare.statusChange", { earlier: t(`status.${c.earlier}`), later: t(`status.${c.later}`) })}</span>
            </div>
          ))}
        </section>
        )}
        {refList(t("compare.addedCases"), data.added)}
        {refList(t("compare.removedCases"), data.removed)}

        <section style={s.section}>
          <h2 style={s.h2}>{t("compare.promptTitle")}</h2>
          {data.prompt.status === "unchanged" && <div style={s.note}>{t("compare.promptUnchanged")}</div>}
          {data.prompt.status === "unavailable" && (
            <div style={s.note}>
              {t("compare.promptUnavailable", {
                versions: data.prompt.unavailable_versions.length,
                list: data.prompt.unavailable_versions.join(", "),
              })}
            </div>
          )}
          {data.prompt.status === "changed" && (
            <pre className="mono" style={s.pre}>
              {data.prompt.lines.map((l, i) => (
                <React.Fragment key={i}>
                  <span style={s.line(l.op)}>
                    {`${diffPrefix(l.op)}${l.text}${i < data.prompt.lines.length - 1 ? "\n" : ""}`}
                  </span>
                </React.Fragment>
              ))}
            </pre>
          )}
        </section>

        <section aria-label={t("compare.skillsTitle")} style={s.section}>
          <h2 style={s.h2}>{t("compare.skillsTitle")}</h2>
          {noSkillChange && <div style={s.note}>{t("compare.noSkillChanges")}</div>}
          {skillList(t("compare.onlyEarlier"), data.skills.only_earlier)}
          {skillList(t("compare.onlyLater"), data.skills.only_later)}
          {data.skills.reordered && <div style={s.note}>{t("compare.reordered")}</div>}
        </section>
      </>
    );
  };

  return (
    <AppShell crumb={crumb}>
      <div style={s.wrap}>
        <h1 style={s.title}>{t("compare.title")}</h1>
        {body()}
      </div>
    </AppShell>
  );
}
