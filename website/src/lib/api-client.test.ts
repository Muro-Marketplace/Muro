// 05 §1.1. The typed write primitive. authFetch never threw on a non-2xx and let a
// getSession rejection escape untyped (the "save fired zero requests, no error"
// symptom, bug 12). mutate() closes both: a write can only be reported as
// successful when the server actually confirmed a 2xx.

import { describe, expect, it, vi, beforeEach } from "vitest";

const { getSessionMock } = vi.hoisted(() => ({ getSessionMock: vi.fn() }));

vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession: getSessionMock } },
}));

import {
  ApiError,
  NetworkError,
  apiErrorMessage,
  authFetch,
  isTransient,
  mutate,
} from "./api-client";

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

// Production pass 2 named the pattern: five refusals returned a correct,
// well-worded error that the UI never showed, so the user saw a button that did
// nothing. This is the one place the message is unpacked, so the five surfaces
// cannot each get it subtly wrong.
describe("apiErrorMessage", () => {
  const payloadError = (status: number, payload: unknown) =>
    new ApiError(
      status,
      typeof (payload as { error?: unknown })?.error === "string"
        ? ((payload as { error: string }).error)
        : `Request failed (${status})`,
      typeof (payload as { error?: unknown })?.error === "string"
        ? ((payload as { error: string }).error)
        : null,
      payload,
    );

  it("uses the server's own sentence", () => {
    const err = payloadError(400, { error: "Install date can't be in the past." });
    expect(apiErrorMessage(err, "fallback")).toBe("Install date can't be in the past.");
  });

  it("prefers the specific issues array over the generic headline", () => {
    // The blog submit answers `422 {"error":"Not ready for review","issues":[…]}`.
    // "Not ready for review" tells the author nothing they can act on.
    const err = payloadError(422, {
      error: "Not ready for review",
      issues: ["Body needs at least 200 characters before submitting."],
    });
    expect(apiErrorMessage(err, "fallback")).toBe(
      "Body needs at least 200 characters before submitting.",
    );
  });

  it("joins multiple issues", () => {
    const err = payloadError(422, { error: "Not ready", issues: ["A.", "B."] });
    expect(apiErrorMessage(err, "fallback")).toBe("A. B.");
  });

  it("ignores an issues array that carries nothing useful", () => {
    const err = payloadError(422, { error: "Not ready for review", issues: ["", "   "] });
    expect(apiErrorMessage(err, "fallback")).toBe("Not ready for review");
  });

  it("says the network failed rather than blaming the input", () => {
    expect(apiErrorMessage(new NetworkError("offline"), "fallback")).toBe(
      "Network error. Please try again.",
    );
  });

  it("falls back for anything that is not an API failure", () => {
    expect(apiErrorMessage(new Error("boom"), "Could not save")).toBe("Could not save");
    expect(apiErrorMessage(undefined, "Could not save")).toBe("Could not save");
  });
});
