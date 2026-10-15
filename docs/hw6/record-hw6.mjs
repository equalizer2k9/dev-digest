/* DevDigest — homework #6 demo screencast (Eval Pipeline, SPEC-03).
 *
 * Drives the live studio (:3000 / :3001):
 *   a. PR #21: a dismissed finding → "Turn into eval case" (must_not_flag);
 *   b. PR #6: an accepted finding → "Turn into eval case" (must_find) → Evals tab, 10 cases;
 *   c. Run eval with prompt v1 → live status → metrics, N/M, cost;
 *   d. prompt v2 (+ the INV-1 rule) → Run eval → Compare v1 ↔ v2 (recall ↑, INV-1 case, prompt diff);
 *      if v1 itself already caught INV-1 (no delta), v2b ("security only") → Compare v1 ↔ v2b (recall ↓);
 *   e. prompt v3 (flag everything) → Run eval → Compare v1 ↔ v3 (precision ↓ when v3's noise lands in the
 *      must_not_flag zone — 1 in 6 before recording; otherwise the caption states what the run shows);
 *   f. prompt back to v1 → Eval Dashboard;
 *   g. 10 s on the lab (evals/, docs/hw6/lab/report.md) on GitHub;
 *   h. closing caption.
 * and writes
 *   docs/hw6/hw6-demo.mp4         H.264, 1440x900, silent (git-ignored)
 *   docs/hw6/.demo-frames/*.png   one still per step
 *   docs/hw6/compare-*.png        the Compare pages
 *
 *   node docs/hw6/record-hw6.mjs           record one take
 *   node docs/hw6/record-hw6.mjs --check   preflight only, writes nothing
 *   node docs/hw6/record-hw6.mjs --reset   undo a failed take: delete its two cases and its runs, prompt back to v1
 *
 * The take CHANGES the stand: it creates two eval cases, starts 3–4 eval runs (real model
 * calls, ≈$0.005 each) and saves the agent 3–4 times (each save is a new agent version).
 * Waiting for a run is cut out of the video. A run is never retried and the model is never
 * switched; if Compare v1 ↔ v2 (or v2b) shows no recall delta the take stops — run --reset and record again.
 *
 * Dependencies are NOT installed here: Playwright, ffmpeg-static and the cursor overlay
 * come from the HW1 rig in "Claude outputs/screencast" (git-ignored).
 */
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
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
const STATE = join(VIDEO_DIR, "take.json");
const OUT_MP4 = join(HERE, "hw6-demo.mp4");
const FRAMES_DIR = join(HERE, ".demo-frames");
const PROMPTS = join(HERE, "prompts");

const CLIENT = "http://localhost:3000";
const API = "http://localhost:3001";
const REPO = "equalizer2k9/dev-digest";
const BRANCH = "feat/homework-6";
const AGENT = "General Reviewer";
const BASE_CASES = 8;

/** The two findings turned into cases on camera. */
const MNF = { pr: 21, id: "4d9c1787-4d61-460c-b631-8782fcdfc77b", title: /Passing\W+undefined\W+to Drizzle/ };
const MF = { pr: 6, id: "d880bbac-0472-45c4-9340-995d006fc9e2", title: /N\+1 query pattern inside loop/ };
const INV1 = /violating INV-1/;

const V1 = readFileSync(join(PROMPTS, "general-reviewer-v1.md"), "utf8").replace(/\n$/, "");
const V3 = readFileSync(join(PROMPTS, "general-reviewer-v3.md"), "utf8").replace(/\n$/, "");
const V2_LINE = readFileSync(join(PROMPTS, "general-reviewer-v2.md"), "utf8").replace(/\n$/, "").slice(V1.length);
const V2B_LINE = "\n- Report only security vulnerabilities; ignore performance, correctness and style issues.";

