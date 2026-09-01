// 09 §A.6 layer 2 (item 0.2) and §E.2 level 2 (item 0.4), plus the WS5 email
// pipeline hardening (txn audit 4, 2026-08-28).
//
// E1: a production deploy with no RESEND_API_KEY dropped every email and
// sendEmail returned ok:true, so the one environment where dropping mail is
// fatal was also the one that reported success. Production now returns
// ok:false / "email_not_configured"; preview and local keep the soft skip.
//
// EMAIL_DRY_RUN exercises the whole pipeline including the idempotency claim and
// stops at the provider, writing status:"dry_run". WS5.4: in production the flag
// is ignored (loudly) unless EMAIL_DRY_RUN_FORCE is also set.
//
// WS5.1 (R4.3/R4.6/R4.9): dead attempts (failed, render_failed, dry_run,
// skipped_*, stale queued) no longer burn their idempotency key; only `sent`
// and a fresh `queued` row dedupe, enforced at the atomic layer. A DB error
// anywhere in the claim is a hard failure, never a silent "duplicate".

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
/** Rows written via upsert (the claim and logEvent share the path). */
const logged: Record<string, unknown>[] = [];
/** Conditional re-claim attempts: the filters the atomic layer applied. */
const reclaims: { row: Record<string, unknown>; neq: [string, unknown]; or: string }[] = [];
/** The jsonb filters passed to .contains() by the throttle query. */
const throttleFilters: Record<string, unknown>[] = [];

interface DbConfig {
  /** Row returned by the idempotency pre-check. */
  existing?: { id: string; status: string; created_at?: string } | null;
  /** Error returned by the pre-check. */
  existingError?: { message: string } | null;
  /** Whether the ON CONFLICT DO NOTHING insert wins the claim. */
  claim?: boolean;
  claimError?: { message: string } | null;
  /** Whether the conditional re-claim UPDATE matches a row. */
  reclaim?: boolean;
  reclaimError?: { message: string } | null;
  /** Count the per-CATEGORY throttle query reports. */
  throttleCount?: number;
  /**
   * Count the per-TEMPLATE query reports (3.1). Zero means the recipient has
   * had none of this template inside the window, which is the first-of-its-kind
   * case the throttle must not eat.
   */
  sameTemplateCount?: number;
  /** email_suppressions row for the recipient. */
  supp?: { scope: string } | null;
  /** email_preferences row for the user. */
  prefs?: Record<string, unknown> | null;
}

