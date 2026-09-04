"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { generateQRDataURL } from "@/lib/qr";
import { shopUrl, shopUrlDisplay } from "@/lib/shop-url";

/**
 * The artist's shop link, and the ways to share it.
 *
 * Before this there was no way for an artist to get a link to their own shop.
 * `/artist-portal/labels` produces per-artwork print labels and nothing
 * anywhere produced a URL or a code for the profile as a whole, so an artist
 * who wanted to point their own following at their work had to construct the
 * URL by hand or copy it out of the address bar.
 *
 * `compact` sits on the dashboard and is just the link. `full` sits on the
 * profile page and adds the QR and the instruction.
 */

/** Printable, still legible when scaled down into a story. */
const QR_PX = 600;

export default function ShareYourShop({
  slug,
  variant = "compact",
}: {
  slug: string;
  variant?: "compact" | "full";
}) {
  const [copied, setCopied] = useState(false);
  const [qr, setQr] = useState<string | null>(null);

  const url = slug ? shopUrl(slug) : "";

  useEffect(() => {
    // Compact never shows the QR, so it never generates one.
    if (variant !== "full" || !slug) return;
    let cancelled = false;
    generateQRDataURL(shopUrl(slug), QR_PX)
      .then((dataUrl) => {
        if (!cancelled) setQr(dataUrl);
      })
      .catch(() => {
        /* No code is better than a broken image; the link above still works. */
      });
    return () => {
      cancelled = true;
    };
  }, [slug, variant]);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  // useCurrentArtist resolves asynchronously, and "wallplace.co.uk/" is worse
  // than showing nothing.
  if (!slug) return null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // Safari refuses clipboard writes outside a gesture it recognises. The
      // URL is on screen and selectable, so failing quietly is the right cost.
    }
  }

  return (
    <section className="bg-surface border border-border rounded-sm p-4">
      <p className="text-xs font-medium tracking-wider uppercase text-muted mb-3">
        Share your shop
      </p>

      <div className="flex items-center gap-2 mb-3">
        <code className="flex-1 min-w-0 truncate bg-background border border-border rounded-sm px-3 py-2 text-sm text-foreground">
          {shopUrlDisplay(slug)}
        </code>
        <button
          type="button"
          onClick={copy}
          className="shrink-0 px-3 py-2 text-xs font-medium text-white bg-foreground rounded-sm hover:bg-accent transition-colors"
        >
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>

      {variant === "compact" ? (
        <Link
          href="/artist-portal/profile"
          className="text-xs text-accent hover:underline underline-offset-4"
        >
          Get the QR code for your shop
        </Link>
      ) : (
        <>
          <p className="text-sm text-muted leading-relaxed mb-4">
            This is your shop. Put it in your Instagram bio so the people already
            following you have somewhere to buy, and drop it in a post whenever you
            add new work.
          </p>

          {qr && (
            <div className="flex items-center gap-4 pt-4 border-t border-border">
              {/* Not next/image: this is a client-generated data URL, so there
                  is nothing for the optimiser to fetch or cache. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qr}
                alt={`QR code linking to ${shopUrlDisplay(slug)}`}
                className="w-24 h-24 border border-border rounded-sm bg-white"
              />
              <div className="min-w-0">
                <p className="text-sm text-foreground mb-1">Your shop as a QR code</p>
                <p className="text-xs text-muted leading-relaxed mb-2">
                  Print it for a stall or a fair, or add it to a story so people can
                  scan straight through.
                </p>
                <a
                  href={qr}
                  download={`wallplace-shop-${slug}.png`}
                  className="text-xs font-medium text-accent hover:underline underline-offset-4"
                >
                  Download PNG
                </a>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
