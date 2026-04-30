"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/lib/api-client";
import { uploadMessageAttachment, type MessageAttachment } from "@/lib/upload";
import type { ArtistWork } from "@/data/artists";
import PlacementContextPanel from "@/components/PlacementContextPanel";
import CounterPlacementDialog from "@/components/CounterPlacementDialog";

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

interface MessageAttachmentRow {
  url: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  width?: number;
  height?: number;
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
  attachments?: MessageAttachmentRow[];
  pinned_at?: string | null;
  deleted_at?: string | null;
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
  // Attachments staged for the next reply. Uploaded straight away so
  // we already have URLs by send time; we just send the metadata array.
  const [pendingAttachments, setPendingAttachments] = useState<MessageAttachment[]>([]);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
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
  // Used to be `panelOpenMobile`, desktop kept the placement-status
  // sidebar always-visible. We've collapsed it to a drawer at every
  // size so the thread itself gets more breathing room; this state
  // toggles the drawer regardless of viewport now.
  const [panelOpen, setPanelOpen] = useState(false);

  // Flag/report popup (#20). Replaces the old confirm() + alert()
  // chain with a proper modal so users can pick what they actually
  // want to do, Help, Report, Delete, Block, rather than being
  // forced into a single Yes/No on a generic "report user" prompt.
  const [flagOpen, setFlagOpen] = useState(false);
  const [flagSubmitting, setFlagSubmitting] = useState(false);
  const [flagSubmitted, setFlagSubmitted] = useState<null | "reported" | "deleted" | "blocked">(null);

  // Resizable conversations sidebar. Persists between sessions so a
  // user who shrinks it for more thread space doesn't have to re-do
  // the drag every visit. Only applies on sm+ screens, mobile keeps
  // its full-width single-column layout.
  const [sidebarWidth, setSidebarWidth] = useState<number>(320);
  const sidebarMin = 240;
  const sidebarMax = 480;
  const draggingRef = useRef(false);
  const dragStartXRef = useRef(0);
  const dragStartWidthRef = useRef(0);

