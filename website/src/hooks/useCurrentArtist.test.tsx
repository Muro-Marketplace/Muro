// @vitest-environment jsdom
// The hook hands out a sessionStorage snapshot first so a portal page mounts
// without a cold fetch, and the portfolio page seeds its works from the first
// value it gets. So the snapshot must be gone after this tab's own writes
// (mutate() clears it) and a refresh that was already in flight when a write
// landed must not put the pre-write copy back. Owner report, 5 September
// 2026: an artist cleared a work's quantity to unlimited, came back to the
// portfolio and found the old 0 still there.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { Artist } from "@/data/artists";

// One stable user object: the hook keys its effect on `user`, so a fresh object
// per render would re-run the load on every render and never settle.
const { authFetchMock, USER } = vi.hoisted(() => ({ authFetchMock: vi.fn(), USER: { id: "u1" } }));
vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ user: USER, loading: false }),
}));
vi.mock("@/lib/api-client", () => ({ authFetch: authFetchMock }));

import { useCurrentArtist } from "./useCurrentArtist";
import {
  clearCurrentArtistCache,
  readCurrentArtistCache,
  writeCurrentArtistCache,
} from "@/lib/current-artist-cache";

const profile = { id: "p1", slug: "alice", name: "Alice" } as never;
const dbWork = (quantity_available: number | null) =>
  ({ id: "w1", title: "Vietnamese Village", image: "x.png", pricing: [], available: true, quantity_available }) as never;
const serverResponds = (works: unknown[]) =>
  authFetchMock.mockResolvedValue(new Response(JSON.stringify({ profile, works }), { status: 200 }));

/** Every non-null artist the hook handed out, in order. The portfolio seeds from the first. */
function mountAndCollect() {
  const seen: Artist[] = [];
  const hook = renderHook(() => {
    const r = useCurrentArtist();
    if (r.artist) seen.push(r.artist);
    return r;
  });
  return { hook, seen };
}

beforeEach(() => {
  sessionStorage.clear();
  authFetchMock.mockReset();
});

describe("useCurrentArtist and its per-tab snapshot", () => {
  it("seeds from the snapshot, then refreshes from the server and re-caches", async () => {
    writeCurrentArtistCache("u1", { profile, works: [dbWork(0)] });
    serverResponds([dbWork(null)]);
    const { hook, seen } = mountAndCollect();
    await waitFor(() => expect(hook.result.current.artist?.works[0].quantityAvailable).toBeUndefined());
    expect(seen[0].works[0].quantityAvailable).toBe(0);
    expect(readCurrentArtistCache("u1")?.works).toEqual([dbWork(null)]);
  });

  it("after a write cleared the snapshot, the first value handed out is the server's", async () => {
    writeCurrentArtistCache("u1", { profile, works: [dbWork(0)] });
    clearCurrentArtistCache(); // what mutate() does once the save is confirmed
    serverResponds([dbWork(null)]);
    const { hook, seen } = mountAndCollect();
    await waitFor(() => expect(hook.result.current.artist).not.toBeNull());
    expect(seen[0].works[0].quantityAvailable).toBeUndefined();
    expect(hook.result.current.loading).toBe(false);
    expect(hook.result.current.profileId).toBe("p1");
  });

  it("a refresh in flight when a write landed does not put the pre-write snapshot back", async () => {
    writeCurrentArtistCache("u1", { profile, works: [dbWork(0)] });
    let resolveFetch!: (r: Response) => void;
    authFetchMock.mockReturnValue(new Promise<Response>((res) => { resolveFetch = res; }));
    const { hook } = mountAndCollect();
    await waitFor(() => expect(hook.result.current.artist).not.toBeNull());

    clearCurrentArtistCache(); // a save confirmed while the GET was still out
    await act(async () => {
      resolveFetch(new Response(JSON.stringify({ profile, works: [dbWork(0)] }), { status: 200 }));
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(readCurrentArtistCache("u1")).toBeNull();
  });
});
