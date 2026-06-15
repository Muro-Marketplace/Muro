// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor, cleanup } from "@testing-library/react";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));

const useAuthMock = vi.fn();
vi.mock("@/context/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { signInWithOAuth: vi.fn() } },
}));

vi.mock("@/lib/feature-flags", () => ({ isFlagOn: () => false }));

vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

import LoginPage from "./page";

beforeEach(() => {
  replace.mockReset();
  useAuthMock.mockReset();
  // Stub window.location.search for `?next=`
  Object.defineProperty(window, "location", {
    value: { search: "?next=/apply", origin: "http://localhost" },
    writable: true,
  });
});

afterEach(() => cleanup());

describe("LoginPage redirect on already-logged-in", () => {
  it("redirects to ?next= when present and same-origin", async () => {
    useAuthMock.mockReturnValue({
      user: { id: "u" },
      userType: "artist",
      loading: false,
      signIn: vi.fn(),
    });
    render(<LoginPage />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/apply"));
  });

  it("falls back to portal when ?next= is missing", async () => {
    Object.defineProperty(window, "location", {
      value: { search: "", origin: "http://localhost" },
      writable: true,
    });
    useAuthMock.mockReturnValue({
      user: { id: "u" },
      userType: "venue",
      loading: false,
      signIn: vi.fn(),
    });
    render(<LoginPage />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/venue-portal"));
  });

  it("falls back to portal when ?next= is an external URL", async () => {
    Object.defineProperty(window, "location", {
      value: { search: "?next=https://evil.com", origin: "http://localhost" },
      writable: true,
    });
    useAuthMock.mockReturnValue({
      user: { id: "u" },
      userType: "customer",
      loading: false,
      signIn: vi.fn(),
    });
    render(<LoginPage />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/customer-portal"));
  });

  // Back-compat shim: old ?redirect= links (e.g. legacy artwork page
  // "message the artist" button before the ?next= canonicalisation).
  it("honours ?redirect= when ?next= is absent (back-compat)", async () => {
    Object.defineProperty(window, "location", {
      value: { search: "?redirect=%2Fapply", origin: "http://localhost" },
      writable: true,
    });
    useAuthMock.mockReturnValue({
      user: { id: "u" },
      userType: "artist",
      loading: false,
      signIn: vi.fn(),
    });
    render(<LoginPage />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/apply"));
  });

  it("falls back to portal when ?redirect= is an external URL", async () => {
    Object.defineProperty(window, "location", {
      value: { search: "?redirect=https%3A%2F%2Fevil.com", origin: "http://localhost" },
      writable: true,
    });
    useAuthMock.mockReturnValue({
      user: { id: "u" },
      userType: "artist",
      loading: false,
      signIn: vi.fn(),
    });
    render(<LoginPage />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/artist-portal"));
  });
});

describe("LoginPage — forwarded ?next= on Sign up link", () => {
  // Render the page without a logged-in user so the form and links are visible.
  // window.location was made writable by beforeEach's Object.defineProperty;
  // direct assignment updates the value without re-defining the descriptor.
  function renderLoggedOut(locationSearch: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).location = { search: locationSearch, origin: "http://localhost" };
    useAuthMock.mockReturnValue({
      user: null,
      userType: null,
      loading: false,
      signIn: vi.fn(),
    });
    return render(<LoginPage />);
  }

  it("appends ?next= to the Sign up link when ?next= is a safe path", () => {
    const { getAllByRole } = renderLoggedOut("?next=/checkout");
    const links = getAllByRole("link") as HTMLAnchorElement[];
    const signupLink = links.find((l) => l.getAttribute("href")?.startsWith("/signup"));
    expect(signupLink).toBeDefined();
    expect(signupLink!.getAttribute("href")).toContain("next=%2Fcheckout");
  });

  it("emits a plain /signup link when ?next= is an external URL", () => {
    const { getAllByRole } = renderLoggedOut("?next=https://evil.com");
    const links = getAllByRole("link") as HTMLAnchorElement[];
    const signupLink = links.find((l) => l.getAttribute("href")?.startsWith("/signup"));
    expect(signupLink).toBeDefined();
    expect(signupLink!.getAttribute("href")).toBe("/signup");
  });
});
