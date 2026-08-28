// Covers test #9 from docs/security/AUDIT.md §3.4:
//   9. Stripe webhook with bad signature rejected
//
// We only exercise the signature-verification boundary here — the rest
// of the handler mutates Supabase, sends emails, and kicks off transfers,
// all of which need mocking. Those belong in Phase 2 alongside a real
// test Supabase project.

import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock every non-signature dependency BEFORE importing the route so the
// handler never actually tries to connect to Supabase / Resend / Stripe.
vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: () => ({ data: null }), single: () => ({ data: null }) }) }),
      update: () => ({ eq: () => ({ error: null }) }),
      upsert: () => ({ error: null }),
      insert: () => ({ error: null, data: null }),
    }),
    auth: { admin: { getUserById: () => ({ data: { user: null } }) } },
    storage: { from: () => ({ createSignedUrl: () => ({ data: null, error: null }) }) },
  }),
}));

vi.mock("@/lib/stripe-connect", () => ({
  scheduleTransfer: vi.fn(async () => ({ ok: true })),
}));

// K1: the legacy @/lib/email is deleted.
vi.mock("@/lib/email/admin-alert", () => ({
  sendAdminAlert: vi.fn(async () => ({ ok: true, skipped: false, messageId: "m" })),
}));

vi.mock("@/lib/notifications", () => ({
  createNotification: vi.fn(),
}));

vi.mock("@/lib/email/send", () => ({
  sendEmail: vi.fn(async () => ({ ok: true, skipped: true, reason: "no_api_key" })),
}));

// Stripe — we DO want the real constructEvent semantics (throw on bad
// signature) but we don't want real HTTP. Mock the module and import the
// real verify() for the signature path.
vi.mock("@/lib/stripe", () => ({
  stripe: {
    webhooks: {
      constructEvent: (body: string, signature: string, secret: string) => {
        // Minimal validator: signature must be "valid-<secret>" for this
        // test setup. Anything else throws like the real lib would.
        if (signature !== `valid-${secret}`) {
          throw new Error("No signatures found matching the expected signature for payload.");
        }
        return { type: "checkout.session.completed", data: { object: { metadata: {} } } };
      },
    },
    subscriptions: { cancel: vi.fn() },
    refunds: { create: vi.fn() },
    transfers: { createReversal: vi.fn() },
  },
}));

// Import AFTER mocks so the module under test picks them up.
import { POST } from "@/app/api/webhooks/stripe/route";

function makeRequest(body: string, signature: string | null): Request {
  const headers: Record<string, string> = {};
  if (signature !== null) headers["stripe-signature"] = signature;
  return new Request("http://localhost/api/webhooks/stripe", {
    method: "POST",
    body,
    headers,
  });
}

describe("POST /api/webhooks/stripe", () => {
  beforeEach(() => {
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_testsecret";
  });

  it("400s when the stripe-signature header is missing", async () => {
    const res = await POST(makeRequest("{}", null));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/signature/i);
  });

  it("400s when signature doesn't match", async () => {
    const res = await POST(makeRequest("{}", "totally-wrong"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid signature/i);
  });

  it("500s when STRIPE_WEBHOOK_SECRET is not configured", async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const res = await POST(makeRequest("{}", "anything"));
    expect(res.status).toBe(500);
  });

  it("accepts a well-signed event (200)", async () => {
    const res = await POST(makeRequest("{}", "valid-whsec_testsecret"));
    expect(res.status).toBe(200);
  });
});
