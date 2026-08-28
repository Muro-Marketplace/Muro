// @vitest-environment jsdom
// E23. The QR revenue-share field on the venue's artwork-request form was
// labelled as the % paid TO the artist, the opposite direction to every
// other venue surface (placements.revenue_share_percent is the VENUE'S cut;
// payout legs deduct it from the artist's gross as venueCutPence). These
// tests pin the corrected direction: the venue enters THEIR OWN share, the
// copy says so, and the number reaches onSubmit unchanged (no inversion).

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import ArtworkRequestForm, { type ArtworkRequestPayload } from "./ArtworkRequestForm";

afterEach(() => cleanup());

function renderCreate(onSubmit = vi.fn<(payload: ArtworkRequestPayload) => Promise<void>>(async () => {})) {
  render(
    <ArtworkRequestForm mode="create" onSubmit={onSubmit} onCancel={() => {}} />,
  );
  return onSubmit;
}

describe("<ArtworkRequestForm /> QR revenue share (E23 direction)", () => {
  it("labels the share as the venue's cut, not the artist's", () => {
    renderCreate();
    fireEvent.click(screen.getByText("QR-enabled display"));

    expect(screen.getByText("Venue revenue share (%)")).toBeTruthy();
    expect(
      screen.getByText("% to the venue on each QR sale. The artist keeps the rest."),
    ).toBeTruthy();
    // Fail-before: the field read "Revenue share for the artist (%)" with
    // hint "% of QR sales paid to the artist." — the inverted direction.
    expect(screen.queryByText(/for the artist/i)).toBeNull();
    expect(screen.queryByText(/paid to the artist/i)).toBeNull();
  });

  it("submits the entered venue share unchanged (no inversion)", async () => {
    const onSubmit = renderCreate();

    fireEvent.change(screen.getByLabelText(/^Title/), {
      target: { value: "Statement wall piece" },
    });
    fireEvent.change(screen.getByLabelText(/looking for/), {
      target: { value: "Something bold for the back wall." },
    });
    fireEvent.click(screen.getByText("QR-enabled display"));
    fireEvent.change(screen.getByLabelText("Venue revenue share (%)"), {
      target: { value: "25" },
    });
    fireEvent.click(screen.getByText("Post request"));

    // submit() awaits onSubmit; flush the microtask before asserting.
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = onSubmit.mock.calls[0][0];
    // 25 means "venue keeps 25%" and must reach the API as 25, not 75.
    expect(payload.qrRevenueSharePercent).toBe(25);
  });
});
