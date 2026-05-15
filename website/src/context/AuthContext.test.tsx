// src/context/AuthContext.test.tsx
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor, screen } from "@testing-library/react";

// Use vi.hoisted so the mock variables are initialised before vi.mock hoisting.
const { mockGetSession, mockOnAuthStateChange, authStateHandler } = vi.hoisted(() => {
  const handler: { current: ((event: string, session: unknown) => void) | null } = { current: null };
  return {
    mockGetSession: vi.fn(),
    mockOnAuthStateChange: vi.fn((cb: (event: string, session: unknown) => void) => {
      handler.current = cb;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    }),
    authStateHandler: handler,
  };
});

// Mock the supabase client BEFORE importing the context.
vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: mockGetSession,
      onAuthStateChange: mockOnAuthStateChange,
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
    },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: null }) }) }) }),
  },
}));

import { AuthProvider, useAuth } from "./AuthContext";

function Probe() {
  const { userType, loading } = useAuth();
  return <span data-testid="role">{loading ? "loading" : (userType ?? "null")}</span>;
}

function renderWithUser(metadata: Record<string, unknown>) {
  mockGetSession.mockResolvedValue({
    data: { session: { user: { id: "u1", email: "x@y.com", user_metadata: metadata } } },
  });
  return render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
}

afterEach(() => cleanup());

describe("AuthContext welcome fan-out", () => {
  const fetchMock = vi.fn(() => Promise.resolve(new Response("{}")));

  beforeEach(() => {
    fetchMock.mockClear();
    authStateHandler.current = null;
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    mockGetSession.mockResolvedValue({ data: { session: null } });
  });

  it("fires /api/auth/welcome once per SIGNED_IN, even with replays from Strict Mode or repeat events", async () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(authStateHandler.current).not.toBeNull());

    const session = { user: { id: "u-welcome", user_metadata: {} }, access_token: "tok" };
    // Real-world replay: SIGNED_IN fires once on initial verify, then
    // again if a second subscriber re-emits it. Without the ref guard
    // (and with the old setState-side-effect), this used to multiply.
    authStateHandler.current!("SIGNED_IN", session);
    authStateHandler.current!("SIGNED_IN", session);
    authStateHandler.current!("SIGNED_IN", session);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const welcomeCalls = fetchMock.mock.calls.filter((args: unknown[]) => args[0] === "/api/auth/welcome");
    expect(welcomeCalls).toHaveLength(1);
  });

  it("does not fire welcome for TOKEN_REFRESHED or INITIAL_SESSION", async () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(authStateHandler.current).not.toBeNull());

    const session = { user: { id: "u-refresh", user_metadata: {} }, access_token: "tok" };
    authStateHandler.current!("INITIAL_SESSION", session);
    authStateHandler.current!("TOKEN_REFRESHED", session);

    // Give microtasks a turn; nothing should have hit the welcome endpoint.
    await new Promise((r) => setTimeout(r, 0));
    const welcomeCalls = fetchMock.mock.calls.filter((args: unknown[]) => args[0] === "/api/auth/welcome");
    expect(welcomeCalls).toHaveLength(0);
  });
});

describe("AuthContext userType resolution", () => {
  it("resolves a valid role", async () => {
    renderWithUser({ user_type: "artist" });
    // Wait for loading to complete, then verify the role
    await waitFor(() => expect(screen.getByTestId("role").textContent).not.toBe("loading"));
    expect(screen.getByTestId("role").textContent).toBe("artist");
  });

  it("returns null for an unknown user_type rather than letting it leak through", async () => {
    renderWithUser({ user_type: "hacker" });
    // Wait for loading to complete, then verify hacker is NOT passed through
    await waitFor(() => expect(screen.getByTestId("role").textContent).not.toBe("loading"));
    expect(screen.getByTestId("role").textContent).toBe("null");
  });

  it("returns null when user_type is missing entirely", async () => {
    renderWithUser({});
    // Wait for loading to complete, then verify null
    await waitFor(() => expect(screen.getByTestId("role").textContent).not.toBe("loading"));
    expect(screen.getByTestId("role").textContent).toBe("null");
  });
});
