// @vitest-environment jsdom
//
// C10. handlePasswordReset read `if (!error) setResetSent(true)` with no else
// branch, so a Supabase rejection left the button sitting exactly where it
// was. To the customer nothing happened at all, and clicking again produced
// the same nothing.
//
// C23. The working email-preferences hub at /account/email was reachable only
// from the footer of an email we had already sent. No portal page linked it,
// so a customer who wanted to change what we send them had no route to it
// from inside the product.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";

const { resetPasswordForEmailMock, togglePrefMock } = vi.hoisted(() => ({
  resetPasswordForEmailMock: vi.fn(),
  togglePrefMock: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      resetPasswordForEmail: (...a: unknown[]) => resetPasswordForEmailMock(...a),
    },
  },
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "u-cust-1", email: "maya@example.com" },
    displayName: "Maya Chen",
  }),
}));

vi.mock("@/lib/use-notification-prefs", () => ({
  useNotificationPrefs: () => ({
    prefs: {
      order_notifications_enabled: true,
      message_notifications_enabled: true,
      email_digest_enabled: true,
    },
    togglePref: togglePrefMock,
    error: null,
  }),
}));

vi.mock("@/components/CustomerPortalLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/AccountDangerZone", () => ({ default: () => null }));

import CustomerSettingsPage from "./page";

const FAILURE_COPY = "We could not send the reset email. Please try again in a moment.";

afterEach(() => cleanup());
beforeEach(() => {
  resetPasswordForEmailMock.mockReset();
  togglePrefMock.mockReset();
  resetPasswordForEmailMock.mockResolvedValue({ data: {}, error: null });
});

describe("customer settings, password reset failures are visible (C10)", () => {
  it("shows an error when Supabase rejects the reset", async () => {
    resetPasswordForEmailMock.mockResolvedValue({
      data: {},
      error: { message: "Email rate limit exceeded" },
    });

    render(<CustomerSettingsPage />);
    fireEvent.click(screen.getByText("Change Password"));

    // Fail-before: no else branch, so the button simply reset and the
    // customer was told nothing at all.
    expect(await screen.findByText(FAILURE_COPY)).toBeTruthy();
    expect(screen.queryByText("Password reset email sent. Check your inbox.")).toBeNull();
    // The button stays, so a retry is possible.
    expect(screen.getByText("Change Password")).toBeTruthy();
  });

  it("shows an error when the request throws outright", async () => {
    resetPasswordForEmailMock.mockRejectedValue(new Error("offline"));

    render(<CustomerSettingsPage />);
    fireEvent.click(screen.getByText("Change Password"));

    expect(await screen.findByText(FAILURE_COPY)).toBeTruthy();
    expect(screen.queryByText("Password reset email sent. Check your inbox.")).toBeNull();
  });

  it("confirms only on success", async () => {
    render(<CustomerSettingsPage />);
    fireEvent.click(screen.getByText("Change Password"));

    expect(await screen.findByText("Password reset email sent. Check your inbox.")).toBeTruthy();
    expect(screen.queryByText(FAILURE_COPY)).toBeNull();
    expect(resetPasswordForEmailMock).toHaveBeenCalledWith(
      "maya@example.com",
      expect.objectContaining({ redirectTo: expect.stringContaining("/reset-password") }),
    );
  });

  it("clears a previous error when a retry succeeds", async () => {
    resetPasswordForEmailMock.mockResolvedValueOnce({
      data: {},
      error: { message: "Email rate limit exceeded" },
    });

    render(<CustomerSettingsPage />);
    fireEvent.click(screen.getByText("Change Password"));
    expect(await screen.findByText(FAILURE_COPY)).toBeTruthy();

    fireEvent.click(screen.getByText("Change Password"));
    expect(await screen.findByText("Password reset email sent. Check your inbox.")).toBeTruthy();
    expect(screen.queryByText(FAILURE_COPY)).toBeNull();
  });
});

describe("customer settings links the email preferences hub (C23)", () => {
  it("offers a link to /account/email", () => {
    render(<CustomerSettingsPage />);

    const link = screen
      .getAllByRole("link")
      .find((a) => a.getAttribute("href") === "/account/email");

    // Fail-before: /account/email was linked only from email footers and the
    // inactive-users cron, never from anywhere a signed-in customer could see.
    expect(link).toBeTruthy();
  });
});
