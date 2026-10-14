/* DevDigest — homework #3 follow-up screencast (agents + Intent Layer).
 *
 * Drives the live studio (:3000 / :3001) and writes
 *   docs/hw3/hw3-intent-demo.mp4   H.264, 1440x900, silent (git-ignored)
 *   docs/hw3/.demo-frames/*.png    one still per step, to eyeball the take
 *
 *   node docs/hw3/record-hw3-intent.mjs          record
 *   node docs/hw3/record-hw3-intent.mjs --dry    same clicks and stills, no video
 *
 * Dependencies are NOT installed here: Playwright, ffmpeg-static and the cursor
 * overlay come from the HW1 rig in "Claude outputs/screencast" (git-ignored).
 *
 * The take starts from a PR with no intent and no review. There is no API to drop
 * a stored intent, so the preflight deletes the test PR's `pr_intent` row through
 * psql in the Postgres container (DATABASE_URL from server/.env), and deletes the
 * PR's runs and reviews through the API. Three steps wait on a model — Generate,
 * Recalculate and Run Review. The waits are filmed but cut out of the mp4. A
 * failed model call stops the script; it never switches a model.
 */
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
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
const OUT_MP4 = join(HERE, "hw3-intent-demo.mp4");
const FRAMES_DIR = join(HERE, ".demo-frames");

const CLIENT = "http://localhost:3000";
const API = "http://localhost:3001";
const REPO_FULL_NAME = "equalizer2k9/dev-digest";
const PR_NUMBER = 11;
const AGENT_NAME = "General Reviewer";
const INTENT_MODEL = "deepseek/deepseek-v4-flash";
const AGENTS_README = join(ROOT, ".claude", "agents", "README.md");
const CAPTION =
  "Intent визначає дешева модель з опису, issue і спеки — без коду diff; рев'юер отримує його як недовірені дані, і scope не може сховати WARNING чи CRITICAL";

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

