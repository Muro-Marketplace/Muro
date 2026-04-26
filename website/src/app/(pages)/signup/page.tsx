import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign Up – Wallplace",
  description: "Join Wallplace as an artist, venue, or customer.",
};

const options = [
  {
    label: "Artist",
    description: "Showcase your work to venues and buyers across the UK. Get discovered, get placed, get paid.",
    // Routes to /signup/artist (account first), which then forwards
    // into /apply once the user is signed in. The application page
    // itself is auth-gated — anyone hitting /apply directly while
    // logged out is redirected here.
    href: "/signup/artist",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 19l7-7 3 3-7 7-3-3z" />
        <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
        <path d="M2 2l7.586 7.586" />
        <circle cx="11" cy="11" r="2" />
      </svg>
    ),
  },
  {
    label: "Venue",
    description: "Find artwork for your space. Free to display, optional revenue share. Browse and connect instantly.",
    href: "/register-venue",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
  },
  {
    label: "Customer",
    description: "Buy original artwork directly from independent artists. Track your orders and build your collection.",
    href: "/signup/customer",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
];

export default function SignUpPage() {
  return (
    <div className="relative min-h-[calc(110vh-3.5rem)] sm:min-h-[calc(100vh-3.5rem)] lg:min-h-[calc(100vh-4rem)] flex items-center justify-center">
      {/* Background — same as login */}
      <div className="absolute inset-0 -z-10">
        <Image
          src="https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1920&h=1080&fit=crop&crop=center"
          alt="Mountain landscape"
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-black/55" />
      </div>

      <div className="w-full max-w-md px-6 py-16 -mt-[14vh] sm:mt-0">
        {/* Heading */}
        <div className="text-center mb-10">
          <h1 className="text-3xl lg:text-4xl font-serif mb-2 text-white">Join Wallplace</h1>
          <p className="text-white/50 text-sm">Choose your account type to get started</p>
        </div>

        {/* Options */}
        <div className="space-y-4">
          {options.map((opt) => (
            <Link
              key={opt.label}
              href={opt.href}
              className="group block bg-white/95 backdrop-blur-sm rounded-sm p-6 hover:bg-white hover:shadow-lg transition-all duration-200 min-h-[88px]"
            >
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center shrink-0 text-accent group-hover:bg-accent group-hover:text-white transition-colors">
                  {opt.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-medium text-foreground">{opt.label}</h2>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-muted group-hover:text-accent transition-colors shrink-0">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </div>
                  <p className="text-sm text-muted mt-1 leading-relaxed">{opt.description}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* Login link */}
        <p className="text-center mt-8 text-sm text-white/50">
          Already have an account?{" "}
          <Link href="/login" className="text-white hover:text-accent transition-colors">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
