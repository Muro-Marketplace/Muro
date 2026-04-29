import type { Metadata } from "next";
import ApplicationGate from "@/components/ApplicationGate";

export const metadata: Metadata = {
  title: "Apply to Join – Wallplace",
  description:
    "Apply to join Wallplace, the curated platform connecting artists with independent venues. First month free for all accepted artists.",
};

export default function ApplyPage() {
  return (
    <div className="bg-background">
      {/* Hero */}
      <section className="py-20 lg:py-28">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="max-w-3xl">
            <p className="text-accent text-sm font-medium uppercase tracking-wider mb-4">
              Artist Applications
            </p>
            <h1 className="text-4xl lg:text-5xl mb-6">
              Apply to Join Wallplace
            </h1>
            <p className="text-xl text-muted leading-relaxed mb-6">
              Wallplace is a curated platform connecting artists with venues
              that are genuinely looking for artwork. We review every
              application personally. We accept roughly half. Being accepted
              means your work has been judged ready for commercial spaces.
            </p>
            <p className="text-muted leading-relaxed">
              We are selective because curation is our value. Venues trust us
              because every artist we recommend meets a consistent standard of
              quality, professionalism, and commercial viability.
            </p>
          </div>
        </div>
      </section>

      {/* Founding Artist Banner */}
      <section className="py-8 bg-accent/5 border-y border-accent/20">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="flex flex-col md:flex-row items-start md:items-center gap-4 md:gap-8">
            <div className="shrink-0">
              <span className="inline-block px-3 py-1 bg-accent text-white text-xs font-medium uppercase tracking-wider rounded-sm">
                Founding Artist Offer
              </span>
            </div>
            <div className="flex-1">
              <p className="text-foreground font-medium">
                First month free on all plans.
              </p>
              <p className="text-muted text-sm mt-1">
                Try any plan for 30 days at no cost. No commitment, cancel any time.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Application Form */}
      <section className="py-20 lg:py-24">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-12 lg:gap-16">
            {/* Sidebar */}
            <div className="lg:sticky lg:top-28 lg:self-start">
              <h2 className="text-3xl mb-5">The Application</h2>
              <p className="text-muted leading-relaxed mb-6">
                Tell us about your practice, what you offer, and the kinds of
                venues that suit your work. The more detail you provide, the
                better we can match you.
              </p>
              <div className="bg-surface border border-border rounded-sm p-6 space-y-4">
                <p className="text-sm font-medium text-foreground">
                  What we look for:
                </p>
                <ul className="space-y-2">
                  {[
                    "Technical quality and consistency",
                    "A coherent body of work",
                    "Commercial viability for venue display",
                    "Professional approach and communication",
                    "Original work – no AI-generated pieces",
                  ].map((item) => (
                    <li
                      key={item}
                      className="flex items-start gap-2.5 text-sm text-muted"
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 14 14"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="text-accent mt-0.5 shrink-0"
                      >
                        <path d="M2 7.5l3.5 3.5L12 3" />
                      </svg>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <p className="mt-6 text-sm text-muted">
                We aim to respond within 5 business days of receiving your
                application.
              </p>
            </div>

            {/* Form, gated by auth. Anonymous visitors are pushed
                through /signup/artist first so the application
                always belongs to a real Supabase account. */}
            <div>
              <ApplicationGate />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
