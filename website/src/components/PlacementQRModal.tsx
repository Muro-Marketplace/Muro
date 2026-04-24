"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { generateQRDataURL } from "@/lib/qr";

const QR_MIN = 100;
const QR_MAX = 600;

interface Props {
  open: boolean;
  onClose: () => void;
  /** The URL the QR code should resolve to — usually the public artwork page. */
  targetUrl: string;
  /** Placement id so the Labels page can pre-select this row for bulk printing. */
  placementId: string;
  portalBase: "/artist-portal" | "/venue-portal";
  artistName?: string;
  workTitle?: string;
}

/**
 * Lightweight inline QR preview for a single placement. Renders a
 * scannable code pointing at the public artwork page so visitors in the
 * venue can tap through without typing anything. The "Print full label"
 * shortcut deep-links into the venue labels page, which already has the
 * full sticker designer for bulk printing.
 */
export default function PlacementQRModal({
  open,
  onClose,
  targetUrl,
  placementId,
  portalBase,
  artistName,
  workTitle,
}: Props) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrSize, setQrSize] = useState(220);
  const dragStateRef = useRef<{ startX: number; startY: number; startSize: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    generateQRDataURL(targetUrl)
      .then((url) => { if (!cancelled) setQrDataUrl(url); })
      .catch(() => { if (!cancelled) setQrDataUrl(null); });
    return () => { cancelled = true; };
  }, [open, targetUrl]);

  function startDrag(e: React.PointerEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStateRef.current = { startX: e.clientX, startY: e.clientY, startSize: qrSize };
  }
  function onDrag(e: React.PointerEvent<HTMLButtonElement>) {
    if (!dragStateRef.current) return;
    // Use the larger of the two axes so a diagonal drag scales naturally.
    const dx = e.clientX - dragStateRef.current.startX;
    const dy = e.clientY - dragStateRef.current.startY;
    const delta = Math.max(dx, dy);
    const next = Math.min(QR_MAX, Math.max(QR_MIN, dragStateRef.current.startSize + delta));
    setQrSize(next);
  }
  function endDrag(e: React.PointerEvent<HTMLButtonElement>) {
    dragStateRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[120] bg-black/50 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-background rounded-sm max-w-sm w-full shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-accent">QR label</p>
            <p className="text-sm text-foreground mt-0.5 truncate">{workTitle || "Placement QR"}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-muted hover:text-foreground transition-colors"
            aria-label="Close"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
        <div className="p-6 flex flex-col items-center gap-4">
          {qrDataUrl ? (
            <>
              <div className="relative inline-block" style={{ width: qrSize, height: qrSize }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qrDataUrl}
                  alt="Placement QR code"
                  width={qrSize}
                  height={qrSize}
                  className="rounded-sm select-none"
                  draggable={false}
                />
                {/* Drag handle on the bottom-right corner — pinch-zoom-by-mouse
                    so users can size the code to match what they're printing. */}
                <button
                  type="button"
                  onPointerDown={startDrag}
                  onPointerMove={onDrag}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                  className="absolute bottom-0 right-0 translate-x-1/3 translate-y-1/3 w-6 h-6 rounded-full bg-foreground text-white border-2 border-white shadow-lg flex items-center justify-center cursor-nwse-resize hover:bg-accent transition-colors"
                  title="Drag to resize"
                  aria-label="Drag to resize QR code"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 3 21 3 21 9" />
                    <polyline points="9 21 3 21 3 15" />
                    <line x1="21" y1="3" x2="14" y2="10" />
                    <line x1="3" y1="21" x2="10" y2="14" />
                  </svg>
                </button>
              </div>
              <p className="text-[11px] text-muted">
                Size: <span className="text-foreground font-medium tabular-nums">{Math.round(qrSize)}px</span> — drag the corner to resize
              </p>
              <div className="text-center">
                {artistName && <p className="text-xs text-muted">{artistName}</p>}
                <p className="text-[11px] text-muted break-all">{targetUrl}</p>
              </div>
            </>
          ) : (
            <div className="w-[220px] h-[220px] bg-surface rounded-sm flex items-center justify-center text-xs text-muted">
              Generating…
            </div>
          )}
          <div className="w-full flex items-center gap-2 pt-1">
            <a
              href={qrDataUrl || "#"}
              download={`wallplace-qr-${placementId}.png`}
              className="flex-1 text-center px-4 py-2 text-xs font-medium text-accent bg-accent/5 border border-accent/30 hover:bg-accent/10 rounded-sm transition-colors"
            >
              Download PNG
            </a>
            {portalBase === "/venue-portal" && (
              <Link
                href={`/venue-portal/labels?placement=${encodeURIComponent(placementId)}`}
                className="flex-1 text-center px-4 py-2 text-xs font-medium text-foreground border border-border hover:bg-[#F5F3F0] rounded-sm transition-colors"
              >
                Print full label
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
