// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { saveQrContext, readQrContext, clearQrContext } from "./qr-context";

// Node 25 ships a partial native Storage that jsdom defers to; it
// exposes the property but not all the Storage methods. Override
// window.localStorage with a complete in-memory shim so our tests can
// exercise the real save/read/expire paths without depending on the
// host's mood.
function installMemoryStorage(): void {
  let store: Record<string, string> = {};
  const memory: Storage = {
    get length() { return Object.keys(store).length; },
    clear: () => { store = {}; },
    getItem: (k: string) => (k in store ? store[k] : null),
    key: (i: number) => Object.keys(store)[i] ?? null,
    removeItem: (k: string) => { delete store[k]; },
    setItem: (k: string, v: string) => { store[k] = String(v); },
  };
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: memory,
  });
}

describe("qr-context", () => {
  beforeEach(() => {
    installMemoryStorage();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("round-trips a saved context", () => {
    saveQrContext({ venueSlug: "copper-kettle", venueName: "Copper Kettle", source: "qr" });
    const ctx = readQrContext();
    expect(ctx).not.toBeNull();
    expect(ctx!.venueSlug).toBe("copper-kettle");
    expect(ctx!.venueName).toBe("Copper Kettle");
    expect(ctx!.source).toBe("qr");
  });

  it("returns null when nothing is stored", () => {
    expect(readQrContext()).toBeNull();
  });

  it("treats an expired entry as null and evicts it", () => {
    saveQrContext({ venueSlug: "copper-kettle", source: "qr" });
    expect(readQrContext()).not.toBeNull();
    // Walk past the 24h TTL.
    vi.setSystemTime(new Date("2026-05-16T13:00:00Z"));
    expect(readQrContext()).toBeNull();
    // And the row should be gone, not just shadowed.
    expect(window.localStorage.getItem("wallplace:qr-context")).toBeNull();
  });

  it("ignores junk in localStorage without throwing", () => {
    window.localStorage.setItem("wallplace:qr-context", "{not-json");
    expect(readQrContext()).toBeNull();
  });

  it("ignores rows missing a venueSlug, the field that drives the payout", () => {
    window.localStorage.setItem(
      "wallplace:qr-context",
      JSON.stringify({ venueName: "Copper Kettle", source: "qr", ts: Date.now() }),
    );
    expect(readQrContext()).toBeNull();
  });

  it("clearQrContext removes the row", () => {
    saveQrContext({ venueSlug: "copper-kettle", source: "qr" });
    clearQrContext();
    expect(readQrContext()).toBeNull();
  });
});
