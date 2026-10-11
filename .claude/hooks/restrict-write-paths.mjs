#!/usr/bin/env node
// PreToolUse guard for Edit / Write, wired from an agent's frontmatter:
//   node "$CLAUDE_PROJECT_DIR/.claude/hooks/restrict-write-paths.mjs" <tests|docs>
// Exit 2 blocks the tool call and feeds stderr back to the agent. Fails closed.
import fs from 'node:fs';
import path from 'node:path';

const PACKAGES = ['server', 'client', 'reviewer-core', 'e2e'];
const DENIED_SEGMENTS = new Set(['node_modules', '.git', '.github', '.claude', 'clones']);
const DENIED_FILES =
  /^(?:package\.json|package-lock\.json|pnpm-lock\.yaml|skills-lock\.json|tsconfig.*\.json|\.env.*|.*\.config\.[cm]?[jt]s)$/;

const RULES = {
  tests: {
    allowed: '*.test.ts, *.test.tsx, any __tests__/ folder, e2e/',
    matches: (segments) =>
      PACKAGES.includes(segments[0]) &&
      (/\.test\.tsx?$/.test(segments.at(-1)) ||
        segments.slice(0, -1).includes('__tests__') ||
        segments[0] === 'e2e'),
  },
  docs: {
    allowed: 'docs/ and <package>/docs/',
    matches: (segments) =>
      segments.length > 1 &&
      (segments[0] === 'docs' || (PACKAGES.includes(segments[0]) && segments[1] === 'docs')),
  },
};

function deny(reason) {
  process.stderr.write(`Blocked by restrict-write-paths: ${reason}\n`);
  process.exit(2);
}

// Resolves symlinks in the part of the path that already exists, so a link inside an allowed
// folder cannot point the write somewhere else. A dangling link is refused outright.
function realTarget(absolute) {
  const pending = [];
  let current = absolute;
  for (;;) {
    let stat = null;
    try {
      stat = fs.lstatSync(current);
    } catch {
      // does not exist yet — keep walking up
    }
    if (stat) {
      try {
        return path.join(fs.realpathSync(current), ...pending);
      } catch {
        deny(`${current} is a dangling symlink`);
      }
    }
    const parent = path.dirname(current);
    if (parent === current) deny(`cannot resolve ${absolute}`);
    pending.unshift(path.basename(current));
    current = parent;
  }
}

const rule = Object.hasOwn(RULES, process.argv[2]) ? RULES[process.argv[2]] : null;
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

const cwd = typeof input.cwd === 'string' && input.cwd !== '' ? input.cwd : process.cwd();
let root;
try {
  root = fs.realpathSync(process.env.CLAUDE_PROJECT_DIR || cwd);
} catch {
  deny('cannot resolve the repository root');
}

const rel = path.relative(root, realTarget(path.resolve(cwd, filePath)));
if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
  deny(`${filePath} resolves outside the repository`);
}

const segments = rel.split(path.sep);
const shown = segments.join('/');
if (segments.some((s) => DENIED_SEGMENTS.has(s)) || DENIED_FILES.test(segments.at(-1))) {
  deny(`${shown} is tooling, configuration or a dependency`);
}
if (!rule.matches(segments)) deny(`${shown} is not writable for this agent. Allowed: ${rule.allowed}`);
