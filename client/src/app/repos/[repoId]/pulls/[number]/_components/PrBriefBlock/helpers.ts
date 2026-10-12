/** The stored brief describes another commit than the page shows. */
export const isStale = (briefSha: string, headSha: string) => briefSha !== headSha;

/**
 * A path for display: control and format characters (newline, zero-width, bidi
 * override) are written as a visible `\\u{hex}` escape, so a file name cannot
 * reorder or hide text in the block. Display only — navigation uses the real path.
 */
export const visiblePath = (path: string) =>
  path.replace(/[\p{Cc}\p{Cf}\u2028\u2029]/gu, (ch) => `\\u{${ch.codePointAt(0)!.toString(16)}}`);

export const focusLabel = (file: string, line: number) => `${visiblePath(file)}:${line}`;
