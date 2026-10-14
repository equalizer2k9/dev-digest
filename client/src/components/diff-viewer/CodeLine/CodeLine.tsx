/* CodeLine — one rendered diff line: gutter number, +/- sign, text, plus the
   hover "+" affordance, any anchored comment threads, and an inline composer. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import {
  commentTargetFor,
  worstSeverity,
  type CommentThread,
  type DiffCommentApi,
  type DiffFindingsApi,
  cs,
} from "../comments";
import { type Line } from "../helpers";
import { s, lineRowFor, lineSignFor, findingStripeFor, findingLabelFor } from "../styles";
import { CommentThreadView } from "../CommentThreadView";
import { InlineComposer } from "../InlineComposer";

export function CodeLine({
  ln,
  path,
  threads,
  commenting,
  findings,
  lineFindings = [],
}: {
  ln: Line;
  path: string;
  threads: CommentThread[];
  commenting?: DiffCommentApi;
  findings?: DiffFindingsApi;
  /** Findings anchored to this row. */
  lineFindings?: FindingRecord[];
}) {
  const t = useTranslations("shell");
  const [hover, setHover] = React.useState(false);
  const [composing, setComposing] = React.useState(false);

  if (ln.kind === "hunk") {
    return (
      <div className="mono" style={s.hunk}>
        {ln.text}
      </div>
    );
  }

  const sign = ln.kind === "add" ? "+" : ln.kind === "del" ? "−" : "";
  const target = commenting?.canComment ? commentTargetFor(ln) : null;
  const showAdd = hover && !!target && !composing;
  const worst = worstSeverity(lineFindings);

  return (
    <div
      style={cs.rowWrap}
      data-line-wrap=""
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div
        style={worst ? { ...lineRowFor(ln.kind), ...findingStripeFor(worst) } : lineRowFor(ln.kind)}
        data-line-key={ln.newNo != null && ln.kind !== "del" ? `RIGHT:${ln.newNo}` : undefined}
        data-finding-severity={worst ?? undefined}
      >
        <span className="mono tnum" style={{ ...s.lineNo, position: "relative" }}>
          {showAdd && target && (
            <button
              type="button"
              title="Add a comment on this line"
              aria-label="Add a comment on this line"
              onClick={() => setComposing(true)}
              style={cs.addBtn}
            >
              +
            </button>
          )}
          {ln.newNo ?? ln.oldNo ?? ""}
        </span>
        <span className="mono" style={lineSignFor(ln.kind)}>
          {sign}
        </span>
        <span className="mono" style={s.lineText}>
          {ln.text || " "}
        </span>
        {worst && (
          <span data-finding-label="" style={findingLabelFor(worst)}>
            {t(`diffViewer.severity.${worst}`)}
          </span>
        )}
      </div>

      {findings && (commenting?.showComments ?? true) && lineFindings.length > 0 && (
        <div style={cs.thread}>
          {lineFindings.map((f) => (
            <React.Fragment key={f.id}>{findings.renderFinding(f)}</React.Fragment>
          ))}
        </div>
      )}

      {commenting &&
        commenting.showComments &&
        threads.map((th) => (
          <CommentThreadView key={th.rootId} thread={th} commenting={commenting} path={path} />
        ))}

      {commenting && composing && target && (
        <InlineComposer
          commenting={commenting}
          path={path}
          line={target.line}
          side={target.side}
          onClose={() => setComposing(false)}
        />
      )}
    </div>
  );
}
