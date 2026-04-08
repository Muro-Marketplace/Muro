import Button from "@/components/Button";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Login – Wallspace",
  description: "Log in to your Wallspace account as an artist or venue.",
};

export default function LoginPage() {
  return (
    <div className="min-h-[calc(100vh-3.5rem)] lg:min-h-[calc(100vh-4rem)] bg-background flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-2xl">
        {/* Heading */}
        <div className="text-center mb-10">
          <h1 className="text-3xl lg:text-4xl mb-3">Welcome back</h1>
          <p className="text-muted">Choose how you would like to log in.</p>
        </div>

        {/* Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-8">
          {/* Artist card */}
          <div className="bg-surface border border-border rounded-sm p-8 flex flex-col items-center text-center gap-5 hover:border-accent/40 transition-colors duration-200">
            <div className="w-14 h-14 rounded-full bg-accent/10 flex items-center justify-center">
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
                <circle cx="14" cy="10" r="5" stroke="#C17C5A" strokeWidth="1.5" />
                <path d="M4 24c0-5.523 4.477-10 10-10s10 4.477 10 10" stroke="#C17C5A" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl mb-2">Artist Login</h2>
              <p className="text-sm text-muted leading-relaxed">
                Access your portfolio, analytics, and placements.
              </p>
            </div>
            <Button href="/artist-portal" variant="primary" size="md" className="w-full">
              Login as Artist
            </Button>
          </div>

          {/* Venue card */}
          <div className="bg-surface border border-border rounded-sm p-8 flex flex-col items-center text-center gap-5 hover:border-accent/40 transition-colors duration-200">
            <div className="w-14 h-14 rounded-full bg-accent/10 flex items-center justify-center">
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
                <rect x="4" y="12" width="20" height="12" rx="1" stroke="#C17C5A" strokeWidth="1.5" />
                <path d="M4 12l10-8 10 8" stroke="#C17C5A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                <rect x="11" y="17" width="6" height="7" rx="0.5" stroke="#C17C5A" strokeWidth="1.5" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl mb-2">Venue Login</h2>
              <p className="text-sm text-muted leading-relaxed">
                Access your saved artists, enquiries, and orders.
              </p>
            </div>
            <Button href="/venue-portal" variant="secondary" size="md" className="w-full">
              Login as Venue
            </Button>
          </div>
        </div>

        {/* Sign-up links */}
        <div className="text-center space-y-2">
          <p className="text-sm text-muted">
            Don&rsquo;t have an account?{" "}
            <Link href="/apply" className="text-accent hover:underline underline-offset-4">
              Apply to join as an artist
            </Link>
            {" "}or{" "}
            <Link href="/register-venue" className="text-accent hover:underline underline-offset-4">
              register your venue
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
