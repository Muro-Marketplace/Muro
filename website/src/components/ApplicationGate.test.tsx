// @vitest-environment jsdom
// A49 (QA 2026-08-28). The wrong-role notice's CTA was a plain link to
// /signup/artist?next=/apply while the user stayed signed in; that signup
// page is wrapped in RedirectIfLoggedIn, which bounced them straight back to
// /apply, where the same notice rendered again — an infinite loop. The CTA
// now does what its copy says: signs out first, then navigates to signup.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const push = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
}));

const useAuthMock = vi.fn();
vi.mock("@/context/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("@/components/ApplicationForm", () => ({
  default: () => <span>application form</span>,
}));

import ApplicationGate from "./ApplicationGate";

const signOut = vi.fn(async () => {});

afterEach(() => cleanup());
beforeEach(() => {
  push.mockReset();
  replace.mockReset();
  signOut.mockClear();
});

describe("<ApplicationGate /> wrong-role CTA (A49)", () => {
  it("signs out BEFORE navigating to the artist signup, breaking the redirect loop", async () => {
    useAuthMock.mockReturnValue({
      user: { id: "u1" },
      userType: "venue",
      loading: false,
      signOut,
    });
    render(<ApplicationGate />);

    expect(screen.getByText(/signed in as a venue/i)).toBeTruthy();
    fireEvent.click(screen.getByText("Sign out and create artist account"));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/signup/artist?next=/apply"));
    expect(signOut).toHaveBeenCalledTimes(1);
    // Order matters: signed out first, otherwise RedirectIfLoggedIn bounces
    // the still-authenticated user straight back to /apply.
    expect(signOut.mock.invocationCallOrder[0]).toBeLessThan(push.mock.invocationCallOrder[0]);
  });

  it("still renders the form for an artist", () => {
    useAuthMock.mockReturnValue({
      user: { id: "u1" },
      userType: "artist",
      loading: false,
      signOut,
    });
    render(<ApplicationGate />);
    expect(screen.getByText("application form")).toBeTruthy();
  });
});
