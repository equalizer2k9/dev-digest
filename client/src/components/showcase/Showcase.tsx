/* Showcase.tsx — renders every design-system component for visual verification.
   Used by the /showcase route (both themes) and by the smoke tests.
   Dev-only page: labels are intentionally not internationalized. */
"use client";

import React from "react";
import {
  Button,
  IconBtn,
  Badge,
  SeverityBadge,
  CategoryTag,
  Chip,
  Avatar,
  ConfidenceNum,
  RunCostBadge,
  formatTokenFlow,
  MonoLink,
  ProgressBar,
  PercentProgress,
  CircularScore,
  Toggle,
  Kbd,
  SectionLabel,
  Card,
  EmptyState,
  ErrorState,
  Skeleton,
  Markdown,
  Drawer,
  Modal,
  Tabs,
  Dropdown,
  FormField,
  TextInput,
  SelectInput,
  Textarea,
  Checkbox,
  Sparkline,
  LineChart,
  Donut,
  BarRow,
  MetricCard,
  LiveLogStream,
  ExportWizardSteps,
  AutoTriggerStatus,
} from "@devdigest/ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import skillMessages from "../../../messages/en/skills.json";
import conventionMessages from "../../../messages/en/conventions.json";
import blastMessages from "../../../messages/en/blast.json";
import briefMessages from "../../../messages/en/brief.json";
import prReviewMessages from "../../../messages/en/prReview.json";
import shellMessages from "../../../messages/en/shell.json";
import intentMessages from "../../../messages/en/intent.json";
import contextMessages from "../../../messages/en/context.json";
import { DocPicker } from "../project-context/DocPicker";
import { DocPreview } from "../project-context/DocPreview";
import { AttachmentsEditor } from "../project-context/AttachmentsEditor";
import { contextKeys } from "../../lib/hooks/project-context";
import { RepoCtx } from "../../lib/repo-context";
import { IntentCard } from "../../app/repos/[repoId]/pulls/[number]/_components/IntentCard";
import { ApiError } from "../../lib/api";
import { FileCard } from "../diff-viewer";
import { FindingCard } from "../findings/FindingCard";
import { DiffRoleGroup } from "../../app/repos/[repoId]/pulls/[number]/_components/DiffRoleGroup";
import { BlastRadius } from "../../app/repos/[repoId]/pulls/[number]/_components/BlastRadius";
import { PrBriefBlock } from "../../app/repos/[repoId]/pulls/[number]/_components/PrBriefBlock";
import { ConfirmDialog } from "../confirm-dialog";
import { SkillCard } from "../../app/skills/_components/SkillCard";
import { SkillPreviewDrawer } from "../../app/skills/_components/SkillPreviewDrawer";
import { ConventionCard } from "../../app/repos/[repoId]/conventions/_components/ConventionCard";
import evalMessages from "../../../messages/en/eval.json";
import { EvalMetrics } from "../eval/EvalMetrics";
import { EvalRunTable } from "../eval/EvalRunTable";
import { EvalCaseModal } from "../eval/EvalCaseModal";
import { EvalSingleRunResult } from "../eval/EvalSingleRunResult";
import ciMessages from "../../../messages/en/ci.json";
import { CiRunsTable } from "../ci/CiRunsTable";
import { ExportWizard } from "../ci/ExportWizard";
import multiAgentMessages from "../../../messages/en/multiAgent.json";
import { MultiAgentPicker } from "../multi-agent";
import { AgentColumns } from "../../app/multi-agent/[id]/_components/AgentColumns";
import { FindingGroups } from "../../app/multi-agent/[id]/_components/FindingGroups";
import { DisagreementsSection } from "../../app/multi-agent/[id]/_components/DisagreementsSection";
import { s } from "./styles";
import {
  SEVERITIES,
  CATEGORIES,
  MODEL_OPTIONS,
  SHOWCASE_DIFF_FILE,
  SHOWCASE_FINDING,
  SHOWCASE_FINDING_OUTSIDE,
  SHOWCASE_BLAST,
  SHOWCASE_BRIEF,
  SHOWCASE_INTENT,
  SHOWCASE_SKILL,
  SHOWCASE_EVAL_RUNS,
  SHOWCASE_EVAL_DRAFT,
  SHOWCASE_EVAL_SINGLE_RUNS,
  SHOWCASE_CONVENTION,
  SHOWCASE_CONTEXT_DOCS,
  SHOWCASE_CONTEXT_EFFECTIVE,
  SHOWCASE_CONTEXT_MARKDOWN,
  SHOWCASE_CONTEXT_ATTACHMENTS,
  SHOWCASE_CONTEXT_REPO_ID,
  SHOWCASE_CONTEXT_OWNER_ID,
  SHOWCASE_CONVENTION_PENDING,
  SHOWCASE_CI_RUNS,
  SHOWCASE_CI_REPOS,
  SHOWCASE_CI_FILES,
  SHOWCASE_CI_AGENT,
} from "./constants";
import {
  SHOWCASE_MULTI_ESTIMATES,
  SHOWCASE_MULTI_AGENTS,
  SHOWCASE_MULTI_GROUPS,
} from "./constants";

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={s.group}>
      <SectionLabel>{title}</SectionLabel>
      <div style={s.groupRow}>{children}</div>
    </section>
  );
}

