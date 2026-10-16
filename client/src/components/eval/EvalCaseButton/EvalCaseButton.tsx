/* EvalCaseButton — "Turn into eval case" beside Accept / Dismiss on a finding card.
   Enabled only once the finding is decided (accepted or dismissed). */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { EvalCaseCreated, FindingRecord } from "@devdigest/shared";
import { useCreateEvalCase } from "../../../lib/hooks/evals";
import { notify } from "../../../lib/toast";
import { ApiError } from "../../../lib/api";
import { conflictName, errorKey } from "./helpers";

const HINT_STYLE: React.CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
};

export function EvalCaseButton({ finding }: { finding: FindingRecord }) {
  const t = useTranslations("eval");
  const create = useCreateEvalCase();
  const decided = !!finding.accepted_at || !!finding.dismissed_at;
  const hintId = `eval-case-hint-${finding.id}`;
  const hint = t("turnInto.errors.eval_case_undecided");

  const onSuccess = (res: EvalCaseCreated) =>
    notify.success(
      <span>
        {t(res.created ? "turnInto.success" : "turnInto.exists", { agent: res.agent_name })}{" "}
        <Link href={`/agents/${res.agent_id}?tab=evals`} style={{ textDecoration: "underline" }}>
          {t("turnInto.view")}
        </Link>
      </span>,
    );

  const onError = (err: unknown) => {
    const code = err instanceof ApiError ? err.code : undefined;
    notify.error(t(`turnInto.errors.${errorKey(code)}`, { name: conflictName(err) ?? "" }));
  };

  return (
    <>
      <Button
        kind="ghost"
        size="sm"
        icon="FlaskConical"
        disabled={!decided || create.isPending}
        title={decided ? undefined : hint}
        aria-describedby={decided ? undefined : hintId}
        onClick={() => create.mutate(finding.id, { onSuccess, onError })}
      >
        {t("turnInto.label")}
      </Button>
      {!decided && (
        <span id={hintId} style={HINT_STYLE}>
          {hint}
        </span>
      )}
    </>
  );
}
