"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, ErrorState, SectionLabel, Skeleton } from "@devdigest/ui";
import type { PrIntentDetail } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { s } from "./styles";
import { CONFIDENCE_COLOR, ERROR_KEY_BY_CODE, REASON_KEY_BY_REASON } from "./constants";

interface IntentCardProps {
  intent: PrIntentDetail | null | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  onRecalculate: () => void;
  isRecalculating: boolean;
  recalcError: ApiError | null;
}

function ScopeList({ label, items, emptyText }: { label: string; items: string[]; emptyText: string }) {
  return (
    <div>
      <div style={s.label}>{label}</div>
      {items.length === 0 ? (
        <div style={s.muted}>{emptyText}</div>
      ) : (
        <ul style={s.list}>
          {items.map((item, i) => (
            <li key={`${i}-${item}`}>{item}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function IntentCard({
  intent,
  isLoading,
  isError,
  onRetry,
  onRecalculate,
  isRecalculating,
  recalcError,
}: IntentCardProps) {
  const t = useTranslations("intent");

  if (isLoading) {
    return (
      <section>
        <SectionLabel icon="Target">{t("title")}</SectionLabel>
        <div style={s.card} aria-busy="true">
          <Skeleton height={16} width="80%" />
          <Skeleton height={16} width="60%" />
          <Skeleton height={16} width="70%" />
        </div>
      </section>
    );
  }

  if (isError) {
    return (
      <section>
        <SectionLabel icon="Target">{t("title")}</SectionLabel>
        <ErrorState title={t("title")} body={t("error.load")} onRetry={onRetry} />
      </section>
    );
  }

  const errorKey = recalcError ? (ERROR_KEY_BY_CODE[recalcError.code ?? ""] ?? "generic") : null;
  const reasonText = (reason: string) =>
    Object.hasOwn(REASON_KEY_BY_REASON, reason) ? t(`sources.reason.${REASON_KEY_BY_REASON[reason]}` as never) : reason;

  return (
    <section>
      <SectionLabel icon="Target">{t("title")}</SectionLabel>
      <div style={s.card} aria-busy={isRecalculating}>
        {intent ? (
          <>
            <div style={s.header}>
              <Badge color={CONFIDENCE_COLOR[intent.confidence]}>{t(`confidence.${intent.confidence}`)}</Badge>
              {intent.stale && <Badge icon="AlertTriangle">{t("stale")}</Badge>}
              <span style={s.spacer} />
              <Button kind="secondary" size="sm" icon="RefreshCw" loading={isRecalculating} disabled={isRecalculating} onClick={onRecalculate}>
                {t("actions.recalculate")}
              </Button>
            </div>
            <div>
              <div style={s.label}>{t("summary")}</div>
              <p style={s.summary}>{intent.intent}</p>
            </div>
            <div style={s.columns}>
              <ScopeList label={t("inScope")} items={intent.in_scope} emptyText={t("emptyList")} />
              <ScopeList label={t("outOfScope")} items={intent.out_of_scope} emptyText={t("emptyList")} />
            </div>
            {intent.sources.length > 0 && (
              <div>
                <div style={s.label}>{t("sources.title")}</div>
                <ul style={s.sources}>
                  {intent.sources.map((src, i) => (
                    <li key={`${i}-${src.kind}-${src.ref}`} style={s.sourceRow}>
                      <span>{t(`sources.kind.${src.kind}`)}</span>
                      <span style={s.sourceRef}>{src.ref}</span>
                      <Badge>{t(`sources.status.${src.status}`)}</Badge>
                      {src.reason && <span style={s.muted}>{reasonText(src.reason)}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        ) : (
          <>
            <div>
              <div style={s.summary}>{t("empty.title")}</div>
              <div style={s.muted}>{t("empty.body")}</div>
            </div>
            <div>
              <Button kind="primary" size="sm" icon="Sparkles" loading={isRecalculating} disabled={isRecalculating} onClick={onRecalculate}>
                {t("actions.generate")}
              </Button>
            </div>
          </>
        )}
        {isRecalculating && <div style={s.muted}>{t("generating")}</div>}
        {errorKey && (
          <div role="alert" style={s.inlineError}>
            {t(`error.${errorKey}`)}
          </div>
        )}
      </div>
    </section>
  );
}
