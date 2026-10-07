/* DevDigest — homework #2 demo screencast.
 *
 * Drives the live studio (:3000 / :3001) through five scenes and writes
 *   docs/hw2/hw2-demo.mp4   H.264, 1440x900
 *   docs/hw2/scenes.json    { scenes: [{ scene, title, start_ms }], total_ms }
 *
 *   node docs/hw2/record-hw2.mjs          record
 *   node docs/hw2/record-hw2.mjs --dry    same clicks, no video, no scenes.json
 *
 * Dependencies are NOT installed here: Playwright, ffmpeg-static and the cursor
 * overlay come from the HW1 rig in "Claude outputs/screencast" (git-ignored).
 *
 * Two steps wait on a model (the conventions scan, the review run). Those waits
 * are filmed but cut out of the mp4, so `start_ms` / `total_ms` are positions on
 * the CUT timeline — the one the voice-over is mixed against.
 */
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, statSync, writeFileSync, renameSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const RIG = join(ROOT, "Claude outputs", "screencast");
if (!existsSync(join(RIG, "node_modules", "playwright"))) {
  console.error(`\n✗ the HW1 rig is missing: ${RIG} (run npm ci there)\n`);
  process.exit(1);
}

const require = createRequire(join(RIG, "package.json"));
const { chromium } = require("playwright");
const ffmpegPath = require("ffmpeg-static");

const DRY = process.argv.includes("--dry");
/* Debug aid for dry runs: start at scene N (the earlier ones change live data). */
const FROM = Number((process.argv.find((x) => x.startsWith("--from=")) ?? "--from=1").slice(7));
/* Debug aid for dry runs: skip Run Review and treat an existing run as the new one. */
const REUSE_RUN = (process.argv.find((x) => x.startsWith("--reuse-run=")) ?? "").slice(12) || null;
if ((FROM > 1 || REUSE_RUN) && !DRY) {
  console.error("\n✗ --from / --reuse-run only work with --dry: a recording needs every scene\n");
  process.exit(1);
}
const VIDEO_DIR = join(HERE, ".video-raw");
const OUT_MP4 = join(HERE, "hw2-demo.mp4");
const SCENES_JSON = join(HERE, "scenes.json");

const CLIENT = "http://localhost:3000";
const API = "http://localhost:3001";
const REPO_FULL_NAME = "equalizer2k9/dev-digest";
const PR_NUMBER = 9;
const AGENT_NAME = "API Contract Reviewer";
const SKILL_NAME = "repo-conventions";
/* The earlier run on PR #9 with no skills attached (control experiment, run A). */
const NO_SKILLS_RUN = "01e2a66b-cc0b-4387-b729-d1682444c2d4";

const W = 1440;
const H = 900;
const FPS = 25;

/* Pacing: 1–2 s on every screen. */
const BEAT = 1000;
const STEP = 1400;
const HOLD = 2000;

const SCAN_TIMEOUT = 10 * 60_000;
const SCAN_ATTEMPTS = 5;
const RUN_TIMEOUT = 5 * 60_000;
/* What stays on screen around a cut-out wait. */
const KEEP_HEAD = 2500;
const KEEP_TAIL = 1200;

/** Fatal, but thrown rather than exit()-ed so `record()` can still undo the reorder. */
class Fatal extends Error {}
function die(msg) {
  throw new Fatal(msg);
}

async function api(path, init) {
  const res = await fetch(API + path, init);
  if (!res.ok) die(`${init?.method ?? "GET"} ${path} → HTTP ${res.status}`);
  return res.json();
}

/* ---------------------------------------------------------------- preflight */

