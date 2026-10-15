/* AttachmentsEditor — attach project-context documents to an agent or a skill.

   No save button: every tick, untick or move sends the whole ordered list at
   once (a PUT that replaces it). The list shown is local state adopted from the
   server list, so a click answers instantly; a failed write puts the previous
   list back and raises a toast. Same idea as the agent editor's Skills tab. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import {
  useContextAttachments,
  useContextDocument,
  useContextDocuments,
  useSetContextAttachments,
} from "@/lib/hooks/project-context";
import { useActiveRepo } from "@/lib/repo-context";
import { notify } from "@/lib/toast";
import { DocPicker, moveItem } from "../DocPicker";
import { DocPreview, previewPathFor, previewStatus } from "../DocPreview";
import { s } from "./styles";

export interface AttachmentsEditorProps {
  owner: "agent" | "skill";
  ownerId: string;
}

export function AttachmentsEditor({ owner, ownerId }: AttachmentsEditorProps) {
  const t = useTranslations("context");
  const { repoId } = useActiveRepo();
  const list = useContextDocuments(repoId);
  const attachments = useContextAttachments(owner, ownerId, repoId);
  const setAttachments = useSetContextAttachments(owner, ownerId, repoId);

  const [selected, setSelected] = React.useState<string | null>(null);
  const [order, setOrder] = React.useState<string[]>([]);

  const documents = list.data?.documents ?? [];
  // A too-large document is known from the listing: no request is made for it.
  const doc = useContextDocument(repoId, previewPathFor(selected, documents));

  // Adopt the server list whenever it actually changes (including after our own
  // write settles); local edits in between are the optimistic view.
  const serverAttached = attachments.data?.attached;
  const serverKey = (serverAttached ?? []).join("\n");
  React.useEffect(() => {
    setOrder(serverAttached ?? []);
  }, [serverKey, ownerId, repoId]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Optimistically apply a list, then persist it; roll back on failure. */
  const write = (next: string[]) => {
    const previous = order;
    setOrder(next);
    setAttachments.mutate(next, {
      onError: () => {
        setOrder(previous);
        notify.error(t("errors.save"));
      },
    });
  };

  const toggle = (path: string, on: boolean) =>
    // Attaching appends at the end of the prompt order; detaching drops the path.
    write(on ? [...order.filter((p) => p !== path), path] : order.filter((p) => p !== path));

  const move = (path: string, delta: -1 | 1) => {
    const from = order.indexOf(path);
    const next = moveItem(order, from, from + delta);
    if (next !== order) write(next);
  };

  if (!repoId || (list.data && !list.data.has_clone)) {
    return <EmptyState icon="Folder" title={t("noClone.title")} body={t("noClone.body")} />;
  }
  if (list.isLoading || attachments.isLoading) {
    return (
      <div style={s.skeleton}>
        <Skeleton height={36} />
        <Skeleton height={36} />
        <Skeleton height={36} />
      </div>
    );
  }
  if (list.isError || !list.data) {
    return <ErrorState title={t("loadErrorTitle")} body={t("loadError")} onRetry={() => list.refetch()} />;
  }
  if (attachments.isError || !attachments.data) {
    // Writing without knowing the stored list would replace it with a guess.
    return <ErrorState title={t("loadErrorTitle")} body={t("loadError")} onRetry={() => attachments.refetch()} />;
  }
  if (documents.length === 0 && order.length === 0) {
    return <EmptyState icon="Folder" title={t("empty.title")} body={t("empty.body")} />;
  }

  // Agent: effective documents of M listed; skill: its own attachments.
  const counter =
    owner === "agent"
      ? t("counter.ofListed", { attached: attachments.data.effective.length, listed: documents.length })
      : t("counter.attached", { count: order.length });

  const status = previewStatus(selected, documents, doc);

  return (
    <div style={s.split}>
      <DocPicker
        documents={documents}
        attached={order}
        effective={attachments.data.effective}
        truncated={list.data.truncated}
        counter={counter}
        selectedPath={selected}
        onToggle={toggle}
        onMove={move}
        onSelect={setSelected}
      />
      <DocPreview
        status={status}
        path={selected}
        content={doc.data?.content ?? null}
        onRetry={() => doc.refetch()}
      />
    </div>
  );
}
