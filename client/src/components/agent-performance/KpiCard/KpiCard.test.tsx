import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { KpiCard } from "./KpiCard";

afterEach(cleanup);

describe("KpiCard", () => {
  it("shows a dash for an absent value, with no digit anywhere on the card", () => {
    const { container } = render(<KpiCard label="Total cost" value={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/\d/);
  });

  it("renders the value, the caption and the badge", () => {
    render(<KpiCard label="Total runs" value="12" caption="30D" badge={<span>Estimated</span>} />);
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("30D")).toBeInTheDocument();
    expect(screen.getByText("Estimated")).toBeInTheDocument();
  });
});
