// @vitest-environment jsdom
//
// The outreach cap was enforced server-side but invisible: the pricing table
// didn't mention it, the form didn't show it, and when it fired the form put
// the machine code on screen ("outreach_limit_reached") because it read
// `data.error` while the sentence sat in `data.message`.
//
// These cover the artist-facing half of that: the allowance line, the blocked
// state, and which field the error box reads.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({ children }: { children: unknown }) => children,
}));
vi.mock("next/image", () => ({ default: () => null }));

// The allowance hook reads through authFetch (which resolves the Supabase
// session); the form's own submit still goes through plain fetch.
const { authFetchMock } = vi.hoisted(() => ({ authFetchMock: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ authFetch: authFetchMock }));

import SpacesPlacementRequestForm from "./SpacesPlacementRequestForm";

const VENUE = {
  slug: "copper-kettle",
  name: "The Copper Kettle",
  interestedInRevenueShare: true,
  interestedInFreeLoan: true,
  interestedInDirectPurchase: true,
};

const WORKS = [{ id: "w1", title: "Harbour Light", image: "/w1.jpg" }];

/**
 * Routes fetch by URL: the allowance lookup gets `allowance`, the submit gets
 * `submit`. Anything else resolves as an empty 200 so unrelated calls in the
 * component don't blow up the test.
 */
function mockFetch({
  allowance,
  submit,
}: {
  allowance?: unknown;
  submit?: { status: number; body: unknown };
}) {
  authFetchMock.mockImplementation(async () => ({
    ok: true,
    status: 200,
    json: async () => allowance ?? { applicable: false },
  }));
  return vi.fn(async (url: string) => {
    if (submit) {
      return {
        ok: submit.status < 400,
        status: submit.status,
        json: async () => submit.body,
      } as Response;
    }
    return { ok: true, status: 200, json: async () => ({}) } as Response;
  }) as unknown as typeof fetch;
}

function renderForm() {
  return render(
    <SpacesPlacementRequestForm
      venue={VENUE}
      works={WORKS}
      authToken="token-123"
      onCancel={() => {}}
      onSuccess={() => {}}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("SpacesPlacementRequestForm — outreach allowance", () => {
  it("shows what the artist has left before they type anything", async () => {
    global.fetch = mockFetch({
      allowance: {
        applicable: true,
        plan: "core",
        planName: "Core",
        limit: 3,
        used: 1,
        remaining: 2,
        unlimited: false,
        nextSlotAt: null,
        windowDays: 7,
      },
    });

    renderForm();

    await waitFor(() =>
      expect(screen.getByText(/2 of 3 venue/i)).toBeTruthy(),
    );
    expect(screen.getByText(/left this week on/i)).toBeTruthy();
  });

  it("blocks the send button and points at pricing when the week is spent", async () => {
    global.fetch = mockFetch({
      allowance: {
        applicable: true,
        planName: "Core",
        limit: 3,
        used: 3,
        remaining: 0,
        unlimited: false,
        nextSlotAt: new Date("2026-09-04T10:00:00Z").toISOString(),
        windowDays: 7,
      },
    });

    renderForm();

    await waitFor(() =>
      expect(screen.getByText(/used all 3 venue approaches/i)).toBeTruthy(),
    );
    expect(screen.getByText(/Upgrade your plan/i)).toBeTruthy();
    const send = screen.getByRole("button", { name: /Send request/i }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
  });

  it("shows no allowance line for a viewer with no artist profile", async () => {
    global.fetch = mockFetch({ allowance: { applicable: false } });

    renderForm();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Send request/i })).toBeTruthy(),
    );
    expect(screen.queryByText(/left this week on/i)).toBeNull();
  });

  it("does not block sending when the allowance lookup fails", async () => {
    authFetchMock.mockRejectedValue(new Error("offline"));
    global.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) } as Response)) as unknown as typeof fetch;

    renderForm();

    await waitFor(() => {
      const send = screen.getByRole("button", { name: /Send request/i }) as HTMLButtonElement;
      expect(send.disabled).toBe(false);
    });
  });
});

describe("SpacesPlacementRequestForm — 429 error copy", () => {
  it("shows the cap sentence, not the machine code, when the API refuses", async () => {
    const sentence =
      "Your Core plan covers 3 new venue approaches a week, counting placement requests, first messages and artwork request responses together.";
    global.fetch = mockFetch({
      allowance: { applicable: false },
      submit: {
        status: 429,
        body: {
          error: "outreach_limit_reached",
          message: sentence,
          plan: "core",
          limit: 3,
          used: 3,
          remaining: 0,
          nextSlotAt: null,
        },
      },
    });

    renderForm();

    const send = await screen.findByRole("button", { name: /Send request/i });
    fireEvent.click(send);

    await waitFor(() => expect(screen.getByText(sentence)).toBeTruthy());
    expect(screen.queryByText("outreach_limit_reached")).toBeNull();
  });

  it("still surfaces an `error`-only body, like the pending-application gate", async () => {
    const pending =
      "Your application is still under review. You'll be able to send placement requests once we've approved your profile.";
    global.fetch = mockFetch({
      allowance: { applicable: false },
      submit: { status: 403, body: { error: pending, reason: "application_pending" } },
    });

    renderForm();

    const send = await screen.findByRole("button", { name: /Send request/i });
    fireEvent.click(send);

    await waitFor(() => expect(screen.getByText(pending)).toBeTruthy());
  });
});
