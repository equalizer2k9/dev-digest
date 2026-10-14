/**
 * Thrown by the file-reading adapters when a file is larger than the caller's
 * `maxBytes`, BEFORE its content is loaded. Detect with `isFileTooLarge`.
 */
export class FileTooLargeError extends Error {
  readonly code = 'FILE_TOO_LARGE';
  constructor(path: string, size: number, maxBytes: number) {
    super(`file too large: ${path} (${size} > ${maxBytes} bytes)`);
    this.name = 'FileTooLargeError';
  }
}

export const isFileTooLarge = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'FILE_TOO_LARGE';
