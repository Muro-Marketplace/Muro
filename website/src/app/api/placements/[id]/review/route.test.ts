// /api/placements/[id]/review — F38/F39 (QA 2026-08-28).
//
// F38: the header comment and the email flow always said reviews happen
// "after the placement has wound down", but the endpoint accepted a review
// on a pending or active placement. POST now refuses until the placement is
// terminal (completed / sold / cancelled).
//
// F39: "Tap to read your review" used to link to the placement page, which
// renders no reviews. The GET added here backs the review page's display,
// party-scoped, with each review tagged given/received for the caller.

import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAuthenticatedUserMock, placementRow, insertMock, reviewRows } = vi.hoisted(() => ({
  getAuthenticatedUserMock: vi.fn(),
  placementRow: {
    value: {
      id: "pl-1",
      status: "completed",
      artist_user_id: "artist-1",
      venue_user_id: "venue-1",
      venue: "Kings Arms",
      work_title: "Morning Field",
    } as Record<string, unknown> | null,
  },
  insertMock: vi.fn(async () => ({ error: null })),
  reviewRows: { value: [] as Record<string, unknown>[] },
}));

vi.mock("@/lib/api-auth", () => ({
  getAuthenticatedUser: (...args: unknown[]) => getAuthenticatedUserMock(...args),
}));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      if (table === "placements") {
        return {
          select: () => ({
            eq: () => ({ single: async () => ({ data: placementRow.value, error: null }) }),
          }),
        };
      }
      if (table === "placement_reviews") {
        return {
          insert: insertMock,
          select: () => ({
            eq: () => ({
              order: async () => ({ data: reviewRows.value, error: null }),
            }),
          }),
        };
      }
      // The notification fan-out reads profiles; return inert lookups.
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }),
      };
    },
    auth: { admin: { getUserById: async () => ({ data: { user: null } }) } },
  }),
}));

vi.mock("@/lib/notifications", () => ({ createNotification: vi.fn(async () => ({})) }));
vi.mock("@/lib/email/send", () => ({ sendEmail: vi.fn(async () => ({})) }));
vi.mock("@/emails/templates/messages/ReviewPostedNotification", () => ({
  ReviewPostedNotification: () => null,
}));

import { GET, POST } from "./route";
import { createNotification } from "@/lib/notifications";

function req(method: "GET" | "POST", body?: unknown): Request {
  return new Request("http://localhost/api/placements/pl-1/review", {
    method,
    headers: { authorization: "Bearer x", "content-type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

const ctx = { params: Promise.resolve({ id: "pl-1" }) };

beforeEach(() => {
  getAuthenticatedUserMock.mockReset();
  insertMock.mockClear();
  vi.mocked(createNotification).mockClear();
  getAuthenticatedUserMock.mockResolvedValue({ user: { id: "artist-1" }, error: null });
  placementRow.value = {
    id: "pl-1",
    status: "completed",
    artist_user_id: "artist-1",
    venue_user_id: "venue-1",
    venue: "Kings Arms",
    work_title: "Morning Field",
  };
  reviewRows.value = [];
});

describe("POST /api/placements/[id]/review status gate (F38)", () => {
  it.each(["pending", "active"])("refuses a review on a %s placement", async (status) => {
    placementRow.value = { ...placementRow.value!, status };
    const res = await POST(req("POST", { rating: 5 }), ctx);
    // Fail-before: either party could rate the other before anything happened.
    expect(res.status).toBe(409);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it.each(["completed", "sold", "cancelled"])("accepts a review once the placement is %s", async (status) => {
    placementRow.value = { ...placementRow.value!, status };
    const res = await POST(req("POST", { rating: 4, text: "Great venue" }), ctx);
    expect(res.status).toBe(200);
    expect(insertMock).toHaveBeenCalledTimes(1);
    insertMock.mockClear();
  });

  it("still refuses a non-party caller on an ended placement", async () => {
    getAuthenticatedUserMock.mockResolvedValue({ user: { id: "stranger" }, error: null });
    const res = await POST(req("POST", { rating: 5 }), ctx);
    expect(res.status).toBe(403);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("points the bell notification at the review page, which renders reviews (F39)", async () => {
    const res = await POST(req("POST", { rating: 5, text: "Lovely" }), ctx);
    expect(res.status).toBe(200);
    const bell = vi.mocked(createNotification).mock.calls[0]![0] as { link: string };
    // Fail-before: the link went to /placements/pl-1, where no review renders.
    expect(bell.link).toBe("/placements/pl-1/review");
  });
});

describe("GET /api/placements/[id]/review (F39)", () => {
  it("returns 401 when unauthenticated", async () => {
    getAuthenticatedUserMock.mockResolvedValue({
      user: null,
      error: new Response(null, { status: 401 }),
    });
    const res = await GET(req("GET"), ctx);
    expect(res.status).toBe(401);
  });

  it("refuses a caller who is not a party to the placement", async () => {
    getAuthenticatedUserMock.mockResolvedValue({ user: { id: "stranger" }, error: null });
    const res = await GET(req("GET"), ctx);
    expect(res.status).toBe(403);
  });

  it("tags each review given/received relative to the caller", async () => {
    reviewRows.value = [
      { id: "r1", placement_id: "pl-1", reviewer_user_id: "artist-1", reviewee_user_id: "venue-1", rating: 4, text: "Good", created_at: "2026-08-01T00:00:00Z" },
      { id: "r2", placement_id: "pl-1", reviewer_user_id: "venue-1", reviewee_user_id: "artist-1", rating: 5, text: "Lovely work", created_at: "2026-08-02T00:00:00Z" },
    ];
    const res = await GET(req("GET"), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reviewable).toBe(true);
    expect(body.reviews).toEqual([
      expect.objectContaining({ id: "r1", direction: "given" }),
      expect.objectContaining({ id: "r2", direction: "received" }),
    ]);
    // The raw reviewer/reviewee ids stay server-side.
    expect(body.reviews[0]).not.toHaveProperty("reviewer_user_id");
  });

  it("reports reviewable=false for a placement that has not ended", async () => {
    placementRow.value = { ...placementRow.value!, status: "active" };
    const res = await GET(req("GET"), ctx);
    const body = await res.json();
    expect(body.reviewable).toBe(false);
  });
});
