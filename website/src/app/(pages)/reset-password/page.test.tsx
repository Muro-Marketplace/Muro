// @vitest-environment jsdom
// A55 (QA 2026-08-28). A one-shot getSession() on mount decided between the
// form and the "Invalid or Expired Link" screen. When the SDK was still
// exchanging the recovery hash as getSession resolved, a perfectly valid
// link was shown the invalid-link screen. The page now retries briefly (the
// /auth/callback idiom) and listens for the auth event, only declaring the
// link dead once both come up empty.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

const { getSessionMock, authCallbacks } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  authCallbacks: [] as ((event: string, session: unknown) => void)[],
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: getSessionMock,
      onAuthStateChange: (cb: (event: string, session: unknown) => void) => {
        authCallbacks.push(cb);
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
      updateUser: vi.fn(async () => ({ error: null })),
    },
  },
}));

import ResetPasswordPage from "./page";

afterEach(() => cleanup());
beforeEach(() => {
  getSessionMock.mockReset();
  authCallbacks.length = 0;
});

describe("reset-password session race (A55)", () => {
  it("shows the form when the session lands on a later getSession attempt", async () => {
    // Fail-before: the first null answer painted "Invalid or Expired Link"
    // even though the SDK stamped the session milliseconds later.
    getSessionMock
      .mockResolvedValueOnce({ data: { session: null } })
      .mockResolvedValueOnce({ data: { session: null } })
      .mockResolvedValue({ data: { session: { user: { id: "u" } } } });

    render(<ResetPasswordPage />);

    // While checking, neither verdict renders.
    expect(screen.getByText(/checking your reset link/i)).toBeTruthy();
    expect(screen.queryByText(/invalid or expired link/i)).toBeNull();

    expect(await screen.findByPlaceholderText(/^new password/i, undefined, { timeout: 4000 })).toBeTruthy();
    expect(screen.queryByText(/invalid or expired link/i)).toBeNull();
  });

  it("shows the form as soon as the auth event delivers the session", async () => {
    getSessionMock.mockResolvedValue({ data: { session: null } });

    render(<ResetPasswordPage />);
    expect(authCallbacks.length).toBeGreaterThan(0);
    authCallbacks[0]("PASSWORD_RECOVERY", { user: { id: "u" } });

    expect(await screen.findByPlaceholderText(/^new password/i)).toBeTruthy();
  });

  it("only declares the link dead once the retries are exhausted", async () => {
    getSessionMock.mockResolvedValue({ data: { session: null } });

    render(<ResetPasswordPage />);

    // Not instantly: the verdict waits for the retry loop.
    expect(screen.queryByText(/invalid or expired link/i)).toBeNull();

    await waitFor(
      () => expect(screen.getByText(/invalid or expired link/i)).toBeTruthy(),
      { timeout: 5000 },
    );
    expect(getSessionMock.mock.calls.length).toBeGreaterThan(1);
  });
});
