// 09 §A.6 layer 2 (item 0.2) and §E.2 level 2 (item 0.4).
//
// E1: a production deploy with no RESEND_API_KEY dropped every email and
// sendEmail returned ok:true, so the one environment where dropping mail is
// fatal was also the one that reported success. Production now returns
// ok:false / "email_not_configured"; preview and local keep the soft skip.
//
// EMAIL_DRY_RUN exercises the whole pipeline including the idempotency claim and
// stops at the provider, writing status:"dry_run".

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { fromMock, sendMock, renderMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  sendMock: vi.fn(),
  renderMock: vi.fn(async () => "<p>hi</p>"),
}));

vi.mock("@/lib/supabase-admin", () => ({ getSupabaseAdmin: () => ({ from: fromMock }) }));
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));
// The template is irrelevant here; skip the real renderer. renderMock so the
// C24 footer-injection tests can supply a body carrying the unsubscribe link.
vi.mock("@react-email/components", () => ({ render: renderMock }));

import { sendEmail } from "./send";

/** Rows written via .update({...}), so a test can assert the recorded status. */
const updates: Record<string, unknown>[] = [];
/** Rows written via logEvent's insert path. */
const logged: Record<string, unknown>[] = [];

function setupDb({ claim = true }: { claim?: boolean } = {}) {
  updates.length = 0;
  logged.length = 0;
  fromMock.mockImplementation(() => ({
    // Guard chain: no prior event, no suppression, no prefs, no throttle.
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({ data: null, error: null }),
        eq: () => ({
          in: () => ({ gte: async () => ({ count: 0, error: null }) }),
        }),
        gte: async () => ({ count: 0, error: null }),
      }),
    }),
    // Both the idempotency claim and logEvent go through upsert; only the claim
    // chains .select(), so the returned object serves both and records the row.
    upsert: (row: Record<string, unknown>) => {
      logged.push(row);
      return {
        select: () => ({
          maybeSingle: async () => ({ data: claim ? { id: "ee-1" } : null, error: null }),
        }),
        then: (fn: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(fn),
      };
    },
    update: (row: Record<string, unknown>) => {
      updates.push(row);
      return { eq: async () => ({ error: null }) };
    },
  }));
}

const INPUT = {
  idempotencyKey: "k-1",
  template: "verify_email",
  category: "security" as const,
  to: "Someone@Example.com ",
  subject: "Verify",
  react: null as never,
};

const ORIGINAL = { ...process.env };
afterEach(() => {
  process.env = { ...ORIGINAL };
  vi.clearAllMocks();
});
beforeEach(() => {
  setupDb();
  sendMock.mockResolvedValue({ data: { id: "msg-1" }, error: null });
});

describe("sendEmail with no RESEND_API_KEY (09 A.6 layer 2)", () => {
  it("reports a hard failure in production instead of a silent success", async () => {
    delete process.env.RESEND_API_KEY;
    process.env.VERCEL_ENV = "production";

    const res = await sendEmail(INPUT);

    // Fail-before: this returned { ok: true, skipped: true, reason: "no_api_key" },
    // so every caller and every monitor saw a success for mail that never left.
    expect(res).toEqual({ ok: false, error: "email_not_configured" });
    expect(sendMock).not.toHaveBeenCalled();
    // Still logged, so /api/health/email can count it.
    expect(logged.some((r) => r.status === "skipped_no_api_key")).toBe(true);
  });

  it("keeps the soft skip outside production so local dev does not error", async () => {
    delete process.env.RESEND_API_KEY;
    process.env.VERCEL_ENV = "preview";

    const res = await sendEmail(INPUT);

    expect(res).toEqual({ ok: true, skipped: true, reason: "no_api_key" });
    expect(sendMock).not.toHaveBeenCalled();
  });
});

describe("EMAIL_DRY_RUN (09 E.2)", () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.VERCEL_ENV = "preview";
  });

  it("claims the idempotency key, records dry_run, and never calls the provider", async () => {
    process.env.EMAIL_DRY_RUN = "1";

    const res = await sendEmail(INPUT);

    expect(res).toEqual({ ok: true, skipped: true, reason: "dry_run" });
    expect(sendMock).not.toHaveBeenCalled();
    expect(updates.some((u) => u.status === "dry_run")).toBe(true);
  });

  it("still short-circuits on a duplicate, so a dry run proves the real dedup", async () => {
    // The dry-run branch sits AFTER the claim on purpose: the claim is the step
    // most likely to be wrong, so skipping it would make a dry run prove less.
    setupDb({ claim: false });
    process.env.EMAIL_DRY_RUN = "1";

    const res = await sendEmail(INPUT);

    expect(res).toEqual({ ok: true, skipped: true, reason: "duplicate" });
    expect(updates.some((u) => u.status === "dry_run")).toBe(false);
  });

  it("sends normally when the flag is unset", async () => {
    delete process.env.EMAIL_DRY_RUN;

    const res = await sendEmail(INPUT);

    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(res).toMatchObject({ ok: true, skipped: false });
  });
});

// ── C24: the recipient is threaded into the footer unsubscribe link ─────────
//
// EmailShell renders `/account/email/unsubscribe?c=<category>` with no user,
// because only the send pipeline knows the recipient. Before this injection
// the visible unsubscribe link in every notify/news email failed permanently
// (the page requires both `u` and `c`).
describe("unsubscribe link injection (C24)", () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = "re_test";
  });

  const FOOTER =
    '<a href="https://wallplace.co.uk/account/email/unsubscribe?c=digests">Unsubscribe</a>' +
    '<a href="https://wallplace.co.uk/account/email">Preferences</a>' +
    '<a href="https://wallplace.co.uk/account/email/unsubscribe">Unsubscribe all</a>';

  it("appends u to both link forms, leaving the preference-centre link alone", async () => {
    renderMock.mockResolvedValue(FOOTER);
    await sendEmail({ ...INPUT, category: "digests", userId: "u-42" });
    const call = sendMock.mock.calls[0][0] as { html: string };
    expect(call.html).toContain("/account/email/unsubscribe?u=u-42&c=digests");
    expect(call.html).toContain('/account/email/unsubscribe?u=u-42"');
    // The adjacent preference-centre link must not be rewritten.
    expect(call.html).toContain('/account/email"');
  });

  it("leaves the link untouched when the send has no userId", async () => {
    renderMock.mockResolvedValue(FOOTER);
    await sendEmail({ ...INPUT, category: "digests" });
    const call = sendMock.mock.calls[0][0] as { html: string };
    expect(call.html).toContain("/account/email/unsubscribe?c=digests");
    expect(call.html).not.toContain("u=");
  });
});
