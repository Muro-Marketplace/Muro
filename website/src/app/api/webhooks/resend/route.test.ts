// WS5.2 (txn audit 4 finding R4.4). Before this route existed, NOTHING wrote
// email_suppressions: hard-bounced addresses were retried forever, complaints
// never suppressed anyone, and bounced_at / complained_at / opened_at /
// clicked_at on email_events were never written. "sent" meant accepted by
// Resend's API, with no idea whether anything was delivered.
//
// The route verifies Resend's svix signature (secret in RESEND_WEBHOOK_SECRET,
// refused outright when unset), stamps the event row by provider_message_id,
// and writes email_suppressions on hard bounces and complaints. Redelivered
// events land on the same state, so a svix retry is always safe.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));
vi.mock("@/lib/supabase-admin", () => ({ getSupabaseAdmin: () => ({ from: fromMock }) }));

import { POST } from "./route";
import { signForSvix, verifySvixSignature } from "@/lib/email/resend-webhook";

const SECRET = `whsec_${Buffer.from("resend-test-signing-key").toString("base64")}`;

/** update calls against email_events: the payload and the filter value. */
const eventUpdates: { row: Record<string, unknown>; col: string; val: unknown }[] = [];
/** upsert calls against email_suppressions. */
const suppressions: { rows: Record<string, unknown>[]; opts: Record<string, unknown> }[] = [];

interface DbState {
  deliveredRow?: { id: string; metadata: Record<string, unknown> | null } | null;
  readError?: { message: string } | null;
  updateError?: { message: string } | null;
  suppressError?: { message: string } | null;
}

function setupDb(state: DbState = {}) {
  eventUpdates.length = 0;
  suppressions.length = 0;
  const { deliveredRow = null, readError = null, updateError = null, suppressError = null } = state;

  fromMock.mockImplementation((table: string) => {
    if (table === "email_events") {
      return {
        select: () => ({
          eq: () => ({
            limit: () => ({
              maybeSingle: async () => ({ data: deliveredRow, error: readError }),
            }),
          }),
        }),
        update: (row: Record<string, unknown>) => ({
          eq: (col: string, val: unknown) => {
            eventUpdates.push({ row, col, val });
            return Promise.resolve({ error: updateError });
          },
        }),
      };
    }
    if (table === "email_suppressions") {
      return {
        upsert: (rows: Record<string, unknown>[], opts: Record<string, unknown>) => {
          suppressions.push({ rows, opts });
          return Promise.resolve({ error: suppressError });
        },
      };
    }
    throw new Error(`unexpected table ${table}`);
  });
}

function signedRequest(
  payload: Record<string, unknown>,
  overrides: { secret?: string; timestamp?: number; signature?: string } = {},
): Request {
  const body = JSON.stringify(payload);
  const id = "msg_2b0Zq";
  const timestamp = overrides.timestamp ?? Math.floor(Date.now() / 1000);
  const signature =
    overrides.signature ?? signForSvix(body, id, timestamp, overrides.secret ?? SECRET);
  return new Request("https://wallplace.co.uk/api/webhooks/resend", {
    method: "POST",
    headers: {
      "svix-id": id,
      "svix-timestamp": String(timestamp),
      "svix-signature": signature,
    },
    body,
  });
}

const BOUNCE_EVENT = {
  type: "email.bounced",
  created_at: "2026-08-28T10:00:00.000Z",
  data: {
    email_id: "re_msg_1",
    to: ["Bouncy@Example.com"],
    subject: "Your payout is on its way",
    bounce: { type: "Permanent", subType: "General", message: "smtp; 550 5.1.1 user unknown" },
  },
};

const ORIGINAL = { ...process.env };
afterEach(() => {
  process.env = { ...ORIGINAL };
  vi.clearAllMocks();
  vi.restoreAllMocks();
});
beforeEach(() => {
  process.env.RESEND_WEBHOOK_SECRET = SECRET;
  setupDb();
});

