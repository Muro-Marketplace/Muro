// @vitest-environment jsdom
// 05 E43-h + B9/F19.
//
// E43-h: the public enquiry form set setEnquirySent(true) in its catch AND used
// authFetch (which resolves on a non-2xx), so a failed enquiry told the visitor
// it was sent. The primary send goes through mutate() (throws), the confirmation
// is shown only on success, and a failure surfaces an error toast.
//
// B9/F19: the form used to post to /api/messages for EVERYONE, which 401s
// guests and 403s customers, so the form's main audience failed after filling
// it in. Guests and customers now post to /api/enquiry (the artist replies by
// email); signed-in artists and venues keep the /api/messages path.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";

const { mutateMock, showToastMock, authState, searchParamsMock } = vi.hoisted(() => ({
  mutateMock: vi.fn(),
  showToastMock: vi.fn(),
  authState: {
    user: null as null | { id: string; email?: string },
    displayName: "",
    userType: null as string | null,
  },
  searchParamsMock: vi.fn(() => new URLSearchParams()),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/browse/alice",
  useSearchParams: () => searchParamsMock(),
}));
vi.mock("@/lib/supabase", () => ({ supabase: { auth: {}, from: () => ({}) } }));
vi.mock("@/lib/api-client", async (orig) => {
  const actual = await orig<typeof import("@/lib/api-client")>();
  return { ...actual, mutate: mutateMock };
});
vi.mock("@/context/CartContext", () => ({ useCart: () => ({ addItem: vi.fn(), items: [] }) }));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => authState }));
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
  authState.user = null;
  authState.displayName = "";
  authState.userType = null;
  searchParamsMock.mockReset();
  searchParamsMock.mockReturnValue(new URLSearchParams());
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

function renderProfile() {
  render(
    <ArtistProfileClient
      artistName="Alice"
      artistSlug="alice"
      extendedBio=""
      themes={[]}
      works={[WORK as never]}
    />,
  );
}

function openAndFillEnquiry() {
  renderProfile();
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

  it("confirms only after the enquiry actually sends", async () => {
    mutateMock.mockResolvedValue({});
    openAndFillEnquiry();

    fireEvent.click(screen.getByText("Send Message"));

    await waitFor(() => expect(screen.getByText("Message Sent")).toBeTruthy());
    expect(showToastMock).not.toHaveBeenCalled();
  });
});

describe("ArtistProfileClient enquiry routing by viewer (B9/F19)", () => {
  it("a GUEST posts to /api/enquiry, never /api/messages, and is told to expect an email reply", async () => {
    mutateMock.mockResolvedValue({});
    openAndFillEnquiry();

    fireEvent.click(screen.getByText("Send Message"));

    await waitFor(() => expect(screen.getByText("Message Sent")).toBeTruthy());
    // Fail-before: this posted to /api/messages, which 401s guests, so the
    // form's widest audience always failed after typing their message.
    expect(mutateMock).toHaveBeenCalledWith("/api/enquiry", expect.objectContaining({ method: "POST" }));
    expect(mutateMock).not.toHaveBeenCalledWith("/api/messages", expect.anything());
    const body = JSON.parse((mutateMock.mock.calls[0][1] as { body: string }).body);
    expect(body).toMatchObject({
      senderName: "Bob",
      senderEmail: "bob@example.com",
      artistSlug: "alice",
      workTitle: "Last Light",
      message: "Do you ship abroad?",
    });
    expect(screen.getByText(/reply to you by email/)).toBeTruthy();
  });

  it("a CUSTOMER posts to /api/enquiry, never /api/messages", async () => {
    authState.user = { id: "u-cust", email: "cust@example.com" };
    authState.userType = "customer";
    authState.displayName = "Cass Customer";
    mutateMock.mockResolvedValue({});
    openAndFillEnquiry();

    fireEvent.click(screen.getByText("Send Message"));

    await waitFor(() => expect(screen.getByText("Message Sent")).toBeTruthy());
    // Fail-before: /api/messages 403s accounts without an artist or venue profile.
    expect(mutateMock).toHaveBeenCalledWith("/api/enquiry", expect.objectContaining({ method: "POST" }));
    expect(mutateMock).not.toHaveBeenCalledWith("/api/messages", expect.anything());
    expect(screen.getByText(/reply to you by email/)).toBeTruthy();
  });

  it("a VENUE keeps the signed-in /api/messages path", async () => {
    authState.user = { id: "u-venue", email: "venue@example.com" };
    authState.userType = "venue";
    authState.displayName = "The Copper Kettle";
    mutateMock.mockResolvedValue({});
    openAndFillEnquiry();

    fireEvent.click(screen.getByText("Send Message"));

    await waitFor(() => expect(screen.getByText("Message Sent")).toBeTruthy());
    expect(mutateMock).toHaveBeenCalledWith("/api/messages", expect.objectContaining({ method: "POST" }));
    // The enquiries-table copy stays best-effort via plain fetch.
    expect(global.fetch).toHaveBeenCalledWith("/api/enquiry", expect.objectContaining({ method: "POST" }));
    expect(screen.getByText(/typically respond within 48 hours/)).toBeTruthy();
  });
});

