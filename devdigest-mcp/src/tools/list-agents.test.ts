import { afterEach, describe, expect, it, vi } from 'vitest';
import { AGENTS, mockApi } from '../mock-api.js';
import { listAgents } from './list-agents.js';

afterEach(() => vi.unstubAllGlobals());

describe('list_agents', () => {
  it('returns the whitelisted fields, never system_prompt', async () => {
    mockApi({ 'GET /agents': AGENTS });
    const out = await listAgents();
    expect(out.map((a) => a.name)).toEqual(['Security Reviewer', 'General Reviewer']);
    expect(JSON.stringify(out)).not.toMatch(/system_prompt|SECRET PROMPT/);
  });
});
