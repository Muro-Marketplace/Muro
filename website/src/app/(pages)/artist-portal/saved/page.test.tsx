// @vitest-environment jsdom
// 05 E43-g. handleRemove awaited the DELETE but never checked res.ok. authFetch
// resolves on a non-2xx, so a rejected removal still dropped the item from the
// list (and it reappeared on reload) with the catch swallowing network errors.
// It now goes through mutate(): the item is removed only on a confirmed delete,
// and a failure surfaces an error toast and leaves the item in place.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";

const { authFetchMock, mutateMock, showToastMock } = vi.hoisted(() => ({
  authFetchMock: vi.fn(),
  mutateMock: vi.fn(),
  showToastMock: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({ supabase: { auth: {}, from: () => ({}) } }));
// Keep the real ApiError (the handler uses instanceof); override the IO.
vi.mock("@/lib/api-client", async (orig) => {
  const actual = await orig<typeof import("@/lib/api-client")>();
  return { ...actual, authFetch: authFetchMock, mutate: mutateMock };
});
vi.mock("@/context/ToastContext", () => ({ useToast: () => ({ showToast: showToastMock }) }));
vi.mock("@/components/ArtistPortalLayout", () => ({ default: ({ children }: { children: unknown }) => children }));
vi.mock("@/components/EmptyState", () => ({ default: () => null }));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("next/link", () => ({ default: ({ children }: { children: unknown }) => children }));

import ArtistSavedPage from "./page";
import { ApiError } from "@/lib/api-client";

const ITEM = { id: "s1", user_id: "u1", item_type: "work", item_id: "cool-painting", created_at: "2026-01-01T00:00:00Z" };

afterEach(() => cleanup());
beforeEach(() => {
  authFetchMock.mockReset();
  mutateMock.mockReset();
  showToastMock.mockReset();
  // The saved-items load (GET). browse-artists goes through global fetch.
  authFetchMock.mockImplementation(() =>
    Promise.resolve(new Response(JSON.stringify({ items: [ITEM] }), { status: 200 })),
  );
  global.fetch = vi.fn(() =>
    Promise.resolve(new Response(JSON.stringify({ artists: [] }), { status: 200 })),
  ) as unknown as typeof fetch;
});

describe("artist saved handleRemove (05 E43-g)", () => {
  it("keeps the item and toasts an error when the delete fails", async () => {
    mutateMock.mockRejectedValue(new ApiError(500, "server exploded", "server_error", {}));
    render(<ArtistSavedPage />);
    const removeBtn = await screen.findByText("Remove");

    fireEvent.click(removeBtn);

    await waitFor(() =>
      expect(showToastMock).toHaveBeenCalledWith("server exploded", { variant: "error" }),
    );
    // Fail-before: authFetch resolved on the non-2xx, so the item vanished anyway.
    expect(screen.getByText("Remove")).toBeTruthy();
    expect(mutateMock).toHaveBeenCalledWith("/api/saved", expect.objectContaining({ method: "DELETE" }));
  });

  it("removes the item on a confirmed delete", async () => {
    mutateMock.mockResolvedValue({});
    render(<ArtistSavedPage />);
    const removeBtn = await screen.findByText("Remove");

    fireEvent.click(removeBtn);

    await waitFor(() => expect(screen.queryByText("Remove")).toBeNull());
    expect(showToastMock).not.toHaveBeenCalled();
  });
});
