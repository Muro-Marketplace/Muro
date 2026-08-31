// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor, cleanup, fireEvent } from "@testing-library/react";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));

const useAuthMock = vi.fn();
vi.mock("@/context/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));

const { signInWithOAuthMock, isFlagOnMock, showToastMock } = vi.hoisted(() => ({
  signInWithOAuthMock: vi.fn(),
  isFlagOnMock: vi.fn(),
  showToastMock: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { signInWithOAuth: signInWithOAuthMock } },
}));

vi.mock("@/lib/feature-flags", () => ({ isFlagOn: isFlagOnMock }));

vi.mock("@/context/ToastContext", () => ({ useToast: () => ({ showToast: showToastMock }) }));

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
  signInWithOAuthMock.mockReset();
  signInWithOAuthMock.mockResolvedValue({ data: null, error: null });
  showToastMock.mockReset();
  isFlagOnMock.mockReset();
  isFlagOnMock.mockReturnValue(false);
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

// ── A3 / H3 ────────────────────────────────────────────────────────────────
// The header's "Switch to X portal" control signs the user out and sends them
// to /login?email=…&hint=X. Nothing on this page read `hint`, so the whole
// point of the trip (which account am I signing into?) was dropped on arrival.
function renderLoggedOut(locationSearch: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).location = { search: locationSearch, origin: "http://localhost" };
  useAuthMock.mockReturnValue({ user: null, userType: null, loading: false, signIn: vi.fn() });
  return render(<LoginPage />);
}

describe("LoginPage — ?hint= role guidance (A3, H3)", () => {
  it("says which account the user is signing into", () => {
    const { getByText } = renderLoggedOut("?email=maya%40example.com&hint=venue");
    expect(getByText(/Sign in to your venue account/i)).toBeTruthy();
  });

  it("explains why the details may differ from the account they just left", () => {
    const { container } = renderLoggedOut("?hint=artist");
    expect(container.textContent).toMatch(/more than one Wallplace account/i);
  });

  it("still pre-fills the email it was handed", () => {
    const { container } = renderLoggedOut("?email=maya%40example.com&hint=venue");
    const emailInput = container.querySelector('input[type="email"]') as HTMLInputElement;
    expect(emailInput.value).toBe("maya@example.com");
  });

  it("ignores a hint that is not a real signup role, rather than echoing it", () => {
    const { container } = renderLoggedOut("?hint=%3Cscript%3Ealert(1)%3C%2Fscript%3E");
    expect(container.textContent).not.toMatch(/script/i);
    // Falls back to the plain subheading, no invented "your … account" line.
    expect(container.textContent).toMatch(/Sign in to your Wallplace account/i);
    expect(container.textContent).not.toMatch(/more than one Wallplace account/i);
  });

  it("ignores hint=admin: admin is never a role a user may ask for", () => {
    const { container } = renderLoggedOut("?hint=admin");
    expect(container.textContent).not.toMatch(/Sign in to your admin account/i);
  });

  it("shows the plain subheading when there is no hint", () => {
    const { container } = renderLoggedOut("");
    expect(container.textContent).toMatch(/Sign in to your Wallplace account/i);
  });
});

describe("LoginPage — landing after a hinted sign-in (A3, H3)", () => {
  function renderSignedInAs(userType: string, search: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).location = { search, origin: "http://localhost" };
    useAuthMock.mockReturnValue({ user: { id: "u" }, userType, loading: false, signIn: vi.fn() });
    return render(<LoginPage />);
  }

  it("lands on the hinted portal when the account matches the hint", async () => {
    renderSignedInAs("venue", "?hint=venue");
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/venue-portal"));
  });

  it("says so when the details signed them into a different account", async () => {
    renderSignedInAs("artist", "?hint=venue");
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/artist-portal"));
    const said = showToastMock.mock.calls.map((c) => String(c[0])).join(" ");
    expect(said).toMatch(/artist account/i);
    expect(said).toMatch(/venue/i);
  });

  it("stays quiet about roles when the hint matched", async () => {
    renderSignedInAs("venue", "?hint=venue");
    await waitFor(() => expect(replace).toHaveBeenCalled());
    const said = showToastMock.mock.calls.map((c) => String(c[0])).join(" ");
    expect(said).not.toMatch(/signed you into your/i);
  });

  it("lets an explicit ?next= win over the hint", async () => {
    renderSignedInAs("venue", "?next=%2Fcheckout&hint=venue");
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/checkout"));
  });
});

// ── H1 ─────────────────────────────────────────────────────────────────────
// Login-page OAuth hard-coded role "customer", so anyone who had never signed
// up but pressed Google here silently became a customer, with no say in it and
// nothing on screen saying an account was being created at all.
describe("LoginPage — OAuth account type (H1)", () => {
  beforeEach(() => {
    isFlagOnMock.mockImplementation((flag: string) => flag === "OAUTH_GOOGLE_APPLE");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ state: "signed-state" }) }),
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  function signStateBody() {
    const calls = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
    const call = calls.find((c) => String(c[0]).includes("oauth-sign-state"));
    if (!call) throw new Error("oauth-sign-state was never called");
    return JSON.parse(String((call[1] as RequestInit).body));
  }

  it("tells the visitor an account will be created and of what type", () => {
    const { container } = renderLoggedOut("");
    expect(container.textContent).toMatch(/we will create/i);
  });

  it("offers a choice of account type instead of silently picking one", () => {
    const { getByLabelText } = renderLoggedOut("");
    expect(getByLabelText(/^Artist$/i)).toBeTruthy();
    expect(getByLabelText(/^Venue$/i)).toBeTruthy();
    expect(getByLabelText(/^Customer$/i)).toBeTruthy();
  });

  it("defaults to customer, the least privileged of the three", () => {
    const { getByLabelText } = renderLoggedOut("");
    expect((getByLabelText(/^Customer$/i) as HTMLInputElement).checked).toBe(true);
  });

  it("sends the chosen role to oauth-sign-state, not a hard-coded customer", async () => {
    const { getByLabelText, getByRole } = renderLoggedOut("");
    fireEvent.click(getByLabelText(/^Artist$/i));
    fireEvent.click(getByRole("button", { name: /Google/i }));
    await waitFor(() => expect(signInWithOAuthMock).toHaveBeenCalled());
    expect(signStateBody().role).toBe("artist");
  });

  it("carries the chosen role through the Apple button too", async () => {
    const { getByLabelText, getByRole } = renderLoggedOut("");
    fireEvent.click(getByLabelText(/^Venue$/i));
    fireEvent.click(getByRole("button", { name: /Apple/i }));
    await waitFor(() => expect(signInWithOAuthMock).toHaveBeenCalled());
    expect(signStateBody().role).toBe("venue");
  });

  it("pre-selects the role the portal switcher hinted at", () => {
    const { getByLabelText } = renderLoggedOut("?hint=venue");
    expect((getByLabelText(/^Venue$/i) as HTMLInputElement).checked).toBe(true);
  });

  it("shows what the visitor is agreeing to", () => {
    const { getAllByRole } = renderLoggedOut("");
    const hrefs = (getAllByRole("link") as HTMLAnchorElement[]).map((l) => l.getAttribute("href"));
    expect(hrefs).toContain("/terms");
    expect(hrefs).toContain("/privacy");
  });

  it("keeps the role picker out of the way when OAuth is switched off", () => {
    isFlagOnMock.mockReturnValue(false);
    const { queryByLabelText } = renderLoggedOut("");
    expect(queryByLabelText(/^Artist$/i)).toBeNull();
  });
});
