import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import RedirectIfLoggedIn from "@/components/RedirectIfLoggedIn";
import { safeRedirect } from "@/lib/safe-redirect";

export const metadata: Metadata = {
  title: "Sign Up",
  description: "Join Wallplace as an artist, venue, or customer.",
};

// Per-role accent palette, drawn from the brand palette so each
// card has a distinct mood without inventing new colours. Stops the
// terracotta from doing every job on the page. `circleClass` is the
// pale wash behind the icon; `iconClass` is the icon stroke. Hover
// state filled below in JSX.
const options = [
  {
    label: "Artist",
    description: "Showcase your work to venues and buyers across London. Get discovered, get placed, get paid.",
    // Routes to /signup/artist (account first), which then forwards
    // into /apply once the user is signed in. The application page
    // itself is auth-gated, anyone hitting /apply directly while
    // logged out is redirected here.
    href: "/signup/artist",
    // Ochre — warm, painterly, suits the maker role.
    circleClass: "bg-[#C8943820] text-[#8A6520]",
    hoverCircleClass: "group-hover:bg-[#8A6520] group-hover:text-white",
    chevronHoverClass: "group-hover:text-[#8A6520]",
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
    href: "/signup/venue",
    // Deep ink — architectural, weighty, the role with a wall.
    circleClass: "bg-foreground/10 text-foreground",
    hoverCircleClass: "group-hover:bg-foreground group-hover:text-white",
    chevronHoverClass: "group-hover:text-foreground",
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
    // Stone — soft, neutral, the role just looking.
    circleClass: "bg-[#9A8E7C26] text-[#5E544A]",
    hoverCircleClass: "group-hover:bg-[#5E544A] group-hover:text-white",
    chevronHoverClass: "group-hover:text-[#5E544A]",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
];

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const rawNext = typeof params.next === "string" ? params.next : "";
  // safeRedirect validates the value and drops external URLs.
  const next = safeRedirect(rawNext, "");
  // Build the forwarded query suffix. Empty string when next is empty so
  // role links stay clean (/signup/customer, not /signup/customer?next=).
  const nextSuffix = next ? `?next=${encodeURIComponent(next)}` : "";
  return (
    <RedirectIfLoggedIn>
    <div className="relative min-h-[calc(110vh-3.5rem)] sm:min-h-[calc(100vh-3.5rem)] lg:min-h-[calc(100vh-4rem)] flex items-center justify-center">
      {/* Background, same as login */}
      <div className="absolute inset-0 -z-10">
        <Image
          src="https://images.unsplash.com/photo-1561214115-f2f134cc4912?w=3840&h=2160&fit=crop&crop=center&q=92&fm=jpg"
          alt="Abstract pour painting in yellow, ink and bone"
          fill
          className="object-cover"
          priority
          quality={80}
          sizes="(max-width: 640px) 400vw, (max-width: 1024px) 250vw, 100vw"
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
              href={`${opt.href}${nextSuffix}`}
              className="group block bg-white/95 backdrop-blur-sm rounded-sm p-6 hover:bg-white hover:shadow-lg transition-all duration-200 min-h-[88px]"
            >
              <div className="flex items-start gap-4">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 transition-colors ${opt.circleClass} ${opt.hoverCircleClass}`}>
                  {opt.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-medium text-foreground">{opt.label}</h2>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={`text-muted transition-colors shrink-0 ${opt.chevronHoverClass}`}>
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
          <Link href={`/login${nextSuffix}`} className="text-white hover:text-accent transition-colors">
            Sign in
          </Link>
        </p>
      </div>
    </div>
    </RedirectIfLoggedIn>
  );
}
