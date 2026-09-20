/* ConfirmDialog — the real confirmation modal that replaces `window.confirm`
   for destructive actions (delete a skill, delete an agent, restore a version).

   Deliberately presentational and string-free: every label is a prop, so the
   caller owns the i18n namespace and this component stays mountable in the
   showcase gallery with no provider at all. Three ways out — Confirm, Cancel,
   and the Modal's own ×. */
"use client";

import React from "react";
import { Button, Modal } from "@devdigest/ui";
import { CONFIRM_MODAL_WIDTH } from "./constants";
import { s } from "./styles";

export interface ConfirmDialogProps {
  /** Dialog heading, e.g. "Delete skill". */
  title: string;
  /** Optional line under the heading. */
  subtitle?: string;
  /** Body — usually a sentence naming the subject of the action. */
  body: React.ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  /** Runs on confirm. The caller closes the dialog. */
  onConfirm: () => void;
  /** Runs on Cancel and on the Modal's ×. */
  onClose: () => void;
  /** Disables Confirm while the mutation is in flight. */
  busy?: boolean;
  /** `danger` (default) paints Confirm red; `primary` for non-destructive ones. */
  tone?: "danger" | "primary";
  width?: number;
}

export function ConfirmDialog({
  title,
  subtitle,
  body,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onClose,
  busy = false,
  tone = "danger",
  width = CONFIRM_MODAL_WIDTH,
}: ConfirmDialogProps) {
  return (
    <Modal
      width={width}
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose}>
            {cancelLabel}
          </Button>
          <Button
            kind={tone === "danger" ? "danger" : "primary"}
            icon={tone === "danger" ? "Trash" : "Check"}
            onClick={onConfirm}
            disabled={busy}
          >
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <div style={s.body}>{body}</div>
    </Modal>
  );
}
