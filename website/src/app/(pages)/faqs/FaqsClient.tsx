"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import Accordion from "@/components/Accordion";

export type FaqEntry = {
  question: string;
  answer: ReactNode;
};

type Audience = "all" | "artist" | "venue" | "buyer";

const audienceTabs: { id: Audience; label: string }[] = [
  { id: "all", label: "All" },
  { id: "artist", label: "For artists" },
  { id: "venue", label: "For venues" },
  { id: "buyer", label: "For buyers" },
];

type FaqsClientProps = {
  general: FaqEntry[];
  artist: FaqEntry[];
  venue: FaqEntry[];
  buyer: FaqEntry[];
};

export default function FaqsClient({
  general,
  artist,
  venue,
  buyer,
}: FaqsClientProps) {
  const [audience, setAudience] = useState<Audience>("all");

  const showGeneral = audience === "all";
  const showArtist = audience === "all" || audience === "artist";
  const showVenue = audience === "all" || audience === "venue";
  const showBuyer = audience === "all" || audience === "buyer";

  return (
    <>
      {/* Header */}
      <section className="pt-20 lg:pt-24 pb-8">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="max-w-2xl">
            <h1 className="text-4xl lg:text-5xl mb-5">
              Frequently Asked Questions
            </h1>
            <p className="text-lg text-muted leading-relaxed">
              Everything you need to know about how Wallplace works for artists,
              venues, and art lovers.
            </p>
          </div>

          {/* Audience filter */}
          <div
            role="tablist"
            aria-label="Filter FAQs by audience"
            className="mt-8 flex flex-wrap gap-1 border-b border-border"
          >
            {audienceTabs.map(({ id, label }) => {
              const active = audience === id;
              return (
                <button
                  key={id}
                  role="tab"
                  aria-selected={active}
                  aria-controls={`faqs-panel-${id}`}
                  id={`faqs-tab-${id}`}
                  onClick={() => setAudience(id)}
                  className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                    active
                      ? "border-accent text-foreground"
                      : "border-transparent text-muted hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <div
        role="tabpanel"
        id={`faqs-panel-${audience}`}
        aria-labelledby={`faqs-tab-${audience}`}
      >
        {/* General — only visible on the All tab */}
        {showGeneral && (
          <section className="pb-16 lg:pb-20 scroll-mt-24" id="general">
            <div className="max-w-[1200px] mx-auto px-6">
              <div className="max-w-3xl">
                <h2 className="text-2xl mb-6">General</h2>
                <Accordion items={general} />
              </div>
            </div>
          </section>
        )}

        {showArtist && (
          <section className="pb-16 lg:pb-20 scroll-mt-24" id="artists">
            <div className="max-w-[1200px] mx-auto px-6">
              <div className="max-w-3xl">
                <h2 className="text-2xl mb-6">For Artists</h2>
                <Accordion items={artist} />
              </div>
            </div>
          </section>
        )}

        {showVenue && (
          <section className="pb-16 lg:pb-20 scroll-mt-24" id="venues">
            <div className="max-w-[1200px] mx-auto px-6">
              <div className="max-w-3xl">
                <h2 className="text-2xl mb-6">For Venues</h2>
                <Accordion items={venue} />
              </div>
            </div>
          </section>
        )}

        {showBuyer && (
          <section className="pb-16 lg:pb-20 scroll-mt-24" id="buyers">
            <div className="max-w-[1200px] mx-auto px-6">
              <div className="max-w-3xl">
                <h2 className="text-2xl mb-6">For Buyers</h2>
                <Accordion items={buyer} />
              </div>
            </div>
          </section>
        )}
      </div>
    </>
  );
}
