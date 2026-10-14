import { visiblePath } from "@/lib/visible-path";

/** The stored brief describes another commit than the page shows. */
export const isStale = (briefSha: string, headSha: string) => briefSha !== headSha;

/** Re-exported: the shared display escape (src/lib/visible-path.ts). */
export { visiblePath };

export const focusLabel = (file: string, line: number) => `${visiblePath(file)}:${line}`;
