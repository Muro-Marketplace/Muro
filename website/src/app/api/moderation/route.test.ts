// Phase 2.6 audit follow-up. Locks the /api/moderation POST contract:
// validates entity_type, enforces rate limit, validates payload shape
// per type, writes to moderation_queue.

import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  withRateLimitMock,
  authMock,
  fromMock,
} = vi.hoisted(() => ({
  withRateLimitMock: vi.fn(),
  authMock: vi.fn(),
  fromMock: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  withRateLimit: withRateLimitMock,
  getIP: () => "1.2.3.4",
}));
vi.mock("@/lib/api-auth", () => ({ getAuthenticatedUser: authMock }));
vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({ from: fromMock }),
}));

import { POST } from "./route";

beforeEach(() => {
  withRateLimitMock.mockReset();
  authMock.mockReset();
  fromMock.mockReset();
  withRateLimitMock.mockResolvedValue(null); // allow by default
  authMock.mockResolvedValue({ user: null, error: null });
});

function chainInsertSelect(returned: unknown) {
  return {
    insert: () => ({
      select: () => ({
        maybeSingle: async () => ({ data: returned, error: null }),
      }),
    }),
  };
}

function req(body: unknown): Request {
  return new Request("http://localhost/api/moderation", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/moderation", () => {
  it("accepts a well-formed feature_request and returns the row id", async () => {
    fromMock.mockReturnValue(chainInsertSelect({ id: "mod_1" }));
    const res = await POST(
      req({
        entity_type: "feature_request",
        title: "Calendar sync",
        description: "Add iCal export so I can subscribe in Google Calendar.",
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.id).toBe("mod_1");
  });

  it("accepts a feedback row with a rating", async () => {
    fromMock.mockReturnValue(chainInsertSelect({ id: "mod_2" }));
    const res = await POST(
      req({
        entity_type: "feedback",
        message: "Loving the new placement panel",
        rating: 5,
      }),
    );
    expect(res.status).toBe(200);
  });

  it("rejects an unknown entity_type with 400", async () => {
    const res = await POST(
      req({ entity_type: "blog", title: "x", description: "y" }),
    );
    // blog is a known type but only feature_request + feedback are
    // accepted via this public endpoint (blogs go through the
    // authored editor + admin queue, not the bubble).
    expect(res.status).toBe(400);
  });

  it("rejects a too-short feedback message", async () => {
    const res = await POST(req({ entity_type: "feedback", message: "" }));
    expect(res.status).toBe(400);
  });

  it("rejects a feature_request missing description", async () => {
    const res = await POST(
      req({ entity_type: "feature_request", title: "Idea" }),
    );
    expect(res.status).toBe(400);
  });

  it("rate-limits when withRateLimit returns a 429 response", async () => {
    const { NextResponse } = await import("next/server");
    withRateLimitMock.mockResolvedValue(
      NextResponse.json({ error: "Too many" }, { status: 429 }),
    );
    const res = await POST(
      req({
        entity_type: "feedback",
        message: "Something",
      }),
    );
    expect(res.status).toBe(429);
    expect(fromMock).not.toHaveBeenCalled();
  });
});
