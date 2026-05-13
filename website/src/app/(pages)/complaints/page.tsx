import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Complaints Policy",
  description:
    "Wallplace Complaints Policy. How to raise a complaint, how we respond, and what to do if you are not satisfied.",
};

export default function ComplaintsPage() {
  return (
    <div className="bg-background">
      <section className="py-20 lg:py-24">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="max-w-3xl">
            <h1 className="text-4xl lg:text-5xl mb-4">Complaints Policy</h1>
            <p className="text-muted leading-relaxed mb-16">Last updated: April 2026</p>

            <div className="space-y-10">
              <div>
                <h2 className="text-2xl mb-4">Our Commitment</h2>
                <p className="text-muted leading-relaxed">
                  We take every complaint seriously. This policy sets out how to raise a complaint with Wallplace, how we will respond, and what you can do if you remain dissatisfied. It applies to complaints from buyers, artists, venues, and other users of the Platform.
                </p>
              </div>

              <div>
                <h2 className="text-2xl mb-4">How to Raise a Complaint</h2>
                <div className="space-y-3 text-muted leading-relaxed">
                  <p>Please contact us by any of the following routes:</p>
                  <ul className="list-disc pl-6 space-y-1">
                    <li>Email: <a href="mailto:complaints@wallplace.co.uk" className="text-accent hover:underline">complaints@wallplace.co.uk</a></li>
                    <li>Your account dashboard (Disputes / Request Refund)</li>
                    <li>Post: Wallplace, London, United Kingdom (please email us first for a postal address if you wish to write to us)</li>
                  </ul>
                  <p>To help us investigate, please include your order number or account email, a clear description of the issue, the outcome you are seeking, and any supporting evidence (photographs, messages, tracking information).</p>
                </div>
              </div>

              <div>
                <h2 className="text-2xl mb-4">Our Response</h2>
                <div className="space-y-3 text-muted leading-relaxed">
                  <ul className="list-disc pl-6 space-y-2">
                    <li><strong className="text-foreground">Acknowledgement:</strong> within 2 business days of receiving your complaint.</li>
                    <li><strong className="text-foreground">Investigation:</strong> we will review the available evidence and contact any other parties involved. We aim to complete our investigation within 10 business days. Complex cases may take longer, in which case we will keep you informed.</li>
                    <li><strong className="text-foreground">Resolution:</strong> we will propose a resolution, which may include a refund, replacement, apology, mediation, or other remedy appropriate to the circumstances.</li>
                    <li><strong className="text-foreground">Record:</strong> we will keep a written record of every complaint, our investigation, and the outcome for at least 6 years.</li>
                  </ul>
                </div>
              </div>

              <div>
                <h2 className="text-2xl mb-4">If You Are Not Satisfied</h2>
                <div className="space-y-3 text-muted leading-relaxed">
                  <p>If you are not satisfied with our response, you have the following escalation routes:</p>
                  <ul className="list-disc pl-6 space-y-2">
                    <li><strong className="text-foreground">Senior review:</strong> you may request a senior review within 14 days of our initial decision. Email <a href="mailto:complaints@wallplace.co.uk" className="text-accent hover:underline">complaints@wallplace.co.uk</a> with the subject line &ldquo;Senior Review Request&rdquo; and your case reference.</li>
                    <li><strong className="text-foreground">Independent guidance:</strong> Citizens Advice (<a href="https://www.citizensadvice.org.uk" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">citizensadvice.org.uk</a>) offers free, impartial consumer advice.</li>
                    <li><strong className="text-foreground">Alternative Dispute Resolution (ADR):</strong> you may refer your complaint to the Centre for Effective Dispute Resolution (<a href="https://www.cedr.com" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">cedr.com</a>), a certified ADR provider. Wallplace is <strong>not currently a member</strong> of CEDR; it is named here as an available ADR body in accordance with the Alternative Dispute Resolution for Consumer Disputes Regulations 2015. CEDR may charge a fee for their service and may decline to take on a case where Wallplace is not a member.</li>
                    <li><strong className="text-foreground">Information Commissioner&rsquo;s Office (ICO):</strong> complaints relating to how we handle your personal data can be raised with the ICO at <a href="https://ico.org.uk" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">ico.org.uk</a>.</li>
                    <li><strong className="text-foreground">Trading Standards:</strong> your local Trading Standards service can investigate unfair trading practices.</li>
                    <li><strong className="text-foreground">Courts:</strong> you may take legal action through the courts of England and Wales. Nothing in this policy limits your statutory rights.</li>
                  </ul>
                </div>
              </div>

              <div>
                <h2 className="text-2xl mb-4">Intellectual Property Complaints</h2>
                <p className="text-muted leading-relaxed">
                  Complaints about infringement of intellectual property rights are handled under our <Link href="/ip-policy" className="text-accent hover:underline">Intellectual Property &amp; Takedown Policy</Link>. We aim to acknowledge IP complaints within 1 business day and act on verified claims within 24 hours.
                </p>
              </div>

              <div>
                <h2 className="text-2xl mb-4">Data Protection Complaints</h2>
                <p className="text-muted leading-relaxed">
                  Complaints about how we handle your personal data are handled under our <Link href="/privacy" className="text-accent hover:underline">Privacy Policy</Link>. You also have the right to complain directly to the Information Commissioner&rsquo;s Office.
                </p>
              </div>

              <div>
                <h2 className="text-2xl mb-4">Changes to This Policy</h2>
                <p className="text-muted leading-relaxed">
                  We may update this policy from time to time. The date at the top indicates when it was last revised.
                </p>
              </div>

              <div>
                <h2 className="text-2xl mb-4">Contact</h2>
                <p className="text-muted leading-relaxed">
                  Wallplace, London, United Kingdom.<br />
                  Email: <a href="mailto:complaints@wallplace.co.uk" className="text-accent hover:underline">complaints@wallplace.co.uk</a>
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
