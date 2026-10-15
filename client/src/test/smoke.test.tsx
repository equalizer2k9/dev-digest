import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { Gallery } from "../components/showcase";
import { DiffViewer } from "../components/diff-viewer";
import type { PrFile } from "../lib/types";
import shellMessages from "../../messages/en/shell.json";
import intentMessages from "../../messages/en/intent.json";

afterEach(cleanup);

const themes: ("dark" | "light")[] = ["dark", "light"];

describe("web smoke (both themes)", () => {
  themes.forEach((theme) => {
    it(`component gallery renders in ${theme}`, () => {
      render(
        <div data-theme={theme}>
          <Gallery />
        </div>
      );
      // a few representative components are present
      expect(screen.getAllByText("Primary").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Critical").length).toBeGreaterThan(0);
      // Conventions Extractor card, with its evidence link and confidence.
      expect(screen.getAllByText("Confidence").length).toBeGreaterThan(0);
      expect(screen.getByText("91%")).toBeInTheDocument();
    });
  });

  it("diff viewer parses a unified patch", () => {
    const files: PrFile[] = [
      {
        path: "src/config.ts",
        additions: 2,
        deletions: 1,
        patch: "@@ -1,2 +1,3 @@\n const a = 1;\n-const b = 2;\n+const b = 3;\n+const c = 4;",
      },
    ];
    render(
      <NextIntlClientProvider locale="en" messages={{ shell: shellMessages }}>
        <div data-theme="dark">
          <DiffViewer files={files} />
        </div>
      </NextIntlClientProvider>
    );
    expect(screen.getByText("src/config.ts")).toBeInTheDocument();
    expect(screen.getByText("const c = 4;")).toBeInTheDocument();
  });
});

describe("showcase: IntentCard variants (C-AC-10)", () => {
  it("AC-10: the gallery mounts IntentCard loaded, empty, generating and error", () => {
    render(
      <div data-theme="dark">
        <Gallery />
      </div>,
    );
    // loaded (also stale + sources)
    expect(screen.getAllByText("Add retry with backoff to the payments webhook handler.").length).toBeGreaterThan(0);
    expect(screen.getAllByText(intentMessages.inScope).length).toBeGreaterThan(0);
    // empty
    expect(screen.getAllByText(intentMessages.empty.title).length).toBeGreaterThan(0);
    expect(screen.getAllByText(intentMessages.actions.generate).length).toBeGreaterThan(0);
    // generating
    expect(screen.getAllByText(intentMessages.generating).length).toBeGreaterThan(0);
    // errors: inline recalc error and load error
    expect(screen.getAllByText(intentMessages.error.paymentRequired).length).toBeGreaterThan(0);
    expect(screen.getAllByText(intentMessages.error.load).length).toBeGreaterThan(0);
  });
});

describe("showcase: AttachmentsEditor", () => {
  it("renders from seeded data without calling the API", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(
      <div data-theme="dark">
        <Gallery />
      </div>,
    );
    expect(screen.getByText("Project Context (AttachmentsEditor)")).toBeInTheDocument();
    // the editor's own picker lists the seeded document with its attach checkbox
    expect(screen.getAllByRole("checkbox", { name: "Attach docs/architecture.md" }).length).toBeGreaterThanOrEqual(2);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
