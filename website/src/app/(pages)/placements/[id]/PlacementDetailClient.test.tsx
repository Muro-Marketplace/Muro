// @vitest-environment jsdom
//
// F28. handleAdvance ended in `catch { /* ignore; next load will reconcile */ }`.
// Nothing reconciles a rejected PATCH, so a 422 from the placement state machine
// left "Mark live" looking like it had simply not responded. The undo path
// beside it already toasted; the advance path now does too.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";

const { authFetchMock, mutateMock, showToastMock, confirmMock, replaceMock, ApiErrorStub } = vi.hoisted(() => ({
  authFetchMock: vi.fn(),
  mutateMock: vi.fn(),
  showToastMock: vi.fn(),
  confirmMock: vi.fn(async () => true),
  replaceMock: vi.fn(),
  ApiErrorStub: class ApiErrorStub extends Error {},
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock, push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/api-client", () => ({
  authFetch: authFetchMock,
  mutate: mutateMock,
  ApiError: ApiErrorStub,
}));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ user: { id: "venue-1" }, loading: false }) }));
vi.mock("@/context/ToastContext", () => ({ useToast: () => ({ showToast: showToastMock }) }));
vi.mock("@/context/ConfirmContext", () => ({ useConfirm: () => ({ confirm: confirmMock }) }));
vi.mock("@/lib/upload", () => ({ uploadImage: vi.fn() }));
vi.mock("next/link", () => ({ default: ({ children }: { children: unknown }) => children }));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("./PlacementLoanForm", () => ({ default: () => null }));
vi.mock("@/components/CounterPlacementDialog", () => ({ default: () => null }));
vi.mock("@/components/Breadcrumbs", () => ({ default: () => null }));
vi.mock("@/components/PlacementNegotiationLog", () => ({ default: () => null }));
vi.mock("@/components/PaidLoanPaymentChip", () => ({ default: () => null }));
vi.mock("@/components/InStoreOfferCard", () => ({ default: () => null }));

import PlacementDetailClient from "./PlacementDetailClient";

// Scheduled + installed are already stamped, so the next advanceable stage is
// "live", which fires handleAdvance directly instead of opening the date picker.
const PLACEMENT = {
  id: "pl_1",
  artist_user_id: "artist-1",
  venue_user_id: "venue-1",
  artist_slug: "maya-chen",
  venue_slug: "copper-kettle",
  work_title: "Last Light",
  venue: "The Copper Kettle",
  arrangement_type: "free_loan",
  status: "active",
  created_at: "2026-08-01T00:00:00.000Z",
  accepted_at: "2026-08-02T00:00:00.000Z",
  scheduled_for: "2026-08-03T00:00:00.000Z",
  installed_at: "2026-08-04T00:00:00.000Z",
  live_from: null,
  collected_at: null,
  in_store_price: null,
};

afterEach(() => cleanup());
beforeEach(() => {
  authFetchMock.mockReset();
  mutateMock.mockReset();
  showToastMock.mockReset();
  confirmMock.mockReset();
  confirmMock.mockResolvedValue(true);
  authFetchMock.mockImplementation(() =>
    Promise.resolve(
      new Response(
        JSON.stringify({
          placement: PLACEMENT,
          record: null,
          recordVersions: [],
          photos: [],
          artist: { slug: "maya-chen", name: "Maya Chen" },
          venue: { slug: "copper-kettle", name: "The Copper Kettle" },
          viewerRole: "venue",
        }),
        { status: 200 },
      ),
    ),
  );
});

describe("PlacementDetailClient stage advance surfaces failures (F28)", () => {
  it("toasts the server's reason when the advance PATCH is rejected", async () => {
    mutateMock.mockRejectedValue(new ApiErrorStub("Placement must be active to advance the stage"));
    render(<PlacementDetailClient placementId="pl_1" />);

    fireEvent.click(await screen.findByRole("button", { name: /mark live on wall/i }));

    // Fail-before: the catch swallowed the error, so the button re-enabled and
    // nothing at all told the user the stage had not moved.
    await waitFor(() =>
      expect(showToastMock).toHaveBeenCalledWith(
        "Placement must be active to advance the stage",
        { variant: "error" },
      ),
    );
  });

  it("toasts a network message when the request never lands", async () => {
    mutateMock.mockRejectedValue(new Error("Failed to fetch"));
    render(<PlacementDetailClient placementId="pl_1" />);

    fireEvent.click(await screen.findByRole("button", { name: /mark live on wall/i }));

    await waitFor(() =>
      expect(showToastMock).toHaveBeenCalledWith(
        "Network error. Please try again.",
        { variant: "error" },
      ),
    );
  });

  it("stays quiet on a successful advance", async () => {
    mutateMock.mockResolvedValue({ success: true });
    render(<PlacementDetailClient placementId="pl_1" />);

    fireEvent.click(await screen.findByRole("button", { name: /mark live on wall/i }));

    await waitFor(() =>
      expect(mutateMock).toHaveBeenCalledWith(
        "/api/placements",
        expect.objectContaining({ method: "PATCH" }),
      ),
    );
    expect(showToastMock).not.toHaveBeenCalledWith(
      expect.anything(),
      { variant: "error" },
    );
  });
});
