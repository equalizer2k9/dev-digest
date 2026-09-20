import type { Severity } from "@devdigest/ui";
import type { SkillWithUsage } from "@devdigest/shared";

/** Constants for the Showcase Gallery (dev-only). */

export const SEVERITIES: Severity[] = ["CRITICAL", "WARNING", "SUGGESTION", "INFO"];

export const CATEGORIES = ["bug", "security", "perf", "style", "test"] as const;

export const MODEL_OPTIONS = ["gpt-4.1", "gpt-4o", "claude-sonnet"] as const;

/** Sample skill used by the Skills Lab gallery group. */
export const SHOWCASE_SKILL: SkillWithUsage = {
  id: "sk-demo",
  name: "test-quality-rubric",
  description: "Flags tests that only cover the happy path",
  type: "rubric",
  source: "manual",
  body: "# Rule\n\nEvery new branch needs a test.\n\n- boundary cases\n- error paths",
  enabled: true,
  version: 3,
  agent_count: 2,
};
