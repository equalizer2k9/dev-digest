import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { Checkbox } from "./Checkbox";

afterEach(cleanup);

describe("Checkbox", () => {
  it("is named by its visible label", () => {
    render(<Checkbox checked={false} label="On new PR" />);
    expect(screen.getByRole("checkbox", { name: "On new PR" })).toBeInTheDocument();
  });

  it("takes an accessible name from ariaLabel when it has no label", () => {
    render(<Checkbox checked ariaLabel="Attach docs/a.md" />);
    expect(screen.getByRole("checkbox", { name: "Attach docs/a.md" })).toBeChecked();
  });

  it("reports the toggled value", () => {
    const onChange = vi.fn();
    render(<Checkbox checked={false} ariaLabel="x" onChange={onChange} />);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(onChange).toHaveBeenCalledWith(true);
  });
});
