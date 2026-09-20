/** Constants for the skills module (CRUD + versioning + file/zip import). */

/** Version recorded for a freshly created skill (skills.version and skill_versions). */
export const INITIAL_SKILL_VERSION = 1;

/** Source stored for a skill created through `POST /skills` (vs. an import). */
export const MANUAL_SOURCE = 'manual' as const;

/** Source stored for a skill created through `POST /skills/import`. */
export const IMPORT_SOURCE = 'imported_file' as const;

/** Skill type assigned by the importer when the upload carries no override. */
export const DEFAULT_IMPORT_TYPE = 'custom' as const;

/** Fallback name when a markdown upload yields neither a heading nor a stem. */
export const FALLBACK_SKILL_NAME = 'imported-skill';

// ---- Import guards (spec §3) --------------------------------------------
// Enforced BEFORE anything is parsed, each with its own status + message. The
// upload limit is also wired into @fastify/multipart's `limits.fileSize`, so an
// oversized body is cut off at the socket instead of being buffered whole.

/** Max size of the uploaded file itself → 413. */
export const MAX_UPLOAD_BYTES = 1024 * 1024; // 1 MiB

/** Max number of entries in an uploaded .zip → 413. */
export const MAX_ZIP_ENTRIES = 200;

/** Max total UNCOMPRESSED size of an uploaded .zip (zip bomb) → 413. */
export const MAX_UNCOMPRESSED_BYTES = 4 * 1024 * 1024; // 4 MiB

/** `description` derived from a markdown upload is clipped to this many chars. */
export const MAX_DESCRIPTION_CHARS = 200;

// ---- Accepted formats ----------------------------------------------------

/** Extensions parsed as markdown. Anything else (.tar/.rar/.7z …) is a 415. */
export const MARKDOWN_EXTENSIONS = ['.md', '.markdown'] as const;

/** The only archive format we unpack. */
export const ZIP_EXTENSION = '.zip';

/** Preferred entry inside a .zip, matched case-insensitively on the basename. */
export const SKILL_ENTRY_BASENAME = 'skill.md';

/** Media types accepted when the upload has no usable extension. */
export const MARKDOWN_MIME_TYPES = ['text/markdown', 'text/x-markdown', 'text/plain'];
export const ZIP_MIME_TYPES = [
  'application/zip',
  'application/x-zip-compressed',
  'multipart/x-zip',
];

/** Human-readable list used in the 415 message. */
export const ACCEPTED_FORMATS = '.md, .markdown or .zip';
