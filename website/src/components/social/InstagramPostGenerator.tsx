"use client";

// Generate an Instagram post (or story / reel idea) from an artwork.
//
// The image is rendered into a hidden <canvas> and exported as a PNG.
// Caption + hashtags are templated client-side — easy to swap in an
// LLM call later if we want richer copy.

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { shopUrlDisplay } from "@/lib/shop-url";

type Tab = "post" | "story" | "reel";

interface Props {
  workTitle: string;
  artistName: string;
  artistSlug: string;
  workImage: string;
  workMedium?: string | null;
  showingAtVenueName?: string | null; // optional: if currently placed
}

// Canvas dimensions per Instagram surface.
const SIZES: Record<Tab, { w: number; h: number; label: string }> = {
  post: { w: 1080, h: 1080, label: "Post · 1:1" },
  story: { w: 1080, h: 1920, label: "Story · 9:16" },
  reel: { w: 1080, h: 1920, label: "Reel cover · 9:16" },
};

/**
 * Which story the post tells.
 *
 * `venue` is the original: this piece is hanging somewhere, go and see it. It
 * needs an active placement, so it is unavailable to an artist who has just
 * been accepted.
 *
 * `shop` is the artist promoting their own shop to their own following. It
 * needs nothing but a work, so it is available from day one, and it is the mode
 * that matters for an artist who arrived with an audience and no checkout.
 */
export type PostMode = "venue" | "shop";

/** Venue mode is only real when there is a venue. */
function resolveMode(p: Props, mode: PostMode): PostMode {
  return mode === "venue" && p.showingAtVenueName ? "venue" : "shop";
}

export function buildCaption(p: Props, tab: Tab, mode: PostMode): string {
  const resolved = resolveMode(p, mode);
  // Every caption carries the link now. Before, only "story" did: the post
  // caption said "Discover more on Wallplace" and named no URL, so a follower
  // who wanted to buy had nowhere to go.
  const link = shopUrlDisplay(p.artistSlug);
  const venueLine =
    resolved === "venue" ? `Now showing at ${p.showingAtVenueName}.\n` : "";
  const tags = `#Wallplace #${slugifyTag(p.artistName)} #OriginalArt${p.workMedium ? ` #${slugifyTag(p.workMedium)}` : ""}`;

  if (tab === "story") {
    return `${venueLine}"${p.workTitle}" by ${p.artistName}\n\nTap through to buy → ${link}`;
  }

  if (tab === "reel") {
    const idea =
      resolved === "venue"
        ? `Reel idea: show ${p.workTitle} from three angles, hold on the QR label.`
        : `Reel idea: show ${p.workTitle} from three angles, then the finished piece on a wall.`;
    return `${idea}\n\nCaption:\n${venueLine}"${p.workTitle}" by ${p.artistName}. Original work, ready to buy at ${link}`;
  }

  // post (default)
  if (resolved === "venue") {
    return `${venueLine}"${p.workTitle}" by ${p.artistName}, captured in real space.\n\nOriginal art, real spaces.\nBuy it at ${link}\n\n${tags} #ArtInSpaces`;
  }
  return `"${p.workTitle}" by ${p.artistName}.\n\nOriginal work, available now in my shop.\n${link}\n\n${tags}`;
}

