"use client";

// Generate an Instagram post (or story / reel idea) from an artwork.
//
// The image is rendered into a hidden <canvas> and exported as a PNG.
// Caption + hashtags are templated client-side — easy to swap in an
// LLM call later if we want richer copy.

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";

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

function buildCaption(p: Props, tab: Tab): string {
  const venueLine = p.showingAtVenueName ? `Now showing at ${p.showingAtVenueName}.\n` : "";
  if (tab === "story") {
    return `${venueLine}"${p.workTitle}" by ${p.artistName}\n\nSwipe up to view → wallplace.co.uk/${p.artistSlug}`;
  }
  if (tab === "reel") {
    return `Reel idea: show ${p.workTitle} from three angles, hold on the QR label.\n\nCaption:\n${venueLine}"${p.workTitle}" by ${p.artistName}. Real art, real spaces. Find it on Wallplace.`;
  }
  // post (default)
  const tagline = p.showingAtVenueName
    ? `${venueLine}"${p.workTitle}" by ${p.artistName}, captured in real space.`
    : `"${p.workTitle}" by ${p.artistName}.`;
  return `${tagline}\n\nOriginal art. Real spaces.\nDiscover more on Wallplace.\n\n#Wallplace #${slugifyTag(p.artistName)} #ArtInSpaces #OriginalArt${p.workMedium ? ` #${slugifyTag(p.workMedium)}` : ""}`;
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

async function renderCanvas(canvas: HTMLCanvasElement, p: Props, tab: Tab) {
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

  if (p.showingAtVenueName) {
    ctx.font = "300 22px system-ui, -apple-system, Helvetica, sans-serif";
    ctx.globalAlpha = 0.7;
    ctx.fillText("NOW SHOWING AT", w / 2, captionY);
    ctx.globalAlpha = 1;
    ctx.font = "600 56px serif";
    ctx.fillText(p.showingAtVenueName.toUpperCase(), w / 2, captionY + 60);
    ctx.font = "300 24px system-ui, -apple-system, Helvetica, sans-serif";
    ctx.globalAlpha = 0.65;
    ctx.fillText(`A ${p.workMedium || "work"} by ${p.artistName.toUpperCase()}`, w / 2, captionY + 110);
    ctx.globalAlpha = 1;
  } else {
    ctx.font = "600 56px serif";
    ctx.fillText(p.workTitle, w / 2, captionY + 30);
    ctx.font = "300 24px system-ui, -apple-system, Helvetica, sans-serif";
    ctx.globalAlpha = 0.65;
    ctx.fillText(`A ${p.workMedium || "work"} by ${p.artistName.toUpperCase()}`, w / 2, captionY + 80);
    ctx.globalAlpha = 1;
  }

  // wallplace.co.uk footer.
  ctx.font = "300 20px system-ui";
  ctx.globalAlpha = 0.5;
  ctx.fillText("wallplace.co.uk", w / 2, h - 40);
  ctx.globalAlpha = 1;
}

export default function InstagramPostGenerator(props: Props) {
  const [tab, setTab] = useState<Tab>("post");
  const [caption, setCaption] = useState<string>(buildCaption(props, "post"));
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const sizeLabel = useMemo(() => SIZES[tab].label, [tab]);

  // Re-render preview on tab change.
  useEffect(() => {
    setCaption(buildCaption(props, tab));
    let cancelled = false;
    async function run() {
      if (!canvasRef.current) return;
      setRendering(true);
      try {
        await renderCanvas(canvasRef.current, props, tab);
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
  }, [tab, props]);

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
