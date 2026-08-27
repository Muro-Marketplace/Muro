// @vitest-environment jsdom
//
// E30b — the admin surface was gated client-side only, on a field the user
// writes. `AdminPortalLayout` compared `user_metadata.user_type` (set at signup
// with the public anon key) and rendered the whole admin shell when it said
// "admin". AdminGate replaces that decision with a server one.
//
// The regression test is the first: metadata claiming "admin" while the server
// says 403 must render nothing.

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

const { replace, authFetchMock } = vi.hoisted(() => ({
  replace: vi.fn(),
  authFetchMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
vi.mock("@/lib/api-client", () => ({ authFetch: authFetchMock }));

import AdminGate from "./AdminGate";

function reply(status: number, body: unknown = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

const CHILD = "admin-shell-content";

function renderGate() {
  return render(
    <AdminGate>
      <span>{CHILD}</span>
    </AdminGate>,
  );
}

beforeEach(() => {
  replace.mockReset();
  authFetchMock.mockReset();
});

// No global auto-cleanup in this repo's vitest setup, and `screen` queries the
// whole document: without this, one test's rendered shell is found by the next
// test's "rendered nothing" assertion.
afterEach(cleanup);

describe("<AdminGate />", () => {
  it("renders nothing and redirects when the server says 403", async () => {
    // THE regression test. This is the self-declared admin: their metadata says
    // "admin", which is all the old gate looked at. The server disagrees.
    authFetchMock.mockResolvedValue(reply(403, { error: "Admin access required" }));

    renderGate();

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
    expect(screen.queryByText(CHILD), "the admin shell rendered for a non-admin").toBeNull();
  });

  it("renders the admin surface when the server says ok", async () => {
    authFetchMock.mockResolvedValue(reply(200, { ok: true, email: "boss@example.com" }));

    renderGate();

    await waitFor(() => expect(screen.queryByText(CHILD)).not.toBeNull());
    expect(replace).not.toHaveBeenCalled();
  });

  it("redirects to /login on 401", async () => {
    authFetchMock.mockResolvedValue(reply(401, { error: "Authentication required" }));

    renderGate();

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
    expect(screen.queryByText(CHILD)).toBeNull();
  });

  it("renders nothing at all before the server answers", async () => {
    // No shell flash. The old gate's `return null` fired only after mount, so
    // the shell could paint first.
    let settle: (r: Response) => void = () => {};
    authFetchMock.mockReturnValue(new Promise<Response>((r) => { settle = r; }));

    renderGate();

    expect(screen.queryByText(CHILD)).toBeNull();
    expect(replace).not.toHaveBeenCalled();

    settle(reply(200, { ok: true }));
    await waitFor(() => expect(screen.queryByText(CHILD)).not.toBeNull());
  });

  it("names the misconfiguration on 503 instead of looping through /login", async () => {
    // 503 means the server has no admin source configured. Sending the admin to
    // /login makes them log in successfully and bounce straight back.
    authFetchMock.mockResolvedValue(reply(503, { error: "Admin access not configured" }));

    renderGate();

    await waitFor(() =>
      expect(screen.queryByText(/Admin access is not configured/i)).not.toBeNull(),
    );
    expect(replace).not.toHaveBeenCalled();
    expect(screen.queryByText(CHILD)).toBeNull();
  });

  it("fails closed when the check itself throws", async () => {
    // A NetworkError from authFetch (no readable session) must not open the gate.
    authFetchMock.mockRejectedValue(new Error("Could not read your session"));

    renderGate();

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
    expect(screen.queryByText(CHILD)).toBeNull();
  });

  it("asks the server exactly once, on the read-only whoami route", async () => {
    authFetchMock.mockResolvedValue(reply(200, { ok: true }));

    renderGate();

    await waitFor(() => expect(screen.queryByText(CHILD)).not.toBeNull());
    expect(authFetchMock).toHaveBeenCalledTimes(1);
    expect(authFetchMock).toHaveBeenCalledWith("/api/admin/whoami");
  });
});
