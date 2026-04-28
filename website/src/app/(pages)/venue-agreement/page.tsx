import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Venue Partnership Agreement – Wallplace",
  description: "The partnership agreement between Wallplace and registered venues.",
};

export default function VenueAgreementPage() {
  return (
    <div className="bg-background">
      <section className="py-20 lg:py-24">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="max-w-3xl">
            <h1 className="text-4xl lg:text-5xl mb-4">Venue Partnership Agreement</h1>
            <p className="text-muted leading-relaxed mb-6">Last updated: April 2026</p>

            <div className="bg-surface border border-border rounded-sm p-5 mb-16">
              <p className="text-sm text-muted leading-relaxed">
                <strong className="text-foreground">Note:</strong> Wallplace is the trading name of a business in the process of being incorporated as a limited company in England and Wales. Once incorporated, this document will be updated to reflect the registered company name and number.
              </p>
            </div>

            <p className="text-muted leading-relaxed mb-10">
              This agreement supplements the <Link href="/terms" className="text-accent hover:underline">Platform Terms of Service</Link>. By registering your venue on the Platform, you agree to both this agreement and the Platform Terms.
            </p>

            <div className="space-y-10">

              <div>
                <h2 className="text-2xl mb-4">1. Registration and Eligibility</h2>
                <div className="space-y-3 text-muted leading-relaxed">
                  <p>This agreement takes effect upon your venue registration on the Wallplace platform. You must be authorised to act on behalf of the venue (as owner, manager, or with the owner&rsquo;s permission).</p>
                  <p>Wallplace may approve or decline venue registrations at its discretion.</p>
                </div>
              </div>

              <div>
                <h2 className="text-2xl mb-4">2. No Charges</h2>
                <div className="space-y-3 text-muted leading-relaxed">
                  <p>There are no registration fees, membership fees, commissions, or hidden costs for venues while you maintain an active account. Browsing artist portfolios, submitting enquiries, and displaying artwork are all free.</p>
                  <p>Venues never pay a platform fee. Wallplace's revenue comes from sales commissions and optional artist tools.</p>
                  <p>Wallplace may introduce optional paid features for venues in the future. If so, advance notice of at least 90 days will be given. Existing free services will not be withdrawn without notice.</p>
                </div>
              </div>

              <div>
                <h2 className="text-2xl mb-4">3. Care of Artwork and Bailment</h2>
                <div className="space-y-3 text-muted leading-relaxed">
                  <p>Artwork displayed at your venue remains the property of the artist at all times. You hold each work as bailee on the terms of this agreement and the Loan Consignment Record for that work (see section 4A). You acquire no title, lien, security interest, or right of sale over any artwork.</p>
                  <p>You agree to exercise reasonable care over artwork displayed in your venue, to the same standard as your own property of equivalent value. This includes:</p>
                  <ul className="list-disc pl-6 space-y-1">
                    <li>Displaying artwork in a secure, appropriate location away from hazards such as direct sunlight, moisture, excessive heat, and high-risk areas</li>
                    <li>Ensuring artwork is securely hung or mounted</li>
                    <li>Not moving artwork between locations without notifying the artist or Wallplace</li>
                    <li>Not selling, sub-lending, pledging, or permitting any third party to take possession of the artwork</li>
                    <li>Reporting any damage, loss, or theft to the artist and Wallplace within 48 hours</li>
                  </ul>
                </div>
              </div>

              <div>
                <h2 className="text-2xl mb-4">4A. Loan Consignment Record</h2>
                <div className="space-y-3 text-muted leading-relaxed">
                  <p>Before any artwork is delivered to your venue, the artist will create a Loan Consignment Record on the Platform, which you must review and confirm. Each Loan Consignment Record includes, at minimum:</p>
                  <ul className="list-disc pl-6 space-y-1">
                    <li>Artist and venue names</li>
                    <li>Title(s), medium, dimensions, edition details, and agreed insurance valuation of each work</li>
                    <li>Condition at handover (supported by photographs)</li>
                    <li>Loan start and expected end dates</li>
                    <li>Collection / return arrangements</li>
                    <li>Confirmation that title remains with the artist and that you hold the work as bailee</li>
                    <li>Your confirmation of whether the work is covered under your insurance (see section 5) and, if so, the valuation covered</li>
                  </ul>
                  <p>Your confirmation of the Loan Consignment Record is deemed acknowledgement of the condition, valuation, and terms recorded. If you dispute any detail, you must flag it before or immediately upon receipt of the artwork.</p>
                </div>
              </div>

              <div>
                <h2 className="text-2xl mb-4">4. Damage and Liability</h2>
                <div className="space-y-3 text-muted leading-relaxed">
                  <p>You are liable for damage to artwork caused by:</p>
                  <ul className="list-disc pl-6 space-y-1">
                    <li>Negligence on the part of venue staff, contractors, or agents</li>
                    <li>Failure to exercise the reasonable care described in section 3</li>
                    <li>Deliberate acts by venue staff or persons under your control</li>
                  </ul>
                  <p>You are not liable for damage caused by genuine force majeure events (natural disasters, severe weather, criminal acts by unconnected third parties) provided you took reasonable precautions, or normal wear and tear where artwork was properly cared for.</p>
                  <p>Where damage or loss occurs, you agree to cooperate with the artist and Wallplace to resolve the matter promptly and in good faith. This may include contributing to repair costs or the fair market value of the artwork.</p>
                </div>
              </div>

              <div>
                <h2 className="text-2xl mb-4">5. Insurance</h2>
                <div className="space-y-3 text-muted leading-relaxed">
                  <p>You must hold and maintain public liability insurance appropriate for a commercial venue of your type and size.</p>
                  <p>For each work on loan, you must confirm one of the following on the Loan Consignment Record:</p>
                  <ul className="list-disc pl-6 space-y-1">
                    <li><strong className="text-foreground">Covered:</strong> that the work is covered under your contents / specified-items policy for the agreed valuation for the duration of the loan; or</li>
                    <li><strong className="text-foreground">Not covered:</strong> that the work is not covered by your insurance, in which case the artist remains responsible for insuring the work, and you remain liable for loss or damage attributable to your negligence under section 4.</li>
                  </ul>
                  <p>Your insurance warranty on the Loan Consignment Record is relied upon by the artist and by Wallplace. A false or misleading warranty is a material breach of this agreement.</p>
                  <p>Wallplace may request evidence of insurance at any time.</p>
                </div>
              </div>

              <div>
                <h2 className="text-2xl mb-4">6. Display Requirements</h2>
                <div className="space-y-3 text-muted leading-relaxed">
                  <p>QR labels provided by Wallplace must be clearly visible and unobstructed on or alongside all displayed artwork. Labels must not be removed, covered, or defaced.</p>
                  <p>QR labels enable customers to view artwork details and purchase directly. Removing or obscuring them undermines the partnership and may result in termination of this agreement.</p>
                  <p>Wallplace provides QR labels. Contact Wallplace for replacements if labels are damaged or lost.</p>
                </div>
              </div>

              <div>
                <h2 className="text-2xl mb-4">7. Revenue Share (Optional)</h2>
                <div className="space-y-3 text-muted leading-relaxed">
                  <p>You may agree a Revenue Share arrangement with an artist, where you receive an agreed percentage of the sale price of artwork sold from your premises. This is entirely optional and is not a condition of this partnership.</p>
                  <p>The percentage is agreed directly between you and the artist. A typical range is 5-20%, though this is a recommendation, not a requirement.</p>
                  <p>Revenue Share payments are processed via Stripe Connect at the point of sale. You will need to connect a Stripe account to receive payments.</p>
                </div>
              </div>

              <div>
                <h2 className="text-2xl mb-4">8. No Modification and Respect for Moral Rights</h2>
                <div className="space-y-3 text-muted leading-relaxed">
                  <p>You must not modify, alter, repair, clean, frame, unframe, crop, overlay, deface, or otherwise change any artwork without the express written consent of the artist. If artwork needs attention (cleaning, re-framing, repair), contact the artist or Wallplace.</p>
                  <p>Artists retain moral rights in their work under the Copyright, Designs and Patents Act 1988, including the right to be identified as the author and the right to object to derogatory treatment. You must:</p>
                  <ul className="list-disc pl-6 space-y-1">
                    <li>Keep the Wallplace QR label (which includes the artist&rsquo;s name) visible next to each work;</li>
                    <li>Not display artwork in a manner, location, or context that a reasonable artist would consider prejudicial to their honour or reputation (for example, adjacent to offensive material, used as a prop, or integrated into promotional content without consent);</li>
                    <li>Not photograph or reproduce the work for your own marketing beyond fair incidental inclusion in general venue imagery unless the artist has consented.</li>
                  </ul>
                </div>
              </div>

              <div>
                <h2 className="text-2xl mb-4">9. Staff Responsibilities</h2>
                <div className="space-y-3 text-muted leading-relaxed">
                  <p>Your staff do not need to be art experts or salespeople. The only responsibility is to direct interested customers to the QR label on or near the artwork for information and purchasing.</p>
                  <p>Staff should not negotiate prices, arrange private sales, or share artist contact details outside the Platform.</p>
                </div>
              </div>

              <div>
                <h2 className="text-2xl mb-4">10. Rotation and Refresh</h2>
                <p className="text-muted leading-relaxed">Wallplace may suggest periodic rotation of artwork to keep your space fresh. Any change is subject to your agreement. Wallplace will not change artwork in your venue without your consent. Contact Wallplace if you would like to request different artwork or a rotation schedule.</p>
              </div>

              <div>
                <h2 className="text-2xl mb-4">11. Termination</h2>
                <div className="space-y-3 text-muted leading-relaxed">
                  <p>Either party may terminate this agreement with 30 days&rsquo; written notice.</p>
                  <p>On termination: the artist (or Wallplace on the artist&rsquo;s behalf) will collect artwork within 30 days. You agree to make artwork available for collection during reasonable business hours. Any outstanding Revenue Share payments will be processed.</p>
                  <p>Wallplace may terminate immediately if you breach this agreement or if the venue ceases to operate.</p>
                </div>
              </div>

              <div>
                <h2 className="text-2xl mb-4">12. Exclusivity</h2>
                <p className="text-muted leading-relaxed">This agreement is non-exclusive. You are free to display art from other sources, galleries, or platforms. Artists may display their work in other venues.</p>
              </div>

              <div>
                <h2 className="text-2xl mb-4">13. Liability and Indemnity</h2>
                <div className="space-y-3 text-muted leading-relaxed">
                  <p>Wallplace&rsquo;s liability is limited as set out in section 12 of the <Link href="/terms" className="text-accent hover:underline">Platform Terms of Service</Link>.</p>
                  <p>Wallplace is not liable for the quality, condition, or suitability of any artwork, disputes between you and an artist, or loss of business or revenue related to the display of artwork.</p>
                  <p>You agree to indemnify Wallplace against claims arising from a breach of this agreement or incidents on your premises related to displayed artwork.</p>
                </div>
              </div>

              <div>
                <h2 className="text-2xl mb-4">14. General</h2>
                <div className="space-y-3 text-muted leading-relaxed">
                  <p>This agreement is governed by the laws of England and Wales. The courts of England and Wales have exclusive jurisdiction.</p>
                  <p>This agreement, together with the Platform Terms of Service, Privacy Policy, and Cookie Policy, constitutes the entire agreement between you and Wallplace regarding your use of the Platform as a venue.</p>
                </div>
              </div>

              <div>
                <h2 className="text-2xl mb-4">15. Contact</h2>
                <p className="text-muted leading-relaxed">
                  Wallplace, London, United Kingdom.<br />
                  Email: <a href="mailto:legal@wallplace.co.uk" className="text-accent hover:underline">legal@wallplace.co.uk</a>
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
