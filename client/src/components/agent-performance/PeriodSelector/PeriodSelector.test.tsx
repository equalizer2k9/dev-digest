import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../messages/en/agentPerformance.json";
import { PeriodSelector } from "./PeriodSelector";
import type { PeriodParams } from "@/lib/agent-performance";

afterEach(cleanup);

function setup(value: PeriodParams = { period: "30d" }) {
  const onChange = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ agentPerformance: messages }}>
      <PeriodSelector value={value} onChange={onChange} />
    </NextIntlClientProvider>,
  );
  return onChange;
}

const openMenu = () => fireEvent.click(screen.getByRole("button", { name: messages.period.button }));

describe("PeriodSelector", () => {
  it("choosing 1 day reports the 1d preset", () => {
    const onChange = setup();
    openMenu();
    fireEvent.click(screen.getByText(messages.period.oneDay));
    expect(onChange).toHaveBeenCalledWith({ period: "1d" });
  });

  it("Custom with two dates and Apply reports the custom period", () => {
    const onChange = setup();
    openMenu();
    fireEvent.click(screen.getByText(messages.period.custom));
    fireEvent.change(screen.getByLabelText(messages.period.from), { target: { value: "2026-10-01" } });
    fireEvent.change(screen.getByLabelText(messages.period.to), { target: { value: "2026-10-10" } });
    fireEvent.click(screen.getByRole("button", { name: messages.period.apply }));
    expect(onChange).toHaveBeenCalledWith({ period: "custom", from: "2026-10-01", to: "2026-10-10" });
  });

  it("disables Apply and reports nothing when from is after to", () => {
    const onChange = setup({ period: "custom", from: "2026-10-10", to: "2026-10-01" });
    const apply = screen.getByRole("button", { name: messages.period.apply });
    expect(apply).toBeDisabled();
    fireEvent.click(apply);
    expect(onChange).not.toHaveBeenCalled();
  });
});
