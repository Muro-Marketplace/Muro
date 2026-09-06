// @vitest-environment jsdom
//
// Portal pages start their data request when the page mounts, so the content
// area waits a full round trip after every click even now that the chrome
// survives the navigation. The sidebar starts the request on hover instead;
// this is what lets the click join it.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { authFetchMock } = vi.hoisted(() => ({ authFetchMock: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ authFetch: authFetchMock }));

import {
  FRESH_MS,
  clearPortalGetCache,
  portalGet,
  portalGetCacheSize,
  prefetchPortalGet,
} from "./portal-get";

function ok(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}
/** A response whose body resolves only when released. */
function deferred(body: unknown) {
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  return { release, res: { ok: true, status: 200, json: async () => { await gate; return body; } } };
}

afterEach(() => clearPortalGetCache());
beforeEach(() => {
  authFetchMock.mockReset();
  clearPortalGetCache();
});

describe("portalGet", () => {
  it("lets a click join the request the hover started", async () => {
    const { release, res } = deferred({ orders: [1] });
    authFetchMock.mockResolvedValue(res);

    prefetchPortalGet("/api/orders");     // hover
    const onClick = portalGet("/api/orders"); // click, moments later
    release();

    await expect(onClick).resolves.toEqual({ orders: [1] });
    expect(authFetchMock).toHaveBeenCalledTimes(1);
  });

  it("shares one request between concurrent callers of the same url", async () => {
    const { release, res } = deferred({ a: 1 });
    authFetchMock.mockResolvedValue(res);
    const all = Promise.all([portalGet("/api/x"), portalGet("/api/x"), portalGet("/api/x")]);
    release();
    await all;
    expect(authFetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps different urls apart", async () => {
    authFetchMock.mockResolvedValue(ok({}));
    await Promise.all([portalGet("/api/orders"), portalGet("/api/placements")]);
    expect(authFetchMock).toHaveBeenCalledTimes(2);
  });

  it("reuses a settled response only inside the hover-to-click window", async () => {
    vi.useFakeTimers();
    try {
      authFetchMock.mockResolvedValue(ok({ v: 1 }));
      await portalGet("/api/orders");

      // Still within the window: the click that follows a hover.
      vi.setSystemTime(Date.now() + FRESH_MS - 1);
      await portalGet("/api/orders");
      expect(authFetchMock).toHaveBeenCalledTimes(1);

      // Past it: this is a page visit, not a hover, and it must be fresh.
      vi.setSystemTime(Date.now() + 2);
      await portalGet("/api/orders");
      expect(authFetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("never replays a failure to the next caller, who is usually a retry", async () => {
    authFetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });
    await expect(portalGet("/api/orders")).rejects.toThrow(/failed \(500\)/);

    authFetchMock.mockResolvedValueOnce(ok({ orders: [] }));
    await expect(portalGet("/api/orders")).resolves.toEqual({ orders: [] });
    expect(authFetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects a non-2xx rather than handing back the error body as data", async () => {
    authFetchMock.mockResolvedValue({ ok: false, status: 403, json: async () => ({ error: "nope" }) });
    await expect(portalGet("/api/orders")).rejects.toThrow(/403/);
  });

  it("propagates a network rejection and forgets it", async () => {
    authFetchMock.mockRejectedValueOnce(new Error("offline"));
    await expect(portalGet("/api/orders")).rejects.toThrow("offline");
    expect(portalGetCacheSize()).toBe(0);
  });

  it("a confirmed write drops everything, so a save is never followed by a stale list", async () => {
    authFetchMock.mockResolvedValue(ok({ v: 1 }));
    await portalGet("/api/orders");
    clearPortalGetCache();
    await portalGet("/api/orders");
    expect(authFetchMock).toHaveBeenCalledTimes(2);
  });

  it("swallows a prefetch failure, since nothing is waiting on it", async () => {
    authFetchMock.mockRejectedValue(new Error("offline"));
    expect(() => prefetchPortalGet("/api/orders")).not.toThrow();
    await Promise.resolve();
  });
});
