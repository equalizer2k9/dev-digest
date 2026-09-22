import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionCandidate, ConventionScan } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import messages from "../../../../../../../messages/en/conventions.json";
import commonMessages from "../../../../../../../messages/en/common.json";

const REPO_ID = "repo-1";

function candidate(over: Partial<ConventionCandidate> = {}): ConventionCandidate {
  return {
    id: "cv-1",
    category: "naming",
    rule: "Files and folders are kebab-case",
    evidence_path: "src/lib/run-executor.ts",
    evidence_start_line: 10,
    evidence_end_line: 14,
    evidence_snippet: "export function runExecutor() {}",
    head_sha: "abc123",
    confidence: 0.91,
    status: "pending",
    accepted: false,
    ...over,
  };
}

function scanned(candidates: ConventionCandidate[]): ConventionScan {
  return {
    repo_id: REPO_ID,
    candidates,
    extracted_at: new Date(Date.now() - 3_600_000).toISOString(),
    sample_files: 84,
    dropped: 0,
    model: "gpt-5.4",
    warnings: [],
  };
}

const NEVER_SCANNED: ConventionScan = {
  repo_id: REPO_ID,
  candidates: [],
  extracted_at: null,
  sample_files: 0,
  dropped: 0,
  model: null,
  warnings: [],
};

// Mutable mock state — the factories below read these at render time.
let scan: ConventionScan = NEVER_SCANNED;
let listState = { isLoading: false, isError: false };
let extractState: {
  mutate: ReturnType<typeof vi.fn>;
  isPending: boolean;
  isError: boolean;
  error: unknown;
} = { mutate: vi.fn(), isPending: false, isError: false, error: null };
let repoNotFound = false;
const updateMutate = vi.fn();

vi.mock("@/lib/hooks/conventions", () => ({
  useConventions: () => ({ data: scan, ...listState, refetch: vi.fn() }),
  useExtractConventions: () => extractState,
  useUpdateConvention: () => ({ mutate: updateMutate, isPending: false }),
  useConventionDraft: () => ({ data: undefined, isError: false }),
  useCreateConventionSkill: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

// AppShell pulls in the router, repo context and global shortcuts — out of scope.
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({
    activeRepo: {
      id: REPO_ID,
      name: "payments-api",
      full_name: "acme/payments-api",
      default_branch: "main",
    },
  }),
  useRepoNotFound: () => repoNotFound,
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ repoId: REPO_ID }),
  useRouter: () => ({ push: vi.fn() }),
}));

import { ConventionsView } from "./ConventionsView";

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages, common: commonMessages }}>
      <ConventionsView />
    </NextIntlClientProvider>,
  );
}

const runBtn = () => screen.getByRole("button", { name: "Run Scan" });
const rescanBtn = () => screen.getByRole("button", { name: "ReScan" });

beforeEach(() => {
  scan = NEVER_SCANNED;
  listState = { isLoading: false, isError: false };
  extractState = { mutate: vi.fn(), isPending: false, isError: false, error: null };
  repoNotFound = false;
  updateMutate.mockClear();
});
afterEach(cleanup);

describe("ConventionsView — the two scan buttons", () => {
  it("never scanned: Run Scan is live, ReScan is not, and the empty state shows", () => {
    renderView();
    expect(runBtn()).toBeEnabled();
    expect(rescanBtn()).toBeDisabled();
    expect(screen.getByText("No conventions extracted yet")).toBeInTheDocument();
  });

  it("the empty state's CTA runs the same scan as the header button", () => {
    renderView();
    // Design label ("Run extraction"), same action as the header's Run Scan.
    fireEvent.click(screen.getByRole("button", { name: "Run extraction" }));
    expect(extractState.mutate).toHaveBeenCalledTimes(1);
    fireEvent.click(runBtn());
    expect(extractState.mutate).toHaveBeenCalledTimes(2);
  });

  it("after a scan the enablement flips: ReScan is live, Run Scan is not", () => {
    scan = scanned([candidate()]);
    renderView();
    expect(runBtn()).toBeDisabled();
    expect(rescanBtn()).toBeEnabled();
    expect(screen.getByText("Files and folders are kebab-case")).toBeInTheDocument();
  });

  it("both buttons are always rendered, whichever state the repo is in", () => {
    renderView();
    expect(runBtn()).toBeInTheDocument();
    expect(rescanBtn()).toBeInTheDocument();
    cleanup();
    scan = scanned([candidate()]);
    renderView();
    expect(runBtn()).toBeInTheDocument();
    expect(rescanBtn()).toBeInTheDocument();
  });

  it("an in-flight scan disables both and labels the active one Scanning…", () => {
    extractState = { ...extractState, isPending: true };
    renderView();
    expect(screen.getByRole("button", { name: "Scanning…" })).toBeDisabled();
    expect(rescanBtn()).toBeDisabled();
    // Nothing else is clickable while the one model round-trip is out.
    expect(screen.queryByRole("button", { name: "Run Scan" })).not.toBeInTheDocument();
  });

  it("titles the page with the repo the rules were read from", () => {
    scan = scanned([candidate()]);
    renderView();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Conventions in payments-api",
    );
  });

  it("prints the sample count and the last-scan time once a scan exists", () => {
    scan = scanned([candidate()]);
    renderView();
    expect(screen.getByText("Detected from 84 sample files · last scan 1h ago")).toBeInTheDocument();
  });

  it("renders scan warnings as a muted line under the subtitle", () => {
    scan = { ...scanned([candidate()]), warnings: ["ranked samples unavailable"], dropped: 2 };
    renderView();
    expect(
      screen.getByText(
        "ranked samples unavailable · 2 candidates dropped by evidence verification",
      ),
    ).toBeInTheDocument();
  });
});

