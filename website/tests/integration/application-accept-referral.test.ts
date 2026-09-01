// PUT /api/admin/applications/[id] — the referral ledger on accept.
//
// Row G L2366. `artist_referrals` holds **0 rows across the whole production
// database**, so no referral has ever been credited to anyone. The referrer's
// 30-day fee-free credit is applied by the Stripe webhook (`extend_free_until`),
// but nothing has ever written the ledger row that says who referred whom, so
// there is no record to audit, no way for a referrer to see a pending referral,
// and nothing to reconcile the credit against.
//
// Accept is the right moment: it is when the applicant becomes an artist with a
// user id, and it is the only point where both halves (the code on the
// application, the new artist's user id) exist at once.

import { describe, expect, it, vi, beforeEach } from "vitest";

type Row = Record<string, unknown> | null;

const { insertMock, updateMock, selectSingleMock, inviteMock, findUserMock } = vi.hoisted(() => ({
  insertMock: vi.fn(async (_table: string, _payload: unknown) => ({ error: null })),
  updateMock: vi.fn(async (_table: string, _payload: unknown) => ({ error: null })),
  selectSingleMock: vi.fn(async (_table: string, _filters: unknown[]) => ({
    data: null as Row,
    error: null as { message: string } | null,
  })),
  inviteMock: vi.fn(async () => ({
    data: { user: { id: "user-new" } },
    error: null as { message: string } | null,
  })),
  findUserMock: vi.fn(async () => null as { id: string } | null),
}));

function builder(table: string) {
  const filters: unknown[] = [];
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.eq = (col: string, val: unknown) => {
    filters.push([col, val]);
    return chain;
  };
  chain.maybeSingle = () => selectSingleMock(table, filters);
  chain.single = () => selectSingleMock(table, filters);
  chain.insert = (payload: unknown) => insertMock(table, payload);
  chain.update = (payload: unknown) => {
    const after: Record<string, unknown> = {
      eq: () => after,
      then: (res: (v: unknown) => unknown) => updateMock(table, payload).then(res),
    };
    return after;
  };
  return chain;
}

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: (t: string) => builder(t),
    auth: { admin: { inviteUserByEmail: inviteMock, updateUserById: vi.fn(async () => ({})) } },
  }),
}));
vi.mock("@/lib/admin-auth", () => ({
  withAdmin: (
    _req: Request,
    _action: string,
    handler: (ctx: { user: { id: string }; audit: (c: unknown, a?: string) => void }) => Promise<Response>,
  ) => handler({ user: { id: "admin-1" }, audit: () => {} }),
}));
vi.mock("@/lib/auth/find-user-by-email", () => ({ findUserByEmail: findUserMock }));
const { sendEmailMock } = vi.hoisted(() => ({
  sendEmailMock: vi.fn(async (_input: { template?: string; react?: unknown }) => ({ ok: true })),
}));
vi.mock("@/lib/email/send", () => ({ sendEmail: sendEmailMock }));

import { PUT } from "@/app/api/admin/applications/[id]/route";

const APPLICATION = {
  id: 29,
  name: "QA Referral",
  email: "qa-referral@example.test",
  location: "London",
  status: "pending",
  referred_by_code: "REALCODE",
};

function put(body: Record<string, unknown> = { action: "accept" }) {
  return PUT(
    new Request("https://www.wallplace.co.uk/api/admin/applications/29", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: "29" }) },
  );
}

/** Every insert the route made into `table`. */
function insertsInto(table: string): Record<string, unknown>[] {
  return insertMock.mock.calls
    .filter((c) => c[0] === table)
    .map((c) => c[1] as Record<string, unknown>);
}

beforeEach(() => {
  sendEmailMock.mockClear();
  insertMock.mockClear();
  updateMock.mockClear();
  selectSingleMock.mockClear();
  selectSingleMock.mockImplementation(async (table: string, filters: unknown[]) => {
    if (table === "artist_applications") return { data: { ...APPLICATION } as Row, error: null };
    // The slug-collision probe and the referral-code lookup both hit
    // artist_profiles; only the code lookup filters on referral_code.
    const byCode = (filters as [string, unknown][]).some(([col]) => col === "referral_code");
    if (table === "artist_profiles" && byCode) {
      return {
        data: { user_id: "referrer-1", slug: "referrer-artist", referral_code: "REALCODE" } as Row,
        error: null,
      };
    }
    return { data: null as Row, error: null };
  });
});

describe("accepting an application with a referral code", () => {
  it("writes the artist_referrals ledger row", async () => {
    const res = await put();
    expect(res.status).toBe(200);

    const ledger = insertsInto("artist_referrals");
    expect(ledger, "no referral ledger row was written").toHaveLength(1);
    expect(ledger[0]).toMatchObject({
      referrer_user_id: "referrer-1",
      referrer_slug: "referrer-artist",
      referral_code: "REALCODE",
      referred_email: "qa-referral@example.test",
      referred_user_id: "user-new",
      status: "pending",
    });
  });

  it("still accepts the application when the code matches no artist", async () => {
    selectSingleMock.mockImplementation(async (table: string) =>
      table === "artist_applications"
        ? { data: { ...APPLICATION, referred_by_code: "GHOSTCODE" } as Row, error: null }
        : { data: null as Row, error: null },
    );

    const res = await put();

    expect(res.status).toBe(200);
    expect(insertsInto("artist_referrals")).toHaveLength(0);
  });

  it("writes nothing when the application carries no code", async () => {
    selectSingleMock.mockImplementation(async (table: string) =>
      table === "artist_applications"
        ? { data: { ...APPLICATION, referred_by_code: null } as Row, error: null }
        : { data: null as Row, error: null },
    );

    const res = await put();

    expect(res.status).toBe(200);
    expect(insertsInto("artist_referrals")).toHaveLength(0);
  });
});

// Row 2362 / pass 2 item 3.7. The application detail shows "SELECTED PLAN Pro"
// and the profile it creates carries subscription_plan 'none'. That is right:
// picking a plan on a form is an intent, not a purchase, and provisioning one
// on acceptance would assert a subscription nobody has paid for. What was
// missing is that nothing told the accepted artist they still have to start it.
describe("the approval email says the chosen plan is not running yet", () => {
  function approvalEmail() {
    return sendEmailMock.mock.calls
      .map((c) => c[0])
      .find((c) => c?.template === "artist_application_approved");
  }

  it("names the plan the applicant picked", async () => {
    selectSingleMock.mockImplementation(async (table: string) =>
      table === "artist_applications"
        ? { data: { ...APPLICATION, referred_by_code: null, selected_plan: "pro" } as Row, error: null }
        : { data: null as Row, error: null },
    );

    await put();

    expect(JSON.stringify(approvalEmail()?.react)).toContain("pro");
  });

  it("says nothing about a plan when the application named none", async () => {
    selectSingleMock.mockImplementation(async (table: string) =>
      table === "artist_applications"
        ? { data: { ...APPLICATION, referred_by_code: null, selected_plan: null } as Row, error: null }
        : { data: null as Row, error: null },
    );

    await put();

    const react = JSON.stringify(approvalEmail()?.react);
    expect(react).not.toContain("selectedPlan\":\"");
  });
});
