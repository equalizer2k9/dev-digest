import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { BlastDegradedReason, BlastRadiusResponse } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/blast.json";
import { githubBlobUrl } from "@/lib/github-urls";
import { BlastRadius } from "./BlastRadius";

afterEach(cleanup);

const REPO = "acme/shop";
const SHA = "abc123";

const map: BlastRadiusResponse = {
  changed_symbols: [
    { name: "getItems", file: "src/items.ts", kind: "function" },
    { name: "other", file: "src/other.ts", kind: "function" },
  ],
  downstream: [
    {
      symbol: "getItems",
      callers: [
        { name: "listHandler", file: "src/routes/items.ts", line: 42 },
        { name: "exportJob", file: "src/jobs/export.ts", line: 7 },
      ],
      endpoints_affected: ["GET /api/public/items"],
      crons_affected: ["nightly-export"],
    },
    {
      symbol: "other",
      callers: [{ name: "solo", file: "src/solo.ts", line: 3 }],
      endpoints_affected: [],
      crons_affected: [],
    },
  ],
  summary: "",
  degraded: false,
  reason: null,
};

function t(template: string, count: number) {
  // Expected text, built from the imported ICU template.
  return template.replace(
    /\{count, plural, one \{([^}]*)\} other \{([^}]*)\}\}/,
    (_m, one: string, other: string) => (count === 1 ? one : other).replace("#", String(count)),
  );
}

function renderBlock(blast: BlastRadiusResponse, repoFullName: string | null = REPO) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ blast: messages }}>
      <BlastRadius blast={blast} repoFullName={repoFullName} headSha={SHA} />
    </NextIntlClientProvider>,
  );
}

describe("BlastRadius", () => {
  it("shows the title and the four stats derived from the response", () => {
    renderBlock(map);
    expect(screen.getByText(messages.title)).toBeInTheDocument();
    expect(screen.getByText(t(messages.stat.symbols, 2))).toBeInTheDocument();
    expect(screen.getByText(t(messages.stat.callers, 3))).toBeInTheDocument();
    expect(screen.getByText(t(messages.stat.endpoints, 1))).toBeInTheDocument();
    expect(screen.getByText(t(messages.stat.crons, 1))).toBeInTheDocument();
  });

  it("renders one card per entry in response order with its caller count", () => {
    renderBlock(map);
    const cards = screen.getAllByTestId("blast-card");
    expect(cards).toHaveLength(2);
    expect(within(cards[0]!).getByText("getItems")).toBeInTheDocument();
    expect(within(cards[0]!).getByText(t(messages.callerCount, 2))).toBeInTheDocument();
    expect(within(cards[1]!).getByText("other")).toBeInTheDocument();
    expect(within(cards[1]!).getByText(t(messages.callerCount, 1))).toBeInTheDocument();
  });

  it("links file:line to GitHub at the head sha in a new tab and shows the caller name", () => {
    renderBlock(map);
    const link = screen.getByText("src/routes/items.ts:42").closest("a")!;
    expect(link).toHaveAttribute("href", githubBlobUrl(REPO, SHA, "src/routes/items.ts", 42));
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noreferrer");
    expect(screen.getByText("listHandler")).toBeInTheDocument();
  });

  it("renders file:line as plain text while repoFullName is null", () => {
    renderBlock(map, null);
    const el = screen.getByText("src/routes/items.ts:42");
    expect(el.closest("a")).toBeNull();
  });

  it("puts endpoint and cron chips in separate groups", () => {
    renderBlock(map);
    const card = screen.getAllByTestId("blast-card")[0]!;
    const endpoints = within(card).getByTestId("blast-endpoints");
    const crons = within(card).getByTestId("blast-crons");
    expect(within(endpoints).getByText("GET /api/public/items")).toBeInTheDocument();
    expect(within(endpoints).queryByText("nightly-export")).toBeNull();
    expect(within(crons).getByText("nightly-export")).toBeInTheDocument();
    const second = screen.getAllByTestId("blast-card")[1]!;
    expect(within(second).queryByTestId("blast-endpoints")).toBeNull();
    expect(within(second).queryByTestId("blast-crons")).toBeNull();
  });

  it("shows noDownstream when symbols exist but nothing calls them", () => {
    renderBlock({
      ...map,
      changed_symbols: [{ name: "a", file: "a.ts", kind: "function" }],
      downstream: [],
    });
    expect(screen.getByText(t(messages.noDownstream, 1))).toBeInTheDocument();
    expect(screen.queryByTestId("blast-card")).toBeNull();
    expect(screen.queryByTestId("blast-degraded")).toBeNull();
  });

  it("pluralises noDownstream", () => {
    renderBlock({
      ...map,
      changed_symbols: [
        { name: "a", file: "a.ts", kind: "function" },
        { name: "b", file: "b.ts", kind: "function" },
      ],
      downstream: [],
    });
    expect(screen.getByText(t(messages.noDownstream, 2))).toBeInTheDocument();
  });

  it("shows noSymbols and zero stats when nothing changed", () => {
    renderBlock({ ...map, changed_symbols: [], downstream: [] });
    expect(screen.getByText(messages.noSymbols)).toBeInTheDocument();
    expect(screen.getByText(t(messages.stat.symbols, 0))).toBeInTheDocument();
    expect(screen.queryByText(t(messages.noDownstream, 0))).toBeNull();
  });

  it.each(Object.keys(messages.degraded.reason) as BlastDegradedReason[])(
    "shows the incomplete-index marker for reason %s",
    (reason) => {
      renderBlock({ ...map, changed_symbols: [], downstream: [], degraded: true, reason });
      const marker = screen.getByTestId("blast-degraded");
      expect(within(marker).getByText(messages.degraded.label)).toBeInTheDocument();
      expect(within(marker).getByText(messages.degraded.reason[reason])).toBeInTheDocument();
    },
  );

  it("falls back to no_data when degraded has no reason", () => {
    renderBlock({ ...map, changed_symbols: [], downstream: [], degraded: true, reason: null });
    expect(screen.getByText(messages.degraded.reason.no_data)).toBeInTheDocument();
  });

  it("shows the marker together with the cards", () => {
    renderBlock({ ...map, degraded: true, reason: "index_partial" });
    expect(screen.getByTestId("blast-degraded")).toBeInTheDocument();
    expect(screen.getAllByTestId("blast-card")).toHaveLength(2);
  });

  it("renders the incomplete-index marker above the stats row", () => {
    renderBlock({ ...map, degraded: true, reason: "index_partial" });
    const marker = screen.getByTestId("blast-degraded");
    const stat = screen.getByText(t(messages.stat.symbols, 2));
    expect(marker.compareDocumentPosition(stat) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("uses singular and plural forms", () => {
    renderBlock({
      changed_symbols: [{ name: "a", file: "a.ts", kind: "function" }],
      downstream: [
        {
          symbol: "a",
          callers: [{ name: "x", file: "x.ts", line: 1 }],
          endpoints_affected: ["GET /a"],
          crons_affected: ["c"],
        },
      ],
      summary: "",
      degraded: false,
      reason: null,
    });
    // "1 caller" appears twice: stat chip + card header
    expect(screen.getAllByText(t(messages.stat.callers, 1))).toHaveLength(2);
    expect(screen.getByText(t(messages.stat.symbols, 1))).toBeInTheDocument();
    expect(screen.getByText(t(messages.stat.crons, 1))).toBeInTheDocument();
  });
});
