// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor, cleanup } from "@testing-library/react";

// vi.mock factories are hoisted before imports, so we must avoid referencing
// variables declared outside the factory. Use vi.fn() inline and retrieve
// the spy via vi.mocked() after import.

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
    },
  },
}));

vi.mock("@/lib/api-client", () => ({
  authFetch: vi.fn(),
}));

// Import component and mocked modules AFTER vi.mock declarations.
import AuthCallbackPage from "./page";
import { supabase } from "@/lib/supabase";
import { authFetch } from "@/lib/api-client";

// Typed spies retrieved after import.
const mockGetSession = vi.mocked(supabase.auth.getSession);
const mockAuthFetch = vi.mocked(authFetch);

// window.location stub — track calls to replace().
const locationReplace = vi.fn();

function stubLocation(search: string) {
  Object.defineProperty(window, "location", {
    value: { search, replace: locationReplace },
    writable: true,
    configurable: true,
  });
}

function mockSession() {
  mockGetSession.mockResolvedValue({
    data: { session: { user: { id: "user-123" } } },
    error: null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

beforeEach(() => {
  locationReplace.mockReset();
  mockGetSession.mockReset();
  mockAuthFetch.mockReset();
  stubLocation("");
});

afterEach(() => cleanup());

describe("AuthCallbackPage — open-redirect guard", () => {
  it("does NOT redirect to an external URL when ?next=https://evil.com (no state)", async () => {
    stubLocation("?next=https://evil.com");
    mockSession();

    render(<AuthCallbackPage />);

    await waitFor(() => expect(locationReplace).toHaveBeenCalled(), { timeout: 5000 });

    // Must land on the safe fallback, never the evil URL.
    expect(locationReplace).toHaveBeenCalledWith("/browse");
    expect(locationReplace).not.toHaveBeenCalledWith("https://evil.com");
  });

  it("allows a safe internal path when ?next=/account (no state)", async () => {
    stubLocation("?next=/account");
    mockSession();

    render(<AuthCallbackPage />);

    await waitFor(() => expect(locationReplace).toHaveBeenCalled(), { timeout: 5000 });

    expect(locationReplace).toHaveBeenCalledWith("/account");
  });

  it("uses state-derived next path when state returns a safe internal path", async () => {
    stubLocation("?state=validtoken&next=/should-be-ignored");
    mockSession();
    mockAuthFetch.mockResolvedValue({
      json: async () => ({ next: "/artist-portal" }),
      ok: true,
    } as unknown as Response);

    render(<AuthCallbackPage />);

    await waitFor(() => expect(locationReplace).toHaveBeenCalled(), { timeout: 5000 });

    expect(locationReplace).toHaveBeenCalledWith("/artist-portal");
  });

  it("falls back to /browse when state returns an external next (defence-in-depth)", async () => {
    stubLocation("?state=validtoken");
    mockSession();
    mockAuthFetch.mockResolvedValue({
      json: async () => ({ next: "https://evil.com" }),
      ok: true,
    } as unknown as Response);

    render(<AuthCallbackPage />);

    await waitFor(() => expect(locationReplace).toHaveBeenCalled(), { timeout: 5000 });

    expect(locationReplace).toHaveBeenCalledWith("/browse");
    expect(locationReplace).not.toHaveBeenCalledWith("https://evil.com");
  });
});
