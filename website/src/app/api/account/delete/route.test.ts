// /api/account/delete — POST GDPR hard-delete.
//
// Coverage focuses on the boundaries:
//   - unauth → 401 (delegated to auth helper)
//   - demo session → soft 200 + {demo:true} with zero writes (C15)
//   - missing or wrong confirm string → 400
//   - happy path: every TABLES_USER_ID row gets a delete().eq(), orders and
//     refund_requests are RETAINED and anonymised (C14a/C14b), then
//     auth.admin.deleteUser fires with the authenticated user's id
//   - a failed scrub → 500 and the auth user is NOT deleted (C14c)
//   - userId comes from auth.user.id, never the body (security)
//
// The DB fake behaves like PostgREST (same fixture style as ../route.test.ts):
// an unknown TABLE and an unknown COLUMN both reject the whole statement, so a
// phantom column in the route fails here the way it fails in production.

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const { mockDeleteUser, fromMock, getAuthMock, subsCancelMock } = vi.hoisted(() => ({
  mockDeleteUser: vi.fn(),
  fromMock: vi.fn(),
  getAuthMock: vi.fn(),
  subsCancelMock: vi.fn(),
}));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    auth: { admin: { deleteUser: mockDeleteUser } },
    from: fromMock,
  }),
}));

// demo-guard is deliberately NOT mocked: the C15 tests below drive the real
// guard through its env-var switch.
vi.mock("@/lib/api-auth", () => ({ getAuthenticatedUser: getAuthMock }));

import { POST } from "./route";

const SCHEMA: Record<string, string[]> = JSON.parse(
  readFileSync(
    path.resolve(__dirname, "../../../../../tests/integration/schema-columns.json"),
    "utf8",
  ),
);

interface Write {
  table: string;
  op: "update" | "delete";
  payload?: Record<string, unknown>;
  col: string;
  value: unknown;
}

let writes: Write[] = [];

/**
 * A fake that behaves like PostgREST: an unknown table, an unknown payload
 * column and an unknown filter column all reject the whole statement.
 * Anything less makes this suite an assertion about the shape of a payload
 * rather than a reproduction of how the route fails in production.
 */
function installDb() {
  writes = [];
  fromMock.mockImplementation((table: string) => {
    const known = SCHEMA[table];
    const reject = (message: string) => ({ eq: async () => ({ error: { message } }) });
    if (!known) {
      return {
        update: () => reject(`relation "public.${table}" does not exist`),
        delete: () => reject(`relation "public.${table}" does not exist`),
        select: () => {
          throw new Error(`relation "public.${table}" does not exist`);
        },
      };
    }
    return {
      // WS3.2 reads subscription ids before scrubbing. Same honesty rule as
      // the writes: an unknown column THROWS (the route ignores select
      // errors, so a silent error object would let a typo slip through).
      select: (colsArg: string) => {
        for (const c of String(colsArg).split(",").map((x) => x.trim())) {
          if (c && c !== "*" && !known.includes(c)) throw new Error(`column ${table}.${c} does not exist`);
        }
        const check = (col: string) => {
          if (!known.includes(col)) throw new Error(`column ${table}.${col} does not exist`);
        };
        return {
          eq: (col: string) => {
            check(col);
            return {
              maybeSingle: async () => ({ data: null, error: null }),
              in: async (col2: string) => {
                check(col2);
                return { data: [], error: null };
              },
            };
          },
        };
      },
      update: (payload: Record<string, unknown>) => {
        const bad = Object.keys(payload).find((k) => !known.includes(k));
        if (bad) return reject(`Could not find the '${bad}' column of '${table}'`);
        return {
          eq: async (col: string, value: unknown) => {
            if (!known.includes(col)) return { error: { message: `column ${table}.${col} does not exist` } };
            writes.push({ table, op: "update", payload, col, value });
            return { error: null };
          },
        };
      },
      delete: () => ({
        eq: async (col: string, value: unknown) => {
          if (!known.includes(col)) return { error: { message: `column ${table}.${col} does not exist` } };
          writes.push({ table, op: "delete", col, value });
          return { error: null };
        },
      }),
    };
  });
}

