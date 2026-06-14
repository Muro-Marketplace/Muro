import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/api-auth", () => ({
  getAuthenticatedUser: vi.fn(async () => ({
    user: { id: "v-1", email: "venue@x.com" },
    error: null,
  })),
}));

const fromMock = vi.fn();
vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({ from: fromMock }),
}));

import { GET } from "./route";

function makeRequest(range = "30d") {
  return new NextRequest(`http://localhost/api/analytics/venue?range=${range}`);
}

// Build a fromMock implementation that captures the .or() argument and
// returns empty events so downstream work/artist resolution is skipped.
function buildFromMock(venueName: string): { impl: ReturnType<typeof vi.fn>; getOr: () => string | undefined } {
  let capturedOr: string | undefined;

  const analyticsChain = {
    gte: () => analyticsChain,
    order: async () => ({ data: [], error: null }),
  };

  const orFn = (arg: string) => {
    capturedOr = arg;
    return analyticsChain;
  };

  const impl = vi.fn((table: string) => {
    if (table === "venue_profiles") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { user_id: "v-1", slug: "tate", name: venueName },
            }),
          }),
        }),
      };
    }

    if (table === "analytics_events") {
      return {
        select: () => ({
          eq: () => ({
            or: orFn,
          }),
        }),
      };
    }

    if (table === "placements") {
      return {
        select: () => ({
          eq: async () => ({ data: [] }),
        }),
      };
    }

    // Fallback for any unexpected table
    return {
      select: () => ({ eq: async () => ({ data: [] }) }),
    };
  });

  return { impl, getOr: () => capturedOr };
}

beforeEach(() => fromMock.mockReset());

describe("GET /api/analytics/venue injection guard", () => {
  it("drops a malicious venue_name term, leaving only the user_id term", async () => {
    const INJECTION = "x),or(venue_user_id.neq.0";
    const { impl, getOr } = buildFromMock(INJECTION);
    fromMock.mockImplementation(impl);

    const res = await GET(makeRequest());

    expect(res.status).toBe(200);
    // The injected name contains parens so orFilter must drop it; only the
    // user_id term should survive.
    expect(getOr()).toBe("venue_user_id.eq.v-1");
  });

  it("includes both terms when venue_name is safe", async () => {
    const { impl, getOr } = buildFromMock("TateModern");
    fromMock.mockImplementation(impl);

    const res = await GET(makeRequest());

    expect(res.status).toBe(200);
    expect(getOr()).toBe("venue_user_id.eq.v-1,venue_name.eq.TateModern");
  });
});
