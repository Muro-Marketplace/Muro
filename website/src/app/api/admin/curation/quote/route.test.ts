// Wallplace Programmes, Task 4. The admin half of quoted checkout: an admin
// prices an `awaiting_quote` programme row, which is the only thing that
// makes it payable (checkout on an unquoted row is a separate 409, tested in
// ../../../curation/[id]/checkout/route.test.ts).
//
// Lives in its own route (mirroring ../refund/route.ts) rather than folding
// into ../route.ts's generic status/notes PATCH: a quote carries several
// interdependent mis-quote guards and its own audit action, which the
// generic PATCH schema was never built to hold.
//
// As in ../route.test.ts and ../refund/route.test.ts, the real withAdmin and
// getAdminUser run here against a mocked Supabase, so the admin predicate is
// exercised rather than stubbed.

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render } from "@react-email/components";
import type React from "react";
import { CURATION_TIERS, PROGRAMME_FOUNDING_SITE_LIMIT } from "@/lib/curation-tiers";

const { getUser, fromMock, recordMock, updateMock, sendEmailMock } = vi.hoisted(() => ({
  getUser: vi.fn(),
  fromMock: vi.fn(),
  recordMock: vi.fn(),
  updateMock: vi.fn(),
  sendEmailMock: vi.fn(),
}));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({ auth: { getUser }, from: fromMock }),
}));
vi.mock("@/lib/admin-audit", () => ({ recordAdminAction: recordMock }));
vi.mock("@/lib/email/send", () => ({ sendEmail: sendEmailMock }));

import { POST } from "./route";

// A variant-valid v4 UUID: zod's .uuid() checks the version and variant
// nibbles, so a "shaped like a UUID" string is rejected at the schema.
const REQUEST_ID = "11111111-2222-4333-8444-555555555555";

const PROGRAMME_ROW = {
  id: REQUEST_ID,
  tier: "programme",
  status: "awaiting_quote",
  venue_name: "The Copper Kettle",
  contact_name: "Maya Chen",
  contact_email: "maya@example.com",
};

/** A valid quote body against the £150 (6 piece) rung of PROGRAMME_LADDER. */
const VALID_BODY = {
  id: REQUEST_ID,
  quotedAmountGbp: 150,
  billingInterval: "month" as const,
  piecesEstimate: 6,
  pieceRentGbp: 10,
  rotationCadence: "biannual" as const,
};

let rowForLookup: Record<string, unknown> | null = { ...PROGRAMME_ROW };
let foundingCount = 0;
let countError: { message: string } | null = null;
let updateError: { message: string } | null = null;

function post(body: unknown, token: string | null = "Bearer x"): Request {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = token;
  return new Request("http://localhost/api/admin/curation/quote", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function setupDb() {
  fromMock.mockImplementation((table: string) => {
    if (table === "admin_users") {
      return { select: () => ({ eq: () => ({ limit: async () => ({ data: [], error: null }) }) }) };
    }
    if (table !== "curation_requests") throw new Error(`unexpected table ${table}`);
    return {
      select: (_cols: string, selectOpts?: { head?: boolean }) => {
        if (selectOpts?.head) {
          // The founding-cohort count: .select("id", {count, head:true}).eq("founding_site", true)
          return { eq: async () => ({ count: foundingCount, error: countError }) };
        }
        return { eq: () => ({ maybeSingle: async () => ({ data: rowForLookup, error: null }) }) };
      },
      update: (payload: Record<string, unknown>) => ({
        eq: async () => {
          updateMock(payload);
          return { error: updateError };
        },
      }),
    };
  });
}

beforeEach(() => {
  getUser.mockReset();
  fromMock.mockReset();
  recordMock.mockReset();
  updateMock.mockReset();
  sendEmailMock.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});

  rowForLookup = { ...PROGRAMME_ROW };
  foundingCount = 0;
  countError = null;
  updateError = null;
  sendEmailMock.mockResolvedValue({ ok: true, skipped: false, messageId: "m" });

  process.env.ADMIN_EMAILS = "boss@example.com";
  getUser.mockResolvedValue({
    data: {
      user: { id: "u-admin", email: "boss@example.com", user_metadata: { user_type: "admin" } },
    },
    error: null,
  });
  setupDb();
});

