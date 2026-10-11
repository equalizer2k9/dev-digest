#!/usr/bin/env node
// PreToolUse guard for Edit / Write, wired from an agent's frontmatter:
//   node "$CLAUDE_PROJECT_DIR/.claude/hooks/restrict-write-paths.mjs" <tests|docs>
// Exit 2 blocks the tool call and feeds stderr back to the agent. Fails closed.
import path from 'node:path';

const LOCK_FILES = new Set(['package-lock.json', 'pnpm-lock.yaml', 'skills-lock.json']);

const RULES = {
  tests: {
    allowed: '*.test.ts, *.test.tsx, any __tests__/ folder, e2e/',
    matches: (rel) =>
      /\.test\.tsx?$/.test(rel) || rel.split('/').includes('__tests__') || rel.startsWith('e2e/'),
  },
  docs: {
    allowed: 'docs/ and <package>/docs/',
    matches: (rel) => /^(?:[^/]+\/)?docs\//.test(rel),
  },
};

function deny(reason) {
  process.stderr.write(`Blocked by restrict-write-paths: ${reason}\n`);
  process.exit(2);
}

const rule = RULES[process.argv[2]];
if (!rule) deny(`unknown mode "${process.argv[2]}"`);

let raw = '';
for await (const chunk of process.stdin) raw += chunk;

let input;
try {
  input = JSON.parse(raw);
} catch {
  deny('hook input is not JSON');
}

const filePath = input?.tool_input?.file_path;
if (typeof filePath !== 'string' || filePath === '') deny('no file_path in the tool input');

const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
const rel = path
  .relative(root, path.resolve(input.cwd || root, filePath))
  .split(path.sep)
  .join('/');

if (rel.startsWith('..') || path.isAbsolute(rel)) deny(`${filePath} is outside the repository`);
if (rel.split('/').includes('node_modules') || LOCK_FILES.has(path.basename(rel))) {
  deny(`${rel} is a dependency or lock file`);
}
if (!rule.matches(rel)) deny(`${rel} is not writable for this agent. Allowed: ${rule.allowed}`);
