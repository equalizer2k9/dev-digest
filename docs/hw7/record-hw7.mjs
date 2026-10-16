/* DevDigest — homework #7 demo screencast (Multi-Agent Review + Export to CI).
 *
 * Drives the live studio (:3000 / :3001) and public GitHub pages:
 *   a. PR #21 → Run Review → Multi-agent review: the picker with estimates, 3 agents → Run;
 *   b. /multi-agent/<id>: columns with live statuses (the wait is cut), then the finished run;
 *   c. a finding group expanded: its agents and their original findings;
 *   d. "Where agents disagree" + "Show only conflicts";
 *   e. View trace on one column;
 *   f. Security Reviewer → CI tab (installation and history) → Add to CI: Target, Preview,
 *      Configure, Install step — Open PR is NOT pressed;
 *   g. GitHub: test PR #26 — the DevDigest review with a CRITICAL finding, its red
 *      "DevDigest Review" check, and Actions run 38921296678;
 *   h. CI Runs in the studio with that run;
 *   i. closing caption with the 1 vs 3 numbers and the CI run's cost.
 * and writes
 *   docs/hw7/hw7-demo.mp4         H.264, 1440x900, silent (git-ignored)
 *   docs/hw7/.demo-frames/*.png   one still per step (git-ignored)
 *
 *   node docs/hw7/record-hw7.mjs           record one take
 *   node docs/hw7/record-hw7.mjs --check   preflight only, writes nothing
 *
 * The take starts ONE multi-agent run (3 real model calls, ≈$0.002), which adds one run to
 * PR #21. Nothing else changes: the wizard stops before Install, the CI runs page only
 * re-reads GitHub (an ingested run is never recorded twice).
 *
 * Dependencies are NOT installed here: Playwright, ffmpeg-static and the cursor overlay
 * come from the HW1 rig in "Claude outputs/screencast" (git-ignored).
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
const OUT_MP4 = join(HERE, "hw7-demo.mp4");
const FRAMES_DIR = join(HERE, ".demo-frames");

const CLIENT = "http://localhost:3000";
const API = "http://localhost:3001";
const REPO = "equalizer2k9/dev-digest";
const PR = 21;
const AGENTS = ["General Reviewer", "Security Reviewer", "Performance Reviewer"];
const CI_AGENT = "Security Reviewer";
const GH = `https://github.com/${REPO}`;
const TEST_PR = 26;
const ACTIONS_RUN = 38921296678;
/** The failed "DevDigest Review" check run of that job; the checks tab opens on it, not on a green one. */
const CHECK_RUN = 117041587628;

const C = {
  intro: "ДЗ №7 · Multi-Agent Review: кілька агентів на одному PR паралельно — порівняти, де вони згодні й де ні",
  picker: "Пікер: 2–5 агентів, оцінка часу й вартості з їхніх минулих прогонів — до запуску",
  live: "Колонки оновлюються опитуванням кожні 2 с; агенти йдуть паралельно (allSettled) — збій одного не зупиняє інших",
  done: "Готово: wall-clock = найповільніший агент, а не сума. Токени й вартість — по агенту й разом",
  group: "Групи: той самий файл + перетин рядків + схожі заголовки (Jaccard ≥ 0.3). Розгортається до оригіналів кожного агента",
  disagree: "Where agents disagree: хто що знайшов і з якою severity. Show only conflicts — лише розбіжності",
  trace: "View trace: той самий trace-drawer, що й для звичайного рев'ю, — промпт, виклик моделі, знахідки",
  ciTab: "Export to CI: вкладка CI агента — де встановлено і його прогони в GitHub Actions",
  target: "Візард, крок 1: ціль — GitHub Actions, репозиторій воркспейсу",
  preview: "Крок 2: усі файли бандла — маніфест агента, зібраний runner, workflow (редагується лише він)",
  configure: "Крок 3: тригери й куди постити. Required check ставить людина — ruleset на main",
  install: "Крок 4: студія відкриває один PR з devdigest/ci — у main напряму не пише. Тут зупиняємось",
  ghReview: "Тестовий PR #26 з SQL-ін'єкцією: агент у CI залишив рев'ю з CRITICAL",
  ghCheck: "Check «DevDigest Review» червоний — ruleset на main блокує мерж",
  ghRun: "Прогін Actions: checkout base.sha (код PR не виконується поруч із секретом), артефакт з результатом",
  ciRuns: "CI Runs: студія забрала результат з артефакту — статус, знахідки, вартість, посилання на прогін",
};
const FINAL =
  "1 агент vs 3 на PR #21: 39.9 с → 76.9 с, $0.0014 → $0.0024 (не ×3). Прогін у CI на PR #26 — $0.0005, 14 с, мерж заблоковано";

