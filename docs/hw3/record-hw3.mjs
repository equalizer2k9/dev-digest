/* DevDigest — homework #3 demo screencast (Smart Diff).
 *
 * Drives the live studio (:3000 / :3001) through the Files changed tab of the
 * test PR and writes
 *   docs/hw3/hw3-demo.mp4        H.264, 1440x900, silent
 *   docs/hw3/.demo-frames/*.png  one still per step, to eyeball the take
 *
 *   node docs/hw3/record-hw3.mjs          record
 *   node docs/hw3/record-hw3.mjs --dry    same clicks and stills, no video
 *
 * Dependencies are NOT installed here: Playwright, ffmpeg-static and the cursor
 * overlay come from the HW1 rig in "Claude outputs/screencast" (git-ignored).
 *
 * The take starts from a PR with no review: every existing run and review of
 * the test PR is deleted first, so the groups are shown before any finding
 * exists. One step waits on a model — Run Review in step c. That wait is filmed
 * but cut out of the mp4. A failed model call stops the script; it never
 * switches a model.
 */
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, statSync } from "node:fs";
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

const VIDEO_DIR = join(HERE, ".video-raw");
const OUT_MP4 = join(HERE, "hw3-demo.mp4");
const FRAMES_DIR = join(HERE, ".demo-frames");

const CLIENT = "http://localhost:3000";
const API = "http://localhost:3001";
const REPO_FULL_NAME = "equalizer2k9/dev-digest";
const PR_NUMBER = 11;
const AGENT_NAME = "General Reviewer";
const CORE_FILE = "server/src/platform/retry-delay.ts";
const LOCK_FILE = "server/pnpm-lock.yaml";
const CAPTION =
  "Групування — чиста функція за шляхом файла, без виклику моделі: працює ще до рев'ю й нічого не коштує";

const W = 1440;
const H = 900;
const FPS = 25;

/* Pacing: 1–2 s on every screen. */
const BEAT = 1000;
const STEP = 1500;
const HOLD = 2000;

const RUN_TIMEOUT = 6 * 60_000;
/* What stays on screen around the cut-out wait. */
const KEEP_HEAD = 2500;
const KEEP_TAIL = 1500;

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
  const agent = (await api("/agents")).find((a) => a.name === AGENT_NAME);
  if (!agent) die(`agent "${AGENT_NAME}" does not exist`);

  /* Start clean: the groups must be on screen before any finding exists. */
  for (const rv of await api(`/pulls/${pr.id}/reviews`)) await api(`/reviews/${rv.id}`, { method: "DELETE" });
  for (const run of await api(`/pulls/${pr.id}/runs`)) await api(`/runs/${run.run_id}`, { method: "DELETE" });

  await api(`/pulls/${pr.id}`); // fills pr_files, which smart-diff reads
  const smart = await api(`/pulls/${pr.id}/smart-diff`);
  const roles = smart.groups.map((g) => `${g.role}:${g.files.length}`);
  if (smart.groups.some((g) => g.files.some((f) => f.finding_lines.length))) die("the PR still has findings after the cleanup");
  if (!smart.groups.find((g) => g.role === "boilerplate")?.files.some((f) => f.path === LOCK_FILE))
    die(`${LOCK_FILE} is not in the boilerplate group`);

  console.log(`✓ repo ${repo.id} · PR #${PR_NUMBER} ${pr.id} · clean`);
  console.log(`✓ groups ${roles.join(" · ")} · agent ${AGENT_NAME} on ${agent.model}`);
  return { repoId: repo.id, prId: pr.id };
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

/** Smooth scroll into view — a jump cut inside a step reads as a glitch. */
async function show(page, locator, label, block = "center") {
  if ((await locator.count()) === 0) die(`selector found nothing: ${label}`);
  await locator.first().evaluate((el, blk) => el.scrollIntoView({ behavior: "smooth", block: blk }), block);
  await page.waitForTimeout(800);
}

