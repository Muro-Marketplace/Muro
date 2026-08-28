// Blocking someone did nothing at all.
//
// `user_blocks` had never existed. The upsert failed every time, the error was
// swallowed into a `console.warn`, and the route answered `{ ok: true }`. So a
// person who blocked someone was told it worked, nothing was recorded, and the
// blocked account could still message them.
//
// Migration 111 creates the table. Nothing READS it yet, which is a separate and
// now-possible follow-up.

import { describe, it, expect, vi, beforeEach } from "vitest";

const { fromMock, getAuthMock } = vi.hoisted(() => ({ fromMock: vi.fn(), getAuthMock: vi.fn() }));

vi.mock("@/lib/supabase-admin", () => ({ getSupabaseAdmin: () => ({ from: fromMock }) }));
vi.mock("@/lib/api-auth", () => ({ getAuthenticatedUser: getAuthMock }));
vi.mock("@/lib/demo-guard", () => ({ assertNotDemo: () => null }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(async () => null) }));

import { POST } from "./route";

let upserted: { row: Record<string, unknown>; opts: unknown } | null = null;

function installDb(error: unknown = null) {
  upserted = null;
  fromMock.mockImplementation((table: string) => ({
    upsert: async (row: Record<string, unknown>, opts: unknown) => {
      if (table !== "user_blocks") throw new Error(`unexpected table ${table}`);
      upserted = { row, opts };
      return { error };
    },
  }));
}

function req(body: unknown = { otherParty: "maya-chen" }): Request {
  return new Request("http://localhost/api/messages/block", {
    method: "POST",
    headers: { authorization: "Bearer x", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  fromMock.mockReset();
  getAuthMock.mockReset();
  getAuthMock.mockResolvedValue({ user: { id: "u-1" }, error: null });
  vi.spyOn(console, "error").mockImplementation(() => {});
  installDb();
});

describe("POST /api/messages/block", () => {
  it("records the block", async () => {
    const res = await POST(req());

    expect(res.status).toBe(200);
    expect(upserted!.row).toEqual({ blocker_user_id: "u-1", blocked_slug: "maya-chen" });
  });

  it("upserts on the pair, so re-blocking is not an error", async () => {
    // The table's PRIMARY KEY must be exactly this pair, or every re-block 23505s.
    await POST(req());
    expect(upserted!.opts).toEqual({ onConflict: "blocker_user_id,blocked_slug" });
  });

  it("REFUSES to report success when the write failed", async () => {
    // THE regression. A block that does not persist is not a block: the other
    // party can still message you, and you have been told they cannot.
    installDb({ message: 'relation "public.user_blocks" does not exist' });

    const res = await POST(req());

    expect(res.status).toBe(500);
    expect(await res.json()).not.toHaveProperty("ok");
  });

  it("requires the party", async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(400);
    expect(upserted).toBeNull();
  });

  it("rejects an unauthenticated caller before writing", async () => {
    getAuthMock.mockResolvedValue({ user: null, error: new Response(null, { status: 401 }) });

    expect((await POST(req())).status).toBe(401);
    expect(fromMock).not.toHaveBeenCalled();
  });
});