describe("verifySvixSignature", () => {
  const BODY = '{"type":"email.delivered"}';

  it("accepts a correctly signed payload", () => {
    const ts = Math.floor(Date.now() / 1000);
    const sig = signForSvix(BODY, "msg_1", ts, SECRET);
    expect(
      verifySvixSignature(BODY, { id: "msg_1", timestamp: String(ts), signature: sig }, SECRET),
    ).toBe(true);
  });

  it("accepts when any one of several space-delimited signatures matches", () => {
    const ts = Math.floor(Date.now() / 1000);
    const good = signForSvix(BODY, "msg_1", ts, SECRET);
    expect(
      verifySvixSignature(
        BODY,
        { id: "msg_1", timestamp: String(ts), signature: `v1,AAAA ${good}` },
        SECRET,
      ),
    ).toBe(true);
  });

  it("rejects a signature under the wrong secret", () => {
    const ts = Math.floor(Date.now() / 1000);
    const sig = signForSvix(BODY, "msg_1", ts, `whsec_${Buffer.from("other").toString("base64")}`);
    expect(
      verifySvixSignature(BODY, { id: "msg_1", timestamp: String(ts), signature: sig }, SECRET),
    ).toBe(false);
  });

  it("rejects a replayed timestamp outside the tolerance window", () => {
    const stale = Math.floor(Date.now() / 1000) - 3600;
    const sig = signForSvix(BODY, "msg_1", stale, SECRET);
    expect(
      verifySvixSignature(BODY, { id: "msg_1", timestamp: String(stale), signature: sig }, SECRET),
    ).toBe(false);
  });

  it("rejects when any header is missing", () => {
    expect(verifySvixSignature(BODY, { id: null, timestamp: "1", signature: "v1,x" }, SECRET)).toBe(
      false,
    );
  });
});

