// E36d — the newsletter route's own leak.
//
// This route was cited as the codebase's good example: it maps a 23505 to a
// 200 with a comment saying it does so "so we don't leak membership status to
// enumeration attacks". The comment overclaimed. The 200 carried
// `alreadySubscribed: true`, which is the same disclosure one level down —
// reading a boolean out of a JSON body is no harder than reading a status code.

import { describe, it, expect, vi, beforeEach } from "vitest";

const { insertMock, fromMock } = vi.hoisted(() => ({
  insertMock: vi.fn(),
  fromMock: vi.fn(),
}));

vi.mock("@/lib/supabase-admin", () => ({ getSupabaseAdmin: () => ({ from: fromMock }) }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(async () => null) }));

import { POST } from "./route";

function post(body: unknown): Request {
  return new Request("http://localhost/api/newsletter", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  insertMock.mockReset();
  fromMock.mockReset();
  insertMock.mockResolvedValue({ error: null });
  fromMock.mockReturnValue({ insert: insertMock });
});

describe("POST /api/newsletter is not a membership oracle (E36d)", () => {
  it("answers an existing subscriber byte-identically to a new one", async () => {
    const fresh = await (await POST(post({ email: "sam@example.com" }))).text();

    insertMock.mockResolvedValue({ error: { code: "23505", message: "duplicate key" } });
    const existing = await (await POST(post({ email: "sam@example.com" }))).text();

    expect(existing).toEqual(fresh);
  });

  it("no longer flags alreadySubscribed in the body", async () => {
    insertMock.mockResolvedValue({ error: { code: "23505", message: "duplicate key" } });
    const body = await (await POST(post({ email: "sam@example.com" }))).json();
    expect(body).not.toHaveProperty("alreadySubscribed");
    expect(body).toEqual({ ok: true });
  });

  it("still surfaces a genuine database failure as a 500", async () => {
    insertMock.mockResolvedValue({ error: { code: "42501", message: "permission denied" } });
    const res = await POST(post({ email: "sam@example.com" }));
    expect(res.status).toBe(500);
  });

  it("still rejects an invalid address", async () => {
    const res = await POST(post({ email: "not-an-email" }));
    expect(res.status).toBe(400);
    expect(insertMock).not.toHaveBeenCalled();
  });
});
