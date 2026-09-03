// @vitest-environment jsdom
// The Send step: one button opens a compact request whose arrangements are
// exactly what the venue is open to, the terms follow the request form's
// defaults, and refusals are shown where the artist is looking.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

import ProposalSendPanel from "./ProposalSendPanel";

const VENUE = {
  slug: "copper-kettle",
  name: "The Copper Kettle",
  interestedInRevenueShare: true,
  interestedInFreeLoan: true,
  interestedInDirectPurchase: false,
};

afterEach(() => cleanup());

function mount(overrides: Partial<React.ComponentProps<typeof ProposalSendPanel>> = {}) {
  const onSend = vi.fn();
  render(
    <ProposalSendPanel
      venue={VENUE}
      wallName="Front room"
      status="idle"
      error={null}
      onSend={onSend}
      {...overrides}
    />,
  );
  return { onSend };
}

describe("<ProposalSendPanel />", () => {
  it("starts as a single Send button and opens the request on click", () => {
    mount();
    expect(screen.queryByRole("form")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Send to The Copper Kettle" }));
    expect(screen.getByRole("form", { name: "Send to The Copper Kettle" })).toBeTruthy();
  });

  it("offers only the arrangements the venue is open to, prefills the terms, and sends them", () => {
    const { onSend } = mount();
    fireEvent.click(screen.getByRole("button", { name: "Send to The Copper Kettle" }));

    expect(screen.getByRole("radio", { name: "Revenue share" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Paid loan" })).toBeTruthy();
    expect(screen.queryByRole("radio", { name: "Direct purchase" })).toBeNull();

    const share = screen.getByLabelText("Revenue share to venue") as HTMLInputElement;
    expect(share.value).toBe("25");
    const message = screen.getByLabelText("Message to The Copper Kettle") as HTMLTextAreaElement;
    expect(message.value).toBe(
      'Hi The Copper Kettle, here\'s how my work could look on your "Front room" wall.',
    );

    fireEvent.change(share, { target: { value: "30" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(onSend).toHaveBeenCalledWith({
      arrangement: "revenue_share",
      revenueSharePercent: 30,
      monthlyFeeGbp: 25,
      qrEnabled: true,
      qrRevenueSharePercent: 20,
      message: 'Hi The Copper Kettle, here\'s how my work could look on your "Front room" wall.',
    });
  });

  it("switches to the loan fee for a paid loan and holds it to the rent floor before sending", () => {
    const { onSend } = mount();
    fireEvent.click(screen.getByRole("button", { name: "Send to The Copper Kettle" }));
    fireEvent.click(screen.getByRole("radio", { name: "Paid loan" }));

    expect(screen.queryByLabelText("Revenue share to venue")).toBeNull();
    const fee = screen.getByLabelText("Monthly fee from venue") as HTMLInputElement;
    expect(fee.value).toBe("25");

    fireEvent.change(fee, { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(onSend).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toMatch(/start at £15/);

    fireEvent.change(fee, { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(onSend).toHaveBeenCalledWith(expect.objectContaining({ arrangement: "loan", monthlyFeeGbp: 0 }));
  });

  it("shows the server's refusal word for word and disables the controls while sending", () => {
    const { rerender } = render(
      <ProposalSendPanel venue={VENUE} wallName="Front room" status="idle" error={null} onSend={() => {}} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Send to The Copper Kettle" }));

    rerender(
      <ProposalSendPanel venue={VENUE} wallName="Front room" status="sending" error={null} onSend={() => {}} />,
    );
    expect((screen.getByRole("button", { name: "Sending…" }) as HTMLButtonElement).disabled).toBe(true);

    const copy = "Your application is still under review. You'll be able to send placement requests once we've approved your profile.";
    rerender(
      <ProposalSendPanel venue={VENUE} wallName="Front room" status="error" error={copy} onSend={() => {}} />,
    );
    expect(screen.getByRole("alert").textContent).toBe(copy);
    expect(screen.getByRole("button", { name: "Send" })).toBeTruthy();
  });

  it("reads Sent with the way back to My Placements and the venue", () => {
    mount({ status: "sent" });
    expect(screen.getByRole("status").textContent).toMatch(/Sent to The Copper Kettle/);
    expect(screen.getByRole("link", { name: "View My Placements" }).getAttribute("href")).toBe(
      "/artist-portal/placements",
    );
    expect(screen.getByRole("link", { name: "Back to The Copper Kettle" }).getAttribute("href")).toBe(
      "/venues/copper-kettle",
    );
  });

  it("has no Send when the venue is open to nothing", () => {
    mount({
      venue: { ...VENUE, interestedInRevenueShare: false, interestedInFreeLoan: false },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send to The Copper Kettle" }));
    expect(screen.getByText(/isn\u2019t open to placement requests/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Send" })).toBeNull();
  });
});
