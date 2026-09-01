// Task 7 Part B. The controller addition without which nothing in Task 6/7
// can ever accrue in production: migration 122 added
// placements.programme_request_id / programme_rent_gbp (both server-owned,
// PLACEMENT_SERVER_OWNED) but deliberately shipped no writer for them — "an
// admin route linking a placement to a programme, deliberately left unbuilt
// by this task" (122's own header). This is that route.
//
// As in ../../../curation/quote/route.test.ts, the real withAdmin and
// getAdminUser run here against a mocked Supabase, so the admin predicate is
// exercised rather than stubbed.

import { describe, expect, it, vi, beforeEach } from "vitest";

const { getUser, fromMock, recordMock } = vi.hoisted(() => ({
  getUser: vi.fn(),
  fromMock: vi.fn(),
  recordMock: vi.fn(),
}));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({ auth: { getUser }, from: fromMock }),
}));
vi.mock("@/lib/admin-audit", () => ({ recordAdminAction: recordMock }));

import { POST, DELETE } from "./route";

// A variant-valid v4 UUID: zod's .uuid() checks the version/variant nibbles,
// so an arbitrary "shaped like a UUID" string is rejected at the schema.
const PROGRAMME_ID = "11111111-2222-4333-8444-555555555555";
const OTHER_PROGRAMME_ID = "22222222-3333-4444-8555-666666666666";
const PLACEMENT_ID = "pl_1";

const VALID_BODY = { programmeRequestId: PROGRAMME_ID, rentGbp: 10 };

let placementRow: Record<string, unknown> | null = { id: PLACEMENT_ID };
let programmeRow: Record<string, unknown> | null = { id: PROGRAMME_ID, tier: "programme" };
let placementLookupError: { message: string } | null = null;
let programmeLookupError: { message: string } | null = null;
let updateError: { message: string } | null = null;
const updateMock = vi.fn();

function req(body: unknown, opts: { token?: string | null; method?: "POST" | "DELETE" } = {}): Request {
  const { token = "Bearer x", method = "POST" } = opts;
  const headers: Record<string, string> = {};
  if (token) headers.authorization = token;
  return new Request(`http://localhost/api/admin/placements/${PLACEMENT_ID}/link-programme`, {
    method,
    headers,
    ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
  });
}

function params(id: string = PLACEMENT_ID) {
  return { params: Promise.resolve({ id }) };
}

function setupDb() {
  fromMock.mockImplementation((table: string) => {
    if (table === "admin_users") {
      return { select: () => ({ eq: () => ({ limit: async () => ({ data: [], error: null }) }) }) };
    }
    if (table === "placements") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: placementRow, error: placementLookupError }),
          }),
        }),
        update: (payload: Record<string, unknown>) => ({
          eq: async () => {
            updateMock(payload);
            return { error: updateError };
          },
        }),
      };
    }
    if (table === "curation_requests") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: programmeRow, error: programmeLookupError }),
          }),
        }),
      };
    }
    throw new Error(`unexpected table ${table}`);
  });
}

beforeEach(() => {
  getUser.mockReset();
  fromMock.mockReset();
  recordMock.mockReset();
  updateMock.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});

  placementRow = { id: PLACEMENT_ID };
  programmeRow = { id: PROGRAMME_ID, tier: "programme" };
  placementLookupError = null;
  programmeLookupError = null;
  updateError = null;

  process.env.ADMIN_EMAILS = "boss@example.com";
  getUser.mockResolvedValue({
    data: {
      user: { id: "u-admin", email: "boss@example.com", user_metadata: { user_type: "admin" } },
    },
    error: null,
  });
  setupDb();
});

