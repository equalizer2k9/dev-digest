import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

async function walk(dir: string, rel: string, out: { name: string; contents: string }[]): Promise<void> {
  const entries = await readdir(path.join(dir, rel), { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const e of entries) {
    const relPath = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) await walk(dir, relPath, out);
    else if (e.isFile()) out.push({ name: relPath, contents: await readFile(path.join(dir, relPath), 'utf8') });
  }
}

/**
 * Every regular file of the runner build, paths relative to `dir`, `index.js` first.
 * null when the directory is missing or holds no `index.js` (the build was not run).
 */
export async function readRunnerBuild(dir: string): Promise<{ name: string; contents: string }[] | null> {
  const files: { name: string; contents: string }[] = [];
  try {
    await walk(dir, '', files);
  } catch {
    return null;
  }
  if (!files.some((f) => f.name === 'index.js')) return null;
  return [...files.filter((f) => f.name === 'index.js'), ...files.filter((f) => f.name !== 'index.js')];
}
