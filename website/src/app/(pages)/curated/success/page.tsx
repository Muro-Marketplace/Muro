import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Curation booked",
};

export default function CurationSuccessPage() {
  return (
    <div className="max-w-[720px] mx-auto px-6 py-20 lg:py-28 text-center">
      <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-green-100 mb-8">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
      <h1 className="font-serif text-3xl lg:text-4xl text-foreground mb-4">
        Thanks — your curation is underway.
      </h1>
      <p className="text-base text-muted leading-relaxed mb-8">
        Payment received. Our curators will review your brief and email you a tailored shortlist within 5 business days. Keep an eye on your inbox.
      </p>
      <div className="flex items-center justify-center gap-3 flex-wrap">
        <Link href="/browse" className="px-6 py-3 text-sm font-semibold tracking-wider uppercase bg-accent text-white rounded-sm hover:bg-accent-hover transition-colors">
          Browse artists
        </Link>
        <Link href="/" className="px-6 py-3 text-sm font-semibold tracking-wider uppercase border border-border text-foreground hover:border-foreground/30 rounded-sm transition-colors">
          Back home
        </Link>
      </div>
    </div>
  );
}
