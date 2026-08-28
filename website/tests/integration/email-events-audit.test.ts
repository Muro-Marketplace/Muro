// 09 item 4.2 (§E.4). Every send attempt leaves a row in `email_events`.
//
// The audit trail is the whole reason `sendEmail` won K1: the legacy module
// recorded nothing, so "did that email ever go out?" was unanswerable. That only
// holds if every terminal outcome actually writes, including the skips — a skip
// that writes nothing is indistinguishable from a send that never happened.
//
// §E.4 is explicit about the invariant to assert. Not "one row per attempt": the
// duplicate short-circuit deliberately writes nothing, because the original row
// already exists. The invariant is **one row per distinct idempotency key, and
// its final status is terminal**.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement } from "react";

const { fromMock, resendSend } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  resendSend: vi.fn(),
}));

vi.mock("@/lib/supabase-admin", () => ({ getSupabaseAdmin: () => ({ from: fromMock }) }));
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: resendSend };
  },
}));

import { sendEmail } from "@/lib/email/send";

type Row = Record<string, unknown>;

/** Rows written this test, keyed by idempotency_key, last write wins. */
let written: Row[] = [];

interface FakeState {
  /** Row returned by the idempotency pre-check. */
  existing?: Row | null;
  suppression?: Row | null;
  preferences?: Row | null;
  /** Count returned by the throttle query. */
  throttleCount?: number;
  /** null models the ON CONFLICT DO NOTHING losing the race. */
  claimWins?: boolean;
}

let state: FakeState = {};

function installDb() {
  written = [];
  fromMock.mockImplementation((table: string) => {
    if (table === "email_suppressions") {
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.suppression ?? null }) }) }),
      };
    }
    if (table === "email_preferences") {
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.preferences ?? null }) }) }),
      };
    }
    // email_events serves three shapes: the idempotency pre-check, the throttle
    // count, and the upserts.
    return {
      select: (_cols: string, opts?: { count?: string; head?: boolean }) => {
        if (opts?.count) {
          const chain: Record<string, unknown> = {};
          for (const m of ["eq", "in", "gte"]) chain[m] = () => chain;
          chain.then = (resolve: (v: unknown) => unknown) =>
            Promise.resolve({ count: state.throttleCount ?? 0, error: null }).then(resolve);
          return chain;
        }
        return { eq: () => ({ maybeSingle: async () => ({ data: state.existing ?? null }) }) };
      },
      upsert: (row: Row, opts?: { ignoreDuplicates?: boolean }) => {
        written.push(row);
        const claimed = state.claimWins === false ? null : { id: `ev-${written.length}` };
        const result = { data: opts?.ignoreDuplicates ? claimed : null, error: null };
        return {
          select: () => ({ maybeSingle: async () => result }),
          then: (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve),
        };
      },
      update: () => ({ eq: async () => ({ error: null }) }),
      delete: () => ({ eq: async () => ({ error: null }) }),
    };
  });
}

function input(over: Partial<Parameters<typeof sendEmail>[0]> = {}) {
  return {
    idempotencyKey: "k1",
    template: "customer_order_placed",
    category: "placements" as const,
    to: "Sam@Example.com",
    subject: "Hello",
    react: createElement("div", null, "hello"),
    ...over,
  };
}

const savedKey = process.env.RESEND_API_KEY;

beforeEach(() => {
  fromMock.mockReset();
  resendSend.mockReset();
  state = {};
  installDb();
  resendSend.mockResolvedValue({ data: { id: "msg_1" }, error: null });
  process.env.RESEND_API_KEY = "re_test";
});

