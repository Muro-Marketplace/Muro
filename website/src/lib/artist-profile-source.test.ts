// @vitest-environment jsdom
//
// The shared /api/artist-profile read. Four consumers used to call the endpoint
// independently, so the portal's first load sent four identical requests, each
// carrying the profile plus every artist_works row.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { authFetchMock } = vi.hoisted(() => ({ authFetchMock: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ authFetch: authFetchMock }));

import {
  fetchArtistProfileShared,
  peekArtistProfile,
  resetArtistProfileSharedForTests,
} from "./artist-profile-source";
import { clearCurrentArtistCache } from "./current-artist-cache";

const USER = "u-artist";
const PROFILE = { id: "p-1", user_id: USER, slug: "fin-coles" };

/** A response whose body resolves only when `release()` is called. */
function deferredResponse(body: unknown) {
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  return {
    release,
    res: { ok: true, status: 200, json: async () => { await gate; return body; } },
  };
}

afterEach(() => {
  resetArtistProfileSharedForTests();
  clearCurrentArtistCache();
});
beforeEach(() => {
  authFetchMock.mockReset();
  resetArtistProfileSharedForTests();
  clearCurrentArtistCache();
  sessionStorage.clear();
});

describe("fetchArtistProfileShared", () => {
  it("makes ONE request for concurrent callers", async () => {
    const { release, res } = deferredResponse({ profile: PROFILE, works: [{ id: "w1" }] });
    authFetchMock.mockResolvedValue(res);

    const all = Promise.all([
      fetchArtistProfileShared(USER),
      fetchArtistProfileShared(USER),
      fetchArtistProfileShared(USER),
      fetchArtistProfileShared(USER),
    ]);
    release();
    const results = await all;

    expect(authFetchMock).toHaveBeenCalledTimes(1);
    expect(results.map((r) => r.profile?.id)).toEqual(["p-1", "p-1", "p-1", "p-1"]);
  });

  it("fetches again on the next call once the first has settled", async () => {
    authFetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ profile: PROFILE, works: [] }) });
    await fetchArtistProfileShared(USER);
    await fetchArtistProfileShared(USER);
    expect(authFetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not share a request that was issued before a write landed", async () => {
    const first = deferredResponse({ profile: PROFILE, works: [] });
    authFetchMock.mockResolvedValueOnce(first.res);
    const stale = fetchArtistProfileShared(USER);

    // A confirmed write drops the snapshot and moves the generation.
    clearCurrentArtistCache();

    authFetchMock.mockResolvedValueOnce({
      ok: true, status: 200, json: async () => ({ profile: { ...PROFILE, slug: "after-write" }, works: [] }),
    });
    const fresh = await fetchArtistProfileShared(USER);

    first.release();
    await stale;

    expect(authFetchMock).toHaveBeenCalledTimes(2);
    expect(fresh.profile?.slug).toBe("after-write");
  });

  it("writes the snapshot so the next portal page starts warm", async () => {
    authFetchMock.mockResolvedValue({
      ok: true, status: 200, json: async () => ({ profile: PROFILE, works: [{ id: "w1" }] }),
    });
    await fetchArtistProfileShared(USER);
    expect(peekArtistProfile(USER)?.profile?.id).toBe("p-1");
    expect(peekArtistProfile(USER)?.works).toHaveLength(1);
  });

  it("does not write back over a snapshot a write cleared mid-flight", async () => {
    const { release, res } = deferredResponse({ profile: PROFILE, works: [] });
    authFetchMock.mockResolvedValue(res);
    const pending = fetchArtistProfileShared(USER);
    clearCurrentArtistCache();
    release();
    await pending;
    expect(peekArtistProfile(USER)).toBeNull();
  });

  it("rejects on a failed check rather than reporting 'no profile' (LA-C046)", async () => {
    authFetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    await expect(fetchArtistProfileShared(USER)).rejects.toThrow(/profile check failed \(500\)/);
  });

  it("resolves profile: null only when the server says there is none", async () => {
    authFetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ profile: null, works: [] }) });
    await expect(fetchArtistProfileShared(USER)).resolves.toEqual({ profile: null, works: [] });
  });

  it("propagates a network rejection", async () => {
    authFetchMock.mockRejectedValue(new Error("network down"));
    await expect(fetchArtistProfileShared(USER)).rejects.toThrow("network down");
  });
});
