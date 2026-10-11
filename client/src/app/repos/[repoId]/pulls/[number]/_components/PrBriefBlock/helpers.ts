/** The stored brief describes another commit than the page shows. */
export const isStale = (briefSha: string, headSha: string) => briefSha !== headSha;

export const focusLabel = (file: string, line: number) => `${file}:${line}`;
