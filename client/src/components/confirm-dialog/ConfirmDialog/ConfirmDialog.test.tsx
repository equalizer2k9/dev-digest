import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { ConfirmDialog } from "./ConfirmDialog";

afterEach(cleanup);

function setup(overrides: Partial<React.ComponentProps<typeof ConfirmDialog>> = {}) {
  const onConfirm = vi.fn();
  const onClose = vi.fn();
  render(
    <ConfirmDialog
      title="Delete skill"
      body='Delete "test-quality-rubric"? This cannot be undone.'
      confirmLabel="Delete"
      cancelLabel="Cancel"
      onConfirm={onConfirm}
      onClose={onClose}
      {...overrides}
    />,
  );
  return { onConfirm, onClose };
}

describe("ConfirmDialog", () => {
  it("renders the title and the subject in the body", () => {
    setup();
    expect(screen.getByText("Delete skill")).toBeInTheDocument();
    expect(screen.getByText(/test-quality-rubric/)).toBeInTheDocument();
  });

  it("confirms through the destructive button only", () => {
    const { onConfirm, onClose } = setup();
    fireEvent.click(screen.getByText("Delete"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("cancels without confirming", () => {
    const { onConfirm, onClose } = setup();
    fireEvent.click(screen.getByText("Cancel"));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("closes through the modal's × without confirming", () => {
    const { onConfirm, onClose } = setup();
    fireEvent.click(screen.getByLabelText("Close"));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("disables confirm while the mutation is in flight", () => {
    setup({ busy: true });
    expect(screen.getByText("Delete").closest("button")).toBeDisabled();
  });
});