describe("ArtistProfileClient ?enquiry=1 auto-open (B12/F17/H9)", () => {
  it("opens the enquiry form straight from the URL param", async () => {
    searchParamsMock.mockReturnValue(new URLSearchParams("enquiry=1"));

    renderProfile();

    // No clicks: the Message CTAs elsewhere on the site land customers and
    // guests here with ?enquiry=1 expecting the form to be open.
    expect(await screen.findByPlaceholderText("Your message...")).toBeTruthy();
  });

  // B L730. "Message the artist" on an artwork page arrives here with both
  // params: ?enquiry=1 opens the form, &work= opens the lightbox behind it so
  // the enquiry can scope itself to the piece. The lightbox then synced the URL
  // to the artwork permalink and dropped the query string, putting the address
  // bar back on the page the visitor had just left. Measured live on
  // 2026-08-31: the modal appeared at 1,659ms, the URL was rewritten at
  // 1,916ms.
  it("does not rewrite the URL to the artwork permalink while the enquiry is open", async () => {
    searchParamsMock.mockReturnValue(new URLSearchParams("enquiry=1&work=w1"));
    const pushState = vi.spyOn(window.history, "pushState");

    renderProfile();
    expect(await screen.findByPlaceholderText("Your message...")).toBeTruthy();

    const targets = pushState.mock.calls.map((c) => String(c[2]));
    expect(targets.filter((t) => t.includes("/last-light"))).toEqual([]);
    pushState.mockRestore();
  });

  it("still scopes the enquiry to the work the visitor came from", async () => {
    searchParamsMock.mockReturnValue(new URLSearchParams("enquiry=1&work=w1"));

    renderProfile();

    // "Re: <title>" is what makes the artwork param worth sending at all.
    expect(await screen.findByText("Re: Last Light")).toBeTruthy();
  });

  it("claims the artwork permalink once the enquiry is dismissed", async () => {
    // Without this the lightbox loses its shareable link for good.
    searchParamsMock.mockReturnValue(new URLSearchParams("work=w1"));
    const pushState = vi.spyOn(window.history, "pushState");

    renderProfile();

    await waitFor(() => {
      const targets = pushState.mock.calls.map((c) => String(c[2]));
      expect(targets.some((t) => t.includes("/last-light"))).toBe(true);
    });
    pushState.mockRestore();
  });
});

// B6: the portfolio theme picker matched `title + medium` substrings rather
// than the work's theme tags, and an empty result rendered a blank space with
// no explanation. filterWorksByTheme (portfolio-filters.ts) carries the
// matching rules; these cover the wiring and the empty state.
describe("ArtistProfileClient portfolio theme filter (B6)", () => {
  const TAGGED = {
    ...WORK,
    id: "w-tagged",
    title: "Winter Field",
    themes: ["Landscapes"],
  };
  const OTHER = {
    ...WORK,
    id: "w-other",
    title: "Colours of Autumn",
    themes: ["Abstract"],
  };

  function renderWithThemes(activeWorks: unknown[]) {
    return render(
      <ArtistProfileClient
        artistName="Alice"
        artistSlug="alice"
        extendedBio=""
        themes={["Landscapes", "Abstract"]}
        works={activeWorks as never[]}
      />,
    );
  }

  /** Grid cards carry id="work-<slugified title>"; titles also appear in the
   *  hover overlay, so query the card rather than the text. */
  function cardIds(container: HTMLElement): string[] {
    return Array.from(container.querySelectorAll('[id^="work-"]')).map(
      (el) => el.id,
    );
  }

  /** The Portfolio theme <select>, identified by its "All" option. */
  function themePicker(): HTMLSelectElement {
    const combos = screen.getAllByRole("combobox") as HTMLSelectElement[];
    const match = combos.find((c) =>
      Array.from(c.options).some((o) => o.value === "All"),
    );
    if (!match) throw new Error("theme picker not found");
    return match;
  }

  it("selects on the work's theme tags, not on its title", () => {
    const { container } = renderWithThemes([TAGGED, OTHER]);
    expect(cardIds(container)).toHaveLength(2);

    fireEvent.change(themePicker(), { target: { value: "Landscapes" } });

    // "Colours of Autumn" is tagged Abstract, so it must not appear under
    // Landscapes. Pre-fix the filter never read the tags at all.
    expect(cardIds(container)).toEqual(["work-winter-field"]);
  });

  it("does not pull in a work just because the theme appears in its title", () => {
    const { container } = renderWithThemes([TAGGED, OTHER]);

    fireEvent.change(themePicker(), { target: { value: "Abstract" } });

    expect(cardIds(container)).toEqual(["work-colours-of-autumn"]);
  });

  it("explains an empty result and offers a way back", () => {
    // Untagged works fall back to the substring match, which finds nothing
    // for a theme like this one. That used to render a blank space.
    const { container } = renderWithThemes([{ ...WORK, title: "Last Light" }]);

    fireEvent.change(themePicker(), { target: { value: "Landscapes" } });

    expect(cardIds(container)).toHaveLength(0);
    expect(screen.getByText("No works under this theme.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Show the whole portfolio" }));
    expect(cardIds(container)).toEqual(["work-last-light"]);
  });
});
