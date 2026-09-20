import { unzipSync, type UnzipFileInfo } from 'fflate';
import type { Skill, SkillImportPreview, SkillType, SkillVersion } from '@devdigest/shared';
import { AppError } from '../../platform/errors.js';
import type { SkillRow, SkillVersionRow } from './repository.js';
import {
  ACCEPTED_FORMATS,
  DEFAULT_IMPORT_TYPE,
  FALLBACK_SKILL_NAME,
  IMPORT_SOURCE,
  MARKDOWN_EXTENSIONS,
  MARKDOWN_MIME_TYPES,
  MAX_DESCRIPTION_CHARS,
  MAX_UNCOMPRESSED_BYTES,
  MAX_UPLOAD_BYTES,
  MAX_ZIP_ENTRIES,
  SKILL_ENTRY_BASENAME,
  ZIP_EXTENSION,
  ZIP_MIME_TYPES,
} from './constants.js';

/**
 * Pure helpers for the skills module: DB row ⇄ DTO mapping and the whole
 * upload parser (spec §3). No I/O, no DB, no filesystem — an uploaded archive
 * is DATA: it is unpacked in memory, only the one chosen entry is decoded, and
 * nothing is ever written to disk or executed.
 */

// ---- DTO mapping ---------------------------------------------------------

/** Map a persisted `skills` row to the public `Skill` DTO. */
export function toSkillDto(row: SkillRow): Skill {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type,
    source: row.source,
    body: row.body,
    enabled: row.enabled,
    version: row.version,
    evidence_files: row.evidenceFiles ?? null,
  };
}

/** Map a persisted `skill_versions` row to the public `SkillVersion` DTO. */
export function toSkillVersionDto(row: SkillVersionRow): SkillVersion {
  return {
    skill_id: row.skillId,
    version: row.version,
    body: row.body,
    created_at: row.createdAt.toISOString(),
  };
}

// ---- Upload errors -------------------------------------------------------
// Each guard gets its own status AND its own message so the client can tell an
// oversized upload from a zip bomb from an ambiguous archive.

/** 413 — a size/count guard tripped. */
export function tooLargeError(message: string, details?: unknown): AppError {
  return new AppError('payload_too_large', message, 413, details);
}

/** 400 — the upload is the right format but we cannot use it. */
export function badUploadError(message: string, details?: unknown): AppError {
  return new AppError('invalid_upload', message, 400, details);
}

/** 415 — the format itself is not one we accept. */
export function unsupportedFormatError(message: string, details?: unknown): AppError {
  return new AppError('unsupported_media_type', message, 415, details);
}

// ---- Upload input --------------------------------------------------------

/** One multipart file part, already buffered by the route. */
export interface UploadedFile {
  filename: string;
  mimetype: string;
  bytes: Uint8Array;
  /** True when @fastify/multipart cut the stream off at `limits.fileSize`. */
  truncated?: boolean;
}

/** User corrections posted alongside the file (preview → import round trip). */
export interface ImportOverrides {
  name?: string;
  description?: string;
  type?: SkillType;
}

// ---- Text helpers --------------------------------------------------------

/** Lowercase kebab-case slug; empty string when nothing survives. */
export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** The file name without its directory part. */
export function basename(path: string): string {
  const parts = path.split(/[/\\]/);
  return parts[parts.length - 1] ?? '';
}

/** Lowercased extension including the dot, or `''` when there is none. */
export function extensionOf(filename: string): string {
  const base = basename(filename);
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot).toLowerCase() : '';
}

/** The file name without directory or extension. */
export function stemOf(filename: string): string {
  const base = basename(filename);
  const ext = extensionOf(base);
  return ext ? base.slice(0, base.length - ext.length) : base;
}

function isMarkdownName(filename: string): boolean {
  return (MARKDOWN_EXTENSIONS as readonly string[]).includes(extensionOf(filename));
}

/** The first `# ` (h1) heading's text, or `''`. */
export function firstHeading(text: string): string {
  for (const line of text.split(/\r?\n/)) {
    const m = /^#[ \t]+(.+?)\s*$/.exec(line);
    if (m?.[1]) return m[1];
  }
  return '';
}