async function preflight() {
  const repo = (await api("/repos")).find((r) => r.full_name === REPO_FULL_NAME);
  if (!repo) die(`repo ${REPO_FULL_NAME} is not imported`);

  const pr = (await api(`/repos/${repo.id}/pulls`)).find((p) => p.number === PR_NUMBER);
  if (!pr) die(`PR #${PR_NUMBER} is not imported`);
  const runs = await api(`/pulls/${pr.id}/runs`);
  if (!runs.some((r) => r.run_id === NO_SKILLS_RUN))
    die(`the no-skills run ${NO_SKILLS_RUN} is not on PR #${PR_NUMBER} any more`);
  if ((await api(`/pulls/${pr.id}/runs/active`)).length > 0)
    die(`PR #${PR_NUMBER} already has an active run — wait for it to finish`);

  const agent = (await api("/agents")).find((a) => a.name === AGENT_NAME);
  if (!agent) die(`agent "${AGENT_NAME}" does not exist`);
  const skills = await api("/skills");
  const skill = skills.find((s) => s.name === SKILL_NAME);
  if (!skill) die(`skill "${SKILL_NAME}" does not exist yet`);
  const links = (await api(`/agents/${agent.id}/skills`)).sort((a, b) => a.order - b.order);
  const order = links.map((l) => l.skill_id);
  if (!order.includes(skill.id)) die(`"${SKILL_NAME}" is not enabled on ${AGENT_NAME}`);
  if (order.length < 2) die(`${AGENT_NAME} needs two enabled skills to show a reorder`);

  const conventionsModel = (await api("/settings")).feature_models?.conventions?.model;
  if (!conventionsModel) die("Settings has no model for the Conventions feature");
  const scan = await api(`/repos/${repo.id}/conventions`);
  if (!scan.extracted_at) die("the repo was never scanned — ReScan is disabled until Run Scan ran once");

  const nameOf = (id) => skills.find((s) => s.id === id)?.name ?? id;
  console.log(`✓ repo ${repo.id} · PR #${PR_NUMBER} ${pr.id}`);
  console.log(`✓ ${AGENT_NAME}: ${order.map(nameOf).join(" → ")}`);
  console.log(`✓ ${SKILL_NAME} v${skill.version} · ${scan.candidates.length} candidates on the page`);
  console.log(`✓ models: conventions ${conventionsModel} · agent ${agent.model}`);
  return { repoId: repo.id, prId: pr.id, agentId: agent.id, skillId: skill.id, order, nameOf, conventionsModel };
}

/* ------------------------------------------------------------------ driving */

async function boxOf(locator, label) {
  if ((await locator.count()) === 0) die(`selector found nothing: ${label}`);
  const box = await locator.first().boundingBox();
  if (!box) die(`${label} has no layout box (hidden?)`);
  return box;
}

/** Never teleport: every move is interpolated so the overlay draws a path. */
async function glide(page, x, y) {
  await page.mouse.move(Math.round(x), Math.round(y), { steps: 22 });
}

/** Smooth scroll into view — a jump cut inside a scene reads as a glitch. */
async function show(page, locator, label, block = "center") {
  if ((await locator.count()) === 0) die(`selector found nothing: ${label}`);
  await locator.first().evaluate((el, blk) => el.scrollIntoView({ behavior: "smooth", block: blk }), block);
  await page.waitForTimeout(700);
}

async function glideTo(page, locator, label, dx = 0, dy = 0) {
  let b = await boxOf(locator, label);
  if (b.y < 0 || b.y + b.height > H) {
    await show(page, locator, label);
    b = await boxOf(locator, label);
  }
  await glide(page, b.x + b.width / 2 + dx, b.y + b.height / 2 + dy);
  return b;
}

async function clickAt(page, locator, label) {
  const b = await glideTo(page, locator, label);
  await page.waitForTimeout(300);
  await page.mouse.down();
  await page.waitForTimeout(140);
  await page.mouse.up();
  return b;
}

/* ---------------------------------------------------------------- recording */

