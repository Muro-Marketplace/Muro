// Row 2197 / PASS2-chain8-log. "Editing a consignment record clears the
// approval ticked in the same save."
//
// The reset itself is correct and load-bearing: changing the terms must force
// both parties to re-sign, which is what gives each side confidence the other
// is not editing behind their back. But it ran unconditionally AFTER the
// approval assignment, so a save that both edited a field and ticked the
// caller's own box left that box false. You had to save the edit, then tick and
// save again. The banner then contradicted itself, reading "Approvals were
// cleared, both parties need to tick the record again" directly above "Artist
// has approved this record."
//
// The tick means "I approve these terms", and the terms in that request are the
// NEW ones. The person editing has approved their own revision. The
// COUNTERPARTY is the one who has not seen it.

import { describe, expect, it, vi, beforeEach } from "vitest";

const { fromMock, authMock } = vi.hoisted(() => ({ fromMock: vi.fn(), authMock: vi.fn() }));

vi.mock("@/lib/api-auth", () => ({ getAuthenticatedUser: authMock }));
vi.mock("@/lib/supabase-admin", () => ({ getSupabaseAdmin: () => ({ from: fromMock }) }));
vi.mock("@/lib/email/send", () => ({ sendEmail: vi.fn(async () => ({ ok: true })) }));
vi.mock("@/lib/notifications", () => ({ createNotification: vi.fn(async () => {}) }));

import { PUT } from "./route";

const ARTIST = "u-artist";
const VENUE = "u-venue";

const PLACEMENT = {
  id: "pl-1",
  artist_user_id: ARTIST,
  venue_user_id: VENUE,
  artist_slug: "alice",
  venue_slug: "kings-arms",
  venue: "Kings Arms",
  work_title: "Sunset",
  status: "active",
};

/** The row handed to placement_records.upsert. */
let upserted: Record<string, unknown> | null = null;

function setupDb(existing: Record<string, unknown> | null) {
  upserted = null;
  fromMock.mockImplementation((table: string) => {
    if (table === "placements") {
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({ data: PLACEMENT, error: null }),
            maybeSingle: async () => ({ data: PLACEMENT, error: null }),
          }),
        }),
      };
    }
    if (table === "placement_records") {
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: existing, error: null }) }) }),
        // The route updates an existing record and inserts a new one; both
        // land here so the assertions read one variable either way.
        update: (row: Record<string, unknown>) => {
          upserted = row;
          return { eq: async () => ({ error: null }) };
        },
        insert: async (row: Record<string, unknown>) => {
          upserted = row;
          return { error: null };
        },
      };
    }
    return {
      select: () => ({
        eq: () => ({
          single: async () => ({ data: null, error: null }),
          maybeSingle: async () => ({ data: null, error: null }),
        }),
      }),
      insert: async () => ({ error: null }),
      upsert: async () => ({ error: null }),
      update: () => ({ eq: async () => ({ error: null }) }),
    };
  });
}

const EXISTING = {
  id: "rec-1",
  placement_id: "pl-1",
  record_type: "consignment",
  agreed_value_gbp: 500,
  venue_approved: true,
  venue_approved_at: "2026-08-01T00:00:00.000Z",
  artist_approved: false,
  artist_approved_at: null,
};

function put(body: Record<string, unknown>) {
  return PUT(
    new Request("http://localhost/api/placements/pl-1/record", {
      method: "PUT",
      headers: { authorization: "Bearer x", "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: "pl-1" }) },
  );
}

beforeEach(() => {
  fromMock.mockReset();
  authMock.mockReset();
  authMock.mockResolvedValue({ user: { id: ARTIST, email: "a@x.com" }, error: null });
  setupDb(EXISTING);
});

describe("PUT record: editing and approving in one save (row 2197)", () => {
  it("keeps the tick the editor made in the same request", async () => {
    const res = await put({ agreedValueGbp: 750, artistApproved: true });

    expect(res.status).toBe(200);
    expect(upserted).toMatchObject({ artist_approved: true });
    expect(upserted!.artist_approved_at).toEqual(expect.any(String));
  });

  it("still clears the COUNTERPARTY's approval, which is the point of the reset", async () => {
    await put({ agreedValueGbp: 750, artistApproved: true });

    expect(upserted).toMatchObject({ venue_approved: false, venue_approved_at: null });
  });

  it("clears both when the editor did not tick their own box", async () => {
    await put({ agreedValueGbp: 750 });

    expect(upserted).toMatchObject({
      venue_approved: false,
      venue_approved_at: null,
      artist_approved: false,
      artist_approved_at: null,
    });
  });

  it("honours an explicit UN-tick alongside an edit", async () => {
    await put({ agreedValueGbp: 750, artistApproved: false });

    expect(upserted).toMatchObject({ artist_approved: false, artist_approved_at: null });
  });

  it("resets nothing when only the approval was ticked", async () => {
    // Approving is not a content change, so the other party keeps their tick.
    await put({ artistApproved: true });

    expect(upserted).toMatchObject({ artist_approved: true });
    expect(upserted).not.toHaveProperty("venue_approved", false);
  });
});
