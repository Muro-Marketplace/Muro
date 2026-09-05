// @vitest-environment jsdom
//
// Tests for signup/venue — verifies that emailRedirectTo reflects ?next=,
// falling back to /venue-portal.

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

vi.mock("@/lib/slugify", () => ({
  slugify: (s: string) => s.toLowerCase().replace(/\s+/g, "-"),
}));

vi.mock("@/components/Dropdown", () => ({
  default: ({
    value,
    onChange,
    options,
    placeholder,
    required,
    ariaLabel,
  }: {
    value: string;
    onChange: (v: string) => void;
    options: { value: string; label: string }[];
    placeholder?: string;
    required?: boolean;
    ariaLabel?: string;
  }) => (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      required={required}
      aria-label={ariaLabel ?? placeholder ?? "dropdown"}
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  ),
}));

vi.mock("@/components/TermsCheckbox", () => ({
  default: ({ checked, onChange, required, termsType }: { checked: boolean; onChange: (v: boolean) => void; required?: boolean; termsType?: string }) => (
    <input
      type="checkbox"
      data-testid={`terms-${termsType ?? "generic"}`}
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

import RegisterVenuePage from "./page";

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

async function fillAndSubmitVenueForm() {
  fireEvent.change(screen.getByPlaceholderText(/e\.g\. The Copper Kettle/i), { target: { value: "Test Venue" } });
  fireEvent.change(screen.getByRole("combobox", { name: /venue type/i }), { target: { value: "Café / Coffee Shop" } });
  fireEvent.change(screen.getByPlaceholderText("Full name"), { target: { value: "Jane Smith" } });
  fireEvent.change(screen.getByPlaceholderText("you@venue.com"), { target: { value: "jane@venue.com" } });
  const pwFields = screen.getAllByPlaceholderText(/At least 8 characters|Confirm your password/i);
  fireEvent.change(pwFields[0], { target: { value: "password123" } });
  fireEvent.change(pwFields[1], { target: { value: "password123" } });
  fireEvent.change(screen.getByPlaceholderText("Address line 1 *"), { target: { value: "1 Test St" } });
  fireEvent.change(screen.getByPlaceholderText("City *"), { target: { value: "London" } });
  fireEvent.change(screen.getByPlaceholderText("Postcode *"), { target: { value: "SW1A 1AA" } });
  fireEvent.change(screen.getByRole("combobox", { name: /approximate wall space/i }), { target: { value: "1 to 3 walls (small café / studio)" } });
  fireEvent.click(screen.getByTestId("terms-platform_tos"));
  fireEvent.click(screen.getByTestId("terms-venue_agreement"));
  fireEvent.submit(screen.getByRole("button", { name: /register your venue/i }));
}

describe("RegisterVenuePage — emailRedirectTo next param", () => {
  it("uses role default /venue-portal when no ?next= is present", async () => {
    Object.defineProperty(window, "location", {
      value: { search: "", origin: "http://localhost" },
      writable: true,
    });
    render(<RegisterVenuePage />);
    await fillAndSubmitVenueForm();
    await waitFor(() => expect(mockSignUp).toHaveBeenCalled());
    const opts = mockSignUp.mock.calls[0][0].options;
    expect(opts.emailRedirectTo).toContain("next=%2Fvenue-portal");
  });

  it("forwards a safe ?next= into emailRedirectTo", async () => {
    Object.defineProperty(window, "location", {
      value: { search: "?next=%2Fvenue-portal%2Fartists", origin: "http://localhost" },
      writable: true,
    });
    render(<RegisterVenuePage />);
    await fillAndSubmitVenueForm();
    await waitFor(() => expect(mockSignUp).toHaveBeenCalled());
    const opts = mockSignUp.mock.calls[0][0].options;
    expect(opts.emailRedirectTo).toContain("next=%2Fvenue-portal%2Fartists");
  });

  it("falls back to /venue-portal when ?next= is an external URL", async () => {
    Object.defineProperty(window, "location", {
      value: { search: "?next=https%3A%2F%2Fevil.com", origin: "http://localhost" },
      writable: true,
    });
    render(<RegisterVenuePage />);
    await fillAndSubmitVenueForm();
    await waitFor(() => expect(mockSignUp).toHaveBeenCalled());
    const opts = mockSignUp.mock.calls[0][0].options;
    expect(opts.emailRedirectTo).toContain("next=%2Fvenue-portal");
    expect(opts.emailRedirectTo).not.toContain("evil");
  });
});

describe("venue sign-up asks nothing about insurance (launch audit, section 05)", () => {
  it("has no insurance declaration; the agreement and the placement record carry it", () => {
    render(<RegisterVenuePage />);
    expect(screen.queryByRole("checkbox", { name: /public liability insurance/i })).toBeNull();
  });
});

// LA-C032 (launch audit 2026-09-05). The registration POST serialised the whole
// form state, so the venue's password and its confirmation left the browser to
// /api/register-venue, a route that neither needs nor stores them (its schema
// strips unknown keys). The password belongs to supabase.auth.signUp only.
describe("venue sign-up keeps the password out of the registration request (LA-C032)", () => {
  it("posts no password fields to /api/register-venue", async () => {
    render(<RegisterVenuePage />);
    await fillAndSubmitVenueForm();
    await waitFor(() => expect(mockSignUp).toHaveBeenCalled());
    const fetchMock = globalThis.fetch as unknown as { mock: { calls: [string, RequestInit?][] } };
    const reg = fetchMock.mock.calls.find(([url]) => url === "/api/register-venue");
    expect(reg, "registration request was made").toBeTruthy();
    const body = JSON.parse(String(reg![1]?.body));
    expect(body).not.toHaveProperty("password");
    expect(body).not.toHaveProperty("confirmPassword");
    // The registration fields themselves still travel.
    expect(body.venueName).toBe("Test Venue");
    expect(body.email).toBe("jane@venue.com");
  });
});
