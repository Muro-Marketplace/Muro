import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Cookie Policy – Wallplace",
  description:
    "Wallplace Cookie Policy. Learn about the cookies we use and how to control them.",
};

// Cookie list (#38), vendor-neutral phrasing. The Supabase cookies
// are still ours functionally; using "Wallplace" as the provider and
// describing the purpose in plain English keeps this readable to a
// non-technical visitor while remaining accurate.
const cookies = [
  {
    name: "sb-access-token",
    category: "Strictly Necessary",
    purpose:
      "Sign-in cookie. Keeps you signed in to your Wallplace account and authorises requests when you visit secure pages (account, checkout, orders). Without it, those features won't work.",
    duration: "1 hour (refreshed automatically while you are active)",
    provider: "Wallplace",
  },
  {
    name: "sb-refresh-token",
    category: "Strictly Necessary",
    purpose:
      "Session-renewal cookie. Lets your sign-in be refreshed in the background so you don't have to log in again every visit.",
    duration: "30 days",
    provider: "Wallplace",
  },
  {
    name: "wallplace_cookie_consent",
    category: "Strictly Necessary",
    purpose:
      "Stores your cookie/consent choice so we do not ask you repeatedly. Storing this preference is exempt from the consent requirement under PECR regulation 6(4).",
    duration: "12 months",
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
              Last updated: April 2026
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
              </div>

              <div>
                <h2 className="text-2xl mb-4">How We Use Cookies</h2>
                <p className="text-muted leading-relaxed mb-6">
                  We use cookies for the following purposes:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[
                    {
                      title: "Strictly Necessary",
                      desc: "These cookies are required for our website to function. They enable core features like security, session management, and form submission. You cannot opt out of these cookies.",
                      required: true,
                    },
                    {
                      title: "Analytics (server-side only)",
                      desc: "We do not use any analytics cookies. We run privacy-first server-side analytics that record aggregated page-view events using a daily-rotating SHA-256 hash of your IP address and user-agent. No identifiers are stored on your device, and we cannot identify individual visitors after 24 hours.",
                      required: false,
                    },
                    {
                      title: "Functional",
                      desc: "We do not currently use functional cookies beyond the strictly necessary cookies listed below.",
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
                          <span className="text-xs px-2 py-0.5 bg-accent/10 text-accent rounded-sm">
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
                <h2 className="text-2xl mb-4">Cookies We Use</h2>
                <p className="text-muted leading-relaxed mb-6">
                  The following table lists the specific cookies used on the
                  Wallplace website:
                </p>
                <div className="overflow-x-auto -mx-6 px-6">
                  <table className="w-full min-w-[640px] text-sm border border-border rounded-sm overflow-hidden">
                    <thead>
                      <tr className="bg-surface border-b border-border">
                        <th className="text-left py-3 px-4 text-xs font-medium text-muted uppercase tracking-wider">
                          Cookie
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
                      {cookies.map((cookie, i) => (
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
                <h2 className="text-2xl mb-4">How to Control Cookies</h2>
                <p className="text-muted leading-relaxed mb-4">
                  You have several options for managing cookies:
                </p>
                <div className="space-y-4">
                  <div className="bg-surface border border-border rounded-sm p-5">
                    <h3 className="text-base font-medium mb-2">
                      Browser settings
                    </h3>
                    <p className="text-sm text-muted leading-relaxed">
                      Most browsers allow you to view, delete, and block cookies.
                      You can find instructions for managing cookies in your
                      browser&rsquo;s help documentation. Please note that
                      blocking all cookies will affect the functionality of our
                      website, and some features may not work correctly.
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
                        className="text-accent hover:underline"
                      >
                        privacy@wallplace.co.uk
                      </a>{" "}
                      and we will investigate and respond in line with our{" "}
                      <a
                        href="/privacy"
                        className="text-accent hover:underline"
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
                    className="text-accent hover:underline"
                  >
                    privacy@wallplace.co.uk
                  </a>
                  . For more information about how we handle your personal data,
                  please read our{" "}
                  <a href="/privacy" className="text-accent hover:underline">
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
