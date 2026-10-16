import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, CiFile, CiInstallResult } from "@devdigest/shared";
import messages from "../../../../../../../../../../messages/en/ci.json";
import { ApiError } from "../../../../../../../../../lib/api";

const previewMutate = vi.fn();
const installMutate = vi.fn();
const preview: { data?: { files: CiFile[] }; error: Error | null; isPending: boolean } = {
  error: null,
  isPending: false,
};
const install: { data?: CiInstallResult; error: Error | null; isPending: boolean } = {
  error: null,
  isPending: false,
};
const REPOS = [
  { id: "11111111-1111-4111-8111-111111111111", full_name: "acme/payments-api" },
  { id: "22222222-2222-4222-8222-222222222222", full_name: "acme/web" },
];

vi.mock("../../../../../../../../../lib/hooks/core", () => ({ useRepos: () => ({ data: REPOS }) }));
vi.mock("../../../../../../../../../lib/hooks/ci", () => ({
  usePreviewCi: () => ({ mutate: previewMutate, ...preview }),
  useInstallCi: () => ({ mutate: installMutate, ...install }),
}));

import { ExportWizard } from "./ExportWizard";

afterEach(cleanup);
beforeEach(() => {
  previewMutate.mockReset();
  installMutate.mockReset();
  preview.data = { files: FILES };
  preview.error = null;
  preview.isPending = false;
  install.data = undefined;
  install.error = null;
  install.isPending = false;
});

const WORKFLOW_PATH = ".github/workflows/devdigest-review.yml";
const FILES: CiFile[] = [
  { path: ".devdigest/agents/security.yaml", contents: "name: Security", editable: false },
  { path: ".devdigest/runner/index.js", contents: "console.log(1)", editable: false },
  { path: ".devdigest/runner/package.json", contents: "{}", editable: false },
  {
    path: WORKFLOW_PATH,
    contents: "env:\n  OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}\n",
    editable: true,
  },
];
const AGENT = { id: "ag1", name: "Security reviewer" } as Agent;

const mount = () =>
  render(
    <NextIntlClientProvider locale="en" messages={{ ci: messages }}>
      <ExportWizard agent={AGENT} onClose={vi.fn()} />
    </NextIntlClientProvider>,
  );
const btn = (name: string) => screen.queryByRole("button", { name });
const goPreview = () => {
  fireEvent.click(screen.getByLabelText("acme/payments-api"));
  fireEvent.click(btn(messages.exportWizard.continue)!);
};
const goConfigure = () => {
  goPreview();
  fireEvent.click(btn(messages.exportWizard.continue)!);
};

