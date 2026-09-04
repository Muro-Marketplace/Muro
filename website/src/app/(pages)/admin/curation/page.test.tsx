// @vitest-environment jsdom
//
// G10 + G12. Two defects on the curation admin surface:
//
//   G10  The status <select> only listed the eight admin-settable statuses.
//        The daily managed-curation reconciler writes past_due and paused,
//        so a controlled select on such a row matched no option, rendered
//        blank, and any subsequent change silently overwrote reconciler
//        state.
//   G12  refundRow threw the mutate response away and reloaded, so an admin
//        could not tell "refunded £120" from "subscription cancelled, there
//        was no paid invoice to refund" even though the API reports both.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const { authFetchMock, mutateMock } = vi.hoisted(() => ({
  authFetchMock: vi.fn(),
  mutateMock: vi.fn(),
}));

vi.mock("@/lib/api-client", () => ({
  authFetch: authFetchMock,
  mutate: mutateMock,
  ApiError: class ApiError extends Error {
    code?: string;
  },
}));
// The layout runs its own whoami gate; this test is about the page.
vi.mock("@/components/AdminPortalLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import AdminCurationPage from "./page";
import { CURATION_TIER_KEYS } from "@/lib/curation-tiers";

function row(over: Record<string, unknown> = {}) {
  return {
    id: "cr-1",
    venue_name: "Copper Kettle",
    contact_name: "Sam Reed",
    contact_email: "sam@copperkettle.co.uk",
    contact_phone: "",
    tier: "single_wall",
    venue_type: "cafe",
    location: "Hackney",
    style_notes: "",
    audience_notes: "",
    mood_notes: "",
    budget_gbp: "",
    wall_count: 2,
    timeframe: "",
    references_notes: "",
    status: "paid",
    amount_paid_gbp: 120,
    stripe_payment_intent_id: "pi_1",
    stripe_subscription_id: null,
    paid_at: "2026-08-01T10:00:00.000Z",
    admin_notes: "",
    created_at: "2026-08-01T09:00:00.000Z",
    updated_at: "2026-08-01T09:00:00.000Z",
    ...over,
  };
}

function listReply(rows: unknown[]) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ requests: rows }),
  } as unknown as Response;
}

beforeEach(() => {
  authFetchMock.mockReset();
  mutateMock.mockReset();
  authFetchMock.mockResolvedValue(listReply([row()]));
  mutateMock.mockResolvedValue({ success: true });
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function expandFirstRow() {
  fireEvent.click(await screen.findByText("Copper Kettle"));
}

describe("G10: reconciler-owned statuses render honestly", () => {
  it("shows past_due as the selected value rather than falling back to the first option", async () => {
    authFetchMock.mockResolvedValue(
      listReply([row({ status: "past_due", stripe_subscription_id: "sub_1" })]),
    );
    render(<AdminCurationPage />);
    await expandFirstRow();

    const select = (await screen.findByRole("combobox")) as HTMLSelectElement;
    expect(select.value).toBe("past_due");
  });

  it("shows paused as the selected value", async () => {
    authFetchMock.mockResolvedValue(
      listReply([row({ status: "paused", stripe_subscription_id: "sub_1" })]),
    );
    render(<AdminCurationPage />);
    await expandFirstRow();

    const select = (await screen.findByRole("combobox")) as HTMLSelectElement;
    expect(select.value).toBe("paused");
  });

  it("does not let an admin choose a reconciler-owned status on a normal row", async () => {
    render(<AdminCurationPage />);
    await expandFirstRow();

    const select = (await screen.findByRole("combobox")) as HTMLSelectElement;
    const values = Array.from(select.options).map((o) => o.value);
    expect(values).not.toContain("past_due");
    expect(values).not.toContain("paused");
  });

  it("offers the reconciler status as a disabled option, so it cannot be re-picked", async () => {
    authFetchMock.mockResolvedValue(listReply([row({ status: "past_due" })]));
    render(<AdminCurationPage />);
    await expandFirstRow();

    const select = (await screen.findByRole("combobox")) as HTMLSelectElement;
    const pastDue = Array.from(select.options).find((o) => o.value === "past_due");
    expect(pastDue).toBeTruthy();
    expect(pastDue!.disabled).toBe(true);
  });
});

describe("G12: the refund outcome says whether money moved", () => {
  it("reports the amount when Stripe actually refunded", async () => {
    mutateMock.mockResolvedValue({
      success: true,
      refunded: true,
      refundedPence: 12000,
      subscriptionCancelled: false,
      status: "refunded",
    });
    render(<AdminCurationPage />);
    await expandFirstRow();
    fireEvent.click(await screen.findByText("Refund via Stripe"));

    expect(await screen.findByText(/Refunded £120\.00/)).toBeTruthy();
  });

  it("says nothing was refunded when a managed row had no paid invoice", async () => {
    authFetchMock.mockResolvedValue(
      listReply([row({ stripe_payment_intent_id: null, stripe_subscription_id: "sub_1" })]),
    );
    mutateMock.mockResolvedValue({
      success: true,
      refunded: false,
      refundedPence: 0,
      subscriptionCancelled: true,
      status: "cancelled",
    });
    render(<AdminCurationPage />);
    await expandFirstRow();
    fireEvent.click(await screen.findByText("Cancel and refund via Stripe"));

    expect(
      await screen.findByText(/Subscription cancelled, there was nothing to refund/i),
    ).toBeTruthy();
  });

  it("still reloads the list after a refund", async () => {
    mutateMock.mockResolvedValue({ success: true, refunded: true, refundedPence: 12000, status: "refunded" });
    render(<AdminCurationPage />);
    await expandFirstRow();
    fireEvent.click(await screen.findByText("Refund via Stripe"));

    // One load on mount, one after the refund.
    await waitFor(() => expect(authFetchMock).toHaveBeenCalledTimes(2));
  });
});

describe("every curation tier gets a human label", () => {
  // The map that renders these badges is a hand-written mirror of
  // CURATION_TIERS, so it drifts silently: `programme` shipped in the tier
  // config without a label here, and programme rows rendered the raw enum
  // string at an admin. Driving the cases off CURATION_TIER_KEYS means the
  // next tier added cannot repeat it.
  it.each(CURATION_TIER_KEYS)("does not render the raw key for %s", async (tier) => {
    authFetchMock.mockResolvedValue(listReply([row({ tier })]));
    render(<AdminCurationPage />);
    await screen.findByText("Copper Kettle");

    expect(screen.queryByText(tier)).toBeNull();
  });

  it("labels a programme row Programme", async () => {
    authFetchMock.mockResolvedValue(listReply([row({ tier: "programme" })]));
    render(<AdminCurationPage />);
    await screen.findByText("Copper Kettle");

    expect(screen.getByText("Programme")).toBeTruthy();
  });
});
