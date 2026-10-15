import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ProjectContextDocument } from "@devdigest/shared";
import messages from "../../../../../../../../../../messages/en/context.json";
import { SerializesAs } from "./SerializesAs";

afterEach(cleanup);

const doc = (path: string, tokens: number | null = 10, tag?: ProjectContextDocument["tag"]): ProjectContextDocument => ({
  path,
  tag: tag ?? (path.split("/")[0] as ProjectContextDocument["tag"]),
  tokens,
  too_large: false,
  used_by: 0,
});

function setup(attached: string[], documents: ProjectContextDocument[]) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ context: messages }}>
      <SerializesAs attached={attached} documents={documents} />
    </NextIntlClientProvider>,
  );
}

const tokensText = (n: string) => messages.serializes.tokens.replace("{tokens, number}", n);
const groupTags = () =>
  screen.queryAllByTestId(/^serializes-group-/).map((g) => g.getAttribute("data-testid")!.replace("serializes-group-", ""));
const pathsIn = (tag: string) =>
  within(screen.getByTestId(`serializes-group-${tag}`))
    .getAllByRole("listitem")
    .map((li) => li.getAttribute("data-testid")!.replace("serializes-doc-", ""));

describe("SerializesAs", () => {
  it("AC-40: shows the block title from the messages", () => {
    setup(["docs/a.md"], [doc("docs/a.md")]);
    expect(screen.getByText(messages.serializes.title)).toBeInTheDocument();
  });

  it("AC-40: groups follow specs, docs, insights whatever the attachment order", () => {
    setup(
      ["insights/i.md", "docs/d.md", "specs/s.md"],
      [doc("insights/i.md"), doc("docs/d.md"), doc("specs/s.md")],
    );
    expect(groupTags()).toEqual(["specs", "docs", "insights"]);
    const group = screen.getByTestId("serializes-group-specs");
    expect(within(group).getByText(messages.tag.specs)).toBeInTheDocument();
    expect(within(screen.getByTestId("serializes-group-docs")).getByText(messages.tag.docs)).toBeInTheDocument();
    expect(
      within(screen.getByTestId("serializes-group-insights")).getByText(messages.tag.insights),
    ).toBeInTheDocument();
  });

  it("AC-40: attachment order is kept inside a group", () => {
    setup(
      ["docs/z.md", "specs/b.md", "docs/a.md", "specs/a.md"],
      [doc("docs/z.md"), doc("specs/b.md"), doc("docs/a.md"), doc("specs/a.md")],
    );
    expect(pathsIn("specs")).toEqual(["specs/b.md", "specs/a.md"]);
    expect(pathsIn("docs")).toEqual(["docs/z.md", "docs/a.md"]);
  });

  it("AC-40: each document shows its path and token count", () => {
    setup(["docs/a.md", "specs/s.md"], [doc("docs/a.md", 1234), doc("specs/s.md", 56)]);
    const a = screen.getByTestId("serializes-doc-docs/a.md");
    expect(within(a).getByText("docs/a.md")).toBeInTheDocument();
    expect(within(a).getByText(tokensText("1,234"))).toBeInTheDocument();
    const s = screen.getByTestId("serializes-doc-specs/s.md");
    expect(within(s).getByText(tokensText("56"))).toBeInTheDocument();
  });

  it("AC-40: a group with no document is not shown", () => {
    setup(["docs/a.md"], [doc("docs/a.md"), doc("specs/s.md")]);
    expect(groupTags()).toEqual(["docs"]);
  });

  it("AC-40: nothing is marked when the sum is exactly the budget", () => {
    setup(["specs/a.md", "docs/b.md"], [doc("specs/a.md", 5000), doc("docs/b.md", 3000)]);
    expect(screen.queryByText(messages.serializes.overBudget)).not.toBeInTheDocument();
  });

  it("AC-40: marks the first document that does not fit and every one after it, in prompt order", () => {
    // prompt order: specs/a (5000) · docs/b (3000, sum 8000 fits) · docs/c (1, over) · insights/d (1, over)
    setup(
      ["specs/a.md", "docs/b.md", "docs/c.md", "insights/d.md"],
      [doc("specs/a.md", 5000), doc("docs/b.md", 3000), doc("docs/c.md", 1), doc("insights/d.md", 1)],
    );
    const marked = (p: string) =>
      within(screen.getByTestId(`serializes-doc-${p}`)).queryByText(messages.serializes.overBudget) !== null;
    expect(marked("specs/a.md")).toBe(false);
    expect(marked("docs/b.md")).toBe(false);
    expect(marked("docs/c.md")).toBe(true);
    expect(marked("insights/d.md")).toBe(true);
  });

  it("AC-40: once a document is over, a later small one that would fit is marked too", () => {
    setup(
      ["specs/big.md", "docs/small.md"],
      [doc("specs/big.md", 9000), doc("docs/small.md", 1)],
    );
    expect(screen.getAllByText(messages.serializes.overBudget)).toHaveLength(2);
  });

  it("AC-40: the budget runs in prompt order, not attachment order", () => {
    // attached insights first, but specs enter the prompt first and use the budget up
    setup(
      ["insights/i.md", "specs/s.md"],
      [doc("insights/i.md", 100), doc("specs/s.md", 7950)],
    );
    expect(
      within(screen.getByTestId("serializes-doc-insights/i.md")).getByText(messages.serializes.overBudget),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("serializes-doc-specs/s.md")).queryByText(messages.serializes.overBudget),
    ).not.toBeInTheDocument();
  });

  it("AC-40: empty state when nothing is attached", () => {
    setup([], [doc("docs/a.md")]);
    expect(screen.getByText(messages.serializes.empty)).toBeInTheDocument();
    expect(groupTags()).toEqual([]);
  });
});
