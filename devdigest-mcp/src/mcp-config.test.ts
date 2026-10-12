import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('.mcp.json', () => {
  it('AC-D: devdigest server is stdio with the unchanged command and args', () => {
    const path = fileURLToPath(new URL('../../.mcp.json', import.meta.url));
    const cfg = JSON.parse(readFileSync(path, 'utf8')) as { mcpServers: Record<string, Record<string, unknown>> };
    const s = cfg.mcpServers.devdigest!;
    expect(s.type).toBe('stdio');
    expect(s.command).toBe('devdigest-mcp/node_modules/.bin/tsx');
    expect(s.args).toEqual(['devdigest-mcp/src/index.ts']);
  });
});
