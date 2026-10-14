/* DocPreview — read-only rendering of one project-context document. The text is
   untrusted repository content: it goes through the Markdown primitive only
   (react-markdown, no raw-HTML plugin), never through innerHTML. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Markdown, Skeleton } from "@devdigest/ui";
import { visiblePath } from "../DocPicker/helpers";
import { s } from "./styles";

export interface DocPreviewProps {
  status: "idle" | "loading" | "error" | "ready" | "tooLarge";
  path: string | null;
  content: string | null;
  onRetry: () => void;
}

export function DocPreview({ status, path, content, onRetry }: DocPreviewProps) {
  const t = useTranslations("context");

  let body: React.ReactNode;
  if (status === "idle") {
    body = <div style={s.hint}>{t("preview.idle")}</div>;
  } else if (status === "loading") {
    body = (
      <div style={{ ...s.body, ...s.center }} aria-label={t("preview.loading")}>
        <span style={s.hint}>{t("preview.loading")}</span>
        <Skeleton height={14} />
        <Skeleton height={14} width="80%" />
      </div>
    );
  } else if (status === "error") {
    body = (
      <div style={{ ...s.hint, ...s.center }}>
        <span>{t("preview.error")}</span>
        <div>
          <Button kind="secondary" size="sm" icon="RefreshCw" onClick={onRetry}>
            {t("preview.retry")}
          </Button>
        </div>
      </div>
    );
  } else if (status === "tooLarge") {
    body = <div style={s.hint}>{t("preview.tooLarge")}</div>;
  } else {
    body = (
      <div style={s.body}>
        <Markdown>{content}</Markdown>
      </div>
    );
  }

  return (
    <div style={s.wrap}>
      {path && (
        <div className="mono" style={s.path}>
          {visiblePath(path)}
        </div>
      )}
      {body}
    </div>
  );
}
