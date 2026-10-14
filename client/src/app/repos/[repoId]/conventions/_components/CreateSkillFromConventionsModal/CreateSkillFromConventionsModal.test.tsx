import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionSkillDraft } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/conventions.json";
import { CreateSkillFromConventionsModal } from "./CreateSkillFromConventionsModal";

const REPO_ID = "repo-1";

const DRAFT: ConventionSkillDraft = {
  name: "repo-conventions",
  description: "2 house conventions extracted from payments-api",
  type: "convention",
  enabled: true,
  body: "# repo-conventions\n\n## kebab-case-files\nFiles and folders are kebab-case.",
  count: 2,
};

const AGENT = { id: "ag-1", name: "strict-reviewer" };

interface Call {
  url: string;
  method?: string;
  body?: Record<string, unknown>;
}
let calls: Call[] = [];
/** Overridable answer for POST …/conventions/skill. */
let postFails = false;

const posts = () => calls.filter((c) => c.method === "POST");

beforeEach(() => {
  calls = [];
  postFails = false;
  global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url);
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
    calls.push({ url: u, method: init?.method, body });
    const ok = (data: unknown) =>
      ({ ok: true, status: 200, statusText: "OK", json: async () => data }) as unknown as Response;

    if (u.endsWith("/conventions/draft")) return ok(DRAFT);
    if (u.endsWith("/agents")) return ok([AGENT]);
    if (u.endsWith("/conventions/skill")) {
      if (postFails) {
        return {
          ok: false,
          status: 409,
          statusText: "Conflict",
          json: async () => ({ error: { code: "name_taken", message: "That name is already used." } }),
        } as unknown as Response;
      }
      return ok({ id: "sk-9", name: body?.name, source: "extracted" });
    }
    return ok(null);
  }) as unknown as typeof fetch;
});
afterEach(cleanup);

const onClose = vi.fn();

function renderModal() {
  onClose.mockClear();
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
        <CreateSkillFromConventionsModal
          repoId={REPO_ID}
          repoName="payments-api"
          onClose={onClose}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

/** Wait for the draft to land and the form to replace the loading line. */
async function awaitDraft() {
  return waitFor(() => expect(screen.getByDisplayValue(DRAFT.name)).toBeInTheDocument());
}

const nameInput = () => screen.getByPlaceholderText("repo-conventions");
const descriptionInput = () =>
  screen.getByPlaceholderText("What this skill makes the reviewer look for");
const bodyInput = () => screen.getByLabelText("Skill body");
/** The only native <select> in the modal — SearchableSelect is a div. */
const typeSelect = () => screen.getByRole("combobox");
const submit = () => screen.getByRole("button", { name: "Create skill" });

describe("CreateSkillFromConventionsModal — the draft", () => {
  it("says it creates a skill from conventions and where they came from", async () => {
    renderModal();
    await awaitDraft();
    expect(screen.getByText("Create skill from conventions")).toBeInTheDocument();
    expect(screen.getByText("2 accepted conventions")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(submit()).toBeInTheDocument();
  });

  it("prefills every field from the server-built draft and lets each be edited", async () => {
    renderModal();
    await awaitDraft();
    expect(nameInput()).toHaveValue(DRAFT.name);
    expect(descriptionInput()).toHaveValue(DRAFT.description);
    expect(bodyInput()).toHaveValue(DRAFT.body);
    expect(typeSelect()).toHaveValue("convention");
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");

    fireEvent.change(nameInput(), { target: { value: "payments-conventions" } });
    expect(nameInput()).toHaveValue("payments-conventions");
  });

  it("fetches the draft from the repo's own endpoint", async () => {
    renderModal();
    await awaitDraft();
    expect(calls.map((c) => c.url)).toContain(
      `http://localhost:3001/repos/${REPO_ID}/conventions/draft`,
    );
  });
});

describe("CreateSkillFromConventionsModal — creating", () => {
  it("posts the EDITED values, not the draft's originals", async () => {
    renderModal();
    await awaitDraft();

    fireEvent.change(nameInput(), { target: { value: "payments-conventions" } });
    fireEvent.change(descriptionInput(), { target: { value: "House rules, reviewed by hand" } });
    fireEvent.change(bodyInput(), { target: { value: "# edited body\n\nOnly this text is sent." } });
    fireEvent.change(typeSelect(), { target: { value: "rubric" } });
    fireEvent.click(screen.getByRole("switch"));
    fireEvent.click(submit());

    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0]?.url).toBe(`http://localhost:3001/repos/${REPO_ID}/conventions/skill`);
    expect(posts()[0]?.body).toEqual({
      name: "payments-conventions",
      description: "House rules, reviewed by hand",
      type: "rubric",
      enabled: false,
      body: "# edited body\n\nOnly this text is sent.",
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("omits agent_id entirely when no agent was chosen", async () => {
    renderModal();
    await awaitDraft();
    fireEvent.click(submit());

    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0]?.body).not.toHaveProperty("agent_id");
  });

  it("sends agent_id once an agent is chosen", async () => {
    renderModal();
    await awaitDraft();
    // The agent list is a SearchableSelect: open it, then pick the agent.
    await waitFor(() => expect(calls.some((c) => c.url.endsWith("/agents"))).toBe(true));
    fireEvent.click(screen.getByText("Don't link yet"));
    fireEvent.click(await screen.findByText(AGENT.name));
    fireEvent.click(submit());

    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0]?.body).toMatchObject({ agent_id: AGENT.id });
  });

  it("disables the submit button while the name or the body is empty", async () => {
    renderModal();
    await awaitDraft();
    expect(submit()).toBeEnabled();

    fireEvent.change(nameInput(), { target: { value: "   " } });
    expect(submit()).toBeDisabled();

    fireEvent.change(nameInput(), { target: { value: "repo-conventions" } });
    fireEvent.change(bodyInput(), { target: { value: "" } });
    expect(submit()).toBeDisabled();
  });

  it("renders a server error inline in the modal and stays open", async () => {
    postFails = true;
    renderModal();
    await awaitDraft();
    fireEvent.click(submit());

    expect(await screen.findByText("That name is already used.")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(nameInput()).toBeInTheDocument();
  });
});
