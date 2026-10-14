import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionCandidate, ConventionScan } from "@devdigest/shared";
import { conventionKeys, useConventions } from "@/lib/hooks/conventions";
import messages from "../../../../../../../messages/en/conventions.json";
import { ConventionCard } from "./ConventionCard";

const REPO_ID = "repo-1";
const REPO_FULL_NAME = "acme/payments-api";
const HEAD_SHA = "9f1c2ab3d4e5f60718293a4b5c6d7e8f90a1b2c3";
const RULE = "Files and folders are kebab-case";
const OTHER_RULE = "Zod validates every route body";
const PATH_LABEL = "src/lib/run-executor.ts:L10-L14";

function candidate(over: Partial<ConventionCandidate> = {}): ConventionCandidate {
  return {
    id: "cv-1",
    category: "naming",
    rule: RULE,
    evidence_path: "src/lib/run-executor.ts",
    evidence_start_line: 10,
    evidence_end_line: 14,
    evidence_snippet: "export function runExecutor() {}",
    head_sha: HEAD_SHA,
    confidence: 0.91,
    status: "pending",
    accepted: false,
    ...over,
  };
}

interface Call {
  url: string;
  method?: string;
  body?: Record<string, unknown>;
}
let calls: Call[] = [];
const puts = () => calls.filter((c) => c.method === "PUT");

beforeEach(() => {
  calls = [];
  global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
    calls.push({ url: String(url), method: init?.method, body });
    // Echo the row back the way the server would — patch applied, mirrors in step.
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        ...candidate(),
        ...body,
        ...(typeof body?.status === "string" ? { accepted: body.status === "accepted" } : {}),
      }),
    } as unknown as Response;
  }) as unknown as typeof fetch;
});
afterEach(cleanup);

/**
 * The card is rendered off the cached scan, exactly as ConventionsView renders
 * it, so an optimistic write really does add or remove a card in the DOM.
 */
function List() {
  const { data } = useConventions(REPO_ID);
  return (
    <>
      {(data?.candidates ?? []).map((c) => (
        <ConventionCard
          key={c.id}
          candidate={c}
          repoId={REPO_ID}
          repoFullName={REPO_FULL_NAME}
          defaultBranch="main"
        />
      ))}
    </>
  );
}

