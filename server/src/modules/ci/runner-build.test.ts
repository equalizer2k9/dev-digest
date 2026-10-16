import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readRunnerBuild } from './runner-build.js';

const dirs: string[] = [];
const tmp = () => {
  const d = mkdtempSync(path.join(tmpdir(), 'runner-build-'));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('readRunnerBuild (AC-3)', () => {
  it('missing directory -> null', async () => {
    expect(await readRunnerBuild(path.join(tmp(), 'nope'))).toBeNull();
  });
  it('directory without index.js -> null', async () => {
    const d = tmp();
    writeFileSync(path.join(d, 'package.json'), '{}');
    expect(await readRunnerBuild(d)).toBeNull();
  });
  it('returns every file with identical contents, nested paths relative', async () => {
    const d = tmp();
    writeFileSync(path.join(d, 'index.js'), 'main');
    writeFileSync(path.join(d, '300.index.js'), 'chunk');
    writeFileSync(path.join(d, 'package.json'), '{"type":"module"}');
    mkdirSync(path.join(d, 'sub'));
    writeFileSync(path.join(d, 'sub', 'deep.js'), 'deep');
    const out = await readRunnerBuild(d);
    expect(out).not.toBeNull();
    const map = Object.fromEntries(out!.map((f) => [f.name, f.contents]));
    expect(map).toEqual({
      'index.js': 'main',
      '300.index.js': 'chunk',
      'package.json': '{"type":"module"}',
      'sub/deep.js': 'deep',
    });
    expect(out![0]!.name).toBe('index.js');
  });
});