describe("ExportWizard", () => {
  it("NFR-1: Target offers GitHub Actions only, with the workspace repos", () => {
    mount();
    expect(screen.getByText(messages.exportWizard.targets.gha)).toBeInTheDocument();
    for (const other of [
      messages.exportWizard.targets.circle,
      messages.exportWizard.targets.jenkins,
      messages.exportWizard.targets.cli,
    ]) {
      expect(screen.queryByText(other)).toBeNull();
    }
    expect(screen.getAllByRole("radio").map((r) => r.parentElement?.textContent)).toEqual([
      "acme/payments-api",
      "acme/web",
    ]);
    expect(btn(messages.exportWizard.continue)).toBeDisabled();
  });

  it("AC-1: Preview lists every file, only the workflow is editable, the key stays a reference", () => {
    mount();
    goPreview();
    expect(previewMutate).toHaveBeenCalledWith({
      repo_id: REPOS[0]!.id,
      triggers: ["opened", "synchronize"],
      post_as: "github_review",
    });
    for (const f of FILES) expect(screen.getByText(f.path, { exact: false })).toBeInTheDocument();
    const boxes = screen.getAllByRole("textbox");
    expect(boxes).toHaveLength(1);
    expect(boxes[0]).toHaveAttribute("aria-label", WORKFLOW_PATH);
    expect((boxes[0] as HTMLTextAreaElement).value).toContain("${{ secrets.OPENROUTER_API_KEY }}");
  });

  it("AC-3 / EC-1: a 409 shows the message and build hint, and nothing can proceed", () => {
    preview.data = undefined;
    preview.error = new ApiError("Runner is not built", 409, "ci_runner_missing");
    mount();
    goPreview();
    expect(screen.getByText("Runner is not built")).toBeInTheDocument();
    expect(screen.getByText(/pnpm --dir agent-runner build/)).toBeInTheDocument();
    expect(btn(messages.exportWizard.continue)).toBeDisabled();
    expect(btn(messages.exportWizard.openPr)).toBeNull();
    expect(btn(messages.exportWizard.install)).toBeNull();
  });

  it("A-4 / NFR-2: Configure defaults, at least one trigger, and the required-check hint", () => {
    mount();
    goConfigure();
    const opened = screen.getByRole("checkbox", { name: messages.exportWizard.triggers.opened });
    const sync = screen.getByRole("checkbox", { name: messages.exportWizard.triggers.synchronize });
    const reopened = screen.getByRole("checkbox", { name: messages.exportWizard.triggers.reopened });
    expect(opened).toHaveAttribute("aria-checked", "true");
    expect(sync).toHaveAttribute("aria-checked", "true");
    expect(reopened).toHaveAttribute("aria-checked", "false");
    expect(screen.getByText(messages.exportWizard.requiredCheckHint)).toBeInTheDocument();
    expect(btn(messages.exportWizard.continue)).toBeEnabled();
    fireEvent.click(opened);
    fireEvent.click(sync);
    expect(btn(messages.exportWizard.continue)).toBeDisabled();
  });

  it("AC-6 / A-5: Open PR omits workflow when unedited and shows the PR link", () => {
    install.data = {
      installation: {} as CiInstallResult["installation"],
      pr_url: "https://github.com/acme/payments-api/pull/9",
      reused_pr: false,
      paths: [],
    };
    mount();
    goConfigure();
    expect(screen.queryByText(messages.exportWizard.editedNote)).toBeNull();
    fireEvent.click(btn(messages.exportWizard.continue)!);
    const link = screen.getByRole("link", { name: messages.exportWizard.viewPr });
    expect(link).toHaveAttribute("href", "https://github.com/acme/payments-api/pull/9");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("AC-6 / A-5: an edited workflow is sent as written, with a note", () => {
    mount();
    goPreview();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "name: mine" } });
    fireEvent.click(btn(messages.exportWizard.continue)!);
    expect(screen.getByText(messages.exportWizard.editedNote)).toBeInTheDocument();
    fireEvent.click(btn(messages.exportWizard.continue)!);
    // The button is disabled only once a PR exists; it is enabled here.
    fireEvent.click(btn(messages.exportWizard.openPr)!);
    expect(installMutate).toHaveBeenCalledWith({
      repo_id: REPOS[0]!.id,
      triggers: ["opened", "synchronize"],
      post_as: "github_review",
      workflow: "name: mine",
    });
  });

  it("an unedited Open PR sends no workflow key", () => {
    mount();
    goConfigure();
    fireEvent.click(btn(messages.exportWizard.continue)!);
    fireEvent.click(btn(messages.exportWizard.openPr)!);
    const body = installMutate.mock.calls[0]![0];
    expect("workflow" in body).toBe(false);
  });

  it("AC-8: a workflow-permission error shows the server message as text", () => {
    install.error = new ApiError("Token lacks the workflow scope <b>x</b>", 403, "ci_workflow_permission");
    mount();
    goConfigure();
    fireEvent.click(btn(messages.exportWizard.continue)!);
    expect(screen.getByText("Token lacks the workflow scope <b>x</b>")).toBeInTheDocument();
    expect(screen.getByText(messages.exportWizard.installError)).toBeInTheDocument();
  });
});
