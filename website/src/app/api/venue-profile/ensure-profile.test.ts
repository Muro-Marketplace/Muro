// E34 — venue takeover via a self-asserted `venue_slug`.
//
// `signup/venue/page.tsx` wrote `venue_slug` into user_metadata with the public
// anon key, so the string is chosen by whoever is signing up. `ensureVenueProfile`
// then treated that string as an ownership signal in two places:
//
//   1. adopt-by-slug: any authenticated user could claim an ownerless
//      venue_profiles row just by naming its slug in their own metadata;
//   2. the fallback INSERT used the same string as the new row's slug, so a
//      signup could pre-claim the canonical handle of a venue that had not
//      registered yet (`/venues/the-copper-kettle`, and every artist message,
//      placement and artwork request routed to it).
//
// (1) is latent in prod today — `venue_profiles.user_id` is NOT NULL and there
// are 0 orphan rows, so no row can ever match `.is("user_id", null)` — but it
// becomes live the moment that column is made nullable. (2) is live now.
//
// The email branch is the defensible one: `user.email` comes off the verified
// JWT. These tests pin that ownership comes only from a confirmed email, never
// from a slug.

import { describe, it, expect, vi, beforeEach } from "vitest";

const { authMock, adminMock, getProfileMock, upsertMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  adminMock: vi.fn(),
  getProfileMock: vi.fn(),
  upsertMock: vi.fn(),
}));

vi.mock("@/lib/api-auth", () => ({ getAuthenticatedUser: authMock }));
vi.mock("@/lib/supabase-admin", () => ({ getSupabaseAdmin: adminMock }));
vi.mock("@/lib/db/venue-profiles", () => ({
  getVenueProfileByUserId: getProfileMock,
  upsertVenueProfile: upsertMock,
}));

import { PATCH } from "./route";

type Row = Record<string, unknown>;

/**
 * Minimal in-memory stand-in for the service-role client, faithful on the two
 * things these tests turn on: `venue_profiles.slug` is UNIQUE (so the insert
 * suffix loop is exercised for real), and `.is("user_id", null)` only matches
 * rows whose user_id is actually null.
 */
function makeAdmin(seed: { venue_profiles?: Row[]; venue_registrations?: Row[] } = {}) {
  const tables: Record<string, Row[]> = {
    venue_profiles: (seed.venue_profiles ?? []).map((r) => ({ ...r })),
    venue_registrations: (seed.venue_registrations ?? []).map((r) => ({ ...r })),
  };
  const inserted: Row[] = [];

  function from(table: string) {
    const filters: ((r: Row) => boolean)[] = [];
    let orderKey: string | null = null;
    let orderAsc = true;
    let mode: "select" | "update" | "insert" = "select";
    let patch: Row = {};

    const matched = () => {
      let out = tables[table].filter((r) => filters.every((f) => f(r)));
      if (orderKey) {
        const k = orderKey;
        out = [...out].sort(
          (a, b) => String(a[k] ?? "").localeCompare(String(b[k] ?? "")) * (orderAsc ? 1 : -1),
        );
      }
      return out;
    };

    const settle = () => {
      if (mode === "update") {
        for (const r of matched()) Object.assign(r, patch);
      }
      return { data: null, error: null };
    };

    const api: Record<string, unknown> = {
      select: () => api,
      eq: (col: string, val: unknown) => {
        filters.push((r) => r[col] === val);
        return api;
      },
      is: (col: string, val: unknown) => {
        filters.push((r) => (r[col] ?? null) === val);
        return api;
      },
      ilike: (col: string, val: string) => {
        filters.push(
          (r) => String(r[col] ?? "").toLowerCase() === String(val).toLowerCase(),
        );
        return api;
      },
      order: (col: string, opts?: { ascending?: boolean }) => {
        orderKey = col;
        orderAsc = opts?.ascending !== false;
        return api;
      },
      limit: (n: number) => Promise.resolve({ data: matched().slice(0, n), error: null }),
      maybeSingle: () => Promise.resolve({ data: matched()[0] ?? null, error: null }),
      update: (p: Row) => {
        mode = "update";
        patch = p;
        return api;
      },
      insert: (row: Row) => {
        mode = "insert";
        // venue_profiles.slug is UNIQUE in prod.
        if (table === "venue_profiles" && tables[table].some((r) => r.slug === row.slug)) {
          return Promise.resolve({
            data: null,
            error: { code: "23505", message: "duplicate key value violates unique constraint" },
          });
        }
        const stored = { id: `gen-${tables[table].length + 1}`, ...row };
        tables[table].push(stored);
        inserted.push(stored);
        return Promise.resolve({ data: null, error: null });
      },
      then: (resolve: (v: unknown) => unknown) => Promise.resolve(settle()).then(resolve),
    };
    return api;
  }

  return { client: { from }, tables, inserted };
}