export function Gallery() {
  const [toggle, setToggle] = React.useState(true);
  const [check, setCheck] = React.useState(true);
  const [tab, setTab] = React.useState("a");
  const [text, setText] = React.useState("");
  const [sel, setSel] = React.useState("gpt-4.1");
  const [drawer, setDrawer] = React.useState(false);
  const [modal, setModal] = React.useState(false);
  const [skillDrawer, setSkillDrawer] = React.useState(false);
  const [confirm, setConfirm] = React.useState(false);
  const [evalModal, setEvalModal] = React.useState(false);
  // ConventionCard owns its accept/reject/edit mutations, so the gallery needs a
  // query client of its own — nothing here ever reaches the network.
  const [galleryQc] = React.useState(() => new QueryClient());
  // AttachmentsEditor reads through hooks: a client of its own, seeded and never
  // stale, so it renders from static data and no request leaves the gallery.
  const [contextQc] = React.useState(() => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    qc.setQueryData(contextKeys.list(SHOWCASE_CONTEXT_REPO_ID), {
      has_clone: true,
      truncated: false,
      documents: SHOWCASE_CONTEXT_DOCS,
    });
    qc.setQueryData(
      contextKeys.attachments("agent", SHOWCASE_CONTEXT_OWNER_ID, SHOWCASE_CONTEXT_REPO_ID),
      SHOWCASE_CONTEXT_ATTACHMENTS,
    );
    for (const path of ["docs/architecture.md", "specs/checkout/spec.md"]) {
      qc.setQueryData(contextKeys.document(SHOWCASE_CONTEXT_REPO_ID, path), {
        path,
        content: SHOWCASE_CONTEXT_MARKDOWN,
      });
    }
    return qc;
  });

  // ExportWizard reads the repos through a hook: a client of its own with the list seeded and
  // never stale, so it renders the Preview step from fixtures and no request leaves the gallery.
  const [ciQc] = React.useState(() => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    qc.setQueryData(["repos"], SHOWCASE_CI_REPOS);
    return qc;
  });

  return (
    <div style={s.gallery}>
      <Group title="Buttons">
        <Button kind="primary" icon="Sparkles">
          Primary
        </Button>
        <Button kind="secondary">Secondary</Button>
        <Button kind="tertiary" active>
          Tertiary
        </Button>
        <Button kind="ghost" icon="Filter">
          Ghost
        </Button>
        <Button kind="danger" icon="Trash">
          Danger
        </Button>
        <Button kind="primary" size="sm" iconRight="ChevronDown">
          Small
        </Button>
        <IconBtn icon="RefreshCw" label="Refresh" />
        <IconBtn icon="Bell" label="Notifications" active />
      </Group>

      <Group title="Badges & Severity (icon + label, WCAG AA)">
        {SEVERITIES.map((sev) => (
          <SeverityBadge key={sev} severity={sev} count={3} />
        ))}
        <Badge icon="GitBranch">branch</Badge>
        <Badge dot color="var(--ok)" bg="transparent">
          synced
        </Badge>
        {CATEGORIES.map((c) => (
          <CategoryTag key={c} category={c} />
        ))}
      </Group>

      <Group title="Chips, Avatars, Confidence, MonoLink, Kbd">
        <Chip active icon="Check">
          Active
        </Chip>
        <Chip icon="Plus" count={4}>
          Add
        </Chip>
        <Avatar name="Ada Lovelace" />
        <Avatar name="you" size={28} />
        <ConfidenceNum value={0.91} />
        <ConfidenceNum value={0.6} />
        <MonoLink>src/config.ts:12</MonoLink>
        <Kbd>⌘K</Kbd>
        <Toggle on={toggle} onChange={setToggle} />
      </Group>

      <Group title="Run cost (compact · detailed · unpriced · large)">
        <RunCostBadge usd={0.014} />
        <RunCostBadge usd={0.014} tokens={formatTokenFlow(8200, 1300)} />
        <RunCostBadge usd={null} />
        <RunCostBadge usd={1.25} size="lg" />
        <RunCostBadge usd={0.0013} muted />
      </Group>

      <Group title="Progress & Score">
        <div style={s.w200}>
          <ProgressBar value={64} />
        </div>
        <div style={s.w220}>
          <PercentProgress value={42} label="Embedding chunks" />
        </div>
        <CircularScore score={82} />
        <CircularScore score={48} size={36} stroke={3.5} />
      </Group>

      <Group title="Cards & States">
        <Card style={s.w240}>
          <div style={s.cardTitle}>Card title</div>
          <div style={s.cardBody}>Elevated surface.</div>
        </Card>
        <div style={s.w280}>
          <EmptyState icon="GitPullRequest" title="No pull requests" body="Refresh to sync from GitHub." cta="Add repo" />
        </div>
        <div style={s.w300}>
          <ErrorState title="Engine unreachable" body="Is the API running on :3001?" onRetry={() => {}} />
        </div>
        <div style={s.skeletonStack}>
          <Skeleton height={16} />
          <Skeleton height={16} width="70%" />
          <Skeleton height={40} />
        </div>
      </Group>

      <Group title="Markdown">
        <div style={s.w420}>
          <Markdown>{"A finding with **bold**, `inline code`, and a [link](https://example.com).\n\n- one\n- two"}</Markdown>
        </div>
      </Group>

      <Group title="Form controls (real, controlled)">
        <div style={s.w280}>
          <FormField label="API key" hint="Stored locally." required>
            <TextInput value={text} onChange={setText} mono placeholder="sk-…" />
          </FormField>
        </div>
        <div style={s.w220}>
          <FormField label="Model">
            <SelectInput value={sel} onChange={setSel} options={[...MODEL_OPTIONS]} />
          </FormField>
        </div>
        <div style={s.w280}>
          <FormField label="Notes">
            <Textarea value={text} onChange={setText} placeholder="Free text…" rows={3} />
          </FormField>
        </div>
        <Checkbox checked={check} onChange={setCheck} label="On new PR" />
      </Group>

      <Group title="Tabs / Dropdown / Overlays">
        <div style={s.w360}>
          <Tabs
            value={tab}
            onChange={setTab}
            pad="0"
            tabs={[
              { key: "a", label: "Config", icon: "Settings" },
              { key: "b", label: "Skills", icon: "Sparkles", count: 3 },
              { key: "c", label: "Evals", icon: "FlaskConical" },
            ]}
          />
        </div>
        <Dropdown
          trigger={<Button kind="secondary" iconRight="ChevronDown">Menu</Button>}
          items={[
            { label: "Run all", icon: "Play" },
            { divider: true },
            { label: "Configure…", icon: "Settings", muted: true },
          ]}
        />
        <Button kind="ghost" onClick={() => setDrawer(true)}>
          Open Drawer
        </Button>
        <Button kind="ghost" onClick={() => setModal(true)}>
          Open Modal
        </Button>
      </Group>

      <Group title="Charts (Recharts)">
        <Sparkline data={[3, 5, 2, 8, 6, 9, 7]} />
        <div style={s.w360}>
          <LineChart
            series={[
              { name: "recall", color: "var(--accent)", data: [0.7, 0.74, 0.8, 0.78, 0.85, 0.9] },
              { name: "precision", color: "var(--ok)", data: [0.65, 0.7, 0.72, 0.8, 0.82, 0.88] },
            ]}
            h={160}
          />
        </div>
        <Donut
          segments={[
            { label: "openai", value: 4.2, color: "var(--accent)" },
            { label: "anthropic", value: 2.1, color: "var(--ok)" },
          ]}
        />
        <div style={s.w320}>
          <BarRow label="security-agent" value={42} max={60} suffix="42" />
          <BarRow label="perf-agent" value={28} max={60} color="var(--ok)" suffix="28" />
        </div>
        <div style={s.w200}>
          <MetricCard label="ACCEPT RATE" value="68" suffix="%" delta={0.04} trend={[0.6, 0.62, 0.65, 0.68]} />
        </div>
      </Group>

      <Group title="Shared (LiveLog / Wizard steps / Auto-trigger)">
        <div style={s.w460}>
          <LiveLogStream
            height={120}
            log={[
              { t: "0.1", k: "info", m: "assembling prompt" },
              { t: "0.4", k: "tool", m: "grep_repo(rate.limit)" },
              { t: "1.2", k: "result", m: "3 findings" },
              { t: "1.3", k: "error", m: "citation rejected: src/x.ts:9" },
            ]}
          />
        </div>
        <div style={s.w460}>
          <ExportWizardSteps step={1} labels={["Target", "Preview", "Configure", "Install"]} />
        </div>
        <AutoTriggerStatus on />
        <AutoTriggerStatus on={false} />
      </Group>

      {/* Skills Lab components. They speak the `skills` namespace, so the group
          brings its own message provider — the gallery itself has none. */}
      <NextIntlClientProvider locale="en" messages={{ skills: skillMessages }}>
        <Group title="Skills Lab (SkillCard / SkillPreviewDrawer / ConfirmDialog)">
          <div style={s.w320}>
            <SkillCard skill={SHOWCASE_SKILL} onToggle={() => {}} onDelete={() => {}} onOpen={() => {}} />
          </div>
          <div style={s.w320}>
            <SkillCard skill={{ ...SHOWCASE_SKILL, id: "sk-demo-2", enabled: false, source: "imported_file" }} />
          </div>
          <Button kind="ghost" onClick={() => setSkillDrawer(true)}>
            Open Skill preview
          </Button>
          <Button kind="ghost" onClick={() => setConfirm(true)}>
            Open Confirm dialog
          </Button>
        </Group>
        {skillDrawer && (
          <SkillPreviewDrawer
            skill={SHOWCASE_SKILL}
            onOpen={() => setSkillDrawer(false)}
            onClose={() => setSkillDrawer(false)}
          />
        )}
      </NextIntlClientProvider>

      {/* Conventions Extractor card. It speaks the `conventions` namespace and
          owns its own mutations, so the group brings both providers. */}
      <QueryClientProvider client={galleryQc}>
        <NextIntlClientProvider locale="en" messages={{ conventions: conventionMessages }}>
          <Group title="Conventions (ConventionCard)">
            <div style={s.w460}>
              <ConventionCard
                candidate={SHOWCASE_CONVENTION}
                repoId="repo-demo"
                repoFullName="acme/payments-api"
                defaultBranch="main"
              />
            </div>
            <div style={s.w460}>
              <ConventionCard
                candidate={SHOWCASE_CONVENTION_PENDING}
                repoId="repo-demo"
                repoFullName="acme/payments-api"
                defaultBranch="main"
              />
            </div>
          </Group>
        </NextIntlClientProvider>
      </QueryClientProvider>

      {/* Project Context: the attach list and the read-only preview. Both are
          presentational and speak the `context` namespace. */}
      <NextIntlClientProvider locale="en" messages={{ context: contextMessages }}>
        <Group title="Project Context (DocPicker / DocPreview)">
          <div style={s.w460}>
            <DocPicker
              documents={SHOWCASE_CONTEXT_DOCS}
              attached={["docs/architecture.md"]}
              effective={SHOWCASE_CONTEXT_EFFECTIVE}
              truncated={false}
              selectedPath="docs/architecture.md"
              onToggle={() => {}}
              onMove={() => {}}
              onSelect={() => {}}
            />
          </div>
          <div style={s.w460}>
            <DocPreview
              status="ready"
              path="docs/architecture.md"
              content={SHOWCASE_CONTEXT_MARKDOWN}
              onRetry={() => {}}
            />
          </div>
        </Group>
        <QueryClientProvider client={contextQc}>
          <RepoCtx.Provider
            value={{
              repoId: SHOWCASE_CONTEXT_REPO_ID,
              setRepoId: () => {},
              repos: [],
              activeRepo: null,
              reposLoaded: true,
            }}
          >
            <Group title="Project Context (AttachmentsEditor)">
              <div style={s.w460}>
                <AttachmentsEditor owner="agent" ownerId={SHOWCASE_CONTEXT_OWNER_ID} />
              </div>
            </Group>
          </RepoCtx.Provider>
        </QueryClientProvider>
      </NextIntlClientProvider>

      {/* Smart Diff: file card with review findings, and the role group header.
          Both are presentational (the finding card arrives as a render prop). */}
      <NextIntlClientProvider locale="en" messages={{ prReview: prReviewMessages, shell: shellMessages }}>
        <Group title="Smart Diff (FileCard with findings / DiffRoleGroup)">
          <div style={s.w460}>
            <FileCard
              file={SHOWCASE_DIFF_FILE}
              hasFindings
              findings={{
                findings: [SHOWCASE_FINDING, SHOWCASE_FINDING_OUTSIDE],
                renderFinding: (f) => <FindingCard f={f} defaultExpanded />,
              }}
            />
          </div>
          <div style={s.w460}>
            <DiffRoleGroup
              role="core"
              label={prReviewMessages.smartDiff.coreLabel}
              hint={prReviewMessages.smartDiff.coreHint}
              fileCount={3}
              filesWithFindings={2}
            >
              <div>Group body</div>
            </DiffRoleGroup>
            <DiffRoleGroup
              role="docs"
              label={prReviewMessages.smartDiff.docsLabel}
              hint={prReviewMessages.smartDiff.docsHint}
              fileCount={1}
              filesWithFindings={0}
              defaultOpen={false}
            />
            <DiffRoleGroup
              role="wiring"
              label={prReviewMessages.smartDiff.wiringLabel}
              hint={prReviewMessages.smartDiff.wiringHint}
              fileCount={0}
              filesWithFindings={0}
            />
          </div>
        </Group>
      </NextIntlClientProvider>

      {/* Blast radius: presentational, fed fixtures — no QueryClient needed. */}
      <NextIntlClientProvider locale="en" messages={{ blast: blastMessages }}>
        <Group title="Blast radius (map / incomplete index)">
          <div style={s.w460}>
            <BlastRadius blast={SHOWCASE_BLAST} repoFullName="acme/shop" headSha="abc1234" />
          </div>
          <div style={s.w460}>
            <BlastRadius
              blast={{ ...SHOWCASE_BLAST, degraded: true, reason: "index_partial" }}
              repoFullName={null}
              headSha="abc1234"
            />
          </div>
        </Group>
      </NextIntlClientProvider>

      {/* PR Brief: presentational, fed a fixture — needs only the intl provider. */}
      <NextIntlClientProvider locale="en" messages={{ brief: briefMessages, intent: intentMessages }}>
        <Group title="PR Brief (stored / generating)">
          <div style={s.w460}>
            <PrBriefBlock
              status="ready"
              brief={SHOWCASE_BRIEF}
              headSha="def5678"
              prFilePaths={new Set(["src/items.ts"])}
              generating={false}
              generateError={null}
              onGenerate={() => {}}
              onRetryLoad={() => {}}
              onOpenFile={() => {}}
              intent={<IntentCard intent={SHOWCASE_INTENT} isLoading={false} isError={false} onRetry={() => {}} onRecalculate={() => {}} isRecalculating={false} recalcError={null} />}
              noIntent={false}
            />
          </div>
          <div style={s.w460}>
            <PrBriefBlock
              status="ready"
              brief={null}
              headSha="def5678"
              prFilePaths={new Set()}
              generating
              generateError={null}
              onGenerate={() => {}}
              onRetryLoad={() => {}}
              onOpenFile={() => {}}
              noIntent
            />
          </div>
        </Group>
      </NextIntlClientProvider>

      {/* Intent layer card: presentational, shown in its four variants. */}
      <NextIntlClientProvider locale="en" messages={{ intent: intentMessages }}>
        <Group title="Intent (IntentCard: loaded / empty / generating / error)">
          <div style={s.w460}>
            <IntentCard intent={SHOWCASE_INTENT} isLoading={false} isError={false} onRetry={() => {}} onRecalculate={() => {}} isRecalculating={false} recalcError={null} />
          </div>
          <div style={s.w460}>
            <IntentCard intent={null} isLoading={false} isError={false} onRetry={() => {}} onRecalculate={() => {}} isRecalculating={false} recalcError={null} />
          </div>
          <div style={s.w460}>
            <IntentCard intent={SHOWCASE_INTENT} isLoading={false} isError={false} onRetry={() => {}} onRecalculate={() => {}} isRecalculating={true} recalcError={null} />
          </div>
          <div style={s.w460}>
            <IntentCard intent={SHOWCASE_INTENT} isLoading={false} isError={false} onRetry={() => {}} onRecalculate={() => {}} isRecalculating={false} recalcError={new ApiError("out of credit", 402, "llm_payment_required")} />
          </div>
          <div style={s.w460}>
            <IntentCard intent={undefined} isLoading={false} isError={true} onRetry={() => {}} onRecalculate={() => {}} isRecalculating={false} recalcError={null} />
          </div>
        </Group>
      </NextIntlClientProvider>

      {/* Eval pipeline: shared metrics tiles and run table. Presentational, `eval` namespace. */}
      <NextIntlClientProvider locale="en" messages={{ eval: evalMessages }}>
        <Group title="Evals (EvalMetrics / EvalRunTable / EvalSingleRunResult / EvalCaseModal)">
          <EvalMetrics run={SHOWCASE_EVAL_RUNS[0]!} />
          <EvalMetrics run={SHOWCASE_EVAL_RUNS[1]!} />
          <div style={s.w460}>
            <EvalRunTable runs={SHOWCASE_EVAL_RUNS} showAgent selectable selected={["er-1"]} onToggle={() => {}} />
          </div>
          <div style={s.w460}>
            {SHOWCASE_EVAL_SINGLE_RUNS.map((r) => (
              <EvalSingleRunResult key={r.status} result={r} expectationType="must_find" />
            ))}
          </div>
          <Button kind="ghost" onClick={() => setEvalModal(true)}>
            Open Eval case modal
          </Button>
        </Group>
      </NextIntlClientProvider>

      {/* Export to CI: the shared runs table. Presentational, `ci` namespace, no hooks. */}
      <NextIntlClientProvider locale="en" messages={{ ci: ciMessages }}>
        <Group title="CI runs (CiRunsTable)">
          <div style={s.w460}>
            <CiRunsTable runs={SHOWCASE_CI_RUNS} />
          </div>
        </Group>
        <QueryClientProvider client={ciQc}>
          <Group title="CI export (ExportWizard, Preview step)">
            <div style={s.w460}>
              <ExportWizard
                agent={SHOWCASE_CI_AGENT}
                onClose={() => {}}
                initial={{ step: 1, repoId: SHOWCASE_CI_REPOS[0]!.id, files: SHOWCASE_CI_FILES }}
              />
            </div>
          </Group>
        </QueryClientProvider>
      </NextIntlClientProvider>

      {/* Multi-agent review: presentational pieces on fixtures; hooks they call never fire a request. */}
      <NextIntlClientProvider
        locale="en"
        messages={{ multiAgent: multiAgentMessages, prReview: prReviewMessages, eval: evalMessages }}
      >
        <QueryClientProvider client={galleryQc}>
          <Group title="Multi-agent (MultiAgentPicker)">
            <div style={s.w460}>
              <MultiAgentPicker
                estimates={SHOWCASE_MULTI_ESTIMATES}
                loading={false}
                selected={["ma-1", "ma-2"]}
                onChange={() => {}}
                onLaunch={() => {}}
                launching={false}
                error={null}
              />
            </div>
          </Group>
          <Group title="Multi-agent (AgentColumns / FindingGroups / DisagreementsSection)">
            <div style={s.w460}>
              <AgentColumns agents={SHOWCASE_MULTI_AGENTS} prNumber={21} />
            </div>
            <div style={s.w460}>
              <FindingGroups groups={SHOWCASE_MULTI_GROUPS} agents={SHOWCASE_MULTI_AGENTS} multiRunId="mm-demo" />
            </div>
            <div style={s.w460}>
              <DisagreementsSection groups={SHOWCASE_MULTI_GROUPS} agents={SHOWCASE_MULTI_AGENTS} />
            </div>
          </Group>
        </QueryClientProvider>
      </NextIntlClientProvider>

      {evalModal && (
        <NextIntlClientProvider locale="en" messages={{ eval: evalMessages }}>
          <EvalCaseModal
            draft={SHOWCASE_EVAL_DRAFT}
            result={SHOWCASE_EVAL_SINGLE_RUNS[0]}
            onSave={() => setEvalModal(false)}
            onRun={() => {}}
            onCancel={() => setEvalModal(false)}
          />
        </NextIntlClientProvider>
      )}

      {confirm && (
        <ConfirmDialog
          title="Delete skill"
          body='Delete "test-quality-rubric"? This cannot be undone.'
          confirmLabel="Delete"
          cancelLabel="Cancel"
          onConfirm={() => setConfirm(false)}
          onClose={() => setConfirm(false)}
        />
      )}

      {drawer && (
        <Drawer title="Example Drawer" subtitle="720px wide" onClose={() => setDrawer(false)}>
          <p style={s.drawerBody}>Drawer body content.</p>
        </Drawer>
      )}
      {modal && (
        <Modal title="Example Modal" subtitle="centered" onClose={() => setModal(false)} width={480}>
          <div style={s.modalBody}>Modal body content.</div>
        </Modal>
      )}
    </div>
  );
}
