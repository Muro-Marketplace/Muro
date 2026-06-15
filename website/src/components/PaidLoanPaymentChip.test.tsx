// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import PaidLoanPaymentChip from "./PaidLoanPaymentChip";

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

  it("renders nothing once the subscription is active", () => {
    const { container } = render(
      <PaidLoanPaymentChip
        placementId="p1"
        arrangementType="paid_loan"
        monthlyFeeGbp={50}
        liveFrom={null}
        subscriptionStatus="active"
        role="venue"
      />,
    );
    expect(container.firstChild).toBeNull();
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
