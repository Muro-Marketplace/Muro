// E31: GET /api/messages/[conversationId] required a login but performed no
// participation check whatsoever, and conversation ids are `dm-<slugA>__<slugB>`
// built from two PUBLIC profile slugs. So any signed-in user could enumerate ids
// and read anyone's private DMs.
//
// Two more holes in the same file, not named in the finding:
//   - PATCH took readerSlug from the REQUEST BODY, so a caller could mark another
//     user's messages as read.
//   - DELETE had its own fetch-then-compare participation check, a second
//     implementation of the thing assertConversationParticipant exists to own.

import { describe, it, expect, vi, beforeEach } from "vitest";

const { authMock, gateMock, adminMock, recorded } = vi.hoisted(() => ({
  authMock: vi.fn(),
  gateMock: vi.fn(),
  adminMock: vi.fn(),
  recorded: [] as { table: string; op: string; filters: Record<string, unknown>; payload?: unknown }[],
}));

vi.mock("@/lib/api-auth", () => ({ getAuthenticatedUser: authMock }));
vi.mock("@/lib/supabase-admin", () => ({ getSupabaseAdmin: adminMock }));
vi.mock("@/lib/authz", async () => {
  const actual = await vi.importActual<typeof import("@/lib/authz")>("@/lib/authz");
  return { ...actual, assertConversationParticipant: gateMock };
});

import { GET, PATCH, DELETE } from "./route";
import { AuthzError } from "@/lib/authz";

const USER = { id: "user-1", email: "maya@example.com" };
const CONVERSATION = "dm-maya-chen__the-copper-kettle";
const MESSAGES = [{ id: "m1", conversation_id: CONVERSATION, body: "private" }];

function installDb() {
  recorded.length = 0;
  const chain = (table: string, op: string, payload?: unknown) => {
    const rec = { table, op, filters: {} as Record<string, unknown>, payload };
    recorded.push(rec);
    const obj: Record<string, unknown> = {
      select: () => obj,
      eq: (col: string, val: unknown) => {
        rec.filters[col] = val;
        return obj;
      },
      // A caller can hold both an artist and a venue slug, so the read-marking
      // filter is an .in() over their own slugs.
      in: (col: string, vals: unknown) => {
        rec.filters[col] = vals;
        return obj;
      },
      order: () => Promise.resolve({ data: MESSAGES, error: null }),
      limit: () => Promise.resolve({ data: MESSAGES, error: null }),
      then: (fn: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(fn),
    };
    return obj;
  };
  adminMock.mockReturnValue({
    from: (table: string) => ({
      select: () => chain(table, "select"),
      update: (payload: unknown) => chain(table, "update", payload),
      delete: () => chain(table, "delete"),
    }),
  });
}

const op = (name: string) => recorded.find((r) => r.op === name);

const ctx = { params: Promise.resolve({ conversationId: CONVERSATION }) };
const req = (body?: unknown) =>
  new Request(`http://localhost/api/messages/${CONVERSATION}`, {
    method: body ? "PATCH" : "GET",
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

const denied = () =>
  gateMock.mockRejectedValue(
    new AuthzError(404, "conversation_not_found", "Conversation not found."),
  );
const allowed = () => gateMock.mockResolvedValue({ conversationId: CONVERSATION, slugs: ["maya-chen"] });

beforeEach(() => {
  authMock.mockReset();
  gateMock.mockReset();
  adminMock.mockReset();
  installDb();
  authMock.mockResolvedValue({ user: USER, error: null });
});

describe("GET /api/messages/[conversationId] (E31)", () => {
  it("returns 401 to an anonymous caller and never reaches the gate", async () => {
    authMock.mockResolvedValue({ user: null, error: new Response(null, { status: 401 }) });
    const res = await GET(req(), ctx);
    expect(res.status).toBe(401);
    expect(gateMock).not.toHaveBeenCalled();
  });

  it("returns 404 for a conversation the caller is not in, and reads nothing", async () => {
    denied();
    const res = await GET(req(), ctx);
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({ error: "conversation_not_found" });
    expect(op("select"), "no message read may happen after a denial").toBeUndefined();
  });

  it("returns the thread to a participant", async () => {
    allowed();
    const res = await GET(req(), ctx);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ messages: MESSAGES });
  });

  it("checks participation against the id it was given", async () => {
    allowed();
    await GET(req(), ctx);
    expect(gateMock).toHaveBeenCalledOnce();
    expect(gateMock.mock.calls[0][0]).toEqual(USER);
    expect(gateMock.mock.calls[0][1]).toBe(CONVERSATION);
  });
});

describe("PATCH /api/messages/[conversationId] (mark read)", () => {
  it("refuses a conversation the caller is not in", async () => {
    denied();
    const res = await PATCH(req({ readerSlug: "maya-chen" }), ctx);
    expect(res.status).toBe(404);
    expect(op("update")).toBeUndefined();
  });

  it("marks read against the caller's own slug, not one supplied in the body", async () => {
    // The body used to decide whose messages got marked read.
    allowed();
    const res = await PATCH(req({ readerSlug: "somebody-else" }), ctx);
    expect(res.status).toBe(200);
    expect(op("update")?.filters.recipient_slug).toEqual(["maya-chen"]);
    expect(JSON.stringify(op("update")?.filters)).not.toContain("somebody-else");
  });
});

describe("DELETE /api/messages/[conversationId]", () => {
  it("refuses a conversation the caller is not in", async () => {
    denied();
    const res = await DELETE(req(), ctx);
    expect(res.status).toBe(404);
    expect(op("delete")).toBeUndefined();
  });

  it("deletes for a participant", async () => {
    allowed();
    const res = await DELETE(req(), ctx);
    expect(res.status).toBe(200);
    expect(op("delete")?.filters.conversation_id).toBe(CONVERSATION);
  });

  it("uses the shared gate rather than its own participation check", async () => {
    allowed();
    await DELETE(req(), ctx);
    // The old inline check read artist_profiles / venue_profiles itself. Those
    // lookups belong to the gate now.
    expect(recorded.some((r) => r.table === "artist_profiles")).toBe(false);
    expect(recorded.some((r) => r.table === "venue_profiles")).toBe(false);
  });
});
