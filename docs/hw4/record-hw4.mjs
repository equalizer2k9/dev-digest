/* DevDigest — homework #4 demo screencast (Blast Radius + devdigest-mcp).
 *
 * Drives the live studio (:3000 / :3001) through the Blast radius block of
 * three PRs and writes
 *   docs/hw4/hw4-demo.mp4        H.264, 1440x900, silent
 *   docs/hw4/.demo-frames/*.png  one still per step, to eyeball the take
 *
 *   node docs/hw4/record-hw4.mjs            record the browser part, then splice
 *   node docs/hw4/record-hw4.mjs --dry      same clicks and stills, no video
 *   node docs/hw4/record-hw4.mjs --splice   re-splice the parts already recorded
 *
 * The take is three parts:
 *   1. browser, steps a–г   recorded here            .video-raw/part-browser.mp4
 *   2. Claude Code, step ґ  a terminal clip recorded by hand, put at
 *                           docs/hw4/claude-code-clip.mp4 (any size — it is
 *                           scaled and padded to 1440x900)
 *   3. browser, step д      the closing caption      .video-raw/part-caption.mp4
 * Without the clip the script still writes hw4-demo.mp4 from parts 1 and 3 and
 * says the terminal step is missing.
 *
 * Dependencies are NOT installed here: Playwright, ffmpeg-static and the cursor
 * overlay come from the HW1 rig in "Claude outputs/screencast" (git-ignored).
 *
 * Nothing on the stand is changed and no model is called: the script only reads.
 * The caller links open GitHub in a new tab in the product; the take forces the
 * same tab so that one video holds the click, the GitHub line and the way back.
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

const DRY = process.argv.includes("--dry");
const SPLICE_ONLY = process.argv.includes("--splice");

const VIDEO_DIR = join(HERE, ".video-raw");
const PART_BROWSER = join(VIDEO_DIR, "part-browser.mp4");
const PART_CAPTION = join(VIDEO_DIR, "part-caption.mp4");
const CLIP = join(HERE, "claude-code-clip.mp4");
const OUT_MP4 = join(HERE, "hw4-demo.mp4");
const FRAMES_DIR = join(HERE, ".demo-frames");

const CLIENT = "http://localhost:3000";
const API = "http://localhost:3001";

/* The three states of the block, each on a real PR. */
const MAP = { repo: "equalizer2k9/dev-digest", number: 13, symbol: "rowsToSettings" };
const NO_CALLERS = { repo: "equalizer2k9/dev-digest", number: 14 };
const PARTIAL = { repo: "matiassingers/awesome-readme", number: 389, reason: "index_partial" };
/* Callers opened on GitHub in step в: link text → what that line must hold. */
const CALLER_LINES = [
  { label: "server/src/modules/settings/routes.ts:65", line: 65, code: "rowsToSettings(rows)" },
  { label: "server/src/modules/settings/feature-models.ts:45", line: 45, code: "rowsToSettings(rows)" },
];
const CAPTION =
  "Карта читає готовий індекс repo-intel: без виклику моделі й без повторного розбору репо";

const W = 1440;
const H = 900;
const FPS = 25;

/* Pacing: 1–2 s on every screen. */
const BEAT = 1000;
const STEP = 1500;
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

/* ---------------------------------------------------------------- preflight */

async function locate({ repo: fullName, number }) {
  const repo = (await api("/repos")).find((r) => r.full_name === fullName);
  if (!repo) die(`repo ${fullName} is not imported`);
  const pr = (await api(`/repos/${repo.id}/pulls`)).find((p) => p.number === number);
  if (!pr) die(`PR #${number} of ${fullName} is not imported`);
  return { repoId: repo.id, prId: pr.id, url: `${CLIENT}/repos/${repo.id}/pulls/${number}` };
}

