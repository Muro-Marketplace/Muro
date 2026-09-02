import { Metadata } from "next";
import VenueArtistToggle from "@/components/VenueArtistToggle";
import Image from "next/image";
import Button from "@/components/Button";
import ScrollButton from "@/components/ScrollButton";
import ArtistGuide from "@/components/marketing/ArtistGuide";
import { FOUNDING_OFFER_SHORT } from "@/lib/pricing";

export const metadata: Metadata = {
  title: "For Artists",
  description:
    "Display your work in real venues and sell directly online. Your Wallplace page is your portfolio and your storefront. Every QR scan is a sale opportunity.",
};

export default function ArtistsPage() {
  return (
    <div className="relative">
      <VenueArtistToggle />
      {/* Immersive Hero */}
      <section className="relative -mt-14 lg:-mt-16 min-h-screen flex flex-col pt-28 lg:pt-32">
        {/* Hero background image */}
        <div className="absolute inset-0 -z-10">
          <Image
            src="https://images.unsplash.com/photo-1452587925148-ce544e77e70d?w=1920&h=1080&fit=crop&crop=center"
            alt="Photographer with camera"
            fill
            className="object-cover"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-br from-black/80 via-black/65 to-black/50" />
        </div>
        <div className="flex-1 flex items-center pb-24 lg:pb-28">
          <div className="max-w-[1200px] mx-auto px-6 w-full">
            <div className="max-w-2xl">
              <p className="text-xs font-medium tracking-[0.25em] uppercase text-accent mb-5">
                For Artists
              </p>
              <h1 className="font-serif text-3xl sm:text-4xl md:text-5xl lg:text-6xl tracking-tight text-white leading-[1.05] mb-6">
                Display, discover, sell.
                <br />
                All in one place.
              </h1>
              <p className="text-lg lg:text-xl text-white/60 leading-relaxed max-w-xl mb-10">
                Access high-intent venue demand. Get discovered by cafés, restaurants,
                hotels, galleries, offices, and salons looking for original artwork
                and sell directly to anyone who scans your QR code.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Button href="/apply" size="lg" variant="accent">
                  APPLY TO JOIN
                </Button>
              </div>
              <p className="mt-3 text-[11px] text-white/50">
                Applications reviewed within 5 business days.
              </p>
            </div>
          </div>
        </div>

        {/* Dark banner */}
        <div className="relative z-10 mt-auto">
          <div className="py-3 flex justify-center">
            <ScrollButton targetId="artist-content" label="See what you get" inline />
          </div>
          <div className="border-t border-white/10 bg-black/50 backdrop-blur-sm">
            <div className="max-w-[1200px] mx-auto px-6 py-3.5 flex items-center justify-center gap-3 text-xs text-white/40 tracking-wider uppercase">
              <span>{FOUNDING_OFFER_SHORT}</span>
              <span className="w-1 h-1 rounded-full bg-white/30" />
              <span>30 days&rsquo; notice to leave</span>
              <span className="w-1 h-1 rounded-full bg-white/30" />
              <span>From £9.99/mo</span>
            </div>
          </div>
        </div>
      </section>

      {/* Body — sections share with /how-it-works's For Artists panel. */}
      <div id="artist-content">
        <ArtistGuide />
      </div>
    </div>
  );
}
