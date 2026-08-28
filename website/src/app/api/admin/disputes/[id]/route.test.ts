// 09 §D.2 / item 3.6. Resolving a dispute told nobody.
//
// The panel could resolve a case, the audit log recorded who did it and what
// they decided, `disputes.resolution` held the text, and neither the buyer nor
// the artist was ever emailed. The reason was one line: the pre-fetch selected
// `"id, status"`, so the handler never held the order the dispute was about and
// so could not have found the parties even if it had wanted to.
//
// `OrderDisputeResolved` had been written, styled and registered the whole time.

import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/admin-auth", () => ({
  getAdminUser: vi.fn(async () => ({ user: { id: "u-admin", email: "admin@x.com" }, error: null })),
}));
import { getAdminUser } from "@/lib/admin-auth";

const fromMock = vi.fn();
const getUserByIdMock = vi.fn(async () => ({ data: { user: { email: "artist@x.com" } } }));
vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({ from: fromMock, auth: { admin: { getUserById: getUserByIdMock } } }),
}));
vi.mock("@/lib/admin-audit", () => ({ recordAdminAction: vi.fn(async () => {}) }));
vi.mock("@/lib/email/send", () => ({ sendEmail: vi.fn(async () => ({ ok: true, skipped: false })) }));

import { PATCH } from "./route";
import { sendEmail } from "@/lib/email/send";
import { recordAdminAction } from "@/lib/admin-audit";

const DISPUTE = {
  id: "dsp_1",
  status: "open",
  order_id: "ord_1",
  placement_id: null,
  opener_user_id: "u-buyer",
};

const ORDER = {
  id: "ord_1",
  buyer_email: "buyer@x.com",
  buyer_user_id: "u-buyer",
  artist_user_id: "u-artist",
  artist_slug: "maya-chen",
  shipping: { fullName: "Jo Bloggs" },
};

let selectedColumns: Record<string, string> = {};
let updated: Record<string, unknown> | null = null;

function installDb(opts: { dispute?: unknown; order?: unknown } = {}) {
  selectedColumns = {};
  updated = null;
  fromMock.mockImplementation((table: string) => ({
    select: (cols: string) => {
      selectedColumns[table] = cols;
      return {
        eq: () => ({
          maybeSingle: async () => ({
            data:
              table === "disputes"
                ? "dispute" in opts
                  ? opts.dispute
                  : DISPUTE
                : "order" in opts
                  ? opts.order
                  : ORDER,
          }),
        }),
      };
    },
    update: (row: Record<string, unknown>) => {
      updated = row;
      return { eq: async () => ({ error: null }) };
    },
    insert: async () => ({ error: null }),
  }));
}

function req(body: unknown): Request {
  return new Request("http://localhost/api/admin/disputes/dsp_1", {
    method: "PATCH",
    headers: { authorization: "Bearer admin", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const ctx = { params: Promise.resolve({ id: "dsp_1" }) };
const RESOLVE = { action: "resolve", resolution: "Refunded in full, the frame was damaged in transit." };

beforeEach(() => {
  fromMock.mockReset();
  vi.mocked(sendEmail).mockClear();
  vi.mocked(recordAdminAction).mockClear();
  vi.mocked(getAdminUser).mockResolvedValue({ user: { id: "u-admin", email: "admin@x.com" }, error: null } as never);
  installDb();
});

describe("PATCH /api/admin/disputes/[id] resolve tells both parties", () => {
  it("reads enough of the dispute to know who it is about", async () => {
    // The root cause. With `"id, status"` the handler had a decision and no
    // people, so the emails below are not merely absent, they are impossible.
    await PATCH(req(RESOLVE), ctx);

    for (const col of ["order_id", "placement_id", "opener_user_id"]) {
      expect(selectedColumns.disputes, col).toContain(col);
    }
  });

  it("emails both parties, exactly once each", async () => {
    await PATCH(req(RESOLVE), ctx);

    expect(sendEmail).toHaveBeenCalledTimes(2);
    const calls = vi.mocked(sendEmail).mock.calls.map((c) => c[0]);
    expect(calls.map((c) => c.to).sort()).toEqual(["artist@x.com", "buyer@x.com"]);
    expect(calls.every((c) => c.template === "order_dispute_resolved")).toBe(true);
  });

  it("puts the admin's own resolution text in the email, not a generic line", async () => {
    // The whole point of the email is telling someone what was decided.
    await PATCH(req(RESOLVE), ctx);

    // Assert the count first: a bare for-of over an empty mock.calls passes
    // whatever the route does, which is how a test for "the email says X" ends
    // up green on a route that sends no email at all.
    const calls = vi.mocked(sendEmail).mock.calls;
    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(JSON.stringify(call[0].react)).toContain("the frame was damaged in transit");
    }
  });

  it("keys the two sends apart so the second is not dropped as a duplicate", async () => {
    await PATCH(req(RESOLVE), ctx);

    const keys = vi.mocked(sendEmail).mock.calls.map((c) => c[0].idempotencyKey);
    expect(keys.sort()).toEqual(["dispute_resolved:dsp_1:artist", "dispute_resolved:dsp_1:buyer"]);
  });

  it("still writes the resolution and the audit row", async () => {
    // The emails are new; nothing that already worked may stop working.
    const res = await PATCH(req(RESOLVE), ctx);

    expect(res.status).toBe(200);
    expect(updated).toMatchObject({ status: "resolved", resolution: RESOLVE.resolution, resolved_by_user_id: "u-admin" });
    expect(recordAdminAction).toHaveBeenCalledTimes(1);
    expect(vi.mocked(recordAdminAction).mock.calls[0][0].action).toBe("dispute.resolve");
  });
});

describe("PATCH /api/admin/disputes/[id] sends nothing it has no content for", () => {
  it("emails nobody on close", async () => {
    // No resolution text exists on a close, so an email would say nothing.
    await PATCH(req({ action: "close" }), ctx);

    expect(sendEmail).not.toHaveBeenCalled();
    expect(updated).toMatchObject({ status: "closed" });
  });

  it("emails nobody on escalate", async () => {
    await PATCH(req({ action: "escalate", note: "second opinion" }), ctx);

    expect(sendEmail).not.toHaveBeenCalled();
    expect(updated).toMatchObject({ category: "escalated" });
  });

  it("emails nobody when the dispute is not attached to an order", async () => {
    installDb({ dispute: { ...DISPUTE, order_id: null, placement_id: "plc_1" } });

    const res = await PATCH(req(RESOLVE), ctx);

    expect(res.status).toBe(200);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("resolves anyway when the order row has vanished", async () => {
    // A missing order must not block the admin from closing the case.
    installDb({ order: null });

    const res = await PATCH(req(RESOLVE), ctx);

    expect(res.status).toBe(200);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(recordAdminAction).toHaveBeenCalledTimes(1);
  });

  it("refuses a non-admin before reading anything", async () => {
    vi.mocked(getAdminUser).mockResolvedValue({
      user: null,
      error: new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }),
    } as never);

    const res = await PATCH(req(RESOLVE), ctx);

    expect(res.status).toBe(403);
    expect(fromMock).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("rejects a resolve with no resolution text", async () => {
    const res = await PATCH(req({ action: "resolve" }), ctx);
    expect(res.status).toBe(400);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
