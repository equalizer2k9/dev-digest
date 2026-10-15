/* DevDigest — homework #5 demo screencast (PR Brief + Project Context Folder).
 *
 * Drives the live studio (:3000 / :3001) through the PR Brief of test PR #16, the
 * Project Context page and an agent's Context tab (with the mentor-review additions: the
 * "N of M attached" counter, the over-budget warning and a skill's "Serializes as" block —
 * ticked on camera on an agent and a skill that start empty, and unticked again), the stored review of test PR #19
 * whose finding cites an attached document, then the homework PR on GitHub, and
 * writes
 *   docs/hw5/hw5-demo.mp4        H.264, 1440x900, silent (git-ignored)
 *   docs/hw5/.demo-frames/*.png  one still per step, to eyeball the take
 *
 *   node docs/hw5/record-hw5.mjs
 *
 * The take CHANGES the stand once: step a presses "Generate brief" on PR #16, which
 * makes one real model call (Settings → Risk Brief) and stores a row in pr_brief.
 * The block must start empty, so delete PR #16's pr_brief row first; the preflight
 * refuses to start otherwise. PR #19's review is NOT re-run: the take shows the
 * stored run. If the generation fails the script stops — it never retries and never
 * switches the model.
 *
 * Dependencies are NOT installed here: Playwright, ffmpeg-static and the cursor
 * overlay come from the HW1 rig in "Claude outputs/screencast" (git-ignored).
 */
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
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

const VIDEO_DIR = join(HERE, ".video-raw");
const OUT_MP4 = join(HERE, "hw5-demo.mp4");
const FRAMES_DIR = join(HERE, ".demo-frames");

const CLIENT = "http://localhost:3000";
const API = "http://localhost:3001";

const REPO = "equalizer2k9/dev-digest";
const BRIEF_PR = 16;
const INVARIANT_PR = 19;
const MAIN_PR = 17;
const BRANCH = "feat/homework-5";
const AGENT = "General Reviewer";
/* Mentor review (SPEC-02 AC-37..AC-40): an agent with nothing attached and a skill, both left as found. */
const BUDGET_AGENT = "Test Quality Reviewer";
const BIG_DOCS = ["reviewer-core/docs/architecture.md", "client/specs/pages.md"]; // ≈ 10.5k tokens together
const SKILL = "edge-cases";
const SKILL_DOCS = ["docs/architecture/invariants.md", "client/specs/findings-column.md"]; // docs ticked first, specs second
const DOC = "docs/architecture/invariants.md";
const GITHUB_DOCS = [
  { path: "specs/pr-brief/spec.md", text: "Acceptance criteria" },
  { path: "specs/pr-brief/plan.md", text: "Traceability" },
  { path: "specs/project-context/spec.md", text: "Acceptance criteria" },
  { path: "specs/project-context/plan.md", text: "Traceability" },
  { path: "docs/hw5/plan-verification.md", text: "Matrix" },
  { path: "docs/hw5/plan-verification-pcf.md", text: "Live check" },
  { path: "docs/retros/ledger.md", text: "Workflow retro ledger" },
];
const CAPTION =
  "Модель отримує готові факти — intent, blast radius, статистику diff і прикріплені спеки — а не код diff: один дешевий виклик, перевірювані шляхи, без інструкцій з коду";

const W = 1440;
const H = 900;
const FPS = 25;

const BEAT = 900;
const STEP = 1300;
const HOLD = 2000;

class Fatal extends Error {}
function die(msg) {
  throw new Fatal(msg);
}

