import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import settingsMessages from "../../../../../../../../messages/en/settings.json";

const state: { settings: { feature_models?: Record<string, unknown> } } = { settings: {} };

vi.mock("@/lib/hooks", () => ({
  useSettings: () => ({ data: state.settings }),
  useUpdateSettings: () => ({ mutate: vi.fn() }),
}));
vi.mock("@/lib/hooks/agents", () => ({
  useProviderModels: () => ({ data: [] }),
}));

import { SettingsModels } from "./SettingsModels";

afterEach(cleanup);

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ settings: settingsMessages }}>
      <SettingsModels />
    </NextIntlClientProvider>,
  );
}

describe("SettingsModels", () => {
  it("AC-9: with no saved override the review_intent row shows deepseek/deepseek-v4-flash with the default tag", () => {
    state.settings = {};
    renderView();
    const label = screen.getByText("PR Review · Intent", { exact: false });
    expect(screen.getByText("Derives a PR’s intent and scope before review.")).toBeInTheDocument();
    const row = label.closest("div")!.parentElement!.parentElement!;
    expect(row).toHaveTextContent("deepseek/deepseek-v4-flash");
    expect(row).toHaveTextContent(settingsMessages.models.usingDefault);
  });

  it("AC-9: a saved override replaces the default model and drops the default tag", () => {
    state.settings = { feature_models: { review_intent: { provider: "openrouter", model: "acme/other-model" } } };
    renderView();
    const label = screen.getByText("PR Review · Intent", { exact: false });
    const row = label.closest("div")!.parentElement!.parentElement!;
    expect(row).toHaveTextContent("acme/other-model");
    expect(row).not.toHaveTextContent("deepseek/deepseek-v4-flash");
    expect(row).not.toHaveTextContent(settingsMessages.models.usingDefault);
  });
});
