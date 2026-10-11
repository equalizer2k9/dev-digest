import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../messages/en/prReview.json";
import { DiffRoleGroup } from "./DiffRoleGroup";

afterEach(cleanup);

function renderGroup(props: Partial<React.ComponentProps<typeof DiffRoleGroup>> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <DiffRoleGroup
        role="core"
        label={messages.smartDiff.coreLabel}
        hint={messages.smartDiff.coreHint}
        fileCount={2}
        filesWithFindings={0}
        {...props}
      >
        <div>card body</div>
      </DiffRoleGroup>
    </NextIntlClientProvider>,
  );
}

const header = () => screen.getByRole("button", { name: /Core logic/ });

describe("DiffRoleGroup", () => {
  it("shows the label and hint from the messages file and the file count", () => {
    renderGroup();
    expect(screen.getByText(messages.smartDiff.coreLabel)).toBeInTheDocument();
    expect(screen.getByText(messages.smartDiff.coreHint)).toBeInTheDocument();
    expect(screen.getByText("2 files")).toBeInTheDocument();
  });

  it("is a button with aria-expanded that toggles its content", () => {
    renderGroup();
    expect(header()).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("card body")).toBeInTheDocument();
    fireEvent.click(header());
    expect(header()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("card body")).toBeNull();
  });

  it("starts collapsed with defaultOpen={false}", () => {
    renderGroup({ defaultOpen: false });
    expect(header()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("card body")).toBeNull();
    fireEvent.click(header());
    expect(screen.getByText("card body")).toBeInTheDocument();
  });

  it("renders the number of files with findings, only when it is at least 1", () => {
    const { unmount } = renderGroup({ filesWithFindings: 3 });
    expect(document.querySelector("[data-findings-count]")).toHaveTextContent("3");
    unmount();
    renderGroup({ filesWithFindings: 0 });
    expect(document.querySelector("[data-findings-count]")).toBeNull();
  });

  it("an empty group shows 0 files and cannot be expanded", () => {
    renderGroup({ fileCount: 0, defaultOpen: false });
    expect(screen.getByText("0 files")).toBeInTheDocument();
    expect(header()).toBeDisabled();
    fireEvent.click(header());
    expect(header()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("card body")).toBeNull();
  });
});
