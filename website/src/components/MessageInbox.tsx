"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/lib/api-client";
import type { ArtistWork } from "@/data/artists";
import PlacementContextPanel from "@/components/PlacementContextPanel";

interface Conversation {
  conversationId: string;
  latestMessage: string;
  latestSender: string;
  latestSenderType: string;
  otherParty: string;
  otherPartyDisplayName: string;
  otherPartyImage: string | null;
  otherPartyType: "artist" | "venue";
  hasActivePlacement: boolean;
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
  message_type?: string;
  metadata?: Record<string, unknown>;
}

interface MessageInboxProps {
  userSlug: string;
  portalType: "artist" | "venue";
  initialArtistSlug?: string;
  initialArtistName?: string;
  works?: ArtistWork[];
}

function Avatar({ src, name, size = 36 }: { src?: string | null; name: string; size?: number }) {
  const initial = name?.charAt(0)?.toUpperCase() || "?";
  const cls = `rounded-full object-cover shrink-0`;
  if (src) {
    return <img src={src} alt="" className={cls} style={{ width: size, height: size }} />;
  }
  return (
    <div className="rounded-full bg-accent/10 flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
      <span className="font-medium text-accent" style={{ fontSize: size * 0.38 }}>{initial}</span>
    </div>
  );
}