function setupDb(cfg: DbConfig = {}) {
  updates.length = 0;
  logged.length = 0;
  reclaims.length = 0;
  throttleFilters.length = 0;
  const {
    existing = null,
    existingError = null,
    claim = true,
    claimError = null,
    reclaim = false,
    reclaimError = null,
    throttleCount = 0,
    sameTemplateCount = 0,
    supp = null,
    prefs = null,
  } = cfg;

  fromMock.mockImplementation((table: string) => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => {
          if (table === "email_suppressions") return { data: supp, error: null };
          if (table === "email_preferences") return { data: prefs, error: null };
          return { data: existing, error: existingError };
        },
        // R4.16 throttle chain: .contains(metadata, {category}).in(...).gte(...)
        contains: (_col: string, filter: Record<string, unknown>) => ({
          in: () => ({
            gte: async () => {
              throttleFilters.push(filter);
              return { count: throttleCount, error: null };
            },
          }),
        }),
        // 3.1 first-of-template chain: .eq(user).eq(template).in(...).gte(...)
        eq: () => ({
          in: () => ({
            gte: async () => ({ count: sameTemplateCount, error: null }),
          }),
        }),
        gte: async () => ({ count: throttleCount, error: null }),
      }),
    }),
    // Both the idempotency claim and logEvent go through upsert; only the claim
    // chains .select(), so the returned object serves both and records the row.
    upsert: (row: Record<string, unknown>) => {
      logged.push(row);
      return {
        select: () => ({
          maybeSingle: async () =>
            claimError
              ? { data: null, error: claimError }
              : { data: claim ? { id: "ee-1" } : null, error: null },
        }),
        then: (fn: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(fn),
      };
    },
    update: (row: Record<string, unknown>) => {
      updates.push(row);
      return {
        eq: (_col: string, _val: unknown) => ({
          // WS5.1 re-claim chain: .eq().neq().or().select().maybeSingle()
          neq: (ncol: string, nval: unknown) => ({
            or: (expr: string) => {
              reclaims.push({ row, neq: [ncol, nval], or: expr });
              return {
                select: () => ({
                  maybeSingle: async () =>
                    reclaimError
                      ? { data: null, error: reclaimError }
                      : { data: reclaim ? { id: "ee-1" } : null, error: null },
                }),
              };
            },
          }),
          // Plain status update: awaited directly.
          then: (fn: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(fn),
        }),
      };
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
  vi.restoreAllMocks();
});
beforeEach(() => {
  setupDb();
  renderMock.mockResolvedValue("<p>hi</p>");
  sendMock.mockResolvedValue({ data: { id: "msg-1" }, error: null });
});

describe("sendEmail with no RESEND_API_KEY (09 A.6 layer 2)", () => {
  it("reports a hard failure in production instead of a silent success", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
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

// ── WS5.4 (R4.8): EMAIL_DRY_RUN must not silence production ─────────────────
describe("EMAIL_DRY_RUN production guard (WS5.4)", () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.VERCEL_ENV = "production";
    process.env.EMAIL_DRY_RUN = "1";
    delete process.env.EMAIL_DRY_RUN_FORCE;
  });

  it("ignores the flag in production and sends for real, with a loud log", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await sendEmail(INPUT);

    // Fail-before: a leaked EMAIL_DRY_RUN skipped every production email with
    // ok:true while the health route stayed green.
    expect(res).toMatchObject({ ok: true, skipped: false });
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(updates.some((u) => u.status === "dry_run")).toBe(false);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("EMAIL_DRY_RUN"));
  });

  it("honours the flag in production when EMAIL_DRY_RUN_FORCE is also set", async () => {
    process.env.EMAIL_DRY_RUN_FORCE = "1";

    const res = await sendEmail(INPUT);

    expect(res).toEqual({ ok: true, skipped: true, reason: "dry_run" });
    expect(sendMock).not.toHaveBeenCalled();
  });
});

