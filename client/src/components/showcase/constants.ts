import type { Severity } from "@devdigest/ui";
import type { ConventionCandidate, SkillWithUsage } from "@devdigest/shared";

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

/** Sample convention candidate used by the Conventions gallery group. */
export const SHOWCASE_CONVENTION: ConventionCandidate = {
  id: "cv-demo",
  category: "error-handling",
  rule: "Every route handler wraps its service call in the module's `toHttpError` helper",
  evidence_path: "src/modules/reviews/routes.ts",
  evidence_start_line: 42,
  evidence_end_line: 48,
  evidence_snippet:
    "try {\n  return await service.run(input);\n} catch (e) {\n  throw toHttpError(e);\n}",
  head_sha: "9f1c2ab3d4e5f60718293a4b5c6d7e8f90a1b2c3",
  confidence: 0.91,
  status: "accepted",
  accepted: true,
};

/** Same candidate, still undecided — the grey-bordered, low-confidence variant. */
export const SHOWCASE_CONVENTION_PENDING: ConventionCandidate = {
  ...SHOWCASE_CONVENTION,
  id: "cv-demo-2",
  category: "naming",
  rule: "Files and folders are kebab-case; React components are PascalCase folders",
  confidence: 0.62,
  status: "pending",
  accepted: false,
};
