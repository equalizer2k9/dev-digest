import type { Severity } from "@devdigest/ui";
import type {
  Agent,
  BlastRadiusResponse,
  CiFile,
  CiRunRow,
  Repo,
  EvalRunRecord,
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
import type { AgentEstimate, FindingGroup, GroupMember, MultiRunAgent } from "@devdigest/shared";

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

/** Sample eval runs for the Evals gallery group (one completed, one running, one with null metrics). */
const SHOWCASE_EVAL_RUN: EvalRunRecord = {
  id: "er-1",
  agent_id: "ag-1",
  agent_name: "Security reviewer",
  agent_version: 3,
  provider: "openai",
  model: "gpt-4.1",
  skills: [],
  status: "completed",
  has_errors: false,
  error: null,
  started_at: "2026-05-01T10:00:00.000Z",
  finished_at: "2026-05-01T10:01:00.000Z",
  recall: 0.83,
  precision: 0.6,
  citation_accuracy: 1,
  passed: 5,
  total: 8,
  cost_usd: 0.0123,
};

export const SHOWCASE_EVAL_RUNS: EvalRunRecord[] = [
  SHOWCASE_EVAL_RUN,
  { ...SHOWCASE_EVAL_RUN, id: "er-2", status: "running", finished_at: null, recall: null, precision: null, citation_accuracy: null, passed: 0, total: 8, cost_usd: null },
  { ...SHOWCASE_EVAL_RUN, id: "er-3", has_errors: true, agent_version: 2, recall: 0.5, precision: null, passed: 3, cost_usd: null },
];

const SHOWCASE_CI_RUN: CiRunRow = {
  id: "ci-1",
  repo: "acme/payments-api",
  pr_number: 128,
  agent_id: "agent-demo",
  agent: "Security reviewer",
  status: "succeeded",
  findings_count: 4,
  cost_usd: 0.0214,
  duration_s: 83,
  ran_at: "2026-05-01T10:00:00.000Z",
  github_url: "https://github.com/acme/payments-api/actions/runs/101",
};

export const SHOWCASE_CI_RUNS: CiRunRow[] = [
  SHOWCASE_CI_RUN,
  { ...SHOWCASE_CI_RUN, id: "ci-2", pr_number: 127, status: "failed", findings_count: null, cost_usd: null, duration_s: 9 },
  { ...SHOWCASE_CI_RUN, id: "ci-3", pr_number: 126, status: "no_findings", findings_count: 0, agent: null, agent_id: null },
];

export const SHOWCASE_CI_REPOS: Repo[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    workspace_id: "ws-demo",
    owner: "acme",
    name: "payments-api",
    full_name: "acme/payments-api",
    default_branch: "main",
    clone_path: null,
    last_polled_at: null,
    created_by: null,
  },
];

export const SHOWCASE_CI_FILES: CiFile[] = [
  { path: ".devdigest/agents/security-reviewer.yaml", contents: "name: Security reviewer\n", editable: false },
  { path: ".devdigest/runner/index.js", contents: "// bundled runner\n", editable: false },
  {
    path: ".github/workflows/devdigest-review.yml",
    contents: "name: DevDigest review\non:\n  pull_request:\n    types: [opened, synchronize]\n",
    editable: true,
  },
];

export const SHOWCASE_CI_AGENT = { id: "agent-demo", name: "Security reviewer" } as Agent;

/** Multi-agent review fixtures (MultiAgentPicker, AgentColumns, FindingGroups, DisagreementsSection). */
export const SHOWCASE_MULTI_ESTIMATES: AgentEstimate[] = [
  { agent_id: "ma-1", agent_name: "General reviewer", duration_ms: 42000, cost_usd: 0.031, runs: 8 },
  { agent_id: "ma-2", agent_name: "Security", duration_ms: 65000, cost_usd: 0.054, runs: 5 },
  { agent_id: "ma-3", agent_name: "Performance", duration_ms: null, cost_usd: null, runs: 0 },
];

const multiAgent = (n: number, status: string, extra: Partial<MultiRunAgent> = {}): MultiRunAgent => ({
  run_id: `mr-${n}`,
  agent_id: `ma-${n}`,
  agent_name: `Agent ${n}`,
  status,
  error: null,
  duration_ms: 42000,
  tokens_in: 1200,
  tokens_out: 340,
  cost_usd: 0.031,
  findings_count: 2,
  score: 82,
  ...extra,
});

export const SHOWCASE_MULTI_AGENTS: MultiRunAgent[] = [
  multiAgent(1, "done"),
  multiAgent(2, "running", { duration_ms: null, cost_usd: null, findings_count: null, score: null }),
  multiAgent(3, "failed", { error: "provider down", findings_count: null, score: null }),
  multiAgent(4, "cancelled", { findings_count: null, score: null }),
];

const multiMember = (id: string, run_id: string, severity: GroupMember["severity"]): GroupMember => ({
  ...SHOWCASE_FINDING,
  id,
  run_id,
  severity,
  title: "Unvalidated URL passed to fetch",
  file: "src/fetcher.ts",
  start_line: 12,
  end_line: 18,
});

export const SHOWCASE_MULTI_GROUPS: FindingGroup[] = [
  {
    id: "mg-1",
    representative: multiMember("mg-1", "mr-1", "CRITICAL"),
    members: [multiMember("mg-1", "mr-1", "CRITICAL")],
    cells: [
      { run_id: "mr-1", value: "CRITICAL" },
      { run_id: "mr-2", value: "pending" },
      { run_id: "mr-3", value: "failed" },
      { run_id: "mr-4", value: "failed" },
    ],
    conflict: false,
  },
  {
    id: "mg-2",
    representative: multiMember("mg-2", "mr-1", "WARNING"),
    members: [multiMember("mg-2", "mr-1", "WARNING"), multiMember("mg-3", "mr-2", "SUGGESTION")],
    cells: [
      { run_id: "mr-1", value: "WARNING" },
      { run_id: "mr-2", value: "SUGGESTION" },
      { run_id: "mr-3", value: "did_not_flag" },
      { run_id: "mr-4", value: "failed" },
    ],
    conflict: true,
  },
];
