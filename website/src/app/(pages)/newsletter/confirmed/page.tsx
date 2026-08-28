import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Newsletter subscription",
  robots: { index: false, follow: false },
};

// Where GET /api/newsletter/confirm lands people. Three outcomes, because a
// dead link that says "confirmed" is worse than one that says nothing: someone
// waits for a newsletter that is never coming.
const COPY = {
  ok: {
    heading: "You're on the list",
    body: "Thanks for confirming. You'll hear from us when there's new work from artists near you, and the venues showing it.",
    note: "Every email has an unsubscribe link, and one click is all it takes.",
  },
  expired: {
    heading: "That link has expired",
    body: "Confirmation links last 7 days. Pop your address in again and we'll send a fresh one.",
    note: "Nothing has been sent to you in the meantime, and nothing will be until you confirm.",
  },
  invalid: {
    heading: "That link didn't work",
    body: "It may already have been used, or it may have been cut short by an email client. Try subscribing again and we'll send a new one.",
    note: "If it keeps happening, get in touch and we'll sort it out.",
  },
} as const;

type Status = keyof typeof COPY;

export default async function NewsletterConfirmedPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const copy = COPY[(status as Status) in COPY ? (status as Status) : "invalid"];

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-6">
      <div className="max-w-md text-center">
        <h1 className="text-2xl sm:text-3xl font-serif mb-4">{copy.heading}</h1>
        <p className="text-sm text-muted leading-relaxed mb-6">{copy.body}</p>
        <p className="text-xs text-muted mb-8">{copy.note}</p>
        <Link
          href="/browse"
          className="inline-block px-6 py-3 bg-accent text-white text-sm font-medium rounded-sm hover:bg-accent-hover transition-colors"
        >
          Browse the work
        </Link>
      </div>
    </div>
  );
}
