/* DevDigest — homework #5 demo screencast (PR Why + Risk Brief).
 *
 * Drives the live studio (:3000 / :3001) through the PR Brief block of the test
 * PR, then shows the homework PR on GitHub, and writes
 *   docs/hw5/hw5-demo.mp4        H.264, 1440x900, silent
 *   docs/hw5/.demo-frames/*.png  one still per step, to eyeball the take
 *
 *   node docs/hw5/record-hw5.mjs
 *
 * Unlike the HW4 take this one CHANGES the stand: step a presses "Generate
 * brief", which makes one real model call (Settings → Risk Brief) and stores a
 * row in pr_brief. The take needs the block empty, so delete that PR's row
 * first; the preflight refuses to start otherwise. If the generation fails the
 * script stops — it never retries and never switches the model.
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
const TEST_PR = 16;
const MAIN_PR = 17;
const BRANCH = "feat/homework-5";
/* The Review focus item clicked in step б: any line of this file. */
const FOCUS_FILE = "server/src/modules/settings/helpers.ts";
const GITHUB_DOCS = [
  { path: "specs/pr-brief/spec.md", text: "Acceptance criteria" },
  { path: "specs/pr-brief/plan.md", text: "Traceability" },
  { path: "docs/hw5/plan-verification.md", text: "Matrix" },
];
const CAPTION =
  "Модель отримує готові факти, а не код diff: вхід малий і передбачуваний, кожен шлях можна перевірити, а код PR не підкине їй інструкцій";

const W = 1440;
const H = 900;
const FPS = 25;

const BEAT = 1000;
const STEP = 1500;
const HOLD = 2200;

class Fatal extends Error {}
function die(msg) {
  throw new Fatal(msg);
}

async function api(path) {
  const res = await fetch(API + path);
  if (!res.ok) die(`GET ${path} → HTTP ${res.status}`);
  return res.json();
}

/* ---------------------------------------------------------------- preflight */

