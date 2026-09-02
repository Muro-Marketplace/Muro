// Reporting a conversation did nothing at all.
//
// `conversation_reports` had never existed. The route's own header described the
// design: insert "if the table exists", fall back to a `console.warn` "so a
// missing migration doesn't break the user-facing modal". Since the table never
// existed, the fallback WAS the behaviour. Every report anyone made, about
// harassment or anything else, lived only as a line in a Vercel log, and the
// route answered `{ ok: true }`.
//
// Migration 111 creates the table. This pins both halves: the write happens, and
// a write that fails is no longer reported as success.

import { describe, it, expect, vi, beforeEach } from "vitest";

const { fromMock, getAuthMock } = vi.hoisted(() => ({ fromMock: vi.fn(), getAuthMock: vi.fn() }));

vi.mock("@/lib/supabase-admin", () => ({ getSupabaseAdmin: () => ({ from: fromMock }) }));
vi.mock("@/lib/api-auth", () => ({ getAuthenticatedUser: getAuthMock }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(async () => null) }));

import { POST } from "./route";

let inserted: Record<string, unknown> | null = null;

function installDb(error: unknown = null) {
  inserted = null;
  fromMock.mockImplementation((table: string) => ({
    insert: async (row: Record<string, unknown>) => {
      if (table !== "conversation_reports") throw new Error(`unexpected table ${table}`);
      inserted = row;
      return { error };
    },
  }));
}

const BODY = { otherParty: "maya-chen", conversationId: "conv-1", reason: "Abusive messages" };

function req(body: unknown = BODY): Request {
  return new Request("http://localhost/api/messages/report", {
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

describe("POST /api/messages/report", () => {
  it("writes the report to a table that exists", async () => {
    const res = await POST(req());

    expect(res.status).toBe(200);
    expect(inserted).toMatchObject({
      reporter_user_id: "u-1",
      other_party: "maya-chen",
      conversation_id: "conv-1",
      reason: "Abusive messages",
    });
  });

  it("REFUSES to report success when the write failed", async () => {
    // THE regression. A report that does not persist is not a report, and
    // answering ok is what kept this invisible for as long as it was.
    installDb({ message: 'relation "public.conversation_reports" does not exist' });

    const res = await POST(req());

    expect(res.status).toBe(500);
    expect(await res.json()).not.toHaveProperty("ok");
  });

  it("truncates a very long reason rather than failing the insert", async () => {
    await POST(req({ ...BODY, reason: "x".repeat(5000) }));
    expect((inserted!.reason as string).length).toBe(2000);
  });

  it("stores a null conversation when the report is not tied to a thread", async () => {
    await POST(req({ otherParty: "maya-chen", reason: "Spam" }));
    expect(inserted).toMatchObject({ conversation_id: null });
  });

  it("requires the party and the reason", async () => {
    for (const body of [{ reason: "x" }, { otherParty: "y" }, {}]) {
      installDb();
      const res = await POST(req(body));
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(inserted).toBeNull();
    }
  });

  it("rejects an unauthenticated caller before writing", async () => {
    getAuthMock.mockResolvedValue({
      user: null,
      error: new Response(null, { status: 401 }),
    });

    expect((await POST(req())).status).toBe(401);
    expect(fromMock).not.toHaveBeenCalled();
  });
});
