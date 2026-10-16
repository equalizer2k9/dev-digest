import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { AgentEstimate } from "@devdigest/shared";
import messages from "../../../../messages/en/multiAgent.json";
import { MultiAgentPicker } from "./MultiAgentPicker";

afterEach(cleanup);

const est = (id: string, cost: number | null, ms: number | null): AgentEstimate => ({
  agent_id: id,
  agent_name: `Agent ${id}`,
  cost_usd: cost,
  duration_ms: ms,
  runs: 3,
});

const ESTIMATES = [
  est("a", 0.01, 10000),
  est("b", 0.02, 20000),
  est("c", null, null),
  est("d", 0.04, 40000),
  est("e", 0.05, 50000),
  est("f", 0.06, 60000),
];

function Harness({
  estimates = ESTIMATES,
  initial = [],
  onLaunch = () => {},
  error = null,
}: {
  estimates?: AgentEstimate[];
  initial?: string[];
  onLaunch?: () => void;
  error?: string | null;
}) {
  const [selected, setSelected] = React.useState(initial);
  return (
    <NextIntlClientProvider locale="en" messages={{ multiAgent: messages }}>
      <MultiAgentPicker
        estimates={estimates}
        loading={false}
        selected={selected}
        onChange={setSelected}
        onLaunch={onLaunch}
        launching={false}
        error={error}
      />
    </NextIntlClientProvider>
  );
}

const launchBtn = (n: number) =>
  screen.getByRole("button", { name: messages.picker.launch.replace("{count}", String(n)) });

describe("MultiAgentPicker", () => {
  it('lists one checkbox per estimate with its cost and duration, "—" when null (AC-6)', () => {
    render(<Harness />);
    expect(screen.getAllByRole("checkbox")).toHaveLength(6);
    expect(screen.getByText("$0.010 · 10s")).toBeInTheDocument();
    expect(screen.getByText("— · —")).toBeInTheDocument();
  });

  it("shows the total for the ticked agents (AC-6)", () => {
    render(<Harness initial={["a", "b"]} />);
    expect(screen.getByText("Total: $0.030 · 20s")).toBeInTheDocument();
  });

  it('launch button reads "Run multi-agent review (N)" and is disabled for N<2, enabled for 2..5 (NFR-1)', () => {
    render(<Harness />);
    expect(launchBtn(0)).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: /Agent a/ }));
    expect(launchBtn(1)).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: /Agent b/ }));
    expect(launchBtn(2)).toBeEnabled();
  });

  it("a sixth tick does not change the selection and shows the max hint", () => {
    render(<Harness initial={["a", "b", "c", "d", "e"]} />);
    expect(screen.queryByText(messages.picker.max)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: /Agent f/ }));
    expect(launchBtn(5)).toBeEnabled();
    expect(screen.getByText(messages.picker.max)).toBeInTheDocument();
  });

  it("with fewer than 2 estimates the button stays disabled and needTwo is shown (EC-1)", () => {
    render(<Harness estimates={[est("a", 1, 1000)]} initial={["a"]} />);
    expect(launchBtn(1)).toBeDisabled();
    expect(screen.getByText(messages.picker.needTwo)).toBeInTheDocument();
  });

  it("clicking launch calls onLaunch once (AC-1)", () => {
    const onLaunch = vi.fn();
    render(<Harness initial={["a", "b"]} onLaunch={onLaunch} />);
    fireEvent.click(launchBtn(2));
    expect(onLaunch).toHaveBeenCalledTimes(1);
  });

  it("error prop is shown and the selection is kept (EC-2)", () => {
    render(<Harness initial={["a", "b"]} error={messages.error.launch} />);
    expect(screen.getByText(messages.error.launch)).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Agent a/ })).toHaveAttribute("aria-checked", "true");
    expect(launchBtn(2)).toBeEnabled();
  });
});
