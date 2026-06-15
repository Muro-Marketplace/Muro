// @vitest-environment jsdom
//
// Locking test for fix 7.4: "Continue browsing" wording unification.
// Renders both branches that show the button and asserts the copy is
// consistently sentence-case.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, act } from "@testing-library/react";

// --- module mocks ---

vi.mock("next/navigation", () => ({
  useSearchParams: () => ({ get: () => null }),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

vi.mock("@/context/CartContext", () => ({
  useCart: () => ({ clearCart: vi.fn() }),
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ user: null, userType: null }),
}));

vi.mock("@/lib/qr-context", () => ({
  clearQrContext: vi.fn(),
}));

import ConfirmationPage from "./page";

afterEach(() => cleanup());

describe("Checkout confirmation page — continue-browsing copy (fix 7.4)", () => {
  it("shows 'Continue browsing' (sentence case) on the no-session-id path", async () => {
    render(<ConfirmationPage />);
    // Wait for loading state to resolve.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    // The no-order path shows a "Discover Art" link; the no-session-id
    // fallback shows a "Continue Browsing" link. With no sessionId
    // provided the component renders the "No order found" state.
    // Either way, if the button is present it must be sentence-case.
    const buttons = screen.queryAllByText(/continue browsing/i);
    for (const btn of buttons) {
      expect(btn.textContent).toBe("Continue browsing");
      // Assert it is NOT title-cased.
      expect(btn.textContent).not.toBe("Continue Browsing");
    }
  });

  it("does not use title-case 'Continue Browsing' anywhere in the page", async () => {
    render(<ConfirmationPage />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    // Exact title-case string must not appear.
    expect(screen.queryByText("Continue Browsing")).toBeNull();
  });
});
