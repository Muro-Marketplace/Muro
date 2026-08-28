// C4/C18 (QA 2026-08-28). /customer-portal/orders never existed as a route,
// yet refund/order emails, the refund-approved bell notification and the
// /orders/[id] back-link all deep-linked to it. This page is now a server
// redirect to the /customer-portal dashboard that preserves the query string
// (rescuing every link already sent) and maps the legacy bell param ?id= onto
// ?order=, which is what the dashboard actually reads (useUrlState("order")).

import { beforeEach, describe, expect, it, vi } from "vitest";

// Real next/navigation redirect() throws NEXT_REDIRECT; mirror that so the
// component's control flow matches production.
const redirectMock = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
);
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

import CustomerPortalOrdersRedirect from "./page";

async function redirectedTo(
  params: Record<string, string | string[] | undefined>,
): Promise<string | undefined> {
  await expect(
    CustomerPortalOrdersRedirect({ searchParams: Promise.resolve(params) }),
  ).rejects.toThrow(/NEXT_REDIRECT/);
  return redirectMock.mock.calls.at(-1)?.[0];
}

beforeEach(() => {
  redirectMock.mockClear();
});

describe("legacy /customer-portal/orders redirect (C4/C18)", () => {
  it("redirects a bare hit to the dashboard", async () => {
    expect(await redirectedTo({})).toBe("/customer-portal");
  });

  it("preserves the query string", async () => {
    expect(await redirectedTo({ order: "ord-1", status: "delivered" })).toBe(
      "/customer-portal?order=ord-1&status=delivered",
    );
  });

  it("maps the legacy bell param ?id= onto ?order=", async () => {
    // Fail-before: even if the route had existed, the bell link's ?id= was a
    // param the dashboard never reads.
    expect(await redirectedTo({ id: "ord-9" })).toBe("/customer-portal?order=ord-9");
  });

  it("does not clobber an explicit ?order= with a legacy ?id=", async () => {
    const url = await redirectedTo({ id: "legacy", order: "explicit" });
    expect(url).toContain("order=explicit");
    expect(url).toContain("id=legacy");
  });

  it("keeps repeated params intact", async () => {
    expect(await redirectedTo({ status: ["a", "b"] })).toBe(
      "/customer-portal?status=a&status=b",
    );
  });
});
