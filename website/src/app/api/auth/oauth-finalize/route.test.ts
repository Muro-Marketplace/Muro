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
//
// H15 — terms acceptance. The email/password signup pages record a
// terms_acceptances row via /api/terms/accept; the OAuth flow recorded
// nothing, so OAuth users had no acceptance evidence at all. The route now
// inserts the row when it first stamps a role. The terms_acceptances fake
// below behaves like PostgREST: unknown columns reject the insert, and the
// table's NOT NULL columns (migration 004) reject a null.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

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

const SCHEMA: Record<string, string[]> = JSON.parse(
  readFileSync(
    path.resolve(__dirname, "../../../../../tests/integration/schema-columns.json"),
    "utf8",
  ),
);

// NOT NULL columns on terms_acceptances (004_pre_launch_features.sql). An
// insert carrying null for any of these fails in prod, so the fake fails it
// here too.
const TERMS_NOT_NULL = ["user_email", "user_type", "terms_version", "terms_type"];

let termsRows: Array<Record<string, unknown>> = [];
let profileInserts: Array<Record<string, unknown>> = [];

function installDb() {
  termsRows = [];
  profileInserts = [];
  fromMock.mockImplementation((table: string) => {
    if (table === "artist_profiles") {
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
        insert: async (row: Record<string, unknown>) => {
          profileInserts.push(row);
          return { error: null };
        },
      };
    }
    if (table === "terms_acceptances") {
      return {
        insert: async (row: Record<string, unknown>) => {
          const known = SCHEMA[table];
          const bad = Object.keys(row).find((k) => !known.includes(k));
          if (bad) {
            return { error: { message: `Could not find the '${bad}' column of '${table}'` } };
          }
          const missing = TERMS_NOT_NULL.find((k) => row[k] === null || row[k] === undefined);
          if (missing) {
            return {
              error: { message: `null value in column "${missing}" violates not-null constraint` },
            };
          }
          termsRows.push(row);
          return { error: null };
        },
      };
    }
    throw new Error(`unexpected table: ${table}`);
  });
}

function post(state: string, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/auth/oauth-finalize", {
    method: "POST",
    headers: { authorization: "Bearer token", ...headers },
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
  installDb();
});

afterEach(() => {
  if (savedSecret === undefined) delete process.env.OAUTH_STATE_SECRET;
  else process.env.OAUTH_STATE_SECRET = savedSecret;
  vi.restoreAllMocks();
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

describe("POST /api/auth/oauth-finalize records terms acceptance (H15)", () => {
  it("records platform_tos for a first-time OAuth artist", async () => {
    const state = await signOAuthState({ role: "artist", next: "/artist-portal" });

    const res = await POST(post(state));

    expect(res.status).toBe(200);
    expect(termsRows).toHaveLength(1);
    // Same terms_type/terms_version the signup pages send to /api/terms/accept,
    // identity from the verified token.
    expect(termsRows[0]).toMatchObject({
      user_id: "user-1",
      user_email: "someone@example.com",
      user_type: "artist",
      terms_version: "v1.0-2026-04",
      terms_type: "platform_tos",
    });
    expect(typeof termsRows[0].accepted_at).toBe("string");
  });

  it("records for a first-time customer, with no artist profile stub", async () => {
    const state = await signOAuthState({ role: "customer", next: "/browse" });

    const res = await POST(post(state));

    expect(res.status).toBe(200);
    expect(termsRows).toHaveLength(1);
    expect(termsRows[0]).toMatchObject({ user_type: "customer", terms_type: "platform_tos" });
    expect(profileInserts).toHaveLength(0);
  });

  it("does NOT re-record for a returning user who already has a role", async () => {
    // Finalize runs on every OAuth sign-in; the acceptance row belongs to the
    // signup only, exactly where the role stamp happens.
    getUser.mockResolvedValue({
      data: {
        user: { id: "user-1", email: "someone@example.com", user_metadata: { user_type: "artist" } },
      },
      error: null,
    });
    const state = await signOAuthState({ role: "artist", next: "/artist-portal" });

    const res = await POST(post(state));

    expect(res.status).toBe(200);
    expect(termsRows).toHaveLength(0);
  });

  it("lower-cases the token email so the trail is comparable (as terms/accept does)", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "SomeOne@Example.COM", user_metadata: {} } },
      error: null,
    });
    const state = await signOAuthState({ role: "customer", next: "/browse" });

    await POST(post(state));

    expect(termsRows[0]?.user_email).toBe("someone@example.com");
  });

  it("records the platform-set IP and the user agent, null when absent", async () => {
    const state = await signOAuthState({ role: "customer", next: "/browse" });

    await POST(
      post(state, { "x-vercel-forwarded-for": "203.0.113.7", "user-agent": "TestUA/1.0" }),
    );
    expect(termsRows[0]).toMatchObject({ ip_address: "203.0.113.7", user_agent: "TestUA/1.0" });

    installDb();
    const state2 = await signOAuthState({ role: "customer", next: "/browse" });
    await POST(post(state2));
    // No platform header and no UA: null, never the "unknown" placeholder.
    expect(termsRows[0]).toMatchObject({ ip_address: null, user_agent: null });
  });

  it("does not fail the sign-in when the terms insert fails", async () => {
    // Best-effort like the signup pages' fire-and-forget fetch, but logged.
    const base = fromMock.getMockImplementation()!;
    fromMock.mockImplementation((table: string) => {
      if (table === "terms_acceptances") {
        return { insert: async () => ({ error: { message: "boom" } }) };
      }
      return base(table);
    });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const state = await signOAuthState({ role: "artist", next: "/artist-portal" });

    const res = await POST(post(state));

    expect(res.status).toBe(200);
    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining("terms acceptance insert failed"),
      expect.anything(),
    );
  });

  it("names no column terms_acceptances lacks, and satisfies its NOT NULLs", async () => {
    // The fake enforces both, so the happy path above already proves it.
    // Stated directly so a future edit fails on an assertion, not a side
    // effect.
    const state = await signOAuthState({ role: "artist", next: "/artist-portal" });
    await POST(post(state));

    expect(termsRows).toHaveLength(1);
    for (const key of Object.keys(termsRows[0])) {
      expect(SCHEMA.terms_acceptances, `terms_acceptances.${key}`).toContain(key);
    }
    for (const col of TERMS_NOT_NULL) {
      expect(termsRows[0][col], col).not.toBeNull();
      expect(termsRows[0][col], col).toBeDefined();
    }
  });
});
