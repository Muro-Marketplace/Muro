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
//
// Email audit, 2026-09-04: the row was still the end of it. Nothing reads
// conversation_reports (there is no admin surface for it), so a report about
// harassment reached the team only if somebody thought to query the table.
// The third block below pins the alert that now goes out with every report.

import { describe, it, expect, vi, beforeEach } from "vitest";

const { fromMock, getAuthMock, sendAdminAlertMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  getAuthMock: vi.fn(),
  sendAdminAlertMock: vi.fn(async (_input: {
    idempotencyKey: string;
    subject: string;
    summary: string;
    fields?: { label: string; value: string }[];
    actionPath?: string;
    actionLabel?: string;
  }) => ({ ok: true as const, skipped: false as const, messageId: "m-1" })),
}));

vi.mock("@/lib/supabase-admin", () => ({ getSupabaseAdmin: () => ({ from: fromMock }) }));
vi.mock("@/lib/api-auth", () => ({ getAuthenticatedUser: getAuthMock }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(async () => null) }));
vi.mock("@/lib/email/admin-alert", () => ({ sendAdminAlert: sendAdminAlertMock }));

import { POST } from "./route";

let inserted: Record<string, unknown> | null = null;

/**
 * The insert returns the new row's id (`.select("id").maybeSingle()`), which is
 * what the alert is keyed on, so the fake models the returning form. `rowId:
 * null` stands in for an insert that lands but returns nothing, which is the
 * only path that uses the alert's fallback key.
 */
function installDb(error: unknown = null, rowId: string | null = "rep-1") {
  inserted = null;
  fromMock.mockImplementation((table: string) => ({
    insert: (row: Record<string, unknown>) => {
      if (table !== "conversation_reports") throw new Error(`unexpected table ${table}`);
      inserted = row;
      return {
        select: () => ({
          maybeSingle: async () => ({ data: error ? null : rowId ? { id: rowId } : null, error }),
        }),
      };
    },
  }));
}

const alert = () => sendAdminAlertMock.mock.calls.at(-1)![0];

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
  sendAdminAlertMock.mockClear();
  getAuthMock.mockResolvedValue({ user: { id: "u-1", email: "reporter@example.com" }, error: null });
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

describe("POST /api/messages/report tells the team", () => {
  it("alerts an admin with the report, the reporter and the other party", async () => {
    // Fail-before: the row was written and nobody was told, on a route whose
    // whole purpose is to escalate.
    const res = await POST(req());

    expect(res.status).toBe(200);
    expect(sendAdminAlertMock).toHaveBeenCalledTimes(1);
    const sent = alert();
    expect(sent.subject).toContain("maya-chen");
    const values = (sent.fields ?? []).map((f) => `${f.label}: ${f.value}`).join(" | ");
    expect(values).toContain("Report: rep-1");
    expect(values).toContain("reporter@example.com");
    expect(values).toContain("Other party: maya-chen");
    expect(values).toContain("Conversation: conv-1");
    expect(values).toContain("Abusive messages");
    expect(sent.actionPath).toBe("/admin/moderation");
  });

  it("keys the alert on the stored report, so one report is one alert", async () => {
    await POST(req());
    expect(alert().idempotencyKey).toBe("admin_conversation_report:rep-1");
  });

  it("falls back to a content key, never a timestamp, when the insert returns no row", async () => {
    // A timestamped key is not an idempotency key: a retry of the identical
    // request would post a second copy of the same alert.
    installDb(null, null);
    await POST(req());
    const key = alert().idempotencyKey;
    expect(key).toBe("admin_conversation_report:u-1:conv-1:Abusive messages");
    expect(key).not.toMatch(/\d{13}/);
  });

  it("never alerts when the report was not stored", async () => {
    installDb({ message: 'relation "public.conversation_reports" does not exist' });

    const res = await POST(req());

    expect(res.status).toBe(500);
    expect(sendAdminAlertMock).not.toHaveBeenCalled();
  });

  it("still reports success to the person when the alert fails", async () => {
    // The report is stored; a mail outage must not tell someone their report
    // of harassment failed.
    sendAdminAlertMock.mockRejectedValueOnce(new Error("resend down"));

    const res = await POST(req());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(inserted).not.toBeNull();
  });
});
