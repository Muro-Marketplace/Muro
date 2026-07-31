// @vitest-environment jsdom
// E43-c. setStatus (Mark fulfilled / Close) skipped the res.ok check and
// swallowed its catch, so a 403/500/network failure silently did nothing with
// no feedback. authFetch resolves for non-2xx, so the failure has to be checked.
// It now mirrors act()/fulfillResponse(): setError on failure, load() only on 2xx.

import { Suspense } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";

const { authFetchMock } = vi.hoisted(() => ({ authFetchMock: vi.fn() }));

vi.mock("@/lib/api-client", () => ({ authFetch: authFetchMock }));
vi.mock("@/lib/recent-artwork-requests", () => ({ getRecentRequestById: () => null }));
vi.mock("@/components/VenuePortalLayout", () => ({ default: ({ children }: { children: unknown }) => children }));
vi.mock("next/link", () => ({ default: ({ children }: { children: unknown }) => children }));

import VenueArtworkRequestDetailPage from "./page";

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

async function renderPage() {
  // The page unwraps `params` with React's use() hook, which suspends on first
  // render. Flush the resolved promise inside act() so the component commits.
  await act(async () => {
    render(
      <Suspense fallback={null}>
        <VenueArtworkRequestDetailPage params={Promise.resolve({ id: "req1" })} />
      </Suspense>,
    );
  });
}

afterEach(() => cleanup());
beforeEach(() => authFetchMock.mockReset());

describe("artwork-request setStatus (E43-c)", () => {
  it("surfaces an error and does NOT advance the status when the write fails (403)", async () => {
    authFetchMock.mockImplementation((_url: string, opts?: { method?: string }) =>
      opts?.method === "PATCH"
        ? Promise.resolve(new Response(JSON.stringify({ error: "Request already closed" }), { status: 403 }))
        : Promise.resolve(new Response(JSON.stringify({ request: OPEN_REQUEST, responses: [] }), { status: 200 })),
    );

    await renderPage();
    const markBtn = await screen.findByText("Mark fulfilled");
    fireEvent.click(markBtn);

    // Fail-before: the swallowed catch + missing res.ok check meant no error ever
    // surfaced; the button silently did nothing.
    expect(await screen.findByText("Request already closed")).toBeTruthy();
    // Status did not advance -> the open-only action buttons are still there.
    expect(screen.getByText("Mark fulfilled")).toBeTruthy();
  });

  it("advances the status on success (2xx) with no error", async () => {
    let patched = false;
    authFetchMock.mockImplementation((_url: string, opts?: { method?: string }) => {
      if (opts?.method === "PATCH") {
        patched = true;
        return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
      }
      const status = patched ? "fulfilled" : "open";
      return Promise.resolve(
        new Response(JSON.stringify({ request: { ...OPEN_REQUEST, status }, responses: [] }), { status: 200 }),
      );
    });

    await renderPage();
    const markBtn = await screen.findByText("Mark fulfilled");
    fireEvent.click(markBtn);

    // After a successful write + reload the request is fulfilled, so the
    // open-only "Mark fulfilled" button is gone.
    await waitFor(() => expect(screen.queryByText("Mark fulfilled")).toBeNull());
    expect(screen.queryByText("Request already closed")).toBeNull();
  });
});