const W = 1440;
const H = 900;
const FPS = 25;
const BEAT = 900;
const STEP = 1300;
const HOLD = 2200;
const RUN_LIMIT_MS = 6 * 60_000;

class Fatal extends Error {}
const die = (msg) => {
  throw new Fatal(msg);
};

async function api(path) {
  const res = await fetch(API + path);
  if (!res.ok) die(`GET ${path} → HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

/* ---------------------------------------------------------------- preflight */

async function preflight() {
  const repo = (await api("/repos")).find((r) => r.full_name === REPO);
  if (!repo) die(`repo ${REPO} is not imported`);
  const pulls = await api(`/repos/${repo.id}/pulls`);
  if (!pulls.some((p) => p.number === PR)) die(`PR #${PR} is not imported`);
  const agents = await api("/agents");
  for (const n of AGENTS) if (!agents.some((a) => a.name === n && a.enabled)) die(`agent "${n}" missing or disabled`);
  const ci = agents.find((a) => a.name === CI_AGENT);
  const { runs } = await api(`/ci/runs?agent_id=${ci.id}`);
  if (!runs.some((r) => r.pr_number === TEST_PR)) die(`no CI run for PR #${TEST_PR} — open CI Runs once first`);
  try {
    await fetch(CLIENT, { signal: AbortSignal.timeout(20_000) });
  } catch {
    die(`the studio is not up on ${CLIENT}`);
  }
  console.log(`✓ ${REPO} · PR #${PR} · ${AGENTS.join(", ")} · CI run for #${TEST_PR} present`);
  return {
    repoId: repo.id,
    pr: `${CLIENT}/repos/${repo.id}/pulls/${PR}?tab=findings`,
    ciTab: `${CLIENT}/agents/${ci.id}?tab=ci`,
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
  if (b.y < 120 || b.y + b.height > H - 140) {
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

/** A caption bar at the bottom; re-added after every full navigation. */
async function caption(page, text, big = false) {
  await page.evaluate(
    ({ text, big }) => {
      let el = document.getElementById("__dd_caption__");
      if (!el) {
        el = document.createElement("div");
        el.id = "__dd_caption__";
        document.body.appendChild(el);
      }
      el.textContent = text;
      Object.assign(el.style, {
        position: "fixed", left: "50%", bottom: big ? "64px" : "22px", transform: "translateX(-50%)", zIndex: "2147483000",
        maxWidth: big ? "1120px" : "1240px", padding: big ? "22px 34px" : "12px 24px", borderRadius: "12px",
        background: "rgba(10,12,16,.92)", border: "1px solid rgba(255,255,255,.18)", color: "#fff",
        font: big ? "600 24px/1.4 system-ui, sans-serif" : "600 18px/1.35 system-ui, sans-serif",
        textAlign: "center", boxShadow: "0 12px 40px rgba(0,0,0,.55)", pointerEvents: "none",
      });
    },
    { text, big },
  );
}

/* ---------------------------------------------------------------- recording */

async function record(ctx) {
  rmSync(FRAMES_DIR, { recursive: true, force: true });
  mkdirSync(FRAMES_DIR, { recursive: true });
  mkdirSync(VIDEO_DIR, { recursive: true });
  for (const f of readdirSync(VIDEO_DIR)) if (f.endsWith(".webm")) rmSync(join(VIDEO_DIR, f));

  const browser = await chromium.launch({ slowMo: 60 });

  /* Warm-up: Next dev compiles a route on first hit; GitHub pages get cached. Reads only. */
  const warm = await browser.newContext({ viewport: { width: W, height: H } });
  const wp = await warm.newPage();
  for (const u of [ctx.pr, ctx.ciTab, `${CLIENT}/multi-agent`, `${CLIENT}/multi-agent/x`, `${CLIENT}/ci-runs`])
    await wp.goto(u, { waitUntil: "networkidle" }).catch(() => {});
  for (const u of [`${GH}/pull/${TEST_PR}`, `${GH}/pull/${TEST_PR}/checks?check_run_id=${CHECK_RUN}`, `${GH}/actions/runs/${ACTIONS_RUN}`])
    await wp.goto(u, { waitUntil: "domcontentloaded" });
  await warm.close();

  const context = await browser.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: 1,
    recordVideo: { dir: VIDEO_DIR, size: { width: W, height: H } },
  });
  await context.addInitScript({ path: join(RIG, "cursor-overlay.js") });
  await context.addInitScript((id) => {
    try {
      localStorage.setItem("dd-repo", id);
    } catch {}
  }, ctx.repoId);
  const page = await context.newPage();

  let take;
  try {
    const t0 = Date.now();
    const now = () => Date.now() - t0;
    const scenes = [];
    const keep = [];
    let open = null;
    const resume = () => (open = now());
    const cut = () => {
      if (open !== null) keep.push([open, now()]);
      open = null;
    };
    const still = (name) => page.screenshot({ path: join(FRAMES_DIR, `${name}.png`) });
    const scene = (id, title) => {
      scenes.push({ scene: id, title, at: now() });
      console.log(`▶ ${id} — ${title} @ ${(now() / 1000).toFixed(1)}s raw`);
    };
    const goto = async (url, text) => {
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle").catch(() => {});
      if (text) await caption(page, text);
    };
    const button = (name) => page.getByRole("button", { name, exact: true });

    /* ---- a. PR #21 → multi-agent picker → Run -------------------------------- */
    await goto(ctx.pr);
    resume();
    scene("a", "PR #21 → multi-agent picker");
    await caption(page, C.intro);
    await glide(page, W / 2, H / 2);
    await page.waitForTimeout(HOLD + BEAT);
    await clickAt(page, button("Run Review"), "Run Review");
    await page.waitForTimeout(STEP);
    await clickAt(page, page.getByRole("button", { name: /Multi-agent review/ }), "Multi-agent review…");
    const dialog = page.getByRole("dialog");
    await dialog.waitFor({ timeout: 10_000 });
    await caption(page, C.picker);
    for (const n of AGENTS) {
      await clickAt(page, dialog.locator("label", { hasText: n }), n);
      await page.waitForTimeout(500);
    }
    await page.waitForTimeout(HOLD);
    await still("a-picker");
    await clickAt(page, dialog.getByRole("button", { name: /Run multi-agent review \(3\)/ }), "Run (3)");
    await page.waitForURL(/\/multi-agent\/[0-9a-f-]{36}/, { timeout: 20_000 });
    const multiUrl = page.url();

    /* ---- b. live columns, the wait cut ---------------------------------------- */
    scene("b", "live columns");
    await page.waitForLoadState("networkidle").catch(() => {});
    await caption(page, C.live);
    await glide(page, W / 2, 380);
    await page.waitForTimeout(HOLD + STEP);
    await still("b-live-columns");
    cut();
    const runningLeft = () =>
      page.evaluate(() => [...document.querySelectorAll("[data-run-id]")].some((c) => /Running|Queued/.test(c.innerText)));
    const deadline = Date.now() + RUN_LIMIT_MS;
    while (await runningLeft()) {
      if (Date.now() > deadline) die("the multi-agent run did not finish in time");
      await page.waitForTimeout(2000);
    }
    await page.waitForTimeout(2500);
    await caption(page, C.done);
    resume();
    await glide(page, W / 2, 300);
    await page.waitForTimeout(HOLD + STEP);
    await still("b-done-columns");

    /* ---- c. one group expanded ------------------------------------------------- */
    scene("c", "group expanded: agents and originals");
    await caption(page, C.group);
    const groupHead = page.locator("main button[aria-expanded]").filter({ hasText: "Flagged by" });
    let best = 0;
    const n = await groupHead.count();
    for (let i = 0, top = 0; i < n; i++) {
      const agentsIn = ((await groupHead.nth(i).innerText()).match(/Reviewer/g) ?? []).length;
      if (agentsIn > top) [top, best] = [agentsIn, i];
    }
    await clickAt(page, groupHead.nth(best), "group head");
    await page.waitForTimeout(STEP);
    await page.mouse.wheel(0, 380);
    await page.waitForTimeout(HOLD + STEP);
    await still("c-group-expanded");
    await page.mouse.wheel(0, 520);
    await page.waitForTimeout(HOLD);

    /* ---- d. where agents disagree + only conflicts ---------------------------- */
    scene("d", "where agents disagree");
    await page.getByRole("heading", { name: "Where agents disagree" }).evaluate((el) => el.scrollIntoView({ block: "start" }));
    await page.waitForTimeout(STEP);
    await caption(page, C.disagree);
    await page.waitForTimeout(HOLD);
    await clickAt(page, page.locator("main").getByText("Show only conflicts").first(), "Show only conflicts");
    await page.waitForTimeout(HOLD + BEAT);
    await still("d-only-conflicts");

    /* ---- e. view trace ----------------------------------------------------------- */
    scene("e", "view trace");
    await page.locator("[data-run-id]").first().evaluate((el) => el.scrollIntoView({ block: "center" }));
    await page.waitForTimeout(BEAT);
    await clickAt(page, page.getByRole("button", { name: "View trace" }).nth(1), "View trace");
    await caption(page, C.trace);
    await page.waitForTimeout(HOLD + STEP);
    await still("e-trace");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(BEAT);

    /* ---- f. CI tab + wizard without Install ---------------------------------- */
    scene("f", "CI tab and the export wizard");
    await goto(ctx.ciTab, C.ciTab);
    await page.getByText("Installed in").first().waitFor({ timeout: 15_000 });
    await glide(page, W / 2, 300);
    await page.waitForTimeout(HOLD + STEP);
    await still("f-ci-tab");
    await clickAt(page, button("Add to CI"), "Add to CI");
    await caption(page, C.target);
    await clickAt(page, page.locator("label", { hasText: REPO }), "repo radio");
    await page.waitForTimeout(HOLD);
    await still("f-1-target");
    await clickAt(page, button("Continue"), "Continue → Preview");
    await page.getByText("FILES TO CREATE").waitFor({ timeout: 20_000 });
    await caption(page, C.preview);
    await page.waitForTimeout(STEP);
    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(HOLD);
    await still("f-2-preview");
    await clickAt(page, button("Continue"), "Continue → Configure");
    await caption(page, C.configure);
    await page.waitForTimeout(HOLD + BEAT);
    await still("f-3-configure");
    await clickAt(page, button("Continue"), "Continue → Install");
    await caption(page, C.install);
    await glideTo(page, button("Open PR"), "Open PR (not pressed)");
    await page.waitForTimeout(HOLD + BEAT);
    await still("f-4-install");

    /* ---- g. GitHub: the review, the red check, the Actions run ---------------- */
    scene("g", "GitHub: review, check, run");
    await goto(`${GH}/pull/${TEST_PR}`, C.ghReview);
    const review = page.getByText(/Security Reviewer — Changes requested/).first();
    await review.waitFor({ timeout: 20_000 });
    await review.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await page.waitForTimeout(BEAT);
    await caption(page, C.ghReview);
    await glide(page, W / 2, 360);
    await page.waitForTimeout(HOLD + STEP);
    await still("g-1-review");
    await goto(`${GH}/pull/${TEST_PR}/checks?check_run_id=${CHECK_RUN}`, C.ghCheck);
    await page.getByText("DevDigest Review").first().waitFor({ timeout: 20_000 });
    await glideTo(page, page.getByText("DevDigest Review").first(), "check name");
    await page.waitForTimeout(HOLD + BEAT);
    await still("g-2-check");
    await goto(`${GH}/actions/runs/${ACTIONS_RUN}`, C.ghRun);
    await page.waitForTimeout(HOLD + STEP);
    await still("g-3-actions-run");

    /* ---- h. CI Runs in the studio -------------------------------------------- */
    scene("h", "CI Runs");
    await goto(`${CLIENT}/ci-runs`, C.ciRuns);
    await page.getByText(`#${TEST_PR}`).first().waitFor({ timeout: 30_000 });
    await glideTo(page, page.getByText(`#${TEST_PR}`).first(), "CI run row");
    await page.waitForTimeout(HOLD + STEP);
    await still("h-ci-runs");

    /* ---- i. closing caption ----------------------------------------------------- */
    scene("i", "closing caption");
    await page.evaluate(() => document.getElementById("__dd_caption__")?.remove());
    await caption(page, FINAL, true);
    await page.waitForTimeout(600);
    await still("i-final-caption");
    await page.waitForTimeout(5000);
    cut();

    const video = page.video();
    await context.close();
    const closed = now();
    console.log(`✓ multi-agent run on camera: ${multiUrl}`);
    take = { webm: video ? await video.path() : null, scenes, keep, closed };
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

/** Keep only the recorded ranges (the wait for the agents is cut) and encode. */
function encode({ webm, scenes, keep, closed }) {
  if (!webm || !existsSync(webm)) die("no raw video was written");
  const rawSecs = probeSeconds(webm);
  if (rawSecs == null) die("could not read the raw video's duration");
  const lead = Math.max(0, Math.round(rawSecs * 1000 - closed));
  const sec = (ms) => ((ms + lead) / 1000).toFixed(3);
  const select = keep.map(([a, b]) => `between(t,${sec(a)},${sec(b)})`).join("+");
  ffmpeg(["-i", webm, "-vf", `fps=${FPS},select='${select}',setpts=N/${FPS}/TB`, ...ENCODE, OUT_MP4]);
  for (const f of readdirSync(VIDEO_DIR)) if (f.endsWith(".webm")) rmSync(join(VIDEO_DIR, f));

  const cutAt = (ms) => keep.reduce((acc, [a, b]) => acc + Math.max(0, Math.min(ms, b) - a), 0);
  for (const s of scenes) console.log(`  ${s.scene} @ ${(cutAt(s.at) / 1000).toFixed(1)}s — ${s.title}`);
  const secs = probeSeconds(OUT_MP4);
  const mb = statSync(OUT_MP4).size / 1048576;
  console.log(`\n✓ ${OUT_MP4}\n  ${W}x${H} · ${secs.toFixed(1)}s · ${mb.toFixed(1)} MB`);
  if (secs > 180) console.log(`  ⚠ ${secs.toFixed(0)}s is over the 3-minute target — adjust the pacing constants.`);
}

/* --------------------------------------------------------------------- main */

try {
  const ctx = await preflight();
  if (!process.argv.includes("--check")) encode(await record(ctx));
} catch (e) {
  if (!(e instanceof Fatal)) throw e;
  console.error("\n✗ " + e.message + "\n");
  process.exit(1);
}