/** The first non-heading, non-blank paragraph, collapsed to a single line. */
export function firstParagraph(text: string): string {
  const collected: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const isBreak = line === '' || line.startsWith('#');
    if (collected.length === 0) {
      if (isBreak) continue;
      collected.push(line);
      continue;
    }
    if (isBreak) break;
    collected.push(line);
  }
  return collected.join(' ').trim();
}

// ---- Markdown parsing ----------------------------------------------------

/**
 * Parse markdown text into the skill core. `body` is the file text VERBATIM —
 * never reformatted, never interpreted.
 */
export function parseMarkdownSkill(
  text: string,
  filenameStem: string,
  overrides: ImportOverrides = {},
  warnings: string[] = [],
): SkillImportPreview {
  const heading = firstHeading(text);
  const overrideName = overrides.name?.trim();

  let name = overrideName ?? '';
  if (!name) {
    name = slugify(heading);
    if (!name) {
      name = slugify(filenameStem);
      warnings.push('No `# ` heading found — the name was taken from the file name.');
    }
  }
  if (!name) {
    name = FALLBACK_SKILL_NAME;
    warnings.push(`Could not derive a name — defaulted to "${FALLBACK_SKILL_NAME}".`);
  }

  let description = overrides.description?.trim() ?? firstParagraph(text);
  if (description.length > MAX_DESCRIPTION_CHARS) {
    description = description.slice(0, MAX_DESCRIPTION_CHARS);
    warnings.push(`Description clipped to ${MAX_DESCRIPTION_CHARS} characters.`);
  }
  if (!description) warnings.push('No description paragraph found.');

  return {
    name,
    description,
    type: overrides.type ?? DEFAULT_IMPORT_TYPE,
    body: text,
    source: IMPORT_SOURCE,
    warnings,
  };
}

// ---- Zip parsing ---------------------------------------------------------

/** Zip-slip: a path escaping the archive root. Nothing is written to disk — we
 *  still refuse, because such an archive is hostile by construction. */
export function isUnsafeEntryPath(name: string): boolean {
  if (name.startsWith('/') || name.startsWith('\\')) return true;
  if (/^[a-zA-Z]:/.test(name)) return true;
  return name.split(/[/\\]/).includes('..');
}

/** `__MACOSX/` noise, dot-directories/dotfiles and directory records. */
function isIgnoredEntry(name: string): boolean {
  if (name.endsWith('/')) return true;
  const segments = name.split('/');
  return segments.some((s) => s === '__MACOSX' || s.startsWith('.'));
}

function depthOf(name: string): number {
  return name.split('/').length - 1;
}

/**
 * Pick the entry to import: a `SKILL.md` (case-insensitive) at the shallowest
 * depth, else the only `*.md`. Anything else is ambiguous → the caller 400s.
 */
export function chooseZipEntry(names: string[]): { chosen?: string; candidates: string[] } {
  const candidates = names.filter((n) => !isIgnoredEntry(n) && isMarkdownName(n));
  const skillEntries = candidates
    .filter((n) => basename(n).toLowerCase() === SKILL_ENTRY_BASENAME)
    .sort((a, b) => depthOf(a) - depthOf(b) || a.localeCompare(b));

  if (skillEntries.length > 0) return { chosen: skillEntries[0]!, candidates };
  if (candidates.length === 1) return { chosen: candidates[0]!, candidates };
  return { candidates };
}

/**
 * Read a .zip in memory. The central directory is enumerated FIRST (a filter
 * that decompresses nothing), every guard runs against it, and only then is the
 * single chosen entry inflated and decoded as UTF-8.
 */
