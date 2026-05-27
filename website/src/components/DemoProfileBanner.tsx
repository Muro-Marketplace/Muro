import Link from "next/link";

// Phase 2.1 P1. Replaces the Message + Buy Now CTAs on demo-flagged
// artist profiles (currently just Maya Chen). Tells the visitor the
// profile is a tour stop, not a real artist who takes orders, and
// points them at the live marketplace.
//
// Used in two spots on the artist profile page:
//   - The compact CTA stack under the avatar (mobile + sidebar)
//   - The full-width call-to-action band near the bottom
// Pass `compact` to the first; the default render is the wider band.
export default function DemoProfileBanner({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <div className="rounded-sm border border-accent/30 bg-accent/5 px-4 py-3 text-[12px] leading-relaxed text-foreground">
        <p className="font-medium mb-1.5">Demo profile</p>
        <p className="text-muted">
          You&rsquo;re looking at a tour stop, not a real artist. Pop over
          to <Link href="/browse" className="text-accent hover:underline">live artists</Link> to
          message someone or commission a piece.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto rounded-sm border border-accent/30 bg-accent/5 px-6 py-8 text-center">
      <p className="text-xs uppercase tracking-wider text-accent mb-3 font-medium">
        Demo profile
      </p>
      <p className="text-base text-foreground leading-relaxed mb-5">
        This profile is part of the Wallplace tour. The Message and Buy
        buttons are switched off here so we don&rsquo;t send orders to a
        demo artist.
      </p>
      <Link
        href="/browse"
        className="inline-flex items-center justify-center px-6 py-3 rounded-sm bg-accent text-white text-sm font-medium hover:bg-accent-hover transition-colors"
      >
        Explore live artists
      </Link>
    </div>
  );
}