async function record(ctx) {
  const { repoId, prId, agentId, skillId, order, nameOf, conventionsModel } = ctx;
  rmSync(VIDEO_DIR, { recursive: true, force: true });
  if (!DRY) mkdirSync(VIDEO_DIR, { recursive: true });

  const browser = await chromium.launch({ slowMo: 60 });

  /* Warm-up on a throwaway context: Next dev compiles a route on first hit, and
   * that stall must not end up in the take. */
  const warm = await browser.newContext({ viewport: { width: W, height: H } });
  const wp = await warm.newPage();
  for (const path of [
    `/repos/${repoId}/conventions`,
    "/skills",
    `/skills/${skillId}`,
    "/agents",
    `/agents/${agentId}?tab=skills`,
    `/repos/${repoId}/pulls/${PR_NUMBER}?tab=findings&trace=${NO_SKILLS_RUN}`,
    "/settings/models",
  ])
    await wp.goto(CLIENT + path, { waitUntil: "networkidle" });
  await warm.close();

  const context = await browser.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: 1,
    ...(DRY ? {} : { recordVideo: { dir: VIDEO_DIR, size: { width: W, height: H } } }),
  });
  await context.addInitScript({ path: join(RIG, "cursor-overlay.js") });
  /* A native HTML5 drag swallows mousemove, so the overlay would freeze for the
   * whole reorder. Follow `dragover` as well. */
  await context.addInitScript(() => {
    window.addEventListener(
      "dragover",
      (e) => {
        const el = document.getElementById("__dd_cursor__");
        if (el) el.style.transform = `translate(${e.clientX}px,${e.clientY}px) scale(0.62)`;
      },
      true,
    );
  });

  const page = await context.newPage();
  let take;
  try {
  if (FROM > 1) await page.goto(`${CLIENT}/skills`, { waitUntil: "networkidle" });
  const t0 = Date.now();
  const now = () => Date.now() - t0;

  const scenes = [];
  const cuts = [];
  const facts = {};
  const scene = (n, title) => {
    scenes.push({ scene: n, title, start_ms: now() });
    console.log(`▶ scene ${n} — ${title} @ ${(now() / 1000).toFixed(1)}s raw`);
  };
  /** Film a long wait, but mark its middle for removal from the mp4. */
  const cutWait = async (label, fn) => {
    const from = now();
    await fn();
    const to = now();
    if (to - from > KEEP_HEAD + KEEP_TAIL + 500) cuts.push({ label, from: from + KEEP_HEAD, to: to - KEEP_TAIL });
    console.log(`  … ${label}: ${((to - from) / 1000).toFixed(1)}s`);
  };

  /* ---- 1. Conventions: ReScan → cards → Accept / Reject / Edit → Create skill */
  if (FROM <= 1) {

  await page.goto(`${CLIENT}/repos/${repoId}/conventions`, { waitUntil: "networkidle" });
  scene(1, "Conventions: ReScan, curate, Create skill");
  await page.waitForTimeout(STEP);

  /* The model call behind a scan fails now and then (502). Retry on camera, but
   * inside the cut, so the take only keeps the click and the finished result. */
  const rescan = page.getByRole("button", { name: "ReScan", exact: true });
  const scanning = page.getByRole("button", { name: "Scanning…" });
  const scanFrom = now();
  let scanned = false;
  for (let attempt = 1; attempt <= SCAN_ATTEMPTS && !scanned; attempt++) {
    await clickAt(page, rescan, "ReScan button");
    await scanning.first().waitFor({ state: "visible", timeout: 10_000 }).catch(() => die("ReScan did not start a scan"));
    await scanning.first().waitFor({ state: "hidden", timeout: SCAN_TIMEOUT }).catch(() => die("the scan did not finish in time"));
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(BEAT);
    const failed = (await page.getByText("Scan failed").count()) > 0;
    const fresh = failed ? 0 : await page.locator('[data-testid="convention-card"][data-status="pending"]').count();
    /* The scene needs three undecided candidates: one to accept, reject and edit. */
    scanned = !failed && fresh >= 3;
    console.log(`  … scan attempt ${attempt}: ${failed ? "failed" : fresh + " pending"} @ ${(now() / 1000).toFixed(0)}s raw`);
  }
  if (!scanned) die(`no scan out of ${SCAN_ATTEMPTS} gave three pending candidates — see the page`);
  cuts.push({ label: "conventions scan", from: scanFrom + KEEP_HEAD, to: now() - KEEP_TAIL });
  facts.scan_seconds = Math.round((now() - scanFrom) / 1000);

  const cards = page.locator('[data-testid="convention-card"]');
  const pending = page.locator('[data-testid="convention-card"][data-status="pending"]');
  const rules = await pending.locator('[data-testid="convention-rule"]').allInnerTexts();
  facts.pending_after_scan = rules.length;
  console.log(`  ${await cards.count()} cards, ${rules.length} pending`);

  /* Accept a real code rule, reject a compiler-option one when there is a choice. */
  const isConfig = (r) => /tsconfig|eslint|prettier/i.test(r);
  const acceptRule = rules.find((r) => !isConfig(r)) ?? rules[0];
  const rejectRule = rules.find((r) => r !== acceptRule && isConfig(r)) ?? rules.find((r) => r !== acceptRule);
  const editRule = rules.find((r) => r !== acceptRule && r !== rejectRule);
  const cardOf = (rule) => cards.filter({ has: page.getByText(rule, { exact: true }) });

  /* What a card carries: rule, evidence file:line, confidence. */
  const first = cardOf(acceptRule);
  await show(page, first, "candidate card");
  await glideTo(page, first.locator('[data-testid="convention-rule"]'), "rule text");
  await page.waitForTimeout(STEP);
  await glideTo(page, first.locator("a").first(), "evidence file:line");
  await page.waitForTimeout(STEP);
  await glideTo(page, first.getByText("Confidence", { exact: true }), "confidence", 40, 0);
  await page.waitForTimeout(STEP);

  await clickAt(page, first.getByRole("button", { name: "Accept", exact: true }), "Accept");
  await first.getByRole("button", { name: "Accepted", exact: true }).waitFor({ timeout: 8000 }).catch(() => die("Accept did not stick"));
  await page.waitForTimeout(STEP);

  const rejected = cardOf(rejectRule);
  await show(page, rejected, "card to reject");
  await clickAt(page, rejected.getByRole("button", { name: "Reject", exact: true }), "Reject");
  await rejected.first().waitFor({ state: "detached", timeout: 8000 }).catch(() => die("Reject did not remove the card"));
  await page.waitForTimeout(STEP);

  const edited = cardOf(editRule);
  await show(page, edited, "card to edit");
  await clickAt(page, edited.getByRole("button", { name: "Edit", exact: true }), "Edit");
  /* Once the card is in edit mode its rule <div> is gone, so address it by the textarea. */
  const editing = cards.filter({ has: page.locator("textarea") });
  const ruleBox = editing.locator("textarea");
  await ruleBox.waitFor({ timeout: 5000 }).catch(() => die("Edit did not open the inline editor"));
  await glideTo(page, ruleBox, "inline rule editor");
  await page.waitForTimeout(BEAT);
  const newRule = editRule.replace(/\.\s*$/, "") + " — applies to new code as well.";
  await ruleBox.fill(newRule);
  await page.waitForTimeout(STEP);
  await clickAt(page, editing.getByRole("button", { name: "Save", exact: true }), "Save edit");
  await cardOf(newRule).first().waitFor({ timeout: 8000 }).catch(() => die("the edited rule did not show up on the card"));
  await page.waitForTimeout(STEP);

  const createBtn = page.getByRole("button", { name: "Create skill", exact: true });
  await show(page, createBtn, "Create skill button");
  await clickAt(page, createBtn, "Create skill button");
  const modal = page.getByRole("dialog");
  const nameField = modal.getByLabel("Name", { exact: true });
  await nameField.waitFor({ timeout: 15_000 }).catch(() => die("the Create skill modal did not load its draft"));
  if ((await nameField.inputValue()) !== SKILL_NAME) await nameField.fill(SKILL_NAME);
  await glideTo(page, nameField, "skill name field");
  await page.waitForTimeout(STEP);

  /* The body is editable: type into it, then take the words back out so the
   * saved skill is exactly the merged draft. */
  const bodyField = modal.getByLabel("Skill body", { exact: true });
  await clickAt(page, bodyField, "skill body field");
  await page.keyboard.press("Control+End");
  const scratch = " Edited before saving.";
  await page.keyboard.type(scratch, { delay: 35 });
  await page.waitForTimeout(BEAT);
  for (let i = 0; i < scratch.length; i++) await page.keyboard.press("Backspace");
  await page.waitForTimeout(BEAT);

  await clickAt(page, modal.getByRole("button", { name: "Create skill", exact: true }), "Create skill (submit)");
  await page.getByText(/created from/).first().waitFor({ timeout: 15_000 }).catch(() => die("the skill was not created"));
  await page.waitForTimeout(HOLD);
  }

  /* ---- 2. Skills: card → side preview → skill page (Preview, Versioning, Diff) */
  if (FROM <= 2) {

  await clickAt(page, page.getByRole("link", { name: "Skills", exact: true }), "Skills in the sidebar");
  await page.waitForURL(/\/skills$/, { timeout: 10_000 });
  await page.waitForLoadState("networkidle");
  scene(2, "Skills: repo-conventions card, preview, versions");
  await page.waitForTimeout(BEAT);

  const card = page.locator(`[data-testid="skill-card-${skillId}"]`);
  await show(page, card, "repo-conventions card");
  await glideTo(page, card.getByText(SKILL_NAME, { exact: true }), "skill name on the card");
  await page.waitForTimeout(BEAT);
  await glideTo(page, card.getByText(/^v\d+$/), "version badge");
  await page.waitForTimeout(BEAT);
  await glideTo(page, card.getByText(/\d+ agents?$/), "agent count");
  await page.waitForTimeout(STEP);

  await clickAt(page, card.getByText(SKILL_NAME, { exact: true }), "repo-conventions card");
  const openBtn = page.getByRole("button", { name: "Open →", exact: true });
  await openBtn.waitFor({ timeout: 8000 }).catch(() => die("the side preview did not open"));
  await page.waitForTimeout(HOLD);
  await clickAt(page, openBtn, "Open → in the preview");
  await page.waitForURL(new RegExp(`/skills/${skillId}`), { timeout: 10_000 });
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(STEP);

  await clickAt(page, page.getByRole("button", { name: "Preview", exact: true }), "Preview tab");
  await page.locator('[data-testid="skill-preview"]').waitFor({ timeout: 8000 });
  await page.waitForTimeout(HOLD);

  await clickAt(page, page.getByRole("button", { name: "Versioning", exact: true }), "Versioning tab");
  const versionRows = page.locator('[data-testid^="version-row-"]');
  await versionRows.first().waitFor({ timeout: 8000 });
  facts.skill_versions = await versionRows.count();
  await glideTo(page, versionRows.first(), "newest version row", -200, 0);
  await page.waitForTimeout(STEP);
  const diffBtn = page.getByRole("button", { name: "Diff", exact: true }).first();
  if ((await diffBtn.count()) === 0) die("no older version to diff against — the skill has a single version");
  await clickAt(page, diffBtn, "Diff button");
  await page.locator('[data-testid="version-diff"]').waitFor({ timeout: 8000 }).catch(() => die("the diff modal showed no diff"));
  await glide(page, W / 2, H / 2);
  await page.waitForTimeout(HOLD + 500);
  await clickAt(page, page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).last(), "Close diff");
  await page.waitForTimeout(BEAT);
  }

  /* ---- 3. Agents (SKILLS LAB) → API Contract Reviewer → Skills tab ---------- */
  if (FROM <= 3) {

  await glideTo(page, page.getByText("SKILLS LAB", { exact: true }), "SKILLS LAB section label");
  scene(3, "Agents: API Contract Reviewer, Skills tab, reorder");
  await page.waitForTimeout(BEAT);
  await clickAt(page, page.getByRole("link", { name: "Agents", exact: true }), "Agents in the sidebar");
  await page.waitForURL(/\/agents$/, { timeout: 10_000 });
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(STEP);

  await clickAt(page, page.getByText(AGENT_NAME, { exact: true }).first(), `${AGENT_NAME} card`);
  await page.waitForURL(new RegExp(`/agents/${agentId}`), { timeout: 10_000 });
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(BEAT);
  await clickAt(page, page.getByRole("button", { name: "Skills", exact: true }), "Skills tab");
  const rowOf = (id) => page.locator(`[data-testid="skill-row-${id}"]`);
  await rowOf(skillId).waitFor({ timeout: 8000 });
  await page.waitForTimeout(STEP);

  await glideTo(page, rowOf(order[0]), "first enabled skill row");
  await page.waitForTimeout(BEAT);
  await glideTo(page, rowOf(skillId).getByText(SKILL_NAME, { exact: true }), "repo-conventions row");
  await page.waitForTimeout(BEAT);
  await glideTo(page, rowOf(skillId).getByRole("switch"), "repo-conventions toggle");
  await page.waitForTimeout(STEP);

  const search = page.getByPlaceholder("Search skills by name…");
  await clickAt(page, search, "skill search");
  await page.keyboard.type("repo", { delay: 90 });
  await page.waitForTimeout(STEP);
  await search.fill("");
  await page.waitForTimeout(BEAT);

  /* Drag the last enabled skill onto the one above it. */
  const fromId = order[order.length - 1];
  const toId = order[order.length - 2];
  const handle = page.locator(`[data-testid="drag-handle-${fromId}"]`);
  const hb = await glideTo(page, handle, "drag handle");
  const tb = await boxOf(rowOf(toId), "drop target row");
  await page.waitForTimeout(500);
  await page.mouse.down();
  const sx = hb.x + hb.width / 2;
  const sy = hb.y + hb.height / 2;
  const ty = tb.y + tb.height / 2;
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(sx + 6, sy + ((ty - sy) * i) / 10, { steps: 2 });
    await page.waitForTimeout(70);
  }
  await page.waitForTimeout(250);
  await page.mouse.up();
  await page.waitForTimeout(900);

  const liveOrder = async () =>
    (await api(`/agents/${agentId}/skills`)).sort((a, b) => a.order - b.order).map((l) => l.skill_id);
  let after = await liveOrder();
  facts.reorder = "drag";
  if (after.join() === order.join()) {
    /* The native drag did not land — use the row's own Move up control instead. */
    facts.reorder = "move-up button";
    await clickAt(page, page.getByRole("button", { name: `Move ${nameOf(fromId)} up` }), "Move up");
    await page.waitForTimeout(900);
    after = await liveOrder();
  }
  if (after.join() === order.join()) die("the skill order did not change — neither drag nor Move up worked");
  await glideTo(page, rowOf(fromId), "moved skill row");
  await page.waitForTimeout(HOLD);
  }

  /* ---- 4. PR #9: Run Review → trace with the skills block → run without skills */
  if (FROM <= 4) {

  await clickAt(page, page.getByRole("link", { name: /Pull Requests/ }), "Pull Requests in the sidebar");
  await page.waitForURL(/\/pulls(\?|$)/, { timeout: 10_000 });
  await page.waitForLoadState("networkidle");
  scene(4, "PR #9: Run Review, skills block in the trace, run without skills");
  await page.waitForTimeout(BEAT);

  /* The list defaults to PRs that need review; #9 is already reviewed. */
  let prRow = page.getByText(`#${PR_NUMBER}`, { exact: true });
  if ((await prRow.count()) === 0) {
    await page.goto(`${CLIENT}/repos/${repoId}/pulls?status=all`, { waitUntil: "networkidle" });
    prRow = page.getByText(`#${PR_NUMBER}`, { exact: true });
  }
  await clickAt(page, prRow, `PR #${PR_NUMBER} row`);
  await page.waitForURL(new RegExp(`/pulls/${PR_NUMBER}\\b`), { timeout: 10_000 });
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(STEP);

  let runId = REUSE_RUN;
  if (!REUSE_RUN) {
    /* The PR detail renders only after the server refreshed it from GitHub. */
    const runReview = page.getByRole("button", { name: "Run Review", exact: true });
    await runReview.waitFor({ timeout: 30_000 }).catch(() => die("the PR page never showed Run Review"));
    await page.waitForTimeout(BEAT);
    await clickAt(page, runReview, "Run Review");
    const pick = page.getByRole("button", { name: new RegExp("^" + AGENT_NAME) });
    await pick.waitFor({ timeout: 5000 }).catch(() => die("the Run Review menu did not list the agent"));
    await page.waitForTimeout(BEAT);
    await clickAt(page, pick, `${AGENT_NAME} in the Run Review menu`);

    for (let i = 0; i < 20 && !runId; i++) {
      await page.waitForTimeout(500);
      runId = (await api(`/pulls/${prId}/runs/active`))[0]?.run_id ?? null;
    }
    if (!runId) die("Run Review did not start a run");
    await glide(page, W / 2, H / 2 + 80);
    await cutWait("review run", async () => {
      const deadline = Date.now() + RUN_TIMEOUT;
      for (;;) {
        const run = (await api(`/pulls/${prId}/runs`)).find((r) => r.run_id === runId);
        if (run?.status === "done") break;
        if (run && run.status !== "running") die(`the review run ended as "${run.status}": ${run.error ?? ""}`);
        if (Date.now() > deadline) die("the review run did not reach status done within 5 minutes");
        await page.waitForTimeout(2000);
      }
      /* Let the page swap the live log for the finished run. */
      await page.getByRole("button", { name: "Open run trace & logs" }).first().waitFor({ timeout: 30_000 });
      await page.waitForTimeout(1500);
    });
  }
  const newRun = (await api(`/pulls/${prId}/runs`)).find((r) => r.run_id === runId);
  facts.new_run = { run_id: runId, findings: newRun.findings_count, duration_ms: newRun.duration_ms };

  const agentRunsTab = page.getByRole("button", { name: /Agent runs/ });
  await clickAt(page, agentRunsTab, "Agent runs tab");
  await page.waitForTimeout(STEP);

  const drawer = page.getByRole("dialog");
  /** Open a run's trace from the Timeline and bring Prompt assembly into view. */
  const openTrace = async (id, label) => {
    const all = (await api(`/pulls/${prId}/runs`)).sort((a, b) => Date.parse(b.ran_at) - Date.parse(a.ran_at));
    const idx = all.findIndex((r) => r.run_id === id);
    const btn = page.getByRole("button", { name: "Open run trace & logs" }).nth(idx);
    await show(page, btn, `trace button of ${label}`);
    await clickAt(page, btn, `trace button of ${label}`);
    await drawer.waitFor({ state: "visible", timeout: 8000 }).catch(() => die("the trace drawer never opened"));
    await page.waitForTimeout(600);
    if (!page.url().includes(`trace=${id}`)) die(`the trace drawer opened another run than ${label}: ${page.url()}`);
    const assembly = drawer.getByText("Prompt assembly", { exact: true });
    await assembly.waitFor({ timeout: 8000 });
    await glideTo(page, drawer.getByText("FINDINGS", { exact: true }), "FINDINGS stat", 0, 22);
    await page.waitForTimeout(STEP);
    if ((await drawer.getByText(/^User \/ diff/).count()) === 0) await clickAt(page, assembly, "Prompt assembly header");
    await show(page, assembly, "Prompt assembly", "start");
    await glideTo(page, assembly, "Prompt assembly");
    await page.waitForTimeout(BEAT);
  };

  await openTrace(runId, "the new run");
  const skillsHead = drawer.getByText("Skills", { exact: true });
  if ((await skillsHead.count()) === 0) die("the new run's trace has no Skills block");
  await glideTo(page, skillsHead, "Skills block header");
  await page.waitForTimeout(BEAT);
  const tokenLabels = drawer.getByText(/^\d+ tokens$/);
  facts.skill_token_labels = await tokenLabels.allInnerTexts();
  await glideTo(page, tokenLabels.first(), "skills block token total");
  await page.waitForTimeout(STEP);
  await glideTo(page, tokenLabels.last(), "last skill's tokens");
  await page.waitForTimeout(HOLD);
  await clickAt(page, drawer.getByRole("button", { name: "Close", exact: true }).first(), "close the trace");
  await drawer.waitFor({ state: "hidden", timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(BEAT);

  await openTrace(NO_SKILLS_RUN, "the run without skills");
  if ((await drawer.getByText(/^\d+ tokens$/).count()) > 0) die("the no-skills run shows a Skills block");
  await glideTo(page, drawer.getByText(/^System/).first(), "System block (no Skills block follows)");
  await page.waitForTimeout(HOLD + 500);
  await clickAt(page, drawer.getByRole("button", { name: "Close", exact: true }).first(), "close the trace");
  await drawer.waitFor({ state: "hidden", timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(BEAT);
  }

  /* ---- 5. Settings → Feature Models → Conventions dropdown ------------------ */
  if (FROM <= 5) {

  await clickAt(page, page.getByRole("link", { name: "Settings", exact: true }), "Settings in the sidebar");
  await page.waitForURL(/\/settings/, { timeout: 10_000 });
  scene(5, "Settings: Feature Models, Conventions model dropdown");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(BEAT);
  await clickAt(page, page.getByRole("link", { name: "Feature Models", exact: true }), "Feature Models");
  await page.waitForURL(/\/settings\/models/, { timeout: 10_000 });
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(STEP);

  const convLabel = page.locator("label", { hasText: /^Conventions$/ });
  await glideTo(page, convLabel, "Conventions row label");
  await page.waitForTimeout(BEAT);
  const trigger = convLabel.locator("xpath=../..").locator("svg").first().locator("xpath=..");
  await clickAt(page, trigger, "Conventions model dropdown");
  const modelSearch = page.getByPlaceholder("Search models…");
  await modelSearch.waitFor({ timeout: 8000 }).catch(() => die("the model dropdown did not open"));
  await page.waitForTimeout(BEAT);
  /* Search for the vendor of the model that is set right now. */
  await page.keyboard.type(conventionsModel.split("/")[0], { delay: 90 });
  await page.waitForTimeout(STEP);
  const option = page.getByRole("button", { name: conventionsModel + " —" });
  if (await option.count()) await glideTo(page, option, "current model in the list");
  await page.waitForTimeout(HOLD);
  /* Close without changing the model. */
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  if (await modelSearch.isVisible().catch(() => false)) await page.mouse.click(W - 60, H - 60);
  await page.waitForTimeout(STEP);
  }

  const end = now();
  const video = page.video();
  await context.close();
  const closed = now();
  console.log(`✓ raw wall clock ${(end / 1000).toFixed(1)}s · facts ${JSON.stringify(facts)}`);
  take = { webm: video ? await video.path() : null, scenes, cuts, end, closed, facts };
  } finally {
    /* Put the prompt order back — the reorder was for the camera only — even
     * when a scene failed half-way. */
    await fetch(`${API}/agents/${agentId}/skills`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ skill_ids: order }),
    }).catch(() => console.error("⚠ could not restore the agent's skill order"));
    await browser.close().catch(() => {});
  }
  return take;
}

