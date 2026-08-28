// E35d — the consumer half.
//
// oauth-finalize declared its own `ALLOWED_ROLES = ["artist","customer","venue"]`
// and then never used it: the state's role reached user_metadata through
// `v.role as Role`, a cast. `verifyOAuthState` validates against the WIDE list,
// so "admin" passed and was written straight in.
//
// The state token here is minted directly with the oauth-state helper, NOT
// through /api/auth/oauth-sign-state, so this exercises finalize's own check.
// Fixing only the minting route would leave every already-issued token, and any
// future minting path, able to carry admin through.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { getUser, updateUserById, fromMock, welcomeMock } = vi.hoisted(() => ({
  getUser: vi.fn(),
  updateUserById: vi.fn(),
  fromMock: vi.fn(),
  welcomeMock: vi.fn(),
}));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    auth: { getUser, admin: { updateUserById } },
    from: fromMock,
  }),
}));
vi.mock("@/lib/email/welcome", () => ({ triggerWelcomeIfNeeded: welcomeMock }));

import { POST } from "./route";
import { signOAuthState } from "@/lib/oauth-state";

function post(state: string): Request {
  return new Request("http://localhost/api/auth/oauth-finalize", {
    method: "POST",
    headers: { authorization: "Bearer token" },
    body: JSON.stringify({ state }),
  });
}

let savedSecret: string | undefined;

beforeEach(() => {
  savedSecret = process.env.OAUTH_STATE_SECRET;
  process.env.OAUTH_STATE_SECRET = "test-secret-for-oauth-state";

  getUser.mockReset();
  updateUserById.mockReset();
  fromMock.mockReset();
  welcomeMock.mockReset();

  getUser.mockResolvedValue({
    data: { user: { id: "user-1", email: "someone@example.com", user_metadata: {} } },
    error: null,
  });
  updateUserById.mockResolvedValue({ data: null, error: null });
  welcomeMock.mockResolvedValue(undefined);
  fromMock.mockReturnValue({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
    insert: async () => ({ error: null }),
  });
});

afterEach(() => {
  if (savedSecret === undefined) delete process.env.OAUTH_STATE_SECRET;
  else process.env.OAUTH_STATE_SECRET = savedSecret;
});

describe("POST /api/auth/oauth-finalize (E35d)", () => {
  it("refuses a validly signed state that claims admin", async () => {
    // Signed with the real secret, so the HMAC verifies. The only thing that
    // can stop it is finalize checking the role itself.
    const state = await signOAuthState({ role: "admin", next: "/admin" });

    const res = await POST(post(state));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid role in state" });
    expect(
      updateUserById,
      "admin was written into user_metadata",
    ).not.toHaveBeenCalled();
  });

  it("still stamps a signup role for a user who has none", async () => {
    const state = await signOAuthState({ role: "artist", next: "/artist-portal" });

    const res = await POST(post(state));

    expect(res.status).toBe(200);
    expect(updateUserById).toHaveBeenCalledTimes(1);
    expect(updateUserById.mock.calls[0][1].user_metadata).toMatchObject({
      user_type: "artist",
    });
  });

  it("never demotes a user who already has a role", async () => {
    getUser.mockResolvedValue({
      data: {
        user: { id: "user-1", email: "v@example.com", user_metadata: { user_type: "venue" } },
      },
      error: null,
    });
    const state = await signOAuthState({ role: "customer", next: "/browse" });

    const res = await POST(post(state));

    expect(res.status).toBe(200);
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it("still rejects a tampered state", async () => {
    const state = await signOAuthState({ role: "artist", next: "/browse" });
    const res = await POST(post(state.slice(0, -3) + "aaa"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid or expired state" });
  });

  it("still requires a bearer token", async () => {
    const state = await signOAuthState({ role: "artist", next: "/browse" });
    const res = await POST(
      new Request("http://localhost/api/auth/oauth-finalize", {
        method: "POST",
        body: JSON.stringify({ state }),
      }),
    );
    expect(res.status).toBe(401);
  });
});