function req(token = "Bearer valid", body: unknown = { confirm: "DELETE MY ACCOUNT" }): Request {
  return new Request("http://localhost/api/account/delete", {
    method: "POST",
    headers: { authorization: token, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

let savedDemoArtist: string | undefined;
let savedDemoVenue: string | undefined;

beforeEach(() => {
  mockDeleteUser.mockReset();
  fromMock.mockReset();
  getAuthMock.mockReset();

  // The demo guard reads these at call time; make sure ambient env can't
  // flip a test either way.
  savedDemoArtist = process.env.DEMO_ARTIST_USER_ID;
  savedDemoVenue = process.env.DEMO_VENUE_USER_ID;
  delete process.env.DEMO_ARTIST_USER_ID;
  delete process.env.DEMO_VENUE_USER_ID;

  getAuthMock.mockImplementation(async (r: Request) => {
    const auth = r.headers.get("authorization");
    if (auth === "Bearer valid") return { user: { id: "u1", email: "a@x.com" }, error: null };
    return { user: null, error: new Response(null, { status: 401 }) };
  });
  installDb();
  mockDeleteUser.mockResolvedValue({ data: null, error: null });
});

afterEach(() => {
  if (savedDemoArtist === undefined) delete process.env.DEMO_ARTIST_USER_ID;
  else process.env.DEMO_ARTIST_USER_ID = savedDemoArtist;
  if (savedDemoVenue === undefined) delete process.env.DEMO_VENUE_USER_ID;
  else process.env.DEMO_VENUE_USER_ID = savedDemoVenue;
  vi.restoreAllMocks();
});

describe("POST /api/account/delete", () => {
  it("requires authentication", async () => {
    const res = await POST(req(""));
    expect(res.status).toBe(401);
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it("requires explicit confirmation string", async () => {
    const res = await POST(req("Bearer valid", { confirm: "no" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/confirm/i);
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it("rejects when body is empty / no confirm field", async () => {
    const res = await POST(req("Bearer valid", {}));
    expect(res.status).toBe(400);
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it("rejects when JSON body is malformed", async () => {
    const r = new Request("http://localhost/api/account/delete", {
      method: "POST",
      headers: { authorization: "Bearer valid", "content-type": "application/json" },
      body: "not json",
    });
    const res = await POST(r);
    expect(res.status).toBe(400);
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it("rejects when JSON body is literal null (not 500)", async () => {
    // request.json() returns null (not an exception) for body "null", which
    // would crash on body.confirm if not guarded. Must return 400, not 500.
    const r = new Request("http://localhost/api/account/delete", {
      method: "POST",
      headers: { authorization: "Bearer valid", "content-type": "application/json" },
      body: "null",
    });
    const res = await POST(r);
    expect(res.status).toBe(400);
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it("deletes every user-owned table row, then the auth user", async () => {
    const res = await POST(req("Bearer valid"));
    expect(res.status).toBe(200);
    expect(mockDeleteUser).toHaveBeenCalledWith("u1");
    // Every hard-delete targets the authenticated user's id, never a value
    // from the request body.
    const deletes = writes.filter((w) => w.op === "delete");
    expect(deletes.length).toBeGreaterThan(10);
    for (const w of deletes) {
      expect(w.value, `${w.table}.${w.col}`).toBe("u1");
    }
  });

  it("touches expected core tables (smoke)", async () => {
    await POST(req("Bearer valid"));
    const deleted = writes.filter((w) => w.op === "delete").map((w) => w.table);
    expect(deleted).toEqual(expect.arrayContaining([
      "saved_items",
      "notifications",
      "messages",
      "placements",
      "artist_profiles",
      "venue_profiles",
      "customer_profiles",
    ]));
  });

  it("names no table or column the schema lacks", async () => {
    // The fake rejects phantoms, so one would already fail the happy path.
    // This states the invariant directly as well, so a future edit is caught
    // by the assertion and not only by the side effect.
    await POST(req("Bearer valid"));
    for (const w of writes) {
      expect(SCHEMA[w.table], w.table).toBeDefined();
      expect(SCHEMA[w.table], `${w.table}.${w.col}`).toContain(w.col);
      for (const key of Object.keys(w.payload ?? {})) {
        expect(SCHEMA[w.table], `${w.table}.${key}`).toContain(key);
      }
    }
  });

  it("ignores any user_id passed in the body (security)", async () => {
    // Even if the caller smuggles a different user_id in the body,
    // the route MUST use auth.user.id from the verified token.
    const r = new Request("http://localhost/api/account/delete", {
      method: "POST",
      headers: { authorization: "Bearer valid", "content-type": "application/json" },
      body: JSON.stringify({ confirm: "DELETE MY ACCOUNT", user_id: "u-other", target: "u-other" }),
    });
    const res = await POST(r);
    expect(res.status).toBe(200);
    expect(mockDeleteUser).toHaveBeenCalledWith("u1"); // the *authenticated* user, not the body
    expect(mockDeleteUser).not.toHaveBeenCalledWith("u-other");
    expect(writes.every((w) => w.value !== "u-other")).toBe(true);
  });
});

describe("POST /api/account/delete retains financial records (C14)", () => {
  it("never deletes an order or refund row", async () => {
    // Orders and refund_requests are tax/legal records: the sibling
    // soft-delete documents the retention policy and this route used to
    // contradict it by hard-deleting both.
    const res = await POST(req("Bearer valid"));
    expect(res.status).toBe(200);
    expect(writes.some((w) => w.table === "orders" && w.op === "delete")).toBe(false);
    expect(writes.some((w) => w.table === "refund_requests" && w.op === "delete")).toBe(false);
  });

  it("anonymises the buyer PII on user-keyed orders instead", async () => {
    await POST(req("Bearer valid"));
    const w = writes.find((x) => x.table === "orders" && x.col === "buyer_user_id");
    expect(w).toBeDefined();
    expect(w!.op).toBe("update");
    expect(w!.value).toBe("u1");
    // shipping json holds the buyer's name and address; buyer_email is the
    // other PII column.
    expect(w!.payload).toEqual({ buyer_email: "[deleted-u1]", shipping: {} });
  });

  it("scrubs guest orders keyed only by the verified email (C14b)", async () => {
    // Rows with buyer_user_id NULL used to survive erasure untouched while
    // the route claimed success: all 12 live orders were email-keyed.
    await POST(req("Bearer valid"));
    const w = writes.find((x) => x.table === "orders" && x.col === "buyer_email");
    expect(w).toBeDefined();
    expect(w!.op).toBe("update");
    expect(w!.value).toBe("a@x.com");
    expect(w!.payload).toEqual({ buyer_email: "[deleted-u1]", shipping: {} });
  });

  it("anonymises refund requests by user id and by verified email", async () => {
    await POST(req("Bearer valid"));
    const byId = writes.find((x) => x.table === "refund_requests" && x.col === "requester_user_id");
    const byEmail = writes.find((x) => x.table === "refund_requests" && x.col === "requester_email");
    expect(byId?.op).toBe("update");
    expect(byId?.value).toBe("u1");
    expect(byId?.payload).toEqual({ requester_email: "[deleted-u1]" });
    expect(byEmail?.op).toBe("update");
    expect(byEmail?.value).toBe("a@x.com");
  });

  it("only ever matches the deleting user's own rows", async () => {
    // Every filter value must be the token's user id or the token's own
    // verified email. Nothing from the body, nothing broader.
    await POST(req("Bearer valid"));
    for (const w of writes) {
      expect(["u1", "a@x.com"], `${w.table}.${w.col} filtered on ${String(w.value)}`).toContain(
        w.value,
      );
    }
  });

  it("skips the email-keyed passes when the account has no email", async () => {
    getAuthMock.mockResolvedValue({ user: { id: "u1", email: undefined }, error: null });
    const res = await POST(req("Bearer valid"));
    expect(res.status).toBe(200);
    expect(writes.some((w) => w.col === "buyer_email")).toBe(false);
    expect(writes.some((w) => w.col === "requester_email")).toBe(false);
    // The user-id-keyed anonymisation still runs.
    expect(writes.some((w) => w.table === "orders" && w.col === "buyer_user_id")).toBe(true);
  });
});

describe("POST /api/account/delete refuses to half-erase (C14c)", () => {
  it("does NOT delete the auth user when a scrub fails, and says so", async () => {
    // This is what made failures invisible: the account went, so nobody
    // could log in and notice their data was still there.
    const base = fromMock.getMockImplementation()!;
    fromMock.mockImplementation((table: string) => {
      if (table === "saved_items") {
        return { delete: () => ({ eq: async () => ({ error: { message: "boom" } }) }) };
      }
      return base(table);
    });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await POST(req("Bearer valid"));

    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/not closed the account|contact support/i);
    expect(mockDeleteUser).not.toHaveBeenCalled();
    expect(errSpy).toHaveBeenCalled();
  });

  it("keeps scrubbing after the first failure rather than stopping", async () => {
    // A scrub that short-circuits leaves MORE data behind than one that
    // carries on and reports what it could not do.
    const base = fromMock.getMockImplementation()!;
    fromMock.mockImplementation((table: string) => {
      if (table === "saved_items") {
        return { delete: () => ({ eq: async () => ({ error: { message: "boom" } }) }) };
      }
      return base(table);
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    await POST(req("Bearer valid"));

    expect(writes.some((w) => w.table === "messages")).toBe(true);
    expect(writes.some((w) => w.table === "orders" && w.op === "update")).toBe(true);
  });

  it("returns 500 when auth.admin.deleteUser fails", async () => {
    mockDeleteUser.mockResolvedValue({ data: null, error: { message: "auth boom" } });
    vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await POST(req("Bearer valid"));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/contact support|could not/i);
  });
});

describe("POST /api/account/delete demo guard (C15)", () => {
  it("soft-blocks a demo artist session with 200 + demo:true and zero writes", async () => {
    process.env.DEMO_ARTIST_USER_ID = "u1";

    const res = await POST(req("Bearer valid"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.demo).toBe(true);
    expect(fromMock).not.toHaveBeenCalled();
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it("soft-blocks a demo venue session too", async () => {
    process.env.DEMO_VENUE_USER_ID = "u1";

    const res = await POST(req("Bearer valid"));

    expect((await res.json()).demo).toBe(true);
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it("does not block a real user when demo ids are configured", async () => {
    process.env.DEMO_ARTIST_USER_ID = "u-demo-artist";
    process.env.DEMO_VENUE_USER_ID = "u-demo-venue";

    const res = await POST(req("Bearer valid"));

    expect(res.status).toBe(200);
    expect((await res.json()).demo).toBeUndefined();
    expect(mockDeleteUser).toHaveBeenCalledWith("u1");
  });
});

// ─── WS3.2 (missing-events gap 2): deletion cancels Stripe subscriptions ───
// Before this, "account gone, card still charged monthly" was reachable three
// ways: the SaaS plan, a paid loan the user was paying as venue, and a
// curation retainer. These pin the cancel calls and the abort-on-failure.

vi.mock("@/lib/stripe", () => ({ stripe: { subscriptions: { cancel: subsCancelMock } } }));

describe("stripe subscriptions are cancelled on deletion (WS3.2)", () => {
  function installSubs() {
    installDb();
    const base = fromMock.getMockImplementation()!;
    fromMock.mockImplementation((table: string) => {
      const chain = base(table) as Record<string, unknown>;
      if (table === "artist_profiles") {
        return {
          ...chain,
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { stripe_subscription_id: "sub_saas" }, error: null }),
            }),
          }),
        };
      }
      if (table === "placement_recurring_billings" || table === "curation_requests") {
        const id = table === "curation_requests" ? "sub_curation" : "sub_loan";
        return {
          ...chain,
          select: () => ({
            eq: () => ({ in: async () => ({ data: [{ stripe_subscription_id: id }], error: null }) }),
          }),
        };
      }
      return chain;
    });
  }

  it("cancels the SaaS plan, paid-loan and curation subscriptions, then deletes", async () => {
    installSubs();
    subsCancelMock.mockResolvedValue({});
    const res = await POST(req());
    expect(res.status).toBe(200);
    const cancelled = subsCancelMock.mock.calls.map((c) => c[0]);
    expect(cancelled).toEqual(expect.arrayContaining(["sub_saas", "sub_loan", "sub_curation"]));
    expect(mockDeleteUser).toHaveBeenCalled();
  });

  it("a cancel failure ABORTS the deletion (no orphaned billing)", async () => {
    installSubs();
    subsCancelMock.mockRejectedValue(new Error("stripe down"));
    const res = await POST(req());
    expect(res.status).toBe(500);
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it("and aborts BEFORE scrubbing, so a Stripe outage loses nothing", async () => {
    // Aborting after the scrub would leave the worst of both worlds: the
    // person's data gone, their account still alive, and still undeletable
    // for as long as Stripe stays unreachable.
    installSubs();
    subsCancelMock.mockRejectedValue(new Error("stripe down"));
    const res = await POST(req());
    expect(res.status).toBe(500);
    expect(writes).toHaveLength(0);
    expect((await res.json()).error).toMatch(/nothing has been removed/i);
  });

  it("an already-cancelled subscription does not block deletion", async () => {
    installSubs();
    subsCancelMock.mockRejectedValue(new Error("No such subscription: sub_saas"));
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(mockDeleteUser).toHaveBeenCalled();
  });
});
