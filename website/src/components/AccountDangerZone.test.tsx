// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

const authFetchMock = vi.fn();
vi.mock("@/lib/api-client", () => ({
  authFetch: (...args: unknown[]) => authFetchMock(...args),
}));

const signOutMock = vi.fn();
vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      signOut: () => signOutMock(),
    },
  },
}));

import AccountDangerZone from "./AccountDangerZone";

beforeEach(() => {
  push.mockReset();
  authFetchMock.mockReset();
  signOutMock.mockReset();
  signOutMock.mockResolvedValue({ error: null });
});

afterEach(() => cleanup());

describe("<AccountDangerZone />", () => {
  it("disables the delete button until the confirm string matches exactly", () => {
    render(<AccountDangerZone />);
    const button = screen.getByRole("button", {
      name: /permanently delete my account/i,
    });
    expect((button as HTMLButtonElement).disabled).toBe(true);

    const input = screen.getByPlaceholderText(/type DELETE MY ACCOUNT/i);
    fireEvent.change(input, { target: { value: "delete my account" } });
    expect((button as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(input, { target: { value: "DELETE MY ACCOUNT" } });
    expect((button as HTMLButtonElement).disabled).toBe(false);
  });

  it("does not call the API if the confirm string is wrong", () => {
    render(<AccountDangerZone />);
    // Force-click the button (via the underlying handler) — we don't go
    // through the disabled state in this case because the user could in
    // theory clear the field after enabling the button. Easiest way:
    // type partial text, then call the handler directly via fireEvent.
    const input = screen.getByPlaceholderText(/type DELETE MY ACCOUNT/i);
    fireEvent.change(input, { target: { value: "wrong" } });
    const button = screen.getByRole("button", {
      name: /permanently delete my account/i,
    });
    fireEvent.click(button); // disabled; no-op
    expect(authFetchMock).not.toHaveBeenCalled();
  });

  it("POSTs { confirm: 'DELETE MY ACCOUNT' } to /api/account/delete on submit and redirects on success", async () => {
    authFetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });

    render(<AccountDangerZone />);
    const input = screen.getByPlaceholderText(/type DELETE MY ACCOUNT/i);
    fireEvent.change(input, { target: { value: "DELETE MY ACCOUNT" } });
    fireEvent.click(
      screen.getByRole("button", { name: /permanently delete my account/i }),
    );

    await waitFor(() => expect(authFetchMock).toHaveBeenCalledTimes(1));
    expect(authFetchMock).toHaveBeenCalledWith("/api/account/delete", {
      method: "POST",
      body: JSON.stringify({ confirm: "DELETE MY ACCOUNT" }),
    });
    await waitFor(() => expect(signOutMock).toHaveBeenCalled());
    await waitFor(() => expect(push).toHaveBeenCalledWith("/"));
  });

  it("shows the API's error message when the response is not ok", async () => {
    authFetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Could not complete account deletion. Contact support." }),
    });

    render(<AccountDangerZone />);
    const input = screen.getByPlaceholderText(/type DELETE MY ACCOUNT/i);
    fireEvent.change(input, { target: { value: "DELETE MY ACCOUNT" } });
    fireEvent.click(
      screen.getByRole("button", { name: /permanently delete my account/i }),
    );

    await waitFor(() =>
      expect(screen.getByText(/contact support/i)).toBeTruthy(),
    );
    expect(push).not.toHaveBeenCalled();
    expect(signOutMock).not.toHaveBeenCalled();
  });

  it("shows a network-error message when the fetch throws", async () => {
    authFetchMock.mockRejectedValue(new Error("net"));

    render(<AccountDangerZone />);
    const input = screen.getByPlaceholderText(/type DELETE MY ACCOUNT/i);
    fireEvent.change(input, { target: { value: "DELETE MY ACCOUNT" } });
    fireEvent.click(
      screen.getByRole("button", { name: /permanently delete my account/i }),
    );

    await waitFor(() =>
      expect(screen.getByText(/network error/i)).toBeTruthy(),
    );
    expect(push).not.toHaveBeenCalled();
  });
});
