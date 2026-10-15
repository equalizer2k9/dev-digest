import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, within, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ProjectContextDocument, ProjectContextEffective } from "@devdigest/shared";
import messages from "../../../../messages/en/context.json";
import { DocPicker } from "./DocPicker";

afterEach(cleanup);

const doc = (path: string, extra: Partial<ProjectContextDocument> = {}): ProjectContextDocument => ({
  path,
  tag: "docs",
  tokens: 10,
  too_large: false,
  used_by: 0,
  ...extra,
});
const eff = (path: string, extra: Partial<ProjectContextEffective> = {}): ProjectContextEffective => ({
  path,
  tokens: 10,
  skip_reason: null,
  skill: null,
  ...extra,
});

function setup(props: Partial<React.ComponentProps<typeof DocPicker>> = {}) {
  const handlers = { onToggle: vi.fn(), onMove: vi.fn(), onSelect: vi.fn() };
  const utils = render(
    <NextIntlClientProvider locale="en" messages={{ context: messages }}>
      <DocPicker
        documents={[doc("docs/architecture.md"), doc("specs/x.md", { tag: "specs" })]}
        attached={[]}
        effective={[]}
        truncated={false}
        selectedPath={null}
        {...handlers}
        {...props}
      />
    </NextIntlClientProvider>,
  );
  return { ...utils, ...handlers };
}

const attachLabel = (path: string) => messages.picker.attach.replace("{path}", path);