/* ---------------------------------------------------------------- transcode */

function probeSeconds(file) {
  let info = "";
  try {
    execFileSync(ffmpegPath, ["-hide_banner", "-i", file], { stdio: ["ignore", "ignore", "pipe"] });
  } catch (e) {
    info = (e.stderr ?? "").toString();
  }
  const m = info.match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null;
}

function encode(input, output, extraVideoArgs, filter) {
  execFileSync(
    ffmpegPath,
    ["-y", "-i", input, ...(filter ? ["-vf", filter] : []), "-an", "-c:v", "libx264", "-preset", "slow",
      ...extraVideoArgs, "-pix_fmt", "yuv420p", "-movflags", "+faststart", output],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
}

function finish({ webm, scenes, cuts, end, closed }) {
  if (!webm || !existsSync(webm)) die("no raw video was written");

  /* The recording starts with the page, a moment before t0, and ends at
   * context.close(): the raw length tells how far the two clocks are apart. */
  const rawSecs = probeSeconds(webm);
  if (rawSecs == null) die("could not read the raw video's duration");
  const lead = Math.max(0, Math.round(rawSecs * 1000 - closed));

  const scene1 = scenes[0].start_ms;
  /* Drop everything before scene 1, every marked wait, and the tail after `end`. */
  const drop = [{ from: -lead, to: scene1 }, ...cuts.map(({ from, to }) => ({ from, to })), { from: end, to: closed + 60_000 }];
  const sec = (ms) => ((ms + lead) / 1000).toFixed(3);
  const select = drop.map((d) => `between(t,${sec(d.from)},${sec(d.to)})`).join("+");
  const filter = `fps=${FPS},select='not(${select})',setpts=N/${FPS}/TB`;

  /* Same mapping for the markers: a wall-clock moment lands on the cut timeline
   * at its video time minus everything dropped before it. */
  const onCutTimeline = (ms) =>
    Math.round(ms + lead - drop.reduce((acc, d) => acc + Math.max(0, Math.min(ms, d.to) - d.from), 0));

  encode(webm, OUT_MP4, ["-crf", "21"], filter);
  let secs = probeSeconds(OUT_MP4);

  const fixed = scenes.map((s) => ({ ...s, start_ms: Math.max(0, onCutTimeline(s.start_ms)) }));
  const total = Math.round(secs * 1000);
  writeFileSync(SCENES_JSON, JSON.stringify({ scenes: fixed, total_ms: total }, null, 2) + "\n");

  let mb = statSync(OUT_MP4).size / 1048576;
  if (mb > 150) {
    /* Too heavy to hand in: re-encode to a bitrate that lands under 100 MB. */
    const kbps = Math.floor((95 * 8192) / secs);
    const tmp = OUT_MP4.replace(/\.mp4$/, ".small.mp4");
    encode(OUT_MP4, tmp, ["-b:v", `${kbps}k`, "-maxrate", `${kbps}k`, "-bufsize", `${kbps * 2}k`], null);
    renameSync(tmp, OUT_MP4);
    mb = statSync(OUT_MP4).size / 1048576;
    secs = probeSeconds(OUT_MP4);
  }
  rmSync(VIDEO_DIR, { recursive: true, force: true });

  console.log(`\n✓ ${OUT_MP4}`);
  console.log(`  ${W}x${H} · ${secs.toFixed(1)}s · ${mb.toFixed(1)} MB · cut out ${cuts.map((c) => `${c.label} ${((c.to - c.from) / 1000).toFixed(0)}s`).join(", ") || "nothing"}`);
  for (const s of fixed) console.log(`  scene ${s.scene} @ ${(s.start_ms / 1000).toFixed(1)}s — ${s.title}`);
  if (secs < 60 || secs > 180) console.log(`  ⚠ ${secs.toFixed(0)}s is outside the 1–3 minute target — adjust the pacing constants.`);
}

/* --------------------------------------------------------------------- main */

try {
  const ctx = await preflight();
  const take = await record(ctx);
  if (DRY) {
    const cutMs = take.cuts.reduce((a, c) => a + (c.to - c.from), 0);
    console.log(`✓ dry run ok · would be ~${((take.end - take.scenes[0].start_ms - cutMs) / 1000).toFixed(0)}s after cuts`);
  } else {
    finish(take);
  }
} catch (e) {
  if (!(e instanceof Fatal)) throw e;
  console.error("\n✗ " + e.message + "\n");
  process.exit(1);
}
