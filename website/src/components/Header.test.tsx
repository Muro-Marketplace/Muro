// @vitest-environment jsdom
//
// Wave 4 / C-header regressions:
//
//   A2 + H7  Customers must not be shown the header messages dropdown at all.
//            The messages API rejects any account without an artist or venue
//            profile, so for a customer the dropdown could only ever be an
//            empty inbox that never fills. Locked here so nobody "fixes" the
//            empty state by inventing a client-side slug for customers again.
//   H6       The portal dropdown must be the portal sidebar, not a hand-copied
//            subset of it. Both now read src/lib/portal-nav.ts.
//   C19      The mobile "Notifications" entry must actually show notifications
//            instead of being a plain link to the portal dashboard.

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor, within } from "@testing-library/react";

const { authFetchMock, mutateMock, useAuthMock, push, signOut } = vi.hoisted(() => ({
  authFetchMock: vi.fn(),
  mutateMock: vi.fn(),
  useAuthMock: vi.fn(),
  push: vi.fn(),
  signOut: vi.fn(),
}));

let pathname = "/artist-portal";

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(""),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

vi.mock("./CartIndicator", () => ({ default: () => <span>cart</span> }));
vi.mock("@/context/AuthContext", () => ({ useAuth: useAuthMock }));
vi.mock("@/lib/api-client", () => ({ authFetch: authFetchMock, mutate: mutateMock }));

import Header from "./Header";
import { portalNavLinksForRole } from "@/lib/portal-nav";

const NOTIFICATION = {
  id: "n-1",
  type: "placement",
  title: "Placement request from The Copper Kettle",
  description: "They would like to show two of your works",
  time: "2026-08-20T10:00:00.000Z",
  link: "/artist-portal/placements",
  readAt: null,
};

