import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy – Wallspace",
  description:
    "Wallspace Privacy Policy. Learn how we collect, use, and protect your personal data.",
};

export default function PrivacyPage() {
  return (
    <div className="bg-background">
      <section className="py-20 lg:py-24">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="max-w-3xl">
            <h1 className="text-4xl lg:text-5xl mb-4">Privacy Policy</h1>
            <p className="text-muted leading-relaxed mb-16">
              Last updated: March 2026
            </p>

            <div className="space-y-10">
              <div>
                <h2 className="text-2xl mb-4">1. Who We Are</h2>
                <p className="text-muted leading-relaxed">
                  Wallspace Ltd (&ldquo;Wallspace&rdquo;, &ldquo;we&rdquo;,
                  &ldquo;us&rdquo;, or &ldquo;our&rdquo;) operates the website
                  at wallspace.co and provides a curated art placement service
                  connecting artists with commercial venues. We are the
                  data controller for the personal information we hold about you.
                  You can contact us at{" "}
                  <a
                    href="mailto:hello@wallspace.co"
                    className="text-accent hover:underline"
                  >
                    hello@wallspace.co
                  </a>
                  .
                </p>
              </div>

              <div>
                <h2 className="text-2xl mb-4">2. Information We Collect</h2>
                <p className="text-muted leading-relaxed mb-4">
                  We collect information in the following ways:
                </p>
                <div className="space-y-4">
                  <div className="bg-surface border border-border rounded-sm p-5">
                    <h3 className="text-base font-medium mb-2">
                      Information you provide directly
                    </h3>
                    <p className="text-sm text-muted leading-relaxed">
                      When you submit an artist application, contact form, or
                      venue enquiry, we collect the information you provide —
                      including your name, email address, location, social media
                      handles, portfolio links, and any statements you write.
                    </p>
                  </div>
                  <div className="bg-surface border border-border rounded-sm p-5">
                    <h3 className="text-base font-medium mb-2">
                      Information collected automatically
                    </h3>
                    <p className="text-sm text-muted leading-relaxed">
                      When you visit our website, we may automatically collect
                      technical information including your IP address, browser
                      type and version, pages visited, time and date of visits,
                      and referring website. This is collected via cookies and
                      similar technologies.
                    </p>
                  </div>
                  <div className="bg-surface border border-border rounded-sm p-5">
                    <h3 className="text-base font-medium mb-2">
                      Information from third parties
                    </h3>
                    <p className="text-sm text-muted leading-relaxed">
                      We may receive information about you from third-party
                      sources, such as when you sign up or log in using a
                      third-party service, or when another user refers you to
                      Wallspace.
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <h2 className="text-2xl mb-4">3. How We Use Your Information</h2>
                <p className="text-muted leading-relaxed mb-4">
                  We use your personal information for the following purposes:
                </p>
                <ul className="space-y-2">
                  {[
                    "To process and respond to your artist application or venue enquiry",
                    "To create and manage your account on the platform",
                    "To match artists with venues and facilitate introductions",
                    "To communicate with you about your membership, applications, or enquiries",
                    "To send service-related notifications and updates",
                    "To process payments and manage billing",
                    "To improve and develop our platform and services",
                    "To comply with legal and regulatory obligations",
                    "To detect and prevent fraud or misuse of our services",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2.5 text-sm text-muted">
                      <span className="w-1.5 h-1.5 rounded-full bg-accent mt-1.5 shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
                <p className="text-muted leading-relaxed mt-4">
                  Our legal basis for processing your information is typically
                  contract performance (to provide the service you have
                  requested), legitimate interests (to improve our services and
                  prevent fraud), or compliance with a legal obligation. Where
                  required, we will ask for your consent.
                </p>
              </div>

              <div>
                <h2 className="text-2xl mb-4">4. How We Share Your Information</h2>
                <p className="text-muted leading-relaxed mb-4">
                  We do not sell your personal information. We may share your
                  information in the following circumstances:
                </p>
                <ul className="space-y-2">
                  {[
                    "With venues on the Wallspace platform, where you have applied or given consent to be introduced",
                    "With trusted third-party service providers who help us operate the platform (such as payment processors, email services, and hosting providers), under strict data processing agreements",
                    "With professional advisors such as lawyers and accountants, where necessary",
                    "With law enforcement or regulatory authorities if required by law",
                    "In connection with a merger, acquisition, or sale of business assets, where personal data may be transferred as part of that transaction",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2.5 text-sm text-muted">
                      <span className="w-1.5 h-1.5 rounded-full bg-accent mt-1.5 shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h2 className="text-2xl mb-4">5. Data Retention</h2>
                <p className="text-muted leading-relaxed">
                  We retain your personal information only for as long as
                  necessary to provide our services and fulfil the purposes
                  described in this policy, or as required by law. For example,
                  we retain transaction records for seven years to meet our
                  accounting obligations. If you close your account or withdraw
                  your application, we will delete or anonymise your personal
                  information within 90 days, unless a longer retention period
                  is required by law.
                </p>
              </div>

              <div>
                <h2 className="text-2xl mb-4">6. Your Rights</h2>
                <p className="text-muted leading-relaxed mb-4">
                  Under UK data protection law (UK GDPR and the Data Protection
                  Act 2018), you have the following rights:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    {
                      right: "Right of access",
                      desc: "Request a copy of the personal data we hold about you",
                    },
                    {
                      right: "Right to rectification",
                      desc: "Ask us to correct inaccurate or incomplete data",
                    },
                    {
                      right: "Right to erasure",
                      desc: "Request deletion of your personal data in certain circumstances",
                    },
                    {
                      right: "Right to restriction",
                      desc: "Ask us to limit how we use your data in certain circumstances",
                    },
                    {
                      right: "Right to portability",
                      desc: "Receive your data in a structured, machine-readable format",
                    },
                    {
                      right: "Right to object",
                      desc: "Object to processing based on legitimate interests",
                    },
                  ].map(({ right, desc }) => (
                    <div
                      key={right}
                      className="bg-surface border border-border rounded-sm p-4"
                    >
                      <p className="text-sm font-medium text-foreground mb-1">
                        {right}
                      </p>
                      <p className="text-xs text-muted leading-relaxed">{desc}</p>
                    </div>
                  ))}
                </div>
                <p className="text-muted leading-relaxed mt-4">
                  To exercise any of these rights, please email us at{" "}
                  <a
                    href="mailto:hello@wallspace.co"
                    className="text-accent hover:underline"
                  >
                    hello@wallspace.co
                  </a>
                  . We will respond within 30 days. You also have the right to
                  lodge a complaint with the Information Commissioner&rsquo;s
                  Office (ICO) at{" "}
                  <a
                    href="https://ico.org.uk"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent hover:underline"
                  >
                    ico.org.uk
                  </a>
                  .
                </p>
              </div>

              <div>
                <h2 className="text-2xl mb-4">7. Cookies</h2>
                <p className="text-muted leading-relaxed">
                  We use cookies and similar technologies on our website. For
                  full details of the cookies we use, what they do, and how to
                  control them, please read our{" "}
                  <a href="/cookies" className="text-accent hover:underline">
                    Cookie Policy
                  </a>
                  .
                </p>
              </div>

              <div>
                <h2 className="text-2xl mb-4">8. Security</h2>
                <p className="text-muted leading-relaxed">
                  We take reasonable technical and organisational measures to
                  protect your personal data from unauthorised access, loss, or
                  misuse. These include encrypted connections (HTTPS), access
                  controls, and regular security reviews. However, no method of
                  transmission over the internet is completely secure, and we
                  cannot guarantee absolute security.
                </p>
              </div>

              <div>
                <h2 className="text-2xl mb-4">9. Third-Party Links</h2>
                <p className="text-muted leading-relaxed">
                  Our website may contain links to external websites, social
                  media platforms, and artist portfolios. We are not responsible
                  for the privacy practices of those websites. We encourage you
                  to read the privacy policies of any third-party sites you visit.
                </p>
              </div>

              <div>
                <h2 className="text-2xl mb-4">10. Changes to This Policy</h2>
                <p className="text-muted leading-relaxed">
                  We may update this Privacy Policy from time to time. When we
                  make significant changes, we will notify you by email (if we
                  hold your email address) or by posting a notice on our website.
                  The date at the top of this policy shows when it was last
                  updated.
                </p>
              </div>

              <div>
                <h2 className="text-2xl mb-4">11. Contact Us</h2>
                <p className="text-muted leading-relaxed">
                  If you have questions about this Privacy Policy or how we
                  handle your personal data, please contact us:
                </p>
                <div className="mt-4 bg-surface border border-border rounded-sm p-6">
                  <p className="text-sm text-foreground font-medium">
                    Wallspace Ltd
                  </p>
                  <p className="text-sm text-muted mt-1">London, UK</p>
                  <a
                    href="mailto:hello@wallspace.co"
                    className="text-sm text-accent hover:underline mt-1 block"
                  >
                    hello@wallspace.co
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
