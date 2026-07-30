// row 19 #8. The artist enrichment selected artist_profiles.image, which does not
// exist (the column is profile_image). PostgREST rejects a select naming a missing
// column, so the WHOLE artist block (name/slug/image) came back null on the
// placement detail page and the "from <artist>" attribution never rendered.
//
// The route now selects `image:profile_image` (aliased so the response keeps its
// `artist.image` shape). This test models PostgREST's rejection faithfully — a naive
// mock that ignores the select string would mask the bug — so it fails before the
// fix (artist null) and passes after.

import { describe, expect, it, vi, beforeEach } from "vitest";

const { fromMock, authMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  authMock: vi.fn(),
}));

vi.mock("@/lib/supabase-admin", () => ({ getSupabaseAdmin: () => ({ from: fromMock }) }));
vi.mock("@/lib/api-auth", () => ({ getAuthenticatedUser: authMock }));

import { GET } from "./route";

// Real columns of artist_profiles that this route may select (schema-columns.json).
// Deliberately excludes `image` — that is the phantom this test guards against.
const ARTIST_PROFILE_COLUMNS = new Set(["id", "user_id", "slug", "name", "profile_image", "banner_image"]);

/** The first plain column token the schema lacks, or null. Mirrors the guard: alias
 *  tokens (`a:b`), casts and embeds are not "column X" claims, so they are skipped. */
function phantomIn(cols: string, known: Set<string>): string | null {
  for (const raw of cols.split(",")) {
    const t = raw.trim();
    if (!/^[a-z_][a-z0-9_]*$/.test(t)) continue;
    if (!known.has(t)) return t;
  }
  return null;
}

// Artist party on the placement, so the authz check passes. venue_user_id is null so
// the venue_profiles branch short-circuits and needs no mock.
const PLACEMENT = { id: "pl1", artist_user_id: "u-artist", venue_user_id: null, requester_user_id: null };

function ctx(id = "pl1") {
  return { params: Promise.resolve({ id }) };
}

function setupDb(artistRow: Record<string, unknown> | null) {
  fromMock.mockImplementation((table: string) => {
    if (table === "placements") {
      return { select: () => ({ eq: () => ({ single: async () => ({ data: PLACEMENT, error: null }) }) }) };
    }
    if (table === "orders") {
      return { select: () => ({ eq: async () => ({ data: [] }) }) };
    }
    if (table === "placement_records") {
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) };
    }
    if (table === "placement_photos") {
      return { select: () => ({ eq: () => ({ order: async () => ({ data: [] }) }) }) };
    }
    if (table === "artist_profiles") {
      return {
        select: (cols: string) => ({
          eq: () => ({
            single: async () => {
              // Simulate PostgREST: reject the whole query if the select names a
              // column the table does not have.
              const phantom = phantomIn(cols, ARTIST_PROFILE_COLUMNS);
              if (phantom) {
                return { data: null, error: { message: `column artist_profiles.${phantom} does not exist` } };
              }
              return { data: artistRow, error: null };
            },
          }),
        }),
      };
    }
    if (table === "messages" || table === "placement_record_versions") {
      return { select: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: [] }) }) }) }) };
    }
    return { select: () => ({ eq: () => ({ single: async () => ({ data: null }), maybeSingle: async () => ({ data: null }) }) }) };
  });
}

beforeEach(() => {
  fromMock.mockReset();
  authMock.mockReset();
  authMock.mockResolvedValue({ user: { id: "u-artist" }, error: null });
});

describe("GET /api/placements/[id] — artist enrichment (row 19 #8)", () => {
  it("surfaces the artist image from profile_image (aliased), not the phantom image column", async () => {
    // With the alias, PostgREST returns profile_image's value under the key `image`.
    setupDb({ name: "Alice", slug: "alice", image: "https://cdn/alice.jpg" });
    const res = await GET(new Request("http://localhost/api/placements/pl1"), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    // Fail-before: the old select named artist_profiles.image (absent), so PostgREST
    // rejected the whole query and the entire artist block came back null.
    expect(body.artist).toMatchObject({ name: "Alice", slug: "alice", image: "https://cdn/alice.jpg" });
  });
});
