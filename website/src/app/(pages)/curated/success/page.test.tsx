// @vitest-environment jsdom
//
// D24. The curation success page used to be a static component that always read
// "Payment received." with no session lookup, so a buyer whose payment had not
// settled (or who reached the URL with a bad session id) was told the money was
// taken when it may not have been. It is now a server component that retrieves
// the Stripe checkout session and branches on payment_status. These tests pin
// each branch; the "unpaid" case is the one that fails against the old static page.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const { retrieveMock } = vi.hoisted(() => ({ retrieveMock: vi.fn() }));

vi.mock("@/lib/stripe", () => ({
  stripe: { checkout: { sessions: { retrieve: retrieveMock } } },
}));

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

import CurationSuccessPage from "./page";

afterEach(() => {
  cleanup();
  retrieveMock.mockReset();
});

/** Await the async server component and render its element. */
async function renderPage(searchParams: { session_id?: string }) {
  const ui = await CurationSuccessPage({ searchParams: Promise.resolve(searchParams) });
  render(ui);
}

describe("Curation success page (D24)", () => {
  it("confirms receipt only when the Stripe session is paid", async () => {
    retrieveMock.mockResolvedValue({ payment_status: "paid" });

    await renderPage({ session_id: "cs_paid" });

    expect(retrieveMock).toHaveBeenCalledWith("cs_paid");
    expect(screen.getByText(/your curation is underway/i)).toBeTruthy();
    expect(screen.getByText(/Payment received/i)).toBeTruthy();
  });

  it("does NOT claim receipt when the payment is not yet paid", async () => {
    retrieveMock.mockResolvedValue({ payment_status: "unpaid" });

    await renderPage({ session_id: "cs_unpaid" });

    // The crux, and the fail-before: the old static page always said "Payment received".
    expect(screen.queryByText(/Payment received/i)).toBeNull();
    expect(screen.getByText(/confirming your payment/i)).toBeTruthy();
  });

  it("shows the processing state, not a receipt, when the session cannot be retrieved", async () => {
    retrieveMock.mockRejectedValue(new Error("no such session"));

    await renderPage({ session_id: "cs_bad" });

    expect(screen.queryByText(/Payment received/i)).toBeNull();
    expect(screen.getByText(/confirming your payment/i)).toBeTruthy();
  });

  it("shows a neutral start state and never calls Stripe when there is no session id", async () => {
    await renderPage({});

    expect(retrieveMock).not.toHaveBeenCalled();
    expect(screen.queryByText(/Payment received/i)).toBeNull();
    expect(screen.getByText(/Start your curation/i)).toBeTruthy();
  });
});
