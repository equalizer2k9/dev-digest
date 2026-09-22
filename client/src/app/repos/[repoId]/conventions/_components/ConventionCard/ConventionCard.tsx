/* ConventionCard — one extracted house rule with the evidence it was read from.
   Accept / Reject / Edit all write through `useUpdateConvention`, optimistically:
   the card moves before the round-trip and the cached scan rolls back on a
   failure. Edit happens IN PLACE — no modal, no navigation. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  Chip,
  IconBtn,
  MonoLink,
  ProgressBar,
  SelectInput,
  Textarea,
} from "@devdigest/ui";
import type { ConventionCandidate, ConventionCategory } from "@devdigest/shared";
import { useUpdateConvention, type ConventionPatch } from "@/lib/hooks/conventions";
import { notify } from "@/lib/toast";
import {
  CONVENTION_CATEGORIES,
  MAX_RULE_CHARS,
  MIN_RULE_CHARS,
  RULE_EDIT_ROWS,
} from "./constants";
import { confidenceColor, confidencePct, evidenceHref, evidenceLabel } from "./helpers";
import { s } from "./styles";

export interface ConventionCardProps {
  candidate: ConventionCandidate;
  /** Owning repo — the mutation's cache key, not part of the PUT path. */
  repoId: string;
  /** `owner/repo`, for the evidence link. */
  repoFullName: string;
  /** Used for the evidence link only when the scan recorded no `head_sha`. */
  defaultBranch: string;
}

export function ConventionCard({
  candidate,
  repoId,
  repoFullName,
  defaultBranch,
}: ConventionCardProps) {
  const t = useTranslations("conventions");
  const update = useUpdateConvention(repoId);

  const [editing, setEditing] = React.useState(false);
  const [rule, setRule] = React.useState(candidate.rule);
  const [category, setCategory] = React.useState<ConventionCategory>(candidate.category);

  // `status` is the source of truth; `accepted` is only its mirror.
  const accepted = candidate.status === "accepted";
  const pct = confidencePct(candidate.confidence);
  const label = evidenceLabel(candidate);

  const write = (patch: ConventionPatch) =>
    update.mutate(
      { id: candidate.id, patch },
      {
        onError: () => {
          // The hook already restored the cached scan; drop the local edit too so
          // the fields match what is back on screen.
          setRule(candidate.rule);
          setCategory(candidate.category);
          notify.error(t("errors.update"));
        },
      },
    );

  const startEdit = () => {
    setRule(candidate.rule);
    setCategory(candidate.category);
    setEditing(true);
  };

  const cancelEdit = () => {
    setRule(candidate.rule);
    setCategory(candidate.category);
    setEditing(false);
  };

  // Exactly the server's own bound on an edited rule, so an edit the API would
  // reject never leaves the card — a 422 here would roll back and discard it.
  const trimmedRule = rule.trim();
  const canSave = trimmedRule.length >= MIN_RULE_CHARS && trimmedRule.length <= MAX_RULE_CHARS;

  const save = () => {
    if (!canSave) return;
    setEditing(false);
    write({ rule: trimmedRule, category });
  };

  const categoryOptions = CONVENTION_CATEGORIES.map((c) => ({
    value: c,
    label: t(`card.categories.${c}`),
  }));

  return (
    <div style={s.card(accepted)}>
      <div style={s.row}>
        <div style={s.main}>
          {editing ? (
            <div style={s.editFields}>
              {/* The control sits INSIDE its <label>, so the visible caption is
                  also its accessible name — no id plumbing through the kit. */}
              <label>
                <span style={s.editLabel}>{t("edit.rule")}</span>
                <Textarea
                  value={rule}
                  onChange={setRule}
                  rows={RULE_EDIT_ROWS}
                  maxLength={MAX_RULE_CHARS}
                />
              </label>
              <label>
                <span style={s.editLabel}>{t("edit.category")}</span>
                <SelectInput
                  value={category}
                  onChange={(v) => setCategory(v as ConventionCategory)}
                  options={categoryOptions}
                  mono={false}
                />
              </label>
            </div>
          ) : (
            <div style={s.ruleRow}>
              <div style={s.rule}>{candidate.rule}</div>
              <Chip>{t(`card.categories.${candidate.category}`)}</Chip>
            </div>
          )}

          {/* Evidence is read-only, in edit mode too: the snippet was re-read
              from the clone by the server and is not the user's to change. */}
          <div style={s.evidence}>
            <div style={s.evidenceHead}>
              <MonoLink href={evidenceHref(candidate, repoFullName, defaultBranch)}>
                {label}
              </MonoLink>
              <IconBtn
                icon="Copy"
                label={t("card.copyPath")}
                size={22}
                onClick={() => {
                  void navigator.clipboard?.writeText(candidate.evidence_path);
                  notify.info(t("card.copied"));
                }}
              />
            </div>
            <pre className="mono" style={s.snippet}>
              {candidate.evidence_snippet}
            </pre>
          </div>

          <div style={s.confidenceRow}>
            <span style={s.confidenceLabel}>{t("card.confidence")}</span>
            <div style={s.confidenceBar}>
              <ProgressBar value={pct} height={5} color={confidenceColor(candidate.confidence)} />
            </div>
            <span className="mono tnum" style={s.confidenceValue}>
              {pct}%
            </span>
          </div>
        </div>

        <div style={s.actions}>
          {editing ? (
            <>
              <Button kind="primary" size="sm" icon="Check" full disabled={!canSave} onClick={save}>
                {t("edit.save")}
              </Button>
              <Button kind="ghost" size="sm" icon="X" full onClick={cancelEdit}>
                {t("edit.cancel")}
              </Button>
            </>
          ) : (
            <>
              <Button
                kind={accepted ? "primary" : "secondary"}
                size="sm"
                icon={accepted ? "Check" : "Plus"}
                full
                onClick={() => write({ status: accepted ? "pending" : "accepted" })}
              >
                {accepted ? t("card.accepted") : t("card.accept")}
              </Button>
              <Button
                kind="ghost"
                size="sm"
                icon="X"
                full
                onClick={() => write({ status: "rejected" })}
              >
                {t("card.reject")}
              </Button>
              {/* `Edit` is lucide's Pencil — the icon map aliases it. */}
              <Button kind="ghost" size="sm" icon="Edit" full onClick={startEdit}>
                {t("card.edit")}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
