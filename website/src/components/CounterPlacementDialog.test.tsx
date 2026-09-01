// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";

const { mutateMock } = vi.hoisted(() => ({ mutateMock: vi.fn(async () => ({})) }));

vi.mock("@/lib/api-client", () => ({
  authFetch: vi.fn(async () => ({ ok: true, json: async () => ({}) })),
  mutate: mutateMock,
  ApiError: class ApiError extends Error {
    code?: string;
  },
}));

import CounterPlacementDialog from "./CounterPlacementDialog";

afterEach(() => cleanup());
beforeEach(() => {
  mutateMock.mockReset();
  mutateMock.mockResolvedValue({});
});

/** The counter object the last PATCH carried. */
function sentCounter(): Record<string, unknown> {
  const call = mutateMock.mock.calls.at(-1) as unknown as [string, { body: string }];
  return JSON.parse(call[1].body).counter;
}

describe("<CounterPlacementDialog />", () => {
  it("caps note at 600 chars", () => {
    const { container } = render(
      <CounterPlacementDialog placementId="p1" onClose={() => {}} />,
    );
    const ta = container.querySelector("textarea")!;
    fireEvent.change(ta, { target: { value: "x".repeat(700) } });
    expect((ta as HTMLTextAreaElement).value.length).toBe(600);
  });

  it("shows the 'max 50% to the venue' helper when QR is on", () => {
    const { getByText } = render(
      <CounterPlacementDialog placementId="p1" onClose={() => {}} />,
    );
    expect(getByText(/max 50% to the venue/i)).toBeTruthy();
  });

  // F27: the old ladder sent "paid_loan" for paid loan + QR, dropping the
  // revenue-share half of the arrangement. The canonical derived value for
  // fee + QR is "mixed".
  it("derives mixed when a paid loan is countered with QR on", async () => {
    const { getByText } = render(
      <CounterPlacementDialog
        placementId="p1"
        initial={{ monthly_fee_gbp: 80, revenue_share_percent: 15, qr_enabled: true }}
        onClose={() => {}}
      />,
    );
    fireEvent.click(getByText("Send counter"));
    await waitFor(() => expect(mutateMock).toHaveBeenCalledTimes(1));
    expect(sentCounter()).toMatchObject({
      arrangementType: "mixed",
      monthlyFeeGbp: 80,
      qrEnabled: true,
      revenueSharePercent: 15,
    });
  });

  it("derives revenue_share for a QR-only counter", async () => {
    const { getByText } = render(
      <CounterPlacementDialog
        placementId="p1"
        initial={{ monthly_fee_gbp: null, revenue_share_percent: 10, qr_enabled: true }}
        onClose={() => {}}
      />,
    );
    fireEvent.click(getByText("Send counter"));
    await waitFor(() => expect(mutateMock).toHaveBeenCalledTimes(1));
    expect(sentCounter()).toMatchObject({ arrangementType: "revenue_share", qrEnabled: true });
  });

  it("derives free_loan (free display) when neither fee nor QR is on", async () => {
    const { getByText } = render(
      <CounterPlacementDialog
        placementId="p1"
        initial={{ monthly_fee_gbp: null, revenue_share_percent: null, qr_enabled: false }}
        onClose={() => {}}
      />,
    );
    fireEvent.click(getByText("Send counter"));
    await waitFor(() => expect(mutateMock).toHaveBeenCalledTimes(1));
    expect(sentCounter()).toMatchObject({ arrangementType: "free_loan", qrEnabled: false });
  });
});

// Row 2144 / PASS2 "silent failure" pattern. Typing 70 into the revenue-share
// box silently became 50. No request was sent and nothing was said, so a venue
// asking for 70% saw the number change under their cursor with no explanation
// and no way to tell whether it was a typo of their own.
describe("CounterPlacementDialog says when it caps the share (row 2144)", () => {
  function shareInput(container: HTMLElement): HTMLInputElement {
    return container.querySelector('input[type="number"][max="50"]') as HTMLInputElement;
  }

  it("explains the cap when the typed value is above it", () => {
    const { container, getByText } = render(
      <CounterPlacementDialog placementId="p1" onClose={() => {}} />,
    );

    fireEvent.change(shareInput(container), { target: { value: "70" } });

    expect(getByText(/capped/i)).toBeTruthy();
    expect(shareInput(container).value).toBe("50");
  });

  it("says nothing for a value inside the cap", () => {
    const { container, queryByText } = render(
      <CounterPlacementDialog placementId="p1" onClose={() => {}} />,
    );

    fireEvent.change(shareInput(container), { target: { value: "20" } });

    expect(queryByText(/capped/i)).toBeNull();
  });

  it("clears the explanation once the value is corrected", () => {
    const { container, getByText, queryByText } = render(
      <CounterPlacementDialog placementId="p1" onClose={() => {}} />,
    );

    fireEvent.change(shareInput(container), { target: { value: "70" } });
    expect(getByText(/capped/i)).toBeTruthy();

    fireEvent.change(shareInput(container), { target: { value: "20" } });
    expect(queryByText(/capped/i)).toBeNull();
  });
});
