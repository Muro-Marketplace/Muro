// @vitest-environment jsdom
// 05 E43-h. The public enquiry form set setEnquirySent(true) in its catch AND used
// authFetch (which resolves on a non-2xx), so a failed enquiry told the visitor it
// was sent. The primary /api/messages send now goes through mutate() (throws), the
// confirmation is shown only on success, and a failure surfaces an error toast.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";

const { mutateMock, showToastMock } = vi.hoisted(() => ({
  mutateMock: vi.fn(),
  showToastMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/supabase", () => ({ supabase: { auth: {}, from: () => ({}) } }));
vi.mock("@/lib/api-client", async (orig) => {
  const actual = await orig<typeof import("@/lib/api-client")>();
  return { ...actual, mutate: mutateMock };
});
vi.mock("@/context/CartContext", () => ({ useCart: () => ({ addItem: vi.fn(), items: [] }) }));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ user: null, displayName: "", userType: null }) }));
vi.mock("@/context/ToastContext", () => ({ useToast: () => ({ showToast: showToastMock }) }));
vi.mock("@/components/SaveButton", () => ({ default: () => null }));
vi.mock("@/components/ArtworkThumb", () => ({ default: () => null }));
vi.mock("@/components/offers/MakeOfferModal", () => ({ default: () => null }));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("next/link", () => ({ default: ({ children }: { children: unknown }) => children }));

import ArtistProfileClient from "./ArtistProfileClient";
import { ApiError } from "@/lib/api-client";

afterEach(() => cleanup());
beforeEach(() => {
  mutateMock.mockReset();
  showToastMock.mockReset();
  global.fetch = vi.fn(() => Promise.resolve(new Response("{}", { status: 200 }))) as unknown as typeof fetch;
});

// The enquiry form lives in the work lightbox, opened from a grid card's
// "Quick look" button. currentWork must be set for the sidebar (and its Message
// CTA) to render, so we seed one work and open it.
const WORK = {
  id: "w1",
  title: "Last Light",
  medium: "Oil",
  dimensions: "50x50cm",
  priceBand: "",
  pricing: [{ label: "Medium", price: 200 }],
  available: true,
  color: "#C17C5A",
  image: "https://cdn/a.png",
  images: [],
  description: "",
  orientation: "landscape",
  frameOptions: [],
};

function openAndFillEnquiry() {
  render(
    <ArtistProfileClient
      artistName="Alice"
      artistSlug="alice"
      extendedBio=""
      themes={[]}
      works={[WORK as never]}
    />,
  );
  fireEvent.click(screen.getByTitle("Quick look")); // opens the work lightbox
  fireEvent.click(screen.getByRole("button", { name: "Message Alice" }));
  fireEvent.change(screen.getByPlaceholderText("Your name"), { target: { value: "Bob" } });
  fireEvent.change(screen.getByPlaceholderText("Your email"), { target: { value: "bob@example.com" } });
  fireEvent.change(screen.getByPlaceholderText("Your message..."), { target: { value: "Do you ship abroad?" } });
}

describe("ArtistProfileClient enquiry (05 E43-h)", () => {
  it("does NOT confirm and shows an error when the send fails", async () => {
    mutateMock.mockRejectedValue(new ApiError(500, "message rejected", "server_error", {}));
    openAndFillEnquiry();

    fireEvent.click(screen.getByText("Send Message"));

    await waitFor(() =>
      expect(showToastMock).toHaveBeenCalledWith("message rejected", { variant: "error" }),
    );
    // Fail-before: the catch set enquirySent(true), so "Message Sent" showed on failure.
    expect(screen.queryByText("Message Sent")).toBeNull();
  });

  it("confirms only after the message actually sends", async () => {
    mutateMock.mockResolvedValue({});
    openAndFillEnquiry();

    fireEvent.click(screen.getByText("Send Message"));

    await waitFor(() => expect(screen.getByText("Message Sent")).toBeTruthy());
    expect(mutateMock).toHaveBeenCalledWith("/api/messages", expect.objectContaining({ method: "POST" }));
    expect(showToastMock).not.toHaveBeenCalled();
  });
});
