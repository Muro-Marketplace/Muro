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
// F1/F11 need the real anchor attributes (href / target), so the Link stub
// renders an <a> rather than swallowing its props.
vi.mock("next/link", () => ({
  default: ({ children, href, target, rel, ...rest }: Record<string, unknown> & { children?: unknown; href?: string }) => (
    <a href={href} target={target as string | undefined} rel={rel as string | undefined} {...(rest as Record<string, unknown>)}>
      {children as never}
    </a>
  ),
}));
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

// jsdom implements no layout, so scrollIntoView is missing. The scroll-to-bottom
// effect runs whenever the thread gains a message.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView() {};
}

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

function seedInbox(conversations = [conv("conv-1", "bob", "Bob Venue"), conv("conv-2", "carol", "Carol Venue")]) {
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

describe("MessageInbox venue empty state has a working CTA (F1)", () => {
  it("links the venue empty state to /browse", async () => {
    authFetchMock.mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ conversations: [] }), { status: 200 })),
    );

    render(<MessageInbox userSlug="me" portalType="venue" />);

    // Fail-before: the copy said "Start by messaging an artist you're
    // interested in." with no compose control and no link anywhere in
    // the inbox, so the instruction was unfollowable.
    const cta = await screen.findByRole("link", { name: /browse artists/i });
    expect(cta.getAttribute("href")).toBe("/browse");
  });

  it("does not show the browse CTA for artists", async () => {
    authFetchMock.mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ conversations: [] }), { status: 200 })),
    );

    render(<MessageInbox userSlug="me" portalType="artist" />);

    await screen.findByText("No conversations yet");
    expect(screen.queryByRole("link", { name: /browse artists/i })).toBeNull();
  });
});

describe("MessageInbox reply field is multi-line (F4)", () => {
  it("renders the reply composer as a textarea so Shift+Enter can insert a newline", async () => {
    seedInbox();
    render(<MessageInbox userSlug="me" portalType="artist" />);
    fireEvent.click(await screen.findByText("Bob Venue"));

    const reply = await screen.findByPlaceholderText("Type a message...");
    // Fail-before: <input type="text">, where a newline is impossible.
    expect(reply.tagName).toBe("TEXTAREA");
  });

  it("renders the compose field as a textarea too", async () => {
    authFetchMock.mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ conversations: [] }), { status: 200 })),
    );
    render(<MessageInbox userSlug="me" portalType="artist" initialArtistSlug="target" initialArtistName="Target" />);

    const compose = await screen.findByPlaceholderText("Type your first message...");
    expect(compose.tagName).toBe("TEXTAREA");
  });

  it("still sends on plain Enter and does not send on Shift+Enter", async () => {
    seedInbox();
    mutateMock.mockResolvedValue({ success: true });
    render(<MessageInbox userSlug="me" portalType="artist" />);
    fireEvent.click(await screen.findByText("Bob Venue"));
    const reply = await screen.findByPlaceholderText("Type a message...");
    fireEvent.change(reply, { target: { value: "line one" } });

    fireEvent.keyDown(reply, { key: "Enter", shiftKey: true });
    expect(mutateMock).not.toHaveBeenCalledWith("/api/messages", expect.objectContaining({ method: "POST" }));

    fireEvent.keyDown(reply, { key: "Enter" });
    await waitFor(() =>
      expect(mutateMock).toHaveBeenCalledWith("/api/messages", expect.objectContaining({ method: "POST" })),
    );
  });
});

describe("MessageInbox help link opens in a new tab (F11)", () => {
  it("the Help row carries target=_blank and a safe rel", async () => {
    seedInbox();
    render(<MessageInbox userSlug="me" portalType="artist" />);
    fireEvent.click(await screen.findByText("Bob Venue"));
    fireEvent.click(await screen.findByLabelText("Conversation options"));

    const help = (await screen.findByText("Help")).closest("a");
    // Fail-before: the copy promised a new tab but the Link had no target,
    // so following it navigated away and lost the thread.
    expect(help?.getAttribute("target")).toBe("_blank");
    expect(help?.getAttribute("rel")).toContain("noopener");
  });
});

