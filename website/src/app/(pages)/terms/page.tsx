import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service – Wallplace",
  description:
    "Wallplace Platform Terms of Service. The rules and obligations governing use of the Wallplace marketplace.",
};

export default function TermsPage() {
  return (
    <div className="bg-background">
      <section className="py-20 lg:py-24">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="max-w-3xl">
            <h1 className="text-4xl lg:text-5xl mb-4">Terms of Service</h1>
            <p className="text-muted leading-relaxed mb-6">Last updated: April 2026</p>

            <div className="bg-surface border border-border rounded-sm p-5 mb-16">
              <p className="text-sm text-muted leading-relaxed">
                <strong className="text-foreground">Note:</strong> Wallplace is the trading name of a business in the process of being incorporated as a limited company in England and Wales. References to &ldquo;Wallplace&rdquo; throughout this document refer to the business operating under this trading name. Once incorporated, this document will be updated to reflect the registered company name and number.
              </p>
            </div>

            <div className="space-y-10">
              <div>
                <h2 className="text-2xl mb-4">1. About These Terms</h2>
                <div className="space-y-3 text-muted leading-relaxed">
                  <p>These terms govern your use of wallplace.co.uk and the Wallplace platform (the &ldquo;Platform&rdquo;). By creating an account or using the Platform, you agree to be bound by these terms.</p>
                  <p>Wallplace is a marketplace and platform. It facilitates connections between artists, venues, and buyers. <strong className="text-foreground">Wallplace is not a seller, and is not a party to any contract of sale between an artist and a buyer.</strong></p>
                  <p>These terms should be read alongside our <Link href="/privacy" className="text-accent hover:underline">Privacy Policy</Link>, <Link href="/cookies" className="text-accent hover:underline">Cookie Policy</Link>, <Link href="/artist-agreement" className="text-accent hover:underline">Artist Agreement</Link>, and <Link href="/venue-agreement" className="text-accent hover:underline">Venue Partnership Agreement</Link>.</p>
                </div>
              </div>

              <div>
                <h2 className="text-2xl mb-4">2. Definitions</h2>
                <div className="space-y-2 text-muted leading-relaxed">
                  <p><strong className="text-foreground">Platform</strong> means the Wallplace website, services, and tools.</p>
                  <p><strong className="text-foreground">Artist</strong> means a user accepted onto the Platform to list and sell artwork.</p>
                  <p><strong className="text-foreground">Venue</strong> means a commercial premises registered on the Platform to browse and display artwork.</p>
                  <p><strong className="text-foreground">Buyer</strong> means any person who purchases artwork through the Platform.</p>
                  <p><strong className="text-foreground">Artwork</strong> means any original creative work listed on the Platform.</p>
                  <p><strong className="text-foreground">Paid Loan</strong> means an arrangement where an artist lends artwork to a venue for an agreed loan fee, with the artwork remaining the artist&rsquo;s property throughout the loan period.</p>
                  <p><strong className="text-foreground">Revenue Share</strong> means an arrangement where a venue receives an agreed percentage of sales from artwork displayed on their premises.</p>
                  <p><strong className="text-foreground">Direct Purchase</strong> means a transaction where a buyer purchases artwork outright.</p>
                  <p><strong className="text-foreground">QR Label</strong> means the scannable label placed alongside displayed artwork, linking to the artwork&rsquo;s listing on the Platform.</p>
                </div>
              </div>

              <div>
                <h2 className="text-2xl mb-4">3. The Wallplace Platform</h2>
                <div className="space-y-3 text-muted leading-relaxed">
                  <p>Wallplace connects artists with commercial venues such as cafes, restaurants, hotels, offices, and bars. The Platform enables artists to showcase their work and enables venues to discover and source original artwork.</p>
                  <p>Wallplace is not a party to any sale. The contract of sale is directly between the artist and the buyer. Wallplace facilitates the connection and provides payment infrastructure, but does not manufacture, store, inspect, or ship artwork.</p>
                  <p>Wallplace does not hold buyer funds. Payments are processed and distributed via Stripe Connect, a third-party payment service.</p>
                  <p>Wallplace curates artist applications but does not guarantee placement in any venue. Wallplace is not responsible for the quality, safety, legality, or suitability of any artwork listed on the Platform.</p>
                </div>
              </div>

              <div>
                <h2 className="text-2xl mb-4">4. Account Registration</h2>
                <div className="space-y-3 text-muted leading-relaxed">
                  <p>You must be at least 18 years old to create an account. You must provide accurate, complete, and current information during registration and keep it updated.</p>
                  <p>You are responsible for maintaining the security of your account and for all activity that occurs under it. You must notify Wallplace immediately if you suspect unauthorised access.</p>
                  <p>One account per person or entity. Wallplace may refuse or revoke accounts at its discretion.</p>
                </div>
              </div>

              <div>
                <h2 className="text-2xl mb-4">5. Artist-Specific Terms</h2>
                <div className="space-y-3 text-muted leading-relaxed">
                  <p>Artists must be accepted through the application process, which is at the sole discretion of Wallplace. Acceptance is based on quality, originality, consistency, and commercial suitability.</p>
                  <p>Accepted artists must select a membership plan with associated monthly fees and platform fees on sales, as detailed on the <Link href="/pricing" className="text-accent hover:underline">Pricing</Link> page.</p>
                  <p>Artists must maintain accurate portfolio listings with genuine photographs of their own work. Artists grant Wallplace a non-exclusive, royalty-free licence to display and use artwork images for Platform operation and marketing. Full copyright and ownership is retained by the artist at all times.</p>
                  <p>Artists are responsible for fulfilment of all orders, including packing, shipping, and delivery.</p>
                  <p>Full artist obligations are set out in the <Link href="/artist-agreement" className="text-accent hover:underline">Artist Agreement</Link>.</p>
                </div>
              </div>

              <div>
                <h2 className="text-2xl mb-4">6. Venue-Specific Terms</h2>
                <div className="space-y-3 text-muted leading-relaxed">
                  <p>Venues may register and use the Platform at no cost. There are no registration fees, membership fees, commissions, or hidden charges while you maintain an active account.</p>
                  <p>Venues must exercise reasonable care over displayed artwork, to the same standard as their own property of equivalent value. Venues are liable for damage caused by the negligence of venue staff, contractors, or agents.</p>
                  <p>Venues must hold appropriate public liability insurance. QR labels must remain clearly visible and unobstructed on all displayed artwork.</p>
                  <p>Full venue obligations are set out in the <Link href="/venue-agreement" className="text-accent hover:underline">Venue Partnership Agreement</Link>.</p>
                </div>
              </div>

              <div>
                <h2 className="text-2xl mb-4">7. Buyer Terms</h2>
                <div className="space-y-3 text-muted leading-relaxed">
                  <p>Buyers may purchase artwork by scanning QR labels on displayed artwork or by browsing the Platform directly. The contract of sale is between the buyer and the artist. Wallplace is not the seller.</p>
                  <p>Prices are displayed in GBP. Payment is processed via Stripe. Wallplace does not hold buyer funds at any point.</p>
                  <p><strong className="text-foreground">Cooling-off period:</strong> Under the Consumer Contracts (Information, Cancellation and Additional Charges) Regulations 2013, you have a 14-day cooling-off period for online purchases, except for bespoke or personalised artwork. To cancel, notify the artist within 14 days of receiving the artwork. Return the artwork in its original condition at your own cost (unless faulty). The artist will issue a refund within 14 days of receiving the returned artwork.</p>
                  <p><strong className="text-foreground">Faulty or misdescribed goods:</strong> You have additional rights under the Consumer Rights Act 2015, including the right to repair, replacement, or refund for goods that are faulty or not as described.</p>
                  <p><strong className="text-foreground">Seller information:</strong> The seller for each order is the individual artist, not Wallplace. The artist&rsquo;s trading name and contact route are disclosed on every listing page and in your order confirmation, as required under the Consumer Contracts (Information, Cancellation and Additional Charges) Regulations 2013.</p>
                  <p><strong className="text-foreground">If an artist becomes unresponsive:</strong> Where an artist fails to respond to a legitimate refund or return request within 7 days, Wallplace may, at its discretion, issue a refund to you on the artist&rsquo;s behalf and recover that amount from future payouts owed to the artist. This is a goodwill measure and does not make Wallplace a party to the contract of sale.</p>
                </div>
              </div>

              <div>
                <h2 className="text-2xl mb-4">8. Payment Processing</h2>
                <div className="space-y-3 text-muted leading-relaxed">
                  <p>All payments are processed through Stripe and Stripe Connect. Wallplace does not hold, process, or have access to buyer payment details.</p>
                  <p>Artist membership fees are billed monthly via Stripe. Platform fees are deducted automatically at the point of each transaction via Stripe Connect.</p>
                  <p>Wallplace is not responsible for payment failures, delays, or errors caused by Stripe or any payment provider.</p>
                </div>
              </div>

              <div>
                <h2 className="text-2xl mb-4">9. Content and Intellectual Property</h2>
                <div className="space-y-3 text-muted leading-relaxed">
                  <p>Artists retain full copyright and ownership of their work at all times. By listing artwork on the Platform, artists grant Wallplace a non-exclusive, worldwide, royalty-free licence to use, display, and reproduce artwork images for Platform operation and marketing. This licence continues while the artwork is listed, plus a 90-day wind-down period after removal.</p>
                  <p><strong className="text-foreground">Prohibited content:</strong></p>
                  <ul className="list-disc pl-6 space-y-1">
                    <li>Work that infringes the intellectual property rights of others</li>
                    <li>AI-generated artwork, in whole or in part</li>
                    <li>Obscene, offensive, defamatory, or unlawful material</li>
                    <li>Fraudulent or misleading content</li>
                  </ul>
                  <p>Wallplace branding, logos, and original Platform content are the property of Wallplace and may not be used without permission.</p>
                </div>
              </div>

              <div>
                <h2 className="text-2xl mb-4">10. Prohibited Conduct</h2>
                <div className="text-muted leading-relaxed">
                  <p className="mb-3">You must not:</p>
                  <ul className="list-disc pl-6 space-y-1">
                    <li>Use the Platform for any unlawful purpose</li>
                    <li>List AI-generated art or work you do not own</li>
                    <li>Misrepresent yourself, your work, or your venue</li>
                    <li>Circumvent the Platform to avoid fees after an introduction has been made (see section 10A: Non-Circumvention)</li>
                    <li>Interfere with Platform operation or security</li>
                    <li>Scrape, harvest, or collect data from the Platform</li>
                    <li>Harass, threaten, or abuse other users</li>
                  </ul>
                </div>
              </div>

              <div>
                <h2 className="text-2xl mb-4">10A. Non-Circumvention</h2>
                <div className="space-y-3 text-muted leading-relaxed">
                  <p>The Platform&rsquo;s value depends on transactions occurring through it. To protect that value, the following non-circumvention obligation applies to artists and venues.</p>
                  <p><strong className="text-foreground">Introduction Period:</strong> For 24 months from the date an artist and a venue first communicate through the Platform (the &ldquo;Introduction Period&rdquo;), any sale, commission, loan, display arrangement, or revenue-share arrangement between that artist and that venue (or any group company, connected person, successor, or affiliate of either) must be transacted and recorded through the Platform.</p>
                  <p><strong className="text-foreground">Prohibited conduct during the Introduction Period includes:</strong></p>
                  <ul className="list-disc pl-6 space-y-1">
                    <li>Arranging off-platform sales, commissions, or loans to avoid Platform fees</li>
                    <li>Soliciting another user&rsquo;s contact details for the purpose of transacting off-platform</li>
                    <li>Encouraging a buyer to cancel an on-platform order and re-purchase privately</li>
                  </ul>
                  <p><strong className="text-foreground">Liquidated damages:</strong> The parties agree that quantifying loss from circumvention is difficult. As a genuine pre-estimate of Wallplace&rsquo;s loss, breach of this clause entitles Wallplace to recover from the breaching party liquidated damages equal to the platform fee Wallplace would have earned on the circumvented transaction at the breaching party&rsquo;s applicable fee rate, subject to a minimum of &pound;150 per circumvented transaction. This amount represents a reasonable pre-estimate of loss and is not a penalty. Wallplace may set this amount off against future payouts or invoice for it directly.</p>
                  <p><strong className="text-foreground">What is permitted:</strong> Post-Introduction-Period dealings are unrestricted. Artists and venues who discover each other independently of the Platform (e.g. through pre-existing relationships, unrelated introductions, or public directories) are not bound by this clause in respect of that independent relationship, provided they can demonstrate independence on request.</p>
                </div>
              </div>

              <div>
                <h2 className="text-2xl mb-4">11. Dispute Resolution</h2>
                <div className="space-y-3 text-muted leading-relaxed">
                  <p>Wallplace encourages all parties to resolve disputes directly. Where this is not possible, the following process applies:</p>

                  <div className="space-y-4 mt-4">
                    <div>
                      <h3 className="text-base font-medium text-foreground mb-1">Step 1 : Raise a Dispute</h3>
                      <p>Contact <a href="mailto:hello@wallplace.co.uk" className="text-accent hover:underline">hello@wallplace.co.uk</a> with your order number, the nature of the dispute, and any supporting evidence (photographs, messages, tracking information). You may also raise a dispute through your account dashboard.</p>
                    </div>

                    <div>
                      <h3 className="text-base font-medium text-foreground mb-1">Step 2 : Acknowledgement</h3>
                      <p>Wallplace will acknowledge your dispute within 2 business days and assign a case reference.</p>
                    </div>

                    <div>
                      <h3 className="text-base font-medium text-foreground mb-1">Step 3 : Investigation</h3>
                      <p>We will review the available evidence, contact the other party, and request any additional information needed. We aim to complete our investigation within 10 business days.</p>
                    </div>

                    <div>
                      <h3 className="text-base font-medium text-foreground mb-1">Step 4 : Resolution</h3>
                      <p>Wallplace will propose a resolution, which may include a full or partial refund, replacement, or other remedy. Both parties will be notified of the outcome.</p>
                    </div>

                    <div>
                      <h3 className="text-base font-medium text-foreground mb-1">Step 5 : Escalation</h3>
                      <p className="mb-2">If you are not satisfied with the resolution, you may:</p>
                      <ul className="list-disc pl-6 space-y-1">
                        <li>Request a senior review within 14 days of the decision</li>
                        <li>Contact Citizens Advice (<a href="https://www.citizensadvice.org.uk" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">citizensadvice.org.uk</a>) for independent guidance</li>
                        <li>Refer the complaint to the Centre for Effective Dispute Resolution (<a href="https://www.cedr.com" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">cedr.com</a>), a certified ADR provider. Wallplace is not currently a member of CEDR, but CEDR is named here as an available alternative dispute resolution body as required by the Alternative Dispute Resolution for Consumer Disputes Regulations 2015.</li>
                        <li>Take legal action through the courts of England and Wales</li>
                      </ul>
                    </div>
                  </div>

                  <p>A full formal complaints process is set out in our <Link href="/complaints" className="text-accent hover:underline">Complaints Policy</Link>.</p>
                  <p>Wallplace acts as a facilitator, not an arbitrator. Nothing in this section affects your statutory consumer rights under the Consumer Rights Act 2015 or the Consumer Contracts Regulations 2013.</p>
                </div>
              </div>

              <div>
                <h2 className="text-2xl mb-4">12. Limitation of Liability</h2>
                <div className="space-y-3 text-muted leading-relaxed">
                  <p>The Platform is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;. Wallplace excludes all warranties to the maximum extent permitted by law.</p>
                  <p>Wallplace is not liable for:</p>
                  <ul className="list-disc pl-6 space-y-1">
                    <li>Loss of profits, business, data, or goodwill</li>
                    <li>Indirect or consequential damages</li>
                    <li>Acts or omissions of other users</li>
                    <li>Failures of third-party service providers (including Stripe)</li>
                  </ul>
                  <p><strong className="text-foreground">For business users:</strong> Total aggregate liability is capped at the greater of (a) fees you have paid to Wallplace in the prior 12 months, or (b) &pound;100.</p>
                  <p><strong className="text-foreground">For consumer buyers:</strong> Where you are a consumer under the Consumer Rights Act 2015, our liability to you in relation to any order is limited to the amount you paid for that order. Nothing in this section reduces or limits your non-excludable statutory consumer rights.</p>
                  <p>Nothing in these terms excludes or limits liability for death or personal injury caused by negligence, fraud or fraudulent misrepresentation, breach of terms implied by section 12 of the Sale of Goods Act 1979 or sections 9&ndash;11 of the Consumer Rights Act 2015, or any other liability that cannot be excluded or limited by law.</p>
                </div>
              </div>

              <div>
                <h2 className="text-2xl mb-4">13. Indemnification</h2>
                <p className="text-muted leading-relaxed">You agree to indemnify and hold Wallplace harmless from any claims, losses, or damages arising from your breach of these terms, your use of the Platform, your artwork or content, your transactions with other users, or disputes between you and other users.</p>
              </div>

              <div>
                <h2 className="text-2xl mb-4">14. Termination</h2>
                <div className="space-y-3 text-muted leading-relaxed">
                  <p>Either party may terminate with 30 days&rsquo; written notice. Wallplace may suspend or terminate accounts immediately for breach, prohibited conduct, or where continued access poses a risk.</p>
                  <p>On termination: artists must arrange collection of artwork from venues within 30 days; outstanding payments will be processed; no refund is given for the remainder of any paid membership period; no further charges will be made.</p>
                  <p>Sections relating to intellectual property, limitation of liability, indemnification, and governing law survive termination.</p>
                </div>
              </div>

              <div>
                <h2 className="text-2xl mb-4">15. Changes to These Terms</h2>
                <div className="space-y-3 text-muted leading-relaxed">
                  <p>Wallplace may update these terms from time to time. Material changes will be notified by email or Platform notice at least 14 days before taking effect.</p>
                  <p>Continued use of the Platform after changes take effect constitutes acceptance of the updated terms.</p>
                </div>
              </div>

              <div>
                <h2 className="text-2xl mb-4">16. General Provisions</h2>
                <p className="text-muted leading-relaxed">These terms, together with the Artist Agreement, Venue Partnership Agreement, Privacy Policy, and Cookie Policy, constitute the entire agreement between you and Wallplace. If any provision is found to be unenforceable, the remaining provisions continue in full force. A failure to enforce any right is not a waiver of that right. You may not assign your rights under these terms without consent. Wallplace may assign its rights freely. No third party has rights under the Contracts (Rights of Third Parties) Act 1999.</p>
              </div>

              <div>
                <h2 className="text-2xl mb-4">17. Governing Law and Jurisdiction</h2>
                <div className="space-y-3 text-muted leading-relaxed">
                  <p>These terms are governed by the laws of England and Wales. The courts of England and Wales have exclusive jurisdiction over any disputes.</p>
                  <p>If you are a consumer, nothing in these terms affects the consumer protections available to you under the laws of your country of residence.</p>
                </div>
              </div>

              <div>
                <h2 className="text-2xl mb-4">18. Contact</h2>
                <p className="text-muted leading-relaxed">
                  Wallplace, London, United Kingdom.<br />
                  Email: <a href="mailto:hello@wallplace.co.uk" className="text-accent hover:underline">hello@wallplace.co.uk</a><br />
                  For data protection queries, see our <Link href="/privacy" className="text-accent hover:underline">Privacy Policy</Link>.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
