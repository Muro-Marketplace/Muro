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

// 05: oauth-finalize goes through mutate now (returns the parsed body on 2xx,
// throws on a non-2xx) instead of authFetch returning a raw Response.
vi.mock("@/lib/api-client", () => ({
  mutate: vi.fn(),
}));

// Import component and mocked modules AFTER vi.mock declarations.
import AuthCallbackPage from "./page";
import { supabase } from "@/lib/supabase";
import { mutate } from "@/lib/api-client";

// Typed spies retrieved after import.
const mockGetSession = vi.mocked(supabase.auth.getSession);
const mockMutate = vi.mocked(mutate);

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
  mockMutate.mockReset();
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
    mockMutate.mockResolvedValue({ next: "/artist-portal" });

    render(<AuthCallbackPage />);

    await waitFor(() => expect(locationReplace).toHaveBeenCalled(), { timeout: 5000 });

    expect(locationReplace).toHaveBeenCalledWith("/artist-portal");
  });

  it("falls back to /browse when state returns an external next (defence-in-depth)", async () => {
    stubLocation("?state=validtoken");
    mockSession();
    mockMutate.mockResolvedValue({ next: "https://evil.com" });

    render(<AuthCallbackPage />);

    await waitFor(() => expect(locationReplace).toHaveBeenCalled(), { timeout: 5000 });

    expect(locationReplace).toHaveBeenCalledWith("/browse");
    expect(locationReplace).not.toHaveBeenCalledWith("https://evil.com");
  });
});
