// H28. Every tier in tier-limits.ts advertises a `wall_uploads_daily` figure
// (customer 1, artist_core 1, artist_premium 3, pro/venue_premium 5) and
// quota.ts even burst-lists the `wall_upload` action, but /api/walls/
// upload-photo never consulted either. The only limits that actually applied
// were the 15MB size cap and the MIME whitelist, so wall photo uploads were
// unmetered on every plan including the ones that advertise one a day.

import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  resolveTierMock,
  getTierLimitsMock,
  withRateLimitMock,
  uploadMock,
  createSignedUrlMock,
  usageSelectMock,
  usageInsertMock,
} = vi.hoisted(() => ({
  resolveTierMock: vi.fn(),
  getTierLimitsMock: vi.fn(),
  withRateLimitMock: vi.fn(),
  uploadMock: vi.fn(),
  createSignedUrlMock: vi.fn(),
  usageSelectMock: vi.fn(),
  usageInsertMock: vi.fn(),
}));

vi.mock("@/lib/api-auth", () => ({
  getAuthenticatedUser: vi.fn(async (req: Request) => {
    if (req.headers.get("authorization") === "Bearer valid") {
      return { user: { id: "u-real" }, error: null };
    }
    return { user: null, error: new Response(null, { status: 401 }) };
  }),
}));

vi.mock("@/lib/visualizer/tier-resolver", () => ({
  resolveTier: (...a: unknown[]) => resolveTierMock(...a),
}));

vi.mock("@/lib/visualizer/tier-limits", async () => {
  const actual = await vi.importActual<typeof import("@/lib/visualizer/tier-limits")>(
    "@/lib/visualizer/tier-limits",
  );
  return { ...actual, getTierLimits: (...a: unknown[]) => getTierLimitsMock(...a) };
});

vi.mock("@/lib/rate-limit", () => ({
  withRateLimit: (...a: unknown[]) => withRateLimitMock(...a),
}));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    storage: {
      from: () => ({ upload: uploadMock, createSignedUrl: createSignedUrlMock }),
    },
    from: (table: string) =>
      table === "visualizer_usage"
        ? { select: usageSelectMock, insert: usageInsertMock }
        : {},
  }),
}));

import { POST } from "./route";

/** Thenable chain so `.select(...).eq(...).eq(...).eq(...)` awaits to a result. */
function countingQuery(count: number) {
  const chain: Record<string, unknown> = {};
  chain.eq = () => chain;
  chain.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve({ count, error: null, data: null }).then(resolve);
  return chain;
}

function uploadRequest(): Request {
  const form = new FormData();
  form.append("file", new File([new Uint8Array([1, 2, 3, 4])], "wall.jpg", { type: "image/jpeg" }));
  return new Request("https://w.local/api/walls/upload-photo", {
    method: "POST",
    headers: { authorization: "Bearer valid" },
    body: form,
  });
}

function setUploadsToday(n: number) {
  usageSelectMock.mockImplementation(() => countingQuery(n));
}

beforeEach(() => {
  resolveTierMock.mockReset();
  getTierLimitsMock.mockReset();
  withRateLimitMock.mockReset();
  uploadMock.mockReset();
  createSignedUrlMock.mockReset();
  usageSelectMock.mockReset();
  usageInsertMock.mockReset();

  process.env.NEXT_PUBLIC_FLAG_WALL_VISUALIZER_V1 = "1";

  resolveTierMock.mockResolvedValue("artist_premium");
  getTierLimitsMock.mockReturnValue({
    daily: 10,
    monthly: 200,
    wall_uploads_daily: 3,
    saved_walls: 5,
    saved_layouts_per_wall: 10,
    can_publish_showroom: false,
  });
  withRateLimitMock.mockResolvedValue(null);
  uploadMock.mockResolvedValue({ data: { path: "u-real/x.jpg" }, error: null });
  createSignedUrlMock.mockResolvedValue({ data: { signedUrl: "https://signed" }, error: null });
  usageInsertMock.mockResolvedValue({ error: null });
  setUploadsToday(0);
});

describe("POST /api/walls/upload-photo enforces wall_uploads_daily (H28)", () => {
  it("allows an upload under the cap and records it on the ledger", async () => {
    setUploadsToday(1); // cap is 3

    const res = await POST(uploadRequest());

    expect(res.status).toBe(200);
    expect(uploadMock).toHaveBeenCalledTimes(1);
    // Fail-before: nothing was recorded, so the next upload counted from zero.
    expect(usageInsertMock).toHaveBeenCalledTimes(1);
    expect(usageInsertMock.mock.calls[0][0]).toMatchObject({
      user_id: "u-real",
      action: "wall_upload",
    });
  });

  it("blocks the upload once the daily allowance is spent", async () => {
    setUploadsToday(3); // cap is 3

    const res = await POST(uploadRequest());

    // Fail-before: the advertised limit was never read, so this stored the
    // photo like any other.
    expect(res.status).toBe(429);
    expect(uploadMock).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.reason).toBe("wall_uploads_daily");
    expect(body.cap).toBe(3);
  });

  it("refuses outright on a plan with no uploads included", async () => {
    getTierLimitsMock.mockReturnValue({
      daily: 0,
      monthly: 0,
      wall_uploads_daily: 0,
      saved_walls: 0,
      saved_layouts_per_wall: 0,
      can_publish_showroom: false,
    });

    const res = await POST(uploadRequest());

    expect(res.status).toBe(402);
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("does not charge the allowance when the storage write fails", async () => {
    uploadMock.mockResolvedValue({ data: null, error: { message: "bucket missing" } });

    const res = await POST(uploadRequest());

    expect(res.status).toBe(500);
    expect(usageInsertMock).not.toHaveBeenCalled();
  });

  it("honours the per-user burst limiter", async () => {
    withRateLimitMock.mockResolvedValue(
      new Response(JSON.stringify({ error: "Too many requests." }), { status: 429 }),
    );

    const res = await POST(uploadRequest());

    expect(res.status).toBe(429);
    expect(uploadMock).not.toHaveBeenCalled();
    expect(withRateLimitMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ key: "u-real" }),
    );
  });

  it("treats an unlimited cap as no daily ceiling", async () => {
    getTierLimitsMock.mockReturnValue({
      daily: -1,
      monthly: -1,
      wall_uploads_daily: -1,
      saved_walls: -1,
      saved_layouts_per_wall: -1,
      can_publish_showroom: true,
    });
    setUploadsToday(500);

    const res = await POST(uploadRequest());

    expect(res.status).toBe(200);
    expect(uploadMock).toHaveBeenCalledTimes(1);
  });

  it("still rejects an oversized or wrong-typed file before spending anything", async () => {
    const form = new FormData();
    form.append("file", new File([new Uint8Array([1])], "notes.txt", { type: "text/plain" }));
    const res = await POST(
      new Request("https://w.local/api/walls/upload-photo", {
        method: "POST",
        headers: { authorization: "Bearer valid" },
        body: form,
      }),
    );

    expect(res.status).toBe(400);
    expect(usageInsertMock).not.toHaveBeenCalled();
  });
});
