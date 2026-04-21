import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Quote requested",
};

export default function CurationEnquirySentPage() {
  return (
    <div className="max-w-[720px] mx-auto px-6 py-20 lg:py-28 text-center">
      <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-accent/10 mb-8">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#C17C5A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
        </svg>
      </div>
      <h1 className="font-serif text-3xl lg:text-4xl text-foreground mb-4">
        Thanks — we&rsquo;ve got your brief.
      </h1>
      <p className="text-base text-muted leading-relaxed mb-8">
        A member of the Wallplace team will review your bespoke brief and email you a tailored quote within 2 business days. No payment has been taken.
      </p>
      <div className="flex items-center justify-center gap-3 flex-wrap">
        <Link href="/browse" className="px-6 py-3 text-sm font-semibold tracking-wider uppercase bg-accent text-white rounded-sm hover:bg-accent-hover transition-colors">
          Browse artists while you wait
        </Link>
        <Link href="/" className="px-6 py-3 text-sm font-semibold tracking-wider uppercase border border-border text-foreground hover:border-foreground/30 rounded-sm transition-colors">
          Back home
        </Link>
      </div>
    </div>
  );
}
