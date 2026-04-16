import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Returns & Refunds – Wallplace",
  description:
    "Wallplace Returns & Refunds Policy. Your rights, how to return artwork, and how refunds are processed.",
};

export default function ReturnsPage() {
  return (
    <div className="bg-background">
      <section className="py-20 lg:py-24">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="max-w-3xl">
            <h1 className="text-4xl lg:text-5xl mb-4">Returns &amp; Refunds</h1>
            <p className="text-muted leading-relaxed mb-16">Last updated: April 2026</p>

            <div className="space-y-10">
              <div>
                <h2 className="text-2xl mb-4">Your Right to Cancel</h2>
                <div className="space-y-3 text-muted leading-relaxed">
                  <p>Under the Consumer Contracts Regulations 2013, you have 14 days from the date you receive your artwork to cancel your order for any reason. This is your statutory cooling-off period.</p>
                  <p>To cancel, contact the artist through the platform or email <a href="mailto:hello@wallplace.co.uk" className="text-accent hover:underline">hello@wallplace.co.uk</a> with your order number within 14 days of delivery.</p>
                  <p><strong className="text-foreground">Exceptions:</strong> Bespoke or personalised artwork (e.g. commissions made to your specification) is exempt from the 14-day cooling-off period.</p>
                </div>
              </div>

              <div>
                <h2 className="text-2xl mb-4">How to Return</h2>
                <div className="text-muted leading-relaxed">
                  <ul className="list-disc pl-6 space-y-2">
                    <li>Contact the artist or Wallplace within 14 days of receiving the artwork</li>
                    <li>Return the artwork in its original condition and packaging at your own cost (unless faulty)</li>
                    <li>The artist will issue a full refund within 14 days of receiving the returned artwork</li>
                  </ul>
                </div>
              </div>

              <div>
                <h2 className="text-2xl mb-4">Faulty or Misdescribed Goods</h2>
                <p className="text-muted leading-relaxed">Under the Consumer Rights Act 2015, you have additional rights if your artwork is faulty or not as described. You may be entitled to a repair, replacement, or refund. Contact <a href="mailto:hello@wallplace.co.uk" className="text-accent hover:underline">hello@wallplace.co.uk</a> or use the Request Refund option in your account dashboard.</p>
              </div>

              <div>
                <h2 className="text-2xl mb-4">Requesting a Refund</h2>
                <div className="space-y-3 text-muted leading-relaxed">
                  <p>You can request a refund directly from your account:</p>
                  <ol className="list-decimal pl-6 space-y-2">
                    <li>Go to My Orders in your customer portal</li>
                    <li>Select the order</li>
                    <li>Click &ldquo;Request Refund&rdquo;</li>
                    <li>Choose full or partial refund and describe the reason</li>
                    <li>The artist will review and respond to your request</li>
                  </ol>
                </div>
              </div>

              <div>
                <h2 className="text-2xl mb-4">Refund Timeframes</h2>
                <div className="text-muted leading-relaxed">
                  <ul className="list-disc pl-6 space-y-2">
                    <li>Refund requests are typically reviewed within 5 business days</li>
                    <li>Approved refunds are processed via Stripe and appear on your statement within 5&ndash;10 business days</li>
                    <li>If a refund request is rejected, you will receive a reason and can escalate via our <a href="/terms#dispute-resolution" className="text-accent hover:underline">dispute resolution process</a></li>
                  </ul>
                </div>
              </div>

              <div>
                <h2 className="text-2xl mb-4">Damaged in Transit</h2>
                <p className="text-muted leading-relaxed">If your artwork arrives damaged, take photographs of the packaging and damage immediately. Contact the artist and Wallplace within 48 hours. The artist is responsible for adequate packing and may be liable for transit damage.</p>
              </div>

              <div>
                <h2 className="text-2xl mb-4">Contact</h2>
                <p className="text-muted leading-relaxed">
                  For any returns or refund queries: <a href="mailto:hello@wallplace.co.uk" className="text-accent hover:underline">hello@wallplace.co.uk</a>
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