const C = {
  intro: "ДЗ №6 · Eval Pipeline: рішення Accept / Dismiss стають повторюваним тестом рев'ю-агента",
  mnf: "Відхилена знахідка → кейс must_not_flag: агент НЕ має флагати ці рядки (drizzle and() сам пропускає undefined)",
  mf: "Прийнята знахідка → кейс must_find: агент має знайти N+1 на цих рядках",
  set: "Набір агента: 10 кейсів, обидва типи. Вхід заморожено (diff файлу + PR), очікування — file:line",
  run: "Run eval: один виклик моделі на кейс через той самий рушій і grounding-гейт, що й рев'ю PR",
  v1: "v1: recall, precision, citation, N/M і вартість — порахував код, не модель",
  v2: "v2 = v1 + правило: route handler не ходить у БД напряму — доступ до даних через repository",
  v2b: "v1 уже знайшов INV-1, тож дельти немає. v2b = v1 + «лише вразливості безпеки» — recall має впасти",
  cmp2: "Compare v1 ↔ v2: дельта recall, кейс змінив статус, diff промпта",
  cmp2b: "Compare v1 ↔ v2b: recall ↓ — агент перестав шукати не-безпекові баги",
  v3: "v3 = v1 + «флагай усе як WARNING, щонайменше три знахідки на файл»",
  cmp3: "Compare v1 ↔ v3: precision ↓ — шум влучив у зону must_not_flag",
  restore: "Промпт повернуто до v1 (це нова версія з текстом v1). Eval Dashboard — усі агенти з наборами",
  lab: "Лаба L06: evals/ — харнес-еви скілів, сабагентів і AGENTS.md; звіт — docs/hw6/lab/report.md",
};
const FINAL =
  "Очікування — file:line, тому скоринг рахує код, а не модель: дешево, детерміновано, без судді, якого теж довелося б перевіряти";

const W = 1440;
const H = 900;
const FPS = 25;
const BEAT = 900;
const STEP = 1300;
const HOLD = 2200;
const RUN_LIMIT_MS = 30 * 60_000;

class Fatal extends Error {}
const die = (msg) => {
  throw new Fatal(msg);
};