// ── WS5.1 (R4.3/R4.6/R4.9): claim semantics ─────────────────────────────────
describe("idempotency claim semantics (WS5.1)", () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.VERCEL_ENV = "preview";
  });

  it("reports duplicate for a key that already sent", async () => {
    setupDb({ existing: { id: "ee-0", status: "sent", created_at: new Date().toISOString() } });

    const res = await sendEmail(INPUT);

    expect(res).toEqual({ ok: true, skipped: true, reason: "duplicate" });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("reports duplicate for a fresh queued row (another caller mid-flight)", async () => {
    setupDb({ existing: { id: "ee-0", status: "queued", created_at: new Date().toISOString() } });

    const res = await sendEmail(INPUT);

    expect(res).toEqual({ ok: true, skipped: true, reason: "duplicate" });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("retries a key whose previous attempt failed, instead of burning it", async () => {
    // Fail-before (R4.3): ANY existing row made the ignoreDuplicates claim
    // return nothing, so a transient provider outage marked the email failed
    // and every later attempt, including a Stripe redelivery, was misreported
    // as `duplicate` ok:true. The key was burnt permanently.
    setupDb({
      existing: { id: "ee-0", status: "failed", created_at: new Date().toISOString() },
      claim: false,
      reclaim: true,
    });

    const res = await sendEmail(INPUT);

    expect(res).toMatchObject({ ok: true, skipped: false });
    expect(sendMock).toHaveBeenCalledTimes(1);
    // The atomic layer, not just the pre-check, decides: only `sent` blocks
    // outright, and a queued row blocks only while fresh.
    expect(reclaims).toHaveLength(1);
    expect(reclaims[0].neq).toEqual(["status", "sent"]);
    expect(reclaims[0].or).toContain("status.neq.queued");
    expect(reclaims[0].or).toContain("created_at.lt.");
    // The re-claim resets created_at so a concurrent second retry no longer
    // matches the stale window.
    expect(reclaims[0].row.created_at).toBeTruthy();
    expect(reclaims[0].row.status).toBe("queued");
  });

  it("re-claims a queued row older than an hour (stuck claim recovery)", async () => {
    // Fail-before (R4.9): a crash between the claim and the provider call left
    // `queued` forever, and `queued` was treated as duplicate with no sweeper.
    const twoHoursAgo = new Date(Date.now() - 2 * 3_600_000).toISOString();
    setupDb({
      existing: { id: "ee-0", status: "queued", created_at: twoHoursAgo },
      claim: false,
      reclaim: true,
    });

    const res = await sendEmail(INPUT);

    expect(res).toMatchObject({ ok: true, skipped: false });
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it("retries a dry_run row so a removed flag does not strand the email", async () => {
    setupDb({
      existing: { id: "ee-0", status: "dry_run", created_at: new Date().toISOString() },
      claim: false,
      reclaim: true,
    });

    const res = await sendEmail(INPUT);

    expect(res).toMatchObject({ ok: true, skipped: false });
  });

  it("reports duplicate when it loses the re-claim race", async () => {
    // A concurrent retry won the conditional UPDATE first; this caller must
    // dedupe, not double-send.
    setupDb({
      existing: { id: "ee-0", status: "failed", created_at: new Date().toISOString() },
      claim: false,
      reclaim: false,
    });

    const res = await sendEmail(INPUT);

    expect(res).toEqual({ ok: true, skipped: true, reason: "duplicate" });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("hard-fails when the claim insert errors, never reporting duplicate", async () => {
    // Fail-before (R4.6): the upsert error was discarded, `claimed` came back
    // null, and a Supabase blip made every in-flight email report
    // `skipped: "duplicate"`, ok:true, with nothing logged anywhere.
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    setupDb({ claim: false, claimError: { message: "connection refused" } });

    const res = await sendEmail(INPUT);

    expect(res).toEqual({ ok: false, error: "Idempotency claim failed: connection refused" });
    expect(sendMock).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("connection refused"));
  });

  it("hard-fails when the re-claim errors", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    setupDb({
      existing: { id: "ee-0", status: "failed", created_at: new Date().toISOString() },
      claim: false,
      reclaimError: { message: "boom" },
    });

    const res = await sendEmail(INPUT);

    expect(res).toEqual({ ok: false, error: "Idempotency claim failed: boom" });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("hard-fails when the pre-check errors", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    setupDb({ existingError: { message: "timeout" } });

    const res = await sendEmail(INPUT);

    expect(res).toEqual({ ok: false, error: "Idempotency check failed: timeout" });
    expect(sendMock).not.toHaveBeenCalled();
  });
});

// ── R4.16: the throttle counts per category, as CATEGORY_RULES documents ────
describe("throttle per category (R4.16)", () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.VERCEL_ENV = "preview";
  });

  const DIGEST_INPUT = { ...INPUT, category: "digests" as const, userId: "u-42" };

  it("filters prior sends by the category stamped in metadata, not by template", async () => {
    await sendEmail(DIGEST_INPUT);

    // Fail-before: the query was `.eq("template", input.template)`, so two
    // templates in one category throttled independently and every documented
    // cap was looser than designed.
    expect(throttleFilters).toEqual([{ category: "digests" }]);
    // Every row this module writes carries the stamp the filter relies on.
    expect(logged.some((r) => (r.metadata as Record<string, unknown>)?.category === "digests")).toBe(
      true,
    );
  });

  it("skips as throttled once the category cap is reached AND the recipient has had this template", async () => {
    setupDb({ throttleCount: 8, sameTemplateCount: 1 }); // digests cap: 8 per 168h

    const res = await sendEmail(DIGEST_INPUT);

    expect(res).toEqual({ ok: true, skipped: true, reason: "throttled" });
    expect(sendMock).not.toHaveBeenCalled();
    expect(logged.some((r) => r.status === "skipped_throttled")).toBe(true);
  });

  // Pass 2 item 3.1. Only three of production's 388 email events have ever been
  // skipped_throttled. All three happened on one day, all to the same artist,
  // and every one was the FIRST and only send of its kind:
  //
  //   placement_ended                    never told their placement ended
  //   artist_new_placement_invitation    never told a venue wanted their work
  //   artist_blog_rejected               and the rejection reason is stored
  //                                      nowhere else, so it reached them by no
  //                                      route at all
  //
  // The category cap is the right guard against a runaway batch of the SAME
  // nudge. It is the wrong guard against a person having a busy day: ten
  // distinct placement events in 24 hours is a good day, not an incident, and
  // binning the eleventh loses the event rather than deferring it.
  //
  // So the cap still applies, and the first send of each distinct template
  // inside the window is exempt from it. The worst case stays bounded: the cap,
  // plus at most one of each template.
  it("does NOT eat the first email of its kind, even over the category cap", async () => {
    setupDb({ throttleCount: 99, sameTemplateCount: 0 });

    const res = await sendEmail(DIGEST_INPUT);

    expect(res).toMatchObject({ ok: true });
    expect("skipped" in res && res.skipped).not.toBe(true);
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(logged.some((r) => r.status === "skipped_throttled")).toBe(false);
  });

  it("still throttles the second and later copies of the same template", async () => {
    setupDb({ throttleCount: 99, sameTemplateCount: 3 });

    const res = await sendEmail(DIGEST_INPUT);

    expect(res).toEqual({ ok: true, skipped: true, reason: "throttled" });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("does not run the first-of-template query at all while under the cap", async () => {
    // The exemption is a rescue, not a second gate: under the cap nothing
    // changes and the extra round trip is not spent.
    setupDb({ throttleCount: 0, sameTemplateCount: 99 });

    const res = await sendEmail(DIGEST_INPUT);

    expect("skipped" in res && res.skipped).not.toBe(true);
    expect(sendMock).toHaveBeenCalledTimes(1);
  });
});

// ── WS5.3 (R4.7): the one-click unsubscribe header must POST somewhere real ─
describe("List-Unsubscribe header (WS5.3)", () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.VERCEL_ENV = "preview";
  });

  it("points the URL arm at the POST-capable API endpoint, keeping the mailto arm", async () => {
    await sendEmail({ ...INPUT, category: "digests", userId: "u-42" });

    const call = sendMock.mock.calls[0][0] as { headers: Record<string, string> };
    const header = call.headers["List-Unsubscribe"];
    // Fail-before: the header advertised the GET-only page path
    // /account/email/unsubscribe, so mail-client one-click POSTs answered 405
    // and failed unsubscribes escalated into spam reports.
    expect(header).toContain("/api/account/email/unsubscribe?c=digests&u=u-42");
    expect(header).not.toContain(".co.uk/account/email/unsubscribe");
    expect(header).toContain("mailto:unsubscribe@wallplace.co.uk");
    expect(call.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  });

  it("omits the one-click POST header on critical categories", async () => {
    await sendEmail(INPUT); // security

    const call = sendMock.mock.calls[0][0] as { headers: Record<string, string> };
    expect(call.headers["List-Unsubscribe-Post"]).toBeUndefined();
  });
});

// ── R4.12: money-consequential templates cannot be suppressed ───────────────
describe("money-template category overrides (R4.12)", () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.VERCEL_ENV = "preview";
  });

  const OFFER_INPUT = {
    ...INPUT,
    template: "offer_received_notification",
    category: "placements" as const,
    userId: "u-42",
  };

  it("sends a purchase offer through an opt-out and vacation mode", async () => {
    // Fail-before: offers/route.ts files this under `placements`, so
    // placements_enabled=false or vacation mode silently dropped a money
    // event with an expiry, logged as an ok:true skip.
    setupDb({
      prefs: {
        placements_enabled: false,
        vacation_until: new Date(Date.now() + 86_400_000).toISOString(),
      },
    });

    const res = await sendEmail(OFFER_INPUT);

    expect(res).toMatchObject({ ok: true, skipped: false });
    expect(sendMock).toHaveBeenCalledTimes(1);
    // The resolved category, not the declared one, reaches the provider tags
    // and the stamped metadata.
    const call = sendMock.mock.calls[0][0] as { tags: { name: string; value: string }[] };
    expect(call.tags).toContainEqual({ name: "category", value: "orders_and_payouts" });
    expect(
      logged.some((r) => (r.metadata as Record<string, unknown>)?.category === "orders_and_payouts"),
    ).toBe(true);
  });

  it("still honours the toggle for templates that are not overridden", async () => {
    setupDb({ prefs: { placements_enabled: false } });

    const res = await sendEmail({
      ...INPUT,
      template: "venue_new_placement_request",
      category: "placements",
      userId: "u-42",
    });

    expect(res).toEqual({ ok: true, skipped: true, reason: "opted_out" });
    expect(sendMock).not.toHaveBeenCalled();
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
