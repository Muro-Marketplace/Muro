// /api/artwork-requests/[id]/responses POST.
//
// Plan G2 coverage focus:
//   - placement responseType persists the new proposed_* columns
//   - existing_works is rejected at the schema layer
//   - non-placement responses don't accidentally write placement terms
//
// We mock Supabase end-to-end via a chainable stub. The route's only
// outside-touch is the bell notification (createNotification), which
// we no-op so a missing notifications backend doesn't fail the test.

import { describe, expect, it, vi, beforeEach } from "vitest";

// ---- Mocks ------------------------------------------------------------

// Capture the .insert() call so the test can assert what columns the
// route asked the DB to write.
let lastInsert: Record<string, unknown> | null = null;
// Capture every insert attempt in order so we can assert the route's
// retry behaviour (full → core-only) when an extended column rejects.
let insertAttempts: Record<string, unknown>[] = [];
// When set, the first insert fails with this error; the second succeeds.
// Mimics PostgREST telling us a column doesn't exist on an unmigrated DB.
let firstInsertError: { message: string; code?: string } | null = null;
// What the artist_profiles lookup returns. Default is a real artist.
let artistRow: { user_id: string; slug: string } | null = { user_id: "u-artist", slug: "the-artist" };
// What the artwork_requests lookup returns. Default is an open request.
let artworkRequestRow: { id: string; venue_user_id: string; status: string; title: string } | null = {
  id: "arq_1",
  venue_user_id: "u-venue",
  status: "open",
  title: "Coffee shop wall",
};

vi.mock("@/lib/api-auth", () => ({
  getAuthenticatedUser: vi.fn(async (req: Request) => {
    const auth = req.headers.get("authorization");
    if (auth === "Bearer artist") return { user: { id: "u-artist", email: "a@x.test" }, error: null };
    return { user: null, error: new Response(null, { status: 401 }) };
  }),
}));

vi.mock("@/lib/notifications", () => ({
  createNotification: vi.fn(async () => undefined),
}));

vi.mock("@/lib/outreach-cap", () => ({
  // The route only calls .ok / .result; pass-through with .ok=true is
  // enough to let us reach the insert.
  checkArtistOutreachCap: vi.fn(async () => ({ ok: true, result: null })),
}));

vi.mock("@/lib/supabase-admin", () => {
  // Minimal chainable stub. The route uses three patterns we need to
  // honour:
  //   db.from("artist_profiles").select(...).eq(...).maybeSingle()
  //   db.from("artwork_requests").select(...).eq(...).maybeSingle()
  //   db.from("artwork_request_responses").insert({...}).select("id").single()
  function makeChainable(table: string) {
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.order = () => chain;
    chain.maybeSingle = async () => {
      if (table === "artist_profiles") return { data: artistRow, error: null };
      if (table === "artwork_requests") return { data: artworkRequestRow, error: null };
      return { data: null, error: null };
    };
    chain.insert = (row: Record<string, unknown>) => {
      lastInsert = row;
      insertAttempts.push(row);
      return {
        select: () => ({
          single: async () => {
            // The route retries with a smaller payload when the first
            // insert fails. Honour the test's `firstInsertError` until
            // the second attempt, then succeed.
            if (firstInsertError && insertAttempts.length === 1) {
              return { data: null, error: firstInsertError };
            }
            return { data: { id: "new-row-id" }, error: null };
          },
        }),
      };
    };
    return chain;
  }
  return {
    getSupabaseAdmin: () => ({
      from: (table: string) => makeChainable(table),
    }),
  };
});

beforeEach(() => {
  vi.resetModules();
  lastInsert = null;
  insertAttempts = [];
  firstInsertError = null;
  artistRow = { user_id: "u-artist", slug: "the-artist" };
  artworkRequestRow = {
    id: "arq_1",
    venue_user_id: "u-venue",
    status: "open",
    title: "Coffee shop wall",
  };
});

// ---- Test helpers ----------------------------------------------------