describe("authorisation and shape", () => {
  it("returns 401 without a token", async () => {
    const res = await POST(post(VALID_BODY, null));
    expect(res.status).toBe(401);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("never runs for a non-admin", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: "u1", email: "nobody@example.com", user_metadata: {} } },
      error: null,
    });
    const res = await POST(post(VALID_BODY));
    expect(res.status).toBe(403);
    expect(updateMock).not.toHaveBeenCalled();
    expect(recordMock).not.toHaveBeenCalled();
  });

  it("400s an invalid payload and touches nothing", async () => {
    const res = await POST(post({ ...VALID_BODY, id: "not-a-uuid" }));
    expect(res.status).toBe(400);
    expect(updateMock).not.toHaveBeenCalled();
    expect(recordMock).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("400s a payload missing a required field", async () => {
    const { pieceRentGbp: _drop, ...rest } = VALID_BODY;
    void _drop;
    const res = await POST(post(rest));
    expect(res.status).toBe(400);
    expect(updateMock).not.toHaveBeenCalled();
  });
});

describe("mis-quote guards (each its own reason to refuse)", () => {
  it(`400s a monthly quote below the tier floor (£${CURATION_TIERS.programme.priceGbp})`, async () => {
    const res = await POST(
      post({ ...VALID_BODY, quotedAmountGbp: 50, piecesEstimate: 3, pieceRentGbp: 5 }),
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/at least/i);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("400s a quarterly quote whose MONTHLY-EQUIVALENT is below the tier floor, even though the raw quarterly figure alone clears it", async () => {
    // 100 >= 79.99 (the raw quarterly number), but 100 / 3 = 33.33 a month,
    // which is the actual mis-quote this guard exists to catch.
    const res = await POST(
      post({
        ...VALID_BODY,
        quotedAmountGbp: 100,
        billingInterval: "quarter",
        piecesEstimate: 3,
        pieceRentGbp: 5,
      }),
    );
    expect(res.status).toBe(400);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("passes a quarterly quote whose monthly equivalent clears the floor", async () => {
    // 240 / 3 = 80, just over the 79.99 floor.
    const res = await POST(
      post({
        ...VALID_BODY,
        quotedAmountGbp: 240,
        billingInterval: "quarter",
        piecesEstimate: 3,
        pieceRentGbp: 5,
      }),
    );
    expect(res.status).toBe(200);
  });

  it("400s piece rent below PROGRAMME_PIECE_RENT_MIN_GBP", async () => {
    const res = await POST(post({ ...VALID_BODY, pieceRentGbp: 4 }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/rent/i);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("passes piece rent exactly at the floor", async () => {
    const res = await POST(post({ ...VALID_BODY, pieceRentGbp: 5 }));
    expect(res.status).toBe(200);
  });

  it("400s a monthly rent pool over PROGRAMME_RENT_SHARE_MAX of the quote", async () => {
    // quote 100/mo, 10 pieces at £10 rent = £100 pool = 100% of the quote, over 70%.
    const res = await POST(
      post({ ...VALID_BODY, quotedAmountGbp: 100, piecesEstimate: 10, pieceRentGbp: 10 }),
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/70%|rent pool/i);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("400s a quarterly rent pool over the share of the MONTHLY-EQUIVALENT quote", async () => {
    // quote £300/quarter -> £100/month equivalent; 10 pieces at £10 = £100 pool,
    // 100% of the £100 monthly-equivalent, over 70%.
    const res = await POST(
      post({
        ...VALID_BODY,
        quotedAmountGbp: 300,
        billingInterval: "quarter",
        piecesEstimate: 10,
        pieceRentGbp: 10,
      }),
    );
    expect(res.status).toBe(400);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("passes a rent pool exactly at 70% of the quote", async () => {
    // quote £100/mo, 10 pieces at £7 = £70 pool = exactly 70%.
    const res = await POST(
      post({ ...VALID_BODY, quotedAmountGbp: 100, piecesEstimate: 10, pieceRentGbp: 7 }),
    );
    expect(res.status).toBe(200);
  });
});

describe("row-state guard: awaiting_quote + programme, else 409", () => {
  it("404s an unknown request", async () => {
    rowForLookup = null;
    const res = await POST(post(VALID_BODY));
    expect(res.status).toBe(404);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("409s a row that is not awaiting_quote", async () => {
    rowForLookup = { ...PROGRAMME_ROW, status: "paid" };
    const res = await POST(post(VALID_BODY));
    expect(res.status).toBe(409);
    expect(updateMock).not.toHaveBeenCalled();
    expect(recordMock).not.toHaveBeenCalled();
  });

  it("409s a row whose tier is not programme", async () => {
    rowForLookup = { ...PROGRAMME_ROW, tier: "bespoke" };
    const res = await POST(post(VALID_BODY));
    expect(res.status).toBe(409);
    expect(updateMock).not.toHaveBeenCalled();
  });
});

describe("founding cohort cap (mirrors FOUNDING_ARTIST_LIMIT in admin/artists)", () => {
  it("sets founding_site while the cohort is under the limit", async () => {
    foundingCount = PROGRAMME_FOUNDING_SITE_LIMIT - 1;
    const res = await POST(post({ ...VALID_BODY, foundingSite: true }));
    expect(res.status).toBe(200);
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock.mock.calls[0][0]).toMatchObject({ founding_site: true });
  });

  it(`409s once ${PROGRAMME_FOUNDING_SITE_LIMIT} sites are already founding`, async () => {
    foundingCount = PROGRAMME_FOUNDING_SITE_LIMIT;
    const res = await POST(post({ ...VALID_BODY, foundingSite: true }));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toContain(String(PROGRAMME_FOUNDING_SITE_LIMIT));
    expect(updateMock).not.toHaveBeenCalled();
    expect(recordMock).not.toHaveBeenCalled();
  });

  it("never checks the cohort count when foundingSite is not set", async () => {
    // A quote that omits foundingSite entirely defaults to false and must not
    // even run the count query, let alone be blocked by it.
    foundingCount = PROGRAMME_FOUNDING_SITE_LIMIT;
    const res = await POST(post(VALID_BODY));
    expect(res.status).toBe(200);
    expect(updateMock.mock.calls[0][0]).toMatchObject({ founding_site: false });
  });

  it("500s and writes nothing when the count check errors", async () => {
    countError = { message: "db down" };
    const res = await POST(post({ ...VALID_BODY, foundingSite: true }));
    expect(res.status).toBe(500);
    expect(updateMock).not.toHaveBeenCalled();
    expect(recordMock).not.toHaveBeenCalled();
  });
});

describe("happy path: writes the quote, audits, and emails a checkout link", () => {
  it("writes every quoted field plus the tier's standard term", async () => {
    const res = await POST(post(VALID_BODY));
    expect(res.status).toBe(200);

    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock.mock.calls[0][0]).toMatchObject({
      quoted_amount_gbp: 150,
      billing_interval: "month",
      pieces_estimate: 6,
      piece_rent_gbp: 10,
      rotation_cadence: "biannual",
      term_months: CURATION_TIERS.programme.termMonths,
      founding_site: false,
      status: "pending_payment",
    });
  });

  it("records an audit row naming the quote, without contact PII", async () => {
    await POST(post(VALID_BODY));
    expect(recordMock).toHaveBeenCalledTimes(1);
    const [call] = recordMock.mock.calls[0] as [{ adminUserId: string; action: string; context: Record<string, unknown> }];
    expect(call.adminUserId).toBe("u-admin");
    expect(call.action).toBe("programme_quoted");
    expect(call.context).toMatchObject({
      curationRequestId: REQUEST_ID,
      quotedAmountGbp: 150,
      billingInterval: "month",
    });
    expect(JSON.stringify(call.context)).not.toContain("maya@example.com");
  });

  it("emails the contact a checkout link, keyed on the row", async () => {
    await POST(post(VALID_BODY));
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const call = sendEmailMock.mock.calls[0][0] as {
      template: string;
      to: string;
      idempotencyKey: string;
    };
    expect(call.template).toBe("curation_quote_ready");
    expect(call.to).toBe("maya@example.com");
    expect(call.idempotencyKey).toBe(`curation_quote_ready:${REQUEST_ID}`);
  });

  it("the checkout link points at the requester-facing checkout route for this row", async () => {
    // Asserted on the RENDERED email, not on react.props: every direct
    // sendEmail call in this codebase passes `Template({...})` rather than
    // `createElement(Template, {...})`, so the element carries EmailShell's
    // props, not CurationQuoteReady's (see email-one-per-event.test.ts).
    await POST(post(VALID_BODY));
    const call = sendEmailMock.mock.calls[0][0] as { react: React.ReactElement };
    const html = await render(call.react);
    expect(html).toContain(`/api/curation/${REQUEST_ID}/checkout`);
    expect(html).toContain("150.00");
  });

  it("a failed email does not fail the quote", async () => {
    sendEmailMock.mockRejectedValue(new Error("smtp down"));
    const res = await POST(post(VALID_BODY));
    expect(res.status).toBe(200);
    expect(updateMock).toHaveBeenCalledTimes(1);
  });

  it("500s and records nothing when the update fails", async () => {
    updateError = { message: "permission denied" };
    const res = await POST(post(VALID_BODY));
    expect(res.status).toBe(500);
    expect(recordMock).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});
