"use client";

import Breadcrumbs from "@/components/Breadcrumbs";
import ArtworkRequestsList from "@/components/ArtworkRequestsList";

export default function ArtworkRequestsClient() {
  return (
    <div className="bg-background">
      <section className="pt-24 lg:pt-28 pb-12 lg:pb-16 border-b border-border bg-[#FAF8F5]">
        <div className="max-w-[1200px] mx-auto px-6">
          <Breadcrumbs
            items={[
              { label: "Home", href: "/" },
              { label: "Artwork requests" },
            ]}
          />
          <p className="text-xs font-medium tracking-[0.2em] uppercase text-accent mb-3">
            For Artists
          </p>
          <h1 className="font-serif text-3xl sm:text-4xl lg:text-5xl text-foreground mb-3">
            Open artwork requests
          </h1>
          <p className="text-sm sm:text-base text-muted max-w-2xl leading-relaxed">
            Venues telling Wallplace exactly what they&rsquo;re looking for. Browse
            current open calls and submit your work to be considered.
          </p>
        </div>
      </section>

      <section className="py-10 lg:py-14">
        <div className="max-w-[1200px] mx-auto px-6">
          <ArtworkRequestsList />
        </div>
      </section>
    </div>
  );
}
