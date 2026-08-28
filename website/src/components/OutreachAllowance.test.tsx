// @vitest-environment jsdom
//
// The badge is the one place the outreach limit is stated to a logged-in
// artist, and it renders on four surfaces (Spaces header, the request form,
// the portal dashboard, billing). Two things must hold everywhere: it says
// nothing when it has nothing true to say, and it never claims an artist is
// blocked unless the server said so.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({ children }: { children: unknown }) => children,
}));

const { authFetchMock } = vi.hoisted(() => ({ authFetchMock: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ authFetch: authFetchMock }));

import OutreachAllowanceBadge, {
  useOutreachAllowance,
  formatNextSlot,
  type OutreachAllowance,
} from "./OutreachAllowance";

function allowance(over: Partial<OutreachAllowance> = {}): OutreachAllowance {
  return {
    limit: 3,
    used: 1,
    remaining: 2,
    unlimited: false,
    planName: "Core",
    nextSlotAt: null,
    windowDays: 7,
    ...over,
  };
}

/** Exercises the hook through a component, which is the only way to call it. */
function HookProbe() {
  const a = useOutreachAllowance();
  return <div data-testid="probe">{a ? `${a.remaining}/${a.limit} ${a.planName}` : "none"}</div>;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("OutreachAllowanceBadge", () => {
  it("states what is left", () => {
    render(<OutreachAllowanceBadge allowance={allowance({ remaining: 2, limit: 3 })} />);
    expect(screen.getByText(/2 of 3 venue approaches left this week on Core/i)).toBeTruthy();
  });

  it("names the surfaces that share the allowance, so the number isn't misread", () => {
    render(<OutreachAllowanceBadge allowance={allowance()} />);
    expect(
      screen.getByText(/placement requests, first messages and artwork request responses/i),
    ).toBeTruthy();
  });

  it("switches to the spent state with a date and an upgrade link", () => {
    render(
      <OutreachAllowanceBadge
        allowance={allowance({
          remaining: 0,
          nextSlotAt: new Date("2026-09-04T10:00:00Z").toISOString(),
        })}
      />,
    );
    expect(screen.getByText(/used all 3 venue approaches/i)).toBeTruthy();
    expect(screen.getByText(/4 September/)).toBeTruthy();
    expect(screen.getByText(/Upgrade your plan/i)).toBeTruthy();
  });

  it("omits the date when the server didn't supply one", () => {
    render(<OutreachAllowanceBadge allowance={allowance({ remaining: 0, nextSlotAt: null })} />);
    expect(screen.getByText(/used all 3 venue approaches/i)).toBeTruthy();
    expect(screen.queryByText(/frees up on/i)).toBeNull();
  });

  it("uses the singular for a limit of one", () => {
    render(<OutreachAllowanceBadge allowance={allowance({ limit: 1, remaining: 1 })} />);
    expect(screen.getByText(/1 of 1 venue approach left/i)).toBeTruthy();
  });

  it("renders nothing while the lookup is in flight", () => {
    const { container } = render(<OutreachAllowanceBadge allowance={null} />);
    expect(container.textContent).toBe("");
  });

  it("renders nothing on an unlimited plan", () => {
    const { container } = render(
      <OutreachAllowanceBadge allowance={allowance({ unlimited: true, limit: null, remaining: null })} />,
    );
    expect(container.textContent).toBe("");
  });

  it("renders the card variant for the dashboard", () => {
    render(<OutreachAllowanceBadge allowance={allowance()} variant="card" />);
    expect(screen.getByText("Venue approaches this week")).toBeTruthy();
    expect(screen.getByText(/of 3 left/i)).toBeTruthy();
  });

  it("keeps user-facing copy free of dashes (public-copy rule)", () => {
    const { container } = render(<OutreachAllowanceBadge allowance={allowance()} variant="card" />);
    expect(container.textContent).not.toMatch(/[—–]|--/);
  });
});

describe("useOutreachAllowance", () => {
  it("reads the endpoint and exposes the numbers", async () => {
    authFetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        applicable: true,
        planName: "Premium",
        limit: 6,
        used: 2,
        remaining: 4,
        unlimited: false,
        nextSlotAt: null,
        windowDays: 7,
      }),
    });

    render(<HookProbe />);
    await waitFor(() => expect(screen.getByTestId("probe").textContent).toBe("4/6 Premium"));
  });

  it("stays null for a viewer with no artist profile", async () => {
    authFetchMock.mockResolvedValue({ ok: true, json: async () => ({ applicable: false }) });

    render(<HookProbe />);
    await waitFor(() => expect(authFetchMock).toHaveBeenCalled());
    expect(screen.getByTestId("probe").textContent).toBe("none");
  });

  it("stays null when the request fails, so a broken read never blocks outreach", async () => {
    authFetchMock.mockRejectedValue(new Error("offline"));

    render(<HookProbe />);
    await waitFor(() => expect(authFetchMock).toHaveBeenCalled());
    expect(screen.getByTestId("probe").textContent).toBe("none");
  });

  it("stays null on a non-2xx", async () => {
    authFetchMock.mockResolvedValue({ ok: false, json: async () => ({}) });

    render(<HookProbe />);
    await waitFor(() => expect(authFetchMock).toHaveBeenCalled());
    expect(screen.getByTestId("probe").textContent).toBe("none");
  });
});

describe("formatNextSlot", () => {
  it("formats in en-GB long form", () => {
    expect(formatNextSlot("2026-09-04T10:00:00Z")).toMatch(/4 September/);
  });

  it("returns null for null and for an unparseable value", () => {
    expect(formatNextSlot(null)).toBeNull();
    expect(formatNextSlot("not-a-date")).toBeNull();
  });
});