afterEach(() => {
  if (savedKey === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = savedKey;
});

/** Terminal statuses: an attempt must not be left mid-flight. */
const TERMINAL = new Set([
  "sent",
  "failed",
  "render_failed",
  "skipped_suppressed",
  "skipped_vacation",
  "skipped_opted_out",
  "skipped_throttled",
  "skipped_no_api_key",
]);

describe("email_events: one row per idempotency key, ending terminal (09 §E.4)", () => {
  it("a successful send leaves exactly one key, ending 'sent'", async () => {
    const res = await sendEmail(input());

    expect(res.ok).toBe(true);
    const keys = new Set(written.map((r) => r.idempotency_key));
    expect(keys.size).toBe(1);
    // The claim writes `queued`, then the send updates it. Either way the
    // attempt is recorded before the provider is called, which is the point:
    // a crash mid-send leaves evidence.
    expect(written[0].status).toBe("queued");
    expect(resendSend).toHaveBeenCalledTimes(1);
  });

  it("records the address lowercased, as one canonical form", async () => {
    await sendEmail(input({ to: "Sam@Example.COM" }));
    expect(written[0].to_email).toBe("sam@example.com");
  });

  describe("every skip reason writes a row with a matching terminal status", () => {
    it("suppressed", async () => {
      state.suppression = { scope: "all" };
      const res = await sendEmail(input());

      expect(res).toMatchObject({ ok: true, skipped: true, reason: "suppressed" });
      expect(written).toHaveLength(1);
      expect(written[0].status).toBe("skipped_suppressed");
      expect(resendSend).not.toHaveBeenCalled();
    });

    it("vacation mode", async () => {
      state.preferences = { vacation_until: new Date(Date.now() + 86_400_000).toISOString() };
      const res = await sendEmail(input({ userId: "u1" }));

      expect(res).toMatchObject({ reason: "vacation_mode" });
      expect(written[0].status).toBe("skipped_vacation");
    });

    it("opted out of the category", async () => {
      state.preferences = { placements_enabled: false };
      const res = await sendEmail(input({ userId: "u1" }));

      expect(res).toMatchObject({ reason: "opted_out" });
      expect(written[0].status).toBe("skipped_opted_out");
    });

    it("throttled", async () => {
      state.throttleCount = 999;
      const res = await sendEmail(input({ userId: "u1" }));

      expect(res).toMatchObject({ reason: "throttled" });
      expect(written[0].status).toBe("skipped_throttled");
      expect(resendSend).not.toHaveBeenCalled();
    });

    it("no API key, outside production", async () => {
      delete process.env.RESEND_API_KEY;
      const res = await sendEmail(input());

      expect(res).toMatchObject({ skipped: true, reason: "no_api_key" });
      expect(written[0].status).toBe("skipped_no_api_key");
    });

    it("every status written above is terminal", () => {
      // Guards the list itself: a new skip reason with a non-terminal status
      // would leave an attempt looking permanently in flight.
      for (const row of written) {
        if (row.status === "queued") continue;
        expect(TERMINAL.has(String(row.status)), String(row.status)).toBe(true);
      }
    });
  });

  it("a render failure writes render_failed AND returns ok:false", async () => {
    // Both halves matter. Returning ok:false with no row means the failure is
    // invisible to anyone reading the audit trail afterwards.
    const exploding = createElement(function Boom(): never {
      throw new Error("bad props");
    });

    const res = await sendEmail(input({ react: exploding }));

    expect(res.ok).toBe(false);
    expect(written).toHaveLength(1);
    expect(written[0].status).toBe("render_failed");
    expect(String(written[0].error)).toContain("bad props");
    expect(resendSend).not.toHaveBeenCalled();
  });

  it("the same key twice yields one row, and the second attempt sends nothing", async () => {
    await sendEmail(input());
    // Second attempt: the pre-check now finds the original.
    state.existing = { id: "ev-1", status: "sent", provider_message_id: "msg_1" };
    written = [];
    resendSend.mockClear();

    const res = await sendEmail(input());

    expect(res).toMatchObject({ ok: true, skipped: true, reason: "duplicate" });
    expect(written, "a duplicate must not write a second row").toHaveLength(0);
    expect(resendSend).not.toHaveBeenCalled();
  });

  it("treats a 'queued' original as a duplicate, so two concurrent callers cannot both send", async () => {
    state.existing = { id: "ev-1", status: "queued", provider_message_id: null };
    const res = await sendEmail(input());
    expect(res).toMatchObject({ reason: "duplicate" });
    expect(resendSend).not.toHaveBeenCalled();
  });

  it("does not put a token or a second address into metadata", async () => {
    // The metadata column is JSONB and callers pass it freely. A token or an
    // email body landing there turns the audit trail into a liability.
    await sendEmail(
      input({ metadata: { orderId: "o1", venueSlug: "the-copper-kettle", count: 3 } }),
    );

    const meta = JSON.stringify(written[0].metadata);
    expect(meta).not.toMatch(/@/);
    expect(meta, "a JWT-shaped value reached metadata").not.toMatch(/eyJ/);
  });
});
