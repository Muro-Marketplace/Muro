import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Cookie Policy",
  description:
    "Wallplace Cookie Policy. What we store in your browser and how to control it.",
};

// A29/A30: this table used to list sb-access-token / sb-refresh-token
// cookies (never set by the app, the auth session lives in localStorage)
// and a wallplace_cookie_consent cookie (actually a localStorage key,
// wallplace-cookie-consent, with no expiry). It now describes the
// browser local storage the site really uses. Wallplace itself sets no
// cookies; keep this table in step with the code if that ever changes.
const storageEntries = [
  {
    name: "sb-...-auth-token (local storage)",
    category: "Strictly Necessary",
    purpose:
      "Sign-in session. Keeps you signed in to your Wallplace account and authorises requests when you visit secure pages (account, checkout, orders). Without it, those features won't work.",
    duration: "Until you sign out or clear your browser data (refreshed automatically while you are signed in)",
    provider: "Wallplace",
  },
  {
    name: "wallplace-cookie-consent (local storage)",
    category: "Strictly Necessary",
    purpose:
      "Stores your consent-banner choice so we do not ask you repeatedly. Storing this preference is exempt from the consent requirement under PECR regulation 6(4).",
    duration: "Until you clear your browser data",
    provider: "Wallplace",
  },
  {
    name: "wallplace-cart (local storage)",
    category: "Strictly Necessary",
    purpose:
      "Keeps the artworks in your basket between visits so your basket is still there when you come back.",
    duration: "Until you complete checkout, empty the basket, or clear your browser data",
    provider: "Wallplace",
  },
  {
    name: "Other wallplace-... keys (local storage)",
    category: "Strictly Necessary",
    purpose:
      "Small convenience preferences, for example saved items, your postcode for distance search, and dismissed onboarding banners. None of them identify you to third parties.",
    duration: "Until you clear your browser data",
    provider: "Wallplace",
  },
];

