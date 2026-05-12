import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Check your inbox | Wallplace",
  robots: { index: false, follow: false },
};

export default function CheckYourInboxPage() {
  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-6">
      <div className="max-w-md text-center">
        <h1 className="text-2xl sm:text-3xl font-serif mb-4">Check your inbox</h1>
        <p className="text-sm text-muted leading-relaxed mb-6">
          We&rsquo;ve sent you a confirmation link. Click it to activate your
          account, then come back and sign in. The email may take a minute
          to arrive.
        </p>
        <p className="text-xs text-muted mb-8">
          Wrong email? Sign up again with the correct address. Wallplace
          won&rsquo;t auto-merge accounts, but the unverified one expires
          on its own after 7 days.
        </p>
        <Link
          href="/login"
          className="inline-block px-6 py-3 bg-accent text-white text-sm font-medium rounded-sm hover:bg-accent-hover transition-colors"
        >
          Go to sign in
        </Link>
      </div>
    </div>
  );
}
