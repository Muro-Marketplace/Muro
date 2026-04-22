import Link from "next/link";
import NewsletterForm from "./NewsletterForm";

const footerColumns = [
  {
    title: "For Artists",
    links: [
      { label: "Apply to Join", href: "/apply" },
      { label: "Pricing", href: "/pricing" },
      { label: "Venue Demand", href: "/spaces-looking-for-art" },
      { label: "FAQs", href: "/faqs" },
    ],
  },
  {
    title: "For Venues",
    links: [
      { label: "Discover Art", href: "/browse" },
      { label: "Register Your Venue", href: "/register-venue" },
      { label: "Wallplace Curated", href: "/curated" },
      { label: "How It Works", href: "/how-it-works" },
      { label: "FAQs", href: "/faqs" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Blog", href: "/blog" },
      { label: "How It Works", href: "/how-it-works" },
      { label: "Contact", href: "/contact" },
      { label: "Terms", href: "/terms" },
      { label: "Artist Agreement", href: "/artist-agreement" },
      { label: "Venue Agreement", href: "/venue-agreement" },
      { label: "Privacy", href: "/privacy" },
      { label: "Cookies", href: "/cookies" },
      { label: "Returns & Refunds", href: "/returns" },
      { label: "IP Policy", href: "/ip-policy" },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="border-t border-border mt-auto bg-background pb-[env(safe-area-inset-bottom)]" role="contentinfo" aria-label="Site footer">
      <div className="mx-auto max-w-[1200px] px-6 py-16 lg:py-20">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-12 lg:gap-8">
          {/* Brand Column */}
          <div className="lg:col-span-2">
            <Link href="/" className="font-serif text-xl tracking-tight">
              Wallplace
            </Link>
            <p className="mt-3 text-sm text-muted leading-relaxed max-w-xs">
              The curated art marketplace connecting artists with commercial spaces.
            </p>

            {/* Mailing list — item 19: "be first to see new works" */}
            <div className="mt-6 max-w-sm">
              <p className="text-sm font-medium text-foreground mb-2">Be first to see new works</p>
              <p className="text-xs text-muted mb-3">Monthly email with new artists, collections, and venues. No spam.</p>
              <NewsletterForm source="footer" />
            </div>

            {/* Instagram */}
            <a
              href="https://instagram.com/thewallplace"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 mt-6 text-sm text-muted hover:text-foreground transition-colors duration-200"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="2" y="2" width="20" height="20" rx="5" />
                <circle cx="12" cy="12" r="5" />
                <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
              </svg>
              Instagram
            </a>
          </div>

          {/* Link Columns */}
          {footerColumns.map((column) => (
            <div key={column.title}>
              <h4 className="text-xs font-medium uppercase tracking-wider text-muted mb-4">
                {column.title}
              </h4>
              <ul className="space-y-3">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-foreground/70 hover:text-foreground transition-colors duration-200"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom Bar */}
        <div className="mt-16 pt-8 border-t border-border">
          <p className="text-xs text-muted">
            &copy; {new Date().getFullYear()} Wallplace. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
