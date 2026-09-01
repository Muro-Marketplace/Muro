// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from "vitest";
import type { ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import PaidLoanPaymentChip from "./PaidLoanPaymentChip";

// Every test in this file renders the same component with different props, so
// a leaked mount from the previous test matches the next one's query and the
// failure reads as a bug in the component. Unmount between tests.
afterEach(() => cleanup());

// next/link needs no router behaviour here; render it as a plain anchor.
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

describe("PaidLoanPaymentChip — N3 entry-point reachability", () => {
  it("shows the venue 'Set up payment' chip for a paid_loan placement even when monthlyFeeGbp is not populated", () => {
    // The old guard (`arrangementType === "free_loan" || fee > 0`) returned
    // null here, so the venue had no way into billing setup.
    render(
      <PaidLoanPaymentChip
        placementId="p1"
        arrangementType="paid_loan"
        monthlyFeeGbp={null}
        liveFrom={null}
        subscriptionStatus={null}
        role="venue"
      />,
    );
    expect(screen.getByText("Set up payment")).toBeTruthy();
  });

  it("shows the ACTIVE banner once the subscription is running (owner decision 2026-08-28)", () => {
    // Used to render nothing, which made a running payment indistinguishable
    // from a missing one. Both parties now get a loud confirmation.
    render(
      <PaidLoanPaymentChip
        placementId="p1"
        arrangementType="paid_loan"
        monthlyFeeGbp={50}
        liveFrom={null}
        subscriptionStatus="active"
        role="venue"
        currentPeriodEnd="2026-09-28T00:00:00Z"
      />,
    );
    expect(screen.getByText(/Monthly payment active, £50.00\/mo/)).toBeTruthy();
    expect(screen.getByText(/Next payment on 28 September/)).toBeTruthy();
  });

  it("renders nothing for an outright purchase", () => {
    const { container } = render(
      <PaidLoanPaymentChip
        placementId="p1"
        arrangementType="purchase"
        monthlyFeeGbp={null}
        liveFrom={null}
        subscriptionStatus={null}
        role="venue"
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing for a free_loan display with no fee (nothing to bill)", () => {
    const { container } = render(
      <PaidLoanPaymentChip
        placementId="p1"
        arrangementType="free_loan"
        monthlyFeeGbp={null}
        liveFrom={null}
        subscriptionStatus={null}
        role="venue"
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});

// Rows 2179-2187 / PASS2-offers-and-paid-loan-log. After the venue cancelled a
// paid-loan placement, this banner still read "Monthly payment active,
// £12.00/mo. Next payment on 30 September. Manage it any time from this page."
// on the same page that said Cancelled at the top.
//
// Three separate untruths: the payment is not active, there is no next payment
// (30 September is the last day of cover), and there is no manage control on
// that page in any state.
describe("a subscription winding down after a cancellation", () => {
  const winding = {
    placementId: "p1",
    arrangementType: "free_loan",
    monthlyFeeGbp: 12,
    liveFrom: "2026-08-01T00:00:00.000Z",
    subscriptionStatus: "active",
    currentPeriodEnd: "2026-09-30T16:04:45.000Z",
    cancelAtPeriodEnd: true,
  } as const;

  it("does not call the payment active", () => {
    render(<PaidLoanPaymentChip {...winding} role="venue" />);

    expect(screen.queryByText(/Monthly payment active/i)).toBeNull();
  });

  it("tells the venue the money has stopped and when cover ends", () => {
    render(<PaidLoanPaymentChip {...winding} role="venue" />);

    expect(screen.getByText(/won.t be charged again/i)).toBeTruthy();
    expect(screen.getByText(/30 September/)).toBeTruthy();
  });

  it("promises no management control that does not exist", () => {
    render(<PaidLoanPaymentChip {...winding} role="venue" />);

    expect(screen.queryByText(/Manage it any time/i)).toBeNull();
  });

  it("tells the artist their payments are ending, not that they are running", () => {
    render(<PaidLoanPaymentChip {...winding} role="artist" />);

    expect(screen.queryByText(/is set up. Next payment/i)).toBeNull();
    expect(screen.getByText(/last payment/i)).toBeTruthy();
  });

  it("leaves a genuinely running subscription reading as running", () => {
    render(<PaidLoanPaymentChip {...winding} cancelAtPeriodEnd={false} role="venue" />);

    expect(screen.getByText(/Monthly payment active/i)).toBeTruthy();
  });
});
