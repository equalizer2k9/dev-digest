import { afterEach, describe, expect, it, vi } from 'vitest';
import { AGENTS, mockApi } from '../mock-api.js';
import { listAgents, registerListAgents } from './list-agents.js';

afterEach(() => vi.unstubAllGlobals());

describe('list_agents', () => {
  it('returns the whitelisted fields, never system_prompt', async () => {
    mockApi({ 'GET /agents': AGENTS });
    const out = await listAgents();
    expect(out.map((a) => a.name)).toEqual(['Security Reviewer', 'General Reviewer']);
    expect(JSON.stringify(out)).not.toMatch(/system_prompt|SECRET PROMPT/);
  });

  it('AC-A: exactly id, name, description, model, enabled in that order; provider is dropped', async () => {
    expect(AGENTS.some((a) => 'provider' in a)).toBe(true);
    mockApi({ 'GET /agents': AGENTS });
    const out = await listAgents();
    for (const a of out) expect(Object.keys(a)).toEqual(['id', 'name', 'description', 'model', 'enabled']);
    expect(JSON.stringify(out)).not.toMatch(/provider/);
  });

  it('AC-A: the tool description does not list provider as a returned field', async () => {
    const reg: { desc?: string } = {};
    registerListAgents({ registerTool: (_n: string, c: { description: string }) => { reg.desc = c.description; } } as never);
    const returns = reg.desc!.split('Returns')[1]!.split(';')[0]!;
    expect(returns).toContain('{ id, name, description, model, enabled }');
    expect(returns).not.toMatch(/provider/);
  });
});