async function preflight() {
  const repo = (await api("/repos")).find((r) => r.full_name === REPO);
  if (!repo) die(`repo ${REPO} is not imported`);
  const pr = (await api(`/repos/${repo.id}/pulls`)).find((p) => p.number === TEST_PR);
  if (!pr) die(`PR #${TEST_PR} of ${REPO} is not imported`);

  const index = await api(`/repos/${repo.id}/index-state`);
  if (index.status !== "full") die(`index of ${REPO} is ${index.status}, not full`);

  const { brief } = await api(`/pulls/${pr.id}/brief`);
  if (brief) die(`PR #${TEST_PR} already has a stored brief — delete its pr_brief row so the take starts at "Generate brief"`);

  const blast = await api(`/pulls/${pr.id}/blast`);
  const callers = blast.downstream.flatMap((d) => d.callers);
  if (blast.degraded || callers.length < 1) die(`PR #${TEST_PR}: blast radius has no callers (${blast.summary})`);

  const fm = (await api("/settings")).feature_models?.risk_brief;
  console.log(`✓ #${TEST_PR} ${blast.summary} · index ${index.status} · Risk Brief ${fm?.provider}/${fm?.model}`);
  return { prId: pr.id, url: `${CLIENT}/repos/${repo.id}/pulls/${TEST_PR}` };
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

async function record({ prId, url }) {
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
  await wp.goto(url, { waitUntil: "networkidle" });
  await wp.getByRole("button", { name: "Generate brief" }).waitFor({ timeout: 30_000 }).catch(() => die(`no "Generate brief" button on ${url}`));
  await wp.goto(`${url}?tab=diff`, { waitUntil: "networkidle" });
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
    /* Risk title buttons, scoped to the brief block: other blocks have aria-expanded buttons too. */
    const riskTitles = page.locator("section").filter({ has: refresh }).locator("button[aria-expanded]");

    /* ---- a. PR #16 → Overview → Generate brief → the brief ---------------- */
    await page.goto(url, { waitUntil: "domcontentloaded" });
    const generate = page.getByRole("button", { name: "Generate brief" });
    await generate.waitFor({ timeout: 30_000 }).catch(() => die('the "Generate brief" button never rendered'));
    await page.waitForLoadState("networkidle");
    scene("a", `PR #${TEST_PR}: Overview, Generate brief`);
    await page.waitForTimeout(STEP);
    await glideTo(page, overviewTab, "Overview tab");
    await page.waitForTimeout(BEAT);
    await glideTo(page, generate, "Generate brief");
    await still("a1-generate-button");
    await page.waitForTimeout(BEAT);
    await clickAt(page, generate, "Generate brief");
    await skeleton.waitFor({ timeout: 5_000 }).catch(() => die("no skeleton after the click"));
    await page.waitForTimeout(700);
    await still("a2-generating");

    /* One model call. A failure is shown in the block — stop, never retry. */
    const outcome = await Promise.race([
      refresh.waitFor({ timeout: 90_000 }).then(() => "ok").catch(() => "timeout"),
      text("The brief could not be generated.").waitFor({ timeout: 90_000 }).then(() => "failed").catch(() => "timeout"),
    ]);
    if (outcome !== "ok") die(`the generation did not produce a brief (${outcome}) — check the API log and Settings → Risk Brief`);
    await skeleton.waitFor({ state: "detached", timeout: 10_000 }).catch(() => {});
    facts.generation_ms = now() - scenes[0].start_ms;
    await page.waitForTimeout(BEAT);

    await glideTo(page, text("No intent available for this PR."), "no-intent note", 0, -40);
    await still("a3-summary");
    await page.waitForTimeout(HOLD);
    await glideTo(page, text("No intent available for this PR."), "no-intent note");
    await page.waitForTimeout(BEAT);
    await glideTo(page, text("No specs attached."), "no-specs note");
    await page.waitForTimeout(STEP);
    const firstRisk = riskTitles.first();
    await glideTo(page, firstRisk, "first risk");
    await still("a4-risk-areas");
    await page.waitForTimeout(HOLD);
    const focus = page.getByRole("button", { name: new RegExp(`^${FOCUS_FILE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:\\d+$`) }).first();
    if ((await focus.count()) === 0) die(`the brief has no Review focus item on ${FOCUS_FILE}`);
    facts.focus = (await focus.innerText()).trim();
    await glideTo(page, focus, "focus item");
    await still("a5-review-focus");
    await page.waitForTimeout(HOLD);
    const blastStat = page.getByText(/^\d+ callers?$/).first();
    await glideTo(page, blastStat, "blast radius stats");
    await still("a6-blast-radius");
    await page.waitForTimeout(HOLD);

    /* ---- б. click the focus item → Files changed, line highlighted -------- */
    scene("b", `${facts.focus} → Files changed`);
    await clickAt(page, focus, "focus item");
    const lit = page.locator("[data-target-highlight]").first();
    await lit.waitFor({ timeout: 10_000 }).catch(() => die("no highlighted line on Files changed"));
    facts.highlighted = await lit.getAttribute("data-line-key");
    await still("b-line-highlighted");
    await page.waitForTimeout(600);
    const lb = await lit.boundingBox();
    if (lb) await glide(page, lb.x + 520, lb.y + lb.height / 2);
    await page.waitForTimeout(HOLD + BEAT);

    /* ---- в. back to Overview, reload → the brief is there, no generation -- */
    scene("c", "Overview, reload: the stored brief");
    await clickAt(page, overviewTab, "Overview tab");
    await refresh.waitFor({ timeout: 10_000 }).catch(() => die("the brief is gone after returning to Overview"));
    await page.waitForTimeout(BEAT);
    await page.reload({ waitUntil: "domcontentloaded" });
    await refresh.waitFor({ timeout: 15_000 }).catch(() => die("no stored brief after the reload"));
    if ((await skeleton.count()) > 0) die("the reload started a generation");
    await page.waitForLoadState("networkidle");
    await glideTo(page, refresh, "Refresh brief", -220, 0);
    await still("c-after-reload");
    await page.waitForTimeout(HOLD);

    /* ---- г. expand a risk; an entry that is not in the PR's diff ---------- */
    scene("d", "Risk expanded; File not in this PR's diff");
    const risk = riskTitles.first();
    await clickAt(page, risk, "first risk");
    await page.waitForTimeout(500);
    if ((await risk.getAttribute("aria-expanded")) !== "true") die("the risk row did not expand");
    await still("d1-risk-expanded");
    await page.waitForTimeout(HOLD);
    const notInDiff = text("File not in this PR's diff");
    if ((await notInDiff.count()) === 0) die('the brief has no "File not in this PR\'s diff" entry');
    await glideTo(page, notInDiff, "not-in-diff note");
    await still("d2-not-in-diff");
    await page.waitForTimeout(HOLD + BEAT);

    /* ---- ґ. the homework PR on GitHub: description, spec, plan, report ---- */
    scene("e", `PR #${MAIN_PR} on GitHub`);
    await page.goto(mainPr, { waitUntil: "domcontentloaded" });
    await text("SDD pipeline").waitFor({ timeout: 30_000 }).catch(() => die("GitHub did not render the PR description"));
    await glide(page, W / 2, 300);
    await page.waitForTimeout(STEP);
    await still("e1-pr-description");
    const cross = page.getByRole("heading", { name: "Cross-model review" }).first();
    await glideTo(page, cross, "Cross-model review heading", 0, 60);
    await still("e2-cross-model-note");
    await page.waitForTimeout(HOLD + BEAT);
    for (const d of GITHUB_DOCS) {
      await page.goto(github(d.path), { waitUntil: "domcontentloaded" });
      await text(d.text).waitFor({ timeout: 30_000 }).catch(() => die(`GitHub did not render ${d.path}`));
      await glide(page, W / 2, 420);
      await page.waitForTimeout(BEAT);
      await still(`e-${d.path.split("/").pop().replace(/\W/g, "_")}`);
      await page.mouse.wheel(0, 500);
      await page.waitForTimeout(HOLD);
    }

    /* ---- д. closing caption, 5 s ------------------------------------------ */
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await refresh.waitFor({ timeout: 15_000 }).catch(() => die("no brief on the closing screen"));
    await page.waitForLoadState("networkidle");
    await glide(page, W - 420, 84);
    await page.evaluate((caption) => {
      const el = document.createElement("div");
      el.id = "__dd_caption__";
      el.textContent = caption;
      Object.assign(el.style, {
        position: "fixed", left: "50%", bottom: "64px", transform: "translateX(-50%)", zIndex: "2147483000",
        maxWidth: "1080px", padding: "22px 34px", borderRadius: "14px", background: "rgba(10,12,16,.94)",
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
    const stored = (await api(`/pulls/${prId}/brief`)).brief;
    facts.stored = stored ? `${stored.risks.length} risks, ${stored.review_focus.length} focus, sha ${stored.head_sha.slice(0, 8)}` : null;
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
