import type { Severity } from "@devdigest/ui";
import type {
  BlastRadiusResponse,
  ConventionCandidate,
  FindingRecord,
  PrBrief,
  PrFile,
  PrIntentDetail,
  ProjectContextAttachments,
  ProjectContextDocument,
  ProjectContextEffective,
  SkillWithUsage,
} from "@devdigest/shared";

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

export const SHOWCASE_BLAST: BlastRadiusResponse = {
  changed_symbols: [
    { name: "getItems", file: "src/items.ts", kind: "function" },
    { name: "formatPrice", file: "src/price.ts", kind: "function" },
  ],
  downstream: [
    {
      symbol: "getItems",
      callers: [
        { name: "listHandler", file: "src/routes/items.ts", line: 42 },
        { name: "exportJob", file: "src/jobs/export.ts", line: 7 },
      ],
      endpoints_affected: ["GET /api/public/items"],
      crons_affected: ["nightly-export"],
    },
    {
      symbol: "formatPrice",
      callers: [{ name: "renderRow", file: "src/ui/row.ts", line: 15 }],
      endpoints_affected: [],
      crons_affected: [],
    },
  ],
  summary: "",
  degraded: false,
  reason: null,
};

export const SHOWCASE_BRIEF: PrBrief = {
  summary: "Adds a price formatter and routes item listing through it.",
  risks: [
    {
      kind: "behaviour",
      title: "Rounding changed for prices",
      explanation: "formatPrice now rounds half up; callers that compared strings may differ.",
      severity: "medium",
      file_refs: ["src/items.ts"],
    },
  ],
  review_focus: [{ file: "src/items.ts", line: 12, reason: "New formatting entry point" }],
  head_sha: "abc1234",
  intent: null,
  history: null,
};

/** Sample PR intent used by the IntentCard gallery group. */
export const SHOWCASE_INTENT: PrIntentDetail = {
  pr_id: "00000000-0000-4000-8000-000000000001",
  intent: "Add retry with backoff to the payments webhook handler.",
  in_scope: ["Retry failed webhook deliveries", "Backoff configuration"],
  out_of_scope: [],
  confidence: "medium",
  sources: [
    { kind: "pr_title", ref: "PR title", status: "used" },
    { kind: "pr_description", ref: "PR description", status: "used" },
    { kind: "spec_file", ref: "docs/webhooks.md", status: "missing", reason: "notFound" },
  ],
  provider: "openrouter",
  model: "deepseek/deepseek-v4-flash",
  head_sha: "abc1234",
  generated_at: "2026-10-12T10:00:00.000Z",
  stale: true,
};

/** Sample project-context listing used by the Project Context gallery group. */
export const SHOWCASE_CONTEXT_DOCS: ProjectContextDocument[] = [
  { path: "docs/architecture.md", tag: "docs", tokens: 1240, too_large: false, used_by: 2 },
  { path: "specs/checkout/spec.md", tag: "specs", tokens: 860, too_large: false, used_by: 1 },
  { path: "insights/2026-09.md", tag: "insights", tokens: null, too_large: true, used_by: 0 },
];

export const SHOWCASE_CONTEXT_EFFECTIVE: ProjectContextEffective[] = [
  { path: "docs/architecture.md", tokens: 1240, skip_reason: null, skill: null },
  { path: "specs/checkout/spec.md", tokens: 860, skip_reason: null, skill: { id: "sk-demo", name: "test-quality-rubric" } },
];

export const SHOWCASE_CONTEXT_MARKDOWN =
  "# Architecture\n\nThe `api/` layer never imports `db/` directly.\n\n- routes call services\n- services call repositories";

/** Static data the AttachmentsEditor group is seeded with — the gallery never calls the API. */
export const SHOWCASE_CONTEXT_REPO_ID = "repo-demo";
export const SHOWCASE_CONTEXT_OWNER_ID = "agent-demo";
export const SHOWCASE_CONTEXT_ATTACHMENTS: ProjectContextAttachments = {
  repo_id: SHOWCASE_CONTEXT_REPO_ID,
  attached: ["docs/architecture.md"],
  effective: SHOWCASE_CONTEXT_EFFECTIVE,
};
