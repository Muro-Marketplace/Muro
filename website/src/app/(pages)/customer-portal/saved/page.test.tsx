// @vitest-environment jsdom
//
// C7. SaveButton stores a work's UUID in saved_items.item_id. When the work
// no longer resolves against /api/browse-artists (sold, unpublished, artist
// gone) the row fell back to formatName(item_id), which title-cased the UUID
// into something like "9f3a2c1b 55d4 4e2f ...", and linked it to
// /browse/<uuid>, which is a 404. The stale comment on linkForItem still
// claimed item_id was "artist-slug/work-title".

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const { authFetchMock, mutateMock, fetchMock } = vi.hoisted(() => ({
  authFetchMock: vi.fn(),
  mutateMock: vi.fn(),
  fetchMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => ({ get: () => null, toString: () => "" }),
  usePathname: () => "/customer-portal/saved",
}));

vi.mock("@/lib/use-url-state", async () => {
  const { useState } = await import("react");
  return {
    useUrlState: (_param: string, defaultValue: string) => useState(defaultValue),
  };
});

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ user: { id: "u-cust-1", email: "maya@example.com" }, userType: "customer", loading: false }),
}));
vi.mock("@/context/ToastContext", () => ({ useToast: () => ({ showToast: vi.fn() }) }));

vi.mock("@/components/CustomerPortalLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/EmptyState", () => ({
  default: ({ title }: { title: string }) => <div data-testid="empty-state">{title}</div>,
}));
vi.mock("next/image", () => ({
  default: ({ alt }: { alt: string }) => <span data-testid="thumb">{alt}</span>,
}));

vi.mock("@/lib/api-client", async (orig) => {
  const actual = await orig<typeof import("@/lib/api-client")>();
  return { ...actual, authFetch: authFetchMock, mutate: mutateMock };
});
vi.mock("@/lib/supabase", () => ({ supabase: { auth: {}, from: () => ({}) } }));

import CustomerSavedPage from "./page";

const LIVE_WORK_ID = "aaaaaaaa-1111-4222-8333-444444444444";
const VANISHED_WORK_ID = "bbbbbbbb-5555-4666-8777-888888888888";

const savedItems = [
  { id: "s1", user_id: "u-cust-1", item_type: "work", item_id: LIVE_WORK_ID, created_at: "2026-08-01T10:00:00Z" },
  { id: "s2", user_id: "u-cust-1", item_type: "work", item_id: VANISHED_WORK_ID, created_at: "2026-08-02T10:00:00Z" },
];

const artists = [
  {
    slug: "alice-arden",
    name: "Alice Arden",
    image: "/a.jpg",
    works: [{ id: LIVE_WORK_ID, title: "Copper Morning", image: "/w.jpg" }],
  },
];

function json(data: unknown): Response {
  return { ok: true, json: async () => data } as unknown as Response;
}

afterEach(() => cleanup());
beforeEach(() => {
  authFetchMock.mockReset();
  mutateMock.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);

  authFetchMock.mockImplementation(() => Promise.resolve(json({ items: savedItems })));
  fetchMock.mockImplementation(() => Promise.resolve(json({ artists })));
});

function hrefs(): string[] {
  return screen.queryAllByRole("link").map((a) => a.getAttribute("href") || "");
}

describe("customer saved works, unresolved works (C7)", () => {
  it("says a vanished work is gone instead of title-casing its UUID", async () => {
    render(<CustomerSavedPage />);

    expect(await screen.findByText("This work is no longer available")).toBeTruthy();
    // Fail-before: the UUID was title-cased into a fake work name.
    expect(screen.queryByText(/Bbbbbbbb/i)).toBeNull();
  });

  it("does not link a vanished work to a dead browse page", async () => {
    render(<CustomerSavedPage />);

    await screen.findByText("This work is no longer available");
    // Fail-before: /browse/<uuid>, a guaranteed 404.
    expect(hrefs().some((h) => h.includes(VANISHED_WORK_ID))).toBe(false);
  });

  it("still links a work that does resolve, through its artist page", async () => {
    render(<CustomerSavedPage />);

    const link = await screen.findByText("Copper Morning");
    expect(link.getAttribute("href")).toBe("/browse/alice-arden?work=copper-morning");
  });

  it("does not claim a work is gone when the catalogue came back empty", async () => {
    // A 200 with no `artists` key: the saved list still loads, but nothing
    // can be resolved against it, so "no longer available" would be a lie.
    fetchMock.mockImplementation(() => Promise.resolve(json({})));

    render(<CustomerSavedPage />);

    await waitFor(() => {
      expect(screen.queryByText("Loading saved items...")).toBeNull();
    });
    expect(screen.queryByText("This work is no longer available")).toBeNull();
    // Fail-before: every row still linked to /browse/<uuid>.
    expect(hrefs().some((h) => h.includes(VANISHED_WORK_ID))).toBe(false);
    expect(hrefs().some((h) => h.includes(LIVE_WORK_ID))).toBe(false);
  });
});

// LA-C022 (launch audit 2026-09-05). Both requests behind this page ended in
// .catch(() => {}), so a failed saved-items or catalogue load rendered
// "No saved works yet" with no feedback.
describe("customer saved when a request fails (LA-C022)", () => {
  it("shows an error with a retry instead of the empty state, and recovers", async () => {
    authFetchMock.mockImplementationOnce(() =>
      Promise.resolve({ ok: false, status: 500, json: async () => ({ error: "boom" }) } as unknown as Response),
    );
    render(<CustomerSavedPage />);
    expect(await screen.findByText(/could not load your saved items/i)).toBeTruthy();
    expect(screen.queryByText("No saved works yet")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Copper Morning")).toBeTruthy();
  });
});
