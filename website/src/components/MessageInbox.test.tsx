// @vitest-environment jsdom
// 05 E43 (per-file migration of MessageInbox). handleSendNewMessage used
// `const res = await authFetch(...); if (!res.ok) setSendError(...)`. authFetch
// resolves on a non-2xx, so a rejected send still fell through. It now goes
// through mutate() (throws on a non-2xx), so the error is surfaced and the
// compose view stays open on failure, and only closes on a confirmed send.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";

const { authFetchMock, mutateMock, showToastMock, confirmMock, searchParamsMock } = vi.hoisted(() => ({
  authFetchMock: vi.fn(),
  mutateMock: vi.fn(),
  showToastMock: vi.fn(),
  confirmMock: vi.fn(async () => true),
  searchParamsMock: vi.fn(() => new URLSearchParams()),
}));

vi.mock("next/navigation", () => ({ useSearchParams: () => searchParamsMock() }));
vi.mock("@/lib/api-client", () => ({ authFetch: authFetchMock, mutate: mutateMock, ApiError: class ApiError extends Error {} }));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("@/context/ToastContext", () => ({ useToast: () => ({ showToast: showToastMock }) }));
vi.mock("@/context/ConfirmContext", () => ({ useConfirm: () => ({ confirm: confirmMock }) }));
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
  confirmMock.mockReset();
  confirmMock.mockResolvedValue(true);
  searchParamsMock.mockReset();
  searchParamsMock.mockReturnValue(new URLSearchParams());
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

// ── Fixtures for tests that need a populated inbox ─────────────────────────

function conv(id: string, otherParty: string, displayName: string) {
  return {
    conversationId: id,
    latestMessage: "hello there",
    latestSender: otherParty,
    latestSenderType: "venue",
    otherParty,
    otherPartyDisplayName: displayName,
    otherPartyImage: null,
    otherPartyType: "venue",
    hasActivePlacement: false,
    unreadCount: 0,
    lastActivity: new Date().toISOString(),
    messageCount: 1,
  };
}

function seedInbox() {
  const conversations = [conv("conv-1", "bob", "Bob Venue"), conv("conv-2", "carol", "Carol Venue")];
  authFetchMock.mockImplementation((url: string) =>
    Promise.resolve(
      new Response(
        JSON.stringify(
          url.startsWith("/api/messages?") ? { conversations } : { messages: [] },
        ),
        { status: 200 },
      ),
    ),
  );
}

describe("MessageInbox ?c= auto-open (H20)", () => {
  it("opens the conversation named by ?c= once conversations load", async () => {
    seedInbox();
    searchParamsMock.mockReturnValue(new URLSearchParams("c=conv-2"));

    render(<MessageInbox userSlug="me" portalType="artist" />);

    // Fail-before: the param was ignored, so the email's "Open
    // conversation" link landed on the inbox with nothing selected.
    await waitFor(() =>
      expect(authFetchMock).toHaveBeenCalledWith("/api/messages/conv-2"),
    );
  });

  it("ignores a ?c= that matches no conversation", async () => {
    seedInbox();
    searchParamsMock.mockReturnValue(new URLSearchParams("c=conv-999"));

    render(<MessageInbox userSlug="me" portalType="artist" />);

    expect(await screen.findByText("Select a conversation")).toBeTruthy();
    expect(authFetchMock).not.toHaveBeenCalledWith("/api/messages/conv-999");
  });
});

describe("MessageInbox delete-conversation copy is honest (F2)", () => {
  it("the sidebar delete confirm says the delete is permanent and mutual", async () => {
    seedInbox();
    confirmMock.mockResolvedValue(false); // copy check only, don't delete
    render(<MessageInbox userSlug="me" portalType="artist" />);
    await screen.findByText("Bob Venue");

    fireEvent.click(screen.getAllByTitle("Delete")[0]);

    // Fail-before: no body at all, so nothing warned that the endpoint
    // hard-deletes the thread for both parties.
    await waitFor(() =>
      expect(confirmMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Delete this conversation?",
          body: expect.stringContaining("permanently deletes the conversation for both of you"),
          destructive: true,
        }),
      ),
    );
  });

  it("the options-popup delete confirms honestly and calls the per-conversation endpoint", async () => {
    seedInbox();
    mutateMock.mockResolvedValue({ success: true });
    render(<MessageInbox userSlug="me" portalType="artist" />);
    fireEvent.click(await screen.findByText("Bob Venue"));
    fireEvent.click(await screen.findByLabelText("Conversation options"));

    fireEvent.click(await screen.findByText("Delete conversation"));

    // Fail-before: the copy promised a support-recoverable archive, and the
    // request went to DELETE /api/messages, which has no DELETE handler.
    await waitFor(() =>
      expect(confirmMock).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.stringContaining("permanently deletes the conversation for both of you"),
        }),
      ),
    );
    await waitFor(() =>
      expect(mutateMock).toHaveBeenCalledWith(
        "/api/messages/conv-1",
        expect.objectContaining({ method: "DELETE" }),
      ),
    );
    // The thread is gone from the local list and the outcome is confirmed.
    await waitFor(() => expect(screen.queryByText("Bob Venue")).toBeNull());
    expect(showToastMock).toHaveBeenCalledWith("Conversation deleted.");
  });
});