async function api(path, init) {
  const res = await fetch(API + path, init);
  if (!res.ok) die(`${init?.method ?? "GET"} ${path} → HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.status === 204 ? null : res.json();
}
const put = (path, body) =>
  api(path, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

function psql(sqlText) {
  return execFileSync("docker", ["exec", "devdigest-postgres", "psql", "-U", "devdigest", "-d", "devdigest", "-At", "-c", sqlText], {
    encoding: "utf8",
  }).trim();
}

const loadState = () => (existsSync(STATE) ? JSON.parse(readFileSync(STATE, "utf8")) : { runs: [] });
const saveState = (s) => {
  mkdirSync(VIDEO_DIR, { recursive: true });
  writeFileSync(STATE, JSON.stringify(s, null, 1));
};

/* ---------------------------------------------------------------- preflight */

async function preflight() {
  const repo = (await api("/repos")).find((r) => r.full_name === REPO);
  if (!repo) die(`repo ${REPO} is not imported`);
  const pulls = await api(`/repos/${repo.id}/pulls`);
  for (const n of [MNF.pr, MF.pr]) if (!pulls.some((p) => p.number === n)) die(`PR #${n} is not imported`);
  const agent = (await api("/agents")).find((a) => a.name === AGENT);
  if (!agent) die(`agent "${AGENT}" not found`);
  if (agent.system_prompt !== V1) die(`the agent's prompt is not v1 — run --reset`);

  const ov = await api(`/agents/${agent.id}/evals`);
  if (ov.runs.some((r) => r.status === "running")) die("a run of the agent is still running");
  if (ov.cases.some((c) => [MNF.id, MF.id].includes(c.source_finding_id))) die("a video case already exists — run --reset");
  if (ov.cases.length !== BASE_CASES) die(`expected ${BASE_CASES} cases before the take, found ${ov.cases.length}`);

  const decided = psql(
    `select id, accepted_at is not null, dismissed_at is not null from findings where id in ('${MNF.id}','${MF.id}') order by id`,
  );
  if (!decided.includes(`${MNF.id}|f|t`) || !decided.includes(`${MF.id}|t|f`))
    die(`${MNF.id.slice(0, 8)} must be dismissed and ${MF.id.slice(0, 8)} accepted:\n${decided}`);

  try {
    await fetch(CLIENT, { signal: AbortSignal.timeout(20_000) });
  } catch {
    die(`the studio is not up on ${CLIENT}`);
  }
  console.log(`✓ ${AGENT} v${agent.version} (prompt = v1) · ${ov.cases.length} cases · ${ov.runs.length} earlier runs`);
  return {
    agentId: agent.id,
    repoId: repo.id,
    pr: (n) => `${CLIENT}/repos/${repo.id}/pulls/${n}?tab=findings`,
    evals: `${CLIENT}/agents/${agent.id}?tab=evals`,
    config: `${CLIENT}/agents/${agent.id}?tab=config`,
  };
}

async function reset() {
  const agent = (await api("/agents")).find((a) => a.name === AGENT);
  if (!agent) die(`agent "${AGENT}" not found`);
  const ov = await api(`/agents/${agent.id}/evals`);
  for (const c of ov.cases.filter((x) => [MNF.id, MF.id].includes(x.source_finding_id))) {
    await api(`/agents/${agent.id}/evals/cases/${c.id}`, { method: "DELETE" });
    console.log(`  deleted case ${c.id.slice(0, 8)} ${c.name}`);
  }
  const { runs } = loadState();
  /* Runs have no delete route (NG11); the take's own runs go straight from the table. */
  for (const id of runs) console.log(`  deleted run ${id.slice(0, 8)}: ${psql(`delete from eval_runs where id='${id}'`)}`);
  saveState({ runs: [] });
  if (agent.system_prompt !== V1) {
    const a = await put(`/agents/${agent.id}`, { system_prompt: V1 });
    console.log(`  prompt back to v1 (agent v${a.version})`);
  }
  console.log("✓ reset done");
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
  for (const f of existsSync(VIDEO_DIR) ? readdirSync(VIDEO_DIR) : []) if (f.endsWith(".webm")) rmSync(join(VIDEO_DIR, f));
  const state = loadState();

  const browser = await chromium.launch({ slowMo: 60 });
  const github = (kind, path) => `https://github.com/${REPO}/${kind}/${BRANCH}/${path}`;

  /* Warm-up: Next dev compiles a route on first hit. Reads only. */
  const warm = await browser.newContext({ viewport: { width: W, height: H } });
  const wp = await warm.newPage();
  for (const u of [ctx.pr(MNF.pr), ctx.pr(MF.pr), ctx.evals, ctx.config, `${CLIENT}/eval`, `${CLIENT}/eval/compare?a=x&b=y`])
    await wp.goto(u, { waitUntil: "networkidle" });
  for (const u of [github("tree", "evals"), github("blob", "docs/hw6/lab/report.md")]) await wp.goto(u, { waitUntil: "domcontentloaded" });
  await warm.close();

  const context = await browser.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: 1,
    recordVideo: { dir: VIDEO_DIR, size: { width: W, height: H } },
  });
  await context.addInitScript({ path: join(RIG, "cursor-overlay.js") });
  /* Agent and eval pages have no repo in their path: the switcher falls back to its
   * stored choice, which a fresh browser lacks — pick the repo the switcher's way. */
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
    const keep = []; // [from, to] ranges of the raw take that stay in the video
    let open = null;
    const resume = () => (open = now());
    const cut = () => {
      if (open !== null) keep.push([open, now()]);
      open = null;
    };
    const facts = { runs: {} };
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
    /* The card of one finding (data-finding-id) and its own control. */
    const cardOf = (id) => page.locator(`[data-finding-id="${id}"]`).first();
    const turnIntoOf = (id) => cardOf(id).getByRole("button", { name: "Turn into eval case" });
    const expectEnabled = async (loc) => {
      await loc.first().waitFor({ timeout: 10_000 }).catch(() => die("no Turn into eval case in the expanded card"));
      if (await loc.first().isDisabled()) die("Turn into eval case is disabled in the expanded card");
    };
    const toast = (re) => page.getByText(re).first().waitFor({ timeout: 15_000 });

    /* ---- a. PR #21: dismissed finding → must_not_flag -------------------- */
    await goto(ctx.pr(MNF.pr), C.intro);
    const mnfTitle = cardOf(MNF.id).getByText(MNF.title).first();
    await mnfTitle.waitFor({ timeout: 30_000 }).catch(() => die(`no finding ${MNF.title} on PR #${MNF.pr}`));
    resume();
    scene("a", `PR #${MNF.pr}: dismissed finding → must_not_flag`);
    await page.waitForTimeout(STEP);
    await caption(page, C.mnf);
    if ((await turnIntoOf(MNF.id).count()) === 0) await clickAt(page, mnfTitle, "must_not_flag finding title");
    else await glideTo(page, mnfTitle, "must_not_flag finding title");
    let turnInto = turnIntoOf(MNF.id);
    await expectEnabled(turnInto);
    await turnInto.first().waitFor({ timeout: 10_000 }).catch(() => die("the expanded card has no enabled Turn into eval case"));
    await page.waitForTimeout(BEAT);
    await still("a1-dismissed-finding");
    await page.waitForTimeout(HOLD);
    await clickAt(page, turnInto, "Turn into eval case (must_not_flag)");
    await toast(/Added to .*eval set/).catch(() => die("no confirmation toast after creating the must_not_flag case"));
    await still("a2-case-created");
    await page.waitForTimeout(HOLD);

    /* ---- b. PR #6: accepted finding → must_find → Evals tab --------------- */
    scene("b", `PR #${MF.pr}: accepted finding → must_find; Evals tab`);
    await goto(ctx.pr(MF.pr), C.mf);
    const grRun = page.getByRole("button", { name: /^General Reviewer .*2 findings/ }).first();
    await grRun.waitFor({ timeout: 20_000 }).catch(() => die(`no General Reviewer run with 2 findings on PR #${MF.pr}`));
    if ((await cardOf(MF.id).count()) === 0) await clickAt(page, grRun, "General Reviewer run");
    const mfTitle = cardOf(MF.id).getByText(MF.title).first();
    await mfTitle.waitFor({ timeout: 10_000 }).catch(() => die(`no finding ${MF.title} on PR #${MF.pr}`));
    await page.waitForTimeout(BEAT);
    if ((await turnIntoOf(MF.id).count()) === 0) await clickAt(page, mfTitle, "must_find finding title");
    else await glideTo(page, mfTitle, "must_find finding title");
    await page.waitForTimeout(BEAT);
    await still("b1-accepted-finding");
    turnInto = turnIntoOf(MF.id);
    await expectEnabled(turnInto);
    await clickAt(page, turnInto, "Turn into eval case (must_find)");
    await toast(/Added to .*eval set/).catch(() => die("no confirmation toast after creating the must_find case"));
    await page.waitForTimeout(STEP);

    await goto(ctx.evals, C.set);
    await page.getByRole("button", { name: "Run eval (10)" }).waitFor({ timeout: 15_000 }).catch(() => die('no "Run eval (10)"'));
    const mustNot = page.getByText("Must not flag").first();
    await glideTo(page, mustNot, "must_not_flag badge", 150, 0);
    await still("b2-evals-tab-10-cases");
    await page.waitForTimeout(HOLD + BEAT);

    /* Run the eval from the tab, cut the wait, come back to the finished run. */
    const runEval = async (label, captionText) => {
      await caption(page, captionText ?? C.run);
      const btn = page.getByRole("button", { name: "Run eval (10)" });
      await clickAt(page, btn, "Run eval (10)");
      await page.getByText(/Running 10 cases…/).first().waitFor({ timeout: 15_000 }).catch(() => die("no running status line"));
      await page.waitForTimeout(STEP);
      await still(`${label}-running`);
      await page.waitForTimeout(BEAT);
      const runId = (await api(`/agents/${ctx.agentId}/evals`)).runs.find((r) => r.status === "running")?.id;
      if (!runId) die("the started run is not in the overview");
      state.runs.push(runId);
      saveState(state);
      cut();
      const deadline = Date.now() + RUN_LIMIT_MS;
      let run;
      for (;;) {
        run = (await api(`/agents/${ctx.agentId}/evals`)).runs.find((r) => r.id === runId);
        if (run.status !== "running") break;
        if (Date.now() > deadline) die(`run ${runId} still running after ${RUN_LIMIT_MS / 60000} min`);
        await page.waitForTimeout(5000);
      }
      if (run.status !== "completed") die(`run ${label} ${run.status}: ${run.error}`);
      await page.getByText(/Running 10 cases…/).first().waitFor({ state: "detached", timeout: 15_000 }).catch(() => {});
      await page.waitForTimeout(1500);
      resume();
      facts.runs[label] = {
        id: runId, version: run.agent_version, recall: run.recall, precision: run.precision,
        citation: run.citation_accuracy, passed: `${run.passed}/${run.total}`, cost: run.cost_usd,
        errors: run.has_errors, secs: Math.round((Date.parse(run.finished_at) - Date.parse(run.started_at)) / 1000),
      };
      console.log(`  ${label}: ${JSON.stringify(facts.runs[label])}`);
      return run;
    };

    /* ---- c. v1 run -------------------------------------------------------- */
    scene("c", "Run eval v1 → metrics");
    const v1 = await runEval("c-v1");
    await caption(page, C.v1);
    await glideTo(page, page.getByText("RECALL").first(), "metrics");
    await still("c2-v1-metrics");
    await page.waitForTimeout(HOLD + BEAT);
    await glideTo(page, page.getByText("Run history").first(), "run history", 0, 80);
    await page.waitForTimeout(HOLD);

    /* Save a prompt in the Config tab; `type` appends visibly, otherwise fill. */
    const setPrompt = async (text, { type, captionText, frame }) => {
      await goto(ctx.config, captionText);
      const area = page.locator("textarea").first();
      await area.waitFor({ timeout: 15_000 }).catch(() => die("no prompt textarea on the Config tab"));
      await clickAt(page, area, "system prompt");
      if (type) {
        /* Start from v1 so the typed line is the only change (v2b must not keep v2's line). */
        if ((await area.inputValue()) !== V1) await area.fill(V1);
        await page.keyboard.press("Control+End");
        await page.keyboard.type(type, { delay: 12 });
      } else {
        await area.fill(text);
        await area.evaluate((el) => (el.scrollTop = el.scrollHeight));
      }
      await page.waitForTimeout(BEAT);
      await still(frame);
      await page.waitForTimeout(STEP);
      await clickAt(page, page.getByRole("button", { name: "Save agent" }), "Save agent");
      await toast(/Agent saved \(v\d+\)/).catch(() => die("no save toast"));
      await page.waitForTimeout(BEAT);
      const agent = await api(`/agents/${ctx.agentId}`);
      const want = text ?? null;
      if (want !== null && agent.system_prompt !== want) die("the saved prompt differs from the intended text");
      return agent;
    };

    /* Compare two runs through the history checkboxes and assert the delta. */
    const compare = async (a, b, frame, captionText, added) => {
      await goto(ctx.evals, captionText);
      for (const r of [a, b]) {
        const box = page.getByRole("checkbox", { name: r.started_at });
        await clickAt(page, box, `history checkbox ${r.id.slice(0, 8)}`);
        await page.waitForTimeout(400);
      }
      await clickAt(page, page.getByRole("button", { name: "Compare selected" }), "Compare selected");
      await page.waitForURL(/\/eval\/compare\?/, { timeout: 15_000 });
      await page.getByText("Prompt diff").first().waitFor({ timeout: 15_000 }).catch(() => die("Compare did not render"));
      await page.waitForLoadState("networkidle").catch(() => {});
      await caption(page, captionText);
      await glide(page, W / 2, 260);
      await page.waitForTimeout(STEP);
      await page.screenshot({ path: join(HERE, `${frame}.png`), fullPage: true });
      await still(`${frame}-top`);
      await page.waitForTimeout(HOLD);
      const changed = page.getByText("Changed cases").first();
      if (await changed.count()) {
        await glideTo(page, changed, "changed cases", 0, 60);
        await page.waitForTimeout(HOLD);
      }
      await glideTo(page, page.getByText("Prompt diff").first(), "prompt diff", 0, 90);
      await page.waitForTimeout(BEAT);
      /* The change sits at the end of a long prompt: show the added line itself. */
      await glideTo(page, page.getByText(added).last(), "added prompt line", -200, 0);
      await still(`${frame}-prompt-diff`);
      await page.waitForTimeout(HOLD + BEAT);
    };

    const pp = (d) => (d == null ? "n/a" : `${d > 0 ? "+" : d < 0 ? "−" : ""}${Math.abs(Math.round(d * 100))} pp`);
    const cmpApi = (a, b) => api(`/evals/compare?a=${a.id}&b=${b.id}`);

    /* ---- d. v2 (+ INV-1 rule) → Compare v1 ↔ v2; v2b fallback ------------ */
    scene("d", "prompt v2 → run → Compare v1 ↔ v2");
    await setPrompt(V1 + V2_LINE, { type: V2_LINE, captionText: C.v2, frame: "d1-prompt-v2" });
    await goto(ctx.evals);
    const v2 = await runEval("d-v2");
    let c2 = await cmpApi(v1, v2);
    const invChanged = c2.changed.some((c) => INV1.test(c.name) && c.earlier !== "passed" && c.later === "passed");
    facts.cmp_v1_v2 = { delta: c2.delta, changed: c2.changed.map((c) => `${c.name.slice(0, 40)}: ${c.earlier}→${c.later}`) };
    if ((c2.delta.recall ?? 0) > 0 && invChanged) {
      await compare(v1, v2, "compare-v1-v2", `Compare v1 ↔ v2: recall ${pp(c2.delta.recall)}, кейс INV-1 Failed → Passed, diff промпта`, /must not query the database directly/);
    } else {
      const v1CaughtInv = !c2.changed.some((c) => INV1.test(c.name));
      if (!v1CaughtInv) die(`v1 ↔ v2: no recall gain on INV-1 (${JSON.stringify(facts.cmp_v1_v2)}) — run --reset and retake`);
      await compare(v1, v2, "compare-v1-v2", `Compare v1 ↔ v2: recall ${pp(c2.delta.recall)} — v1 сам знайшов INV-1, правилу нічого виправляти; інші зміни — шум моделі`, /must not query the database directly/);
      scene("d2", "v1 caught INV-1 → v2b (security only) → Compare v1 ↔ v2b");
      await setPrompt(V1 + V2B_LINE, { type: V2B_LINE, captionText: C.v2b, frame: "d3-prompt-v2b" });
      await goto(ctx.evals);
      const v2b = await runEval("d-v2b");
      const c2b = await cmpApi(v1, v2b);
      facts.cmp_v1_v2b = { delta: c2b.delta };
      if (!((c2b.delta.recall ?? 0) < 0)) die(`v1 ↔ v2b: recall did not fall (${JSON.stringify(c2b.delta)}) — run --reset and retake`);
      await compare(v1, v2b, "compare-v1-v2b", `Compare v1 ↔ v2b: recall ${pp(c2b.delta.recall)} — агент перестав шукати не-безпекові баги`, /Report only security vulnerabilities/);
    }

    /* ---- e. v3 (flag everything) → Compare v1 ↔ v3 ----------------------- */
    scene("e", "prompt v3 → run → Compare v1 ↔ v3");
    await setPrompt(V3, { captionText: C.v3, frame: "e1-prompt-v3" });
    await goto(ctx.evals);
    const v3 = await runEval("e-v3");
    const c3 = await cmpApi(v1, v3);
    facts.cmp_v1_v3 = { delta: c3.delta, changed: c3.changed.map((c) => `${c.name.slice(0, 40)}: ${c.earlier}→${c.later}`) };
    /* v3 hits the one must_not_flag zone rarely (1 in 6 before recording): the take goes
     * on either way and the caption states what this run actually shows. */
    const cmp3Text =
      (c3.delta.precision ?? 0) < 0
        ? C.cmp3
        : `Compare v1 ↔ v3: precision ${pp(c3.delta.precision)} — шум v3 не влучив у єдину зону must_not_flag (збіг лише за рядками); citation ${pp(c3.delta.citation_accuracy)}, recall ${pp(c3.delta.recall)}`;
    facts.cmp_v1_v3.caption = cmp3Text;
    await compare(v1, v3, "compare-v1-v3", cmp3Text, /at least three findings/);

    /* ---- f. prompt back to v1 → Eval Dashboard ---------------------------- */
    scene("f", "prompt back to v1 → Eval Dashboard");
    const restored = await setPrompt(V1, { captionText: C.restore, frame: "f1-prompt-v1-restored" });
    facts.restored_version = restored.version;
    await clickAt(page, page.getByRole("link", { name: "Eval Dashboard" }), "Eval Dashboard");
    await page.getByText("Agents with eval sets").first().waitFor({ timeout: 15_000 }).catch(() => die("no Eval Dashboard"));
    await page.waitForLoadState("networkidle").catch(() => {});
    await caption(page, C.restore);
    await glideTo(page, page.getByText(AGENT).first(), "dashboard row");
    await still("f2-eval-dashboard");
    await page.waitForTimeout(HOLD + BEAT);

    /* ---- g. lab: evals/ and the report on GitHub, ≈10 s -------------------- */
    scene("g", "lab L06 on GitHub");
    await goto(github("tree", "evals"), C.lab);
    await glide(page, W / 2, 360);
    await page.waitForTimeout(STEP + BEAT);
    await still("g1-evals-folder");
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(STEP);
    await goto(github("blob", "docs/hw6/lab/report.md"), C.lab);
    await glide(page, W / 2, 420);
    await page.waitForTimeout(STEP);
    await still("g2-lab-report");
    await page.mouse.wheel(0, 500);
    await page.waitForTimeout(STEP + BEAT);

    /* ---- h. closing caption, 5 s ------------------------------------------ */
    scene("h", "closing caption");
    await goto(`${CLIENT}/eval`);
    await page.getByText("Agents with eval sets").first().waitFor({ timeout: 15_000 }).catch(() => {});
    await page.evaluate(() => document.getElementById("__dd_caption__")?.remove());
    await caption(page, FINAL, true);
    await glide(page, W - 420, 84);
    await page.waitForTimeout(600);
    await still("h-final-caption");
    await page.waitForTimeout(5000);
    cut();

    const video = page.video();
    await context.close();
    const closed = now();
    console.log(`✓ facts ${JSON.stringify(facts, null, 1)}`);
    writeFileSync(join(VIDEO_DIR, "facts.json"), JSON.stringify(facts, null, 1));
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

