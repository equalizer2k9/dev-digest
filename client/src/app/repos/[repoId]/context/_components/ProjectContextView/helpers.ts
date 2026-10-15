import type { ProjectContextDocument } from "@devdigest/shared";

export type TreeNode =
  | { kind: "folder"; name: string; path: string; children: TreeNode[] }
  | { kind: "doc"; name: string; doc: ProjectContextDocument };

/** Nest the documents (already in path order) into folders, keeping that order. */
export function buildTree(documents: ProjectContextDocument[]): TreeNode[] {
  const root: TreeNode[] = [];
  for (const doc of documents) {
    const parts = doc.path.split("/");
    const file = parts.pop() ?? doc.path;
    let level = root;
    let prefix = "";
    for (const part of parts) {
      prefix = prefix ? `${prefix}/${part}` : part;
      let folder = level.find((n): n is Extract<TreeNode, { kind: "folder" }> => n.kind === "folder" && n.name === part);
      if (!folder) {
        folder = { kind: "folder", name: part, path: prefix, children: [] };
        level.push(folder);
      }
      level = folder.children;
    }
    level.push({ kind: "doc", name: file, doc });
  }
  return root;
}

/** Sum of the documents' tokens; a too-large or unreadable one (null) adds 0. */
export function totalTokens(documents: { tokens: number | null }[]): number {
  return documents.reduce((n, d) => n + (d.tokens ?? 0), 0);
}