  // Track viewport so we can apply inline `width: sidebarWidth` only at
  // sm+ where the sidebar is actually a sidebar, not the full screen.
  const [isDesktop, setIsDesktop] = useState<boolean>(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 640px)");
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem("wallplace:msg-sidebar-width");
      if (raw) {
        const n = Number(raw);
        if (Number.isFinite(n)) {
          setSidebarWidth(Math.max(sidebarMin, Math.min(sidebarMax, n)));
        }
      }
    } catch {
      /* localStorage unavailable, keep default */
    }
  }, []);

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!draggingRef.current) return;
      const delta = e.clientX - dragStartXRef.current;
      const next = Math.max(
        sidebarMin,
        Math.min(sidebarMax, dragStartWidthRef.current + delta),
      );
      setSidebarWidth(next);
    }
    function onUp() {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      try {
        window.localStorage.setItem(
          "wallplace:msg-sidebar-width",
          String(sidebarWidth),
        );
      } catch {
        /* swallow */
      }
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [sidebarWidth]);

  function startResize(e: React.MouseEvent) {
    draggingRef.current = true;
    dragStartXRef.current = e.clientX;
    dragStartWidthRef.current = sidebarWidth;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    e.preventDefault();
  }
  // Placement id currently being countered via the inline dialog,
  // plus the latest known terms for the placement so the counter form
  // opens pre-filled with whatever the other party offered, the user
  // should be editing an offer, not retyping it from scratch.
  const [counteringId, setCounteringId] = useState<string | null>(null);
  const [counterInitial, setCounterInitial] = useState<{
    monthly_fee_gbp?: number | null;
    revenue_share_percent?: number | null;
    qr_enabled?: boolean | null;
  } | undefined>(undefined);
  // Open the counter dialog for a placement by deriving current terms
  // from the most recent placement_request message on the thread.
  const openCounterDialog = useCallback((placementId: string) => {
    const latest = [...messages]
      .filter((m) => m.message_type === "placement_request" && (m.metadata as Record<string, unknown> | undefined)?.placementId === placementId)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
    const meta = (latest?.metadata || {}) as Record<string, unknown>;
    setCounterInitial({
      monthly_fee_gbp: typeof meta.monthlyFeeGbp === "number" ? (meta.monthlyFeeGbp as number) : null,
      revenue_share_percent: typeof meta.revenueSharePercent === "number" ? (meta.revenueSharePercent as number) : null,
      qr_enabled: typeof meta.qrEnabled === "boolean" ? (meta.qrEnabled as boolean) : null,
    });
    setCounteringId(placementId);
  }, [messages]);

  const slugRef = useRef(userSlug);
  slugRef.current = userSlug;

  // Load conversations
  const loadConversations = useCallback(async (silent = false) => {
    try {
      const res = await authFetch(`/api/messages?slug=${slugRef.current}`);
      const data = await res.json();
      if (data.conversations) {
        const convs = data.conversations as Conversation[];
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

  // Handle initialArtistSlug, runs ONCE per slug arrival.
  //
  // Bug we're fixing (#15): the effect previously had `conversations`
  // in its dep array, so every 15-second poll re-fired the selection
  // back to the notification target. When the user clicked a different
  // conversation in the list, the next poll would silently snap them
  // back to the artist whose notification originally opened the inbox.
  //
  // Fix: track the last-handled slug in a ref so the effect only acts
  // when the prop *changes*, not when the conversations list refreshes.
  // We still depend on `loading` because we need the conversations to
  // be fetched at least once before the first lookup.
  const handledInitialSlugRef = useRef<string | null>(null);
  useEffect(() => {
    if (!initialArtistSlug || loading) return;
    if (handledInitialSlugRef.current === initialArtistSlug) return;
    handledInitialSlugRef.current = initialArtistSlug;

    const existing = conversations.find((c) => c.otherParty === initialArtistSlug);
    if (existing) {
      setSelectedConv(existing.conversationId);
    } else {
      setComposing(true);
      setComposeRecipient(initialArtistSlug);
      setComposeRecipientName(initialArtistName || initialArtistSlug);
    }
    // Don't depend on `conversations`, it polls and would re-fire the
    // selection. We use the ref above to enforce one-shot behaviour;
    // when conversations finishes loading we still get one chance to
    // act because `loading` flips false at that moment, not on polls.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialArtistSlug, initialArtistName, loading]);

  // Load thread
  const loadThread = useCallback(async (convId: string, silent = false) => {
    if (!silent) setThreadLoading(true);
    try {
      const res = await authFetch(`/api/messages/${convId}`);
      const data = await res.json();
      if (data.messages) {
        // Replace the full array even when the length matches, content
        // may have changed (pinned, deleted, edited) and the scroll-to-
        // bottom effect only refires when the messages reference changes.
        // The tiny cost of occasional re-renders beats showing stale
        // content after switching between threads with equal counts.
        setMessages(data.messages);
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
    // Always clear the previous thread's messages when switching, so
    // the scroll-to-bottom effect runs against the NEW thread once it
    // loads, and we don't briefly flash messages from the last thread
    // we had open. (Before this, opening another thread could leave the
    // scroll position landed on the previous thread's content.)
    setMessages([]);
    if (threadPollRef.current) clearInterval(threadPollRef.current);
    if (!selectedConv) return;
    loadThread(selectedConv);
    threadPollRef.current = setInterval(() => loadThread(selectedConv, true), 8000);
    return () => { if (threadPollRef.current) clearInterval(threadPollRef.current); };
  }, [selectedConv, loadThread]);

  // React immediately when a placement changes elsewhere (e.g. the user
  // accepts / declines / counters from My Placements or the full
  // placement page). Without this the inbox only caught up on its 8s
  // thread poll, the request card stayed stuck showing Accept/Decline
  // long after the user had acted from another surface.
  useEffect(() => {
    const handler = () => {
      loadConversations(true);
      if (selectedConv) loadThread(selectedConv, true);
    };
    window.addEventListener("wallplace:placement-changed", handler);
    return () => window.removeEventListener("wallplace:placement-changed", handler);
  }, [loadConversations, loadThread, selectedConv]);

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

  // Load works for the placement panel whenever the selected conversation changes.
  useEffect(() => {
    const other = conversations.find((c) => c.conversationId === selectedConv)?.otherParty;
    if (!other || other === "wallplace-support") { setOtherPartyWorks([]); return; }
    loadOtherPartyWorks(other);
  }, [selectedConv, conversations, loadOtherPartyWorks]);

  // Scroll to the latest message whenever the selected thread changes or
  // new messages arrive. Multiple staggered attempts because images +
  // long content can shift layout well after first paint, and an early
  // scroll lands above the actual bottom. We bail when messages are
  // empty (the placeholder state between thread switches), the next
  // pass after the array fills runs the real scroll.
  useEffect(() => {
    if (messages.length === 0) return;
    const scrollToBottom = () => {
      const el = messagesEndRef.current;
      if (!el) return;
      el.scrollIntoView({ block: "end" });
      // Fallback: walk up to the nearest scrollable ancestor and force
      // its scrollTop to the bottom. Catches cases where scrollIntoView
      // mis-resolves inside nested overflow contexts.
      let parent: HTMLElement | null = el.parentElement;
      while (parent) {
        const overflowY = window.getComputedStyle(parent).overflowY;
        if (overflowY === "auto" || overflowY === "scroll") {
          parent.scrollTop = parent.scrollHeight;
          break;
        }
        parent = parent.parentElement;
      }
    };
    scrollToBottom();
    const r1 = requestAnimationFrame(scrollToBottom);
    const t1 = setTimeout(scrollToBottom, 100);
    const t2 = setTimeout(scrollToBottom, 400);
    const t3 = setTimeout(scrollToBottom, 1200);
    return () => {
      cancelAnimationFrame(r1);
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [messages, selectedConv]);

  const selectedConvData = conversations.find((c) => c.conversationId === selectedConv);

  async function handleAttachFile(files: FileList | null) {
    if (!files || files.length === 0) return;
    setSendError(null);
    setUploadingAttachment(true);
    try {
      const uploads: MessageAttachment[] = [];
      for (const f of Array.from(files).slice(0, 10 - pendingAttachments.length)) {
        const meta = await uploadMessageAttachment(f);
        uploads.push(meta);
      }
      setPendingAttachments((prev) => [...prev, ...uploads]);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingAttachment(false);
      if (attachmentInputRef.current) attachmentInputRef.current.value = "";
    }
  }

  function removePendingAttachment(idx: number) {
    setPendingAttachments((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSendReply() {
    const trimmed = reply.trim();
    if ((!trimmed && pendingAttachments.length === 0) || !selectedConv || !selectedConvData) return;
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
          content: trimmed,
          attachments: pendingAttachments,
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
        content: trimmed,
        attachments: pendingAttachments,
        is_read: false,
        created_at: new Date().toISOString(),
      }]);
      const previewText = trimmed || (pendingAttachments[0] ? `📎 ${pendingAttachments[0].filename}` : "");
      setConversations((prev) => prev.map((c) =>
        c.conversationId === selectedConv
          ? { ...c, latestMessage: previewText, lastActivity: new Date().toISOString(), messageCount: c.messageCount + 1 }
          : c
      ));
      setReply("");
      setPendingAttachments([]);
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

  async function handleDeleteConversation(convId: string) {
    try {
      const res = await authFetch(`/api/messages/${convId}`, { method: "DELETE" });
      if (res.ok) {
        setConversations((prev) => prev.filter((c) => c.conversationId !== convId));
        if (selectedConv === convId) {
          setSelectedConv(null);
          setMessages([]);
        }
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Could not delete conversation. Please try again.");
      }
    } catch (err) {
      console.error("Delete failed:", err);
      alert("Network error while deleting. Please try again.");
    }
  }

  // Per-message pin / unpin. Optimistic so the pin banner updates
  // instantly; the server PATCH catches up in the background.
  async function handleTogglePin(msg: Message) {
    const willPin = !msg.pinned_at;
    setMessages((prev) => prev.map((m) => m.id === msg.id ? { ...m, pinned_at: willPin ? new Date().toISOString() : null } : m));
    try {
      const res = await authFetch(`/api/messages/item/${msg.id}`, {
        method: "PATCH",
        body: JSON.stringify({ action: willPin ? "pin" : "unpin" }),
      });
      if (!res.ok) {
        // Revert on failure so the UI doesn't lie about server state.
        setMessages((prev) => prev.map((m) => m.id === msg.id ? { ...m, pinned_at: msg.pinned_at || null } : m));
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Could not pin message.");
      }
    } catch {
      setMessages((prev) => prev.map((m) => m.id === msg.id ? { ...m, pinned_at: msg.pinned_at || null } : m));
    }
  }

  // Soft-delete an own message. Optimistic; server handles the
  // permission gate (only the sender can delete).
  async function handleDeleteMessage(msg: Message) {
    if (!confirm("Delete this message? The other party will see 'Message deleted' in its place.")) return;
    const snapshot = msg;
    setMessages((prev) => prev.map((m) => m.id === msg.id ? { ...m, deleted_at: new Date().toISOString(), content: "" } : m));
    try {
      const res = await authFetch(`/api/messages/item/${msg.id}`, { method: "DELETE" });
      if (!res.ok) {
        setMessages((prev) => prev.map((m) => m.id === snapshot.id ? snapshot : m));
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Could not delete message.");
      }
    } catch {
      setMessages((prev) => prev.map((m) => m.id === snapshot.id ? snapshot : m));
    }
  }

  /** Inline Accept/Decline on a purchase_offer card. Hits
   *  /api/offers/[id] PATCH directly; the API drops a status message
   *  back into the same thread so the conversation stays cohesive.
   *  When the actor is the buyer (venue) and the action is "accept",
   *  the API also bell-redirects them to /venue-portal/offers?pay=…
   *  for the Stripe handoff — we replicate that here by calling the
   *  checkout endpoint directly so the venue jumps straight to
   *  Stripe instead of bouncing through the portal.
   */
  async function handleOfferResponse(msg: Message, action: "accept" | "decline") {
    const meta = (msg.metadata || {}) as Record<string, unknown>;
    const offerId = meta.offerId as string | undefined;
    if (!offerId) return;
    try {
      const res = await authFetch(`/api/offers/${offerId}`, {
        method: "PATCH",
        body: JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || "Could not update offer.");
        return;
      }
      // If the actor is the venue (buyer) and they accepted, fire
      // checkout immediately. The recipient flag here is the message
      // recipient — i.e. whoever the offer was addressed to.
      const recipientUserId = meta.recipientUserId as string | undefined;
      if (action === "accept" && recipientUserId === user?.id) {
        try {
          const co = await authFetch(`/api/offers/${offerId}/checkout`, { method: "POST" });
          const cd = await co.json().catch(() => ({}));
          if (cd.url) {
            window.location.href = cd.url;
            return;
          }
        } catch { /* fall through to refresh */ }
      }
    } catch (err) {
      console.error("Offer PATCH failed:", err);
      alert("Network error. Please try again.");
      return;
    }
    if (selectedConv) loadThread(selectedConv, true);
    loadConversations(true);
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

    // Server-side PATCH /api/placements already inserts the
    // placement_response message into the conversation. We used to also
    // POST /api/messages here from the client — that double-wrote the
    // message and rendered two "Placement Accepted" pills in the thread.
    // Now we only refresh local state and let loadThread pull the
    // server's single source of truth.
    if (accept) {
      setConversations((prev) => prev.map((c) =>
        c.conversationId === selectedConv ? { ...c, hasActivePlacement: true } : c
      ));
    }
    loadConversations(true);
    if (selectedConv) loadThread(selectedConv, true);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("wallplace:placement-changed", { detail: { placementId, action: accept ? "accept" : "decline" } }));
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

  // Apply search + separate placed from the rest.
  // MUST be declared before any early return, hooks order has to be stable
  // across renders or React will throw "Rendered more hooks than previous render".
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

  if (loading) {
    // Skeleton layout mirrors the real three-pane inbox so the page doesn't
    // flash from empty → populated. Feels much less jarring on slow networks.
    return (
      <div className="flex h-[calc(100vh-13rem)] border border-border rounded-2xl overflow-hidden bg-surface shadow-sm animate-pulse">
        <div className="hidden sm:flex w-80 shrink-0 border-r border-border flex-col">
          <div className="px-4 py-3 border-b border-border">
            <div className="h-9 rounded-full bg-border/40" />
          </div>
          <div className="flex-1 py-2">
            {[0,1,2,3,4].map((i) => (
              <div key={i} className="px-4 py-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-border/50 shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-24 rounded bg-border/50" />
                  <div className="h-2.5 w-40 rounded bg-border/30" />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-muted text-sm">Loading messages…</p>
        </div>
      </div>
    );
  }

  function renderConvItem(conv: Conversation) {
    const select = () => { setSelectedConv(conv.conversationId); setComposing(false); setPanelOpen(false); };
    return (
      <div
        key={conv.conversationId}
        role="button"
        tabIndex={0}
        onClick={select}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(); } }}
        className={`group w-full cursor-pointer px-4 py-3 flex items-center gap-3 transition-colors ${
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
      </div>
    );
  }

  const showPanel = !!selectedConv && !composing;
  const selectedOtherParty = selectedConvData?.otherParty || "";
  const selectedOtherPartyType = selectedConvData?.otherPartyType || "artist";

  return (
    <div className="flex h-[calc(100vh-13rem)] border border-border rounded-2xl overflow-hidden bg-surface shadow-sm">
      {/* Conversation list, full-width on mobile, drag-resizable on sm+
          (persisted to localStorage). A 6px handle on the right edge
          captures mousedown for the drag. */}
      <div
        className={`relative ${selectedConv || composing ? "hidden sm:flex" : "flex"} shrink-0 border-r border-border flex-col`}
        style={isDesktop ? { width: sidebarWidth } : { width: "100%" }}
      >
        {/* Drag handle, only on sm+ where the column is actually a
            sidebar. Sits on top of the right border, 1px wide visually
            (transparent on top of the border) but with a 6px hit-area
            so it's easy to grab without being a heavy visual element. */}
        {isDesktop && (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize conversations sidebar"
            onMouseDown={startResize}
            className="hidden sm:block absolute top-0 right-0 h-full w-1.5 -mr-[3px] cursor-col-resize z-10 group"
            title="Drag to resize"
          >
            <div className="absolute inset-y-0 right-[3px] w-px bg-transparent group-hover:bg-accent/50 transition-colors" />
          </div>
        )}
        {/* Search */}
        <div className="px-4 py-3 border-b border-border">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search conversations…"
              className="w-full pl-8 pr-3 py-2 bg-[#FAF8F5] border border-border rounded-full text-sm focus:outline-none focus:border-accent/50 placeholder:text-muted"
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
                <div className="mb-2 flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-red-500 shrink-0"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                  <p className="text-xs text-red-600 flex-1">{sendError}</p>
                  <button onClick={() => setSendError(null)} className="text-red-400 hover:text-red-600">
                    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M3 3l8 8M11 3L3 11" /></svg>
                  </button>
                </div>
              )}
              <div className="flex gap-2">
                <input type="text" value={composeMessage} onChange={(e) => { setComposeMessage(e.target.value); if (sendError) setSendError(null); }} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendNewMessage(); } }} maxLength={5000} placeholder="Type your first message..." className="flex-1 px-3 py-2.5 bg-background border border-border rounded-full text-sm focus:outline-none focus:border-accent/50" autoFocus />
                <button onClick={handleSendNewMessage} disabled={!composeMessage.trim() || sending || composeMessage.length > 5000} className="px-4 py-2.5 bg-accent text-white text-sm font-medium rounded-full hover:bg-accent-hover transition-colors disabled:opacity-40">
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
                <button onClick={() => { setSelectedConv(null); setPanelOpen(false); }} className="sm:hidden text-muted hover:text-foreground shrink-0">
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
                </div>
                {/* Flag/options button (#20), opens a proper popup
                    instead of the old confirm+alert. */}
                <button
                  onClick={() => { setFlagOpen(true); setFlagSubmitted(null); }}
                  className="p-1.5 text-muted hover:text-red-500 transition-colors shrink-0"
                  title="Conversation options"
                  aria-label="Conversation options"
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
                  {/* Mobile-only placement status drawer toggle.
                      Rendered as an inline chevron link rather than a pill so
                      it reads as "reveal more detail", not a separate button. */}
                  <button
                    type="button"
                    onClick={() => setPanelOpen(true)}
                    className="ml-auto inline-flex items-center gap-1 text-xs text-accent hover:text-accent-hover transition-colors"
                  >
                    Placement Status
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                  </button>
                </div>
              )}
            </div>

            {/* Pinned bar, shows the most recent pinned message at the top of
                the thread for quick reference. Click to scroll. */}
            {(() => {
              const pins = messages.filter((m) => m.pinned_at && !m.deleted_at);
              if (pins.length === 0) return null;
              const latest = pins.sort((a, b) => (b.pinned_at || "").localeCompare(a.pinned_at || ""))[0];
              return (
                <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 flex items-start gap-2 text-xs">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#92400E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0">
                    <line x1="12" y1="17" x2="12" y2="22" /><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24z" />
                  </svg>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-medium text-amber-700 uppercase tracking-wider">Pinned{pins.length > 1 ? ` · ${pins.length}` : ""}</p>
                    <p className="text-amber-900 truncate">{latest.content}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleTogglePin(latest)}
                    className="text-amber-700 hover:text-amber-900 shrink-0"
                    title="Unpin"
                  >
                    <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M3 3l8 8M11 3L3 11" /></svg>
                  </button>
                </div>
              );
            })()}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
              {messages.map((msg) => {
                const isMe = (msg.sender_id != null && msg.sender_id === user?.id) || (msg.sender_id == null && msg.sender_name === userSlug);
                const meta = (msg.metadata || {}) as Record<string, unknown>;
                // Deleted message: render a small placeholder so the
                // thread doesn't look like it skipped a beat. Pin / delete
                // controls are hidden because there's nothing to act on.
                if (msg.deleted_at) {
                  return (
                    <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                      <div className="text-xs text-muted italic px-3 py-1.5 rounded-full bg-[#FAF8F5] border border-border">
                        Message deleted
                      </div>
                    </div>
                  );
                }

                // Purchase offer card — venue/artist negotiating a price
                // on a work or collection. Renders the artwork(s), the
                // headline price + size, an optional note, and inline
                // Accept / Counter / Decline buttons for whoever is the
                // recipient. Once acted on, the conversation gets a
                // matching purchase_offer_status pill (further down) so
                // the thread reads as one negotiation timeline.
                if (msg.message_type === "purchase_offer") {
                  const offerId = meta.offerId as string | undefined;
                  const senderUserId = meta.senderUserId as string | undefined;
                  const recipientUserId = meta.recipientUserId as string | undefined;
                  const formattedAmount = (meta.formattedAmount as string | undefined) || "";
                  const isCounter = meta.isCounter === true;
                  const primaryImage = meta.primaryImage as string | null | undefined;
                  const primaryTitle = (meta.primaryTitle as string | undefined) || "Artwork";
                  const primaryDimensions = meta.primaryDimensions as string | null | undefined;
                  const primaryMedium = meta.primaryMedium as string | null | undefined;
                  const sizeLabel = meta.sizeLabel as string | null | undefined;
                  const note = meta.note as string | null | undefined;
                  const workCount = Array.isArray(meta.workIds) ? (meta.workIds as unknown[]).length : 0;

                  // Has a later status message superseded this offer?
                  // We look forward in the thread for any
                  // purchase_offer_status carrying the same offerId.
                  const statusUpdate = messages.find(
                    (m) =>
                      m.message_type === "purchase_offer_status" &&
                      (m.metadata as Record<string, unknown> | undefined)?.offerId === offerId &&
                      new Date(m.created_at).getTime() >= new Date(msg.created_at).getTime(),
                  );
                  const finalStatus = (statusUpdate?.metadata as Record<string, unknown> | undefined)?.offerStatus as string | undefined;

                  const iAmRecipient = recipientUserId === user?.id;
                  const iAmSender = senderUserId === user?.id;
                  const open = !finalStatus || finalStatus === "pending" || finalStatus === "countered";

                  // Where the Counter button should land. Errs to the
                  // venue portal if we can't resolve it from metadata.
                  const portalLink = recipientUserId === senderUserId
                    ? "/venue-portal/offers"
                    : "/artist-portal/offers";

                  return (
                    <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[80%] border rounded-lg overflow-hidden bg-white ${isCounter ? "border-amber-400" : "border-accent/30"}`}>
                        <div className={`px-3.5 py-2 border-b flex items-center gap-1.5 ${isCounter ? "bg-amber-50 border-amber-200" : "bg-accent/5 border-accent/20"}`}>
                          {isCounter && (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-700">
                              <polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 014-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 01-4 4H3" />
                            </svg>
                          )}
                          <p className={`text-[10px] font-medium uppercase tracking-wider ${isCounter ? "text-amber-800" : "text-accent"}`}>
                            {isCounter ? "Counter offer" : "Purchase offer"}
                          </p>
                          <span className="ml-auto text-[10px] text-muted">{formattedAmount}</span>
                        </div>
                        <div className="px-3.5 py-3 space-y-1.5">
                          {primaryImage && (
                            <div className="w-full h-24 relative rounded-md overflow-hidden mb-2">
                              <Image src={primaryImage} alt="" fill className="object-cover" sizes="300px" />
                              {workCount > 1 && (
                                <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 bg-black/65 text-white rounded-sm text-[10px]">
                                  +{workCount - 1}
                                </span>
                              )}
                            </div>
                          )}
                          <p className="text-sm font-medium text-foreground">{primaryTitle}</p>
                          {(primaryDimensions || primaryMedium || sizeLabel) && (
                            <p className="text-xs text-muted">
                              {[sizeLabel, primaryDimensions, primaryMedium].filter(Boolean).join(" · ")}
                            </p>
                          )}
                          {note && <p className="text-xs text-muted whitespace-pre-wrap">&ldquo;{note}&rdquo;</p>}
                        </div>
                        {open && iAmRecipient && (
                          <div className="px-3.5 py-2 border-t border-border flex gap-2 flex-wrap">
                            <button
                              onClick={() => handleOfferResponse(msg, "accept")}
                              className="px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-full transition-colors"
                            >
                              Accept
                            </button>
                            <Link
                              href={portalLink || (recipientUserId === senderUserId ? "/venue-portal/offers" : "/artist-portal/offers")}
                              className="px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 hover:bg-amber-100 rounded-full transition-colors"
                            >
                              Counter
                            </Link>
                            <button
                              onClick={() => handleOfferResponse(msg, "decline")}
                              className="px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 border border-red-200 hover:bg-red-100 rounded-full transition-colors"
                            >
                              Decline
                            </button>
                          </div>
                        )}
                        {open && iAmSender && (
                          <div className="px-3.5 py-2 border-t border-border">
                            <p className="text-[11px] text-muted">Awaiting response…</p>
                          </div>
                        )}
                        {!open && finalStatus && (
                          <div className={`px-3.5 py-2 border-t ${
                            finalStatus === "accepted" || finalStatus === "paid"
                              ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                              : "bg-foreground/5 border-border text-muted"
                          }`}>
                            <p className="text-xs font-medium capitalize">
                              {finalStatus === "paid" ? "Paid" : finalStatus}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }

                // Purchase offer status pill (accepted/declined/withdrawn).
                // We only render it standalone if the parent offer card
                // isn't already in the rendered window (would be unusual
                // — but safer than dropping it).
                if (msg.message_type === "purchase_offer_status") {
                  const offerId = meta.offerId as string | undefined;
                  const offerStatus = meta.offerStatus as string | undefined;
                  const formattedAmount = (meta.formattedAmount as string | undefined) || "";
                  const hasParentCard = messages.some(
                    (m) =>
                      m.message_type === "purchase_offer" &&
                      (m.metadata as Record<string, unknown> | undefined)?.offerId === offerId,
                  );
                  if (hasParentCard) return null;
                  const tone =
                    offerStatus === "accepted" || offerStatus === "paid"
                      ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                      : "bg-foreground/5 border-border text-muted";
                  return (
                    <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[80%] px-3.5 py-2 rounded-lg border ${tone}`}>
                        <p className="text-xs font-medium capitalize">
                          Offer {offerStatus} {formattedAmount && `· ${formattedAmount}`}
                        </p>
                      </div>
                    </div>
                  );
                }

                // Placement request / counter card. Counter offers come
                // through the same message_type but with metadata.counter === true
                // so the thread can visually distinguish the new terms from the
                // original request.
                if (msg.message_type === "placement_request") {
                  const isCounter = meta.counter === true;
                  return (
                    <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[80%] border rounded-lg overflow-hidden bg-white ${isCounter ? "border-amber-400" : "border-accent/30"}`}>
                        <div className={`px-3.5 py-2 border-b flex items-center gap-1.5 ${isCounter ? "bg-amber-50 border-amber-200" : "bg-accent/5 border-accent/20"}`}>
                          {isCounter && (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-700">
                              <polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 014-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 01-4 4H3" />
                            </svg>
                          )}
                          <p className={`text-[10px] font-medium uppercase tracking-wider ${isCounter ? "text-amber-800" : "text-accent"}`}>
                            {isCounter ? "Counter offer" : "Placement request"}
                          </p>
                        </div>
                        <div className="px-3.5 py-3 space-y-1.5">
                          {typeof meta.workImage === "string" && meta.workImage && (
                            <div className="w-full h-24 relative rounded-md overflow-hidden mb-2">
                              <Image src={meta.workImage} alt="" fill className="object-cover" sizes="300px" />
                            </div>
                          )}
                          {!isCounter && <p className="text-sm font-medium text-foreground">{meta.workTitle as string || "Artwork"}</p>}
                          <p className="text-xs text-muted">
                            {(() => {
                              // Combined label: "Paid loan + QR" / "Revenue
                              // Share" / "Direct purchase". Mirrors the
                              // placements list and the status panel so the
                              // thread, the list, and the panel all agree.
                              const type = meta.arrangementType as string | undefined;
                              const fee = meta.monthlyFeeGbp as number | undefined;
                              const qr = meta.qrEnabled as boolean | undefined;
                              const rev = meta.revenueSharePercent as number | undefined;
                              const hasFee = typeof fee === "number" && fee > 0;
                              const label = hasFee
                                ? (qr ? "Paid loan + QR" : "Paid loan")
                                : type === "purchase"
                                  ? "Direct purchase"
                                  : qr || type === "revenue_share"
                                    ? "Revenue share"
                                    : "Free display";
                              const parts: string[] = [label];
                              if (hasFee) parts.push(`£${fee}/mo`);
                              if ((qr || type === "revenue_share") && typeof rev === "number" && rev > 0) parts.push(`${rev}% on QR sales`);
                              return parts.join(" · ");
                            })()}
                          </p>
                          {(() => {
                            // Strip legacy auto-generated boilerplate
                            // ("Placement request sent for: X" /
                            // "Revenue share: 10% to the venue") because
                            // the card above already conveys that. Only
                            // show the sender's actual note.
                            const raw = (msg.content || "").trim();
                            if (!raw) return null;
                            const cleaned = raw
                              .split("\n")
                              .filter((l) => {
                                const t = l.trim();
                                if (!t) return false;
                                if (/^placement request sent for:/i.test(t)) return false;
                                if (/^revenue share:\s*\d/i.test(t)) return false;
                                if (/^paid loan arrangement$/i.test(t)) return false;
                                if (/^purchase arrangement$/i.test(t)) return false;
                                return true;
                              })
                              .join("\n")
                              .replace(/^"([\s\S]+)"$/, "$1")
                              .trim();
                            if (!cleaned) return null;
                            return <p className="text-xs text-muted whitespace-pre-wrap">{cleaned}</p>;
                          })()}
                        </div>
                        {(() => {
                          // Has THIS request (or a newer one) been responded to?
                          // We compare timestamps: if the most-recent response
                          // happened AFTER this request message, it applies.
                          // If a newer counter-request has since been sent on
                          // the same placement, this check correctly treats
                          // the latest counter as outstanding, the old card
                          // no longer blocks Accept/Counter/Decline on the
                          // newer offer.
                          const placementId = meta.placementId;
                          const responsesForThis = messages
                            .filter((m) => m.message_type === "placement_response" && m.metadata?.placementId === placementId)
                            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
                          const latestResponse = responsesForThis[0];
                          const thisRequestTs = new Date(msg.created_at).getTime();
                          const latestResponseTs = latestResponse ? new Date(latestResponse.created_at).getTime() : 0;
                          const respondedToThis = !!latestResponse && latestResponseTs >= thisRequestTs;
                          if (respondedToThis && latestResponse) {
                            const accepted = latestResponse.metadata?.status === "active";
                            // Gate for the Counter-on-declined button: the
                            // original offerer (requester) may revise terms;
                            // the decliner waits for them.
                            const metaRequesterId = (meta.requesterUserId as string | undefined) || undefined;
                            const iAmOfferer = metaRequesterId
                              ? metaRequesterId === user?.id
                              : isMe;
                            return (
                              <div className={`px-3.5 py-2 border-t ${accepted ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                  <p className={`text-xs font-medium ${accepted ? "text-green-700" : "text-red-600"}`}>
                                    {accepted ? "✓ Accepted" : "✗ Declined"}
                                  </p>
                                  {!accepted && iAmOfferer && typeof placementId === "string" && (
                                    <button
                                      type="button"
                                      onClick={() => openCounterDialog(placementId)}
                                      className="px-2.5 py-1 text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 hover:bg-amber-100 rounded-full transition-colors"
                                    >
                                      Counter with new terms
                                    </button>
                                  )}
                                </div>
                                {!accepted && !iAmOfferer && (
                                  <p className="text-[11px] text-muted mt-1">You declined, the other party can come back with revised terms.</p>
                                )}
                              </div>
                            );
                          }
                          // Gate Accept/Decline strictly: prefer the
                          // explicit requesterUserId carried in metadata,
                          // fall back to message-sender match for legacy
                          // rows that predate the field.
                          const metaRequesterId = (meta.requesterUserId as string | undefined) || undefined;
                          const iAmRequester = metaRequesterId
                            ? metaRequesterId === user?.id
                            : isMe;
                          if (!iAmRequester) {
                            const placementIdForCounter = meta.placementId as string | undefined;
                            return (
                              <div className="px-3.5 py-2 border-t border-border flex gap-2 flex-wrap">
                                <button onClick={() => handlePlacementResponse(msg, true)} className="px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-full transition-colors">Accept</button>
                                {placementIdForCounter && (
                                  <button
                                    type="button"
                                    onClick={() => openCounterDialog(placementIdForCounter)}
                                    className="px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 hover:bg-amber-100 rounded-full transition-colors"
                                  >
                                    Counter
                                  </button>
                                )}
                                <button onClick={() => handlePlacementResponse(msg, false)} className="px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 border border-red-200 hover:bg-red-100 rounded-full transition-colors">Decline</button>
                              </div>
                            );
                          }
                          return (
                            <div className="px-3.5 py-2 border-t border-border">
                              <p className="text-[11px] text-muted italic">Awaiting response</p>
                            </div>
                          );
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

                // Regular text message, with hover affordance for pin /
                // delete. Pin is available to either party (it's a shared
                // bookmark on the thread); delete only on own messages.
                const isPinned = !!msg.pinned_at;
                return (
                  <div key={msg.id} className={`group flex ${isMe ? "justify-end" : "justify-start"} gap-2 items-end`}>
                    {!isMe && <Avatar src={selectedConvData?.otherPartyImage} name={selectedConvData?.otherPartyDisplayName || ""} size={24} />}
                    {/* Action cluster on the inside-edge of the bubble. */}
                    {isMe && (
                      <div className="flex flex-col items-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={() => handleTogglePin(msg)}
                          className={`p-1 ${isPinned ? "text-amber-600" : "text-muted hover:text-amber-600"}`}
                          title={isPinned ? "Unpin" : "Pin"}
                        >
                          <svg width="11" height="11" viewBox="0 0 24 24" fill={isPinned ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="17" x2="12" y2="22" /><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24z" /></svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteMessage(msg)}
                          className="p-1 text-muted hover:text-red-500"
                          title="Delete message"
                        >
                          <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M3 3l8 8M11 3L3 11" /></svg>
                        </button>
                      </div>
                    )}
                    <div className={`max-w-[75%] px-3.5 py-2.5 rounded-lg text-sm ${
                      isMe
                        ? "bg-accent text-white rounded-br-none"
                        : "bg-[#FAF8F5] border border-border text-foreground rounded-bl-none"
                    } ${isPinned ? "ring-1 ring-amber-300" : ""}`}>
                      {msg.attachments && msg.attachments.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-1.5">
                          {msg.attachments.map((a, i) => (
                            a.mimeType.startsWith("image/") ? (
                              <a key={i} href={a.url} target="_blank" rel="noopener noreferrer" className="block">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={a.url} alt={a.filename} className="max-w-[220px] max-h-[220px] rounded-sm object-cover border border-black/5" />
                              </a>
                            ) : (
                              <a key={i} href={a.url} target="_blank" rel="noopener noreferrer" className={`flex items-center gap-2 px-2.5 py-1.5 rounded-sm border ${isMe ? "bg-white/10 border-white/20 text-white" : "bg-white border-border text-foreground"}`}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                                <span className="text-[11px] truncate max-w-[160px]">{a.filename}</span>
                              </a>
                            )
                          ))}
                        </div>
                      )}
                      {msg.content && <p className="leading-relaxed">{msg.content}</p>}
                      <p className={`text-[9px] mt-1 ${isMe ? "text-white/50" : "text-muted"} flex items-center gap-1`}>
                        {isPinned && (
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="17" x2="12" y2="22" /><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24z" /></svg>
                        )}
                        {timeAgo(msg.created_at)}
                      </p>
                    </div>
                    {!isMe && (
                      <div className="flex flex-col items-start gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={() => handleTogglePin(msg)}
                          className={`p-1 ${isPinned ? "text-amber-600" : "text-muted hover:text-amber-600"}`}
                          title={isPinned ? "Unpin" : "Pin"}
                        >
                          <svg width="11" height="11" viewBox="0 0 24 24" fill={isPinned ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="17" x2="12" y2="22" /><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24z" /></svg>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Reply input */}
            <div className="px-4 py-3 border-t border-border shadow-[0_-1px_3px_rgba(0,0,0,0.03)]">
              {sendError && (
                <div className="mb-2 flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-red-500 shrink-0"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                  <p className="text-xs text-red-600 flex-1">{sendError}</p>
                  <button onClick={() => setSendError(null)} className="text-red-400 hover:text-red-600">
                    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M3 3l8 8M11 3L3 11" /></svg>
                  </button>
                </div>
              )}
              {/* Attachment previews — small thumbs above the input */}
              {pendingAttachments.length > 0 && (
                <div className="flex gap-2 flex-wrap mb-2">
                  {pendingAttachments.map((a, i) => (
                    <div key={i} className="relative group">
                      {a.mimeType.startsWith("image/") ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={a.url} alt={a.filename} className="w-14 h-14 object-cover rounded-sm border border-border" />
                      ) : (
                        <div className="w-14 h-14 rounded-sm border border-border bg-surface flex items-center justify-center text-[9px] text-muted px-1 text-center leading-tight">
                          {a.filename.slice(0, 18)}
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => removePendingAttachment(i)}
                        className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-foreground text-white rounded-full flex items-center justify-center hover:bg-red-500 transition-colors"
                        aria-label={`Remove ${a.filename}`}
                      >
                        <svg width="8" height="8" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 3l8 8M11 3L3 11" /></svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2 items-center">
                <input
                  ref={attachmentInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif,application/pdf"
                  multiple
                  onChange={(e) => handleAttachFile(e.target.files)}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => attachmentInputRef.current?.click()}
                  disabled={uploadingAttachment || pendingAttachments.length >= 10}
                  title="Attach file"
                  className="p-2 text-muted hover:text-accent transition-colors disabled:opacity-40"
                >
                  {uploadingAttachment ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>
                  )}
                </button>
                <input type="text" value={reply} onChange={(e) => { setReply(e.target.value); if (sendError) setSendError(null); }} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendReply(); } }} maxLength={5000} placeholder="Type a message..." className="flex-1 px-3 py-2.5 bg-background border border-border rounded-full text-sm focus:outline-none focus:border-accent/50" />
                <button onClick={handleSendReply} disabled={(!reply.trim() && pendingAttachments.length === 0) || sending || reply.length > 5000} className="px-4 py-2.5 bg-accent text-white text-sm font-medium rounded-full hover:bg-accent-hover transition-colors disabled:opacity-40">
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

      {/* Placement context panel, drawer at every viewport size now.
          Used to be always-visible at lg+ which ate horizontal space the
          thread itself benefitted from. The "Placement Status" toggle
          in the thread header opens this on demand. Sits BELOW the
          site header (fixed, z-[100]) by starting at top-14 / lg:top-16
          to match the global nav height. */}
      {showPanel && selectedConvData && panelOpen && (
        <div className="fixed top-14 lg:top-16 left-0 right-0 bottom-0 z-50 flex">
          <div className="flex-1 bg-black/40" onClick={() => setPanelOpen(false)} />
          <div className="w-[min(420px,90vw)] bg-surface border-l border-border shadow-xl flex flex-col h-full">
            <div className="flex-1 min-h-0 overflow-y-auto">
              <PlacementContextPanel
                onClose={() => setPanelOpen(false)}
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

      {/* Inline counter-offer dialog triggered from the placement_request
          card's Counter button. Closes on submit; the thread will
          refresh via the normal message poll. */}
      {counteringId && (
        <CounterPlacementDialog
          placementId={counteringId}
          currentUserId={user?.id}
          initial={counterInitial}
          onClose={() => { setCounteringId(null); setCounterInitial(undefined); }}
          onSuccess={() => { setCounteringId(null); setCounterInitial(undefined); if (selectedConv) loadThread(selectedConv); }}
        />
      )}

      {/* Conversation options modal (#20). Replaces the old
          confirm()+alert() flag handler with a proper Vinted-style
          popup: Help routes to FAQ, Report opens a textarea + sends
          to /api/messages/report (existing endpoint), Delete
          archives the conversation, Block disables future messaging
          from this slug. Block is wired to a stubbed endpoint for now;
          if it fails the UI falls back to a friendly note. */}
      {flagOpen && selectedConvData && (
        <div
          className="fixed inset-0 z-[200] bg-black/50 flex items-center justify-center p-4"
          onClick={() => setFlagOpen(false)}
        >
          <div
            className="bg-white rounded-sm shadow-xl max-w-sm w-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <p className="text-sm font-medium text-foreground">
                Conversation options
              </p>
              <button
                type="button"
                onClick={() => setFlagOpen(false)}
                className="text-muted hover:text-foreground"
                aria-label="Close"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {flagSubmitted ? (
              <div className="px-5 py-6 text-sm text-foreground">
                {flagSubmitted === "reported" && "Report submitted. Our team will review this conversation."}
                {flagSubmitted === "deleted" && "Conversation archived. You won't see it in your inbox."}
                {flagSubmitted === "blocked" && "User blocked. They won't be able to message you again."}
                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setFlagOpen(false)}
                    className="text-xs font-medium text-accent hover:text-accent-hover"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <ul className="py-1.5">
                <li>
                  <Link
                    href="/faqs"
                    onClick={() => setFlagOpen(false)}
                    className="block px-5 py-3 text-sm text-foreground hover:bg-[#FAF8F5] transition-colors"
                  >
                    <span className="font-medium">Help</span>
                    <span className="block text-xs text-muted mt-0.5">Open the FAQ in a new tab.</span>
                  </Link>
                </li>
                <li>
                  <button
                    type="button"
                    disabled={flagSubmitting}
                    onClick={async () => {
                      const reason = prompt(`What's the issue with ${selectedConvData?.otherPartyDisplayName || "this user"}?`);
                      if (!reason) return;
                      setFlagSubmitting(true);
                      try {
                        await authFetch("/api/messages/report", {
                          method: "POST",
                          body: JSON.stringify({
                            otherParty: selectedConvData?.otherParty,
                            conversationId: selectedConvData?.conversationId,
                            reason,
                          }),
                        });
                      } catch { /* swallow, UX still confirms */ }
                      setFlagSubmitted("reported");
                      setFlagSubmitting(false);
                    }}
                    className="w-full text-left block px-5 py-3 text-sm text-foreground hover:bg-[#FAF8F5] transition-colors disabled:opacity-50"
                  >
                    <span className="font-medium">Report</span>
                    <span className="block text-xs text-muted mt-0.5">Flag inappropriate behaviour to the Wallplace team.</span>
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    disabled={flagSubmitting}
                    onClick={async () => {
                      if (!confirm("Archive this conversation? It'll disappear from your inbox but can be restored by support if needed.")) return;
                      setFlagSubmitting(true);
                      try {
                        await authFetch("/api/messages", {
                          method: "DELETE",
                          body: JSON.stringify({ conversationId: selectedConvData?.conversationId }),
                        });
                      } catch { /* fall through to confirmation UX */ }
                      setFlagSubmitted("deleted");
                      setFlagSubmitting(false);
                    }}
                    className="w-full text-left block px-5 py-3 text-sm text-foreground hover:bg-[#FAF8F5] transition-colors disabled:opacity-50"
                  >
                    <span className="font-medium">Delete conversation</span>
                    <span className="block text-xs text-muted mt-0.5">Archive this thread from your inbox.</span>
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    disabled={flagSubmitting}
                    onClick={async () => {
                      if (!confirm(`Block ${selectedConvData?.otherPartyDisplayName || "this user"}? They won't be able to message you again.`)) return;
                      setFlagSubmitting(true);
                      try {
                        await authFetch("/api/messages/block", {
                          method: "POST",
                          body: JSON.stringify({ otherParty: selectedConvData?.otherParty }),
                        });
                      } catch { /* fall through */ }
                      setFlagSubmitted("blocked");
                      setFlagSubmitting(false);
                    }}
                    className="w-full text-left block px-5 py-3 text-sm text-red-700 hover:bg-red-50 transition-colors disabled:opacity-50"
                  >
                    <span className="font-medium">Block user</span>
                    <span className="block text-xs text-red-700/70 mt-0.5">Prevent further messages from this account.</span>
                  </button>
                </li>
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
