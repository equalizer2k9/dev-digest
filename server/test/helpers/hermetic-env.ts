import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Vitest setup file. The container falls back to `~/.devdigest/secrets.json` and to process.env
// for any adapter a test did not override, so on a developer machine an unmocked provider would
// reach the real OpenRouter / GitHub with real keys. Point HOME at an empty directory and drop
// the key variables: an unmocked adapter now fails with ConfigError instead of going out.
process.env.HOME = mkdtempSync(join(tmpdir(), 'devdigest-test-home-'));
process.env.USERPROFILE = process.env.HOME;

for (const key of [
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'OPENROUTER_API_KEY',
  'GITHUB_TOKEN',
  'GITHUB_PAT',
]) {
  delete process.env[key];
}