async function api(path) {
  const res = await fetch(API + path);
  if (!res.ok) die(`GET ${path} → HTTP ${res.status}`);
  return res.json();
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/* ---------------------------------------------------------------- preflight */

async function preflight() {
  const repo = (await api("/repos")).find((r) => r.full_name === REPO);
  if (!repo) die(`repo ${REPO} is not imported`);
  const pulls = await api(`/repos/${repo.id}/pulls`);
  const briefPr = pulls.find((p) => p.number === BRIEF_PR);
  const invPr = pulls.find((p) => p.number === INVARIANT_PR);
  if (!briefPr || !invPr) die(`PR #${BRIEF_PR} or #${INVARIANT_PR} of ${REPO} is not imported`);

  const index = await api(`/repos/${repo.id}/index-state`);
  if (index.status !== "full") die(`index of ${REPO} is ${index.status}, not full`);

  const { brief } = await api(`/pulls/${briefPr.id}/brief`);
  if (brief) die(`PR #${BRIEF_PR} already has a stored brief — delete its pr_brief row so the take starts at "Generate brief"`);
  const { intent } = await api(`/pulls/${briefPr.id}/intent`);
  if (!intent) die(`PR #${BRIEF_PR} has no stored intent — the Intent card would be empty`);
  const blast = await api(`/pulls/${briefPr.id}/blast`);
  if (blast.degraded || blast.downstream.flatMap((d) => d.callers).length < 1) die(`PR #${BRIEF_PR}: blast radius has no callers (${blast.summary})`);

  const docs = await api(`/repos/${repo.id}/context`);
  if (!docs.documents.some((d) => d.path === DOC)) die(`${DOC} is not in the clone — resync the repo`);
  const agent = (await api("/agents")).find((a) => a.name === AGENT);
  if (!agent) die(`agent "${AGENT}" not found`);
  const att = await api(`/agents/${agent.id}/context?repo_id=${repo.id}`);
  if (!att.attached.includes(DOC)) die(`${DOC} is not attached to "${AGENT}"`);

  const reviews = await api(`/pulls/${invPr.id}/reviews`);
  const cites = (reviews.items ?? reviews).some((r) => (r.findings ?? []).some((f) => (f.rationale ?? "").includes(DOC)));
  if (!cites) die(`PR #${INVARIANT_PR} has no stored finding citing ${DOC} — this take never runs a review`);

  const budgetAgent = (await api("/agents")).find((a) => a.name === BUDGET_AGENT);
  const skill = (await api("/skills")).find((x) => x.name === SKILL);
  if (!budgetAgent || !skill) die(`agent "${BUDGET_AGENT}" or skill "${SKILL}" not found`);
  for (const [kind, id] of [["agents", budgetAgent.id], ["skills", skill.id]]) {
    const c = await api(`/${kind}/${id}/context?repo_id=${repo.id}`);
    if (c.attached.length) die(`${kind}/${id} must start with no attached documents (has ${c.attached.length})`);
  }

  const fm = (await api("/settings")).feature_models?.risk_brief;
  console.log(`✓ #${BRIEF_PR} ${blast.summary} · intent stored · Risk Brief ${fm?.provider}/${fm?.model} · #${INVARIANT_PR} finding cites ${DOC}`);
  const base = `${CLIENT}/repos/${repo.id}`;
  return {
    repoId: repo.id,
    briefPrId: briefPr.id,
    briefUrl: `${base}/pulls/${BRIEF_PR}`,
    invUrl: `${base}/pulls/${INVARIANT_PR}`,
    contextUrl: `${base}/context`,
    agentUrl: `${CLIENT}/agents/${agent.id}?tab=context`,
    budgetAgentUrl: `${CLIENT}/agents/${budgetAgent.id}?tab=context`,
    skillUrl: `${CLIENT}/skills/${skill.id}`,
  };
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

async function glideTo(page, locator, label, dx = 0, dy = 0) {
  let b = await boxOf(locator, label);
  if (b.y < 120 || b.y + b.height > H - 20) {
    await locator.first().evaluate((el) => el.scrollIntoView({ behavior: "smooth", block: "center" }));
    await page.waitForTimeout(800);
    b = await boxOf(locator, label);
  }
  await glide(page, b.x + Math.min(b.width / 2, 400) + dx, b.y + b.height / 2 + dy);
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
  rmSync(VIDEO_DIR, { recursive: true, force: true });
  mkdirSync(VIDEO_DIR, { recursive: true });
  rmSync(FRAMES_DIR, { recursive: true, force: true });
  mkdirSync(FRAMES_DIR, { recursive: true });

  const browser = await chromium.launch({ slowMo: 60 });
  const github = (path) => `https://github.com/${REPO}/blob/${BRANCH}/${path}`;
  const mainPr = `https://github.com/${REPO}/pull/${MAIN_PR}`;

  /* Warm-up on a throwaway context: Next dev compiles a route on first hit and
   * GitHub pages load slower cold. It only reads — no generation here. */
  const warm = await browser.newContext({ viewport: { width: W, height: H } });
  const wp = await warm.newPage();
  await wp.goto(ctx.briefUrl, { waitUntil: "networkidle" });
  await wp.getByRole("button", { name: "Generate brief" }).waitFor({ timeout: 30_000 }).catch(() => die(`no "Generate brief" button on ${ctx.briefUrl}`));
  for (const u of [`${ctx.briefUrl}?tab=diff`, ctx.contextUrl, ctx.agentUrl, ctx.budgetAgentUrl, ctx.skillUrl, ctx.invUrl]) await wp.goto(u, { waitUntil: "networkidle" });
  for (const u of [mainPr, ...GITHUB_DOCS.map((d) => github(d.path))]) await wp.goto(u, { waitUntil: "domcontentloaded" });
  await warm.close();

  const context = await browser.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: 1,
    recordVideo: { dir: VIDEO_DIR, size: { width: W, height: H } },
  });
  await context.addInitScript({ path: join(RIG, "cursor-overlay.js") });

  const page = await context.newPage();
  let take;
  try {
    const t0 = Date.now();
    const now = () => Date.now() - t0;
    const scenes = [];
    const facts = {};
    const still = (name) => page.screenshot({ path: join(FRAMES_DIR, `${name}.png`) });
    const scene = (id, title) => {
      scenes.push({ scene: id, title, start_ms: now() });
      console.log(`▶ step ${id} — ${title} @ ${(now() / 1000).toFixed(1)}s raw`);
    };
    const text = (t) => page.getByText(t, { exact: false }).first();
    const overviewTab = page.getByRole("button", { name: /^Overview/ });
    const refresh = page.getByRole("button", { name: "Refresh brief" });
    const skeleton = page.locator('[data-testid="brief-skeleton"]');
    const briefBlock = page.locator("section").filter({ has: refresh });

    /* ---- a. PR #16 → Overview: Intent, Blast radius → Generate brief ------ */
    await page.goto(ctx.briefUrl, { waitUntil: "domcontentloaded" });
    const generate = page.getByRole("button", { name: "Generate brief" });
    await generate.waitFor({ timeout: 30_000 }).catch(() => die('the "Generate brief" button never rendered'));
    await page.waitForLoadState("networkidle");
    scene("a", `PR #${BRIEF_PR}: Intent, Blast radius, Generate brief`);
    await page.waitForTimeout(STEP);
    await glideTo(page, page.getByRole("button", { name: "Recalculate" }), "Intent card", -260, 40);
    await still("a1-intent");
    await page.waitForTimeout(HOLD);
    await glideTo(page, page.getByText(/^\d+ callers?$/).first(), "blast radius stats");
    await still("a2-blast-radius");
    await page.waitForTimeout(HOLD);
    await glideTo(page, generate, "Generate brief");
    await page.waitForTimeout(BEAT);
    await clickAt(page, generate, "Generate brief");
    await skeleton.waitFor({ timeout: 5_000 }).catch(() => die("no skeleton after the click"));
    await page.waitForTimeout(700);
    await still("a3-generating");

    /* One model call. A failure is shown in the block — stop, never retry. */
    const outcome = await Promise.race([
      refresh.waitFor({ timeout: 90_000 }).then(() => "ok").catch(() => "timeout"),
      text("The brief could not be generated.").waitFor({ timeout: 90_000 }).then(() => "failed").catch(() => "timeout"),
    ]);
    if (outcome !== "ok") die(`the generation did not produce a brief (${outcome}) — check the API log and Settings → Risk Brief`);
    await skeleton.waitFor({ state: "detached", timeout: 10_000 }).catch(() => {});
    facts.generation_ms = now() - scenes[0].start_ms;
    await page.waitForTimeout(BEAT);

    await glideTo(page, briefBlock.getByText(DOC), "attached document in the brief", 0, -30);
    await still("a4-summary-intent-document");
    await page.waitForTimeout(HOLD);
    await glideTo(page, briefBlock.getByText(DOC), "attached document in the brief");
    await page.waitForTimeout(STEP);
    await glideTo(page, briefBlock.locator("button[aria-expanded]").first(), "first risk");
    await still("a5-risk-areas");
    await page.waitForTimeout(HOLD);
    const focus = briefBlock.getByRole("button", { name: /^[\w./@-]+:\d+$/ }).first();
    if ((await focus.count()) === 0) die("the brief has no Review focus item in the PR's diff");
    facts.focus = (await focus.innerText()).trim();
    await glideTo(page, focus, "focus item");
    await still("a6-review-focus");
    await page.waitForTimeout(HOLD);

    /* ---- b. focus item → Files changed, line highlighted; back, reload ----- */
    scene("b", `${facts.focus} → Files changed; reload`);
    await clickAt(page, focus, "focus item");
    const lit = page.locator("[data-target-highlight]").first();
    await lit.waitFor({ timeout: 10_000 }).catch(() => die("no highlighted line on Files changed"));
    facts.highlighted = await lit.getAttribute("data-line-key");
    await still("b1-line-highlighted");
    await page.waitForTimeout(600);
    const lb = await lit.boundingBox();
    if (lb) await glide(page, lb.x + 520, lb.y + lb.height / 2);
    await page.waitForTimeout(HOLD);
    await clickAt(page, overviewTab, "Overview tab");
    await refresh.waitFor({ timeout: 10_000 }).catch(() => die("the brief is gone after returning to Overview"));
    await page.waitForTimeout(BEAT);
    await page.reload({ waitUntil: "domcontentloaded" });
    await refresh.waitFor({ timeout: 15_000 }).catch(() => die("no stored brief after the reload"));
    if ((await skeleton.count()) > 0) die("the reload started a generation");
    await page.waitForLoadState("networkidle");
    await glideTo(page, refresh, "Refresh brief", -220, 0);
    await still("b2-after-reload");
    await page.waitForTimeout(HOLD);

    /* ---- c. Project Context → preview; agent → Context tab ---------------- */
    scene("c", "Project Context: preview; agent Context tab");
    await page.goto(ctx.contextUrl, { waitUntil: "domcontentloaded" });
    const docButton = page.getByRole("button", { name: /^invariants\.md/ });
    await docButton.waitFor({ timeout: 15_000 }).catch(() => die(`${DOC} is not on the Project Context page`));
    await page.waitForTimeout(BEAT);
    await clickAt(page, docButton, "invariants.md");
    const docHeading = page.getByRole("heading", { name: "Architecture invariants" });
    await docHeading.waitFor({ timeout: 10_000 }).catch(() => die("the preview did not render the document"));
    await glideTo(page, docHeading, "preview heading", 0, 60);
    await still("c1-preview");
    await page.waitForTimeout(HOLD);
    /* The agent page has no repo in its path: the studio falls back to the
     * switcher's stored choice, which a fresh browser lacks — pick the repo the
     * way the switcher does. */
    await page.evaluate((id) => localStorage.setItem("dd-repo", id), ctx.repoId);
    await page.goto(ctx.agentUrl, { waitUntil: "domcontentloaded" });
    const attached = page.getByRole("checkbox", { name: `Attach ${DOC}` });
    await attached.waitFor({ timeout: 15_000 }).catch(() => die(`no ${DOC} row in the agent's Context tab`));
    await page.waitForTimeout(BEAT);
    await glideTo(page, attached, "attached document", 120, 0);
    await still("c2-agent-context-attached");
    await page.waitForTimeout(HOLD);
    const footer = page.getByText(/≈ [\d,]+ tokens · injected as untrusted/).first();
    await glideTo(page, footer, "token footer");
    facts.footer = (await footer.innerText()).trim();
    await still("c3-agent-context-tokens");
    await page.waitForTimeout(HOLD);

    /* ---- c'. mentor review: counter, budget warning, Serializes as ---------- */
    const counter = page.getByText(/^\d+ of \d+ attached$/).first();
    await glideTo(page, counter, "attached counter", 0, 0);
    facts.counter = (await counter.innerText()).trim();
    await still("c4-agent-counter");
    await page.waitForTimeout(HOLD);

    scene("c'", "mentor review: counter, budget warning, Serializes as");
    const tick = async (path) => {
      await clickAt(page, page.getByRole("checkbox", { name: `Attach ${path}` }), `tick ${path}`);
      await page.waitForTimeout(BEAT);
    };
    await page.goto(ctx.budgetAgentUrl, { waitUntil: "domcontentloaded" });
    await page.getByText(/^0 of \d+ attached$/).first().waitFor({ timeout: 15_000 }).catch(() => die(`${BUDGET_AGENT} does not start at "0 of N attached"`));
    await page.waitForLoadState("networkidle");
    for (const d of BIG_DOCS) await tick(d);
    const warning = page.getByText(/Over the [\d,]+-token section budget/).first();
    await warning.waitFor({ timeout: 10_000 }).catch(() => die("no budget warning after ticking ≈ 10.5k tokens"));
    await glideTo(page, page.getByText(/^2 of \d+ attached$/).first(), "counter 2 of N");
    await still("c5-counter-two-attached");
    await page.waitForTimeout(STEP);
    await glideTo(page, warning, "budget warning");
    await still("c6-budget-warning");
    await page.waitForTimeout(HOLD + BEAT);
    await page.getByText(/^2 of \d+ attached$/).first().evaluate((el) => el.scrollIntoView({ behavior: "smooth", block: "center" }));
    await page.waitForTimeout(800);
    for (const d of BIG_DOCS) await tick(d); // untick: the agent is left as found
    await page.getByText(/^0 of \d+ attached$/).first().waitFor({ timeout: 10_000 }).catch(() => die(`${BUDGET_AGENT} was not restored`));

    await page.goto(ctx.skillUrl, { waitUntil: "domcontentloaded" });
    const skillCounter = page.getByText(/^0 attached$/).first();
    await skillCounter.waitFor({ timeout: 15_000 }).catch(() => die(`skill ${SKILL} does not start at "0 attached"`));
    await page.waitForLoadState("networkidle");
    await glideTo(page, skillCounter, "skill counter");
    await page.waitForTimeout(BEAT);
    for (const d of SKILL_DOCS) await tick(d);
    const serializes = page.getByText("Serializes as", { exact: true }).first();
    await glideTo(page, serializes, "Serializes as", 0, 80);
    await still("c7-serializes-as");
    await page.waitForTimeout(HOLD + BEAT);
    for (const d of SKILL_DOCS) await tick(d); // untick: the skill is left as found
    await page.getByText(/^0 attached$/).first().waitFor({ timeout: 10_000 }).catch(() => die(`skill ${SKILL} was not restored`));
    await page.waitForTimeout(BEAT);

    /* ---- d. PR #19 → Agent runs: the stored finding cites the document --- */
    scene("d", `PR #${INVARIANT_PR}: the finding cites ${DOC}`);
    await page.goto(ctx.invUrl, { waitUntil: "domcontentloaded" });
    const runsTab = page.getByRole("button", { name: /^Agent runs/ });
    await runsTab.waitFor({ timeout: 15_000 }).catch(() => die("no Agent runs tab on PR #19"));
    await page.waitForLoadState("networkidle");
    await clickAt(page, runsTab, "Agent runs");
    const cite = page.getByText(DOC, { exact: true }).first();
    await cite.waitFor({ timeout: 15_000 }).catch(() => die(`the stored finding does not show ${DOC}`));
    await page.waitForTimeout(BEAT);
    await glideTo(page, cite, "document path in the rationale");
    await still("d-finding-cites-document");
    await page.waitForTimeout(HOLD + BEAT);

    /* ---- e. the homework PR on GitHub: description, specs, plans, reports - */
    scene("e", `PR #${MAIN_PR} on GitHub`);
    await page.goto(mainPr, { waitUntil: "domcontentloaded" });
    await text("Review this PR").waitFor({ timeout: 30_000 }).catch(() => die("GitHub did not render the PR description"));
    await glide(page, W / 2, 320);
    await page.waitForTimeout(STEP);
    await still("e1-pr-description");
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(HOLD);
    for (const d of GITHUB_DOCS) {
      await page.goto(github(d.path), { waitUntil: "domcontentloaded" });
      /* A heading, not raw text: GitHub also puts heading text in a hidden outline. */
      const heading = page.getByRole("heading", { name: new RegExp(escapeRe(d.text)) }).first();
      await heading.waitFor({ timeout: 30_000 }).catch(() => die(`GitHub did not render ${d.path}`));
      await glide(page, W / 2, 420);
      await page.waitForTimeout(BEAT);
      await still(`e-${d.path.replace(/\W/g, "_")}`);
      await page.mouse.wheel(0, 500);
      await page.waitForTimeout(STEP);
    }

    /* ---- f. closing caption, 5 s ------------------------------------------ */
    await page.goto(ctx.briefUrl, { waitUntil: "domcontentloaded" });
    await refresh.waitFor({ timeout: 15_000 }).catch(() => die("no brief on the closing screen"));
    await page.waitForLoadState("networkidle");
    await glide(page, W - 420, 84);
    await page.evaluate((caption) => {
      const el = document.createElement("div");
      el.id = "__dd_caption__";
      el.textContent = caption;
      Object.assign(el.style, {
        position: "fixed", left: "50%", bottom: "64px", transform: "translateX(-50%)", zIndex: "2147483000",
        maxWidth: "1120px", padding: "22px 34px", borderRadius: "14px", background: "rgba(10,12,16,.94)",
        border: "1px solid rgba(255,255,255,.18)", color: "#fff", font: "600 24px/1.4 system-ui, sans-serif",
        textAlign: "center", boxShadow: "0 18px 60px rgba(0,0,0,.6)",
      });
      document.body.appendChild(el);
    }, CAPTION);
    await page.waitForTimeout(600);
    scene("f", "Caption: facts, not diff code");
    await still("f-caption");
    await page.waitForTimeout(5000);

    const end = now();
    const video = page.video();
    await context.close();
    const closed = now();
    const stored = (await api(`/pulls/${ctx.briefPrId}/brief`)).brief;
    facts.stored = stored
      ? `${stored.risks.length} risks, ${stored.review_focus.length} focus, docs ${JSON.stringify(stored.context_docs)}, sha ${stored.head_sha.slice(0, 8)}`
      : null;
    console.log(`✓ raw wall clock ${(end / 1000).toFixed(1)}s · facts ${JSON.stringify(facts, null, 1)}`);
    take = { webm: video ? await video.path() : null, scenes, end, closed };
  } finally {
    await browser.close().catch(() => {});
  }
  return take;
}