export default function MessageInbox({ userSlug, portalType, initialArtistSlug, initialArtistName, works }: MessageInboxProps) {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConv, setSelectedConv] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [threadLoading, setThreadLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const convPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const threadPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Compose new conversation
  const [composing, setComposing] = useState(false);
  const [composeRecipient, setComposeRecipient] = useState("");
  const [composeRecipientName, setComposeRecipientName] = useState("");
  const [composeMessage, setComposeMessage] = useState("");

  // Works available to include in a placement request from this conversation.
  // Loaded lazily when the placement panel needs them.
  const [otherPartyWorks, setOtherPartyWorks] = useState<ArtistWork[]>([]);
  const [otherWorksLoading, setOtherWorksLoading] = useState(false);

  // Conversation search
  const [searchQuery, setSearchQuery] = useState("");

  // Mobile: right-side panel toggle
  const [panelOpenMobile, setPanelOpenMobile] = useState(false);

  const slugRef = useRef(userSlug);
  slugRef.current = userSlug;

  // Load conversations
  const loadConversations = useCallback(async (silent = false) => {
    try {
      const res = await authFetch(`/api/messages?slug=${slugRef.current}`);
      const data = await res.json();
      if (data.conversations) {
        const convs = data.conversations as Conversation[];
        // Add Wallplace Support if not already present
        if (!convs.some((c) => c.otherParty === "wallplace-support")) {
          convs.push({
            conversationId: "wallplace-support",
            latestMessage: "Need help? Send us a message.",
            latestSender: "wallplace-support",
            latestSenderType: "admin",
            otherParty: "wallplace-support",
            otherPartyDisplayName: "Wallplace Support",
            otherPartyImage: null,
            otherPartyType: "artist" as const,
            hasActivePlacement: false,
            unreadCount: 0,
            lastActivity: new Date().toISOString(),
            messageCount: 0,
          });
        }
        setConversations((prev) => {
          if (JSON.stringify(prev) !== JSON.stringify(convs)) return convs;
          return prev;
        });
      }
    } catch (err) {
      if (!silent) console.error("Failed to load conversations:", err);
    }
  }, []);

  useEffect(() => {
    loadConversations().then(() => setLoading(false));
    convPollRef.current = setInterval(() => loadConversations(true), 15000);
    return () => { if (convPollRef.current) clearInterval(convPollRef.current); };
  }, [loadConversations]);

  // Handle initialArtistSlug
  useEffect(() => {
    if (!initialArtistSlug || loading) return;
    const existing = conversations.find((c) => c.otherParty === initialArtistSlug);
    if (existing) {
      setSelectedConv(existing.conversationId);
    } else {
      setComposing(true);
      setComposeRecipient(initialArtistSlug);
      setComposeRecipientName(initialArtistName || initialArtistSlug);
    }
  }, [initialArtistSlug, initialArtistName, loading, conversations]);

  // Load thread
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
      await authFetch(`/api/messages/${convId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ readerSlug: slugRef.current }),
      });
      setConversations((prev) => prev.map((c) => c.conversationId === convId ? { ...c, unreadCount: 0 } : c));
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
    threadPollRef.current = setInterval(() => loadThread(selectedConv, true), 8000);
    return () => { if (threadPollRef.current) clearInterval(threadPollRef.current); };
  }, [selectedConv, loadThread]);

  // Load works for the placement panel whenever the selected conversation changes.
  useEffect(() => {
    const other = conversations.find((c) => c.conversationId === selectedConv)?.otherParty;
    if (!other || other === "wallplace-support") { setOtherPartyWorks([]); return; }
    loadOtherPartyWorks(other);
  }, [selectedConv, conversations, loadOtherPartyWorks]);

  // Scroll to bottom (most recent messages) when thread loads or new message sent
  useEffect(() => {
    const scrollToBottom = () => {
      messagesEndRef.current?.scrollIntoView({ behavior: "instant", block: "end" });
    };
    scrollToBottom();
    const timer = setTimeout(scrollToBottom, 150);
    return () => clearTimeout(timer);
  }, [messages]);

  const selectedConvData = conversations.find((c) => c.conversationId === selectedConv);

  async function handleSendReply() {
    if (!reply.trim() || !selectedConv || !selectedConvData) return;
    setSending(true);
    setSendError(null);
    try {
      const res = await authFetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: selectedConv,
          senderName: userSlug,
          senderType: portalType,
          recipientSlug: selectedConvData.otherParty,
          content: reply.trim(),
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        setSendError(errData.error || "Failed to send message");
        setSending(false);
        return;
      }
      setMessages((prev) => [...prev, {
        id: Date.now(),
        conversation_id: selectedConv,
        sender_id: user?.id || null,
        sender_name: userSlug,
        sender_type: portalType,
        recipient_slug: selectedConvData.otherParty,
        content: reply.trim(),
        is_read: false,
        created_at: new Date().toISOString(),
      }]);
      setConversations((prev) => prev.map((c) =>
        c.conversationId === selectedConv
          ? { ...c, latestMessage: reply.trim(), lastActivity: new Date().toISOString(), messageCount: c.messageCount + 1 }
          : c
      ));
      setReply("");
    } catch (err) {
      console.error("Failed to send:", err);
    }
    setSending(false);
  }

  async function handleSendNewMessage() {
    if (!composeMessage.trim() || !composeRecipient) return;
    setSending(true);
    setSendError(null);
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
      if (!res.ok) {
        setSendError(data.error || "Failed to send message");
      } else if (data.conversationId) {
        await loadConversations();
        setSelectedConv(data.conversationId);
        setComposing(false);
        setComposeMessage("");
      }
    } catch (err) {
      console.error("Failed to send:", err);
    }
    setSending(false);
  }

  // Load the works the current user can offer (artist) or pick from (venue).
  const loadOtherPartyWorks = useCallback(async (otherPartySlug: string) => {
    if (portalType === "artist" && works && works.length > 0) {
      setOtherPartyWorks(works);
      return;
    }
    setOtherWorksLoading(true);
    try {
      const res = await fetch("/api/browse-artists");
      const data = await res.json();
      const artist = (data.artists || []).find((a: { slug: string }) => a.slug === otherPartySlug);
      if (artist?.works) setOtherPartyWorks(artist.works);
      else setOtherPartyWorks([]);
    } catch { /* empty */ }
    setOtherWorksLoading(false);
  }, [portalType, works]);

  async function handleDeleteConversation(convId: string) {
    try {
      const res = await authFetch(`/api/messages/${convId}`, { method: "DELETE" });
      if (res.ok) {
        setConversations((prev) => prev.filter((c) => c.conversationId !== convId));
        if (selectedConv === convId) {
          setSelectedConv(null);
          setMessages([]);
        }
      }
    } catch (err) {
      console.error("Delete failed:", err);
    }
  }

  async function handlePlacementResponse(msg: Message, accept: boolean) {
    if (!selectedConvData) return;
    const placementId = (msg.metadata as Record<string, unknown>)?.placementId as string | undefined;

    // Update the real placement status first. If it fails (e.g. legacy requests
    // without a placementId), surface the error and abort so we don't leave a
    // confusing "accepted" message without the underlying state change.
    if (placementId) {
      try {
        const res = await authFetch("/api/placements", {
          method: "PATCH",
          body: JSON.stringify({ id: placementId, status: accept ? "active" : "declined" }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          alert(data.error || "Could not update placement. Please try again.");
          return;
        }
      } catch (err) {
        console.error("Placement PATCH failed:", err);
        alert("Network error. Please try again.");
        return;
      }
    }

    try {
      await authFetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: selectedConv,
          senderName: userSlug,
          senderType: portalType,
          recipientSlug: selectedConvData.otherParty,
          content: accept ? "Placement accepted" : "Placement declined",
          messageType: "placement_response",
          metadata: { placementId, status: accept ? "active" : "declined" },
        }),
      });

      setMessages((prev) => [...prev, {
        id: Date.now(),
        conversation_id: selectedConv!,
        sender_id: user?.id || null,
        sender_name: userSlug,
        sender_type: portalType,
        recipient_slug: selectedConvData.otherParty,
        content: accept ? "Placement accepted" : "Placement declined",
        is_read: false,
        created_at: new Date().toISOString(),
        message_type: "placement_response",
        metadata: { placementId, status: accept ? "active" : "declined" },
      }]);
    } catch (err) {
      console.error("Placement response message failed:", err);
    }
  }

  function timeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "now";
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    return `${days}d`;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-13rem)]">
        <p className="text-muted text-sm">Loading messages...</p>
      </div>
    );
  }

  // Apply search + separate placed from the rest
  const { placedConvs, otherConvs } = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const matches = (c: Conversation) => {
      if (!q) return true;
      return (
        c.otherPartyDisplayName.toLowerCase().includes(q) ||
        c.otherParty.toLowerCase().includes(q) ||
        c.latestMessage.toLowerCase().includes(q)
      );
    };
    const filtered = conversations.filter(matches);
    return {
      placedConvs: filtered.filter((c) => c.hasActivePlacement),
      otherConvs: filtered.filter((c) => !c.hasActivePlacement),
    };
  }, [conversations, searchQuery]);

  function renderConvItem(conv: Conversation) {
    return (
      <button
        key={conv.conversationId}
        onClick={() => { setSelectedConv(conv.conversationId); setComposing(false); setPanelOpenMobile(false); }}
        className={`group w-full text-left px-4 py-3 flex items-center gap-3 transition-colors ${
          selectedConv === conv.conversationId
            ? "bg-accent/8 border-l-2 border-l-accent"
            : "border-l-2 border-l-transparent hover:bg-[#FAF8F5]"
        }`}
      >
        <Avatar src={conv.otherPartyImage} name={conv.otherPartyDisplayName} size={36} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-medium text-foreground truncate">{conv.otherPartyDisplayName}</p>
            {conv.unreadCount > 0 && <span className="w-2 h-2 rounded-full bg-accent shrink-0" />}
            {conv.hasActivePlacement && (
              <span className="inline-flex items-center gap-0.5 text-[9px] font-medium text-green-700 bg-green-100 px-1.5 py-0.5 rounded-full shrink-0">
                <svg width="8" height="8" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="2 7 5.5 10.5 12 3.5" /></svg>
                Placed
              </span>
            )}
          </div>
          <p className="text-xs text-muted truncate mt-0.5">{conv.latestMessage}</p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className="text-[10px] text-muted">{timeAgo(conv.lastActivity)}</span>
          <button
            onClick={(e) => { e.stopPropagation(); if (confirm("Delete this conversation?")) handleDeleteConversation(conv.conversationId); }}
            className="text-muted/40 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
            title="Delete"
          >
            <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M3 3l8 8M11 3L3 11" /></svg>
          </button>
        </div>
      </button>
    );
  }

  const showPanel = !!selectedConv && !composing;
  const selectedOtherParty = selectedConvData?.otherParty || "";
  const selectedOtherPartyType = selectedConvData?.otherPartyType || "artist";

  return (
    <div className="flex h-[calc(100vh-13rem)] border border-border rounded-sm overflow-hidden bg-surface">
      {/* Conversation list */}
      <div className={`${selectedConv || composing ? "hidden sm:flex" : "flex"} w-full sm:w-80 shrink-0 border-r border-border flex-col`}>
        {/* Search */}
        <div className="px-4 py-3 border-b border-border">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search conversations\u2026"
              className="w-full pl-8 pr-3 py-2 bg-[#FAF8F5] border border-border rounded-sm text-sm focus:outline-none focus:border-accent/50 placeholder:text-muted"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
        {conversations.length === 0 && !composing ? (
          <div className="flex flex-col items-center justify-center py-16 px-6">
            <div className="w-14 h-14 rounded-full bg-accent/10 flex items-center justify-center mb-4">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#C17C5A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
            </div>
            <p className="text-sm font-medium text-foreground mb-1">No conversations yet</p>
            <p className="text-xs text-muted text-center max-w-[200px]">
              {portalType === "artist" ? "Messages from venues and buyers will appear here." : "Start by messaging an artist you're interested in."}
            </p>
          </div>
        ) : placedConvs.length === 0 && otherConvs.length === 0 && searchQuery ? (
          <div className="px-6 py-10 text-center">
            <p className="text-xs text-muted">No conversations match \u201c{searchQuery}\u201d.</p>
          </div>
        ) : (
          <>
            {placedConvs.length > 0 && (
              <>
                <div className="px-4 py-2 text-[10px] font-medium uppercase tracking-[0.18em] text-muted bg-[#FAF8F5] border-b border-border">Active Placements</div>
                {placedConvs.map(renderConvItem)}
              </>
            )}
            {otherConvs.length > 0 && (
              <>
                <div className="px-4 py-2 text-[10px] font-medium uppercase tracking-[0.18em] text-muted bg-[#FAF8F5] border-b border-border border-t border-border">All Conversations</div>
                {otherConvs.map(renderConvItem)}
              </>
            )}
          </>
        )}
        </div>
      </div>

      {/* Thread view / Compose */}
      <div className={`${selectedConv || composing ? "" : "hidden sm:flex"} flex-1 flex flex-col`}>
        {composing ? (
          <>
            <div className="px-4 py-3 border-b border-border border-b-accent/20 flex items-center gap-3">
              <button onClick={() => { setComposing(false); }} className="sm:hidden text-muted hover:text-foreground">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
              </button>
              <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center shrink-0">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C17C5A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
              </div>
              <div>
                <p className="text-sm font-medium">New Message</p>
                <p className="text-[10px] text-muted">to {composeRecipientName}</p>
              </div>
            </div>
            <div className="flex-1 flex items-center justify-center px-6">
              <div className="text-center max-w-sm">
                <p className="text-sm text-muted mb-1">Start a conversation with <strong className="text-foreground">{composeRecipientName}</strong></p>
              </div>
            </div>
            <div className="px-4 py-3 border-t border-border shadow-[0_-1px_3px_rgba(0,0,0,0.03)]">
              {sendError && (
                <div className="mb-2 flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-sm">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-red-500 shrink-0"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                  <p className="text-xs text-red-600 flex-1">{sendError}</p>
                  <button onClick={() => setSendError(null)} className="text-red-400 hover:text-red-600">
                    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M3 3l8 8M11 3L3 11" /></svg>
                  </button>
                </div>
              )}
              <div className="flex gap-2">
                <input type="text" value={composeMessage} onChange={(e) => { setComposeMessage(e.target.value); if (sendError) setSendError(null); }} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendNewMessage(); } }} maxLength={5000} placeholder="Type your first message..." className="flex-1 px-3 py-2.5 bg-background border border-border rounded-sm text-sm focus:outline-none focus:border-accent/50" autoFocus />
                <button onClick={handleSendNewMessage} disabled={!composeMessage.trim() || sending || composeMessage.length > 5000} className="px-4 py-2.5 bg-accent text-white text-sm font-medium rounded-sm hover:bg-accent-hover transition-colors disabled:opacity-40">
                  {sending ? "..." : "Send"}
                </button>
              </div>
              {composeMessage.length > 0 && (
                <p className={`text-[10px] mt-1 text-right ${composeMessage.length > 4800 ? (composeMessage.length > 5000 ? "text-red-500" : "text-amber-500") : "text-muted"}`}>
                  {(5000 - composeMessage.length).toLocaleString()} characters remaining
                </p>
              )}
            </div>
          </>
        ) : !selectedConv ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-14 h-14 rounded-full bg-border/20 flex items-center justify-center mx-auto mb-3">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
              </div>
              <p className="text-sm text-muted">Select a conversation</p>
            </div>
          </div>
        ) : threadLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-muted text-sm">Loading...</p>
          </div>
        ) : (
          <>
            {/* Thread header */}
            <div className="px-4 py-3 border-b border-border border-b-accent/20">
              {/* Row 1: back + avatar + name + badge */}
              <div className="flex items-center gap-3">
                <button onClick={() => { setSelectedConv(null); setPanelOpenMobile(false); }} className="sm:hidden text-muted hover:text-foreground shrink-0">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
                </button>
                <Avatar src={selectedConvData?.otherPartyImage} name={selectedConvData?.otherPartyDisplayName || ""} size={40} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {selectedConvData?.otherPartyType === "artist" ? (
                      <Link href={`/browse/${selectedConvData.otherParty}`} className="text-sm font-medium truncate hover:text-accent transition-colors">{selectedConvData.otherPartyDisplayName}</Link>
                    ) : selectedConvData?.otherPartyType === "venue" ? (
                      <Link href="/spaces-looking-for-art" className="text-sm font-medium truncate hover:text-accent transition-colors">{selectedConvData.otherPartyDisplayName}</Link>
                    ) : (
                      <p className="text-sm font-medium truncate">{selectedConvData?.otherPartyDisplayName}</p>
                    )}
                    {selectedConvData?.hasActivePlacement && (
                      <span className="inline-flex items-center gap-0.5 text-[9px] font-medium text-green-700 bg-green-100 px-1.5 py-0.5 rounded-full shrink-0">
                        <svg width="8" height="8" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="2 7 5.5 10.5 12 3.5" /></svg>
                        Placed
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-muted">{messages.length} messages</p>
                </div>
                {/* Report button — inline on row 1 */}
                <button
                  onClick={() => {
                    if (confirm(`Report ${selectedConvData?.otherPartyDisplayName || "this user"} for inappropriate behaviour?\n\nThis will notify the Wallplace team for review.`)) {
                      alert("Report submitted. Our team will review this conversation and take appropriate action.");
                    }
                  }}
                  className="p-1.5 text-muted hover:text-red-500 transition-colors shrink-0"
                  title="Report user"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" />
                  </svg>
                </button>
              </div>
              {/* Row 2: action buttons (hidden for support conversations) */}
              {selectedConvData?.otherParty !== "wallplace-support" && (
                <div className="flex items-center gap-3 mt-2 pl-0 sm:pl-[52px]">
                  {selectedConvData?.otherPartyType === "artist" && (
                    <Link href={`/browse/${selectedConvData.otherParty}`} className="text-xs text-accent hover:text-accent-hover transition-colors">View Portfolio</Link>
                  )}
                  {selectedConvData?.otherPartyType === "venue" && (
                    <Link href="/spaces-looking-for-art" className="text-xs text-accent hover:text-accent-hover transition-colors">View Spaces</Link>
                  )}
                  <Link href={`${portalType === "artist" ? "/artist-portal" : "/venue-portal"}/placements`} className="text-xs text-accent hover:text-accent-hover transition-colors">My Placements</Link>
                  {/* Mobile-only placement drawer toggle */}
                  <button
                    type="button"
                    onClick={() => setPanelOpenMobile(true)}
                    className="lg:hidden ml-auto text-xs px-2.5 py-1 rounded-sm border border-accent/30 text-accent hover:bg-accent/5 transition-colors"
                  >
                    Placement
                  </button>
                </div>
              )}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
              {messages.map((msg) => {
                const isMe = (msg.sender_id != null && msg.sender_id === user?.id) || (msg.sender_id == null && msg.sender_name === userSlug);
                const meta = (msg.metadata || {}) as Record<string, unknown>;

                // Placement request card
                if (msg.message_type === "placement_request") {
                  return (
                    <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                      <div className="max-w-[80%] border border-accent/30 rounded-lg overflow-hidden bg-white">
                        <div className="px-3.5 py-2 bg-accent/5 border-b border-accent/20">
                          <p className="text-[10px] font-medium uppercase tracking-wider text-accent">Placement Request</p>
                        </div>
                        <div className="px-3.5 py-3 space-y-1.5">
                          {typeof meta.workImage === "string" && meta.workImage && (
                            <div className="w-full h-24 relative rounded-sm overflow-hidden mb-2">
                              <Image src={meta.workImage} alt="" fill className="object-cover" sizes="300px" />
                            </div>
                          )}
                          <p className="text-sm font-medium text-foreground">{meta.workTitle as string || "Artwork"}</p>
                          <p className="text-xs text-muted">
                            {meta.arrangementType === "revenue_share" ? `Revenue Share ${meta.revenueSharePercent}%` : "Free Display"}
                          </p>
                          {msg.content && <p className="text-xs text-muted italic">{msg.content}</p>}
                        </div>
                        {(() => {
                          // Check if this placement request has already been responded to
                          const placementId = meta.placementId;
                          const hasResponse = messages.some(
                            (m) => m.message_type === "placement_response" && m.metadata?.placementId === placementId
                          );
                          const responseMsg = messages.find(
                            (m) => m.message_type === "placement_response" && m.metadata?.placementId === placementId
                          );
                          if (hasResponse && responseMsg) {
                            const accepted = responseMsg.metadata?.status === "active";
                            return (
                              <div className={`px-3.5 py-2 border-t ${accepted ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
                                <p className={`text-xs font-medium ${accepted ? "text-green-700" : "text-red-600"}`}>
                                  {accepted ? "✓ Accepted" : "✗ Declined"}
                                </p>
                              </div>
                            );
                          }
                          if (!isMe) {
                            return (
                              <div className="px-3.5 py-2 border-t border-border flex gap-2">
                                <button onClick={() => handlePlacementResponse(msg, true)} className="px-3 py-1.5 text-xs font-medium text-white bg-green-600 hover:bg-green-700 rounded-sm transition-colors">Accept</button>
                                <button onClick={() => handlePlacementResponse(msg, false)} className="px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 hover:bg-red-50 rounded-sm transition-colors">Decline</button>
                              </div>
                            );
                          }
                          return null;
                        })()}
                        <div className="px-3.5 py-1.5 bg-[#FAF8F5]">
                          <p className="text-[9px] text-muted">{timeAgo(msg.created_at)}</p>
                        </div>
                      </div>
                    </div>
                  );
                }

                // Placement response card
                if (msg.message_type === "placement_response") {
                  const accepted = meta.status === "active";
                  return (
                    <div key={msg.id} className="flex justify-center">
                      <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-medium ${accepted ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
                        {accepted ? (
                          <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="2 7 5.5 10.5 12 3.5" /></svg>
                        ) : (
                          <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 3l8 8M11 3L3 11" /></svg>
                        )}
                        {accepted ? "Placement Accepted" : "Placement Declined"}
                      </div>
                    </div>
                  );
                }

                // Regular text message
                return (
                  <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"} gap-2`}>
                    {!isMe && <Avatar src={selectedConvData?.otherPartyImage} name={selectedConvData?.otherPartyDisplayName || ""} size={24} />}
                    <div className={`max-w-[75%] px-3.5 py-2.5 rounded-lg text-sm ${
                      isMe
                        ? "bg-accent text-white rounded-br-none"
                        : "bg-[#FAF8F5] border border-border text-foreground rounded-bl-none"
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
            <div className="px-4 py-3 border-t border-border shadow-[0_-1px_3px_rgba(0,0,0,0.03)]">
              {sendError && (
                <div className="mb-2 flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-sm">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-red-500 shrink-0"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                  <p className="text-xs text-red-600 flex-1">{sendError}</p>
                  <button onClick={() => setSendError(null)} className="text-red-400 hover:text-red-600">
                    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M3 3l8 8M11 3L3 11" /></svg>
                  </button>
                </div>
              )}
              <div className="flex gap-2">
                <input type="text" value={reply} onChange={(e) => { setReply(e.target.value); if (sendError) setSendError(null); }} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendReply(); } }} maxLength={5000} placeholder="Type a message..." className="flex-1 px-3 py-2.5 bg-background border border-border rounded-sm text-sm focus:outline-none focus:border-accent/50" />
                <button onClick={handleSendReply} disabled={!reply.trim() || sending || reply.length > 5000} className="px-4 py-2.5 bg-accent text-white text-sm font-medium rounded-sm hover:bg-accent-hover transition-colors disabled:opacity-40">
                  {sending ? "..." : "Send"}
                </button>
              </div>
              {reply.length > 0 && (
                <p className={`text-[10px] mt-1 text-right ${reply.length > 4800 ? (reply.length > 5000 ? "text-red-500" : "text-amber-500") : "text-muted"}`}>
                  {(5000 - reply.length).toLocaleString()} characters remaining
                </p>
              )}
            </div>
          </>
        )}
      </div>

      {/* Right: placement context panel (lg+ always, mobile as a drawer) */}
      {showPanel && selectedConvData && (
        <>
          <div className="hidden lg:block w-80 shrink-0">
            <PlacementContextPanel
              otherPartySlug={selectedOtherParty}
              otherPartyName={selectedConvData.otherPartyDisplayName}
              otherPartyType={selectedOtherPartyType}
              otherPartyImage={selectedConvData.otherPartyImage}
              portalType={portalType}
              userId={user?.id}
              otherPartyWorks={otherPartyWorks}
              otherPartyWorksLoading={otherWorksLoading}
            />
          </div>
          {panelOpenMobile && (
            <div className="lg:hidden fixed inset-0 z-50 flex">
              <div className="flex-1 bg-black/40" onClick={() => setPanelOpenMobile(false)} />
              <div className="w-[min(360px,90vw)] bg-surface border-l border-border shadow-xl overflow-hidden flex flex-col">
                <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                  <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted">Placement</p>
                  <button onClick={() => setPanelOpenMobile(false)} className="text-muted hover:text-foreground">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M3 3l8 8M11 3L3 11" /></svg>
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto">
                  <PlacementContextPanel
                    otherPartySlug={selectedOtherParty}
                    otherPartyName={selectedConvData.otherPartyDisplayName}
                    otherPartyType={selectedOtherPartyType}
                    otherPartyImage={selectedConvData.otherPartyImage}
                    portalType={portalType}
                    userId={user?.id}
                    otherPartyWorks={otherPartyWorks}
                    otherPartyWorksLoading={otherWorksLoading}
                  />
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
