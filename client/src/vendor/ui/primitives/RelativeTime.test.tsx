/**
 * RelativeTime — the short form is lossy, so the exact instant has to survive
 * in `dateTime`/`title`. Clock skew reads "now", never a negative age.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { RelativeTime, formatRelativeTime, formatAbsolute } from "./RelativeTime";

afterEach(cleanup);

const NOW = Date.parse("2026-09-20T12:00:00Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();

describe("RelativeTime", () => {
  it("renders the short form and keeps the exact instant on the element", () => {
    render(<RelativeTime iso="2026-09-20T09:04:00Z" now={NOW} />);
    const el = screen.getByText("3h");
    expect(el.tagName).toBe("TIME");
    expect(el).toHaveAttribute("dateTime", "2026-09-20T09:04:00Z");
    expect(el).toHaveAttribute("title", "2026-09-20 09:04 UTC");
  });

  it("an unknown timestamp reads '—', with no <time> to mislead", () => {
    const { container } = render(<RelativeTime iso={null} now={NOW} />);
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(container.querySelector("time")).toBeNull();
  });

  it("an unparseable timestamp reads '—' rather than 'Invalid Date'", () => {
    render(<RelativeTime iso="not-a-date" now={NOW} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});

describe("formatRelativeTime", () => {
  it("steps minutes → hours → days", () => {
    expect(formatRelativeTime(ago(20_000), NOW)).toBe("now");
    expect(formatRelativeTime(ago(7 * 60_000), NOW)).toBe("7m");
    expect(formatRelativeTime(ago(3 * 3_600_000), NOW)).toBe("3h");
    expect(formatRelativeTime(ago(2 * 86_400_000), NOW)).toBe("2d");
  });

  it("a future timestamp (clock skew) reads 'now', not a negative age", () => {
    expect(formatRelativeTime(new Date(NOW + 90_000).toISOString(), NOW)).toBe("now");
  });

  it("returns '—' for missing or unparseable input", () => {
    expect(formatRelativeTime(null, NOW)).toBe("—");
    expect(formatRelativeTime(undefined, NOW)).toBe("—");
    expect(formatRelativeTime("not-a-date", NOW)).toBe("—");
  });
});

describe("formatAbsolute", () => {
  it("is UTC and locale-independent, so SSR and hydration agree", () => {
    expect(formatAbsolute(Date.parse("2026-09-20T11:04:09Z"))).toBe("2026-09-20 11:04 UTC");
  });
});
