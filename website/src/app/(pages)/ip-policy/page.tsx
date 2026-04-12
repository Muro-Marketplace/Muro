import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Intellectual Property & Takedown Policy – Wallplace",
  description:
    "Wallplace Intellectual Property & Takedown Policy. How to report infringement and our process for handling IP claims.",
};

export default function IpPolicyPage() {
  return (
    <div className="bg-background">
      <section className="py-20 lg:py-24">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="max-w-3xl">
            <h1 className="text-4xl lg:text-5xl mb-4">Intellectual Property &amp; Takedown Policy</h1>
            <p className="text-muted leading-relaxed mb-16">Last updated: April 2026</p>

            <div className="space-y-10">
              <div>
                <h2 className="text-2xl mb-4">Our Commitment</h2>
                <p className="text-muted leading-relaxed">Wallplace respects intellectual property rights. All artists on the platform warrant that they are the sole creators and owners of the work they list. AI-generated artwork is strictly prohibited.</p>
              </div>

              <div>
                <h2 className="text-2xl mb-4">Reporting Infringement</h2>
                <div className="space-y-3 text-muted leading-relaxed">
                  <p>If you believe that content on Wallplace infringes your intellectual property rights, please contact us at <a href="mailto:hello@wallplace.co" className="text-accent hover:underline">hello@wallplace.co</a> with:</p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>Your name and contact information</li>
                    <li>A description of the copyrighted work you believe has been infringed</li>
                    <li>The URL or location of the infringing content on Wallplace</li>
                    <li>A statement that you have a good faith belief the use is not authorised</li>
                    <li>A statement that the information provided is accurate, under penalty of perjury</li>
                    <li>Your physical or electronic signature</li>
                  </ul>
                </div>
              </div>

              <div>
                <h2 className="text-2xl mb-4">What We Will Do</h2>
                <div className="text-muted leading-relaxed">
                  <ul className="list-disc pl-6 space-y-2">
                    <li>Acknowledge your report within 2 business days</li>
                    <li>Review the reported content promptly</li>
                    <li>If infringement is confirmed: remove the content, notify the uploader, and take appropriate action (which may include account suspension)</li>
                    <li>Notify you of the outcome</li>
                  </ul>
                </div>
              </div>

              <div>
                <h2 className="text-2xl mb-4">Counter-Notice</h2>
                <div className="space-y-3 text-muted leading-relaxed">
                  <p>If your content has been removed and you believe it was done in error, you may submit a counter-notice with:</p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>Your name and contact information</li>
                    <li>Identification of the removed content</li>
                    <li>A statement under penalty of perjury that you have a good faith belief the content was removed in error</li>
                    <li>Your consent to the jurisdiction of the courts of England and Wales</li>
                  </ul>
                </div>
              </div>

              <div>
                <h2 className="text-2xl mb-4">Repeat Infringers</h2>
                <p className="text-muted leading-relaxed">Wallplace may terminate the accounts of users who are found to be repeat infringers.</p>
              </div>

              <div>
                <h2 className="text-2xl mb-4">Contact</h2>
                <p className="text-muted leading-relaxed">
                  Intellectual property queries: <a href="mailto:hello@wallplace.co" className="text-accent hover:underline">hello@wallplace.co</a>
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
