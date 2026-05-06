// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, fireEvent } from "@testing-library/react";
import ConfirmDialog from "./ConfirmDialog";

afterEach(() => cleanup());

describe("<ConfirmDialog />", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <ConfirmDialog open={false} title="t" onConfirm={() => {}} onClose={() => {}} />
    );
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it("renders title and body when open", () => {
    const { getByRole, getByText } = render(
      <ConfirmDialog open title="Delete this collection?" body="This is permanent." onConfirm={() => {}} onClose={() => {}} />
    );
    expect(getByRole("dialog")).toBeTruthy();
    expect(getByText("Delete this collection?")).toBeTruthy();
    expect(getByText("This is permanent.")).toBeTruthy();
  });

  it("calls onConfirm when the confirm button is clicked (no reason required)", () => {
    const onConfirm = vi.fn();
    const { getByText } = render(
      <ConfirmDialog open title="t" confirmLabel="Delete" onConfirm={onConfirm} onClose={() => {}} />
    );
    fireEvent.click(getByText("Delete"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith(undefined);
  });

  it("calls onClose when Cancel is clicked", () => {
    const onClose = vi.fn();
    const { getByText } = render(
      <ConfirmDialog open title="t" onConfirm={() => {}} onClose={onClose} />
    );
    fireEvent.click(getByText("Cancel"));
    expect(onClose).toHaveBeenCalled();
  });

  it("blocks confirm with empty reason when reasonRequired", () => {
    const onConfirm = vi.fn();
    const { getByText } = render(
      <ConfirmDialog open title="Reject" reasonRequired onConfirm={onConfirm} onClose={() => {}} />
    );
    fireEvent.click(getByText("Confirm"));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("captures reason when reasonRequired and submits when filled", () => {
    const onConfirm = vi.fn();
    const { getByText, getByLabelText } = render(
      <ConfirmDialog open title="Reject application" reasonRequired onConfirm={onConfirm} onClose={() => {}} />
    );
    fireEvent.change(getByLabelText(/reason/i), { target: { value: "Off-style for our roster." } });
    fireEvent.click(getByText("Confirm"));
    expect(onConfirm).toHaveBeenCalledWith({ reason: "Off-style for our roster." });
  });

  it("trims whitespace from the reason before submitting", () => {
    const onConfirm = vi.fn();
    const { getByText, getByLabelText } = render(
      <ConfirmDialog open title="t" reasonRequired onConfirm={onConfirm} onClose={() => {}} />
    );
    fireEvent.change(getByLabelText(/reason/i), { target: { value: "  Some reason.  " } });
    fireEvent.click(getByText("Confirm"));
    expect(onConfirm).toHaveBeenCalledWith({ reason: "Some reason." });
  });

  it("uses destructive=true to render the confirm button in red", () => {
    const { getByText } = render(
      <ConfirmDialog open title="Delete" destructive confirmLabel="Delete" onConfirm={() => {}} onClose={() => {}} />
    );
    const btn = getByText("Delete");
    // Either via className containing 'red' or aria attribute — assert one of them
    expect(btn.className).toMatch(/red/);
  });
});