export default function CookiesPage() {
  return (
    <div className="bg-background">
      <section className="py-20 lg:py-24">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="max-w-3xl">
            <h1 className="text-4xl lg:text-5xl mb-4">Cookie Policy</h1>
            <p className="text-muted leading-relaxed mb-16">
              Last updated: August 2026
            </p>

            <div className="space-y-10">
              <div>
                <h2 className="text-2xl mb-4">What Are Cookies?</h2>
                <p className="text-muted leading-relaxed">
                  Cookies are small text files that are placed on your device
                  when you visit a website. They are widely used to make
                  websites work efficiently, remember your preferences, and
                  provide information to website owners. Cookies set by the
                  website owner (in this case, Wallplace) are called
                  &ldquo;first-party cookies&rdquo;. Cookies set by parties
                  other than the website owner are called &ldquo;third-party
                  cookies&rdquo; and may be set by our service providers.
                </p>
                <p className="text-muted leading-relaxed mt-4">
                  Wallplace currently sets no cookies of its own. Instead we
                  use your browser&rsquo;s local storage, a similar mechanism
                  where small pieces of information are kept on your device by
                  your browser and are only readable by this site. This policy
                  covers both so you can see exactly what is stored.
                </p>
              </div>

              <div>
                <h2 className="text-2xl mb-4">How We Use Cookies and Local Storage</h2>
                <p className="text-muted leading-relaxed mb-6">
                  We use browser storage for the following purposes:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[
                    {
                      title: "Strictly Necessary",
                      desc: "These local storage entries are required for our website to function. They enable core features like signing in, keeping your basket, and remembering your consent choice. You cannot opt out of these.",
                      required: true,
                    },
                    {
                      title: "Analytics (server-side only)",
                      desc: "We do not use any analytics cookies. We run privacy-first server-side analytics that record aggregated page-view events using a daily-rotating SHA-256 hash of your IP address and user-agent. No identifiers are stored on your device, and we cannot identify individual visitors after 24 hours.",
                      required: false,
                    },
                    {
                      title: "Functional",
                      desc: "We do not currently use functional cookies beyond the strictly necessary local storage listed below.",
                      required: false,
                    },
                    {
                      title: "Marketing",
                      desc: "We do not use marketing, advertising, or cross-site tracking cookies. We do not run Google Analytics, the Facebook/Meta Pixel, or any third-party advertising tags.",
                      required: false,
                    },
                  ].map(({ title, desc, required }) => (
                    <div
                      key={title}
                      className="bg-surface border border-border rounded-sm p-5"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="text-base font-medium">{title}</h3>
                        {required && (
                          <span className="text-xs px-2 py-0.5 bg-accent/10 text-accent-text rounded-sm">
                            Required
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted leading-relaxed">{desc}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h2 className="text-2xl mb-4">What We Store</h2>
                <p className="text-muted leading-relaxed mb-6">
                  The following table lists the browser storage used on the
                  Wallplace website. All of it is local storage; no cookies
                  are set:
                </p>
                {/* Mobile card list — shown below sm breakpoint */}
                <div className="sm:hidden space-y-3">
                  {storageEntries.map((cookie) => (
                    <div
                      key={cookie.name}
                      className="border border-border rounded-sm p-4 bg-surface text-sm"
                    >
                      <p className="font-mono text-xs text-foreground mb-2">{cookie.name}</p>
                      <dl className="space-y-1">
                        <div className="flex gap-2">
                          <dt className="text-xs font-medium text-muted uppercase tracking-wider w-20 shrink-0">Category</dt>
                          <dd className="text-xs text-muted">{cookie.category}</dd>
                        </div>
                        <div className="flex gap-2">
                          <dt className="text-xs font-medium text-muted uppercase tracking-wider w-20 shrink-0">Purpose</dt>
                          <dd className="text-xs text-muted leading-relaxed">{cookie.purpose}</dd>
                        </div>
                        <div className="flex gap-2">
                          <dt className="text-xs font-medium text-muted uppercase tracking-wider w-20 shrink-0">Duration</dt>
                          <dd className="text-xs text-muted">{cookie.duration}</dd>
                        </div>
                      </dl>
                    </div>
                  ))}
                </div>
                {/* Desktop table — hidden below sm breakpoint */}
                <div className="hidden sm:block overflow-x-auto -mx-6 px-6">
                  <table className="w-full sm:min-w-[640px] text-sm border border-border rounded-sm overflow-hidden">
                    <thead>
                      <tr className="bg-surface border-b border-border">
                        <th className="text-left py-3 px-4 text-xs font-medium text-muted uppercase tracking-wider">
                          Name
                        </th>
                        <th className="text-left py-3 px-4 text-xs font-medium text-muted uppercase tracking-wider">
                          Category
                        </th>
                        <th className="text-left py-3 px-4 text-xs font-medium text-muted uppercase tracking-wider">
                          Purpose
                        </th>
                        <th className="text-left py-3 px-4 text-xs font-medium text-muted uppercase tracking-wider">
                          Duration
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {storageEntries.map((cookie, i) => (
                        <tr
                          key={cookie.name}
                          className={`border-b border-border/60 ${
                            i % 2 === 0 ? "bg-background" : "bg-surface"
                          }`}
                        >
                          <td className="py-3 px-4 font-mono text-xs text-foreground">
                            {cookie.name}
                          </td>
                          <td className="py-3 px-4 text-muted text-xs">
                            {cookie.category}
                          </td>
                          <td className="py-3 px-4 text-muted text-xs leading-relaxed max-w-xs">
                            {cookie.purpose}
                          </td>
                          <td className="py-3 px-4 text-muted text-xs">
                            {cookie.duration}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <h2 className="text-2xl mb-4">How to Control Browser Storage</h2>
                <p className="text-muted leading-relaxed mb-4">
                  You have several options for managing what is stored:
                </p>
                <div className="space-y-4">
                  <div className="bg-surface border border-border rounded-sm p-5">
                    <h3 className="text-base font-medium mb-2">
                      Browser settings
                    </h3>
                    <p className="text-sm text-muted leading-relaxed">
                      Most browsers let you view and delete site data, which
                      covers both cookies and local storage, usually under
                      &ldquo;site data&rdquo; or &ldquo;storage&rdquo; in the
                      privacy settings. Clearing our site data signs you out
                      and empties your basket, and some features may not work
                      correctly if storage is blocked entirely.
                    </p>
                  </div>
                  <div className="bg-surface border border-border rounded-sm p-5">
                    <h3 className="text-base font-medium mb-2">
                      Server-side analytics
                    </h3>
                    <p className="text-sm text-muted leading-relaxed">
                      Because our analytics are aggregated and server-side (and
                      do not place cookies or identifiers on your device), there
                      is nothing to opt out of at the browser level. If you
                      would like us to delete any logs that may indirectly
                      relate to your device, email{" "}
                      <a
                        href="mailto:privacy@wallplace.co.uk"
                        className="text-accent-text underline"
                      >
                        privacy@wallplace.co.uk
                      </a>{" "}
                      and we will investigate and respond in line with our{" "}
                      <a
                        href="/privacy"
                        className="text-accent-text underline"
                      >
                        Privacy Policy
                      </a>
                      .
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <h2 className="text-2xl mb-4">
                  Changes to This Cookie Policy
                </h2>
                <p className="text-muted leading-relaxed">
                  We may update this Cookie Policy from time to time to reflect
                  changes in the cookies we use or for operational, legal, or
                  regulatory reasons. Please check this page regularly to stay
                  informed. The date at the top of this policy indicates when it
                  was last revised.
                </p>
              </div>

              <div>
                <h2 className="text-2xl mb-4">Contact Us</h2>
                <p className="text-muted leading-relaxed">
                  If you have questions about our use of cookies or this Cookie
                  Policy, please contact us at{" "}
                  <a
                    href="mailto:privacy@wallplace.co.uk"
                    className="text-accent-text underline"
                  >
                    privacy@wallplace.co.uk
                  </a>
                  . For more information about how we handle your personal data,
                  please read our{" "}
                  <a href="/privacy" className="text-accent-text underline">
                    Privacy Policy
                  </a>
                  .
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
