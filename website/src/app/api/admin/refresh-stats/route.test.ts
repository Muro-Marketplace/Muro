import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/admin-auth", () => ({
  isAdminRequest: vi.fn(),
}));

vi.mock("@/lib/api-auth", () => ({
  getAuthenticatedUser: vi.fn(async () => ({
    user: { id: "u1", email: "user@example.com" },
    error: null,
  })),
}));

vi.mock("@/lib/stats-cache", () => ({
  refreshArtistStatsCaches: vi.fn(async () => ({ updated: 0, errors: [] })),
}));

import { isAdminRequest } from "@/lib/admin-auth";
import { POST } from "./route";

function req(): Request {
  return new Request("http://localhost/api/admin/refresh-stats", {
    method: "POST",
    headers: { authorization: "Bearer test-token" },
  });
}

describe("POST /api/admin/refresh-stats", () => {
  it("returns 403 when isAdminRequest returns false", async () => {
    vi.mocked(isAdminRequest).mockResolvedValue(false);
    const res = await POST(req());
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Admin access required");
  });

  it("returns 200 with success: true when isAdminRequest returns true", async () => {
    vi.mocked(isAdminRequest).mockResolvedValue(true);
    const res = await POST(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});
