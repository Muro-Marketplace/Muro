// @vitest-environment jsdom
// 05 E43 (per-file migration of MessageInbox). handleSendNewMessage used
// `const res = await authFetch(...); if (!res.ok) setSendError(...)`. authFetch
// resolves on a non-2xx, so a rejected send still fell through. It now goes
// through mutate() (throws on a non-2xx), so the error is surfaced and the
// compose view stays open on failure, and only closes on a confirmed send.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";

const { authFetchMock, mutateMock, showToastMock } = vi.hoisted(() => ({
  authFetchMock: vi.fn(),
  mutateMock: vi.fn(),
  showToastMock: vi.fn(),
}));

vi.mock("@/lib/api-client", () => ({ authFetch: authFetchMock, mutate: mutateMock, ApiError: class ApiError extends Error {} }));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("@/context/ToastContext", () => ({ useToast: () => ({ showToast: showToastMock }) }));
vi.mock("@/context/ConfirmContext", () => ({ useConfirm: () => vi.fn(async () => true) }));
vi.mock("@/lib/upload", () => ({ uploadMessageAttachment: vi.fn() }));
vi.mock("@/components/PlacementContextPanel", () => ({ default: () => null }));
vi.mock("@/components/CounterPlacementDialog", () => ({ default: () => null }));
vi.mock("@/components/CounterOfferDialog", () => ({ default: () => null }));
vi.mock("next/link", () => ({ default: ({ children }: { children: unknown }) => children }));
vi.mock("next/image", () => ({ default: () => null }));

import MessageInbox from "./MessageInbox";

// jsdom has no matchMedia; the component reads it for its desktop/mobile layout.
window.matchMedia = window.matchMedia || (((query: string) => ({
  matches: true,
  media: query,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia);

afterEach(() => cleanup());
beforeEach(() => {
  authFetchMock.mockReset();
  mutateMock.mockReset();
  showToastMock.mockReset();
  // The conversation load: no existing threads, so the initialArtistSlug effect
  // opens the compose view with the recipient pre-set. A fresh Response per call
  // (a Response body can only be read once).
  authFetchMock.mockImplementation(() =>
    Promise.resolve(new Response(JSON.stringify({ conversations: [], messages: [] }), { status: 200 })),
  );
});

async function renderComposeAndType(text: string) {
  render(<MessageInbox userSlug="me" portalType="artist" initialArtistSlug="target" initialArtistName="Target" />);
  const input = await screen.findByPlaceholderText("Type your first message...");
  fireEvent.change(input, { target: { value: text } });
  return input;
}

describe("MessageInbox handleSendNewMessage (05 E43 migration)", () => {
  it("keeps compose open and shows the error when the send fails", async () => {
    mutateMock.mockRejectedValue(new Error("Blocked by recipient"));
    await renderComposeAndType("hi there");

    fireEvent.click(screen.getByText("Send"));

    // Fail-before: authFetch resolved on the non-2xx, so no error surfaced and
    // the branch that closes compose could still run.
    expect(await screen.findByText("Blocked by recipient")).toBeTruthy();
    // Still composing (the input is still on screen).
    expect(screen.getByPlaceholderText("Type your first message...")).toBeTruthy();
  });

  it("closes compose on a confirmed send", async () => {
    mutateMock.mockResolvedValue({ conversationId: "c1" });
    await renderComposeAndType("hi there");

    fireEvent.click(screen.getByText("Send"));

    // Success path selects the new conversation and leaves compose.
    await waitFor(() =>
      expect(screen.queryByPlaceholderText("Type your first message...")).toBeNull(),
    );
    expect(mutateMock).toHaveBeenCalledWith(
      "/api/messages",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
