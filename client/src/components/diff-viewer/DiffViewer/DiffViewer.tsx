/* DiffViewer — basic GitHub-style unified diff viewer. Renders real PrFile.patch
   (unified-diff text from the F1 API) as a list of collapsible FileCards.
   Optional inline comments (Files changed tab): hover a line → "+" → comment,
   posted live to GitHub; existing GitHub review comments render inline. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { PrFile } from "@/lib/types";
import { type DiffTarget } from "../helpers";
import { type DiffCommentApi, type DiffFindingsApi } from "../comments";
import { s } from "../styles";
import { FileCard } from "../FileCard";

export function DiffViewer({
  files,
  commenting,
  findings,
  findingPaths,
  target,
}: {
  files: PrFile[];
  commenting?: DiffCommentApi;
  findings?: DiffFindingsApi;
  /** Paths that get the "has findings" dot. */
  findingPaths?: ReadonlySet<string>;
  /** File (and line) to open and scroll to. */
  target?: DiffTarget | null;
}) {
  const t = useTranslations("shell");
  if (!files || files.length === 0) {
    return <div style={s.empty}>{t("diffViewer.noChangedFiles")}</div>;
  }
  return (
    <div style={s.list}>
      {files.map((f, i) => (
        <FileCard
          key={i}
          file={f}
          commenting={commenting}
          findings={findings}
          hasFindings={findingPaths?.has(f.path)}
          target={target && target.path === f.path ? { line: target.line } : undefined}
        />
      ))}
    </div>
  );
}
