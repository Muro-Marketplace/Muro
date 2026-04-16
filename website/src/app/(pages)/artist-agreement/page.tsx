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
                    <li><strong className="text-foreground">Pro:</strong> &pound;49.99/month, 3% platform fee on sales</li>
                  </ul>
                  <p>Your first month is free on any plan. The first 20 accepted artists receive 6 months free on any plan, for as long as they maintain an active account.</p>
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
                <h2 className="text-2xl mb-4">7. Fulfilment Obligations</h2>
                <div className="space-y-3 text-muted leading-relaxed">
                  <p>You are responsible for fulfilling all orders, including:</p>
                  <ul className="list-disc pl-6 space-y-1">
                    <li>Secure and appropriate packing</li>
                    <li>Shipping within 5 business days of the order (or an alternative timeframe agreed with the buyer)</li>
                    <li>Providing tracking information where available</li>
                    <li>Ensuring the artwork arrives in the condition described in the listing</li>
                  </ul>
                  <p>If a buyer exercises their 14-day cancellation right, you must process a refund within 14 days of receiving the returned artwork.</p>
                  <p>Damage resulting from inadequate packing is your responsibility.</p>
                </div>
              </div>

              <div>
                <h2 className="text-2xl mb-4">8. Free Loan Arrangements</h2>
                <div className="space-y-3 text-muted leading-relaxed">
                  <p>You may lend artwork to a venue at no cost (a &ldquo;Free Loan&rdquo;). The specific terms of each Free Loan are agreed directly between you and the venue, facilitated by Wallplace.</p>
                  <p>Artwork remains your property throughout the loan period. The venue is expected to exercise reasonable care. You are responsible for insuring your artwork during the loan period. Wallplace is not liable for damage, loss, or theft during a Free Loan.</p>
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
