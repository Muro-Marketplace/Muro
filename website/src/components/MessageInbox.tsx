"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/lib/api-client";
import type { ArtistWork } from "@/data/artists";

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

  // Placement request form
  const [showPlacementForm, setShowPlacementForm] = useState(false);
  const [placementSelectedWorks, setPlacementSelectedWorks] = useState<Set<string>>(new Set());
  const [placementRevShare, setPlacementRevShare] = useState(0);
  const [placementMessage, setPlacementMessage] = useState("");
  const [otherPartyWorks, setOtherPartyWorks] = useState<ArtistWork[]>([]);
  const [otherWorksLoading, setOtherWorksLoading] = useState(false);

  const slugRef = useRef(userSlug);
  slugRef.current = userSlug;

  // Load conversations
  const loadConversations = useCallback(async (silent = false) => {
    try {
      const res = await authFetch(`/api/messages?slug=${slugRef.current}`);
      const data = await res.json();
      if (data.conversations) {
        setConversations((prev) => {
          if (JSON.stringify(prev) !== JSON.stringify(data.conversations)) return data.conversations;
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

  // Scroll to bottom within the messages container only (not the whole page)
  useEffect(() => {
    if (messagesEndRef.current) {
      const container = messagesEndRef.current.parentElement;
      if (container) {
        container.scrollTop = container.scrollHeight;
      }
    }
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

  // Load the other party's works for the placement form
  async function loadOtherPartyWorks() {
    if (!selectedConvData) return;
    // If current user is artist, use their own works prop. If venue, fetch the artist's portfolio.
    if (portalType === "artist" && works && works.length > 0) {
      setOtherPartyWorks(works);
      return;
    }
    // Venue: fetch artist's portfolio
    setOtherWorksLoading(true);
    try {
      const res = await fetch("/api/browse-artists");
      const data = await res.json();
      const artist = (data.artists || []).find((a: { slug: string }) => a.slug === selectedConvData.otherParty);
      if (artist?.works) setOtherPartyWorks(artist.works);
    } catch { /* empty */ }
    setOtherWorksLoading(false);
  }

  function togglePlacementWork(title: string) {
    setPlacementSelectedWorks((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  }

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

  async function handlePlacementRequest() {
    if (!selectedConvData || placementSelectedWorks.size === 0) return;
    setSending(true);

    const workTitles = Array.from(placementSelectedWorks);
    const firstWork = otherPartyWorks.find((w) => w.title === workTitles[0]);
    const label = workTitles.length === 1 ? workTitles[0] : `${workTitles.length} works`;
    const content = placementRevShare > 0
      ? `Placement request: ${label} — Revenue Share ${placementRevShare}%${placementMessage ? ` — ${placementMessage}` : ""}`
      : `Placement request: ${label} — Free Display${placementMessage ? ` — ${placementMessage}` : ""}`;

    try {
      const res = await authFetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: selectedConv,
          senderName: userSlug,
          senderType: portalType,
          recipientSlug: selectedConvData.otherParty,
          content,
          messageType: "placement_request",
          metadata: {
            workTitle: workTitles.join(", "),
            workImage: firstWork?.image || null,
            workTitles,
            arrangementType: placementRevShare > 0 ? "revenue_share" : "free_loan",
            revenueSharePercent: placementRevShare > 0 ? placementRevShare : null,
          },
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        console.error("Placement request failed:", errData.error || res.status);
        setSending(false);
        return;
      }

      setMessages((prev) => [...prev, {
        id: Date.now(),
        conversation_id: selectedConv!,
        sender_id: user?.id || null,
        sender_name: userSlug,
        sender_type: portalType,
        recipient_slug: selectedConvData.otherParty,
        content,
        is_read: false,
        created_at: new Date().toISOString(),
        message_type: "placement_request",
        metadata: { workTitle: workTitles.join(", "), workImage: firstWork?.image || null, workTitles, arrangementType: placementRevShare > 0 ? "revenue_share" : "free_loan", revenueSharePercent: placementRevShare },
      }]);

      setShowPlacementForm(false);
      setPlacementSelectedWorks(new Set());
      setPlacementRevShare(0);
      setPlacementMessage("");
    } catch (err) {
      console.error("Placement request failed:", err);
    }
    setSending(false);
  }

  async function handlePlacementResponse(msg: Message, accept: boolean) {
    if (!selectedConvData) return;
    const placementId = (msg.metadata as Record<string, unknown>)?.placementId as string;

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
        metadata: { status: accept ? "active" : "declined" },
      }]);
    } catch (err) {
      console.error("Placement response failed:", err);
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

  // Separate placed and unplaced conversations
  const placedConvs = conversations.filter((c) => c.hasActivePlacement);
  const otherConvs = conversations.filter((c) => !c.hasActivePlacement);

  function renderConvItem(conv: Conversation) {
    return (
      <button
        key={conv.conversationId}
        onClick={() => { setSelectedConv(conv.conversationId); setComposing(false); setShowPlacementForm(false); }}
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

  return (
    <div className="flex h-[calc(100vh-13rem)] border border-border rounded-sm overflow-hidden bg-surface">
      {/* Conversation list */}
      <div className={`${selectedConv || composing ? "hidden sm:block" : ""} w-full sm:w-80 shrink-0 border-r border-border overflow-y-auto`}>
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
        ) : (
          <>
            {placedConvs.length > 0 && (
              <>
                <div className="px-4 py-2 text-[10px] font-medium uppercase tracking-widest text-muted bg-[#FAF8F5] border-b border-border">Active Placements</div>
                {placedConvs.map(renderConvItem)}
              </>
            )}
            {otherConvs.length > 0 && (
              <>
                {placedConvs.length > 0 && (
                  <div className="px-4 py-2 text-[10px] font-medium uppercase tracking-widest text-muted bg-[#FAF8F5] border-b border-border">All Conversations</div>
                )}
                {otherConvs.map(renderConvItem)}
              </>
            )}
          </>
        )}
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
            <div className="px-4 py-3 border-b border-border border-b-accent/20 flex items-center gap-3">
              <button onClick={() => { setSelectedConv(null); setShowPlacementForm(false); }} className="sm:hidden text-muted hover:text-foreground">
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
                    <span className="inline-flex items-center gap-0.5 text-[9px] font-medium text-green-700 bg-green-100 px-1.5 py-0.5 rounded-full">
                      <svg width="8" height="8" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="2 7 5.5 10.5 12 3.5" /></svg>
                      Placed
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-muted">{messages.length} messages</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {selectedConvData?.otherPartyType === "artist" && (
                  <Link href={`/browse/${selectedConvData.otherParty}`} className="text-xs text-accent hover:text-accent-hover transition-colors">View Portfolio</Link>
                )}
                {selectedConvData?.otherPartyType === "venue" && (
                  <Link href="/spaces-looking-for-art" className="text-xs text-accent hover:text-accent-hover transition-colors">View Spaces</Link>
                )}
                <button onClick={() => { setShowPlacementForm(!showPlacementForm); if (!showPlacementForm) loadOtherPartyWorks(); }} className={`text-xs px-2.5 py-1.5 rounded-sm border transition-colors ${showPlacementForm ? "bg-accent text-white border-accent" : "text-accent border-accent/30 hover:bg-accent/5"}`}>
                  Request Placement
                </button>
                <button
                  onClick={() => {
                    if (confirm(`Report ${selectedConvData?.otherPartyDisplayName || "this user"} for inappropriate behaviour?\n\nThis will notify the Wallplace team for review.`)) {
                      alert("Report submitted. Our team will review this conversation and take appropriate action.");
                    }
                  }}
                  className="p-1.5 text-muted hover:text-red-500 transition-colors"
                  title="Report user"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Placement request form */}
            {showPlacementForm && (
              <div className="px-4 py-3 bg-[#FAF8F5] border-b border-border space-y-3 max-h-[50vh] overflow-y-auto">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium uppercase tracking-widest text-muted">
                    Request Placement {placementSelectedWorks.size > 0 && <span className="text-accent ml-1 normal-case">({placementSelectedWorks.size} selected)</span>}
                  </p>
                  <button onClick={() => { setShowPlacementForm(false); setPlacementSelectedWorks(new Set()); }} className="text-xs text-muted hover:text-foreground">Cancel</button>
                </div>

                {/* Work selector grid */}
                {otherWorksLoading ? (
                  <p className="text-xs text-muted">Loading portfolio...</p>
                ) : otherPartyWorks.length > 0 ? (
                  <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-thin">
                    {otherPartyWorks.map((w) => {
                      const selected = placementSelectedWorks.has(w.title);
                      return (
                        <button
                          key={w.id}
                          type="button"
                          onClick={() => togglePlacementWork(w.title)}
                          className={`relative w-20 h-20 shrink-0 rounded-sm overflow-hidden border-2 transition-all ${selected ? "border-accent shadow-sm" : "border-transparent hover:border-border"}`}
                        >
                          <Image src={w.image} alt={w.title} fill className="object-cover" sizes="80px" />
                          {selected && (
                            <div className="absolute inset-0 bg-accent/25 flex items-center justify-center">
                              <div className="w-5 h-5 rounded-full bg-accent flex items-center justify-center">
                                <svg width="10" height="10" viewBox="0 0 14 14" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><polyline points="2 7 5.5 10.5 12 3.5" /></svg>
                              </div>
                            </div>
                          )}
                          <div className="absolute bottom-0 left-0 right-0 bg-black/50 px-1 py-0.5">
                            <p className="text-[8px] text-white truncate">{w.title}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-muted">No works available to select.</p>
                )}

                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted">Revenue Share</span>
                  <input type="number" min={0} max={50} value={placementRevShare} onChange={(e) => setPlacementRevShare(Number(e.target.value) || 0)} className="w-16 px-2 py-1.5 bg-white border border-border rounded-sm text-xs text-center focus:outline-none focus:border-accent/50" />
                  <span className="text-xs text-muted">%</span>
                  <span className="text-[10px] text-muted ml-1">(0 = free display)</span>
                </div>
                <input type="text" value={placementMessage} onChange={(e) => setPlacementMessage(e.target.value)} placeholder="Add a note (optional)" className="w-full px-3 py-2 bg-white border border-border rounded-sm text-sm focus:outline-none focus:border-accent/50" />
                <button onClick={handlePlacementRequest} disabled={sending || placementSelectedWorks.size === 0} className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-sm hover:bg-accent-hover transition-colors disabled:opacity-40">
                  {sending ? "Sending..." : `Request ${placementSelectedWorks.size} Placement${placementSelectedWorks.size !== 1 ? "s" : ""}`}
                </button>
              </div>
            )}

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
                          {placementMessage && <p className="text-xs text-muted italic">{msg.content}</p>}
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
    </div>
  );
}