function slugifyTag(s: string): string {
  return s.replace(/[^A-Za-z0-9]/g, "");
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function renderCanvas(canvas: HTMLCanvasElement, p: Props, tab: Tab, mode: PostMode) {
  const { w, h } = SIZES[tab];
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // Background — warm off-black gradient that flatters most artwork.
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, "#1c1815");
  bg.addColorStop(1, "#0e0c0a");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  let img: HTMLImageElement | null = null;
  try {
    img = await loadImage(p.workImage);
  } catch {
    // Image won't load (CORS or 404). Render a placeholder rectangle.
  }

  // Frame mat — generous breathing room.
  const matInset = Math.round(w * 0.10);
  const frameY = Math.round(h * (tab === "post" ? 0.13 : 0.15));
  const frameH = Math.round((tab === "post" ? h * 0.62 : h * 0.55));
  const frameW = w - matInset * 2;

  // Soft shadow.
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = 60;
  ctx.shadowOffsetY = 18;
  ctx.fillStyle = "#fff";
  ctx.fillRect(matInset - 12, frameY - 12, frameW + 24, frameH + 24);
  ctx.restore();

  // White mat
  ctx.fillStyle = "#f7f3ee";
  ctx.fillRect(matInset, frameY, frameW, frameH);

  // Artwork — fit-cover inside the inner mat.
  const artInset = Math.round(frameW * 0.06);
  const artX = matInset + artInset;
  const artY = frameY + artInset;
  const artW = frameW - artInset * 2;
  const artH = frameH - artInset * 2;
  if (img) {
    const ratio = img.width / img.height;
    const targetRatio = artW / artH;
    let sx = 0, sy = 0, sw = img.width, sh = img.height;
    if (ratio > targetRatio) {
      // image wider — crop sides
      sw = img.height * targetRatio;
      sx = (img.width - sw) / 2;
    } else {
      sh = img.width / targetRatio;
      sy = (img.height - sh) / 2;
    }
    ctx.drawImage(img, sx, sy, sw, sh, artX, artY, artW, artH);
  } else {
    ctx.fillStyle = "#ddd";
    ctx.fillRect(artX, artY, artW, artH);
  }

  // Wallplace wordmark — small W in a circle, top right.
  ctx.save();
  ctx.fillStyle = "#0a0a0a";
  ctx.beginPath();
  ctx.arc(w - 70, 70, 30, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = "600 32px serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("W", w - 70, 71);
  ctx.restore();

  // Caption block.
  const captionY = frameY + frameH + Math.round(h * 0.04);
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";

  if (resolveMode(p, mode) === "venue") {
    ctx.font = "300 22px system-ui, -apple-system, Helvetica, sans-serif";
    ctx.globalAlpha = 0.7;
    ctx.fillText("NOW SHOWING AT", w / 2, captionY);
    ctx.globalAlpha = 1;
    ctx.font = "600 56px serif";
    ctx.fillText((p.showingAtVenueName || "").toUpperCase(), w / 2, captionY + 60);
    ctx.font = "300 24px system-ui, -apple-system, Helvetica, sans-serif";
    ctx.globalAlpha = 0.65;
    ctx.fillText(`A ${p.workMedium || "work"} by ${p.artistName}`, w / 2, captionY + 110);
    ctx.globalAlpha = 1;
  } else {
    ctx.font = "600 56px serif";
    ctx.fillText(p.workTitle, w / 2, captionY + 30);
    ctx.font = "300 24px system-ui, -apple-system, Helvetica, sans-serif";
    ctx.globalAlpha = 0.65;
    ctx.fillText(`A ${p.workMedium || "work"} by ${p.artistName}`, w / 2, captionY + 80);
    ctx.globalAlpha = 1;
  }

  // Footer. In shop mode this is the artist's own URL, so anyone who sees the
  // image knows where to buy without reading the caption.
  ctx.font = "300 20px system-ui";
  ctx.globalAlpha = 0.5;
  ctx.fillText(
    resolveMode(p, mode) === "venue" ? "wallplace.co.uk" : shopUrlDisplay(p.artistSlug),
    w / 2,
    h - 40,
  );
  ctx.globalAlpha = 1;
}

export default function InstagramPostGenerator(props: Props) {
  const [tab, setTab] = useState<Tab>("post");
  // Venue mode needs an active placement, so a newly accepted artist starts in
  // shop mode rather than staring at a tool that has nothing to say to them.
  const canUseVenueMode = Boolean(props.showingAtVenueName);
  const [mode, setMode] = useState<PostMode>(canUseVenueMode ? "venue" : "shop");
  const [caption, setCaption] = useState<string>(
    buildCaption(props, "post", canUseVenueMode ? "venue" : "shop"),
  );
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const sizeLabel = useMemo(() => SIZES[tab].label, [tab]);

  // Re-render preview on tab change.
  useEffect(() => {
    setCaption(buildCaption(props, tab, mode));
    let cancelled = false;
    async function run() {
      if (!canvasRef.current) return;
      setRendering(true);
      try {
        await renderCanvas(canvasRef.current, props, tab, mode);
        if (!cancelled) {
          const url = canvasRef.current.toDataURL("image/png");
          setPreviewUrl(url);
        }
      } catch (err) {
        console.warn("[ig generator] render failed", err);
      } finally {
        if (!cancelled) setRendering(false);
      }
    }
    run();
    return () => { cancelled = true; };
  }, [tab, mode, props]);

  // Switching to a work that is not on a wall drops venue mode, so the tool
  // never sits in a state it cannot render.
  useEffect(() => {
    if (!canUseVenueMode) setMode("shop");
  }, [canUseVenueMode]);

  function handleDownload() {
    if (!previewUrl) return;
    const a = document.createElement("a");
    a.href = previewUrl;
    a.download = `${props.artistSlug}-${props.workTitle.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${tab}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function handleCopyCaption() {
    try {
      await navigator.clipboard.writeText(caption);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* swallow */
    }
  }

  return (
    <div className="bg-surface border border-border rounded-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <div>
          <h2 className="text-base font-medium">Generate Instagram Post</h2>
          <p className="text-xs text-muted mt-0.5">Create a post to promote this artwork.</p>
        </div>
      </div>

      {/* What the post is about, chosen before the format. Shop mode is always
          available; venue mode needs the piece to actually be on a wall, and
          says so rather than silently producing "Now showing at null". */}
      <div className="px-5 pt-4">
        <div className="flex flex-wrap items-center gap-2">
          {([
            { id: "shop" as const, label: "Share my shop" },
            { id: "venue" as const, label: "Now showing at" },
          ]).map((m) => {
            const disabled = m.id === "venue" && !canUseVenueMode;
            return (
              <button
                key={m.id}
                type="button"
                disabled={disabled}
                onClick={() => setMode(m.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-sm border transition-colors ${
                  mode === m.id
                    ? "bg-foreground text-white border-foreground"
                    : disabled
                      ? "border-border text-muted/50 cursor-not-allowed"
                      : "border-border text-muted hover:border-foreground/30 hover:text-foreground"
                }`}
              >
                {m.label}
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-muted mt-2 leading-relaxed">
          {mode === "venue"
            ? "Leads with the venue this piece is hanging in. Your shop link is still in the caption."
            : canUseVenueMode
              ? "Leads with the work and sends people to your shop. Good for your own followers."
              : "Leads with the work and sends people to your shop. Once this piece is on a venue wall you will be able to lead with that instead."}
        </p>
      </div>

      <div className="px-5 pt-4">
        <div className="flex border-b border-border -mx-5 px-5">
          {(["post", "story", "reel"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-xs font-medium tracking-wider uppercase border-b-2 -mb-px transition-colors ${
                tab === t ? "border-accent text-foreground" : "border-transparent text-muted hover:text-foreground"
              }`}
            >
              {t === "reel" ? "Reel idea" : t}
            </button>
          ))}
        </div>
      </div>

      <div className="p-5 space-y-4">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-muted mb-2">{sizeLabel} preview</p>
          <div className="bg-foreground/5 rounded-sm p-3 flex items-center justify-center min-h-[280px]">
            {rendering && !previewUrl ? (
              <p className="text-xs text-muted">Rendering…</p>
            ) : previewUrl ? (
              <Image
                src={previewUrl}
                alt={`${tab} preview`}
                width={SIZES[tab].w}
                height={SIZES[tab].h}
                className="max-h-[420px] w-auto h-auto rounded-sm shadow-md"
                unoptimized
              />
            ) : null}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] uppercase tracking-wider text-muted">Caption</p>
            <button
              type="button"
              onClick={handleCopyCaption}
              className="text-xs text-muted hover:text-accent transition-colors"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            rows={6}
            className="w-full px-3 py-2 bg-background border border-border rounded-sm text-sm focus:outline-none focus:border-accent/60 resize-y"
          />
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleDownload}
            disabled={!previewUrl}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-foreground hover:bg-foreground/90 rounded-sm transition-colors disabled:opacity-60 inline-flex items-center justify-center gap-2"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
            Download Image
          </button>
          <button
            type="button"
            onClick={handleCopyCaption}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-foreground bg-surface border border-border hover:bg-foreground/5 rounded-sm transition-colors inline-flex items-center justify-center gap-2"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
            {copied ? "Copied!" : "Copy Caption"}
          </button>
        </div>
      </div>

      {/* Hidden canvas for rendering. */}
      <canvas ref={canvasRef} style={{ display: "none" }} />
    </div>
  );
}
