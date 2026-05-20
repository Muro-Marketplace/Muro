import Image from "next/image";
import Button from "@/components/Button";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About Wallplace",
  description:
    "Wallplace exists to connect incredible artists with the bare walls of cafes, restaurants, and creative spaces.",
};

export default function AboutPage() {
  return (
    <div className="bg-background">
      {/* Hero */}
      <section className="relative py-20 lg:py-28 -mt-14 lg:-mt-16 pt-28 lg:pt-32 overflow-hidden bg-foreground">
        <div className="absolute inset-0 -z-10">
          <Image
            src="https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=1920&h=600&fit=crop&crop=center"
            alt="Art studio"
            fill
            className="object-cover"
          />
          <div className="absolute inset-0 bg-black/60" />
        </div>
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="max-w-3xl">
            <h1 className="text-4xl lg:text-5xl mb-6 text-white">About Wallplace</h1>
            <p className="text-xl text-white/60 leading-relaxed">
              Wallplace exists because thousands of incredible artworks sit
              in artists&rsquo; studios while thousands of bare walls in
              cafes could be transformed by them. We make the
              connection effortless.
            </p>
          </div>
        </div>
      </section>

      {/* Story */}
      <section className="pt-16 lg:pt-20 pb-20 lg:pb-24">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16">
            <div>
              <h2 className="text-3xl mb-5">The Problem We Saw</h2>
              <p className="text-muted leading-relaxed mb-4">
                Walk into most independent cafes, restaurants, or coworking
                spaces and you will see one of two things: bare walls,
                or mass-produced prints that could be in any city in the world.
                Meanwhile, there are some of the most talented emerging
                artists anywhere, people creating
                extraordinary work that deserves to be seen.
              </p>
              <p className="text-muted leading-relaxed">
                The problem is not a lack of supply or demand. It is the gap
                between them. Artists do not know which venues want art. Venues
                do not know where to find artists. And even when they do connect,
                selecting work, agreeing terms, and keeping the relationship
                healthy can be overwhelming for both sides.
              </p>
            </div>
            <div>
              <h2 className="text-3xl mb-5">What Wallplace Does</h2>
              <p className="text-muted leading-relaxed mb-4">
                Wallplace is a curated art placement service. We review and
                accept artists based on the quality of their work. We match
                them with venues that suit their style and help both sides
                agree on terms. Delivery and installation are arranged
                directly between the artist and the venue.
              </p>
              <p className="text-muted leading-relaxed">
                For artists, we provide exhibition space, exposure, and sales
                opportunities without the cost or commitment of a traditional
                gallery. For venues, we provide a rotating selection of original,
                high-quality artwork that transforms their space and creates
                talking points for their customers, all with no upfront
                cost and minimal effort.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How Curation Works */}
      <section className="py-20 lg:py-24 border-t border-border">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="max-w-2xl mb-12">
            <h2 className="text-3xl mb-5">How Curation Works</h2>
            <p className="text-muted leading-relaxed">
              Quality is everything. We are not a marketplace where anyone can
              list their work. Every artist on Wallplace has been through our
              review process.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-surface border border-border rounded-sm p-8">
              <div className="text-accent text-sm font-medium mb-3">01</div>
              <h3 className="text-xl mb-3">Application</h3>
              <p className="text-sm text-muted leading-relaxed">
                Artists submit a portfolio of their best work along with a brief
                statement about their practice. We review every application
                personally.
              </p>
            </div>
            <div className="bg-surface border border-border rounded-sm p-8">
              <div className="text-accent text-sm font-medium mb-3">02</div>
              <h3 className="text-xl mb-3">Review</h3>
              <p className="text-sm text-muted leading-relaxed">
                Our team assesses work based on technical quality, originality,
                consistency, and suitability for display in commercial spaces.
                We are looking for work that holds up on a wall.
              </p>
            </div>
            <div className="bg-surface border border-border rounded-sm p-8">
              <div className="text-accent text-sm font-medium mb-3">03</div>
              <h3 className="text-xl mb-3">Onboarding</h3>
              <p className="text-sm text-muted leading-relaxed">
                Accepted artists work with us to photograph their portfolio,
                set pricing, and get matched with suitable venues. We handle
                everything from there.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="py-20 lg:py-24 border-t border-border">
        <div className="max-w-[1200px] mx-auto px-6">
          <h2 className="text-3xl mb-12">What We Believe</h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 lg:gap-12">
            <div>
              <h3 className="text-xl mb-3">Art belongs in everyday life</h3>
              <p className="text-muted leading-relaxed">
                You should not need to visit a gallery to experience great art.
                The cafe where you have your morning coffee, the restaurant
                where you celebrate an anniversary, the office where you spend
                your days. These spaces deserve beautiful, original work
                on their walls.
              </p>
            </div>
            <div>
              <h3 className="text-xl mb-3">Quality over quantity</h3>
              <p className="text-muted leading-relaxed">
                We would rather have 50 exceptional artists than 500 mediocre
                ones. Our curation process is rigorous because the venues and
                buyers who trust us deserve the best. Every piece on Wallplace
                has been reviewed and approved.
              </p>
            </div>
            <div>
              <h3 className="text-xl mb-3">Fair for everyone</h3>
              <p className="text-muted leading-relaxed">
                Artists keep the majority of every sale. Venues get art at no
                upfront cost. Buyers get original work at fair prices. We take
                a commission that sustains the service without exploiting anyone
                in the chain.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* No AI Policy */}
      <section className="py-16 border-t border-border">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="bg-surface border border-border rounded-sm p-8 lg:p-10 max-w-2xl">
            <h3 className="text-xl mb-3">Original Work Only</h3>
            <p className="text-muted leading-relaxed">
              Every piece on Wallplace is original work by a real artist. We do
              not accept AI-generated art. Our artists invest time, skill, and
              vision into their craft, and we believe that distinction matters.
              When you see a photograph on Wallplace, you can trust that a human
              being stood behind the camera.
            </p>
          </div>
        </div>
      </section>

      {/* CTAs */}
      <section className="py-20 lg:py-24 border-t border-border">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12">
            <div className="bg-surface border border-border rounded-sm p-8 lg:p-10">
              <h2 className="text-2xl mb-3">For Artists</h2>
              <p className="text-muted leading-relaxed mb-6">
                Get your work seen by thousands of people in cafes, restaurants,
                and creative spaces. No gallery fees, no
                exclusivity.
              </p>
              <Button href="/apply" variant="primary" size="md">
                Apply to Join
              </Button>
            </div>
            <div className="bg-surface border border-border rounded-sm p-8 lg:p-10">
              <h2 className="text-2xl mb-3">For Venues</h2>
              <p className="text-muted leading-relaxed mb-6">
                Transform your space with original artwork at no upfront cost.
                We curate the artists, match them to your venue, and help you
                agree the terms. You and the artist arrange delivery and
                installation together.
              </p>
              <Button href="/venues" variant="secondary" size="md">
                Get Art for Your Space
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
