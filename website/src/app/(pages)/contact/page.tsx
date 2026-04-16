import { Suspense } from "react";
import ContactForm from "@/components/ContactForm";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact – Wallplace",
  description:
    "Get in touch with the Wallplace team. Whether you're an artist, a venue, or just curious – we'd love to hear from you.",
};

export default function ContactPage() {
  return (
    <div className="bg-background">
      {/* Header */}
      <section className="py-20 lg:py-24">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="max-w-2xl">
            <h1 className="text-4xl lg:text-5xl mb-5">Get in Touch</h1>
            <p className="text-lg text-muted leading-relaxed">
              Whether you&rsquo;re an artist, a venue, or just curious –
              we&rsquo;d love to hear from you.
            </p>
          </div>
        </div>
      </section>

      {/* Form + Info */}
      <section className="pb-20 lg:pb-24">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-12 lg:gap-16">
            {/* Form */}
            <div className="lg:col-span-3">
              <Suspense fallback={<div className="py-8 text-center text-muted text-sm">Loading form...</div>}>
                <ContactForm />
              </Suspense>
            </div>

            {/* Contact Info */}
            <div className="lg:col-span-2">
              <div className="bg-surface border border-border rounded-sm p-8">
                <h2 className="text-xl mb-6">Contact Details</h2>

                <div className="space-y-6">
                  {/* Response Time */}
                  <div>
                    <p className="text-sm font-medium text-foreground mb-1">
                      Response Time
                    </p>
                    <p className="text-sm text-muted">
                      We respond within 24 hours.
                    </p>
                  </div>

                  {/* Email */}
                  <div>
                    <p className="text-sm font-medium text-foreground mb-1">
                      Email
                    </p>
                    <a
                      href="mailto:hello@wallplace.co.uk"
                      className="text-sm text-accent hover:text-accent-hover transition-colors duration-200"
                    >
                      hello@wallplace.co.uk
                    </a>
                  </div>

                  {/* Location */}
                  <div>
                    <p className="text-sm font-medium text-foreground mb-1">
                      Location
                    </p>
                    <p className="text-sm text-muted">London, UK</p>
                  </div>

                  {/* Instagram */}
                  <div>
                    <p className="text-sm font-medium text-foreground mb-1">
                      Instagram
                    </p>
                    <a
                      href="https://instagram.com/wallplace"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-sm text-accent hover:text-accent-hover transition-colors duration-200"
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <rect x="2" y="2" width="20" height="20" rx="5" />
                        <circle cx="12" cy="12" r="5" />
                        <circle
                          cx="17.5"
                          cy="6.5"
                          r="1"
                          fill="currentColor"
                          stroke="none"
                        />
                      </svg>
                      @wallplace
                    </a>
                  </div>
                </div>

                {/* Divider */}
                <div className="border-t border-border mt-8 pt-8">
                  <p className="text-xs text-muted leading-relaxed">
                    For urgent matters or press enquiries, please email us
                    directly at{" "}
                    <a
                      href="mailto:hello@wallplace.co.uk"
                      className="text-foreground hover:text-accent transition-colors duration-200"
                    >
                      hello@wallplace.co.uk
                    </a>
                    .
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
