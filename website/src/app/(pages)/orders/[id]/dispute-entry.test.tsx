// @vitest-environment jsdom
//
// Regression tests for B29: POST /api/disputes had no buyer-facing caller,
// so the entire dispute surface was unreachable. The order page now carries
// a "Report a problem" affordance: a category + description form posting to
// /api/disputes for signed-in viewers, and a mailto fallback for guests
// (the API requires Bearer auth, so a guest form could only 401).

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor, fireEvent, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "ord_1" }),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

const { authFetchMock, mutateMock } = vi.hoisted(() => ({
  authFetchMock: vi.fn(),
  mutateMock: vi.fn(),
}));

vi.mock("@/lib/api-client", () => {
  class ApiError extends Error {
    readonly status: number;
    readonly code: string | null;
    readonly payload: unknown;
    constructor(status: number, message: string, code: string | null, payload: unknown) {
      super(message);
      this.name = "ApiError";
      this.status = status;
      this.code = code;
      this.payload = payload;
    }
  }
  return { authFetch: authFetchMock, mutate: mutateMock, ApiError };
});

// Controllable auth state per test.
let currentUser: { id: string } | null = { id: "u-buyer" };
vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ user: currentUser, loading: false, userType: "customer" }),
}));

import OrderTrackingPage from "./page";

const ORDER = {
  id: "ord_1",
  status: "delivered",
  buyerEmail: "b@x.com",
  items: [],
  total: 125,
  currency: "gbp",
  placedAt: "2026-08-01T10:00:00Z",
};

const EVENTS = [
  { event_type: "order.placed", created_at: "2026-08-01T10:00:00Z", metadata: null, actor_user_id: null },
  { event_type: "order.delivered", created_at: "2026-08-05T10:00:00Z", metadata: null, actor_user_id: null },
];

beforeEach(() => {
  currentUser = { id: "u-buyer" };
  authFetchMock.mockReset();
  mutateMock.mockReset();
  authFetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ order: ORDER, events: EVENTS }),
  } as Response);
  mutateMock.mockResolvedValue({ success: true, disputeId: "dsp_1" });
});

afterEach(() => cleanup());

async function renderLoaded() {
  const utils = render(<OrderTrackingPage />);
  await waitFor(() => {
    expect(utils.container.textContent).toContain("Problem with this order?");
  });
  return utils;
}

describe("Order page dispute entry (B29), signed in", () => {
  it("opens the category + description form and posts to /api/disputes", async () => {
    const { container } = await renderLoaded();

    // Open the form from the standing section.
    const openButtons = screen.getAllByRole("button", { name: "Report a problem" });
    expect(openButtons.length).toBeGreaterThan(0);
    fireEvent.click(openButtons[0]);

    const select = container.querySelector<HTMLSelectElement>("#dispute-category");
    const textarea = container.querySelector<HTMLTextAreaElement>("#dispute-description");
    expect(select).not.toBeNull();
    expect(textarea).not.toBeNull();

    fireEvent.change(select!, { target: { value: "Not as described" } });
    fireEvent.change(textarea!, { target: { value: "The colours are nothing like the listing photos." } });
    fireEvent.click(screen.getByRole("button", { name: "Open a case" }));

    await waitFor(() => {
      expect(mutateMock).toHaveBeenCalledTimes(1);
    });
    const [url, init] = mutateMock.mock.calls[0];
    expect(url).toBe("/api/disputes");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      orderId: "ord_1",
      category: "Not as described",
      description: "The colours are nothing like the listing photos.",
    });

    // Success copy replaces the form.
    await waitFor(() => {
      expect(container.textContent).toContain("Problem reported");
    });
  });

  it("refuses a too-short description client-side without calling the API", async () => {
    const { container } = await renderLoaded();

    fireEvent.click(screen.getAllByRole("button", { name: "Report a problem" })[0]);
    const textarea = container.querySelector<HTMLTextAreaElement>("#dispute-description")!;
    fireEvent.change(textarea, { target: { value: "bad" } });
    fireEvent.click(screen.getByRole("button", { name: "Open a case" }));

    await waitFor(() => {
      expect(container.textContent).toContain("at least 10 characters");
    });
    expect(mutateMock).not.toHaveBeenCalled();
  });

  it("surfaces the API's error message when the post fails", async () => {
    const api = await import("@/lib/api-client");
    mutateMock.mockRejectedValue(new api.ApiError(400, "Validation failed", "Validation failed", {}));

    const { container } = await renderLoaded();
    fireEvent.click(screen.getAllByRole("button", { name: "Report a problem" })[0]);
    fireEvent.change(container.querySelector("#dispute-description")!, {
      target: { value: "It arrived with a torn corner." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Open a case" }));

    await waitFor(() => {
      expect(container.textContent).toContain("Validation failed");
    });
    expect(container.textContent).not.toContain("Problem reported");
  });

  it("no longer routes Report a problem through /contact", async () => {
    const { container } = await renderLoaded();
    const hrefs = Array.from(container.querySelectorAll("a")).map((a) => a.getAttribute("href") ?? "");
    expect(hrefs.some((h) => h.startsWith("/contact?order="))).toBe(false);
  });
});

describe("Order page dispute entry (B29), signed out", () => {
  beforeEach(() => {
    currentUser = null;
  });

  it("shows a mailto fallback instead of the form", async () => {
    const { container } = await renderLoaded();

    // No form controls for a viewer the API would 401.
    expect(container.querySelector("#dispute-category")).toBeNull();
    expect(screen.queryByRole("button", { name: "Report a problem" })).toBeNull();

    const mailtos = Array.from(container.querySelectorAll("a")).filter((a) =>
      (a.getAttribute("href") ?? "").startsWith("mailto:hello@wallplace.co.uk"),
    );
    expect(mailtos.length).toBeGreaterThan(0);
    // The subject line carries the order id so support can find it.
    expect(mailtos[0].getAttribute("href")).toContain(encodeURIComponent("Problem with order ord_1"));
  });
});
