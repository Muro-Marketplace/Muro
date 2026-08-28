// @vitest-environment jsdom
// E43-c. setStatus (Mark fulfilled / Close) skipped the res.ok check and
// swallowed its catch, so a 403/500/network failure silently did nothing with
// no feedback. It now goes through mutate (throws on a non-2xx), so the reload
// runs only on a confirmed 2xx and the reason always surfaces. act() (accept /
// decline a response) and fulfillResponse() moved to mutate the same way; the
// read GET (load) stays on authFetch.

import { Suspense } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act as reactAct, cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";

const { authFetchMock, mutateMock } = vi.hoisted(() => ({ authFetchMock: vi.fn(), mutateMock: vi.fn() }));

vi.mock("@/lib/supabase", () => ({ supabase: { auth: {}, from: () => ({}) } }));
vi.mock("@/lib/api-client", async (orig) => {
  const actual = await orig<typeof import("@/lib/api-client")>();
  return { ...actual, authFetch: authFetchMock, mutate: mutateMock };
});
vi.mock("@/lib/recent-artwork-requests", () => ({ getRecentRequestById: () => null }));
vi.mock("@/components/VenuePortalLayout", () => ({ default: ({ children }: { children: unknown }) => children }));
vi.mock("next/link", () => ({ default: ({ children }: { children: unknown }) => children }));

import VenueArtworkRequestDetailPage from "./page";
import { ApiError } from "@/lib/api-client";

const OPEN_REQUEST = {
  id: "req1",
  title: "Large abstract for the lobby",
  description: "Something bold.",
  intent: [],
  styles: [],
  mediums: [],
  budget_min_pence: null,
  budget_max_pence: null,
  status: "open",
  visibility: "public",
  location: "London",
  timescale: null,
  created_at: "2026-01-01T00:00:00Z",
};

const SENT_RESPONSE = {
  id: "resp1",
  artist_user_id: "artist-1",
  artist_slug: "fin-coles",
  response_type: "message" as const,
  message: "I would love to make this.",
  work_ids: [],
  proposed_offer_amount_pence: null,
  proposed_commission_amount_pence: null,
  proposed_commission_timeline: null,
  proposed_monthly_fee_pence: null,
  proposed_qr_enabled: null,
  proposed_revenue_share_percent: null,
  status: "sent",
  linked_offer_id: null,
  linked_commission_id: null,
  linked_placement_id: null,
  created_at: "2026-01-02T00:00:00Z",
};

/** authFetch (the read GET) resolves with this request + responses payload. */
function getReturns(request: unknown, responses: unknown[] = []) {
  authFetchMock.mockResolvedValue(
    new Response(JSON.stringify({ request, responses }), { status: 200 }),
  );
}

async function renderPage() {
  // The page unwraps `params` with React's use() hook, which suspends on first
  // render. Flush the resolved promise inside act() so the component commits.
  await reactAct(async () => {
    render(
      <Suspense fallback={null}>
        <VenueArtworkRequestDetailPage params={Promise.resolve({ id: "req1" })} />
      </Suspense>,
    );
  });
}

afterEach(() => cleanup());
beforeEach(() => {
  authFetchMock.mockReset();
  mutateMock.mockReset();
});

describe("artwork-request setStatus (E43-c, mutate)", () => {
  it("surfaces an error and does NOT advance the status when the write fails (403)", async () => {
    getReturns(OPEN_REQUEST);
    mutateMock.mockRejectedValue(new ApiError(403, "Request already closed", "Request already closed", {}));

    await renderPage();
    fireEvent.click(await screen.findByText("Mark fulfilled"));

    // Fail-before: the swallowed catch + missing res.ok check meant no error ever
    // surfaced; the button silently did nothing.
    expect(await screen.findByText("Request already closed")).toBeTruthy();
    // Status did not advance -> the open-only action buttons are still there.
    expect(screen.getByText("Mark fulfilled")).toBeTruthy();
  });

  it("advances the status on success (2xx) with no error", async () => {
    let patched = false;
    authFetchMock.mockImplementation(() => {
      const status = patched ? "fulfilled" : "open";
      return Promise.resolve(
        new Response(JSON.stringify({ request: { ...OPEN_REQUEST, status }, responses: [] }), { status: 200 }),
      );
    });
    mutateMock.mockImplementation(() => {
      patched = true;
      return Promise.resolve({ ok: true });
    });

    await renderPage();
    fireEvent.click(await screen.findByText("Mark fulfilled"));

    // After a successful write + reload the request is fulfilled, so the
    // open-only "Mark fulfilled" button is gone.
    await waitFor(() => expect(screen.queryByText("Mark fulfilled")).toBeNull());
    expect(screen.queryByText("Request already closed")).toBeNull();
  });
});

describe("artwork-request act() decline (mutate)", () => {
  it("surfaces the server reason when declining a response fails", async () => {
    getReturns(OPEN_REQUEST, [SENT_RESPONSE]);
    mutateMock.mockRejectedValue(new ApiError(409, "Response already handled", "Response already handled", {}));

    await renderPage();
    fireEvent.click(await screen.findByText("Decline"));

    expect(await screen.findByText("Response already handled")).toBeTruthy();
    // The response was not reloaded away, so its actions remain.
    expect(screen.getByText("Decline")).toBeTruthy();
  });
});
