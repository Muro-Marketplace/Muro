// @vitest-environment jsdom
//
// G17. The dispute row printed the literal string
// "GET /api/messages?dispute_id={id}" in a <code> tag and left the admin to go
// and run it. The admin-scoped branch of that endpoint has worked since Phase
// 2.8; nothing in the portal ever called it. The row now fetches and renders
// the thread.
//
// G20. Escalating no longer overwrites the dispute's category, so the row has
// to show both the flag and the classification it was filed under.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const { authFetchMock, mutateMock } = vi.hoisted(() => ({
  authFetchMock: vi.fn(),
  mutateMock: vi.fn(),
}));

vi.mock("@/lib/api-client", () => ({
  authFetch: authFetchMock,
  mutate: mutateMock,
  ApiError: class ApiError extends Error {
    code?: string;
  },
}));
vi.mock("@/components/AdminPortalLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import AdminDisputesPage from "./page";

const DISPUTE = {
  id: "dsp-1",
  opener_user_id: "u-buyer",
  conversation_id: "conv-1",
  order_id: null,
  placement_id: "plc-1",
  status: "open",
  category: "damaged",
  description: "The piece arrived with a torn corner.",
  resolution: null,
  created_at: "2026-08-01T09:00:00.000Z",
};

const MESSAGES = [
  {
    id: "m-1",
    conversation_id: "conv-1",
    sender_name: "maya-chen",
    recipient_slug: "copper-kettle",
    content: "The frame was fine when it left my studio.",
    created_at: "2026-08-01T10:00:00.000Z",
  },
  {
    id: "m-2",
    conversation_id: "conv-1",
    sender_name: "copper-kettle",
    recipient_slug: "maya-chen",
    content: "It was dented on arrival, photos attached.",
    created_at: "2026-08-01T11:00:00.000Z",
  },
];

function reply(body: unknown, ok = true) {
  return { ok, status: ok ? 200 : 500, json: async () => body } as unknown as Response;
}

function installFetch(disputes: unknown[] = [DISPUTE]) {
  authFetchMock.mockImplementation(async (url: string) => {
    if (url.startsWith("/api/messages")) return reply({ messages: MESSAGES });
    return reply({ disputes });
  });
}

beforeEach(() => {
  authFetchMock.mockReset();
  mutateMock.mockReset();
  mutateMock.mockResolvedValue({ status: "ok" });
  installFetch();
  vi.spyOn(window, "prompt").mockReturnValue("Refunded in full.");
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("G17: the conversation is readable in the portal", () => {
  it("no longer tells the admin to run an API call by hand", async () => {
    render(<AdminDisputesPage />);
    await screen.findByText("damaged");
    expect(screen.queryByText(/GET \/api\/messages/)).toBeNull();
  });

  it("fetches the dispute-scoped thread and renders the messages", async () => {
    render(<AdminDisputesPage />);
    fireEvent.click(await screen.findByText(/read the conversation/i));

    await waitFor(() =>
      expect(authFetchMock).toHaveBeenCalledWith("/api/messages?dispute_id=dsp-1"),
    );
    expect(await screen.findByText(MESSAGES[0].content)).toBeTruthy();
    expect(screen.getByText(MESSAGES[1].content)).toBeTruthy();
  });

  it("does not pull every thread on load, only the one asked for", async () => {
    render(<AdminDisputesPage />);
    await screen.findByText("damaged");
    expect(
      authFetchMock.mock.calls.filter((c) => String(c[0]).startsWith("/api/messages")),
    ).toHaveLength(0);
  });

  it("says so when the thread cannot be loaded", async () => {
    authFetchMock.mockImplementation(async (url: string) => {
      if (url.startsWith("/api/messages")) return reply({ error: "nope" }, false);
      return reply({ disputes: [DISPUTE] });
    });
    render(<AdminDisputesPage />);
    fireEvent.click(await screen.findByText(/read the conversation/i));
    expect(await screen.findByText(/could not load the conversation/i)).toBeTruthy();
  });

  it("offers nothing to read on a dispute with no conversation", async () => {
    installFetch([{ ...DISPUTE, conversation_id: null }]);
    render(<AdminDisputesPage />);
    await screen.findByText("damaged");
    expect(screen.queryByText(/read the conversation/i)).toBeNull();
  });
});

describe("G20: an escalated dispute still shows what it was filed as", () => {
  it("renders the classification and an escalated flag, not the raw stored value", async () => {
    installFetch([{ ...DISPUTE, category: "escalated: damaged" }]);
    render(<AdminDisputesPage />);

    expect(await screen.findByText("damaged")).toBeTruthy();
    expect(screen.getByText("Escalated")).toBeTruthy();
  });

  it("shows no flag on a dispute nobody escalated", async () => {
    render(<AdminDisputesPage />);
    await screen.findByText("damaged");
    expect(screen.queryByText("Escalated")).toBeNull();
  });
});
