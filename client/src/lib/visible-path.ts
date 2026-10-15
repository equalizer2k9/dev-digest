/**
 * A path for display: control and format characters (newline, zero-width, bidi
 * override) are written as a visible `\\u{hex}` escape, so a file name cannot
 * reorder or hide text. Display only: selection and writes use the real path.
 */
export const visiblePath = (path: string) =>
  path.replace(/[\p{Cc}\p{Cf}\u2028\u2029]/gu, (ch) => `\\u{${ch.codePointAt(0)!.toString(16)}}`);