describe("POST /api/webhooks/resend", () => {
  it("refuses every event when RESEND_WEBHOOK_SECRET is unset", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    delete process.env.RESEND_WEBHOOK_SECRET;

    const res = await POST(signedRequest(BOUNCE_EVENT));

    expect(res.status).toBe(503);
    expect(eventUpdates).toHaveLength(0);
    expect(suppressions).toHaveLength(0);
  });

  it("rejects an invalid signature with 401 and writes nothing", async () => {
    const res = await POST(signedRequest(BOUNCE_EVENT, { signature: "v1,bogus" }));

    expect(res.status).toBe(401);
    expect(eventUpdates).toHaveLength(0);
    expect(suppressions).toHaveLength(0);
  });

  it("stamps bounced_at and suppresses the address on a hard bounce", async () => {
    // Fail-before (R4.4): no route existed, so a permanently dead address was
    // retried on every future send and bounced_at stayed null forever.
    const res = await POST(signedRequest(BOUNCE_EVENT));

    expect(res.status).toBe(200);
    expect(eventUpdates).toEqual([
      {
        row: { bounced_at: "2026-08-28T10:00:00.000Z" },
        col: "provider_message_id",
        val: "re_msg_1",
      },
    ]);
    expect(suppressions).toHaveLength(1);
    expect(suppressions[0].rows).toEqual([
      expect.objectContaining({
        // Normalised exactly the way sendEmail() stores and looks up to_email.
        email: "bouncy@example.com",
        reason: "hard_bounce",
        scope: "all",
      }),
    ]);
    expect(suppressions[0].opts).toEqual({ onConflict: "email" });
  });

  it("does not suppress on a transient bounce, but still stamps bounced_at", async () => {
    const transient = {
      ...BOUNCE_EVENT,
      data: { ...BOUNCE_EVENT.data, bounce: { type: "Transient", subType: "MailboxFull" } },
    };

    const res = await POST(signedRequest(transient));

    expect(res.status).toBe(200);
    expect(eventUpdates).toHaveLength(1);
    expect(suppressions).toHaveLength(0);
  });

  it("stamps complained_at and suppresses with reason complaint", async () => {
    const res = await POST(
      signedRequest({
        type: "email.complained",
        created_at: "2026-08-28T11:00:00.000Z",
        data: { email_id: "re_msg_2", to: ["annoyed@example.com"] },
      }),
    );

    expect(res.status).toBe(200);
    expect(eventUpdates).toEqual([
      {
        row: { complained_at: "2026-08-28T11:00:00.000Z" },
        col: "provider_message_id",
        val: "re_msg_2",
      },
    ]);
    expect(suppressions[0].rows).toEqual([
      expect.objectContaining({ email: "annoyed@example.com", reason: "complaint", scope: "all" }),
    ]);
  });

  it("records delivery into the matched row's metadata", async () => {
    setupDb({ deliveredRow: { id: "ee-9", metadata: { category: "orders_and_payouts" } } });

    const res = await POST(
      signedRequest({
        type: "email.delivered",
        created_at: "2026-08-28T09:30:00.000Z",
        data: { email_id: "re_msg_3", to: ["buyer@example.com"] },
      }),
    );

    expect(res.status).toBe(200);
    expect(eventUpdates).toEqual([
      {
        row: {
          metadata: { category: "orders_and_payouts", delivered_at: "2026-08-28T09:30:00.000Z" },
        },
        col: "id",
        val: "ee-9",
      },
    ]);
  });

  it("acknowledges a delivery for a message we never logged", async () => {
    setupDb({ deliveredRow: null });

    const res = await POST(
      signedRequest({ type: "email.delivered", data: { email_id: "re_unknown" } }),
    );

    expect(res.status).toBe(200);
    expect(eventUpdates).toHaveLength(0);
  });

  it("stamps opened_at and clicked_at", async () => {
    await POST(
      signedRequest({
        type: "email.opened",
        created_at: "2026-08-28T12:00:00.000Z",
        data: { email_id: "re_msg_4" },
      }),
    );
    await POST(
      signedRequest({
        type: "email.clicked",
        created_at: "2026-08-28T12:05:00.000Z",
        data: { email_id: "re_msg_4" },
      }),
    );

    expect(eventUpdates).toEqual([
      {
        row: { opened_at: "2026-08-28T12:00:00.000Z" },
        col: "provider_message_id",
        val: "re_msg_4",
      },
      {
        row: { clicked_at: "2026-08-28T12:05:00.000Z" },
        col: "provider_message_id",
        val: "re_msg_4",
      },
    ]);
  });

  it("acknowledges unknown event types without writing", async () => {
    const res = await POST(
      signedRequest({ type: "email.delivery_delayed", data: { email_id: "re_msg_5" } }),
    );

    expect(res.status).toBe(200);
    expect(eventUpdates).toHaveLength(0);
    expect(suppressions).toHaveLength(0);
  });

  it("is idempotent across a svix redelivery of the same event", async () => {
    const first = await POST(signedRequest(BOUNCE_EVENT));
    const second = await POST(signedRequest(BOUNCE_EVENT));

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    // Same stamp, same suppression row both times: last write wins with
    // identical values, so state after two deliveries equals state after one.
    expect(eventUpdates[0]).toEqual(eventUpdates[1]);
    expect(suppressions[0].rows).toEqual(suppressions[1].rows);
  });

  it("returns 500 on a DB failure so svix redelivers", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    setupDb({ updateError: { message: "connection refused" } });

    const res = await POST(signedRequest(BOUNCE_EVENT));

    expect(res.status).toBe(500);
  });

  it("rejects malformed JSON that carries a valid signature", async () => {
    const body = "not json";
    const ts = Math.floor(Date.now() / 1000);
    const sig = signForSvix(body, "msg_x", ts, SECRET);
    const res = await POST(
      new Request("https://wallplace.co.uk/api/webhooks/resend", {
        method: "POST",
        headers: { "svix-id": "msg_x", "svix-timestamp": String(ts), "svix-signature": sig },
        body,
      }),
    );

    expect(res.status).toBe(400);
  });
});
