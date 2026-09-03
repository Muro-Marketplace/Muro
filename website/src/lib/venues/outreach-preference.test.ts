import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const { findUsersByIdsMock } = vi.hoisted(() => ({ findUsersByIdsMock: vi.fn() }));
vi.mock("@/lib/auth/find-user-by-email", () => ({ findUsersByIds: findUsersByIdsMock }));
import {
  acceptsArtistOutreach,
  artistMayApproachVenue,
  venueAcceptsArtistOutreach,
  venueHasEngagedArtist,
  venueOutreachFlagsForUsers,
} from "./outreach-preference";

function fakeDb(opts: {
  user?: { id: string; user_metadata?: Record<string, unknown> } | null;
  userError?: unknown;
  users?: Array<{ id: string; user_metadata?: Record<string, unknown> }>;
  messages?: unknown[];
  placements?: unknown[];
  throwOnFrom?: boolean;
}) {
  const from = vi.fn((table: string) => {
    if (opts.throwOnFrom) throw new Error("boom");
    const rows = table === "messages" ? opts.messages ?? [] : opts.placements ?? [];
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "eq"]) chain[m] = () => chain;
    chain.limit = async () => ({ data: rows, error: null });
    return chain;
  });
  const db = {
    from,
    auth: {
      admin: {
        getUserById: vi.fn(async () => ({ data: { user: opts.user ?? null }, error: opts.userError ?? null })),
        listUsers: vi.fn(async () => ({ data: { users: opts.users ?? [] }, error: null })),
      },
    },
  };
  return { db: db as unknown as SupabaseClient, from };
}

describe("acceptsArtistOutreach", () => {
  it("is open unless the flag is explicitly false", () => {
    expect(acceptsArtistOutreach(null)).toBe(true);
    expect(acceptsArtistOutreach({ user_metadata: {} })).toBe(true);
    expect(acceptsArtistOutreach({ user_metadata: { accepts_artist_outreach: "no" } })).toBe(true);
    expect(acceptsArtistOutreach({ user_metadata: { accepts_artist_outreach: false } })).toBe(false);
  });
});

describe("venueAcceptsArtistOutreach", () => {
  it("reads the venue's user, and treats lookup trouble as open", async () => {
    expect(await venueAcceptsArtistOutreach(fakeDb({ user: { id: "v", user_metadata: { accepts_artist_outreach: false } } }).db, "v")).toBe(false);
    expect(await venueAcceptsArtistOutreach(fakeDb({ user: { id: "v", user_metadata: {} } }).db, "v")).toBe(true);
    expect(await venueAcceptsArtistOutreach(fakeDb({ user: null, userError: { message: "x" } }).db, "v")).toBe(true);
    expect(await venueAcceptsArtistOutreach(fakeDb({}).db, null)).toBe(true);
  });
});

describe("venueOutreachFlagsForUsers", () => {
  it("maps each requested user, defaulting to open for anyone not found or on failure", async () => {
    const { db } = fakeDb({});
    findUsersByIdsMock.mockResolvedValueOnce(
      new Map([
        ["a", { id: "a", user_metadata: { accepts_artist_outreach: false } }],
        ["b", { id: "b", user_metadata: {} }],
      ]),
    );
    expect(await venueOutreachFlagsForUsers(db, ["a", "b", "c"])).toEqual({ a: false, b: true, c: true });
    expect(await venueOutreachFlagsForUsers(db, [])).toEqual({});
    expect(findUsersByIdsMock).toHaveBeenCalledTimes(1);
    findUsersByIdsMock.mockRejectedValueOnce(new Error("boom"));
    expect(await venueOutreachFlagsForUsers(db, ["a"])).toEqual({ a: true });
  });
});

describe("venueHasEngagedArtist / artistMayApproachVenue", () => {
  const who = { venueSlug: "kettle", venueUserId: "v", artistSlug: "maya", artistUserId: "a" };

  it("counts a venue-sent message or an existing placement as engagement", async () => {
    expect(await venueHasEngagedArtist(fakeDb({ messages: [{ id: "m" }] }).db, who)).toBe(true);
    expect(await venueHasEngagedArtist(fakeDb({ placements: [{ id: "p" }] }).db, who)).toBe(true);
    expect(await venueHasEngagedArtist(fakeDb({}).db, who)).toBe(false);
    expect(await venueHasEngagedArtist(fakeDb({ throwOnFrom: true }).db, who)).toBe(false);
  });

  it("lets an artist approach an open venue, and an opted-out venue only after it engaged", async () => {
    const optedOut = { id: "v", user_metadata: { accepts_artist_outreach: false } };
    expect(await artistMayApproachVenue(fakeDb({ user: { id: "v", user_metadata: {} } }).db, who)).toBe(true);
    expect(await artistMayApproachVenue(fakeDb({ user: optedOut }).db, who)).toBe(false);
    expect(await artistMayApproachVenue(fakeDb({ user: optedOut, messages: [{ id: "m" }] }).db, who)).toBe(true);
  });
});
