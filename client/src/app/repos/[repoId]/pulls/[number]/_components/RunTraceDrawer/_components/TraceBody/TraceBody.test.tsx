import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PromptAssembly, RunTrace } from "@devdigest/shared";
import messages from "../../../../../../../../../../messages/en/runs.json";
import { TraceBody } from "./TraceBody";

afterEach(cleanup);

const BASE_ASSEMBLY: PromptAssembly = {
  system: "You are a reviewer.",
  skills: null,
  memory: null,
  specs: null,
  repo_map: null,
  callers: null,
  skill_blocks: null,
  skills_tokens: null,
  user: "Review PR #482",
};

function trace(assembly: Partial<PromptAssembly>): RunTrace {
  return {
    config: { agent: "Security", version: "1", provider: "openai", model: "gpt-4.1", pr: 482, source: "local" },
    stats: {
      duration_ms: 8200,
      tokens_in: 12000,
      tokens_out: 1500,
      cost_usd: 0.0013,
      findings: 0,
      grounding: "0/0 passed",
    },
    prompt_assembly: { ...BASE_ASSEMBLY, ...assembly },
    tool_calls: [],
    raw_output: "{}",
    memory_pulled: [],
    specs_read: [],
    log: [],
  };
}

/** Renders the trace and expands "Prompt assembly", which starts collapsed. */
function renderBody(t: RunTrace) {
  const r = render(
    <NextIntlClientProvider locale="en" messages={{ runs: messages }}>
      <TraceBody trace={t} findings={[]} />
    </NextIntlClientProvider>,
  );
  fireEvent.click(screen.getByText("Prompt assembly"));
  return r;
}

describe("TraceBody — skills blocks", () => {
  it("renders one labelled block per skill_blocks entry, with its own token count and the block total", () => {
    renderBody(
      trace({
        skills: "### test-quality-rubric\n…\n### api-contract-guard\n…",
        skills_tokens: 940,
        skill_blocks: [
          { skill_id: "sk1", name: "test-quality-rubric", version: 3, tokens: 620 },
          { skill_id: "sk2", name: "api-contract-guard", version: 1, tokens: 320 },
        ],
      }),
    );

    expect(screen.getByTestId("trace-skills-section")).toBeInTheDocument();
    expect(screen.getByText("Skills")).toBeInTheDocument();
    expect(screen.getByText("940 tokens")).toBeInTheDocument();
    expect(screen.getByText("test-quality-rubric · v3")).toBeInTheDocument();
    expect(screen.getByText("620 tokens")).toBeInTheDocument();
    expect(screen.getByText("api-contract-guard · v1")).toBeInTheDocument();
    expect(screen.getByText("320 tokens")).toBeInTheDocument();
    // The legacy single block is not rendered alongside them.
    expect(screen.queryByText("Skills (dynamic)")).not.toBeInTheDocument();
  });

  it("lists the blocks in prompt order, so a reorder is visible here", () => {
    renderBody(
      trace({
        skills: "…",
        skills_tokens: 940,
        skill_blocks: [
          { skill_id: "sk2", name: "api-contract-guard", version: 1, tokens: 320 },
          { skill_id: "sk1", name: "test-quality-rubric", version: 3, tokens: 620 },
        ],
      }),
    );
    const labels = screen
      .getAllByText(/ · v\d+$/)
      .map((e) => e.textContent);
    expect(labels).toEqual(["api-contract-guard · v1", "test-quality-rubric · v3"]);
  });

  it("a block still opens the prompt text on click", () => {
    renderBody(
      trace({
        skills: "### test-quality-rubric\nEvery branch needs a test.",
        skills_tokens: 620,
        skill_blocks: [{ skill_id: "sk1", name: "test-quality-rubric", version: 3, tokens: 620 }],
      }),
    );
    fireEvent.click(screen.getByText("test-quality-rubric · v3"));
    expect(screen.getByText(/Every branch needs a test\./)).toBeInTheDocument();
  });

  it("renders no skills section at all when skill_blocks is null", () => {
    renderBody(trace({}));
    expect(screen.queryByTestId("trace-skills-section")).not.toBeInTheDocument();
    expect(screen.queryByText("Skills")).not.toBeInTheDocument();
    expect(screen.queryByText("Skills (dynamic)")).not.toBeInTheDocument();
  });

  it("renders no skills section when skill_blocks is an empty array", () => {
    renderBody(trace({ skill_blocks: [], skills_tokens: 0 }));
    expect(screen.queryByTestId("trace-skills-section")).not.toBeInTheDocument();
    expect(screen.queryByText("Skills")).not.toBeInTheDocument();
  });

  it("a legacy trace with skills text but no skill_blocks still renders one unlabelled block", () => {
    renderBody(trace({ skills: "### legacy skill text" }));
    expect(screen.getByText("Skills (dynamic)")).toBeInTheDocument();
    expect(screen.queryByTestId("trace-skills-section")).not.toBeInTheDocument();
    // No token number is invented for a run that never measured one.
    expect(screen.queryByText(/ tokens$/)).not.toBeInTheDocument();
  });
});