function parseZipSkill(bytes: Uint8Array, overrides: ImportOverrides): SkillImportPreview {
  const entries: UnzipFileInfo[] = [];
  try {
    unzipSync(bytes, {
      filter: (file) => {
        entries.push(file);
        return false;
      },
    });
  } catch {
    throw badUploadError('The .zip archive could not be read — it may be corrupt.');
  }

  if (entries.length > MAX_ZIP_ENTRIES) {
    throw tooLargeError(
      `The .zip archive has ${entries.length} entries; the limit is ${MAX_ZIP_ENTRIES}.`,
    );
  }

  const uncompressed = entries.reduce((sum, e) => sum + (e.originalSize || 0), 0);
  if (uncompressed > MAX_UNCOMPRESSED_BYTES) {
    throw tooLargeError(
      `The .zip archive expands to ${uncompressed} bytes; the limit is ` +
        `${MAX_UNCOMPRESSED_BYTES} bytes (4 MiB).`,
    );
  }

  const unsafe = entries.map((e) => e.name).filter(isUnsafeEntryPath);
  if (unsafe.length > 0) {
    throw badUploadError(
      `The .zip archive contains an unsafe entry path: "${unsafe[0]}". ` +
        'Entries may not start with "/" or contain "..".',
      { entries: unsafe },
    );
  }

  const names = entries.map((e) => e.name);
  const { chosen, candidates } = chooseZipEntry(names);
  if (!chosen) {
    if (candidates.length === 0) {
      throw badUploadError(
        'The .zip archive contains no markdown file. Add a SKILL.md to the archive.',
      );
    }
    throw badUploadError(
      `The .zip archive contains ${candidates.length} markdown files and no SKILL.md. ` +
        `Candidates: ${candidates.join(', ')}.`,
      { candidates },
    );
  }

  // Only the chosen entry is inflated — everything else stays compressed.
  const unpacked = unzipSync(bytes, { filter: (file) => file.name === chosen });
  const data = unpacked[chosen];
  if (!data) throw badUploadError(`Could not read "${chosen}" from the .zip archive.`);
  if (data.length > MAX_UNCOMPRESSED_BYTES) {
    throw tooLargeError(
      `"${chosen}" expands to ${data.length} bytes; the limit is ` +
        `${MAX_UNCOMPRESSED_BYTES} bytes (4 MiB).`,
    );
  }

  const warnings: string[] = [];
  const ignored = names.filter((n) => n !== chosen && !n.endsWith('/'));
  if (ignored.length > 0) {
    warnings.push(`Imported "${chosen}"; ${ignored.length} other archive entries were ignored.`);
  }

  const text = new TextDecoder('utf-8').decode(data);
  return parseMarkdownSkill(text, stemOf(chosen), overrides, warnings);
}

// ---- Entry point ---------------------------------------------------------

/**
 * Parse an upload into the skill core. Persists NOTHING — `POST
 * /skills/import/preview` returns this as-is and `POST /skills/import` stores
 * the same result. Throws AppError (413 / 400 / 415) per spec §3.
 */
export function parseSkillUpload(
  file: UploadedFile,
  overrides: ImportOverrides = {},
): SkillImportPreview {
  if (file.truncated || file.bytes.length > MAX_UPLOAD_BYTES) {
    throw tooLargeError(
      `The upload is larger than the ${MAX_UPLOAD_BYTES}-byte (1 MiB) limit.`,
    );
  }
  if (file.bytes.length === 0) throw badUploadError('The uploaded file is empty.');

  const ext = extensionOf(file.filename);
  const mime = (file.mimetype || '').split(';')[0]!.trim().toLowerCase();

  if ((MARKDOWN_EXTENSIONS as readonly string[]).includes(ext)) {
    const text = new TextDecoder('utf-8').decode(file.bytes);
    return parseMarkdownSkill(text, stemOf(file.filename), overrides);
  }
  if (ext === ZIP_EXTENSION) return parseZipSkill(file.bytes, overrides);

  // No usable extension → fall back to the declared media type.
  if (ext === '') {
    if (MARKDOWN_MIME_TYPES.includes(mime)) {
      const text = new TextDecoder('utf-8').decode(file.bytes);
      return parseMarkdownSkill(text, stemOf(file.filename), overrides);
    }
    if (ZIP_MIME_TYPES.includes(mime)) return parseZipSkill(file.bytes, overrides);
  }

  throw unsupportedFormatError(
    `Unsupported upload "${file.filename || 'file'}"${ext ? ` (${ext})` : ''}. ` +
      `Accepted formats: ${ACCEPTED_FORMATS}.`,
    { extension: ext, mimetype: mime },
  );
}
