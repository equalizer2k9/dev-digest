import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Sidebar } from "@devdigest/ui";
import { activeKeyFor } from "./helpers";

const itemBox = (label: string) => screen.getByText(label).parentElement as HTMLElement;

describe("activeKeyFor — Agent Performance", () => {
  it("maps /agent-performance (with a query) to its own key, not agents", () => {
    expect(activeKeyFor("/agent-performance")).toBe("agent-performance");
    expect(activeKeyFor("/agents/a1")).toBe("agents");
  });

  it("highlights only the Agent Performance sidebar item on /agent-performance", () => {
    render(<Sidebar ctx={{ activeKey: activeKeyFor("/agent-performance") }} />);
    expect(itemBox("Agent Performance").style.fontWeight).toBe("600");
    expect(itemBox("CI Runs").style.fontWeight).toBe("500");
    expect(itemBox("Agents").style.fontWeight).toBe("500");
  });
});
