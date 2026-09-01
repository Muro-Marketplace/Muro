// @vitest-environment jsdom
//
// E37. /api/curation resolves requester_user_id solely from a bearer token,
// and this form posted with Content-Type alone. So a signed-in venue's
// curation submission was stored anonymous: nothing tied the request back to
// their account, and the venue could not see it from their portal.

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";

const { authState, pushMock } = vi.hoisted(() => ({
  authState: { value: {} as Record<string, unknown> },
  pushMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams("tier=single_wall"),
  usePathname: () => "/curated",
}));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => authState.value }));
// Row 1924: the form prefills from /api/venue-profile for a signed-in venue.
// authFetch pulls in @/lib/supabase, which builds a client at module load.
vi.mock("@/lib/supabase", () => ({ supabase: { auth: {}, from: () => ({}) } }));
vi.mock("@/lib/api-client", async (orig) => {
  const actual = await orig<typeof import("@/lib/api-client")>();
  return {
    ...actual,
    authFetch: vi.fn(async () => ({ json: async () => ({ profile: null }) })),
  };
});
vi.mock("next/image", () => ({
  default: ({ alt, src, className }: { alt?: string; src?: string; className?: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} src={typeof src === "string" ? src : undefined} className={className} />
  ),
}));
vi.mock("@/components/Accordion", () => ({ default: () => <div /> }));
vi.mock("@/components/AnimateIn", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/ScrollButton", () => ({ default: () => <button type="button" /> }));

import CuratedClient from "./CuratedClient";
import { authFetch } from "@/lib/api-client";

function fillByLabel(root: HTMLElement, labelText: string, value: string) {
  const label = Array.from(root.querySelectorAll("label")).find(
    (l) => l.textContent?.trim() === labelText,
  );
  const field = label?.parentElement?.querySelector("input, textarea");
  if (!field) throw new Error(`no field for label "${labelText}"`);
  fireEvent.change(field, { target: { value } });
}

function submitEnquiry(container: HTMLElement) {
  fillByLabel(container, "Venue name *", "The Copper Kettle");
  fillByLabel(container, "Your name *", "Sam Venue");
  fillByLabel(container, "Email *", "sam@copperkettle.example");
  const form = container.querySelector("form");
  if (!form) throw new Error("no form rendered");
  fireEvent.submit(form);
}

function lastCurationCall(spy: ReturnType<typeof vi.fn>) {
  return spy.mock.calls.find((c) => String(c[0]).includes("/api/curation"));
}

beforeEach(() => {
  vi.clearAllMocks();
  // jsdom has no layout engine; the tier preselect scrolls the form into view.
  Element.prototype.scrollIntoView = vi.fn();
  authState.value = { userType: null, loading: false, session: null };
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("curation enquiry attribution (E37)", () => {
  it("sends the bearer token when the visitor is signed in", async () => {
    authState.value = {
      userType: "venue",
      loading: false,
      session: { access_token: "tok-abc" },
    };
    const fetchSpy = vi.fn(async () => ({ ok: true, json: async () => ({ requestId: "cr-1" }) }));
    vi.stubGlobal("fetch", fetchSpy);

    const { container } = render(<CuratedClient />);
    submitEnquiry(container);

    await waitFor(() => expect(lastCurationCall(fetchSpy)).toBeTruthy());
    const headers = (lastCurationCall(fetchSpy)![1] as { headers: Record<string, string> }).headers;
    expect(headers.Authorization).toBe("Bearer tok-abc");
  });

  it("still posts for an anonymous visitor, with no Authorization header", async () => {
    const fetchSpy = vi.fn(async () => ({ ok: true, json: async () => ({ requestId: "cr-2" }) }));
    vi.stubGlobal("fetch", fetchSpy);

    const { container } = render(<CuratedClient />);
    submitEnquiry(container);

    await waitFor(() => expect(lastCurationCall(fetchSpy)).toBeTruthy());
    const headers = (lastCurationCall(fetchSpy)![1] as { headers: Record<string, string> }).headers;
    expect(headers.Authorization).toBeUndefined();
    expect(headers["Content-Type"]).toBe("application/json");
  });
});

// Row 1924. "The curation brief form prefills nothing, though the venue profile
// holds the name, email and location." A signed-in venue retyped three things
// the account already knows, on a form whose first refusal is that those three
// are required.
describe("the brief prefills from the venue's profile (row 1924)", () => {
  it("fills the name, contact and location a venue has already given us", async () => {
    authState.value = { userType: "venue", loading: false, session: { access_token: "t" } };
    vi.mocked(authFetch).mockResolvedValue({
      json: async () => ({
        profile: {
          name: "The Copper Kettle",
          contact_name: "Hannah Reed",
          email: "hannah@copperkettle.test",
          location: "Hampton",
        },
      }),
    } as unknown as Response);

    const { container } = render(<CuratedClient />);

    await waitFor(() => {
      const values = Array.from(container.querySelectorAll("input")).map((i) => i.value);
      expect(values).toContain("The Copper Kettle");
      expect(values).toContain("hannah@copperkettle.test");
    });
  });

  it("asks for nothing when the visitor is not a signed-in venue", async () => {
    authState.value = { userType: null, loading: false, session: null };
    vi.mocked(authFetch).mockClear();

    const { container } = render(<CuratedClient />);

    await waitFor(() => expect(container.querySelectorAll("input").length).toBeGreaterThan(0));
    expect(authFetch).not.toHaveBeenCalled();
  });
});

// Nav-broadening plan: /curated became the shared front door for both
// paid products (Wallplace Curated's one-off shortlist and Wallplace
// Programmes' ongoing service), with real photography replacing the
// old auth-page background.
describe("the Manage My Walls page presents both products (nav-broadening plan)", () => {
  beforeEach(() => {
    authState.value = { userType: null, loading: false, session: null };
  });

  it("swaps the old auth-page mountain hero for real photography", () => {
    const { container } = render(<CuratedClient />);
    expect(container.querySelector('img[alt*="Fitz Roy"]')).toBeNull();
    expect(container.querySelector('img[src*="auth-bg"]')).toBeNull();
    expect(
      container.querySelector(
        'img[alt="Two people talking beside a bare wall in a café"]',
      ),
    ).toBeTruthy();
  });

  it("offers a route into Wallplace Programmes as well as Wallplace Curated", () => {
    const { container } = render(<CuratedClient />);
    const programmeLinks = container.querySelectorAll('a[href="/programmes"]');
    expect(programmeLinks.length).toBeGreaterThan(0);
    expect(container.textContent).toContain("Wallplace Curated");
    expect(container.textContent).toContain("Wallplace Programmes");
  });

  it("never captions a venue placement with an invented place name", () => {
    const { container } = render(<CuratedClient />);
    // The removed defect: stock photos captioned with a specific invented
    // place ("Office reception, Manchester"), the same photo captioned as
    // a different invented place elsewhere. Category-only captions ("Café",
    // "Hotel", "Office") are fine; a place name is not.
    expect(container.textContent).not.toMatch(
      /Margate|Soho|Peckham|Manchester/,
    );
  });
});
