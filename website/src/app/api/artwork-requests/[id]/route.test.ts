// E17: GET /api/artwork-requests/[id] had no authentication. It returned the
// whole request row (description, budget_min_pence, budget_max_pence, location,
// invited_artist_slugs, venue_user_id) AND every response, so anyone could read a
// private brief plus every rival artist's terms before submitting their own.
//
// authz.ts's assertCanViewArtworkRequest is mocked here: its own visibility logic
// has 34 tests in authz.test.ts. What this file checks is that the route calls the
// gate at all, honours its denial, and fans the response set out by role.

import { describe, it, expect, vi, beforeEach } from "vitest";

const { authMock, gateMock, adminMock, recorded } = vi.hoisted(() => ({
  authMock: vi.fn(),
  gateMock: vi.fn(),
  adminMock: vi.fn(),
  recorded: [] as { table: string; filters: Record<string, unknown> }[],
}));

vi.mock("@/lib/api-auth", () => ({ getAuthenticatedUser: authMock }));
vi.mock("@/lib/supabase-admin", () => ({ getSupabaseAdmin: adminMock }));
vi.mock("@/lib/authz", async () => {
  const actual = await vi.importActual<typeof import("@/lib/authz")>("@/lib/authz");
  return { ...actual, assertCanViewArtworkRequest: gateMock };
});

import { GET } from "./route";
import { AuthzError } from "@/lib/authz";

const VENUE_USER = { id: "venue-1", email: "kettle@example.com" };
const ARTIST_USER = { id: "artist-1", email: "maya@example.com" };

const REQUEST_ROW = {
  id: "r1",
  venue_user_id: "venue-1",
  visibility: "semi_public",
  title: "Seeking large abstracts",
  description: "Private brief text",
  budget_min_pence: 50000,
  budget_max_pence: 150000,
  invited_artist_slugs: ["maya-chen", "someone-else"],
};

const ALL_RESPONSES = [
  { id: "resp-mine", request_id: "r1", artist_user_id: "artist-1", proposed_offer_amount_pence: 90000 },
  { id: "resp-rival", request_id: "r1", artist_user_id: "artist-9", proposed_offer_amount_pence: 70000 },
];

/** Records the filters applied per table so the response scoping can be asserted. */
function installDb() {
  recorded.length = 0;
  const chain = (table: string) => {
    const rec = { table, filters: {} as Record<string, unknown> };
    recorded.push(rec);
    const rows = () => {
      if (table === "artwork_request_responses") {
        const artist = rec.filters.artist_user_id;
        return artist ? ALL_RESPONSES.filter((r) => r.artist_user_id === artist) : ALL_RESPONSES;
      }
      if (table === "venue_profiles") return { name: "The Copper Kettle" };
      return REQUEST_ROW;
    };
    const obj: Record<string, unknown> = {
      select: () => obj,
      eq: (col: string, val: unknown) => {
        rec.filters[col] = val;
        return obj;
      },
      order: () => Promise.resolve({ data: rows(), error: null }),
      maybeSingle: () => Promise.resolve({ data: rows(), error: null }),
    };
    return obj;
  };
  adminMock.mockReturnValue({ from: (table: string) => chain(table) });
}

const responsesFilters = () =>
  recorded.find((r) => r.table === "artwork_request_responses")?.filters ?? {};

function get(): [Request, { params: Promise<{ id: string }> }] {
  return [
    new Request("http://localhost/api/artwork-requests/r1"),
    { params: Promise.resolve({ id: "r1" }) },
  ];
}

beforeEach(() => {
  authMock.mockReset();
  gateMock.mockReset();
  adminMock.mockReset();
  installDb();
});

describe("GET /api/artwork-requests/[id] (E17)", () => {
  it("returns 401 to an anonymous caller and never reaches the gate", async () => {
    authMock.mockResolvedValue({ user: null, error: new Response(null, { status: 401 }) });
    const res = await GET(...get());
    expect(res.status).toBe(401);
    expect(gateMock).not.toHaveBeenCalled();
  });

  it("returns the gate's 404 for an artist who may not view the brief", async () => {
    authMock.mockResolvedValue({ user: ARTIST_USER, error: null });
    gateMock.mockRejectedValue(
      new AuthzError(404, "artwork_request_not_found", "Artwork request not found."),
    );

    const res = await GET(...get());

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({ error: "artwork_request_not_found" });
  });

  it("gives the owning venue the full response set", async () => {
    authMock.mockResolvedValue({ user: VENUE_USER, error: null });
    gateMock.mockResolvedValue({ request: REQUEST_ROW, role: "owner" });

    const res = await GET(...get());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.responses).toHaveLength(2);
    expect(responsesFilters().artist_user_id, "the owner's query must not be narrowed").toBeUndefined();
  });

  it("shows a browsing artist only their own response, never a rival's (E18)", async () => {
    authMock.mockResolvedValue({ user: ARTIST_USER, error: null });
    gateMock.mockResolvedValue({ request: REQUEST_ROW, role: "browsing_artist" });

    const res = await GET(...get());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(responsesFilters().artist_user_id).toBe("artist-1");
    expect(body.responses).toHaveLength(1);
    expect(body.responses[0].id).toBe("resp-mine");
    // The rival's terms are the commercial advantage this closes.
    expect(JSON.stringify(body)).not.toContain("resp-rival");
    expect(JSON.stringify(body)).not.toContain("70000");
  });

  it("scopes an invited artist the same way", async () => {
    authMock.mockResolvedValue({ user: ARTIST_USER, error: null });
    gateMock.mockResolvedValue({ request: REQUEST_ROW, role: "invited_artist" });

    await GET(...get());

    expect(responsesFilters().artist_user_id).toBe("artist-1");
  });

  it("passes the caller and the id to the gate", async () => {
    authMock.mockResolvedValue({ user: ARTIST_USER, error: null });
    gateMock.mockResolvedValue({ request: REQUEST_ROW, role: "browsing_artist" });

    await GET(...get());

    expect(gateMock).toHaveBeenCalledOnce();
    expect(gateMock.mock.calls[0][0]).toEqual(ARTIST_USER);
    expect(gateMock.mock.calls[0][1]).toBe("r1");
  });
});
