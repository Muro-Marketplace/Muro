// @vitest-environment jsdom
//
// Row D L1313. "No way to delete a blog draft." `DELETE /api/blogs/[id]` has
// existed and is owner-gated; nothing in the portal ever called it. So a draft
// written by mistake stayed on the artist's list for good, and the QA post that
// reached the public journal during pass 1 could only be removed with SQL,
// which is why it is still item 1 on the manual launch checklist.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const { authFetchMock, mutateMock, confirmMock } = vi.hoisted(() => ({
  authFetchMock: vi.fn(),
  mutateMock: vi.fn(),
  confirmMock: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({ supabase: { auth: {}, from: () => ({}) } }));
vi.mock("@/lib/api-client", async (orig) => {
  const actual = await orig<typeof import("@/lib/api-client")>();
  return { ...actual, authFetch: authFetchMock, mutate: mutateMock };
});
vi.mock("@/context/ConfirmContext", () => ({ useConfirm: () => ({ confirm: confirmMock }) }));
vi.mock("@/lib/feature-flags", () => ({ isFlagOn: () => true }));
vi.mock("@/components/ArtistPortalLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import BlogsPage from "./page";
import { clearPortalGetCache } from "@/lib/portal-get";

const DRAFT = {
  id: "b-1",
  slug: "a-draft",
  title: "A draft",
  status: "draft",
  created_at: "2026-08-01T00:00:00.000Z",
  published_at: null,
};

afterEach(() => cleanup());
beforeEach(() => {
  // portalGet holds a resolved response briefly so a click can join the
  // request the sidebar hover started; it must not carry between tests.
  clearPortalGetCache();
  authFetchMock.mockReset();
  mutateMock.mockReset();
  confirmMock.mockReset();
  confirmMock.mockResolvedValue(true);
  mutateMock.mockResolvedValue({});
  authFetchMock.mockResolvedValue({ ok: true, json: async () => ({ blogs: [DRAFT] }) });
});

describe("an artist can delete their own post (row D L1313)", () => {
  it("calls the owner-gated DELETE and drops the row", async () => {
    render(<BlogsPage />);

    fireEvent.click(await screen.findByRole("button", { name: /^Delete$/ }));

    await waitFor(() =>
      expect(mutateMock).toHaveBeenCalledWith("/api/blogs/b-1", { method: "DELETE" }),
    );
    await waitFor(() => expect(screen.queryByText("A draft")).toBeNull());
  });

  it("asks first, and does nothing when the answer is no", async () => {
    confirmMock.mockResolvedValue(false);
    render(<BlogsPage />);

    fireEvent.click(await screen.findByRole("button", { name: /^Delete$/ }));

    await waitFor(() => expect(confirmMock).toHaveBeenCalled());
    expect(mutateMock).not.toHaveBeenCalled();
    expect(screen.getByText("A draft")).toBeTruthy();
  });

  it("warns that a PUBLISHED post comes off the journal", async () => {
    authFetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ blogs: [{ ...DRAFT, status: "published", published_at: "2026-08-02" }] }),
    });
    render(<BlogsPage />);

    fireEvent.click(await screen.findByRole("button", { name: /^Delete$/ }));

    await waitFor(() =>
      expect(confirmMock.mock.calls[0][0].body).toMatch(/come off the public journal/i),
    );
  });

  it("keeps the row and says so when the delete fails", async () => {
    mutateMock.mockRejectedValue(new Error("network"));
    render(<BlogsPage />);

    fireEvent.click(await screen.findByRole("button", { name: /^Delete$/ }));

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText("A draft")).toBeTruthy();
  });
});

// LA-C011 (launch audit 2026-09-05). A non-OK answer left the list empty and the
// page said "You haven't written anything yet", and a network failure escaped
// the try/finally as an unhandled rejection with nothing on screen.
describe("blogs list when the load fails (LA-C011)", () => {
  it("shows an error with a retry on a non-2xx answer instead of the empty copy", async () => {
    authFetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ error: "boom" }) });
    render(<BlogsPage />);
    expect(await screen.findByText(/could not load your blogs/i)).toBeTruthy();
    expect(screen.queryByText(/written anything yet/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("A draft")).toBeTruthy();
  });

  it("shows the same error when the request itself fails", async () => {
    authFetchMock.mockRejectedValueOnce(new Error("network down"));
    render(<BlogsPage />);
    expect(await screen.findByText(/could not load your blogs/i)).toBeTruthy();
  });
});
