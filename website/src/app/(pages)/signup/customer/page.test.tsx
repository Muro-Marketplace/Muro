// @vitest-environment jsdom
//
// Tests for signup/customer — verifies that the emailRedirectTo passed to
// supabase.auth.signUp reflects the ?next= query param, falling back to
// /browse when the param is absent or external.

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, waitFor, screen, cleanup } from "@testing-library/react";

const { mockSignUp } = vi.hoisted(() => ({
  mockSignUp: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: { signUp: mockSignUp },
  },
}));

vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ user: null, userType: null, loading: false }),
}));

vi.mock("@/components/RedirectIfLoggedIn", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/lib/feature-flags", () => ({ isFlagOn: () => false }));

vi.mock("@/components/TermsCheckbox", () => ({
  default: ({ checked, onChange, required }: { checked: boolean; onChange: (v: boolean) => void; required?: boolean }) => (
    <input
      type="checkbox"
      data-testid="terms"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      required={required}
    />
  ),
}));

vi.mock("@/components/Turnstile", () => ({
  default: ({ onVerify }: { onVerify: (t: string) => void }) => {
    onVerify("test-token");
    return <div data-testid="turnstile" />;
  },
}));

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

const originalFetch = globalThis.fetch;

import CustomerSignUpPage from "./page";

beforeEach(() => {
  mockSignUp.mockReset();
  pushMock.mockReset();
  mockSignUp.mockResolvedValue({ error: null });
  Object.defineProperty(window, "location", {
    value: { search: "", origin: "http://localhost" },
    writable: true,
  });
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ ok: true }),
  } as Response);
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  cleanup();
});

async function submitForm() {
  fireEvent.change(screen.getByPlaceholderText("Your name"), { target: { value: "Test User" } });
  fireEvent.change(screen.getByPlaceholderText("you@example.com"), { target: { value: "test@example.com" } });
  fireEvent.change(screen.getByPlaceholderText("At least 8 characters"), { target: { value: "password123" } });
  fireEvent.click(screen.getByTestId("terms"));
  fireEvent.submit(screen.getByRole("button", { name: /create account/i }));
}

describe("CustomerSignUpPage — emailRedirectTo next param", () => {
  it("uses role default /browse when no ?next= is present", async () => {
    Object.defineProperty(window, "location", {
      value: { search: "", origin: "http://localhost" },
      writable: true,
    });
    render(<CustomerSignUpPage />);
    await submitForm();
    await waitFor(() => expect(mockSignUp).toHaveBeenCalled());
    const opts = mockSignUp.mock.calls[0][0].options;
    expect(opts.emailRedirectTo).toContain("next=%2Fbrowse");
  });

  it("forwards a safe ?next= into emailRedirectTo", async () => {
    Object.defineProperty(window, "location", {
      value: { search: "?next=%2Fcheckout", origin: "http://localhost" },
      writable: true,
    });
    render(<CustomerSignUpPage />);
    await submitForm();
    await waitFor(() => expect(mockSignUp).toHaveBeenCalled());
    const opts = mockSignUp.mock.calls[0][0].options;
    expect(opts.emailRedirectTo).toContain("next=%2Fcheckout");
  });

  it("falls back to /browse when ?next= is an external URL", async () => {
    Object.defineProperty(window, "location", {
      value: { search: "?next=https%3A%2F%2Fevil.com", origin: "http://localhost" },
      writable: true,
    });
    render(<CustomerSignUpPage />);
    await submitForm();
    await waitFor(() => expect(mockSignUp).toHaveBeenCalled());
    const opts = mockSignUp.mock.calls[0][0].options;
    expect(opts.emailRedirectTo).toContain("next=%2Fbrowse");
    expect(opts.emailRedirectTo).not.toContain("evil");
  });
});
