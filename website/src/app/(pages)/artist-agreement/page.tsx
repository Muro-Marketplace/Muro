import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Artist Agreement – Wallplace",
  description: "The agreement between Wallplace and artists accepted onto the platform.",
};

export default function ArtistAgreementPage() {
  return (
    <div className="bg-background">
      <section className="py-20 lg:py-24">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="max-w-3xl">
            <h1 className="text-4xl lg:text-5xl mb-4">Artist Agreement</h1>
            <p className="text-muted leading-relaxed mb-6">Last updated: April 2026</p>

            <div className="bg-surface border border-border rounded-sm p-5 mb-16">
              <p className="text-sm text-muted leading-relaxed">
                <strong className="text-foreground">Note:</strong> Wallplace is the trading name of a business in the process of being incorporated as a limited company in England and Wales. Once incorporated, this document will be updated to reflect the registered company name and number.
              </p>
            </div>

            <p className="text-muted leading-relaxed mb-10">
              This agreement supplements the <Link href="/terms" className="text-accent hover:underline">Platform Terms of Service</Link>. By accepting your place on the Platform, you agree to both this agreement and the Platform Terms.
            </p>

            <div className="space-y-10">

              <div>
                <h2 className="text-2xl mb-4">1. Acceptance and Eligibility</h2>
                <div className="space-y-3 text-muted leading-relaxed">
                  <p>This agreement takes effect upon your acceptance onto the Wallplace platform. You must be at least 18 years old. Acceptance is at Wallplace&rsquo;s sole discretion, based on the quality, originality, consistency, and commercial suitability of your work.</p>
                  <p>Wallplace reserves the right to decline or revoke acceptance at any time.</p>
                </div>
              </div>

              <div>
                <h2 className="text-2xl mb-4">2. Membership Plans and Billing</h2>
                <div className="space-y-3 text-muted leading-relaxed">
                  <p>You must select one of the following membership plans:</p>
                  <ul className="list-disc pl-6 space-y-1">
                    <li><strong className="text-foreground">Core:</strong> &pound;9.99/month, 15% platform fee on sales</li>
                    <li><strong className="text-foreground">Premium:</strong> &pound;24.99/month, 8% platform fee on sales</li>
                    <li><strong className="text-foreground">Pro:</strong> &pound;49.99/month, 5% platform fee on sales</li>
                  </ul>
                  <p>Your first month is free on any plan. No commitment required during the trial period.</p>
                  <p>Membership is billed monthly via Stripe. Upgrades are prorated. Downgrades take effect at the next billing period. Wallplace may change pricing with 30 days&rsquo; notice. Existing subscriptions are honoured until the next renewal after the notice period.</p>
                </div>
              </div>

              <div>
                <h2 className="text-2xl mb-4">3. Platform Fee on Sales</h2>
                <div className="space-y-3 text-muted leading-relaxed">
                  <p>The platform fee is deducted automatically via Stripe Connect at the point of each sale. You receive the sale price minus the platform fee applicable to your plan.</p>
                  <p>Platform fees are non-refundable once a sale is completed, except where the buyer exercises their statutory right of cancellation, in which case the fee is reversed.</p>
                </div>
              </div>

              <div>
                <h2 className="text-2xl mb-4">4. Portfolio Obligations</h2>
                <div className="space-y-3 text-muted leading-relaxed">
                  <p>You must provide accurate, truthful descriptions for all listed artwork, including title, medium, dimensions, price, and condition.</p>
                  <p>Photographs must be genuine images of the actual artwork. Stock photos, digital alterations that misrepresent the work, or images of others&rsquo; work are prohibited.</p>
                  <p>You must keep your portfolio current. Update or remove listings for sold, damaged, or unavailable work promptly. Wallplace may remove non-compliant listings without notice.</p>
                </div>
              </div>

              <div>
                <h2 className="text-2xl mb-4">5. Intellectual Property Warranty</h2>
                <div className="space-y-3 text-muted leading-relaxed">
                  <p>You warrant that you are the sole creator and owner of all artwork you list, or that you hold all necessary rights to list and sell it.</p>
                  <p>You warrant that your artwork does not infringe the intellectual property rights of any third party.</p>
                  <p>You warrant that your artwork is not AI-generated, in whole or in part. This includes work created using tools such as DALL-E, Midjourney, Stable Diffusion, or similar, even if subsequently modified by hand.</p>
                  <p>You agree to indemnify Wallplace against any claims arising from a breach of these warranties.</p>
                </div>
              </div>

              <div>
                <h2 className="text-2xl mb-4">6. Licence Grant to Wallplace</h2>
                <div className="space-y-3 text-muted leading-relaxed">
                  <p>You grant Wallplace a non-exclusive, worldwide, royalty-free licence to use, display, reproduce, and distribute images of your artwork for:</p>
                  <ul className="list-disc pl-6 space-y-1">
                    <li>Platform display, search results, and venue catalogues</li>
                    <li>Marketing and promotion, including social media, newsletters, press, and advertising</li>
                    <li>Thumbnails, previews, and printed materials</li>
                  </ul>
                  <p>This licence does not transfer ownership. You retain full copyright at all times. The licence continues while your artwork is listed on the Platform, plus a 90-day wind-down period after removal to allow for cache clearing and marketing material updates.</p>
                </div>
              </div>

              <div>
                <h2 className="text-2xl mb-4">6A. Moral Rights</h2>
                <div className="space-y-3 text-muted leading-relaxed">
                  <p>You retain all moral rights in your artwork under the Copyright, Designs and Patents Act 1988, including the right to be identified as the author (section 77) and the right to object to derogatory treatment of the work (section 80).</p>
                  <p>Wallplace will credit you as the artist wherever your work is displayed on the Platform or used in marketing. We will not materially alter, distort, or mutilate images of your work. Reasonable technical adjustments (cropping for thumbnails or cards, colour calibration, resizing, compression, watermarking, and overlay of platform UI) are permitted, and you assert such adjustments are not derogatory treatment.</p>
                  <p>Venues must display your work in its original form without alteration, framing changes (except those you approve), or presentation in a context that a reasonable artist would consider derogatory. If you believe your moral rights have been breached by a venue, contact us at <a href="mailto:hello@wallplace.co.uk" className="text-accent hover:underline">hello@wallplace.co.uk</a> and we will investigate under our <Link href="/complaints" className="text-accent hover:underline">Complaints Policy</Link>.</p>
                </div>
              </div>

              <div>
                <h2 className="text-2xl mb-4">7. Fulfilment Obligations</h2>
                <div className="space-y-3 text-muted leading-relaxed">
                  <p>You are responsible for fulfilling all orders, including:</p>
                  <ul className="list-disc pl-6 space-y-1">
                    <li>Secure and appropriate packing</li>
                    <li>Shipping within 5 business days of the order (or an alternative timeframe agreed with the buyer)</li>
                    <li>Providing tracking information where available</li>
                    <li>Ensuring the artwork arrives in the condition described in the listing</li>
                    <li>Responding to buyer queries and refund / cancellation requests within 7 days</li>
                  </ul>
                  <p>If a buyer exercises their 14-day cancellation right, you must process a refund within 14 days of receiving the returned artwork.</p>
                  <p>Damage resulting from inadequate packing is your responsibility.</p>
                  <p><strong className="text-foreground">Seller identification:</strong> You are the seller of record for every transaction. Wallplace will disclose your trading name and a platform-mediated contact route to the buyer on the listing page, at checkout, and in the order confirmation, in line with the Consumer Contracts Regulations 2013.</p>
                  <p><strong className="text-foreground">Refund-on-behalf / payout set-off:</strong> If you fail to respond to a legitimate refund, cancellation, or damaged-in-transit request within 7 days, or if you are otherwise unresponsive, Wallplace may, at its discretion and acting as your agent, issue a refund to the buyer on your behalf. You irrevocably authorise Wallplace to recover the refunded amount (plus any associated payment-processor fees) by deducting it from your next payout(s), or by raising an invoice payable within 14 days. This clause is reasonable and proportionate, protects buyers&rsquo; statutory rights, and does not affect your right to dispute the refund afterwards under our <Link href="/complaints" className="text-accent hover:underline">Complaints Policy</Link>.</p>
                </div>
              </div>

              <div>
                <h2 className="text-2xl mb-4">8. Paid Loan Arrangements and Consignment Record</h2>
                <div className="space-y-3 text-muted leading-relaxed">
                  <p>You may lend artwork to a venue for an agreed loan fee (a &ldquo;Paid Loan&rdquo;). The loan fee and specific terms of each Paid Loan are agreed directly between you and the venue, facilitated by Wallplace.</p>
                  <p>Artwork remains your property throughout the loan period (title does not pass to the venue). Each Paid Loan must be recorded on the Platform as a &ldquo;Loan Consignment Record&rdquo; before the artwork leaves your possession. The Loan Consignment Record must include, at minimum:</p>
                  <ul className="list-disc pl-6 space-y-1">
                    <li>Artist name and venue name</li>
                    <li>Title(s), medium, dimensions, edition details, and agreed insurance valuation of each artwork</li>
                    <li>Condition at handover (supported by photographs)</li>
                    <li>Loan start date and expected loan end date</li>
                    <li>Agreed loan fee and payment schedule</li>
                    <li>Collection / return arrangements</li>
                    <li>Confirmation that title remains with the artist and that the venue holds the work as bailee</li>
                    <li>Confirmation of the venue&rsquo;s insurance position</li>
                  </ul>
                  <p>The venue is expected to exercise reasonable care as bailee and must not sell, lend on, alter, reframe (beyond what you have approved), or move the artwork off-site without your written consent.</p>
                  <p>Loan fees are processed via Stripe Connect after any applicable platform fee has been deducted. You are responsible for insuring your artwork during the loan period unless the venue has provided a written insurance warranty confirming the work is covered on its policy for the agreed valuation. Wallplace is not an insurer and is not liable for damage, loss, or theft during a Paid Loan.</p>
                </div>
              </div>

              <div>
                <h2 className="text-2xl mb-4">9. Revenue Share Arrangements</h2>
                <div className="space-y-3 text-muted leading-relaxed">
                  <p>You may agree a Revenue Share with a venue, where the venue receives a percentage of the sale price of artwork sold from their premises. The percentage is agreed directly between you and the venue.</p>
                  <p>Revenue Share payments are processed via Stripe Connect after the platform fee has been deducted.</p>
                  <p><strong className="text-foreground">Example:</strong> &pound;500 sale, 8% platform fee (Premium plan), 10% venue share. Platform fee = &pound;40. Venue share = &pound;46 (10% of &pound;460). You receive &pound;414.</p>
                </div>
              </div>

              <div>
                <h2 className="text-2xl mb-4">10. Direct Purchase</h2>
                <p className="text-muted leading-relaxed">Artwork may be purchased at the listed price by any buyer. The platform fee applicable to your plan is deducted at point of sale. The contract of sale is between you and the buyer.</p>
              </div>

              <div>
                <h2 className="text-2xl mb-4">11. Insurance</h2>
                <div className="space-y-3 text-muted leading-relaxed">
                  <p>You are responsible for insuring your own artwork, both in transit and while on display in venues. Wallplace does not provide artwork insurance.</p>
                  <p>We strongly encourage you to hold insurance cover for the full value of your portfolio, including periods when work is on loan to venues.</p>
                </div>
              </div>

              <div>
                <h2 className="text-2xl mb-4">12. Quality Standards</h2>
                <div className="space-y-3 text-muted leading-relaxed">
                  <p>All work listed on the Platform must be original, created by the listed artist. AI-generated artwork is strictly prohibited, including work created using AI tools even if subsequently modified by hand.</p>
                  <p>Wallplace may request proof of originality at any time. Mass-produced, drop-shipped, or misattributed work is prohibited.</p>
                </div>
              </div>

              <div>
                <h2 className="text-2xl mb-4">13. Removal and Suspension</h2>
                <div className="space-y-3 text-muted leading-relaxed">
                  <p>Wallplace may remove listings or suspend your account for breach of this agreement, quality failures, credible intellectual property complaints, fulfilment failures, or conduct that brings the Platform into disrepute.</p>
                  <p>Where possible, Wallplace will provide notice and an opportunity to remedy the issue before taking action. Immediate suspension may occur for serious breaches.</p>
                </div>
              </div>

              <div>
                <h2 className="text-2xl mb-4">14. Cancellation</h2>
                <div className="space-y-3 text-muted leading-relaxed">
                  <p>You may cancel your membership at any time with 30 days&rsquo; written notice (email to <a href="mailto:hello@wallplace.co.uk" className="text-accent hover:underline">hello@wallplace.co.uk</a> or via your account settings).</p>
                  <p>Your membership remains active until the end of the notice period. No refund is given for the remaining billing period.</p>
                  <p>You must collect all artwork from venues within 30 days of your cancellation date. If artwork remains uncollected after 60 days, Wallplace may arrange return at your cost or store the artwork at your risk and cost.</p>
                  <p>Your profile and listings will be removed from the Platform. Outstanding payments will be processed within 30 days of cancellation.</p>
                </div>
              </div>

              <div>
                <h2 className="text-2xl mb-4">15. Contact</h2>
                <p className="text-muted leading-relaxed">
                  Wallplace, London, United Kingdom.<br />
                  Email: <a href="mailto:hello@wallplace.co.uk" className="text-accent hover:underline">hello@wallplace.co.uk</a>
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
