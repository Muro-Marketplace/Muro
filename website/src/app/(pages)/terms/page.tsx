import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms & Privacy – Wallspace",
  description: "Terms of service and privacy policy for Wallspace.",
};

export default function TermsPage() {
  return (
    <div className="bg-background">
      <section className="py-20 lg:py-24">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="max-w-3xl">
            <h1 className="text-4xl lg:text-5xl mb-5">Terms &amp; Privacy</h1>
            <p className="text-muted leading-relaxed mb-16">
              Last updated: March 2026
            </p>

            {/* Terms of Service */}
            <div className="space-y-12">
              <div>
                <h2 className="text-3xl mb-6">Terms of Service</h2>

                <div className="space-y-8">
                  <div>
                    <h3 className="text-xl mb-3">1. Introduction</h3>
                    <p className="text-muted leading-relaxed">
                      These Terms of Service (&ldquo;Terms&rdquo;) govern your
                      use of the Wallspace website and services operated by
                      Wallspace Ltd (&ldquo;we&rdquo;, &ldquo;us&rdquo;, or
                      &ldquo;our&rdquo;). By accessing or using our services,
                      you agree to be bound by these Terms. If you do not agree
                      to these Terms, please do not use our services.
                    </p>
                  </div>

                  <div>
                    <h3 className="text-xl mb-3">2. Services</h3>
                    <p className="text-muted leading-relaxed">
                      Wallspace provides a curated art placement service
                      connecting artists with venues. Our services
                      include artist curation, artwork placement, sales
                      facilitation, and related logistics. We act as an
                      intermediary between artists and venues and between artists
                      and buyers.
                    </p>
                  </div>

                  <div>
                    <h3 className="text-xl mb-3">3. Accounts</h3>
                    <p className="text-muted leading-relaxed">
                      Some features of our services require you to create an
                      account. You are responsible for maintaining the
                      confidentiality of your account credentials and for all
                      activities that occur under your account. You agree to
                      provide accurate and complete information when creating
                      your account.
                    </p>
                  </div>

                  <div>
                    <h3 className="text-xl mb-3">4. Artist Terms</h3>
                    <p className="text-muted leading-relaxed">
                      Artists accepted onto the Wallspace platform grant us a
                      non-exclusive licence to display, promote, and facilitate
                      the sale of their artwork through our network of venue
                      partners. Artists retain full copyright and ownership of
                      their work at all times. Commission rates and payment
                      terms are set out in the separate Artist Agreement
                      provided during onboarding.
                    </p>
                  </div>

                  <div>
                    <h3 className="text-xl mb-3">5. Venue Terms</h3>
                    <p className="text-muted leading-relaxed">
                      Venues partnering with Wallspace agree to display artwork
                      in accordance with our care guidelines, maintain
                      appropriate insurance for their premises, and facilitate
                      customer enquiries about displayed artwork. Specific
                      terms are set out in the separate Venue Partnership
                      Agreement.
                    </p>
                  </div>

                  <div>
                    <h3 className="text-xl mb-3">6. Purchases and Payments</h3>
                    <p className="text-muted leading-relaxed">
                      All prices are listed in GBP and include applicable taxes
                      unless otherwise stated. Payment is processed securely
                      through our payment partners. Buyers receive a
                      confirmation email upon successful purchase. Delivery
                      arrangements vary by artwork and are communicated at the
                      time of purchase.
                    </p>
                  </div>

                  <div>
                    <h3 className="text-xl mb-3">7. Intellectual Property</h3>
                    <p className="text-muted leading-relaxed">
                      All content on the Wallspace website, including but not
                      limited to text, design, logos, and software, is the
                      property of Wallspace Ltd or its licensors. Artwork images
                      displayed on our platform remain the intellectual property
                      of the respective artists. You may not reproduce,
                      distribute, or create derivative works from any content
                      without prior written consent.
                    </p>
                  </div>

                  <div>
                    <h3 className="text-xl mb-3">8. Limitation of Liability</h3>
                    <p className="text-muted leading-relaxed">
                      To the maximum extent permitted by law, Wallspace Ltd
                      shall not be liable for any indirect, incidental, special,
                      or consequential damages arising from your use of our
                      services. Our total liability shall not exceed the amount
                      paid by you, if any, for the specific service giving rise
                      to the claim.
                    </p>
                  </div>

                  <div>
                    <h3 className="text-xl mb-3">9. Termination</h3>
                    <p className="text-muted leading-relaxed">
                      We reserve the right to suspend or terminate your access
                      to our services at any time for any reason, including
                      breach of these Terms. You may terminate your account at
                      any time by contacting us. Termination does not affect
                      any rights or obligations accrued prior to the date of
                      termination.
                    </p>
                  </div>

                  <div>
                    <h3 className="text-xl mb-3">10. Governing Law</h3>
                    <p className="text-muted leading-relaxed">
                      These Terms are governed by and construed in accordance
                      with the laws of England and Wales. Any disputes arising
                      from these Terms shall be subject to the exclusive
                      jurisdiction of the courts of England and Wales.
                    </p>
                  </div>
                </div>
              </div>

              {/* Privacy Policy */}
              <div className="border-t border-border pt-12">
                <h2 className="text-3xl mb-6">Privacy Policy</h2>

                <div className="space-y-8">
                  <div>
                    <h3 className="text-xl mb-3">1. Information We Collect</h3>
                    <p className="text-muted leading-relaxed">
                      We collect information you provide directly, such as your
                      name, email address, and any other details submitted
                      through forms on our website. We also collect certain
                      technical information automatically, including your IP
                      address, browser type, and usage patterns through cookies
                      and similar technologies.
                    </p>
                  </div>

                  <div>
                    <h3 className="text-xl mb-3">2. How We Use Your Information</h3>
                    <p className="text-muted leading-relaxed">
                      We use your information to provide and improve our
                      services, communicate with you, process transactions,
                      and comply with legal obligations. We do not sell your
                      personal information to third parties.
                    </p>
                  </div>

                  <div>
                    <h3 className="text-xl mb-3">3. Data Sharing</h3>
                    <p className="text-muted leading-relaxed">
                      We may share your information with trusted third-party
                      service providers who assist us in operating our platform,
                      such as payment processors and delivery partners. We
                      require all third parties to respect the security of your
                      data and to treat it in accordance with applicable laws.
                    </p>
                  </div>

                  <div>
                    <h3 className="text-xl mb-3">4. Data Retention</h3>
                    <p className="text-muted leading-relaxed">
                      We retain your personal information only for as long as
                      necessary to fulfil the purposes for which it was
                      collected, including to satisfy legal, accounting, or
                      reporting requirements. When your data is no longer
                      required, it will be securely deleted or anonymised.
                    </p>
                  </div>

                  <div>
                    <h3 className="text-xl mb-3">5. Your Rights</h3>
                    <p className="text-muted leading-relaxed">
                      Under UK data protection law, you have the right to
                      access, correct, or delete your personal data. You may
                      also object to or restrict certain processing activities.
                      To exercise any of these rights, please contact us at
                      hello@wallspace.co.
                    </p>
                  </div>

                  <div>
                    <h3 className="text-xl mb-3">6. Cookies</h3>
                    <p className="text-muted leading-relaxed">
                      Our website uses cookies to enhance your browsing
                      experience and analyse site traffic. You can control
                      cookie settings through your browser preferences. For
                      more information about the cookies we use, please contact
                      us.
                    </p>
                  </div>

                  <div>
                    <h3 className="text-xl mb-3">7. Contact</h3>
                    <p className="text-muted leading-relaxed">
                      If you have any questions about this Privacy Policy or
                      our data practices, please contact us at
                      hello@wallspace.co or write to us at Wallspace Ltd,
                      London, UK.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