async function glideTo(page, locator, label, dx = 0, dy = 0) {
  let b = await boxOf(locator, label);
  if (b.y < 120 || b.y + b.height > H - 20) {
    await show(page, locator, label);
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

async function record({ repoId, prId }) {
  rmSync(VIDEO_DIR, { recursive: true, force: true });
  if (!DRY) mkdirSync(VIDEO_DIR, { recursive: true });
  rmSync(FRAMES_DIR, { recursive: true, force: true });
  mkdirSync(FRAMES_DIR, { recursive: true });

  const browser = await chromium.launch({ slowMo: 60 });
  const prUrl = `${CLIENT}/repos/${repoId}/pulls/${PR_NUMBER}`;

  /* Warm-up on a throwaway context: Next dev compiles a route on first hit, and
   * that stall must not end up in the take. */
  const warm = await browser.newContext({ viewport: { width: W, height: H } });
  const wp = await warm.newPage();
  for (const q of ["", "?tab=diff", "?tab=findings"]) await wp.goto(prUrl + q, { waitUntil: "networkidle" });
  await warm.close();

  const context = await browser.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: 1,
    ...(DRY ? {} : { recordVideo: { dir: VIDEO_DIR, size: { width: W, height: H } } }),
  });
  await context.addInitScript({ path: join(RIG, "cursor-overlay.js") });

  const page = await context.newPage();
  let take;
  try {
    const t0 = Date.now();
    const now = () => Date.now() - t0;
    const scenes = [];
    const cuts = [];
    const facts = {};
    const still = (name) => page.screenshot({ path: join(FRAMES_DIR, `${name}.png`) });
    const scene = (id, title) => {
      scenes.push({ scene: id, title, start_ms: now() });
      console.log(`▶ step ${id} — ${title} @ ${(now() / 1000).toFixed(1)}s raw`);
    };

    const group = (role) => page.locator(`[data-role-group="${role}"]`);
    const fileCard = (path) => page.locator("[data-file-path]", { hasText: path });
    const filesTab = page.getByRole("button", { name: /^Files changed/ });
    const toTop = async () => {
      await page.locator("main").first().evaluate((el) => el.scrollTo({ top: 0, behavior: "smooth" }));
      await page.waitForTimeout(800);
    };

    /* ---- a. Files changed → five groups, docs and boilerplate collapsed ---- */
    await page.goto(prUrl, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Run Review", exact: true }).waitFor({ timeout: 30_000 }).catch(() => die("the PR page never rendered"));
    scene("a", "Files changed: five role groups");
    await page.waitForTimeout(STEP);
    await clickAt(page, filesTab, "Files changed tab");
    await group("core").waitFor({ timeout: 15_000 }).catch(() => die("the role groups never rendered"));
    await page.waitForTimeout(STEP);

    facts.groups = [];
    for (const role of ["core", "tests", "wiring", "docs", "boilerplate"]) {
      const g = group(role);
      await glideTo(page, g, `${role} group header`);
      facts.groups.push((await g.innerText()).replace(/\s+/g, " ").trim());
      await page.waitForTimeout(role === "docs" || role === "boilerplate" ? STEP : BEAT);
      if (role === "boilerplate") await still("a-five-groups");
    }
    for (const role of ["docs", "boilerplate"])
      if ((await group(role).getAttribute("aria-expanded")) !== "false") die(`the ${role} group is not collapsed on open`);
    await page.waitForTimeout(BEAT);

    /* ---- b. expand Boilerplate → the lock file ----------------------------- */
    scene("b", "Boilerplate holds the lock file");
    await clickAt(page, group("boilerplate"), "Boilerplate header");
    await fileCard(LOCK_FILE).first().waitFor({ timeout: 5000 }).catch(() => die("the lock file is not inside Boilerplate"));
    await glideTo(page, fileCard(LOCK_FILE), "lock file card");
    await still("b-lock-in-boilerplate");
    await page.waitForTimeout(HOLD);
    await clickAt(page, group("boilerplate"), "Boilerplate header (collapse)");
    await page.waitForTimeout(BEAT);

    /* ---- c. Run Review → wait (cut) → back by the tab → counter and dot ---- */
    await toTop();
    scene("c", "Run Review, then the counter and the dot");
    await clickAt(page, page.getByRole("button", { name: "Run Review", exact: true }), "Run Review");
    const agentItem = page.getByText(AGENT_NAME, { exact: true }).first();
    await agentItem.waitFor({ timeout: 5000 }).catch(() => die("the Run Review menu did not open"));
    await page.waitForTimeout(BEAT);
    await clickAt(page, agentItem, `${AGENT_NAME} in the menu`);
    const runFrom = now();

    let run;
    const deadline = Date.now() + RUN_TIMEOUT;
    for (;;) {
      await page.waitForTimeout(2000);
      const runs = await api(`/pulls/${prId}/runs`);
      run = runs[0];
      if (run && !["running", "queued", "pending"].includes(run.status)) break;
      if (Date.now() > deadline) die("the review run did not finish in time");
    }
    if (run.status !== "done") {
      const why = `${run.status}${run.error ? `: ${run.error}` : ""}`;
      die(`the review run ended as ${why} — stopping, no model was switched`);
    }
    const findings = (await api(`/pulls/${prId}/reviews`)).flatMap((rv) => rv.findings);
    facts.findings = findings.map((f) => `${f.severity} ${f.file}:${f.start_line}`);
    if (!findings.some((f) => f.file === CORE_FILE)) die(`the run finished with no finding in ${CORE_FILE}: ${JSON.stringify(facts.findings)}`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(KEEP_TAIL + 500);
    cuts.push({ label: "review run", from: runFrom + KEEP_HEAD, to: now() - KEEP_TAIL });
    facts.run_seconds = Math.round((now() - runFrom) / 1000);

    await page.waitForTimeout(BEAT);
    await clickAt(page, filesTab, "Files changed tab");
    const counter = group("core").locator("[data-findings-count]");
    await counter.waitFor({ timeout: 15_000 }).catch(() => die("no finding counter on Core logic after the review"));
    facts.core_header = (await group("core").innerText()).replace(/\s+/g, " ").trim();
    await glideTo(page, counter, "Core logic counter");
    await page.waitForTimeout(HOLD);
    const dot = page.locator("[data-finding-dot]").first();
    /* Stop beside the dot, not on it — the cursor overlay would cover it. */
    await glideTo(page, dot, "dot on the file card", -36, 0);
    await still("c-counter-and-dot");
    await page.waitForTimeout(HOLD);

    /* ---- d. the finding under its line ------------------------------------- */
    scene("d", "The finding under its line");
    const card = page.locator("[data-finding-id]").first();
    if ((await card.count()) === 0) {
      /* The file card is collapsed (a long file): open it. */
      await clickAt(page, fileCard(CORE_FILE), `${CORE_FILE} card header`);
      await card.waitFor({ timeout: 5000 }).catch(() => die("no finding comment under the line"));
    }
    await show(page, card, "finding comment");
    await glideTo(page, page.locator("[data-finding-label]").first(), "severity label on the row");
    await page.waitForTimeout(STEP);
    await glide(page, (await boxOf(card, "finding card")).x + 220, (await boxOf(card, "finding card")).y + 22);
    await page.waitForTimeout(STEP);
    await still("d-finding-under-line");
    const accept = card.getByRole("button", { name: "Accept", exact: true });
    await show(page, accept, "Accept / Dismiss");
    await glideTo(page, card.locator("p, div").filter({ hasText: /\w{4,}/ }).nth(3), "explanation");
    await page.waitForTimeout(HOLD);
    await glideTo(page, accept, "Accept");
    await page.waitForTimeout(BEAT);
    await glideTo(page, card.getByRole("button", { name: "Dismiss", exact: true }), "Dismiss");
    await still("d-accept-dismiss");
    await page.waitForTimeout(STEP);

    /* ---- ґ. Original order → GitHub order → back --------------------------- */
    await toTop();
    scene("g", "Original order and back");
    const pathsNow = async () => (await page.locator("[data-file-path]").allInnerTexts()).map((x) => x.trim());
    await clickAt(page, page.getByRole("button", { name: "Original order", exact: true }), "Original order");
    await page.waitForTimeout(BEAT);
    if ((await page.locator("[data-role-group]").count()) !== 0) die("Original order still shows group headers");
    facts.original_order = await pathsNow();
    await glideTo(page, page.locator("[data-file-path]").first(), "first file in GitHub order");
    await still("g-original-order");
    await page.waitForTimeout(HOLD);
    await clickAt(page, page.getByRole("button", { name: "Smart order", exact: true }), "Smart order");
    await group("core").waitFor({ timeout: 5000 }).catch(() => die("Smart order did not restore the groups"));
    await glideTo(page, group("core"), "Core logic header");
    await still("g-smart-order-again");
    await page.waitForTimeout(HOLD);

    /* ---- д. closing caption, 5 s ------------------------------------------- */
    scene("e", "Caption: why grouping calls no model");
    await page.evaluate((text) => {
      const el = document.createElement("div");
      el.id = "__dd_caption__";
      el.textContent = text;
      Object.assign(el.style, {
        position: "fixed", left: "50%", bottom: "64px", transform: "translateX(-50%)", zIndex: "2147483000",
        maxWidth: "1040px", padding: "22px 34px", borderRadius: "14px", background: "rgba(10,12,16,.94)",
        border: "1px solid rgba(255,255,255,.18)", color: "#fff", font: "600 25px/1.4 system-ui, sans-serif",
        textAlign: "center", boxShadow: "0 18px 60px rgba(0,0,0,.6)",
      });
      document.body.appendChild(el);
    }, CAPTION);
    /* Park the cursor on the page header: over the diff it would light up a row. */
    await glide(page, W - 420, 84);
    await page.waitForTimeout(600);
    await still("e-caption");
    await page.waitForTimeout(5000);

    const end = now();
    const video = page.video();
    await context.close();
    const closed = now();
    console.log(`✓ raw wall clock ${(end / 1000).toFixed(1)}s · facts ${JSON.stringify(facts, null, 1)}`);
    take = { webm: video ? await video.path() : null, scenes, cuts, end, closed, facts };
  } finally {
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

function finish({ webm, scenes, cuts, end, closed }) {
  if (!webm || !existsSync(webm)) die("no raw video was written");

  /* The recording starts with the page, a moment before t0, and ends at
   * context.close(): the raw length tells how far the two clocks are apart. */
  const rawSecs = probeSeconds(webm);
  if (rawSecs == null) die("could not read the raw video's duration");
  const lead = Math.max(0, Math.round(rawSecs * 1000 - closed));

  /* Drop everything before step a, the marked wait, and the tail after `end`. */
  const drop = [{ from: -lead, to: scenes[0].start_ms }, ...cuts.map(({ from, to }) => ({ from, to })), { from: end, to: closed + 60_000 }];
  const sec = (ms) => ((ms + lead) / 1000).toFixed(3);
  const select = drop.map((d) => `between(t,${sec(d.from)},${sec(d.to)})`).join("+");
  const filter = `fps=${FPS},select='not(${select})',setpts=N/${FPS}/TB`;
  const onCutTimeline = (ms) =>
    Math.round(ms + lead - drop.reduce((acc, d) => acc + Math.max(0, Math.min(ms, d.to) - d.from), 0));

  execFileSync(
    ffmpegPath,
    ["-y", "-i", webm, "-vf", filter, "-an", "-c:v", "libx264", "-preset", "slow", "-crf", "21",
      "-pix_fmt", "yuv420p", "-movflags", "+faststart", OUT_MP4],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  const secs = probeSeconds(OUT_MP4);
  const mb = statSync(OUT_MP4).size / 1048576;
  rmSync(VIDEO_DIR, { recursive: true, force: true });

  console.log(`\n✓ ${OUT_MP4}`);
  console.log(`  ${W}x${H} · ${secs.toFixed(1)}s · ${mb.toFixed(1)} MB · cut out ${cuts.map((c) => `${c.label} ${((c.to - c.from) / 1000).toFixed(0)}s`).join(", ") || "nothing"}`);
  for (const s of scenes) console.log(`  step ${s.scene} @ ${(Math.max(0, onCutTimeline(s.start_ms)) / 1000).toFixed(1)}s — ${s.title}`);
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
