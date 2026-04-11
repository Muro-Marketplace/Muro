"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/lib/api-client";

interface Conversation {
  conversationId: string;
  latestMessage: string;
  latestSender: string;
  latestSenderType: string;
  otherParty: string;
  unreadCount: number;
  lastActivity: string;
  messageCount: number;
}

interface Message {
  id: number;
  conversation_id: string;
  sender_id: string | null;
  sender_name: string;
  sender_type: string;
  recipient_slug: string;
  content: string;
  is_read: boolean;
  created_at: string;
}

interface MessageInboxProps {
  userSlug: string;
  portalType: "artist" | "venue";
  initialArtistSlug?: string;
}

export default function MessageInbox({ userSlug, portalType, initialArtistSlug }: MessageInboxProps) {
  const { user, displayName } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConv, setSelectedConv] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [threadLoading, setThreadLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const convPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const threadPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // New conversation state (when messaging someone new)
  const [composing, setComposing] = useState(false);
  const [composeRecipient, setComposeRecipient] = useState("");
  const [composeMessage, setComposeMessage] = useState("");

  const slugRef = useRef(userSlug);
  slugRef.current = userSlug;

  // Load conversations
  const loadConversations = useCallback(async (silent = false) => {
    try {
      const res = await authFetch(`/api/messages?slug=${slugRef.current}`);
      const data = await res.json();
      if (data.conversations) {
        setConversations((prev) => {
          // Only update if data actually changed (avoid re-renders)
          if (JSON.stringify(prev.map((c) => c.messageCount)) !== JSON.stringify(data.conversations.map((c: Conversation) => c.messageCount))) {
            return data.conversations;
          }
          // Still update unread counts and latest messages
          if (JSON.stringify(prev) !== JSON.stringify(data.conversations)) {
            return data.conversations;
          }
          return prev;
        });
      }
    } catch (err) {
      if (!silent) console.error("Failed to load conversations:", err);
    }
  }, []);

  // Initial load + set up conversation polling
  useEffect(() => {
    loadConversations().then(() => setLoading(false));

    // Poll conversations every 15s
    convPollRef.current = setInterval(() => loadConversations(true), 15000);
    return () => {
      if (convPollRef.current) clearInterval(convPollRef.current);
    };
  }, [loadConversations]);

  // Handle initialArtistSlug — auto-open or create conversation
  useEffect(() => {
    if (!initialArtistSlug || loading) return;

    // Find existing conversation with this artist
    const existing = conversations.find((c) => c.otherParty === initialArtistSlug);
    if (existing) {
      setSelectedConv(existing.conversationId);
    } else {
      // Open new message composer
      setComposing(true);
      setComposeRecipient(initialArtistSlug);
    }
  }, [initialArtistSlug, loading, conversations]);

  // Load thread when selected
  const loadThread = useCallback(async (convId: string, silent = false) => {
    if (!silent) setThreadLoading(true);
    try {
      const res = await authFetch(`/api/messages/${convId}`);
      const data = await res.json();
      if (data.messages) {
        setMessages((prev) => {
          if (prev.length !== data.messages.length) return data.messages;
          return prev;
        });
      }

      // Mark as read
      await authFetch(`/api/messages/${convId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ readerSlug: slugRef.current }),
      });

      setConversations((prev) =>
        prev.map((c) =>
          c.conversationId === convId ? { ...c, unreadCount: 0 } : c
        )
      );
    } catch (err) {
      if (!silent) console.error("Failed to load thread:", err);
    }
    if (!silent) setThreadLoading(false);
  }, []);

  useEffect(() => {
    if (!selectedConv) {
      setMessages([]);
      if (threadPollRef.current) clearInterval(threadPollRef.current);
      return;
    }

    loadThread(selectedConv);

    // Poll active thread every 8s
    threadPollRef.current = setInterval(() => loadThread(selectedConv, true), 8000);
    return () => {
      if (threadPollRef.current) clearInterval(threadPollRef.current);
    };
  }, [selectedConv, loadThread]);

  // Scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSendReply() {
    if (!reply.trim() || !selectedConv) return;
    setSending(true);

    const conv = conversations.find((c) => c.conversationId === selectedConv);
    const recipientSlug = conv?.otherParty || "";

    try {
      await authFetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: selectedConv,
          senderId: user?.id,
          senderName: userSlug,
          senderType: portalType,
          recipientSlug,
          content: reply.trim(),
        }),
      });

      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          conversation_id: selectedConv,
          sender_id: user?.id || null,
          sender_name: userSlug,
          sender_type: portalType,
          recipient_slug: recipientSlug,
          content: reply.trim(),
          is_read: false,
          created_at: new Date().toISOString(),
        },
      ]);

      setConversations((prev) =>
        prev.map((c) =>
          c.conversationId === selectedConv
            ? { ...c, latestMessage: reply.trim(), latestSender: userSlug, lastActivity: new Date().toISOString(), messageCount: c.messageCount + 1 }
            : c
        )
      );

      setReply("");
    } catch (err) {
      console.error("Failed to send:", err);
    }
    setSending(false);
  }

  async function handleSendNewMessage() {
    if (!composeMessage.trim() || !composeRecipient) return;
    setSending(true);

    try {
      const res = await authFetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          senderName: userSlug,
          senderType: portalType,
          recipientSlug: composeRecipient,
          content: composeMessage.trim(),
        }),
      });
      const data = await res.json();

      if (data.conversationId) {
        // Refresh conversations and select the new one
        await loadConversations();
        setSelectedConv(data.conversationId);
        setComposing(false);
        setComposeMessage("");
        setComposeRecipient("");
      }
    } catch (err) {
      console.error("Failed to send:", err);
    }
    setSending(false);
  }

  function timeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  if (loading) {
    return <p className="text-muted text-sm py-16 text-center">Loading messages...</p>;
  }

  return (
    <div className="flex h-[calc(100vh-10rem)] border border-border rounded-sm overflow-hidden bg-surface">
      {/* Conversation list */}
      <div className={`${selectedConv || composing ? "hidden sm:block" : ""} w-full sm:w-80 shrink-0 border-r border-border overflow-y-auto`}>
        {conversations.length === 0 && !composing ? (
          <p className="text-muted text-sm text-center py-16 px-4">No messages yet</p>
        ) : (
          conversations.map((conv) => (
            <button
              key={conv.conversationId}
              onClick={() => { setSelectedConv(conv.conversationId); setComposing(false); }}
              className={`w-full text-left px-4 py-3.5 border-b border-border transition-colors ${
                selectedConv === conv.conversationId
                  ? "bg-accent/5"
                  : "hover:bg-background"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground truncate">{conv.otherParty}</p>
                    {conv.unreadCount > 0 && (
                      <span className="w-2 h-2 rounded-full bg-accent shrink-0" />
                    )}
                  </div>
                  <p className="text-xs text-muted truncate mt-0.5">{conv.latestMessage}</p>
                </div>
                <span className="text-[10px] text-muted shrink-0">{timeAgo(conv.lastActivity)}</span>
              </div>
            </button>
          ))
        )}
      </div>

      {/* Thread view / New message composer */}
      <div className={`${selectedConv || composing ? "" : "hidden sm:flex"} flex-1 flex flex-col`}>
        {composing ? (
          /* New message composer */
          <>
            <div className="px-4 py-3 border-b border-border flex items-center gap-3">
              <button
                onClick={() => { setComposing(false); setComposeRecipient(""); setComposeMessage(""); }}
                className="sm:hidden text-muted hover:text-foreground"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
              </button>
              <div>
                <p className="text-sm font-medium">New Message</p>
                <p className="text-[10px] text-muted">to {composeRecipient}</p>
              </div>
            </div>
            <div className="flex-1 flex items-center justify-center px-6">
              <div className="text-center max-w-sm">
                <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-4">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C17C5A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                </div>
                <p className="text-sm text-muted mb-1">Start a conversation with <strong className="text-foreground">{composeRecipient}</strong></p>
                <p className="text-xs text-muted">Your message will appear in their inbox.</p>
              </div>
            </div>
            <div className="px-4 py-3 border-t border-border">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={composeMessage}
                  onChange={(e) => setComposeMessage(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendNewMessage(); } }}
                  placeholder="Type your first message..."
                  className="flex-1 px-3 py-2.5 bg-background border border-border rounded-sm text-sm focus:outline-none focus:border-accent/50"
                  autoFocus
                />
                <button
                  onClick={handleSendNewMessage}
                  disabled={!composeMessage.trim() || sending}
                  className="px-4 py-2.5 bg-accent text-white text-sm font-medium rounded-sm hover:bg-accent-hover transition-colors disabled:opacity-40"
                >
                  {sending ? "..." : "Send"}
                </button>
              </div>
            </div>
          </>
        ) : !selectedConv ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-border/30 flex items-center justify-center mx-auto mb-3">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
              </div>
              <p className="text-muted text-sm">Select a conversation</p>
            </div>
          </div>
        ) : threadLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-muted text-sm">Loading...</p>
          </div>
        ) : (
          <>
            {/* Thread header */}
            <div className="px-4 py-3 border-b border-border flex items-center gap-3">
              <button
                onClick={() => setSelectedConv(null)}
                className="sm:hidden text-muted hover:text-foreground"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
              </button>
              <div>
                <p className="text-sm font-medium">
                  {conversations.find((c) => c.conversationId === selectedConv)?.otherParty}
                </p>
                <p className="text-[10px] text-muted">{messages.length} messages</p>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
              {messages.map((msg) => {
                const isMe = msg.sender_type === portalType;
                return (
                  <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[75%] px-3.5 py-2.5 rounded-lg text-sm ${
                      isMe
                        ? "bg-accent text-white rounded-br-none"
                        : "bg-background border border-border text-foreground rounded-bl-none"
                    }`}>
                      <p className="leading-relaxed">{msg.content}</p>
                      <p className={`text-[9px] mt-1 ${isMe ? "text-white/50" : "text-muted"}`}>
                        {timeAgo(msg.created_at)}
                      </p>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Reply input */}
            <div className="px-4 py-3 border-t border-border">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendReply(); } }}
                  placeholder="Type a message..."
                  className="flex-1 px-3 py-2.5 bg-background border border-border rounded-sm text-sm focus:outline-none focus:border-accent/50"
                />
                <button
                  onClick={handleSendReply}
                  disabled={!reply.trim() || sending}
                  className="px-4 py-2.5 bg-accent text-white text-sm font-medium rounded-sm hover:bg-accent-hover transition-colors disabled:opacity-40"
                >
                  {sending ? "..." : "Send"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
