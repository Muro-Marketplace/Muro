// @vitest-environment jsdom
// The per-tab snapshot useCurrentArtist seeds a portal page from. It has to be
// dropped by this tab's own confirmed writes: the portfolio seeds its works
// from the first value the hook hands out, so a snapshot taken before a save
// shows the artist the pre-save copy for up to five minutes (owner report,
// 5 September 2026: quantity 0 to blank "did not save").

import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSessionMock } = vi.hoisted(() => ({ getSessionMock: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { auth: { getSession: getSessionMock } } }));

import {
  CURRENT_ARTIST_CACHE_TTL_MS,
  clearCurrentArtistCache,
  currentArtistCacheGeneration,
  readCurrentArtistCache,
  writeCurrentArtistCache,
} from "./current-artist-cache";
import { mutate } from "./api-client";

const profile = { id: "p1", slug: "alice", name: "Alice" } as never;
const works = (quantity: number | null) => [{ id: "w1", quantity_available: quantity }] as never;

beforeEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
  getSessionMock.mockReset();
  getSessionMock.mockResolvedValue({ data: { session: { access_token: "tok" } } });
});

describe("current artist cache", () => {
  it("round-trips a snapshot for the user that wrote it", () => {
    writeCurrentArtistCache("u1", { profile, works: works(0) });
    expect(readCurrentArtistCache("u1")?.works).toEqual(works(0));
    expect(readCurrentArtistCache("u2")).toBeNull();
  });

  it("expires after the TTL", () => {
    writeCurrentArtistCache("u1", { profile, works: works(0) });
    expect(readCurrentArtistCache("u1", Date.now() + CURRENT_ARTIST_CACHE_TTL_MS + 1)).toBeNull();
  });

  it("ignores an entry it cannot parse", () => {
    sessionStorage.setItem("wallplace-artist-u1", "{not json");
    expect(readCurrentArtistCache("u1")).toBeNull();
  });

  it("clear drops every artist snapshot, leaves other keys alone and bumps the generation", () => {
    writeCurrentArtistCache("u1", { profile, works: works(0) });
    writeCurrentArtistCache("u2", { profile, works: works(1) });
    sessionStorage.setItem("unrelated", "keep");
    const before = currentArtistCacheGeneration();
    clearCurrentArtistCache();
    expect(readCurrentArtistCache("u1")).toBeNull();
    expect(readCurrentArtistCache("u2")).toBeNull();
    expect(sessionStorage.getItem("unrelated")).toBe("keep");
    expect(currentArtistCacheGeneration()).toBeGreaterThan(before);
  });
});

describe("mutate() drops the snapshot on a confirmed write", () => {
  it("clears it on a 2xx", async () => {
    writeCurrentArtistCache("u1", { profile, works: works(0) });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    await mutate("/api/artist-works", { method: "POST", body: "{}" });
    expect(readCurrentArtistCache("u1")).toBeNull();
  });

  it("keeps it when the server refuses the write", async () => {
    writeCurrentArtistCache("u1", { profile, works: works(0) });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "post_limit_reached" }), { status: 403 }),
    );
    await expect(mutate("/api/artist-works", { method: "POST", body: "{}" })).rejects.toBeTruthy();
    expect(readCurrentArtistCache("u1")?.works).toEqual(works(0));
  });
});
