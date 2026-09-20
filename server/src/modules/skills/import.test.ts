import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import type { AppError } from '../../platform/errors.js';
import {
  MAX_UNCOMPRESSED_BYTES,
  MAX_UPLOAD_BYTES,
  MAX_ZIP_ENTRIES,
} from './constants.js';
import {
  parseSkillUpload,
  type ImportOverrides,
  type UploadedFile,
} from './helpers.js';

/**
 * Unit coverage for the upload parser (spec §3). Every guard has its OWN status
 * and message, so the Skills page can tell an oversized file from a zip bomb
 * from an archive it cannot disambiguate. Nothing here touches the DB or the
 * filesystem: an archive is unpacked in memory and only the chosen entry is
 * decoded.
 */

function md(text: string, filename = 'my-skill.md'): UploadedFile {
  return { filename, mimetype: 'text/markdown', bytes: strToU8(text) };
}

function zip(files: Record<string, string>, filename = 'pkg.zip'): UploadedFile {
  const entries = Object.fromEntries(
    Object.entries(files).map(([name, text]) => [name, strToU8(text)]),
  );
  return { filename, mimetype: 'application/zip', bytes: zipSync(entries) };
}

/** Run the parser expecting a rejection; returns the AppError it threw. */
function rejection(file: UploadedFile, overrides?: ImportOverrides): AppError {
  try {
    parseSkillUpload(file, overrides);
  } catch (err) {
    return err as AppError;
  }
  throw new Error('expected parseSkillUpload to throw');
}

describe('markdown uploads', () => {
  it('derives the name from the first `# ` heading, slugified', () => {
    const preview = parseSkillUpload(
      md('# Test Quality Rubric\n\nFlag tests that only cover the happy path.\n'),
    );

    expect(preview.name).toBe('test-quality-rubric');
    expect(preview.description).toBe('Flag tests that only cover the happy path.');
    expect(preview.type).toBe('custom');
    expect(preview.source).toBe('imported_file');
  });

  it('stores the body VERBATIM, including headings and trailing newlines', () => {
    const text = '# Title\n\n- one\n- two\n\n```ts\nconst a = 1;\n```\n';
    expect(parseSkillUpload(md(text)).body).toBe(text);
  });

  it('falls back to the filename stem when there is no `# ` heading', () => {
    const preview = parseSkillUpload(md('Just a paragraph.\n', 'api-contract.markdown'));

    expect(preview.name).toBe('api-contract');
    expect(preview.description).toBe('Just a paragraph.');
    expect(preview.warnings.join(' ')).toMatch(/heading/i);
  });

  it('skips headings and blank lines to find the first real paragraph', () => {
    const preview = parseSkillUpload(md('# T\n\n## Sub\n\nThe first real line.\nStill it.\n\nLater.\n'));
    expect(preview.description).toBe('The first real line. Still it.');
  });

  it('clips the description to 200 characters and says so', () => {
    const preview = parseSkillUpload(md(`# T\n\n${'x'.repeat(400)}\n`));

    expect(preview.description).toHaveLength(200);
    expect(preview.warnings.join(' ')).toMatch(/200/);
  });

  it('lets name/description/type overrides win over the parsed values', () => {
    const preview = parseSkillUpload(md('# Parsed Name\n\nParsed description.\n'), {
      name: 'chosen-name',
      description: 'Chosen description.',
      type: 'security',
    });

    expect(preview).toMatchObject({
      name: 'chosen-name',
      description: 'Chosen description.',
      type: 'security',
    });
  });

  it('rejects an empty upload', () => {
    const err = rejection({ filename: 'empty.md', mimetype: 'text/markdown', bytes: new Uint8Array(0) });
    expect(err.statusCode).toBe(400);
    expect(err.message).toMatch(/empty/i);
  });
});