describe("ConventionsView — scan errors", () => {
  it("a 409 repo_not_indexed renders inline under the header, not as an ErrorState", () => {
    extractState = {
      ...extractState,
      isError: true,
      error: new ApiError("Index this repo first, then run the scan.", 409, "repo_not_indexed"),
    };
    renderView();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Index this repo first, then run the scan.",
    );
    // The list area is untouched — still the empty state, not a full error.
    expect(screen.getByText("No conventions extracted yet")).toBeInTheDocument();
    expect(screen.queryByText("Scan failed")).not.toBeInTheDocument();
  });

  it("any other scan failure uses ErrorState", () => {
    extractState = {
      ...extractState,
      isError: true,
      error: new ApiError("boom", 500, "internal_error"),
    };
    renderView();
    expect(screen.getByText("Scan failed")).toBeInTheDocument();
    expect(screen.queryByText("No conventions extracted yet")).not.toBeInTheDocument();
  });

  // The guard is matched on the error CODE, so a different conflict on the same
  // route is a real failure rather than a "just index the repo" hint.
  it("a 409 carrying another code is an ErrorState, not the not-indexed hint", () => {
    extractState = {
      ...extractState,
      isError: true,
      error: new ApiError("A scan is already running.", 409, "scan_in_progress"),
    };
    renderView();
    // `ErrorState` replaces the list area (the inline hint leaves it alone), and
    // the server's own message is what the user reads.
    expect(screen.getByText("Scan failed")).toBeInTheDocument();
    expect(screen.getByText("A scan is already running.")).toBeInTheDocument();
    expect(screen.queryByText("No conventions extracted yet")).not.toBeInTheDocument();
  });

  it("an unknown repo falls back to RepoNotFound", () => {
    repoNotFound = true;
    renderView();
    expect(screen.queryByRole("button", { name: "Run Scan" })).not.toBeInTheDocument();
    expect(screen.getByText(commonMessages.repoNotFound.title)).toBeInTheDocument();
  });
});

describe("ConventionsView — Create skill visibility", () => {
  it("is absent from the DOM when nothing is accepted", () => {
    scan = scanned([candidate(), candidate({ id: "cv-2", rule: "Zod at the edges" })]);
    renderView();
    expect(screen.getByText("0 of 2 accepted")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create skill" })).not.toBeInTheDocument();
  });

  it("appears as soon as one candidate is accepted", () => {
    scan = scanned([
      candidate({ status: "accepted", accepted: true }),
      candidate({ id: "cv-2", rule: "Zod at the edges" }),
    ]);
    renderView();
    expect(screen.getByText("1 of 2 accepted")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create skill" })).toBeEnabled();
  });

  it("Accept all writes every pending candidate", () => {
    scan = scanned([candidate(), candidate({ id: "cv-2", rule: "Zod at the edges" })]);
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "Accept all" }));
    expect(updateMutate).toHaveBeenCalledTimes(2);
    expect(updateMutate.mock.calls[0]?.[0]).toEqual({
      id: "cv-1",
      patch: { status: "accepted" },
    });
  });

  it("Deselect all returns every accepted candidate to pending", () => {
    scan = scanned([
      candidate({ status: "accepted", accepted: true }),
      candidate({ id: "cv-2", rule: "Zod at the edges", status: "accepted", accepted: true }),
    ]);
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "Deselect all" }));
    expect(updateMutate).toHaveBeenCalledTimes(2);
    expect(updateMutate.mock.calls[1]?.[0]).toEqual({ id: "cv-2", patch: { status: "pending" } });
  });
});