/* ---------------------------------------------------------------- transcode */

const ENCODE = ["-an", "-c:v", "libx264", "-preset", "slow", "-crf", "21", "-pix_fmt", "yuv420p", "-movflags", "+faststart"];

function ffmpeg(args) {
  execFileSync(ffmpegPath, ["-y", "-hide_banner", ...args], { stdio: ["ignore", "ignore", "pipe"] });
}

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

/** Trim the raw take to step a … end of the caption and encode it. */
function encode({ webm, scenes, end, closed }) {
  if (!webm || !existsSync(webm)) die("no raw video was written");

  /* The recording starts with the page, a moment before t0, and ends at
   * context.close(): the raw length tells how far the two clocks are apart. */
  const rawSecs = probeSeconds(webm);
  if (rawSecs == null) die("could not read the raw video's duration");
  const lead = Math.max(0, Math.round(rawSecs * 1000 - closed));
  const sec = (ms) => ((ms + lead) / 1000).toFixed(3);
  const from = scenes[0].start_ms;
  ffmpeg(["-i", webm, "-vf", `fps=${FPS},select='between(t,${sec(from)},${sec(end)})',setpts=N/${FPS}/TB`, ...ENCODE, OUT_MP4]);
  for (const f of readdirSync(VIDEO_DIR)) if (f.endsWith(".webm")) rmSync(join(VIDEO_DIR, f));

  for (const s of scenes) console.log(`  step ${s.scene} @ ${((s.start_ms - from) / 1000).toFixed(1)}s — ${s.title}`);
  const secs = probeSeconds(OUT_MP4);
  const mb = statSync(OUT_MP4).size / 1048576;
  console.log(`\n✓ ${OUT_MP4}\n  ${W}x${H} · ${secs.toFixed(1)}s · ${mb.toFixed(1)} MB`);
  if (secs < 60 || secs > 180) console.log(`  ⚠ ${secs.toFixed(0)}s is outside the 1–3 minute target — adjust the pacing constants.`);
}

/* --------------------------------------------------------------------- main */

try {
  const ctx = await preflight();
  const take = await record(ctx);
  encode(take);
} catch (e) {
  if (!(e instanceof Fatal)) throw e;
  console.error("\n✗ " + e.message + "\n");
  process.exit(1);
}
