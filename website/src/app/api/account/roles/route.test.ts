// Pass 2 item 3.9 (rows 2571, 2585). Pass 1 recorded "no email holds two
// roles", so the portal switcher never rendering was put down to account state.
// Two do:
//
//   finbin1@hotmail.co.uk    artist_profiles fin-coles + venue_profiles fin-coles
//   fcoles2598@gmail.com     artist_profiles finlay-coles + venue_profiles finlay
//
// GET /api/account/roles answered `{"roles":["artist"]}` for the first, because
// it only ever looked at `user_metadata.user_type` across the auth.users rows
// sharing the email. Both of those profiles sit on ONE auth user, so there is
// one metadata value and one role. The venue profile was unreachable: the
// switcher had nothing to offer and /venue-portal redirected the account away.
//
// The designed shape is one auth account per role, sharing an email. This one
// is not that, and the fix is not to pretend it is: it is to stop the product
// lying about what an account owns. Profile ownership is also a STRONGER
// authority than user_metadata, which a user can write to themselves.

import { describe, expect, it, vi, beforeEach } from "vitest";

const { fromMock, authMock, findAllMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  authMock: vi.fn(),
  findAllMock: vi.fn(),
}));

vi.mock("@/lib/api-auth", () => ({ getAuthenticatedUser: authMock }));
vi.mock("@/lib/supabase-admin", () => ({ getSupabaseAdmin: () => ({ from: fromMock }) }));
vi.mock("@/lib/auth/find-user-by-email", () => ({ findAllUsersByEmail: findAllMock }));

import { GET } from "./route";

/** Which profile tables return a row for this user. */
function setupProfiles(opts: { artist?: boolean; venue?: boolean; customer?: boolean } = {}) {
  fromMock.mockImplementation((table: string) => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => {
          if (table === "artist_profiles") return { data: opts.artist ? { id: "ap-1" } : null };
          if (table === "venue_profiles") return { data: opts.venue ? { id: "vp-1" } : null };
          if (table === "customer_profiles") return { data: opts.customer ? { id: "cp-1" } : null };
          return { data: null };
        },
      }),
    }),
  }));
}

function req() {
  return new Request("http://localhost/api/account/roles", {
    headers: { authorization: "Bearer x" },
  });
}

beforeEach(() => {
  fromMock.mockReset();
  authMock.mockReset();
  findAllMock.mockReset();
  authMock.mockResolvedValue({
    user: { id: "u-1", email: "finbin1@hotmail.co.uk", user_metadata: { user_type: "artist" } },
    error: null,
  });
  findAllMock.mockResolvedValue([{ id: "u-1", user_metadata: { user_type: "artist" } }]);
  setupProfiles({ artist: true });
});

describe("GET /api/account/roles", () => {
  it("reports a venue profile the same account owns", async () => {
    setupProfiles({ artist: true, venue: true });

    const body = await (await GET(req())).json();

    expect(body.roles).toEqual(expect.arrayContaining(["artist", "venue"]));
  });

  it("names which of those the account can enter WITHOUT switching accounts", async () => {
    setupProfiles({ artist: true, venue: true });

    const body = await (await GET(req())).json();

    expect(body.ownRoles).toEqual(expect.arrayContaining(["artist", "venue"]));
  });

  it("still reports a sibling account's role, which is the designed shape", async () => {
    // One auth user per role, sharing an email. The venue role lives on the
    // OTHER account, so it is offered but is not an ownRole.
    findAllMock.mockResolvedValue([
      { id: "u-1", user_metadata: { user_type: "artist" } },
      { id: "u-2", user_metadata: { user_type: "venue" } },
    ]);
    setupProfiles({ artist: true });

    const body = await (await GET(req())).json();

    expect(body.roles).toEqual(expect.arrayContaining(["artist", "venue"]));
    expect(body.ownRoles).toEqual(["artist"]);
  });

  it("does not invent a role from a profile that does not exist", async () => {
    setupProfiles({ artist: true });

    const body = await (await GET(req())).json();

    expect(body.roles).toEqual(["artist"]);
    expect(body.ownRoles).toEqual(["artist"]);
  });

  it("answers empty rather than 500ing the header dropdown when the lookup throws", async () => {
    findAllMock.mockRejectedValue(new Error("gotrue down"));
    fromMock.mockImplementation(() => {
      throw new Error("db down");
    });

    const res = await GET(req());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ roles: [], ownRoles: [] });
  });
});
