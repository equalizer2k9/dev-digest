import type { CiFile } from '@devdigest/shared';
import { AGENTS_DIR, RUNNER_DIR, SKILLS_DIR, WORKFLOW_NAME, WORKFLOW_PATH } from './constants.js';
import {
  buildManifest,
  ciSlug,
  manifestText,
  uniqueSlugs,
  type BundleAgent,
  type BundleSkill,
} from './manifest.js';

export interface BuildBundleInput {
  agent: BundleAgent;
  /** Enabled skills, in link order. */
  skills: BundleSkill[];
  runner: { name: string; contents: string }[];
  workflow: string;
}

/**
 * The CI bundle: manifest, skills, every runner file, workflow — in that order.
 * Only the workflow is editable in the preview.
 */
export function buildBundle({ agent, skills, runner, workflow }: BuildBundleInput): CiFile[] {
  const slugs = uniqueSlugs(skills.map((s) => s.name), 'skill');
  const manifest = buildManifest(agent, slugs);
  return [
    { path: `${AGENTS_DIR}/${ciSlug(agent.name, 'agent')}.yaml`, contents: manifestText(manifest), editable: false },
    ...skills.map((s, i) => ({ path: `${SKILLS_DIR}/${slugs[i]}.md`, contents: s.body, editable: false })),
    ...runner.map((f) => ({ path: `${RUNNER_DIR}/${f.name}`, contents: f.contents, editable: false })),
    { path: WORKFLOW_PATH, contents: workflow, editable: true },
  ];
}

/** Pull request description: the files, the one secret to add, and the required check. */
export function prBody(paths: string[]): string {
  return [
    'Adds a DevDigest review agent to this repository as a GitHub Actions check.',
    '',
    '## Files',
    ...paths.map((p) => `- \`${p}\``),
    '',
    '## Before merging',
    '- Add the repository secret `OPENROUTER_API_KEY` (Settings -> Secrets and variables -> Actions).',
    `- To make the review blocking, add a ruleset on \`main\` that requires the \`${WORKFLOW_NAME}\` check.`,
    '',
    'The workflow checks out the base commit of each pull request, so it runs only after this PR is merged.',
  ].join('\n');
}
