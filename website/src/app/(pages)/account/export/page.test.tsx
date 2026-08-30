// @vitest-environment jsdom
// C30/C31 (QA 2026-08-28). This page POSTed while the API only exported GET,
// so every export attempt 405'd into the error state, and the "ready" copy
// promised an email job that has never existed. The page now GETs the dump
// with the caller's bearer token, wraps it in a blob URL and offers it as a
// direct download — no fictional email promise.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

const { authFetchMock } = vi.hoisted(() => ({ authFetchMock: vi.fn() }));

vi.mock("@/lib/api-client", () => ({
  authFetch: (...args: unknown[]) => authFetchMock(...args),
}));

const useAuthMock = vi.fn();
vi.mock("@/context/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));

import AccountExportPage from "./page";

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  authFetchMock.mockReset();
  useAuthMock.mockReturnValue({ user: { id: "u1" }, loading: false });
  // jsdom's URL lacks the object-URL statics; patch them in place so the
  // rest of URL (which jsdom itself relies on) stays intact.
  (URL as unknown as { createObjectURL: unknown }).createObjectURL = vi.fn(() => "blob:mock-export");
  (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = vi.fn();
});

describe("/account/export page (C30/C31)", () => {
  it("GETs the export and offers it as a download, never POSTing", async () => {
    authFetchMock.mockResolvedValue(
      new Response(JSON.stringify({ user: { id: "u1" } }), { status: 200 }),
    );

    render(<AccountExportPage />);

    const link = (await screen.findByText("Download")) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("blob:mock-export");
    expect(link.getAttribute("download")).toMatch(/^wallplace-export-.*\.json$/);

    // Fail-before: mutate(..., { method: "POST" }) against a GET-only route.
    expect(authFetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = authFetchMock.mock.calls[0] as [string, RequestInit?];
    expect(url).toBe("/api/account/export");
    expect(init?.method ?? "GET").toBe("GET");

    // No we-will-email-you fiction anywhere on the ready state.
    expect(screen.queryByText(/email you a download link/i)).toBeNull();
  });

  it("lands in the error state with the privacy fallback when the API refuses", async () => {
    authFetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: "Could not prepare your export." }), { status: 500 }),
    );

    render(<AccountExportPage />);

    expect(await screen.findByText("Could not prepare your export.")).toBeTruthy();
    expect(screen.getByText(/privacy@wallplace\.co\.uk/)).toBeTruthy();
    expect(screen.queryByText("Download")).toBeNull();
  });

  it("asks a signed-out visitor to sign in instead of firing the export", async () => {
    useAuthMock.mockReturnValue({ user: null, loading: false });
    render(<AccountExportPage />);
    expect(screen.getByText("Sign in")).toBeTruthy();
    await waitFor(() => expect(authFetchMock).not.toHaveBeenCalled());
  });
});
