// The bus exists to break an import cycle: api-client -> portal-get ->
// api-client, which resolved to `authFetch === undefined` inside portal-get
// whenever a test loaded the real api-client. Both sides depend on this
// instead, and neither on the other.
import { describe, it, expect, vi } from "vitest";
import { invalidateCaches, onCacheInvalidate, registeredCacheCount } from "./cache-bus";

describe("cache bus", () => {
  it("calls every registered clear", () => {
    const a = vi.fn();
    const b = vi.fn();
    onCacheInvalidate(a);
    onCacheInvalidate(b);
    invalidateCaches();
    expect(a).toHaveBeenCalledOnce();
    expect(b).toHaveBeenCalledOnce();
  });

  it("keeps going when one clear throws, so the rest are still dropped", () => {
    // A half-invalidated set is precisely the state this exists to prevent.
    const boom = vi.fn(() => { throw new Error("nope"); });
    const after = vi.fn();
    onCacheInvalidate(boom);
    onCacheInvalidate(after);
    expect(() => invalidateCaches()).not.toThrow();
    expect(after).toHaveBeenCalled();
  });

  it("registers a given clear once, however many times it is announced", () => {
    const before = registeredCacheCount();
    const fn = vi.fn();
    onCacheInvalidate(fn);
    onCacheInvalidate(fn);
    expect(registeredCacheCount()).toBe(before + 1);
  });

  it("is safe to announce with nothing registered", () => {
    expect(() => invalidateCaches()).not.toThrow();
  });
});