function patchReq(body: unknown): Request {
  return new Request("http://localhost/api/venue-profile", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

const CONFIRMED = "2026-01-01T00:00:00Z";

beforeEach(() => {
  authMock.mockReset();
  adminMock.mockReset();
  upsertMock.mockReset();
});

describe("E34: a self-asserted venue_slug is not an ownership signal", () => {
  it("does not adopt an orphan named only by the attacker's metadata slug", async () => {
    // The exploit: an ownerless row exists for the victim's venue. The attacker
    // signs up with `venue_slug: "the-copper-kettle"` in their own metadata and
    // has no email relationship to that row.
    const admin = makeAdmin({
      venue_profiles: [
        {
          id: "victim-row",
          slug: "the-copper-kettle",
          user_id: null,
          email: "owner@coppekettle.example",
        },
      ],
    });
    adminMock.mockReturnValue(admin.client);
    authMock.mockResolvedValue({
      user: {
        id: "attacker-1",
        email: "attacker@evil.example",
        email_confirmed_at: CONFIRMED,
        user_metadata: { venue_slug: "the-copper-kettle", display_name: "Attacker" },
      },
      error: null,
    });

    const res = await PATCH(patchReq({ ensureProfile: true }));
    const body = await res.json();

    expect(body.status, "adopted the victim's row off a self-asserted slug").not.toBe(
      "adopted_by_slug",
    );
    const victim = admin.tables.venue_profiles.find((r) => r.id === "victim-row");
    expect(victim!.user_id, "the orphan's ownership was transferred").toBe(null);
    expect(body.slug, "the attacker took the victim's canonical slug").not.toBe(
      "the-copper-kettle",
    );
  });

  it("does not use the metadata slug as the new row's slug either", async () => {
    // The live half: even with no orphan to adopt, the fallback INSERT used the
    // self-asserted string, letting a signup pre-claim the canonical handle of a
    // venue that has not registered yet.
    const admin = makeAdmin();
    adminMock.mockReturnValue(admin.client);
    authMock.mockResolvedValue({
      user: {
        id: "attacker-2",
        email: "attacker@evil.example",
        email_confirmed_at: CONFIRMED,
        user_metadata: { venue_slug: "the-copper-kettle", display_name: "Evil Pub" },
      },
      error: null,
    });

    const res = await PATCH(patchReq({ ensureProfile: true }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.slug).not.toBe("the-copper-kettle");
    expect(body.slug).toBe("evil-pub");
    expect(admin.inserted[0].slug).toBe("evil-pub");
  });

  it("falls back to a user-scoped slug when there is no usable display name", async () => {
    const admin = makeAdmin();
    adminMock.mockReturnValue(admin.client);
    authMock.mockResolvedValue({
      user: {
        id: "abcdef01-2345-6789-abcd-ef0123456789",
        email: "nobody@example.com",
        email_confirmed_at: CONFIRMED,
        user_metadata: { venue_slug: "the-copper-kettle", display_name: "  " },
      },
      error: null,
    });

    const body = await (await PATCH(patchReq({ ensureProfile: true }))).json();
    expect(body.slug).toBe("venue-abcdef01");
  });

  it("still suffixes on a slug collision so a user cannot be locked out", async () => {
    const admin = makeAdmin({
      venue_profiles: [{ id: "taken", slug: "evil-pub", user_id: "someone-else" }],
    });
    adminMock.mockReturnValue(admin.client);
    authMock.mockResolvedValue({
      user: {
        id: "user-9",
        email: "new@example.com",
        email_confirmed_at: CONFIRMED,
        user_metadata: { display_name: "Evil Pub" },
      },
      error: null,
    });

    const body = await (await PATCH(patchReq({ ensureProfile: true }))).json();
    expect(body.status).toBe("created");
    expect(body.slug).toBe("evil-pub-2");
  });
});

describe("E34: adoption by verified email", () => {
  it("adopts the orphan whose email matches the confirmed JWT email", async () => {
    const admin = makeAdmin({
      venue_profiles: [
        { id: "orphan-1", slug: "the-copper-kettle", user_id: null, email: "Owner@Kettle.example", created_at: "2026-01-01" },
      ],
    });
    adminMock.mockReturnValue(admin.client);
    authMock.mockResolvedValue({
      user: {
        id: "owner-1",
        email: "owner@kettle.example",
        email_confirmed_at: CONFIRMED,
        user_metadata: { display_name: "The Copper Kettle" },
      },
      error: null,
    });

    const body = await (await PATCH(patchReq({ ensureProfile: true }))).json();

    expect(body.status).toBe("adopted_by_email");
    expect(body.slug).toBe("the-copper-kettle");
    expect(admin.tables.venue_profiles[0].user_id).toBe("owner-1");
  });

  it("refuses to adopt when the email is not confirmed", async () => {
    // Without this, signing up as anyone@theirdomain and never clicking the
    // confirmation link is enough to take the row.
    const admin = makeAdmin({
      venue_profiles: [
        { id: "orphan-1", slug: "the-copper-kettle", user_id: null, email: "owner@kettle.example", created_at: "2026-01-01" },
      ],
    });
    adminMock.mockReturnValue(admin.client);
    authMock.mockResolvedValue({
      user: {
        id: "unconfirmed-1",
        email: "owner@kettle.example",
        email_confirmed_at: null,
        user_metadata: { display_name: "Squatter" },
      },
      error: null,
    });

    const body = await (await PATCH(patchReq({ ensureProfile: true }))).json();

    expect(body.status).not.toBe("adopted_by_email");
    expect(admin.tables.venue_profiles[0].user_id).toBe(null);
  });

  it("refuses to adopt when two orphans share the email, rather than picking the newest", async () => {
    const admin = makeAdmin({
      venue_profiles: [
        { id: "orphan-a", slug: "kettle-one", user_id: null, email: "ops@group.example", created_at: "2026-01-01" },
        { id: "orphan-b", slug: "kettle-two", user_id: null, email: "ops@group.example", created_at: "2026-02-01" },
      ],
    });
    adminMock.mockReturnValue(admin.client);
    authMock.mockResolvedValue({
      user: {
        id: "shared-1",
        email: "ops@group.example",
        email_confirmed_at: CONFIRMED,
        user_metadata: { display_name: "Group Ops" },
      },
      error: null,
    });

    const body = await (await PATCH(patchReq({ ensureProfile: true }))).json();

    expect(body.status).not.toBe("adopted_by_email");
    expect(admin.tables.venue_profiles.find((r) => r.id === "orphan-a")!.user_id).toBe(null);
    expect(admin.tables.venue_profiles.find((r) => r.id === "orphan-b")!.user_id).toBe(null);
  });

  it("returns the existing row untouched when the caller is already linked", async () => {
    const admin = makeAdmin({
      venue_profiles: [{ id: "mine", slug: "my-venue", user_id: "user-1" }],
    });
    adminMock.mockReturnValue(admin.client);
    authMock.mockResolvedValue({
      user: {
        id: "user-1",
        email: "me@example.com",
        email_confirmed_at: CONFIRMED,
        user_metadata: { venue_slug: "somebody-else", display_name: "Me" },
      },
      error: null,
    });

    const body = await (await PATCH(patchReq({ ensureProfile: true }))).json();
    expect(body.status).toBe("already_linked");
    expect(body.slug).toBe("my-venue");
    expect(admin.inserted).toHaveLength(0);
  });
});

describe("E34: the new row is hydrated from the venue's own registration", () => {
  it("copies registration details matched on the confirmed email", async () => {
    // register-venue no longer seeds an ownerless row (it could never insert one
    // — user_id is NOT NULL — and an ownerless row is exactly what the takeover
    // targets). The details still reach the profile, but keyed on a verified
    // fact instead.
    const admin = makeAdmin({
      venue_registrations: [
        {
          id: 1,
          email: "Owner@Kettle.example",
          venue_name: "The Copper Kettle",
          venue_type: "Cafe",
          contact_name: "Sam Reed",
          phone: "0123",
          city: "Hampton",
          postcode: "TW12 2TH",
          wall_space: "3m x 2m",
          created_at: "2026-01-01",
        },
      ],
    });
    adminMock.mockReturnValue(admin.client);
    authMock.mockResolvedValue({
      user: {
        id: "owner-2",
        email: "owner@kettle.example",
        email_confirmed_at: CONFIRMED,
        user_metadata: { venue_slug: "somebody-elses-venue", display_name: "Sam Reed" },
      },
      error: null,
    });

    const body = await (await PATCH(patchReq({ ensureProfile: true }))).json();

    expect(body.status).toBe("created");
    // Slug comes from the registered venue name, not the metadata slug.
    expect(body.slug).toBe("the-copper-kettle");
    expect(admin.inserted[0]).toMatchObject({
      user_id: "owner-2",
      slug: "the-copper-kettle",
      name: "The Copper Kettle",
      type: "Cafe",
      location: "Hampton",
      contact_name: "Sam Reed",
      phone: "0123",
      wall_space: "3m x 2m",
    });
  });

  it("ignores a registration when the caller's email is unconfirmed", async () => {
    const admin = makeAdmin({
      venue_registrations: [
        { id: 1, email: "owner@kettle.example", venue_name: "The Copper Kettle", created_at: "2026-01-01" },
      ],
    });
    adminMock.mockReturnValue(admin.client);
    authMock.mockResolvedValue({
      user: {
        id: "unconfirmed-2",
        email: "owner@kettle.example",
        email_confirmed_at: null,
        user_metadata: { display_name: "Squatter" },
      },
      error: null,
    });

    const body = await (await PATCH(patchReq({ ensureProfile: true }))).json();
    expect(body.slug).toBe("squatter");
    expect(admin.inserted[0].name).toBe("Squatter");
  });
});