function reply(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

// Route the component's fetches by URL so each test can reason about one thing.
function routeFetch(url: string) {
  if (url.startsWith("/api/notifications")) {
    return Promise.resolve(reply({ unreadCount: 1, notifications: [NOTIFICATION] }));
  }
  if (url.startsWith("/api/messages/unread")) return Promise.resolve(reply({ count: 0 }));
  if (url.startsWith("/api/messages")) return Promise.resolve(reply({ conversations: [] }));
  if (url.startsWith("/api/account/roles")) return Promise.resolve(reply({ roles: [] }));
  return Promise.resolve(reply({ profile: { slug: "maya-chen" } }));
}

function signedInAs(userType: string) {
  useAuthMock.mockReturnValue({
    user: { id: "u-1", email: "maya@example.com" },
    userType,
    displayName: "Maya Chen",
    signOut,
    loading: false,
  });
}

// Opens the portal dropdown and returns its links, in render order.
function portalDropdownLinks() {
  fireEvent.click(screen.getByLabelText("Portal menu"));
  const list = screen.getByRole("list");
  return within(list)
    .getAllByRole("link")
    .map((a) => ({ label: a.textContent?.trim() ?? "", href: a.getAttribute("href") ?? "" }));
}

beforeEach(() => {
  pathname = "/artist-portal";
  push.mockReset();
  signOut.mockReset();
  mutateMock.mockReset();
  mutateMock.mockResolvedValue(undefined);
  useAuthMock.mockReset();
  authFetchMock.mockReset();
  authFetchMock.mockImplementation(routeFetch);
});

afterEach(cleanup);

describe("<Header /> messages dropdown (A2, H7)", () => {
  it("does not render the messages dropdown for a customer", async () => {
    signedInAs("customer");
    render(<Header />);
    await waitFor(() => expect(authFetchMock).toHaveBeenCalled());
    expect(screen.queryByLabelText("Messages")).toBeNull();
  });

  it("never asks the messages API for a customer's unread count", async () => {
    signedInAs("customer");
    render(<Header />);
    await waitFor(() => expect(authFetchMock).toHaveBeenCalled());
    const called = authFetchMock.mock.calls.map((c) => String(c[0]));
    expect(called.some((u) => u.startsWith("/api/messages"))).toBe(false);
  });

  it("still renders the messages dropdown for an artist", async () => {
    signedInAs("artist");
    render(<Header />);
    await waitFor(() => expect(authFetchMock).toHaveBeenCalled());
    expect(screen.getByLabelText("Messages")).toBeTruthy();
  });
});

describe("<Header /> portal dropdown is the sidebar nav (H6)", () => {
  for (const role of ["artist", "venue", "customer"]) {
    it(`lists exactly the ${role} portal nav, in order`, async () => {
      signedInAs(role);
      render(<Header />);
      await waitFor(() => expect(authFetchMock).toHaveBeenCalled());
      expect(portalDropdownLinks()).toEqual(portalNavLinksForRole(role));
    });
  }

  it("carries the artist entries the hand-written list had dropped", async () => {
    signedInAs("artist");
    render(<Header />);
    await waitFor(() => expect(authFetchMock).toHaveBeenCalled());
    const labels = portalDropdownLinks().map((l) => l.label);
    expect(labels).toContain("Enquiries");
    expect(labels).toContain("My Offers");
    expect(labels).toContain("Social Posts");
  });

  it("carries My Offers for a venue", async () => {
    signedInAs("venue");
    render(<Header />);
    await waitFor(() => expect(authFetchMock).toHaveBeenCalled());
    expect(portalDropdownLinks().map((l) => l.label)).toContain("My Offers");
  });
});

describe("<Header /> mobile notifications (C19)", () => {
  async function openMobileMenu(role = "artist") {
    signedInAs(role);
    render(<Header />);
    await waitFor(() => expect(authFetchMock).toHaveBeenCalled());
    fireEvent.click(screen.getByLabelText("Open menu"));
  }

  // The desktop bell carries aria-label="Notifications" too, so target the
  // mobile control by the panel it drives rather than by name.
  function mobileToggle() {
    const el = document.querySelector('[aria-controls="mobile-notifications"]');
    if (!el) throw new Error("no mobile notifications toggle");
    return el as HTMLElement;
  }

  it("offers notifications as a control, not a link to the dashboard", async () => {
    await openMobileMenu();
    // Before C19 the mobile entry was <Link href={portalBase}> with a bell.
    expect(screen.queryAllByRole("link", { name: /Notifications/i })).toHaveLength(0);
    expect(mobileToggle().tagName).toBe("BUTTON");
    expect(mobileToggle().textContent).toContain("Notifications");
  });

  it("shows the notification list inline when opened", async () => {
    await openMobileMenu();
    expect(document.getElementById("mobile-notifications")).toBeTruthy();
    expect(screen.queryByText(NOTIFICATION.title)).toBeNull();

    fireEvent.click(mobileToggle());
    expect(await screen.findByText(NOTIFICATION.title)).toBeTruthy();
    const row = screen.getByText(NOTIFICATION.title).closest("a");
    expect(row?.getAttribute("href")).toBe("/artist-portal/placements");
  });

  it("closes again on a second press", async () => {
    await openMobileMenu();
    fireEvent.click(mobileToggle());
    expect(await screen.findByText(NOTIFICATION.title)).toBeTruthy();
    expect(mobileToggle().getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(mobileToggle());
    await waitFor(() => expect(screen.queryByText(NOTIFICATION.title)).toBeNull());
    expect(mobileToggle().getAttribute("aria-expanded")).toBe("false");
  });

  it("says so plainly when there is nothing to show", async () => {
    authFetchMock.mockImplementation((url: string) =>
      url.startsWith("/api/notifications")
        ? Promise.resolve(reply({ unreadCount: 0, notifications: [] }))
        : routeFetch(url),
    );
    await openMobileMenu();
    fireEvent.click(mobileToggle());
    expect(await screen.findByText("No new notifications")).toBeTruthy();
  });
});
