// @vitest-environment jsdom
//
// Regression tests for B20/B21: the confirmation page must not assert
// "payment received" without reading the Stripe session's payment_status,
// must not claim success when the lookup fails, and must clear the cart
// only on a confirmed-paid session (never on mount).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";

// --- controllable URL state -------------------------------------------------
let sessionIdParam: string | null = null;

vi.mock("next/navigation", () => ({
  useSearchParams: () => ({
    get: (k: string) => (k === "session_id" ? sessionIdParam : null),
  }),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

const { clearCartSpy, clearQrContextSpy } = vi.hoisted(() => ({
  clearCartSpy: vi.fn(),
  clearQrContextSpy: vi.fn(),
}));

vi.mock("@/context/CartContext", () => ({
  useCart: () => ({ clearCart: clearCartSpy }),
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ user: null, userType: null }),
}));

vi.mock("@/lib/qr-context", () => ({
  clearQrContext: clearQrContextSpy,
}));

import ConfirmationPage from "./page";

const fetchMock = vi.fn();

function session(status: string) {
  return {
    id: "cs_test_abc",
    status,
    amountTotal: 125,
    lineItems: [{ name: "Study in Oil", quantity: 1, amount: 125 }],
  };
}

function okResponse(body: unknown) {
  return { ok: true, json: async () => body } as Response;
}

beforeEach(() => {
  sessionIdParam = "cs_test_abc";
  clearCartSpy.mockClear();
  clearQrContextSpy.mockClear();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Checkout confirmation payment_status gating (B20)", () => {
  it("shows the paid receipt and clears the cart only for a paid session", async () => {
    fetchMock.mockResolvedValue(okResponse(session("paid")));

    const { container } = render(<ConfirmationPage />);

    await waitFor(() => {
      expect(container.textContent).toContain("Order Confirmed");
    });
    expect(container.textContent).toContain("Payment of £125.00 received");
    expect(clearCartSpy).toHaveBeenCalledTimes(1);
    expect(clearQrContextSpy).toHaveBeenCalledTimes(1);
  });

  it("shows an honest processing state for an unpaid session and keeps the cart", async () => {
    fetchMock.mockResolvedValue(okResponse(session("unpaid")));

    const { container } = render(<ConfirmationPage />);

    await waitFor(() => {
      expect(container.textContent).toContain("Payment processing");
    });
    // No money-received claim anywhere on the page.
    expect(container.textContent).not.toContain("received");
    expect(container.textContent).not.toContain("Order Confirmed");
    // It still promises the email confirmation.
    expect(container.textContent).toContain("email your confirmation");
    expect(clearCartSpy).not.toHaveBeenCalled();
    expect(clearQrContextSpy).not.toHaveBeenCalled();
  });

  it("does not clear the cart on mount when there is no session_id", async () => {
    sessionIdParam = null;

    const { container } = render(<ConfirmationPage />);

    await waitFor(() => {
      expect(container.textContent).toContain("No order found");
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(clearCartSpy).not.toHaveBeenCalled();
    expect(clearQrContextSpy).not.toHaveBeenCalled();
  });
});

describe("Checkout confirmation lookup failure (B21)", () => {
  it("hedges rather than claiming success when the fetch rejects", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));

    const { container } = render(<ConfirmationPage />);

    await waitFor(() => {
      expect(container.textContent).toContain("Checking your order");
    });
    expect(container.textContent).not.toContain("received successfully");
    expect(container.textContent).not.toContain("your order is confirmed");
    expect(container.textContent).toContain("If your payment completed");
    expect(clearCartSpy).not.toHaveBeenCalled();
  });

  it("treats a non-2xx session lookup the same way", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "Failed to retrieve session" }) } as Response);

    const { container } = render(<ConfirmationPage />);

    await waitFor(() => {
      expect(container.textContent).toContain("Checking your order");
    });
    expect(container.textContent).not.toContain("received successfully");
    expect(clearCartSpy).not.toHaveBeenCalled();
  });

  it("keeps the discover strip on the failure branch", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));

    const { queryByTestId } = render(<ConfirmationPage />);

    await waitFor(() => {
      expect(queryByTestId("discover-strip")).not.toBeNull();
    });
    const hrefs = Array.from(queryByTestId("discover-strip")!.querySelectorAll("a")).map((a) =>
      a.getAttribute("href"),
    );
    expect(hrefs).toContain("/browse");
    expect(hrefs).toContain("/spaces");
    // QA 2026-08-30 bug 39: this asserted "/browse/collections", which 404s.
    // The collections view lives at /browse?view=collections; the bare path has
    // no route, so the post-purchase screen was sending buyers to a dead page.
    expect(hrefs).toContain("/browse?view=collections");
  });
});
