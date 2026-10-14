/* VersionDiffModal — one older snapshot against the current body.

   The API serves bodies, not patches, so the diff is computed here (LCS over
   lines, `../../helpers`). Added lines — present only in the current body —
   are green; removed lines, present only in the old version, are red; the
   rest is muted context. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Modal } from "@devdigest/ui";
import { useSkillVersion } from "../../../../../../../lib/hooks/skills";
import { diffLines, isIdentical } from "../../helpers";
import { s } from "../../styles";

export function VersionDiffModal({
  skillId,
  version,
  currentVersion,
  currentBody,
  onClose,
}: {
  skillId: string;
  version: number;
  currentVersion: number;
  currentBody: string;
  onClose: () => void;
}) {
  const t = useTranslations("skills");
  const { data, isLoading } = useSkillVersion(skillId, version);

  const lines = React.useMemo(
    () => (data ? diffLines(data.body, currentBody) : []),
    [data, currentBody],
  );

  return (
    <Modal
      width={900}
      title={t("versions.diffTitle", { version, current: currentVersion })}
      subtitle={t("versions.diffLegend", { version })}
      onClose={onClose}
      footer={
        <div style={s.diffFooter}>
          <Button kind="secondary" onClick={onClose}>
            {t("versions.close")}
          </Button>
        </div>
      }
    >
      <div style={s.diffBody}>
        {isLoading && <div style={s.diffNote}>{t("versions.diffLoading")}</div>}
        {!isLoading && data && isIdentical(lines) && (
          <div style={s.diffNote}>{t("versions.diffIdentical")}</div>
        )}
        {!isLoading && data && !isIdentical(lines) && (
          <pre className="mono" style={s.diffPre} data-testid="version-diff">
            {lines.map((l, i) => (
              <span key={i} style={s.diffLine(l.op)} data-diff-op={l.op}>
                {l.op === "add" ? "+" : l.op === "remove" ? "-" : " "} {l.text}
              </span>
            ))}
          </pre>
        )}
      </div>
    </Modal>
  );
}
