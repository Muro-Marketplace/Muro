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
let artistRow:
  | { user_id: string; slug: string; review_status?: string }
  | null = { user_id: "u-artist", slug: "the-artist", review_status: "approved" };
// What the artwork_requests lookup returns. Default is an open request.
type RequestRow = {
  id: string;
  venue_user_id: string;
  status: string;
  title: string;
  visibility?: string;
  invited_artist_slugs?: string[];
};
// Default is the shape prod actually holds: all 6 live requests are semi_public
// with no invite list.
// F45: a prior response by the same artist on the same brief, when the test
// wants one. Null (the default) means this is the artist's first response.
let priorResponseRow: { id: string; status: string } | null = null;
let artworkRequestRow: RequestRow | null = {
  id: "arq_1",
  venue_user_id: "u-venue",
  status: "open",
  title: "Coffee shop wall",
  visibility: "semi_public",
  invited_artist_slugs: [],
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
    // E46d. The filters are RECORDED and honoured for artwork_requests.
    //
    // This stub used to be `chain.eq = () => chain`, ignoring every filter, so
    // assertCanViewArtworkRequest's first query (.eq("venue_user_id", actor.id))
    // matched and every artist was classified as the OWNER. The six pre-existing
    // tests passed because the fixture was permissive, not because the visibility
    // rule worked, and the rule itself was therefore completely unproven on this
    // route.
    const filters: Record<string, unknown> = {};
    const contains: Record<string, unknown[]> = {};
    chain.select = () => chain;
    chain.eq = (col: string, val: unknown) => {
      filters[col] = val;
      return chain;
    };
    chain.contains = (col: string, vals: unknown[]) => {
      contains[col] = vals;
      return chain;
    };
    chain.order = () => chain;
    chain.maybeSingle = async () => {
      if (table === "artist_profiles") return { data: artistRow, error: null };
      if (table === "artwork_requests") {
        const row = artworkRequestRow;
        if (!row) return { data: null, error: null };
        // Every filter the caller applied must actually hold.
        for (const [col, want] of Object.entries(filters)) {
          if ((row as Record<string, unknown>)[col] !== want) return { data: null, error: null };
        }
        for (const [col, wanted] of Object.entries(contains)) {
          const actual = ((row as Record<string, unknown>)[col] as unknown[]) ?? [];
          if (!wanted.every((w) => actual.includes(w))) return { data: null, error: null };
        }
        return { data: row, error: null };
      }
      // F45: the per-artist duplicate lookup. Default null = no prior response.
      if (table === "artwork_request_responses") {
        if (!priorResponseRow) return { data: null, error: null };
        for (const [col, allowed] of Object.entries(inFilters)) {
          if (!allowed.includes((priorResponseRow as Record<string, unknown>)[col])) {
            return { data: null, error: null };
          }
        }
        return { data: priorResponseRow, error: null };
      }
      return { data: null, error: null };
    };
    chain.limit = () => chain;
    const inFilters: Record<string, unknown[]> = {};
    chain.in = (col: string, vals: unknown[]) => {
      inFilters[col] = vals;
      return chain;
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

beforeEach(async () => {
  vi.resetModules();
  // The outreach-cap spy is asserted on (a refused attempt must not consult it),
  // so it has to start each test clean.
  vi.mocked((await import("@/lib/outreach-cap")).checkArtistOutreachCap).mockClear();
  lastInsert = null;
  insertAttempts = [];
  firstInsertError = null;
  priorResponseRow = null;
  artistRow = { user_id: "u-artist", slug: "the-artist", review_status: "approved" };
  artworkRequestRow = {
    id: "arq_1",
    venue_user_id: "u-venue",
    status: "open",
    title: "Coffee shop wall",
    visibility: "semi_public",
    invited_artist_slugs: [],
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
        chain.in = () => chain;
        chain.limit = () => chain;
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

// ── E46d: visibility and invite enforcement on POST (06 B3) ──────────────────
//
// The POST's only gates used to be: valid token, has an artist profile, under the
// daily cap, request is open. Membership of the invite list was never consulted,
// while the sibling LIST route did enforce it. So any signed-in artist could bid
// on a private brief they were never invited to, and, chained with the then
// unauthenticated GETs, could read every rival bid first.
//
// The enforcement itself arrived with 01's E17/E18 work (assertCanViewArtworkRequest
// is called before anything else). What was missing was any test of it: the fixture
// ignored filters, so every artist matched the owner query and the rule was never
// exercised. These are that missing coverage.
describe("POST responses visibility enforcement (E46d)", () => {
  it("refuses an uninvited artist on a private brief, and does not burn their quota", async () => {
    artworkRequestRow = {
      id: "arq_1",
      venue_user_id: "u-venue",
      status: "open",
      title: "Private commission",
      visibility: "private",
      invited_artist_slugs: ["someone-else"],
    };
    const { POST } = await import("./route");
    const { checkArtistOutreachCap } = await import("@/lib/outreach-cap");
    const res = await POST(buildRequest({ responseType: "message", message: "hi" }), ctx);

    // 404 not 403: a 403 would confirm the private brief exists.
    expect(res.status).toBe(404);
    expect(lastInsert, "an uninvited artist wrote a response").toBeNull();
    expect(
      vi.mocked(checkArtistOutreachCap),
      "a rejected attempt burned the artist's daily quota",
    ).not.toHaveBeenCalled();
  });

  it("allows an artist who IS on the invite list", async () => {
    artworkRequestRow = {
      id: "arq_1",
      venue_user_id: "u-venue",
      status: "open",
      title: "Private commission",
      visibility: "private",
      invited_artist_slugs: ["the-artist"],
    };
    const { POST } = await import("./route");
    const res = await POST(buildRequest({ responseType: "message", message: "hi" }), ctx);
    expect(res.status).toBe(200);
    expect(lastInsert).not.toBeNull();
  });

  it("allows any approved artist on a semi_public brief, which is all 6 live rows", async () => {
    const { POST } = await import("./route");
    const res = await POST(buildRequest({ responseType: "message", message: "hi" }), ctx);
    expect(res.status).toBe(200);
  });

  it("refuses an artist whose profile is not approved yet", async () => {
    // assertCanViewArtworkRequest only accepts review_status "approved", so a
    // pending applicant cannot bid.
    artistRow = { user_id: "u-artist", slug: "the-artist", review_status: "pending" };
    const { POST } = await import("./route");
    const res = await POST(buildRequest({ responseType: "message", message: "hi" }), ctx);
    expect(res.status).toBe(404);
    expect(lastInsert).toBeNull();
  });

  it("still lets the owning venue through, so the owner branch is not broken", async () => {
    // The fixture is filter-aware now, so this exercises the real owner query.
    artworkRequestRow = {
      id: "arq_1",
      venue_user_id: "u-artist", // caller IS the venue on this row
      status: "open",
      title: "Own brief",
      visibility: "private",
      invited_artist_slugs: [],
    };
    const { POST } = await import("./route");
    const res = await POST(buildRequest({ responseType: "message", message: "hi" }), ctx);
    expect(res.status).toBe(200);
  });
});

describe("POST responses does not burn quota on a rejected attempt (E46d ordering)", () => {
  it("checks the request is open BEFORE consulting the outreach cap", async () => {
    // The state check used to sit after the cap, so responding to a closed brief
    // cost the artist one of their two-to-ten daily sends for nothing.
    artworkRequestRow = {
      id: "arq_1",
      venue_user_id: "u-venue",
      status: "closed",
      title: "Closed brief",
      visibility: "semi_public",
      invited_artist_slugs: [],
    };
    const { POST } = await import("./route");
    const { checkArtistOutreachCap } = await import("@/lib/outreach-cap");
    const res = await POST(buildRequest({ responseType: "message", message: "hi" }), ctx);
    expect(res.status).toBe(409);
    expect(
      vi.mocked(checkArtistOutreachCap),
      "a closed-brief attempt burned the artist's quota",
    ).not.toHaveBeenCalled();
    expect(lastInsert).toBeNull();
  });
});

describe("POST responses enforces the share-requires-QR pairing (F44)", () => {
  it("rejects a revenue share above zero with QR switched off", async () => {
    const { POST } = await import("./route");
    const res = await POST(
      buildRequest({
        responseType: "placement",
        message: "Terms attached.",
        proposedRevenueSharePercent: 25,
        proposedQrEnabled: false,
      }),
      ctx,
    );

    // Fail-before: this saved happily, and the accept handler then created a
    // revenue_share placement with qr_enabled false, i.e. a venue cut of sales
    // that the wall has no way to make. The `??` at the accept only covered
    // null, so an explicit false went straight through.
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("validation_failed");
    expect(json.message).toContain("proposedQrEnabled");
    expect(lastInsert, "a self-contradicting response was saved").toBeNull();
  });

  it("rejects a share with QR simply omitted", async () => {
    const { POST } = await import("./route");
    const res = await POST(
      buildRequest({
        responseType: "placement",
        message: "Terms attached.",
        proposedRevenueSharePercent: 25,
      }),
      ctx,
    );

    expect(res.status).toBe(400);
    expect(lastInsert).toBeNull();
  });

  it("allows a zero share with QR off, which is not a contradiction", async () => {
    const { POST } = await import("./route");
    const res = await POST(
      buildRequest({
        responseType: "placement",
        message: "Free display, no QR.",
        proposedRevenueSharePercent: 0,
        proposedQrEnabled: false,
      }),
      ctx,
    );

    expect(res.status).toBe(200);
    expect(lastInsert!.proposed_qr_enabled).toBe(false);
  });

  it("leaves the pairing alone on non-placement responses", async () => {
    const { POST } = await import("./route");
    const res = await POST(
      buildRequest({
        responseType: "message",
        message: "Just saying hello.",
        proposedRevenueSharePercent: 25,
        proposedQrEnabled: false,
      }),
      ctx,
    );

    // The route nulls the placement columns for these anyway, so there is no
    // contradiction to guard against and no reason to reject the message.
    expect(res.status).toBe(200);
  });
});

describe("POST responses guards against duplicates (F45)", () => {
  it("refuses a second response while the first is still awaiting an answer", async () => {
    priorResponseRow = { id: "resp-1", status: "sent" };
    const { POST } = await import("./route");
    const { checkArtistOutreachCap } = await import("@/lib/outreach-cap");

    const res = await POST(buildRequest({ responseType: "message", message: "again" }), ctx);

    // Fail-before: nothing stopped a resubmission, and each duplicate reached
    // checkArtistOutreachCap, so re-sending burned another of the artist's
    // three-to-fifteen weekly sends for a brief they had already answered.
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({ error: "already_responded" });
    expect(lastInsert).toBeNull();
    expect(
      vi.mocked(checkArtistOutreachCap),
      "a duplicate attempt burned the artist's quota",
    ).not.toHaveBeenCalled();
  });

  it("refuses a second response once the venue has accepted the first", async () => {
    priorResponseRow = { id: "resp-1", status: "accepted" };
    const { POST } = await import("./route");
    const res = await POST(buildRequest({ responseType: "message", message: "again" }), ctx);
    expect(res.status).toBe(409);
    expect(lastInsert).toBeNull();
  });

  it("refuses once the response has been fulfilled", async () => {
    priorResponseRow = { id: "resp-1", status: "fulfilled" };
    const { POST } = await import("./route");
    const res = await POST(buildRequest({ responseType: "message", message: "again" }), ctx);
    expect(res.status).toBe(409);
  });

  it("lets the artist come back with new terms after a decline", async () => {
    // A decline is "not these terms", not "never again", so this stays open.
    priorResponseRow = { id: "resp-1", status: "declined" };
    const { POST } = await import("./route");
    const res = await POST(buildRequest({ responseType: "message", message: "revised" }), ctx);
    expect(res.status).toBe(200);
    expect(lastInsert).toBeTruthy();
  });

  it("lets a first response through untouched", async () => {
    priorResponseRow = null;
    const { POST } = await import("./route");
    const res = await POST(buildRequest({ responseType: "message", message: "first" }), ctx);
    expect(res.status).toBe(200);
  });
});
