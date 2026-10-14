import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../messages/en/context.json";
import { DocPreview } from "./DocPreview";

afterEach(cleanup);

function setup(props: Partial<React.ComponentProps<typeof DocPreview>> = {}) {
  const onRetry = vi.fn();
  const utils = render(
    <NextIntlClientProvider locale="en" messages={{ context: messages }}>
      <DocPreview status="ready" path="docs/a.md" content="# Title" onRetry={onRetry} {...props} />
    </NextIntlClientProvider>,
  );
  return { ...utils, onRetry };
}

describe("DocPreview", () => {
  it("renders Markdown headings when ready", () => {
    setup();
    expect(screen.getByRole("heading", { name: "Title" })).toBeInTheDocument();
  });

  it("renders no script, no img and no javascript: link for hostile content", () => {
    const { container } = setup({
      content:
        "<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n[x](javascript:alert(1))",
    });
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    const hrefs = Array.from(container.querySelectorAll("a")).map((a) => a.getAttribute("href") ?? "");
    expect(hrefs.some((h) => h.toLowerCase().startsWith("javascript:"))).toBe(false);
  });

  it("loads no remote image: the alt text is shown instead of an <img>", () => {
    const { container } = setup({
      content: "Before ![the diagram](https://attacker.example/x.png) and ![](//attacker.example/y.png)",
    });
    expect(container.querySelector("img")).toBeNull();
    expect(container.innerHTML).not.toContain("attacker.example");
    expect(screen.getByText("the diagram")).toBeInTheDocument();
  });

  it("shows a plain link text that stays a normal link", () => {
    setup({ content: "[docs](https://example.com/a)" });
    expect(screen.getByRole("link", { name: "docs" })).toHaveAttribute("href", "https://example.com/a");
  });

  it("shows a placeholder while loading", () => {
    setup({ status: "loading", content: null });
    expect(screen.getByText(messages.preview.loading)).toBeInTheDocument();
  });

  it("shows the error copy and a retry that calls onRetry", () => {
    const { onRetry } = setup({ status: "error", content: null });
    expect(screen.getByText(messages.preview.error)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: messages.preview.retry }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("shows the too-large text and no content", () => {
    setup({ status: "tooLarge", content: "# Hidden" });
    expect(screen.getByText(messages.preview.tooLarge)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Hidden" })).not.toBeInTheDocument();
  });

  it("shows the hint when idle", () => {
    setup({ status: "idle", path: null, content: null });
    expect(screen.getByText(messages.preview.idle)).toBeInTheDocument();
  });
});
