import Link from "next/link";

const footerColumns = [
  {
    title: "For Artists",
    links: [
      { label: "Apply to Join", href: "/apply" },
      { label: "Pricing", href: "/pricing" },
      { label: "Spaces Looking for Art", href: "/spaces" },
      { label: "FAQs", href: "/faqs" },
    ],
  },
  {
    title: "For Venues",
    links: [
      { label: "Browse Portfolios", href: "/browse" },
      { label: "Browse Galleries", href: "/galleries" },
      { label: "How It Works", href: "/how-it-works" },
      { label: "FAQs", href: "/faqs" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Contact", href: "/contact" },
      { label: "Terms", href: "/terms" },
      { label: "Privacy", href: "/privacy" },
      { label: "Cookies", href: "/cookies" },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="border-t border-border mt-auto bg-background">
      <div className="mx-auto max-w-[1200px] px-6 py-16 lg:py-20">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-12 lg:gap-8">
          {/* Brand Column */}
          <div className="lg:col-span-2">
            <Link href="/" className="font-serif text-xl tracking-tight">
              Wallspace
            </Link>
            <p className="mt-3 text-sm text-muted leading-relaxed max-w-xs">
              The curated art marketplace for independent venues.
            </p>
            {/* Instagram */}
            <a
              href="https://instagram.com/wallspace"
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
            &copy; {new Date().getFullYear()} Wallspace. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