function renderCards(candidates: ConventionCandidate[]) {
  const qc = new QueryClient({
    defaultOptions: {
      // staleTime keeps the seeded scan from triggering a background GET, so
      // every recorded call is a write the card made.
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
  const scan: ConventionScan = {
    repo_id: REPO_ID,
    candidates,
    extracted_at: new Date().toISOString(),
    sample_files: 84,
    dropped: 0,
    model: "gpt-5.4",
    warnings: [],
  };
  qc.setQueryData(conventionKeys.list(REPO_ID), scan);
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
        <List />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("ConventionCard — what a candidate shows", () => {
  it("shows the rule, its category, the source file with the line range and the confidence as a percentage", () => {
    renderCards([candidate()]);
    expect(screen.getByText(RULE)).toBeInTheDocument();
    expect(screen.getByText("naming")).toBeInTheDocument();
    expect(screen.getByText(PATH_LABEL)).toBeInTheDocument();
    expect(screen.getByText("91%")).toBeInTheDocument();
    expect(screen.getByText("export function runExecutor() {}")).toBeInTheDocument();
  });

  it("the evidence path opens the file at the cited lines on GitHub, pinned to the scanned commit", () => {
    renderCards([candidate()]);
    const link = screen.getByRole("link", { name: PATH_LABEL });
    expect(link).toHaveAttribute(
      "href",
      `https://github.com/${REPO_FULL_NAME}/blob/${HEAD_SHA}/src/lib/run-executor.ts#L10-L14`,
    );
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("falls back to the default branch only when the scan recorded no head_sha", () => {
    renderCards([candidate({ head_sha: null })]);
    expect(screen.getByRole("link", { name: PATH_LABEL })).toHaveAttribute(
      "href",
      `https://github.com/${REPO_FULL_NAME}/blob/main/src/lib/run-executor.ts#L10-L14`,
    );
  });

  it("offers exactly the three actions Accept, Reject and Edit", () => {
    renderCards([candidate()]);
    expect(screen.getByRole("button", { name: "Accept" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reject" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
  });
});

describe("ConventionCard — Accept / Reject", () => {
  it("Accept posts the accepted status and the button flips to Accepted", async () => {
    renderCards([candidate()]);
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Accepted" })).toBeInTheDocument());
    expect(puts()).toHaveLength(1);
    expect(puts()[0]?.url).toBe("http://localhost:3001/conventions/cv-1");
    expect(puts()[0]?.body).toEqual({ status: "accepted" });
  });

  it("Accepted toggles back to pending", async () => {
    renderCards([candidate({ status: "accepted", accepted: true })]);
    fireEvent.click(screen.getByRole("button", { name: "Accepted" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Accept" })).toBeInTheDocument());
    expect(puts()[0]?.body).toEqual({ status: "pending" });
  });

  it("Reject removes the card and leaves the others alone", async () => {
    renderCards([candidate(), candidate({ id: "cv-2", rule: OTHER_RULE })]);
    fireEvent.click(screen.getAllByRole("button", { name: "Reject" })[0]!);

    await waitFor(() => expect(screen.queryByText(RULE)).not.toBeInTheDocument());
    expect(screen.getByText(OTHER_RULE)).toBeInTheDocument();
    expect(puts()[0]?.body).toEqual({ status: "rejected" });
    expect(puts()[0]?.url).toBe("http://localhost:3001/conventions/cv-1");
  });
});

describe("ConventionCard — Edit in place", () => {
  it("Edit swaps the rule and the category into fields on the card itself", () => {
    renderCards([candidate()]);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    expect(screen.getByLabelText("Rule")).toHaveValue(RULE);
    expect(screen.getByLabelText("Category")).toHaveValue("naming");
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    // The three read-mode actions are gone, and nothing was written yet…
    expect(screen.queryByRole("button", { name: "Accept" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reject" })).not.toBeInTheDocument();
    expect(calls).toHaveLength(0);
    // … and the evidence is still there, read-only, on the same card.
    expect(screen.getByRole("link", { name: PATH_LABEL })).toBeInTheDocument();
    expect(screen.getByText("91%")).toBeInTheDocument();
  });

  it("Save posts the edited rule and category", async () => {
    renderCards([candidate()]);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Rule"), {
      target: { value: "Every exported symbol carries an explicit return type" },
    });
    fireEvent.change(screen.getByLabelText("Category"), { target: { value: "typing" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(puts()).toHaveLength(1));
    expect(puts()[0]?.body).toEqual({
      rule: "Every exported symbol carries an explicit return type",
      category: "typing",
    });
    // Back in read mode with the edited rule, on the same card.
    await waitFor(() =>
      expect(
        screen.getByText("Every exported symbol carries an explicit return type"),
      ).toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
  });

  it("Cancel restores the original values and writes nothing", () => {
    renderCards([candidate()]);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Rule"), { target: { value: "throwaway" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByText(RULE)).toBeInTheDocument();
    expect(screen.queryByText("throwaway")).not.toBeInTheDocument();
    expect(calls).toHaveLength(0);

    // Re-entering edit shows the stored rule again, not the discarded draft.
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByLabelText("Rule")).toHaveValue(RULE);
  });

  // The server bounds an edited rule at 8..240 chars. Letting the write leave
  // anyway would 422, roll the cache back and drop the text the user typed.
  it("Save is unavailable for a rule the server would reject, and nothing is written", async () => {
    renderCards([candidate()]);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    fireEvent.change(screen.getByLabelText("Rule"), { target: { value: "  short  " } });
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(puts()).toHaveLength(0);
    // Still in edit mode, with the text intact rather than rolled back.
    expect(screen.getByLabelText("Rule")).toHaveValue("  short  ");

    // Long enough → enabled again, and the rule is sent trimmed.
    fireEvent.change(screen.getByLabelText("Rule"), {
      target: { value: "  Every route validates its body with Zod  " },
    });
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(puts()).toHaveLength(1));
    expect(puts()[0]?.body).toMatchObject({
      rule: "Every route validates its body with Zod",
    });
  });
});
