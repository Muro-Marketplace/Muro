// @vitest-environment jsdom
// A53 (QA 2026-08-28). Everyone reaching /apply/claim via the auth-gated
// /apply success screen already HAS an artist account, is signed in, and has
// a pending artist_profiles row created by the /api/apply bridge. The page
// used to run a fresh signUp() for them anyway: the same email produced an
// obfuscated failure, signInWithPassword then failed, and the user was told
// "Account created, please sign in", which was false. The page now detects
// the session and routes to the existing profile instead.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

const replace = vi.fn();
const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push }),
  useSearchParams: () => new URLSearchParams(""),
}));

const useAuthMock = vi.fn();
vi.mock("@/context/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      signUp: vi.fn(),
      signInWithPassword: vi.fn(),
      getSession: vi.fn(async () => ({ data: { session: null } })),
    },
  },
}));

import ClaimPage from "./page";

afterEach(() => cleanup());
beforeEach(() => {
  replace.mockReset();
  push.mockReset();
});

describe("/apply/claim session detection (A53)", () => {
  it("routes a signed-in user to their existing profile instead of the signup form", async () => {
    useAuthMock.mockReturnValue({ user: { id: "u1", email: "maya@example.com" }, loading: false });

    render(<ClaimPage />);

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/artist-portal/profile?welcome=1"),
    );
    // The fresh-account form must not render for them.
    expect(screen.queryByText("Create my profile")).toBeNull();
    expect(screen.getByText(/already signed in/i)).toBeTruthy();
  });

  it("keeps the claim form for a signed-out visitor following an old email link", async () => {
    useAuthMock.mockReturnValue({ user: null, loading: false });

    render(<ClaimPage />);

    expect(await screen.findByText("Create my profile")).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });
});
