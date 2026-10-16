import { Document, Scalar, parse as parseYaml } from 'yaml';
import { AgentManifest, type AgentManifestInput, type CiFailOn } from '@devdigest/shared';

/**
 * Slugs and the agent manifest of the CI bundle. Pure. The manifest is real YAML
 * (`system_prompt` as a literal block) and is validated the way the runner reads
 * it: `yaml.parse` then `AgentManifest.safeParse`.
 */

/** Minimal agent shape the bundle needs (an `agents` row satisfies it). */
export interface BundleAgent {
  name: string;
  provider: 'openai' | 'anthropic' | 'openrouter';
  model: string;
  systemPrompt: string;
  strategy: 'single-pass' | 'map-reduce' | 'auto';
  ciFailOn: CiFailOn;
}

/** Minimal skill shape the bundle needs. */
export interface BundleSkill {
  name: string;
  body: string;
}

/** Lower-case; every run of characters outside `a-z0-9` becomes one hyphen; ends trimmed (A-1). */
export function ciSlug(name: string, fallback: 'agent' | 'skill'): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || fallback;
}

/** Slugs of `names` made unique within the list: `x`, `x-2`, `x-3`, … */
export function uniqueSlugs(names: string[], fallback: 'agent' | 'skill' = 'skill'): string[] {
  const seen = new Map<string, number>();
  return names.map((n) => {
    const base = ciSlug(n, fallback);
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return count === 1 ? base : `${base}-${count}`;
  });
}

/** Enabled linked skills, in link order — the set a local review sends (D-4). */
export function enabledSkills<S extends BundleSkill & { enabled: boolean }>(
  links: { skill: S; order: number }[],
): S[] {
  return links.filter((l) => l.skill.enabled).map((l) => l.skill);
}

export function buildManifest(agent: BundleAgent, skillSlugs: string[]): AgentManifestInput {
  return {
    name: agent.name,
    provider: agent.provider,
    model: agent.model,
    system_prompt: agent.systemPrompt,
    skills: skillSlugs,
    strategy: agent.strategy,
    ci_fail_on: agent.ciFailOn,
  };
}

/** YAML text of the manifest; `system_prompt` is a literal block scalar so it stays readable in the PR. */
export function manifestText(m: AgentManifestInput): string {
  const doc = new Document(m);
  const prompt = doc.get('system_prompt', true);
  if (prompt instanceof Scalar && typeof prompt.value === 'string' && prompt.value.length > 0) {
    prompt.type = Scalar.BLOCK_LITERAL;
  }
  return doc.toString({ lineWidth: 0 });
}

/** Parse like the runner does, then validate; null when it is not a valid manifest. */
export function validateManifestText(text: string): AgentManifest | null {
  let parsed: unknown;
  try {
    parsed = parseYaml(text);
  } catch {
    return null;
  }
  const res = AgentManifest.safeParse(parsed);
  return res.success ? res.data : null;
}
