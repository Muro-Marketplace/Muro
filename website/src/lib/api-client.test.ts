// 05 §1.1. The typed write primitive. authFetch never threw on a non-2xx and let a
// getSession rejection escape untyped (the "save fired zero requests, no error"
// symptom, bug 12). mutate() closes both: a write can only be reported as
// successful when the server actually confirmed a 2xx.

import { describe, expect, it, vi, beforeEach } from "vitest";

const { getSessionMock } = vi.hoisted(() => ({ getSessionMock: vi.fn() }));

vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession: getSessionMock } },
}));

import { mutate, authFetch, ApiError, NetworkError, isTransient } from "./api-client";

beforeEach(() => {
  vi.restoreAllMocks();
  getSessionMock.mockReset();
  getSessionMock.mockResolvedValue({ data: { session: { access_token: "tok" } } });
});

describe("mutate() reports success only when the server confirms it (05 §1.1)", () => {
  it("returns the parsed body on a 2xx", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true, blog: { id: "b1" } }), { status: 200 }),
    );
    const out = await mutate<{ ok: boolean; blog: { id: string } }>("/api/x", { method: "POST", body: "{}" });
    expect(out).toEqual({ ok: true, blog: { id: "b1" } });
  });

  it("throws ApiError carrying status + code on a non-2xx (the false-success bug)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "post_limit_reached" }), { status: 403 }),
    );
    await expect(mutate("/api/x", { method: "POST", body: "{}" })).rejects.toMatchObject({
      name: "ApiError",
      status: 403,
      code: "post_limit_reached",
    });
  });

  it("throws NetworkError when the request never lands", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(mutate("/api/x", { method: "POST", body: "{}" })).rejects.toBeInstanceOf(NetworkError);
  });

  it("throws NetworkError before any fetch when the session cannot be read (bug 12 zero-requests)", async () => {
    getSessionMock.mockRejectedValue(new Error("auth host unreachable"));
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    await expect(mutate("/api/x", { method: "POST", body: "{}" })).rejects.toBeInstanceOf(NetworkError);
    // The whole point: no request went out, so a silent "saved" is impossible.
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("authFetch() stays read-only but no longer leaks a session rejection (05 §1.1)", () => {
  it("wraps a getSession rejection as NetworkError instead of letting it escape untyped", async () => {
    getSessionMock.mockRejectedValue(new Error("expired"));
    await expect(authFetch("/api/x")).rejects.toBeInstanceOf(NetworkError);
  });

  it("returns the raw Response on a non-2xx without throwing (callers check res.ok)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 500 }));
    const res = await authFetch("/api/x");
    expect(res.ok).toBe(false);
    expect(res.status).toBe(500);
  });
});

describe("isTransient() (05 §1.1)", () => {
  it("treats NetworkError and 5xx ApiError as transient, 4xx as terminal", () => {
    expect(isTransient(new NetworkError("x"))).toBe(true);
    expect(isTransient(new ApiError(500, "x", null, null))).toBe(true);
    expect(isTransient(new ApiError(403, "x", "post_limit_reached", null))).toBe(false);
    expect(isTransient(new Error("plain"))).toBe(false);
  });
});