describe("POST — authorisation and shape", () => {
  it("401s without a token", async () => {
    const res = await POST(req(VALID_BODY, { token: null }), params());
    expect(res.status).toBe(401);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("403s a non-admin", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: "u1", email: "nobody@example.com", user_metadata: {} } },
      error: null,
    });
    const res = await POST(req(VALID_BODY), params());
    expect(res.status).toBe(403);
    expect(updateMock).not.toHaveBeenCalled();
    expect(recordMock).not.toHaveBeenCalled();
  });

  it("400s an invalid payload (bad uuid) and touches nothing", async () => {
    const res = await POST(req({ ...VALID_BODY, programmeRequestId: "not-a-uuid" }), params());
    expect(res.status).toBe(400);
    expect(updateMock).not.toHaveBeenCalled();
    expect(recordMock).not.toHaveBeenCalled();
  });

  it("400s a payload missing rentGbp", async () => {
    const { rentGbp: _drop, ...rest } = VALID_BODY;
    void _drop;
    const res = await POST(req(rest), params());
    expect(res.status).toBe(400);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("400s rent below PROGRAMME_PIECE_RENT_MIN_GBP, as a clean 400 rather than a raw DB constraint error", async () => {
    const res = await POST(req({ ...VALID_BODY, rentGbp: 4 }), params());
    expect(res.status).toBe(400);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("passes rent exactly at the floor (£5)", async () => {
    const res = await POST(req({ ...VALID_BODY, rentGbp: 5 }), params());
    expect(res.status).toBe(200);
  });

  it("400s a non-numeric rentGbp", async () => {
    const res = await POST(req({ ...VALID_BODY, rentGbp: "10" }), params());
    expect(res.status).toBe(400);
    expect(updateMock).not.toHaveBeenCalled();
  });
});

describe("POST — target validation", () => {
  it("404s an unknown placement", async () => {
    placementRow = null;
    const res = await POST(req(VALID_BODY), params());
    expect(res.status).toBe(404);
    expect(updateMock).not.toHaveBeenCalled();
    expect(recordMock).not.toHaveBeenCalled();
  });

  it("409s when the target curation_requests row does not exist", async () => {
    programmeRow = null;
    const res = await POST(req(VALID_BODY), params());
    expect(res.status).toBe(409);
    expect(updateMock).not.toHaveBeenCalled();
    expect(recordMock).not.toHaveBeenCalled();
  });

  it("409s when the target curation_requests row is not tier programme", async () => {
    programmeRow = { id: PROGRAMME_ID, tier: "bespoke" };
    const res = await POST(req(VALID_BODY), params());
    expect(res.status).toBe(409);
    expect(updateMock).not.toHaveBeenCalled();
    expect(recordMock).not.toHaveBeenCalled();
  });

  it("500s and writes nothing when the placement lookup errors", async () => {
    placementLookupError = { message: "db down" };
    const res = await POST(req(VALID_BODY), params());
    expect(res.status).toBe(500);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("500s and writes nothing when the programme lookup errors", async () => {
    programmeLookupError = { message: "db down" };
    const res = await POST(req(VALID_BODY), params());
    expect(res.status).toBe(500);
    expect(updateMock).not.toHaveBeenCalled();
  });
});

describe("POST — happy path", () => {
  it("writes both columns via the service-role client", async () => {
    const res = await POST(req(VALID_BODY), params());
    expect(res.status).toBe(200);
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock.mock.calls[0][0]).toEqual({
      programme_request_id: PROGRAMME_ID,
      programme_rent_gbp: 10,
    });
  });

  it("records an audit row naming the placement, programme and rent", async () => {
    await POST(req(VALID_BODY), params());
    expect(recordMock).toHaveBeenCalledTimes(1);
    const [call] = recordMock.mock.calls[0] as [
      { adminUserId: string; action: string; context: Record<string, unknown> },
    ];
    expect(call.adminUserId).toBe("u-admin");
    expect(call.action).toBe("placement_programme_linked");
    expect(call.context).toMatchObject({
      placementId: PLACEMENT_ID,
      programmeRequestId: PROGRAMME_ID,
      rentGbp: 10,
    });
  });

  it("500s and records nothing when the update fails", async () => {
    updateError = { message: "permission denied" };
    const res = await POST(req(VALID_BODY), params());
    expect(res.status).toBe(500);
    expect(recordMock).not.toHaveBeenCalled();
  });

  it("relinking to a different programme overwrites both columns", async () => {
    const res = await POST(req({ programmeRequestId: OTHER_PROGRAMME_ID, rentGbp: 12 }), params());
    expect(res.status).toBe(200);
    expect(updateMock.mock.calls[0][0]).toEqual({
      programme_request_id: OTHER_PROGRAMME_ID,
      programme_rent_gbp: 12,
    });
  });
});

describe("DELETE — unlink", () => {
  it("401s without a token", async () => {
    const res = await DELETE(req(null, { token: null, method: "DELETE" }), params());
    expect(res.status).toBe(401);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("403s a non-admin", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: "u1", email: "nobody@example.com", user_metadata: {} } },
      error: null,
    });
    const res = await DELETE(req(null, { method: "DELETE" }), params());
    expect(res.status).toBe(403);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("404s an unknown placement", async () => {
    placementRow = null;
    const res = await DELETE(req(null, { method: "DELETE" }), params());
    expect(res.status).toBe(404);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("clears both columns", async () => {
    const res = await DELETE(req(null, { method: "DELETE" }), params());
    expect(res.status).toBe(200);
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock.mock.calls[0][0]).toEqual({
      programme_request_id: null,
      programme_rent_gbp: null,
    });
  });

  it("records an audit row naming the placement", async () => {
    await DELETE(req(null, { method: "DELETE" }), params());
    expect(recordMock).toHaveBeenCalledTimes(1);
    const [call] = recordMock.mock.calls[0] as [
      { adminUserId: string; action: string; context: Record<string, unknown> },
    ];
    expect(call.action).toBe("placement_programme_unlinked");
    expect(call.context).toMatchObject({ placementId: PLACEMENT_ID });
  });

  it("500s and records nothing when the update fails", async () => {
    updateError = { message: "permission denied" };
    const res = await DELETE(req(null, { method: "DELETE" }), params());
    expect(res.status).toBe(500);
    expect(recordMock).not.toHaveBeenCalled();
  });
});