describe("MessageInbox report uses an in-modal textarea, not window.prompt (F12)", () => {
  it("collects the reason in the modal and posts it", async () => {
    seedInbox();
    mutateMock.mockResolvedValue({ success: true });
    const promptSpy = vi.spyOn(window, "prompt").mockReturnValue(null);
    render(<MessageInbox userSlug="me" portalType="artist" />);
    fireEvent.click(await screen.findByText("Bob Venue"));
    fireEvent.click(await screen.findByLabelText("Conversation options"));

    fireEvent.click(await screen.findByText("Report"));

    // Fail-before: window.prompt() was called, and in-app browsers that
    // suppress it returned null, so Report silently did nothing.
    const reason = await screen.findByPlaceholderText(/what happened/i);
    expect(promptSpy).not.toHaveBeenCalled();
    fireEvent.change(reason, { target: { value: "Abusive language" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit report" }));

    await waitFor(() =>
      expect(mutateMock).toHaveBeenCalledWith(
        "/api/messages/report",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("Abusive language"),
        }),
      ),
    );
    promptSpy.mockRestore();
  });
});

describe("MessageInbox surfaces a load failure instead of an empty state (F18)", () => {
  it("renders an error with retry when the conversations request fails", async () => {
    authFetchMock.mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ error: "Invalid request" }), { status: 500 })),
    );

    render(<MessageInbox userSlug="me" portalType="artist" />);

    // Fail-before: the component only looked at data.conversations, so a
    // 500 rendered the friendly "No conversations yet" empty state.
    expect(await screen.findByText(/couldn't load your conversations/i)).toBeTruthy();
    expect(screen.queryByText("No conversations yet")).toBeNull();

    authFetchMock.mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ conversations: [] }), { status: 200 })),
    );
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("No conversations yet")).toBeTruthy();
  });
});

describe("MessageInbox support threads route to /contact (F50)", () => {
  it("hides the reply composer and points at the contact form", async () => {
    seedInbox([conv("conv-support", "wallplace-support", "Wallplace Support")]);
    render(<MessageInbox userSlug="me" portalType="artist" />);
    fireEvent.click(await screen.findByText("Wallplace Support"));

    // Fail-before: the reply box stayed, and POST /api/messages 404s
    // because no profile row owns the wallplace-support slug.
    await waitFor(() => expect(screen.queryByPlaceholderText("Type a message...")).toBeNull());
    const contact = screen.getByRole("link", { name: /contact the team/i });
    expect(contact.getAttribute("href")).toBe("/contact");
  });

  it("leaves the reply composer in place on a normal thread", async () => {
    seedInbox();
    render(<MessageInbox userSlug="me" portalType="artist" />);
    fireEvent.click(await screen.findByText("Bob Venue"));

    expect(await screen.findByPlaceholderText("Type a message...")).toBeTruthy();
  });
});

describe("MessageInbox offer card shows and honours the deadline (F41)", () => {
  function offerMessage(expiresAt: string | null) {
    return {
      id: 1,
      conversation_id: "conv-1",
      sender_id: "them",
      sender_name: "bob",
      sender_type: "venue",
      recipient_slug: "me",
      content: "Made an offer of £42.00.",
      is_read: true,
      created_at: new Date().toISOString(),
      message_type: "purchase_offer",
      metadata: {
        offerId: "off_1",
        offerAmountPence: 4200,
        formattedAmount: "£42.00",
        senderUserId: "them",
        recipientUserId: "u1",
        primaryTitle: "Last Light",
        expiresAt,
      },
    };
  }

  function seedThreadWithOffer(expiresAt: string | null) {
    const conversations = [conv("conv-1", "bob", "Bob Venue")];
    authFetchMock.mockImplementation((url: string) =>
      Promise.resolve(
        new Response(
          JSON.stringify(
            url.startsWith("/api/messages?")
              ? { conversations }
              : { messages: [offerMessage(expiresAt)] },
          ),
          { status: 200 },
        ),
      ),
    );
  }

  it("shows the deadline on a live offer and keeps the actions", async () => {
    seedThreadWithOffer("2099-05-03T12:00:00.000Z");
    render(<MessageInbox userSlug="me" portalType="artist" />);
    fireEvent.click(await screen.findByText("Bob Venue"));

    // Fail-before: expires_at reached no surface at all.
    expect(await screen.findByText("Expires 3 May 2099")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Accept" })).toBeTruthy();
  });

  it("marks a lapsed offer expired and pulls the actions", async () => {
    seedThreadWithOffer("2026-01-01T00:00:00.000Z");
    render(<MessageInbox userSlug="me" portalType="artist" />);
    fireEvent.click(await screen.findByText("Bob Venue"));

    // Fail-before: Accept / Counter / Decline stayed live on an offer whose
    // deadline had passed, and the PATCH accepted it.
    expect(await screen.findByText("Expired 1 Jan 2026")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Accept" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Decline" })).toBeNull();
  });

  it("leaves an open-ended offer exactly as it was", async () => {
    seedThreadWithOffer(null);
    render(<MessageInbox userSlug="me" portalType="artist" />);
    fireEvent.click(await screen.findByText("Bob Venue"));

    expect(await screen.findByRole("button", { name: "Accept" })).toBeTruthy();
    expect(screen.queryByText(/^Expires /)).toBeNull();
  });
});