describe("DocPicker", () => {
  it("shows a checkbox, the path and the tag of every listed document", () => {
    setup();
    expect(screen.getAllByRole("checkbox")).toHaveLength(2);
    expect(screen.getByText("docs/architecture.md")).toBeInTheDocument();
    expect(screen.getByText("specs/x.md")).toBeInTheDocument();
    expect(screen.getByText(messages.tag.docs)).toBeInTheDocument();
    expect(screen.getByText(messages.tag.specs)).toBeInTheDocument();
  });

  it("ticking calls onToggle(path, true), unticking onToggle(path, false)", () => {
    const { onToggle } = setup({
      attached: ["specs/x.md"],
      effective: [eff("specs/x.md")],
    });
    fireEvent.click(screen.getByRole("checkbox", { name: attachLabel("docs/architecture.md") }));
    expect(onToggle).toHaveBeenCalledWith("docs/architecture.md", true);
    fireEvent.click(screen.getByRole("checkbox", { name: attachLabel("specs/x.md") }));
    expect(onToggle).toHaveBeenCalledWith("specs/x.md", false);
  });

  it("move buttons call onMove with -1 and +1", () => {
    const { onMove } = setup({
      attached: ["docs/architecture.md"],
      effective: [eff("docs/architecture.md")],
    });
    fireEvent.click(
      screen.getByRole("button", { name: messages.picker.moveUp.replace("{path}", "docs/architecture.md") }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: messages.picker.moveDown.replace("{path}", "docs/architecture.md") }),
    );
    expect(onMove).toHaveBeenNthCalledWith(1, "docs/architecture.md", -1);
    expect(onMove).toHaveBeenNthCalledWith(2, "docs/architecture.md", 1);
  });

  it("clicking a path selects it", () => {
    const { onSelect } = setup();
    fireEvent.click(screen.getByText("specs/x.md"));
    expect(onSelect).toHaveBeenCalledWith("specs/x.md");
  });

  it("clicking a path does not toggle its checkbox", () => {
    const { onToggle } = setup();
    fireEvent.click(screen.getByText("specs/x.md"));
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("typing filters the rows by path, ignoring case", () => {
    setup();
    fireEvent.change(screen.getByPlaceholderText(messages.picker.search), { target: { value: "ARCH" } });
    expect(screen.getByText("docs/architecture.md")).toBeInTheDocument();
    expect(screen.queryByText("specs/x.md")).not.toBeInTheDocument();
  });

  it("shows the no-match line when the filter hides every row", () => {
    setup();
    fireEvent.change(screen.getByPlaceholderText(messages.picker.search), { target: { value: "zzz" } });
    expect(screen.getByText(messages.picker.noMatch)).toBeInTheDocument();
  });

  it("a document that comes only from a skill shows the skill and has no checkbox or move", () => {
    setup({
      documents: [doc("docs/architecture.md")],
      attached: [],
      effective: [eff("docs/architecture.md", { skill: { id: "s1", name: "Rubric" } })],
    });
    expect(screen.getByText(messages.picker.viaSkill.replace("{name}", "Rubric"))).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Move/ })).not.toBeInTheDocument();
  });

  it("the footer sums the effective tokens, over-budget ones included", () => {
    setup({
      attached: ["docs/architecture.md", "specs/x.md"],
      effective: [
        eff("docs/architecture.md", { tokens: 1200 }),
        eff("specs/x.md", { tokens: 34, skip_reason: "over_budget" }),
      ],
    });
    const text = messages.picker.footer.replace("{tokens, number}", "1,234");
    expect(screen.getByText(text)).toBeInTheDocument();
    expect(text).toContain("injected as untrusted");
  });

  it("marks missing, too large and over-budget entries with their own text", () => {
    setup({
      documents: [doc("a.md"), doc("b.md", { too_large: true, tokens: null }), doc("c.md")],
      attached: ["a.md", "b.md", "c.md"],
      effective: [
        eff("a.md", { tokens: null, skip_reason: "missing" }),
        eff("b.md", { tokens: null, skip_reason: "too_large" }),
        eff("c.md", { skip_reason: "over_budget" }),
      ],
    });
    expect(screen.getByText(messages.picker.missing)).toBeInTheDocument();
    expect(screen.getByText(messages.picker.tooLarge)).toBeInTheDocument();
    expect(screen.getByText(messages.picker.overBudget)).toBeInTheDocument();
  });

  it("renders a missing attached path that is not listed, with a working checkbox", () => {
    const { onToggle } = setup({
      documents: [],
      attached: ["docs/gone.md"],
      effective: [eff("docs/gone.md", { tokens: null, skip_reason: "missing" })],
    });
    const box = screen.getByRole("checkbox", { name: attachLabel("docs/gone.md") });
    expect(box).toBeChecked();
    fireEvent.click(box);
    expect(onToggle).toHaveBeenCalledWith("docs/gone.md", false);
  });

  it("shows the cut notice when truncated", () => {
    setup({ truncated: true });
    expect(screen.getByText(messages.truncated)).toBeInTheDocument();
  });

  it("prints a bidi override in a path as an escape", () => {
    setup({ documents: [doc("docs/a‮b.md")] });
    const list = screen.getByRole("list");
    expect(within(list).getByText("docs/a\\u{202e}b.md")).toBeInTheDocument();
  });

  describe("counter and budget warning", () => {
    const budgetWarning = (budget: string) => messages.picker.budgetWarning.replace("{budget, number}", budget);
    const over = (tokens: number[]) => ({
      attached: tokens.map((_, i) => `docs/d${i}.md`),
      documents: tokens.map((t, i) => doc(`docs/d${i}.md`, { tokens: t })),
      effective: tokens.map((t, i) => eff(`docs/d${i}.md`, { tokens: t })),
    });

    it("AC-37: shows the counter text it is given in the counter slot", () => {
      const text = messages.counter.ofListed.replace("{attached, number}", "2").replace("{listed, number}", "5");
      setup({ counter: text });
      expect(screen.getByTestId("doc-counter")).toHaveTextContent(text);
    });

    it("AC-37: no counter slot without a counter", () => {
      setup();
      expect(screen.queryByTestId("doc-counter")).not.toBeInTheDocument();
    });

    it("AC-39: no warning at exactly 8 000 tokens", () => {
      setup(over([5000, 3000]));
      expect(screen.queryByText(budgetWarning("8,000"))).not.toBeInTheDocument();
      expect(screen.queryByTestId("doc-budget-warning")).not.toBeInTheDocument();
    });

    it("AC-39: no warning below 8 000 tokens", () => {
      setup(over([10]));
      expect(screen.queryByTestId("doc-budget-warning")).not.toBeInTheDocument();
    });

    it("AC-39: warning shown at 8 001 tokens, with the budget from the messages", () => {
      setup(over([5000, 3001]));
      expect(screen.getByText(budgetWarning("8,000"))).toBeInTheDocument();
    });

    it("AC-39: the warning sits in the footer, after the token line", () => {
      setup(over([9000]));
      const footer = screen.getByText(messages.picker.footer.replace("{tokens, number}", "9,000"));
      const warning = screen.getByText(budgetWarning("8,000"));
      expect(footer.compareDocumentPosition(warning) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it("AC-39 / EC-25: over budget, ticking and unticking still call onToggle", () => {
      const { onToggle } = setup({
        ...over([9000]),
        documents: [doc("docs/d0.md", { tokens: 9000 }), doc("docs/new.md")],
      });
      fireEvent.click(screen.getByRole("checkbox", { name: attachLabel("docs/new.md") }));
      expect(onToggle).toHaveBeenCalledWith("docs/new.md", true);
      fireEvent.click(screen.getByRole("checkbox", { name: attachLabel("docs/d0.md") }));
      expect(onToggle).toHaveBeenCalledWith("docs/d0.md", false);
    });

    it("EC-25: over budget, every attachment stays checked and the warning is shown", () => {
      setup(over([5000, 5000, 5000]));
      expect(screen.getByText(budgetWarning("8,000"))).toBeInTheDocument();
      for (const i of [0, 1, 2]) {
        expect(screen.getByRole("checkbox", { name: attachLabel(`docs/d${i}.md`) })).toBeChecked();
      }
    });
  });
});