function dropStoredIntent(prId) {
  const env = readFileSync(join(ROOT, "server", ".env"), "utf8");
  const url = env.match(/^DATABASE_URL=(.+)$/m)?.[1]?.trim();
  if (!url) die("DATABASE_URL is not set in server/.env");
  if (!/^[0-9a-f-]{36}$/.test(prId)) die("unexpected PR id");
  execFileSync(
    "docker",
    ["exec", "devdigest-postgres", "psql", url.replace("@localhost:", "@127.0.0.1:"), "-c", `delete from pr_intent where pr_id = '${prId}'`],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
}

async function preflight() {
  const repo = (await api("/repos")).find((r) => r.full_name === REPO_FULL_NAME);
  if (!repo) die(`repo ${REPO_FULL_NAME} is not imported`);
  const pr = (await api(`/repos/${repo.id}/pulls`)).find((p) => p.number === PR_NUMBER);
  if (!pr) die(`PR #${PR_NUMBER} is not imported`);
  const agent = (await api("/agents")).find((a) => a.name === AGENT_NAME);
  if (!agent) die(`agent "${AGENT_NAME}" does not exist`);
  const model = (await api("/settings")).feature_models?.review_intent?.model ?? INTENT_MODEL;
  if (model !== INTENT_MODEL) die(`Settings → Models has review_intent = ${model}, expected ${INTENT_MODEL}`);

  /* Start clean: no review, no runs, no stored intent. */
  for (const rv of await api(`/pulls/${pr.id}/reviews`)) await api(`/reviews/${rv.id}`, { method: "DELETE" });
  for (const run of await api(`/pulls/${pr.id}/runs`)) await api(`/runs/${run.run_id}`, { method: "DELETE" });
  dropStoredIntent(pr.id);
  const detail = await api(`/pulls/${pr.id}`); // resync: title, body, head
  if (!/Closes #\d+/.test(detail.body ?? "")) die("the PR description has no `Closes #N` line");
  if ((await api(`/pulls/${pr.id}/intent`)).intent !== null) die("the PR still has a stored intent");

  console.log(`✓ repo ${repo.id} · PR #${PR_NUMBER} ${pr.id} · no intent, no runs`);
  console.log(`✓ review_intent ${model} · agent ${AGENT_NAME} on ${agent.model}`);
  return { repoId: repo.id, prId: pr.id };
}

/* A tiny Markdown → HTML pass, enough for .claude/agents/README.md: headings,
 * one fenced block, one table, a bullet list, inline code and links. */
function readmeHtml() {
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = (s) =>
    esc(s)
      .replace(/\\\|/g, "|")
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "<b>$1</b>");
  const cells = (row) => row.replace(/^\||\|$/g, "").split(/(?<!\\)\|/).map((c) => c.trim());
  const lines = readFileSync(AGENTS_README, "utf8").split("\n");
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l.startsWith("```")) {
      const buf = [];
      for (i++; i < lines.length && !lines[i].startsWith("```"); i++) buf.push(lines[i]);
      out.push(`<pre id="pipeline">${esc(buf.join("\n"))}</pre>`);
    } else if (l.startsWith("# ")) out.push(`<h1>${inline(l.slice(2))}</h1>`);
    else if (l.startsWith("|") && lines[i + 1]?.startsWith("|---")) {
      const head = cells(l);
      const rows = [];
      for (i += 2; i < lines.length && lines[i].startsWith("|"); i++) rows.push(cells(lines[i]));
      i--;
      out.push(
        `<table id="agents"><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>` +
          rows.map((r) => `<tr data-agent="${esc(r[0].replace(/\[|\].*$/g, ""))}">${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("") +
          "</tbody></table>",
      );
    } else if (l.startsWith("- ")) {
      const buf = [l.slice(2)];
      while (lines[i + 1]?.startsWith("  ")) buf.push(lines[++i].trim());
      out.push(`<li>${inline(buf.join(" "))}</li>`);
    } else if (l.trim()) out.push(`<p>${inline(l)}</p>`);
  }
  return `<!doctype html><meta charset="utf-8"><title>.claude/agents/README.md</title><style>
    body{margin:0;background:#0d1117;color:#e6edf3;font:15px/1.5 system-ui,sans-serif}
    header{padding:14px 40px;border-bottom:1px solid #30363d;font:600 14px ui-monospace,monospace;color:#9da7b3}
    main{padding:8px 40px 60px;max-width:1360px}
    h1{font-size:28px;margin:18px 0 6px} p{color:#c9d1d9;margin:8px 0}
    pre{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:16px 20px;font:600 16px/1.6 ui-monospace,monospace;color:#79c0ff}
    table{border-collapse:collapse;width:100%;font-size:13px;margin:14px 0}
    th,td{border:1px solid #30363d;padding:7px 10px;text-align:left;vertical-align:top}
    th{background:#161b22} td:first-child{white-space:nowrap;color:#79c0ff}
    code{background:#1f2630;border-radius:4px;padding:1px 5px;font:12px ui-monospace,monospace}
    li{margin:6px 0 6px 18px;color:#c9d1d9;font-size:13px}
  </style><header>.claude/agents/README.md</header><main>${out.join("\n")}</main>`;
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
  const settingsUrl = `${CLIENT}/settings/models`;

  /* Warm-up on a throwaway context: Next dev compiles a route on first hit, and
   * that stall must not end up in the take. */
  const warm = await browser.newContext({ viewport: { width: W, height: H } });
  const wp = await warm.newPage();
  for (const u of [settingsUrl, prUrl, prUrl + "?tab=runs", prUrl + "?tab=diff"]) await wp.goto(u, { waitUntil: "networkidle" });
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
    const card = page.locator("section", { has: page.getByText("Intent", { exact: true }) }).first();
    const label = (text) => card.getByText(text, { exact: true }).first();
    /** Film the start and the end of a model wait, cut the middle. */
    const cutWait = (name, from) => {
      if (now() - from > KEEP_HEAD + KEEP_TAIL + 500) cuts.push({ label: name, from: from + KEEP_HEAD, to: now() - KEEP_TAIL });
    };

    /* ---- a. the eight agents and the pipeline ------------------------------ */
    await page.setContent(readmeHtml(), { waitUntil: "load" });
    scene("a", "Agents: eight roles and the pipeline");
    await page.waitForTimeout(STEP);
    await glideTo(page, page.locator("#pipeline"), "pipeline");
    await page.waitForTimeout(HOLD);
    for (const name of ["researcher", "test-writer", "security-reviewer", "doc-writer"]) {
      await glideTo(page, page.locator(`tr[data-agent="${name}"] td`).first(), `${name} row`);
      await page.waitForTimeout(BEAT);
    }
    facts.agents = await page.locator("#agents tbody tr").count();
    if (facts.agents !== 8) die(`the README table lists ${facts.agents} agents, expected 8`);
    await still("a-agents-readme");
    await page.waitForTimeout(BEAT);

    /* ---- b. Settings → Models → Review intent ------------------------------ */
    await page.goto(settingsUrl, { waitUntil: "networkidle" });
    const row = page.getByText("PR Review · Intent", { exact: true });
    await row.waitFor({ timeout: 30_000 }).catch(() => die("Settings → Models has no PR Review · Intent row"));
    scene("b", "Settings → Models: the Review intent row");
    await page.waitForTimeout(BEAT);
    await glideTo(page, row, "Review intent label");
    await page.waitForTimeout(BEAT);
    const value = page.getByText(new RegExp(INTENT_MODEL.replace(/[/.]/g, "\\$&"))).nth(1);
    await glideTo(page, value, "Review intent model");
    facts.review_intent = (await value.innerText()).replace(/\s+/g, " ").trim();
    await still("b-settings-review-intent");
    await page.waitForTimeout(HOLD);

    /* ---- c. PR #11 → Overview → no intent yet ------------------------------ */
    await page.goto(prUrl, { waitUntil: "networkidle" });
    await page.getByText("No intent yet").waitFor({ timeout: 30_000 }).catch(() => die("the IntentCard is not in its empty state"));
    scene("c", "PR #11 → Overview: no intent yet");
    await page.waitForTimeout(BEAT);
    await glideTo(page, page.getByText("No intent yet"), "empty card");
    await page.waitForTimeout(STEP);
    await glideTo(page, page.getByText(/Closes #\d+/).first(), "Closes line in the description");
    await page.waitForTimeout(STEP);
    await still("c-no-intent-yet");

    /* ---- d. Generate → wait (cut) → the card and its sources --------------- */
    scene("d", "Generate: summary, scope, confidence, sources");
    await clickAt(page, card.getByRole("button", { name: "Generate", exact: true }), "Generate");
    let from = now();
    await card.getByRole("button", { name: "Recalculate", exact: true }).waitFor({ timeout: RUN_TIMEOUT }).catch(async () => {
      const alert = (await page.locator('[role="alert"]').allInnerTexts()).join(" ");
      die(`Generate produced no intent${alert ? `: ${alert}` : ""} — stopping, no model was switched`);
    });
    await page.waitForTimeout(KEEP_TAIL + 300);
    cutWait("generate", from);
    const intent = (await api(`/pulls/${prId}/intent`)).intent;
    facts.intent = { confidence: intent.confidence, sources: intent.sources.map((s) => `${s.kind}:${s.ref}:${s.status}`), summary: intent.intent };
    for (const kind of ["pr_description", "linked_issue", "spec_file"])
      if (!intent.sources.some((s) => s.kind === kind && s.status === "used")) die(`source ${kind} was not used: ${JSON.stringify(facts.intent.sources)}`);
    await glideTo(page, label("Summary"), "Summary");
    await page.waitForTimeout(STEP);
    await glideTo(page, label("In scope"), "In scope");
    await page.waitForTimeout(STEP);
    await glideTo(page, label("Out of scope"), "Out of scope");
    await page.waitForTimeout(HOLD);
    await glideTo(page, card.getByText(/confidence$/).first(), "confidence badge");
    await page.waitForTimeout(BEAT);
    await still("d-intent-card");
    await glideTo(page, label("Sources"), "Sources");
    await page.waitForTimeout(BEAT);
    for (const text of ["PR description", "Linked issue", "Spec file"]) {
      await glideTo(page, card.getByText(text, { exact: true }).first(), `${text} source`, 120, 0);
      await page.waitForTimeout(BEAT);
    }
    await still("d-intent-sources");
    await page.waitForTimeout(BEAT);

    /* ---- e. Recalculate → exactly one more call ---------------------------- */
    scene("e", "Recalculate");
    const recalc = page.waitForResponse((r) => r.url().includes("/intent/recalculate"), { timeout: RUN_TIMEOUT });
    await clickAt(page, card.getByRole("button", { name: "Recalculate", exact: true }), "Recalculate");
    from = now();
    await page.waitForTimeout(400);
    await still("e-recalculating");
    const res = await recalc;
    if (!res.ok()) die(`Recalculate answered HTTP ${res.status()} — stopping, no model was switched`);
    await page.waitForTimeout(KEEP_TAIL + 300);
    cutWait("recalculate", from);
    await still("e-recalculated");
    await page.waitForTimeout(BEAT);

    /* ---- f. Run Review → wait (cut) → the review result -------------------- */
    await page.locator("main").first().evaluate((el) => el.scrollTo({ top: 0, behavior: "smooth" }));
    await page.waitForTimeout(800);
    scene("f", "Run Review and its result");
    await clickAt(page, page.getByRole("button", { name: "Run Review", exact: true }), "Run Review");
    const agentItem = page.getByText(AGENT_NAME, { exact: true }).first();
    await agentItem.waitFor({ timeout: 5000 }).catch(() => die("the Run Review menu did not open"));
    await page.waitForTimeout(BEAT);
    await clickAt(page, agentItem, `${AGENT_NAME} in the menu`);
    from = now();
    let run;
    const deadline = Date.now() + RUN_TIMEOUT;
    for (;;) {
      await page.waitForTimeout(2000);
      run = (await api(`/pulls/${prId}/runs`))[0];
      if (run && !["running", "queued", "pending"].includes(run.status)) break;
      if (Date.now() > deadline) die("the review run did not finish in time");
    }
    if (run.status !== "done") die(`the review run ended as ${run.status}${run.error ? `: ${run.error}` : ""} — stopping, no model was switched`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(KEEP_TAIL + 500);
    cutWait("review run", from);
    const findings = (await api(`/pulls/${prId}/reviews`)).flatMap((rv) => rv.findings);
    facts.findings = findings.map((f) => `${f.severity} ${f.file}:${f.start_line} ${f.title}`);
    facts.run_seconds = Math.round((now() - from) / 1000);
    await clickAt(page, page.getByRole("button", { name: /^Agent runs/ }), "Agent runs tab");
    await page.waitForTimeout(STEP);
    const runRow = page.getByText(AGENT_NAME, { exact: true }).first();
    await glideTo(page, runRow, "the finished run");
    await page.waitForTimeout(STEP);
    await still("f-review-result");
    const firstFinding = page.locator("[data-finding-id]").first();
    if ((await firstFinding.count()) > 0) {
      await show(page, firstFinding, "first finding");
      await glideTo(page, firstFinding, "first finding", -200, 0);
      await page.waitForTimeout(HOLD);
      await still("f-review-finding");
    } else {
      await page.waitForTimeout(STEP);
    }

    /* ---- g. closing caption, 5 s ------------------------------------------- */
    scene("g", "Caption: how the intent is derived and used");
    await page.evaluate((text) => {
      const el = document.createElement("div");
      el.id = "__dd_caption__";
      el.textContent = text;
      Object.assign(el.style, {
        position: "fixed", left: "50%", bottom: "64px", transform: "translateX(-50%)", zIndex: "2147483000",
        width: "1080px", padding: "22px 34px", borderRadius: "14px", background: "rgba(10,12,16,.94)",
        border: "1px solid rgba(255,255,255,.18)", color: "#fff", font: "600 24px/1.4 system-ui, sans-serif",
        textAlign: "center", boxShadow: "0 18px 60px rgba(0,0,0,.6)",
      });
      document.body.appendChild(el);
    }, CAPTION);
    await glide(page, W - 420, 84);
    await page.waitForTimeout(600);
    await still("g-caption");
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
  if (secs < 60 || secs > 120) console.log(`  ⚠ ${secs.toFixed(0)}s is outside the 1–2 minute target — adjust the pacing constants.`);
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
