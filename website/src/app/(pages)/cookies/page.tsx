import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Cookie Policy – Wallspace",
  description:
    "Wallspace Cookie Policy. Learn about the cookies we use and how to control them.",
};

const cookies = [
  {
    name: "session",
    category: "Strictly Necessary",
    purpose: "Maintains your session state when you are logged in to the platform.",
    duration: "Session (deleted when you close your browser)",
    provider: "Wallspace",
  },
  {
    name: "csrf_token",
    category: "Strictly Necessary",
    purpose:
      "Protects against Cross-Site Request Forgery attacks by verifying form submissions originate from our site.",
    duration: "Session",
    provider: "Wallspace",
  },
  {
    name: "cookie_consent",
    category: "Strictly Necessary",
    purpose: "Stores your cookie consent preferences so we do not ask you repeatedly.",
    duration: "12 months",
    provider: "Wallspace",
  },
  {
    name: "_ga",
    category: "Analytics",
    purpose:
      "Google Analytics – used to distinguish users and generate statistical reports about website usage.",
    duration: "2 years",
    provider: "Google Analytics",
  },
  {
    name: "_ga_*",
    category: "Analytics",
    purpose:
      "Google Analytics – stores and counts page views for the current session.",
    duration: "2 years",
    provider: "Google Analytics",
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
              Last updated: March 2026
            </p>

            <div className="space-y-10">
              <div>
                <h2 className="text-2xl mb-4">What Are Cookies?</h2>
                <p className="text-muted leading-relaxed">
                  Cookies are small text files that are placed on your device
                  when you visit a website. They are widely used to make
                  websites work efficiently, remember your preferences, and
                  provide information to website owners. Cookies set by the
                  website owner (in this case, Wallspace) are called
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
                      title: "Analytics",
                      desc: "These cookies help us understand how visitors interact with our website by collecting and reporting usage data. This helps us improve our site and services. You can opt out of analytics cookies.",
                      required: false,
                    },
                    {
                      title: "Functional",
                      desc: "These cookies allow our website to remember choices you make (such as your language preference or saved filters) to provide enhanced features. Currently we use no functional cookies beyond those listed.",
                      required: false,
                    },
                    {
                      title: "Marketing",
                      desc: "We do not currently use marketing or advertising cookies. We do not track you across third-party websites or use your data for targeted advertising.",
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
                  Wallspace website:
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
                      Google Analytics opt-out
                    </h3>
                    <p className="text-sm text-muted leading-relaxed">
                      You can prevent Google Analytics from collecting your data
                      by installing the{" "}
                      <a
                        href="https://tools.google.com/dlpage/gaoptout"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-accent hover:underline"
                      >
                        Google Analytics opt-out browser add-on
                      </a>
                      .
                    </p>
                  </div>
                  <div className="bg-surface border border-border rounded-sm p-5">
                    <h3 className="text-base font-medium mb-2">
                      Industry opt-out tools
                    </h3>
                    <p className="text-sm text-muted leading-relaxed">
                      You can also use the{" "}
                      <a
                        href="https://www.youronlinechoices.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-accent hover:underline"
                      >
                        Your Online Choices
                      </a>{" "}
                      tool to opt out of interest-based advertising from
                      participating companies.
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
                    href="mailto:hello@wallspace.co"
                    className="text-accent hover:underline"
                  >
                    hello@wallspace.co
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
