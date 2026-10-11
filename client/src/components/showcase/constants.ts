import type { Severity } from "@devdigest/ui";
import type { ConventionCandidate, FindingRecord, PrFile, SkillWithUsage } from "@devdigest/shared";

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

/** Sample file with a patch, used by the FileCard-with-findings gallery group. */
export const SHOWCASE_DIFF_FILE: PrFile = {
  path: "src/config.ts",
  additions: 2,
  deletions: 1,
  patch: "@@ -1,2 +1,3 @@\n const a = 1;\n-const b = 2;\n+const b = 3;\n+const secret = \"sk-live-123\";",
};

/** Sample finding anchored to line 3 of SHOWCASE_DIFF_FILE. */
export const SHOWCASE_FINDING: FindingRecord = {
  id: "fd-demo",
  severity: "CRITICAL",
  category: "security",
  title: "Hardcoded secret",
  file: "src/config.ts",
  start_line: 3,
  end_line: 3,
  rationale: "A live key is committed to the repository.",
  suggestion: null,
  confidence: 0.95,
  kind: "finding",
  trifecta_components: null,
  evidence: null,
  review_id: "rv-demo",
  accepted_at: null,
  dismissed_at: null,
};

/** Same, but its line is not in the patch — it lands in the "outside" block. */
export const SHOWCASE_FINDING_OUTSIDE: FindingRecord = {
  ...SHOWCASE_FINDING,
  id: "fd-demo-2",
  severity: "SUGGESTION",
  title: "Document the new setting",
  start_line: 40,
  end_line: 40,
};