function buildRequest(body: unknown) {
  return new Request("https://w.local/api/artwork-requests/arq_1/responses", {
    method: "POST",
    headers: { authorization: "Bearer artist", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const ctx = { params: Promise.resolve({ id: "arq_1" }) };

// ---- Tests -----------------------------------------------------------

describe("POST /api/artwork-requests/[id]/responses", () => {
  it("rejects existing_works at the schema layer (Plan G2 drop)", async () => {
    const { POST } = await import("./route");
    const res = await POST(
      buildRequest({ responseType: "existing_works", message: "hi" }),
      ctx,
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("validation_failed");
    expect(json.message).toContain("responseType");
    expect(lastInsert).toBeNull();
  });

  it("persists proposed_* columns when responseType=placement", async () => {
    const { POST } = await import("./route");
    const res = await POST(
      buildRequest({
        responseType: "placement",
        message: "Happy to lend three pieces.",
        proposedMonthlyFeePence: 5000,
        proposedQrEnabled: true,
        proposedRevenueSharePercent: 30,
      }),
      ctx,
    );
    expect(res.status).toBe(200);
    expect(lastInsert).toBeTruthy();
    expect(lastInsert!.response_type).toBe("placement");
    expect(lastInsert!.proposed_monthly_fee_pence).toBe(5000);
    expect(lastInsert!.proposed_qr_enabled).toBe(true);
    expect(lastInsert!.proposed_revenue_share_percent).toBe(30);
  });

  it("nulls proposed_* columns for non-placement responses", async () => {
    const { POST } = await import("./route");
    const res = await POST(
      buildRequest({
        responseType: "message",
        message: "Curious to chat.",
        // Even if a malicious client smuggled placement fields onto a
        // message-type response, the route should ignore them so the
        // venue UI doesn't show ghost terms.
        proposedMonthlyFeePence: 9999,
        proposedRevenueSharePercent: 50,
        proposedQrEnabled: true,
      }),
      ctx,
    );
    expect(res.status).toBe(200);
    expect(lastInsert).toBeTruthy();
    expect(lastInsert!.response_type).toBe("message");
    expect(lastInsert!.proposed_monthly_fee_pence).toBeNull();
    expect(lastInsert!.proposed_qr_enabled).toBeNull();
    expect(lastInsert!.proposed_revenue_share_percent).toBeNull();
  });

  it("rejects revenue share above the 50% cap", async () => {
    const { POST } = await import("./route");
    const res = await POST(
      buildRequest({
        responseType: "placement",
        message: "ok",
        proposedRevenueSharePercent: 75,
      }),
      ctx,
    );
    expect(res.status).toBe(400);
    expect(lastInsert).toBeNull();
  });

  it("retries with core columns when the full insert fails (e.g. missing migration)", async () => {
    // Reproduces the artist-portal bug: a prod DB without migration 048 / 054
    // rejects the metadata + proposed_* columns, dropping the response on the
    // floor. The route should retry with the core columns so the response
    // still saves; the operator sees a console warning to apply migrations.
    firstInsertError = {
      message: "Could not find the 'proposed_monthly_fee_pence' column of 'artwork_request_responses'",
      code: "PGRST204",
    };
    const { POST } = await import("./route");
    const res = await POST(
      buildRequest({
        responseType: "commission",
        message: "Happy to take this on.",
        proposedCommissionAmountPence: 100_000,
      }),
      ctx,
    );
    expect(res.status).toBe(200);
    expect(insertAttempts).toHaveLength(2);
    // Second attempt is core-only — no metadata, no placement-term columns.
    expect(insertAttempts[1]).not.toHaveProperty("metadata");
    expect(insertAttempts[1]).not.toHaveProperty("proposed_monthly_fee_pence");
    expect(insertAttempts[1]).not.toHaveProperty("proposed_qr_enabled");
    expect(insertAttempts[1]).not.toHaveProperty("proposed_revenue_share_percent");
    // The core commission columns are still there — the artist's price
    // doesn't get dropped on the fallback path.
    expect(insertAttempts[1].response_type).toBe("commission");
    expect(insertAttempts[1].proposed_commission_amount_pence).toBe(100_000);
  });

  it("surfaces the underlying DB error message when both inserts fail", async () => {
    // If the core insert also fails (RLS, FK, etc.), the artist needs to see
    // *why* — a flat "Could not save response" with no breadcrumb leaves them
    // stuck. We now return the DB message so the UI can render it.
    firstInsertError = {
      message: "new row violates row-level security policy",
      code: "42501",
    };
    // Once we set firstInsertError but never clear it, the second insert
    // would succeed in our stub — so to test the double-failure path we
    // also need the second attempt to fail. Wire it: keep failing every
    // call by re-setting firstInsertError on the second call. Simulate
    // by checking attempts length inside the chain... easier: make the
    // stub fail unconditionally for this test.
    const { POST } = await import("./route");
    // Override the chain to always error.
    const supabaseAdmin = await import("@/lib/supabase-admin");
    const original = supabaseAdmin.getSupabaseAdmin;
    (supabaseAdmin as { getSupabaseAdmin: typeof original }).getSupabaseAdmin = () => ({
      from: (table: string) => {
        const chain: Record<string, unknown> = {};
        chain.select = () => chain;
        chain.eq = () => chain;
        chain.maybeSingle = async () => {
          if (table === "artist_profiles") return { data: artistRow, error: null };
          if (table === "artwork_requests") return { data: artworkRequestRow, error: null };
          return { data: null, error: null };
        };
        chain.insert = () => ({
          select: () => ({
            single: async () => ({ data: null, error: firstInsertError }),
          }),
        });
        return chain;
      },
    }) as unknown as ReturnType<typeof original>;
    try {
      const res = await POST(
        buildRequest({ responseType: "message", message: "hello" }),
        ctx,
      );
      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.error).toBe("Could not save response");
      expect(json.message).toContain("row-level security");
    } finally {
      (supabaseAdmin as { getSupabaseAdmin: typeof original }).getSupabaseAdmin = original;
    }
  });
});
