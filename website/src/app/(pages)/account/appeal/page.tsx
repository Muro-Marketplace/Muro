import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Appeal an account decision",
  description: "How to appeal a suspension, removal, or account decision on Wallplace.",
  robots: { index: false, follow: false },
};

// Lightweight info page so the "Appeal this decision" CTA in moderation
// / suspension / takedown emails routes somewhere real. Heavy
// review-form work is admin-facing and lives in admin/, this page is
// just the public-facing entry point with the email + expected SLA.

export default function AccountAppealPage() {
  return (
    <div className="bg-background">
      <section className="py-20 lg:py-24">
        <div className="max-w-[640px] mx-auto px-6">
          <h1 className="text-3xl lg:text-4xl mb-4">Appeal an account decision</h1>
          <p className="text-muted leading-relaxed mb-6">
            If you believe a suspension, content removal, or other decision Wallplace has taken on your account is wrong, you can appeal. Every appeal is reviewed by a member of our team, not by an automated system.
          </p>

          <h2 className="text-xl mt-10 mb-3">How to submit an appeal</h2>
          <p className="text-muted leading-relaxed mb-3">
            Email <a href="mailto:appeals@wallplace.co.uk" className="text-accent hover:underline">appeals@wallplace.co.uk</a> with:
          </p>
          <ul className="list-disc pl-6 text-muted leading-relaxed space-y-1 mb-6">
            <li>The email address on your Wallplace account</li>
            <li>The case reference from the email we sent you (if any)</li>
            <li>A short explanation of why you think the decision should be reversed</li>
            <li>Any supporting evidence (screenshots, order numbers, messages)</li>
          </ul>

          <h2 className="text-xl mt-10 mb-3">What to expect</h2>
          <ul className="list-disc pl-6 text-muted leading-relaxed space-y-1 mb-6">
            <li>Acknowledgement within 2 business days.</li>
            <li>A decision within 10 business days, longer for complex cases (we&rsquo;ll tell you if so).</li>
            <li>Your appeal is reviewed by someone other than the person who made the original decision.</li>
          </ul>

          <p className="text-sm text-muted">
            For complaints unrelated to account moderation, see our{" "}
            <Link href="/complaints" className="text-accent hover:underline">Complaints Policy</Link>
            .
          </p>
        </div>
      </section>
    </div>
  );
}
