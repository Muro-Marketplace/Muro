import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Intellectual Property and Takedown Policy",
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
                <div className="space-y-3 text-muted leading-relaxed">
                  <p>Wallplace respects intellectual property rights. All artists on the platform warrant that they are the sole creators and owners of the work they list. AI-generated artwork is strictly prohibited.</p>
                  <p>In addition to accepting our Artist Agreement at sign-up, artists must confirm an intellectual property warranty at the point of uploading every individual artwork. This upload-time warranty confirms the artist is the sole creator, holds all necessary rights, has not copied or substantially derived the work from a third party&rsquo;s protected work, and is not using AI generation in whole or in part.</p>
                </div>
              </div>

              <div>
                <h2 className="text-2xl mb-4">Reporting Infringement</h2>
                <div className="space-y-3 text-muted leading-relaxed">
                  <p>If you believe that content on Wallplace infringes your intellectual property rights, please contact us at <a href="mailto:legal@wallplace.co.uk" className="text-accent hover:underline">legal@wallplace.co.uk</a> with the subject line &ldquo;IP Takedown Request&rdquo; and the following information:</p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>Your name and contact information</li>
                    <li>A description of the copyrighted work you believe has been infringed, including evidence of your ownership (registration number, publication reference, earlier dated copies, etc.)</li>
                    <li>The URL or location of the infringing content on Wallplace</li>
                    <li>A statement that you have a good faith belief the use is not authorised by the rights holder, its agent, or the law</li>
                    <li>A statement that the information provided is accurate, and under penalty of perjury, that you are the rights holder or authorised to act on the rights holder&rsquo;s behalf</li>
                    <li>Your physical or electronic signature</li>
                  </ul>
                </div>
              </div>

              <div>
                <h2 className="text-2xl mb-4">Our Service Levels</h2>
                <div className="space-y-3 text-muted leading-relaxed">
                  <p>We treat IP complaints as a priority and operate to the following service levels:</p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li><strong className="text-foreground">Acknowledgement:</strong> within 1 business day of receipt.</li>
                    <li><strong className="text-foreground">Initial review and action:</strong> within 24 hours of acknowledgement, we will review the complaint and, where the alleged infringement is clear or credible, immediately remove or restrict access to the content pending full investigation (&ldquo;takedown first, investigate second&rdquo;).</li>
                    <li><strong className="text-foreground">Full investigation and outcome:</strong> typically within 5 business days, including notifying the uploader, inviting a response, and reaching a final determination.</li>
                    <li><strong className="text-foreground">Record-keeping:</strong> every takedown request, our response, the evidence considered, and the outcome is logged and retained for at least 6 years.</li>
                  </ul>
                </div>
              </div>

              <div>
                <h2 className="text-2xl mb-4">Counter-Notice</h2>
                <div className="space-y-3 text-muted leading-relaxed">
                  <p>If your content has been removed and you believe it was done in error, you may submit a counter-notice within 14 days of removal with:</p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li>Your name and contact information</li>
                    <li>Identification of the removed content and the URL where it was displayed</li>
                    <li>A statement under penalty of perjury that you have a good faith belief the content was removed in error or misidentification</li>
                    <li>Evidence supporting your ownership or authorisation (e.g. dated work-in-progress files, contract showing licence, earlier publication)</li>
                    <li>Your consent to the jurisdiction of the courts of England and Wales</li>
                  </ul>
                  <p>Where a counter-notice is received, we will forward it to the original complainant. If they do not commence court proceedings within 14 days, we may restore the content.</p>
                </div>
              </div>

              <div>
                <h2 className="text-2xl mb-4">Repeat Infringers, Three-Strike Policy</h2>
                <div className="space-y-3 text-muted leading-relaxed">
                  <p>Wallplace operates a formal three-strike policy to address repeat infringement:</p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li><strong className="text-foreground">Strike 1:</strong> formal written warning, content removed, upload-time warranty reconfirmation required, and a note placed on the account.</li>
                    <li><strong className="text-foreground">Strike 2:</strong> temporary account suspension of at least 30 days, review of all listings, and removal of any other listings that cannot be independently verified.</li>
                    <li><strong className="text-foreground">Strike 3:</strong> permanent account termination. Outstanding payouts may be withheld pending resolution of any outstanding claims. The account holder will be banned from re-registering on the Platform.</li>
                  </ul>
                  <p>Wallplace may, at its discretion, skip to an earlier or later strike depending on the severity of the infringement, evidence of wilful conduct, or the presence of any court order or ruling.</p>
                </div>
              </div>

              <div>
                <h2 className="text-2xl mb-4">Misuse of the Takedown Process</h2>
                <p className="text-muted leading-relaxed">
                  Submitting a knowingly false takedown notice may give rise to liability under the Defamation Act 2013, the tort of malicious falsehood, or similar laws. Repeat false notices will be disregarded, and we may pursue the sender for any loss caused to Wallplace or to the affected user.
                </p>
              </div>

              <div>
                <h2 className="text-2xl mb-4">Contact</h2>
                <p className="text-muted leading-relaxed">
                  Intellectual property queries: <a href="mailto:legal@wallplace.co.uk" className="text-accent hover:underline">legal@wallplace.co.uk</a>
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
