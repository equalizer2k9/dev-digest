/* ProjectContextView — /repos/:repoId/context. A read-only view of the Markdown
   documents of the repository's clone (specs/, docs/, insights/): a folder tree
   with each document's tag, token count and how many agents use it, and the
   rendered document beside it. Attaching happens in the agent and skill editors. */
"use client";

import React from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge, EmptyState, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import type { ProjectContextDocument } from "@devdigest/shared";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { DocPreview } from "@/components/project-context/DocPreview";
import { visiblePath } from "@/components/project-context/DocPicker";
import { useContextDocument, useContextDocuments } from "@/lib/hooks/project-context";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { SKELETON_ROWS } from "./constants";
import { buildTree, totalTokens, type TreeNode } from "./helpers";
import { s } from "./styles";

export function ProjectContextView() {
  const t = useTranslations("context");
  const params = useParams<{ repoId: string }>();
  const repoId = params.repoId;
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);

  const { data, isLoading, isError, refetch } = useContextDocuments(repoId);
  const [selected, setSelected] = React.useState<string | null>(null);

  const documents = React.useMemo<ProjectContextDocument[]>(() => data?.documents ?? [], [data]);
  const tree = React.useMemo(() => buildTree(documents), [documents]);
  const selectedDoc = documents.find((d) => d.path === selected);
  // A too-large document is known from the listing: no request is made for it.
  const previewPath = selected !== null && !selectedDoc?.too_large ? selected : null;
  const doc = useContextDocument(repoId, previewPath);

  const crumb = [{ label: t("crumb") }];

  if (repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  const status: "idle" | "loading" | "error" | "ready" | "tooLarge" =
    selected === null
      ? "idle"
      : selectedDoc?.too_large
        ? "tooLarge"
        : doc.isLoading
          ? "loading"
          : doc.isError
            ? (doc.error as { status?: number } | null)?.status === 413
              ? "tooLarge"
              : "error"
            : doc.data
              ? "ready"
              : "loading";

  const renderNodes = (nodes: TreeNode[], depth: number): React.ReactNode =>
    nodes.map((node) =>
      node.kind === "folder" ? (
        <li key={`f:${node.path}`}>
          <div style={s.folder(depth)}>
            <Icon.Folder size={14} />
            <span>{visiblePath(node.name)}</span>
          </div>
          <ul style={s.tree}>{renderNodes(node.children, depth + 1)}</ul>
        </li>
      ) : (
        <li key={`d:${node.doc.path}`}>
          <button
            type="button"
            style={s.docRow(depth, node.doc.path === selected)}
            onClick={() => setSelected(node.doc.path)}
          >
            <Icon.FileText size={14} />
            <span className="mono" style={s.docName}>
              {visiblePath(node.name)}
            </span>
            <Badge>{t(`tag.${node.doc.tag}`)}</Badge>
            {node.doc.too_large && <span style={s.mark}>{t("picker.tooLarge")}</span>}
            <span style={s.meta}>{t("usedBy", { count: node.doc.used_by })}</span>
          </button>
        </li>
      ),
    );

  let content: React.ReactNode;
  if (isLoading) {
    content = (
      <div style={s.skeleton}>
        {Array.from({ length: SKELETON_ROWS }, (_, i) => (
          <Skeleton key={i} height={28} />
        ))}
      </div>
    );
  } else if (isError || !data) {
    content = <ErrorState body={t("loadError")} onRetry={() => refetch()} />;
  } else if (!data.has_clone) {
    content = <EmptyState icon="Folder" title={t("noClone.title")} body={t("noClone.body")} />;
  } else if (documents.length === 0) {
    content = <EmptyState icon="Folder" title={t("empty.title")} body={t("empty.body")} />;
  } else {
    content = (
      <>
        {data.truncated && <div style={s.notice}>{t("truncated")}</div>}
        <div style={s.split}>
          <div>
            <ul style={s.tree}>{renderNodes(tree, 0)}</ul>
            <div style={s.footer} className="tnum">
              {t("footer.files", { files: documents.length, tokens: totalTokens(documents) })}
            </div>
          </div>
          <DocPreview
            status={status}
            path={selected}
            content={doc.data?.content ?? null}
            onRetry={() => doc.refetch()}
          />
        </div>
      </>
    );
  }

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        <h1 style={s.h1}>{t("title")}</h1>
        <div className="mono" style={s.repoName}>
          {activeRepo?.name ?? repoId}
        </div>
        {content}
      </div>
    </AppShell>
  );
}