/** Keep only the recorded ranges (the waits for runs are cut) and encode. */
function encode({ webm, scenes, keep, closed }) {
  if (!webm || !existsSync(webm)) die("no raw video was written");
  /* The recording starts with the page, a moment before t0, and ends at
   * context.close(): the raw length tells how far the two clocks are apart. */
  const rawSecs = probeSeconds(webm);
  if (rawSecs == null) die("could not read the raw video's duration");
  const lead = Math.max(0, Math.round(rawSecs * 1000 - closed));
  const sec = (ms) => ((ms + lead) / 1000).toFixed(3);
  const select = keep.map(([a, b]) => `between(t,${sec(a)},${sec(b)})`).join("+");
  ffmpeg(["-i", webm, "-vf", `fps=${FPS},select='${select}',setpts=N/${FPS}/TB`, ...ENCODE, OUT_MP4]);
  for (const f of readdirSync(VIDEO_DIR)) if (f.endsWith(".webm")) rmSync(join(VIDEO_DIR, f));

  /* Scene times on the cut timeline. */
  const cutAt = (ms) => keep.reduce((acc, [a, b]) => acc + Math.max(0, Math.min(ms, b) - a), 0);
  for (const s of scenes) console.log(`  ${s.scene} @ ${(cutAt(s.at) / 1000).toFixed(1)}s — ${s.title}`);
  const secs = probeSeconds(OUT_MP4);
  const mb = statSync(OUT_MP4).size / 1048576;
  console.log(`\n✓ ${OUT_MP4}\n  ${W}x${H} · ${secs.toFixed(1)}s · ${mb.toFixed(1)} MB`);
  if (secs < 60 || secs > 180) console.log(`  ⚠ ${secs.toFixed(0)}s is outside the 1–3 minute target — adjust the pacing constants.`);
}

/* --------------------------------------------------------------------- main */

try {
  if (process.argv.includes("--reset")) {
    await reset();
  } else {
    const ctx = await preflight();
    if (!process.argv.includes("--check")) encode(await record(ctx));
  }
} catch (e) {
  if (!(e instanceof Fatal)) throw e;
  console.error("\n✗ " + e.message + "\n");
  process.exit(1);
}
