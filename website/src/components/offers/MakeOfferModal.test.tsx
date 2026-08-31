// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, act, waitFor } from "@testing-library/react";

// --- module mocks ---

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "venue-1" },
    userType: "venue",
    loading: false,
  }),
}));

vi.mock("@/context/ToastContext", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

// 05: the offer POST goes through mutate now (throws on a non-2xx). importActual
// pulls in the real module, which reaches @/lib/supabase, so stub that too.
vi.mock("@/lib/supabase", () => ({ supabase: { auth: {}, from: () => ({}) } }));
const { mutateMock } = vi.hoisted(() => ({ mutateMock: vi.fn().mockResolvedValue({}) }));
vi.mock("@/lib/api-client", async (orig) => {
  const actual = await orig<typeof import("@/lib/api-client")>();
  return { ...actual, mutate: mutateMock };
});

import MakeOfferModal from "./MakeOfferModal";

afterEach(() => {
  cleanup();
  mutateMock.mockClear();
  mutateMock.mockResolvedValue({});
});

const baseProps = {
  open: true,
  onClose: vi.fn(),
  artistSlug: "maya-chen",
  artistName: "Maya Chen",
  workIds: ["work-1"],
  workTitle: "Copper Still Life",
  askingPriceGbp: 500,
};

describe("<MakeOfferModal /> success state", () => {
  it("shows a close control in the success state that calls onClose", async () => {
    const onClose = vi.fn();

    // Render with submitted=true by submitting the form.
    const { rerender } = render(<MakeOfferModal {...baseProps} onClose={onClose} />);

    // Manually put the modal into the submitted/success branch by re-rendering
    // with a controlled submitted prop — but because submitted is internal state,
    // we drive it via the submit path. For the unit test we can also just set
    // submitted to true by mocking authFetch to resolve immediately and clicking.

    // Fill in a valid amount then submit.
    const amountInput = screen.getByPlaceholderText("0.00");
    fireEvent.change(amountInput, { target: { value: "400" } });

    const submitButton = screen.getByRole("button", { name: /send offer/i });
    await act(async () => {
      fireEvent.click(submitButton);
    });

    // After a successful fetch, the success state should be visible.
    expect(screen.getByText(/offer sent/i)).toBeTruthy();

    // A close control must be present and call onClose when clicked.
    const closeBtn = screen.getByRole("button", { name: /close/i });
    expect(closeBtn).toBeTruthy();
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalled();
  });
});

// Row 934 / PASS2 "silent failure" pattern. An offer below the 60% floor sent
// no request and said nothing: `min={minPriceGbp}` on the input left the
// refusal to the browser, and the modal's own error slot, three lines below the
// amount field, stayed empty. The server's rejection is well worded and carries
// the exact figure; the user never got that far.
describe("MakeOfferModal refuses a below-floor offer out loud (row 934)", () => {
  const renderModal = (over: Record<string, unknown> = {}) =>
    render(<MakeOfferModal {...baseProps} {...over} />);

  it("names the minimum instead of doing nothing", async () => {
    renderModal({ askingPriceGbp: 100 });

    fireEvent.change(screen.getByPlaceholderText("0.00"), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: /Send offer/i }));

    expect(await screen.findByText(/minimum for this work is £60\.00/i)).toBeTruthy();
  });

  it("sends nothing while the amount is below the floor", async () => {
    renderModal({ askingPriceGbp: 100 });

    fireEvent.change(screen.getByPlaceholderText("0.00"), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: /Send offer/i }));

    await screen.findByText(/minimum for this work is/i);
    expect(mutateMock).not.toHaveBeenCalled();
  });

  it("lets an offer on the floor through", async () => {
    renderModal({ askingPriceGbp: 100 });

    fireEvent.change(screen.getByPlaceholderText("0.00"), { target: { value: "60" } });
    fireEvent.click(screen.getByRole("button", { name: /Send offer/i }));

    await waitFor(() => expect(mutateMock).toHaveBeenCalledTimes(1));
  });
});
