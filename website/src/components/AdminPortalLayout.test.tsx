// @vitest-environment jsdom
//
// G1 (WS8 item 4). AdminPortalLayout's second-line check compared
// user_metadata.user_type === "admin", which contradicts the server admin
// predicate (env allowlist + admin_users, ADR 0008). A table-only admin passed
// AdminGate, then this component bounced them to /login. It now mirrors
// AdminGate and asks /api/admin/whoami, the same server fact.

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

const { replace, authFetchMock, useAuthMock } = vi.hoisted(() => ({
  replace: vi.fn(),
  authFetchMock: vi.fn(),
  useAuthMock: vi.fn(),
}));

// The chrome now reads the route itself (admin/layout.tsx passes no
// activePath). This test still passes one, so usePathname only has to exist.
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }), usePathname: () => "/admin" }));
vi.mock("@/lib/api-client", () => ({ authFetch: authFetchMock }));
vi.mock("@/context/AuthContext", () => ({ useAuth: useAuthMock }));

import AdminPortalLayout from "./AdminPortalLayout";

function reply(status: number, body: unknown = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

const CHILD = "admin-page-content";

function renderLayout() {
  return render(
    <AdminPortalLayout activePath="/admin">
      <span>{CHILD}</span>
    </AdminPortalLayout>,
  );
}

beforeEach(() => {
  replace.mockReset();
  authFetchMock.mockReset();
  useAuthMock.mockReset();
  // Default: a signed-in user whose metadata does NOT claim admin. That is
  // exactly the table-only admin G1 is about.
  useAuthMock.mockReturnValue({
    user: { id: "u-admin", email: "admin@example.com" },
    loading: false,
    userType: "venue",
    signOut: vi.fn(),
  });
});

afterEach(cleanup);

describe("<AdminPortalLayout />", () => {
  it("renders for a table-only admin the server vouches for, whatever their metadata says (G1)", async () => {
    authFetchMock.mockResolvedValue(reply(200, { userId: "u-admin" }));
    renderLayout();
    expect(await screen.findByText(CHILD)).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
    expect(authFetchMock).toHaveBeenCalledWith("/api/admin/whoami");
  });

  it("renders nothing and redirects to /login when the server says no", async () => {
    authFetchMock.mockResolvedValue(reply(403));
    renderLayout();
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
    expect(screen.queryByText(CHILD)).toBeNull();
  });

  it("fails closed when the check itself throws", async () => {
    authFetchMock.mockRejectedValue(new Error("offline"));
    renderLayout();
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
    expect(screen.queryByText(CHILD)).toBeNull();
  });

  it("still routes a signed-out visitor to /login", async () => {
    useAuthMock.mockReturnValue({ user: null, loading: false, userType: null, signOut: vi.fn() });
    authFetchMock.mockResolvedValue(reply(401));
    renderLayout();
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
    expect(screen.queryByText(CHILD)).toBeNull();
  });

  it("lists the Refunds queue in the sidebar (G2)", async () => {
    authFetchMock.mockResolvedValue(reply(200));
    renderLayout();
    const link = (await screen.findByText("Refunds")).closest("a");
    expect(link?.getAttribute("href")).toBe("/admin/refunds");
  });
});
