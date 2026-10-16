import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { AgentManifest } from '@devdigest/shared';
import { buildBundle, prBody } from './bundle.js';
import {
  buildManifest,
  ciSlug,
  enabledSkills,
  manifestText,
  uniqueSlugs,
  validateManifestText,
} from './manifest.js';
import { buildWorkflow } from './workflow.js';

const TOKEN = 'ghp_SECRETTOKEN123';
const agent = {
  name: 'Security Reviewer',
  provider: 'openrouter' as const,
  model: 'anthropic/claude-sonnet',
  systemPrompt: 'You review code.\nSay "no": really # not a comment\n  indented line\n',
  strategy: 'auto' as const,
  ciFailOn: 'warning' as const,
};
const link = (name: string, body: string, enabled = true, order = 0) => ({
  skill: { name, body, enabled },
  order,
});
const runner = [
  { name: 'index.js', contents: 'console.log(1)' },
  { name: '300.index.js', contents: 'chunk' },
  { name: 'package.json', contents: '{"type":"module"}' },
];
const workflow = buildWorkflow(['opened', 'synchronize'], 'github_review');

const fixture = () => {
  const links = [link('Alpha Rules', 'ALPHA BODY'), link('Beta', 'BETA BODY', false), link('Gamma', 'GAMMA BODY')];
  return buildBundle({ agent, skills: enabledSkills(links), runner, workflow });
};

describe('slugs', () => {
  it('ciSlug per A-1', () => {
    expect(ciSlug('Security Reviewer', 'agent')).toBe('security-reviewer');
    expect(ciSlug('  --A__B!!c--  ', 'skill')).toBe('a-b-c');
    expect(ciSlug('!!!', 'agent')).toBe('agent');
    expect(ciSlug('', 'skill')).toBe('skill');
    expect(ciSlug('Ünï', 'skill')).toMatch(/^[a-z0-9-]+$/);
  });
  it('uniqueSlugs adds -2, -3 (EC-3)', () => {
    expect(uniqueSlugs(['x', 'x', 'X!', 'y'])).toEqual(['x', 'x-2', 'x-3', 'y']);
  });
});

describe('buildBundle (AC-1)', () => {
  it('has exactly the expected file set, in order', () => {
    const files = fixture();
    expect(files.map((f) => f.path)).toEqual([
      '.devdigest/agents/security-reviewer.yaml',
      '.devdigest/skills/alpha-rules.md',
      '.devdigest/skills/gamma.md',
      '.devdigest/runner/index.js',
      '.devdigest/runner/300.index.js',
      '.devdigest/runner/package.json',
      '.github/workflows/devdigest-review.yml',
    ]);
  });
  it('skill bodies, runner contents identical; only the workflow editable; disabled skill absent', () => {
    const files = fixture();
    const by = Object.fromEntries(files.map((f) => [f.path, f]));
    expect(by['.devdigest/skills/alpha-rules.md']!.contents).toBe('ALPHA BODY');
    expect(by['.devdigest/skills/gamma.md']!.contents).toBe('GAMMA BODY');
    for (const r of runner) expect(by[`.devdigest/runner/${r.name}`]!.contents).toBe(r.contents);
    expect(by['.github/workflows/devdigest-review.yml']!.contents).toBe(workflow);
    expect(files.filter((f) => f.editable).map((f) => f.path)).toEqual(['.github/workflows/devdigest-review.yml']);
    const manifest = parseYaml(by['.devdigest/agents/security-reviewer.yaml']!.contents);
    expect(manifest.skills).toEqual(['alpha-rules', 'gamma']);
    expect(files.some((f) => f.path.includes('beta') || f.contents.includes('BETA BODY'))).toBe(false);
  });
  it('EC-2: no / only disabled skills -> no skill files, empty list', () => {
    for (const links of [[], [link('Off', 'x', false)]]) {
      const files = buildBundle({ agent, skills: enabledSkills(links), runner, workflow });
      expect(files.some((f) => f.path.startsWith('.devdigest/skills/'))).toBe(false);
      expect(parseYaml(files[0]!.contents).skills).toEqual([]);
    }
  });
  it('EC-3: duplicate skill names get -2', () => {
    const files = buildBundle({
      agent,
      skills: enabledSkills([link('X', 'a'), link('x', 'b')]),
      runner,
      workflow,
    });
    expect(files.map((f) => f.path)).toContain('.devdigest/skills/x.md');
    expect(files.map((f) => f.path)).toContain('.devdigest/skills/x-2.md');
  });
  it('EC-4: unsluggable names fall back, slugs are path-safe', () => {
    const files = buildBundle({
      agent: { ...agent, name: '!!!' },
      skills: enabledSkills([link('!!!', 'a')]),
      runner,
      workflow,
    });
    expect(files[0]!.path).toBe('.devdigest/agents/agent.yaml');
    expect(files[1]!.path).toBe('.devdigest/skills/skill.md');
    for (const f of files.slice(0, 2)) expect(f.path.split('/').at(-1)).toMatch(/^[a-z0-9-]+\.(yaml|md)$/);
  });
  it('S-2: no file contains the token', () => {
    for (const f of fixture()) expect(f.contents).not.toContain(TOKEN);
  });
});

describe('manifest (AC-2)', () => {
  const m = buildManifest(agent, ['alpha-rules', 'gamma']);

  it('is YAML with a literal system_prompt block, not JSON', () => {
    const text = manifestText(m);
    expect(() => JSON.parse(text)).toThrow();
    expect(text).toContain('system_prompt: |');
  });
  it('round-trips through the runner path and AgentManifest', () => {
    const parsed = AgentManifest.safeParse(parseYaml(manifestText(m)));
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data).toMatchObject({
      name: 'Security Reviewer',
      provider: 'openrouter',
      model: 'anthropic/claude-sonnet',
      skills: ['alpha-rules', 'gamma'],
      ci_fail_on: 'warning',
    });
    expect(parsed.data.system_prompt).toBe(agent.systemPrompt);
  });
  it('multi-line prompts with quotes and ": #" round-trip byte-identically', () => {
    for (const p of ['a: # b\n"q" \'s\'\n\nlast', 'single line', '  leading\nspace\n\n', 'k: v']) {
      const out = validateManifestText(manifestText(buildManifest({ ...agent, systemPrompt: p }, [])));
      expect(out?.system_prompt).toBe(p);
    }
  });
  it('validateManifestText returns the parsed manifest, null when invalid', () => {
    expect(validateManifestText(manifestText(m))?.skills).toEqual(['alpha-rules', 'gamma']);
    expect(validateManifestText(manifestText(buildManifest({ ...agent, model: '' }, [])))).toBeNull();
    expect(validateManifestText(': : not yaml [')).toBeNull();
  });
});

describe('prBody', () => {
  it('lists every path and names the secret and the check', () => {
    const paths = fixture().map((f) => f.path);
    const body = prBody(paths);
    for (const p of paths) expect(body).toContain(p);
    expect(body).toContain('OPENROUTER_API_KEY');
    expect(body).toContain('DevDigest Review');
  });
});
