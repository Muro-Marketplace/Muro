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
vi.mock("next/image", () => ({ default: () => <span /> }));
vi.mock("@/components/Accordion", () => ({ default: () => <div /> }));
vi.mock("@/components/AnimateIn", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/ScrollButton", () => ({ default: () => <button type="button" /> }));

import CuratedClient from "./CuratedClient";

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
