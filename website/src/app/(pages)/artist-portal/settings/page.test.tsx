// @vitest-environment jsdom
//
// D28. The Change Password card collected a "Current password" and never
// looked at it: handlePasswordChange validated only newPassword/confirm and
// went straight to supabase.auth.updateUser({ password }). Anyone holding the
// session (an unlocked laptop, a stolen token) could rotate the password
// without proving they knew the old one, and the field read as a security
// control that did nothing.
//
// The fix re-authenticates with signInWithPassword before updateUser, which
// is the only "verify this password" primitive Supabase exposes to a client.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";

const { updateUserMock, signInWithPasswordMock } = vi.hoisted(() => ({
  updateUserMock: vi.fn(),
  signInWithPasswordMock: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      updateUser: (...a: unknown[]) => updateUserMock(...a),
      signInWithPassword: (...a: unknown[]) => signInWithPasswordMock(...a),
    },
  },
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "u-artist-1", email: "artist@example.com" },
    displayName: "Alice Adams",
  }),
}));

vi.mock("@/lib/use-notification-prefs", () => ({
  useNotificationPrefs: () => ({
    prefs: {
      order_notifications_enabled: true,
      message_notifications_enabled: true,
      email_digest_enabled: true,
    },
    togglePref: vi.fn(),
    error: null,
  }),
}));

vi.mock("@/components/ArtistPortalLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/AccountDangerZone", () => ({ default: () => null }));

import ArtistSettingsPage from "./page";

afterEach(() => cleanup());
beforeEach(() => {
  updateUserMock.mockReset();
  signInWithPasswordMock.mockReset();
  updateUserMock.mockResolvedValue({ error: null });
  signInWithPasswordMock.mockResolvedValue({ data: {}, error: null });
});

function fillPasswordForm({
  current,
  next = "brand-new-passphrase",
  confirm = "brand-new-passphrase",
}: {
  current: string;
  next?: string;
  confirm?: string;
}) {
  render(<ArtistSettingsPage />);
  fireEvent.change(screen.getByLabelText("Current password"), {
    target: { value: current },
  });
  fireEvent.change(screen.getByLabelText("New password (min 8 characters)"), {
    target: { value: next },
  });
  fireEvent.change(screen.getByLabelText("Confirm new password"), {
    target: { value: confirm },
  });
  fireEvent.click(screen.getByText("Update Password"));
}

describe("artist settings, password change verifies the current password (D28)", () => {
  it("refuses to submit with the current password left blank", async () => {
    fillPasswordForm({ current: "" });

    // Fail-before: the blank field was ignored and the password changed anyway.
    expect(await screen.findByText("Enter your current password")).toBeTruthy();
    expect(signInWithPasswordMock).not.toHaveBeenCalled();
    expect(updateUserMock).not.toHaveBeenCalled();
  });

  it("does not change the password when the current password is wrong", async () => {
    signInWithPasswordMock.mockResolvedValue({
      data: {},
      error: { message: "Invalid login credentials" },
    });

    fillPasswordForm({ current: "not-my-password" });

    await waitFor(() =>
      expect(signInWithPasswordMock).toHaveBeenCalledWith({
        email: "artist@example.com",
        password: "not-my-password",
      }),
    );
    // Fail-before: updateUser ran regardless of what was typed here.
    expect(updateUserMock).not.toHaveBeenCalled();
    expect(await screen.findByText("Current password is incorrect")).toBeTruthy();
    expect(screen.queryByText("Password updated!")).toBeNull();
  });

  it("changes the password once the current one checks out", async () => {
    fillPasswordForm({ current: "my-real-password" });

    await waitFor(() =>
      expect(updateUserMock).toHaveBeenCalledWith({ password: "brand-new-passphrase" }),
    );
    expect(signInWithPasswordMock).toHaveBeenCalledWith({
      email: "artist@example.com",
      password: "my-real-password",
    });
    expect(await screen.findByText("Password updated!")).toBeTruthy();
  });

  it("rejects a new password identical to the current one", async () => {
    fillPasswordForm({
      current: "same-old-passphrase",
      next: "same-old-passphrase",
      confirm: "same-old-passphrase",
    });

    expect(
      await screen.findByText("Your new password must be different from your current one"),
    ).toBeTruthy();
    expect(updateUserMock).not.toHaveBeenCalled();
  });

  it("still enforces the length and confirmation rules before verifying", async () => {
    fillPasswordForm({ current: "my-real-password", next: "short", confirm: "short" });

    expect(await screen.findByText("Password must be at least 8 characters")).toBeTruthy();
    expect(signInWithPasswordMock).not.toHaveBeenCalled();
    expect(updateUserMock).not.toHaveBeenCalled();
  });
});

describe("finding the full email controls", () => {
  it("links the per-category hub, so the weekly digest is not the only email that can be turned off here", async () => {
    render(<ArtistSettingsPage />);
    const link = await screen.findByRole("link", { name: "Manage every email category" });
    expect(link.getAttribute("href")).toBe("/account/email");
  });
});