describe('zip uploads', () => {
  it('picks the SKILL.md at the shallowest depth, ignoring __MACOSX and dotfiles', () => {
    const preview = parseSkillUpload(
      zip({
        'pkg/docs/SKILL.md': '# Deep One\n\nToo deep.\n',
        'pkg/SKILL.md': '# Shallow One\n\nThe real one.\n',
        'pkg/README.md': '# Readme\n\nNot a skill.\n',
        '__MACOSX/pkg/._SKILL.md': 'resource fork junk',
        '.hidden/SKILL.md': '# Hidden\n\nIgnored.\n',
      }),
    );

    expect(preview.name).toBe('shallow-one');
    expect(preview.body).toBe('# Shallow One\n\nThe real one.\n');
  });

  it('matches SKILL.md case-insensitively', () => {
    const preview = parseSkillUpload(zip({ 'pkg/skill.MD': '# Lower Case\n\nStill picked.\n' }));
    expect(preview.name).toBe('lower-case');
  });

  it('falls back to the only markdown entry when there is no SKILL.md', () => {
    const preview = parseSkillUpload(
      zip({ 'pkg/rubric.md': '# Only One\n\nPicked by elimination.\n', 'pkg/logo.png': 'not markdown' }),
    );
    expect(preview.name).toBe('only-one');
  });

  it('400s on an ambiguous archive, listing the markdown candidates', () => {
    const err = rejection(zip({ 'a.md': '# A\n\na\n', 'docs/b.md': '# B\n\nb\n' }));

    expect(err.statusCode).toBe(400);
    expect(err.message).toContain('a.md');
    expect(err.message).toContain('docs/b.md');
    expect(err.details).toEqual({ candidates: ['a.md', 'docs/b.md'] });
  });

  it('400s when the archive holds no markdown at all', () => {
    const err = rejection(zip({ 'pkg/logo.png': 'binary', '__MACOSX/pkg/._logo.png': 'junk' }));

    expect(err.statusCode).toBe(400);
    expect(err.message).toMatch(/no markdown/i);
  });

  it('400s on a corrupt archive rather than throwing raw', () => {
    const err = rejection({
      filename: 'broken.zip',
      mimetype: 'application/zip',
      bytes: strToU8('this is definitely not a zip'),
    });
    expect(err.statusCode).toBe(400);
  });
});

describe('guards', () => {
  it('413s an upload over 1 MiB', () => {
    const err = rejection({
      filename: 'big.md',
      mimetype: 'text/markdown',
      bytes: new Uint8Array(MAX_UPLOAD_BYTES + 1).fill(97),
    });

    expect(err.statusCode).toBe(413);
    expect(err.message).toMatch(/1 MiB/);
  });

  it('413s an upload the multipart layer already truncated at the limit', () => {
    const err = rejection({
      filename: 'big.md',
      mimetype: 'text/markdown',
      bytes: new Uint8Array(MAX_UPLOAD_BYTES).fill(97),
      truncated: true,
    });
    expect(err.statusCode).toBe(413);
  });

  it('413s an archive with more than 200 entries', () => {
    const files: Record<string, string> = {};
    for (let i = 0; i <= MAX_ZIP_ENTRIES; i += 1) files[`f${i}.txt`] = 'x';
    const err = rejection(zip(files));

    expect(err.statusCode).toBe(413);
    expect(err.message).toMatch(/entries/i);
  });

  it('413s a zip bomb — >4 MiB uncompressed from a tiny archive', () => {
    const bomb = zip({ 'SKILL.md': 'a'.repeat(MAX_UNCOMPRESSED_BYTES + 1024) });
    expect(bomb.bytes.length).toBeLessThan(MAX_UPLOAD_BYTES); // small on the wire…

    const err = rejection(bomb);
    expect(err.statusCode).toBe(413); // …huge once expanded
    expect(err.message).toMatch(/expands to/i);
  });

  it('400s zip slip — an entry escaping the archive root', () => {
    const err = rejection(zip({ '../../etc/SKILL.md': '# Evil\n\nnope\n' }));

    expect(err.statusCode).toBe(400);
    expect(err.message).toMatch(/unsafe/i);
  });

  it('400s an absolute entry path', () => {
    const err = rejection(zip({ '/etc/SKILL.md': '# Evil\n\nnope\n' }));
    expect(err.statusCode).toBe(400);
  });
});

describe('unsupported formats', () => {
  it.each(['.tar', '.rar', '.7z', '.txt', '.pdf'])('415s %s', (ext) => {
    const err = rejection({
      filename: `skill${ext}`,
      mimetype: 'application/octet-stream',
      bytes: strToU8('whatever'),
    });

    expect(err.statusCode).toBe(415);
    expect(err.message).toContain('.md');
    expect(err.message).toContain('.zip');
  });

  it('415s an unknown media type when the filename has no extension', () => {
    const err = rejection({ filename: 'skill', mimetype: 'application/x-tar', bytes: strToU8('x') });
    expect(err.statusCode).toBe(415);
  });
});
