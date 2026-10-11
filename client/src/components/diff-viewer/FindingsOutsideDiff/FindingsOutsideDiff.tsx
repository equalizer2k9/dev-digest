/* FindingsOutsideDiff — footer block for review findings whose line is not in
   this file's patch (or the file has no patch). Never dropped, never moved onto
   a neighbouring line. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import { cs } from "../comments";

export function FindingsOutsideDiff({
  findings,
  renderFinding,
}: {
  findings: FindingRecord[];
  renderFinding: (f: FindingRecord) => React.ReactNode;
}) {
  const t = useTranslations("shell");
  if (findings.length === 0) return null;
  return (
    <div style={cs.outdatedWrap} data-findings-outside="">
      <span style={cs.outdatedTitle}>{t("diffViewer.findingsOutsideTitle")}</span>
      {findings.map((f) => (
        <React.Fragment key={f.id}>{renderFinding(f)}</React.Fragment>
      ))}
    </div>
  );
}
