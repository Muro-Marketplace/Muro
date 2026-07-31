// @vitest-environment jsdom
// E43-b. The withdraw confirm handler fired showToast("Offer withdrawn.") right
// after `await act(...)` regardless of the result. authFetch resolves for
// non-2xx, so a 403/500 still showed the success toast while the offer stayed
// put. act() now returns a boolean and the caller gates the toast on it.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";

const { authFetchMock, showToastMock } = vi.hoisted(() => ({
  authFetchMock: vi.fn(),
  showToastMock: vi.fn(),
}));

vi.mock("@/lib/api-client", () => ({ authFetch: authFetchMock }));
vi.mock("@/context/ToastContext", () => ({ useToast: () => ({ showToast: showToastMock }) }));
vi.mock("@/lib/dimensions", () => ({ displayPhysicalDimensions: () => "" }));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("next/link", () => ({ default: ({ children }: { children: unknown }) => children }));
// Expose the confirm action as a plain button so the test doesn't fight the real
// dialog internals. Renders only when open.
vi.mock("@/components/ConfirmDialog", () => ({
  default: ({ open, onConfirm }: { open: boolean; onConfirm: () => void }) =>
    open ? <button onClick={() => onConfirm()}>MOCK_CONFIRM</button> : null,
}));

import OffersList from "./OffersList";

const OFFER = {
  id: "o1",
  buyer_user_id: "v1",
  artist_user_id: "a1",
  created_by_user_id: "v1", // viewer is the sender -> Withdraw button shows
  artist_slug: "a",
  work_ids: ["w1"],
  collection_id: null,
  amount_pence: 5000,
  currency: "GBP",
  message: null,
  status: "pending", // pending + sender -> withdrawable
  expires_at: null,
  accepted_at: null,
  paid_at: null,
  paid_order_id: null,
  created_at: "2026-01-01T00:00:00Z",
  parent_offer_id: null,
  works: [],
  collection: null,
  venue: { user_id: "v1", name: "The Gallery", slug: "the-gallery", location: "London" },
  artist: { slug: "a", name: "Artist A" },
};

function mockLoadOk() {
  // GET /api/offers -> one withdrawable offer.
  return new Response(JSON.stringify({ offers: [OFFER] }), { status: 200 });
}

afterEach(() => cleanup());
beforeEach(() => {
  authFetchMock.mockReset();
  showToastMock.mockReset();
});

async function renderAndOpenWithdraw() {
  render(<OffersList viewerUserId="v1" />);
  // Wait for the initial load to paint the offer's Withdraw button.
  const withdrawBtn = await screen.findByText("Withdraw");
  fireEvent.click(withdrawBtn);
  fireEvent.click(screen.getByText("MOCK_CONFIRM"));
}

describe("OffersList withdraw (E43-b)", () => {
  it("does NOT toast success when the withdraw request fails (403)", async () => {
    authFetchMock.mockImplementation((_url: string, opts?: { method?: string }) => {
      if (opts?.method === "PATCH") {
        return Promise.resolve(new Response(JSON.stringify({ error: "Not allowed" }), { status: 403 }));
      }
      return Promise.resolve(mockLoadOk());
    });

    await renderAndOpenWithdraw();

    await waitFor(() => {
      // The error toast is the observable signal that the failure was handled.
      expect(showToastMock).toHaveBeenCalledWith(
        "Could not withdraw the offer. Please try again.",
        { variant: "error" },
      );
    });
    // Fail-before: the old void-returning act() let this fire on a 403.
    expect(showToastMock).not.toHaveBeenCalledWith("Offer withdrawn.");
    // The offer is still on screen (load() was not re-run on failure).
    expect(screen.getByText("Withdraw")).toBeTruthy();
  });

  it("toasts success when the withdraw request succeeds (2xx)", async () => {
    authFetchMock.mockImplementation((_url: string, opts?: { method?: string }) => {
      if (opts?.method === "PATCH") {
        return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
      }
      return Promise.resolve(mockLoadOk());
    });

    await renderAndOpenWithdraw();

    await waitFor(() => expect(showToastMock).toHaveBeenCalledWith("Offer withdrawn."));
    expect(showToastMock).not.toHaveBeenCalledWith(
      "Could not withdraw the offer. Please try again.",
      { variant: "error" },
    );
  });
});