/** The stand must already show the three states — the take proves, it does not stage. */
async function preflight() {
  const map = await locate(MAP);
  const none = await locate(NO_CALLERS);
  const partial = await locate(PARTIAL);

  const index = await api(`/repos/${map.repoId}/index-state`);
  if (index.status !== "full") die(`index of ${MAP.repo} is ${index.status}, not full`);

  const a = await api(`/pulls/${map.prId}/blast`);
  const entry = a.downstream.find((d) => d.symbol === MAP.symbol);
  if (!entry || entry.callers.length < 2) die(`PR #${MAP.number}: ${MAP.symbol} has fewer than 2 callers`);
  if (entry.endpoints_affected.length < 1) die(`PR #${MAP.number}: no endpoint under ${MAP.symbol}`);
  if (a.degraded) die(`PR #${MAP.number} is degraded (${a.reason})`);
  for (const c of CALLER_LINES)
    if (!entry.callers.some((x) => `${x.file}:${x.line}` === c.label)) die(`PR #${MAP.number}: caller ${c.label} is not in the map`);

  const b = await api(`/pulls/${none.prId}/blast`);
  if (b.changed_symbols.length === 0 || b.downstream.length !== 0) die(`PR #${NO_CALLERS.number} is not a "symbols, no callers" case: ${b.summary}`);

  const c = await api(`/pulls/${partial.prId}/blast`);
  if (!c.degraded || c.reason !== PARTIAL.reason) die(`PR #${PARTIAL.number} is not ${PARTIAL.reason}: degraded=${c.degraded} reason=${c.reason}`);

  console.log(`✓ #${MAP.number} ${a.summary}`);
  console.log(`✓ #${NO_CALLERS.number} ${b.summary}`);
  console.log(`✓ #${PARTIAL.number} ${c.summary} · ${c.reason}`);
  return { map, none, partial };
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

async function record({ map, none, partial }) {
  rmSync(VIDEO_DIR, { recursive: true, force: true });
  if (!DRY) mkdirSync(VIDEO_DIR, { recursive: true });
  rmSync(FRAMES_DIR, { recursive: true, force: true });
  mkdirSync(FRAMES_DIR, { recursive: true });

  const browser = await chromium.launch({ slowMo: 60 });

  /* Warm-up on a throwaway context: Next dev compiles a route on first hit and
   * the blast route loads a PR's files from GitHub on its first call — neither
   * stall may end up in the take. */
  const warm = await browser.newContext({ viewport: { width: W, height: H } });
  const wp = await warm.newPage();
  for (const u of [map.url, none.url, partial.url]) {
    await wp.goto(u, { waitUntil: "networkidle" });
    await wp.getByText("Blast radius", { exact: false }).first().waitFor({ timeout: 30_000 }).catch(() => die(`no Blast radius block on ${u}`));
  }
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
    const facts = {};
    const still = (name) => page.screenshot({ path: join(FRAMES_DIR, `${name}.png`) });
    const scene = (id, title) => {
      scenes.push({ scene: id, title, start_ms: now() });
      console.log(`▶ step ${id} — ${title} @ ${(now() / 1000).toFixed(1)}s raw`);
    };

    const card = page.locator('[data-testid="blast-card"]');
    const stat = (re) => page.getByText(re).first();
    const open = async (url, label) => {
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await stat(/^\d+ symbols?$/).waitFor({ timeout: 30_000 }).catch(() => die(`the Blast radius block never rendered on ${label}`));
      await page.waitForLoadState("networkidle");
    };

    /* ---- a. PR #13 → Overview → Blast radius: the summary row ------------- */
    await open(map.url, `PR #${MAP.number}`);
    scene("a", `PR #${MAP.number}: Overview, Blast radius summary`);
    await page.waitForTimeout(STEP);
    await glideTo(page, page.getByRole("button", { name: /^Overview/ }), "Overview tab");
    await page.waitForTimeout(BEAT);
    facts.stats = [];
    for (const re of [/^\d+ symbols?$/, /^\d+ callers?$/, /^\d+ endpoints?$/, /^\d+ crons?$/]) {
      await glideTo(page, stat(re), `stat ${re}`);
      facts.stats.push((await stat(re).innerText()).trim());
      await page.waitForTimeout(BEAT);
    }
    await still("a-summary");
    await page.waitForTimeout(BEAT);

    /* ---- б. under the symbol: callers file:line and endpoint chips -------- */
    scene("b", `${MAP.symbol}: callers and endpoints`);
    await glideTo(page, card.getByText(MAP.symbol, { exact: true }), "symbol name");
    await page.waitForTimeout(STEP);
    for (const c of CALLER_LINES) {
      /* Stop beside the link, not on it — the row's function name must stay readable. */
      await glideTo(page, card.getByRole("link", { name: c.label, exact: true }), `caller ${c.label}`);
      await page.waitForTimeout(STEP);
    }
    const chips = card.locator('[data-testid="blast-endpoints"]');
    facts.endpoints = (await chips.innerText()).split("\n").map((x) => x.trim()).filter(Boolean);
    await glideTo(page, chips, "endpoint chips");
    await still("b-callers-and-endpoints");
    await page.waitForTimeout(HOLD);

    /* ---- в. click file:line → the line on GitHub → back ------------------- */
    scene("c", "Caller links open the line on GitHub");
    facts.github = [];
    for (const c of CALLER_LINES) {
      const link = card.getByRole("link", { name: c.label, exact: true });
      const href = await link.getAttribute("href");
      /* Same tab for the take only — see the header. */
      await link.evaluate((el) => el.setAttribute("target", "_self"));
      await clickAt(page, link, `link ${c.label}`);
      await page.waitForURL(/github\.com\/.+\/blob\//, { timeout: 30_000 }).catch(() => die(`${c.label} did not open GitHub`));
      await page.waitForLoadState("domcontentloaded");
      const line = page.locator(`#LC${c.line}, [data-line-number="${c.line}"] ~ *, [data-key="${c.line - 1}"]`).first();
      await page.getByText(c.code, { exact: false }).first().waitFor({ timeout: 30_000 }).catch(() => die(`GitHub did not render the code for ${c.label}`));
      await page.waitForTimeout(STEP);
      if (!page.url().endsWith(`#L${c.line}`)) die(`GitHub opened ${page.url()}, not line ${c.line}`);
      if ((await line.count()) > 0 && (await line.boundingBox())) await glideTo(page, line, `line ${c.line}`, 120, 0);
      else await glide(page, W / 2, H / 2);
      facts.github.push(`${c.label} → ${href}`);
      await still(`c-github-${c.label.split("/").pop().replace(/[^\w.-]/g, "_")}`);
      await page.waitForTimeout(HOLD + BEAT);
      await page.goBack({ waitUntil: "domcontentloaded" });
      await card.first().waitFor({ timeout: 30_000 }).catch(() => die("the block did not come back after GitHub"));
      await page.waitForTimeout(STEP);
    }

    /* ---- г. PR #14 → no callers; #389 → incomplete index + reason --------- */
    await open(none.url, `PR #${NO_CALLERS.number}`);
    scene("d", `PR #${NO_CALLERS.number}: no callers; #${PARTIAL.number}: incomplete index`);
    await page.waitForTimeout(BEAT);
    const noCallers = page.getByText(/no downstream callers/i).first();
    await noCallers.waitFor({ timeout: 10_000 }).catch(() => die(`PR #${NO_CALLERS.number} does not show the no-callers text`));
    facts.no_callers = (await noCallers.innerText()).trim();
    await glideTo(page, stat(/^\d+ symbols?$/), "symbols stat");
    await page.waitForTimeout(BEAT);
    await glideTo(page, noCallers, "no-callers text", 0, 26);
    await still("d-no-callers");
    await page.waitForTimeout(HOLD);

    await open(partial.url, `PR #${PARTIAL.number}`);
    await page.waitForTimeout(BEAT);
    const marker = page.locator('[data-testid="blast-degraded"]');
    await marker.waitFor({ timeout: 10_000 }).catch(() => die(`PR #${PARTIAL.number} does not show the incomplete-index marker`));
    facts.marker = (await marker.innerText()).replace(/\s+/g, " ").trim();
    await glideTo(page, marker, "incomplete-index marker", 0, 44);
    await still("d-incomplete-index");
    await page.waitForTimeout(HOLD + BEAT);
    const browserEnd = now();

    /* ---- д. closing caption, 5 s — spliced in after the terminal clip ----- */
    await open(map.url, `PR #${MAP.number}`);
    await glide(page, W - 420, 84);
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
    await page.waitForTimeout(600);
    scene("e", "Caption: why the map calls no model");
    await still("e-caption");
    await page.waitForTimeout(5000);

    const end = now();
    const video = page.video();
    await context.close();
    const closed = now();
    console.log(`✓ raw wall clock ${(end / 1000).toFixed(1)}s · facts ${JSON.stringify(facts, null, 1)}`);
    take = { webm: video ? await video.path() : null, scenes, browserEnd, end, closed };
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

/** Cut the raw take into the browser part (a–г) and the caption part (д). */
function cutParts({ webm, scenes, browserEnd, end, closed }) {
  if (!webm || !existsSync(webm)) die("no raw video was written");

  /* The recording starts with the page, a moment before t0, and ends at
   * context.close(): the raw length tells how far the two clocks are apart. */
  const rawSecs = probeSeconds(webm);
  if (rawSecs == null) die("could not read the raw video's duration");
  const lead = Math.max(0, Math.round(rawSecs * 1000 - closed));
  const sec = (ms) => ((ms + lead) / 1000).toFixed(3);
  const part = (from, to, out) =>
    ffmpeg(["-i", webm, "-vf", `fps=${FPS},select='between(t,${sec(from)},${sec(to)})',setpts=N/${FPS}/TB`, ...ENCODE, out]);

  const caption = scenes.find((s) => s.scene === "e").start_ms;
  part(scenes[0].start_ms, browserEnd, PART_BROWSER);
  part(caption, end, PART_CAPTION);
  for (const f of readdirSync(VIDEO_DIR)) if (f.endsWith(".webm")) rmSync(join(VIDEO_DIR, f));

  const offset = scenes[0].start_ms;
  for (const s of scenes.filter((x) => x.scene !== "e"))
    console.log(`  step ${s.scene} @ ${((s.start_ms - offset) / 1000).toFixed(1)}s — ${s.title}`);
}

/** browser part + the hand-recorded terminal clip (if present) + caption part. */
function splice() {
  for (const f of [PART_BROWSER, PART_CAPTION]) if (!existsSync(f)) die(`${f} is missing — record first`);
  const hasClip = existsSync(CLIP);
  const inputs = hasClip ? [PART_BROWSER, CLIP, PART_CAPTION] : [PART_BROWSER, PART_CAPTION];
  const fit = `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black,fps=${FPS},setsar=1,format=yuv420p`;
  const chain = inputs.map((_, i) => `[${i}:v]${fit}[v${i}]`).join(";");
  const concat = `${inputs.map((_, i) => `[v${i}]`).join("")}concat=n=${inputs.length}:v=1:a=0[out]`;
  ffmpeg([...inputs.flatMap((f) => ["-i", f]), "-filter_complex", `${chain};${concat}`, "-map", "[out]", ...ENCODE, OUT_MP4]);

  const secs = probeSeconds(OUT_MP4);
  const mb = statSync(OUT_MP4).size / 1048576;
  console.log(`\n✓ ${OUT_MP4}`);
  console.log(`  ${W}x${H} · ${secs.toFixed(1)}s · ${mb.toFixed(1)} MB · parts: ${inputs.map((f) => `${f.split("/").pop()} ${probeSeconds(f).toFixed(1)}s`).join(" + ")}`);
  if (!hasClip) console.log(`  ⚠ step ґ (Claude Code) is NOT in the video: put the terminal clip at ${CLIP} and run with --splice.`);
  if (secs < 60 || secs > 180) console.log(`  ⚠ ${secs.toFixed(0)}s is outside the 1–3 minute target — adjust the pacing constants.`);
}

/* --------------------------------------------------------------------- main */

try {
  if (SPLICE_ONLY) {
    splice();
  } else {
    const ctx = await preflight();
    const take = await record(ctx);
    if (DRY) {
      const secs = (take.browserEnd - take.scenes[0].start_ms + (take.end - take.scenes.at(-1).start_ms)) / 1000;
      console.log(`✓ dry run ok · browser parts would be ~${secs.toFixed(0)}s, before the terminal clip`);
    } else {
      cutParts(take);
      splice();
    }
  }
} catch (e) {
  if (!(e instanceof Fatal)) throw e;
  console.error("\n✗ " + e.message + "\n");
  process.exit(1);
}
