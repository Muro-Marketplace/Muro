import { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import ScrollButton from "@/components/ScrollButton";
import CustomerGuide from "@/components/marketing/CustomerGuide";

export const metadata: Metadata = {
  title: "For Customers",
  description:
    "Buy original artwork directly from independent artists on Wallplace. Spot a piece in a venue, scan the QR, and own it. Or browse online from anywhere.",
};

export default function CustomerPage() {
  return (
    <div className="relative">
      {/* Immersive Hero, pulls behind the header with negative margin */}
      <section className="relative -mt-14 lg:-mt-16 min-h-screen flex flex-col pt-28 lg:pt-32">
        {/* Stock image of artwork on a wall, with a subtle gradient
            overlay so the headline still reads on light parts of the
            image. */}
        <div className="absolute inset-0 -z-10">
          <Image
            src="https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1920&h=1080&fit=crop&crop=center"
            alt="Original artwork on a wall in a curated gallery"
            fill
            className="object-cover"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-br from-black/65 via-black/50 to-black/35" />
        </div>
        <div className="flex-1 flex items-center pb-24 lg:pb-28">
          <div className="max-w-[1200px] mx-auto px-6 w-full">
            <div className="max-w-2xl">
              <p className="text-xs font-medium tracking-[0.25em] uppercase text-accent mb-5">
                For Customers
              </p>
              <h1 className="font-serif text-3xl sm:text-4xl md:text-5xl lg:text-6xl tracking-tight text-white leading-[1.05] mb-6">
                Buy original artwork direct from the artist.
              </h1>
              <p className="text-lg lg:text-xl text-white/60 leading-relaxed max-w-xl mb-10">
                Spot a piece you love on a wall somewhere. Scan the QR. Own it.
                Or skip the wall and browse a growing community of independent artists online.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                <Link href="/browse" className="inline-flex items-center justify-center min-w-[220px] px-8 py-3.5 text-sm font-semibold tracking-wider uppercase bg-accent text-white rounded-sm hover:bg-accent-hover transition-colors">
                  BROWSE ARTWORK
                </Link>
                <Link href="/signup/customer" className="inline-flex items-center justify-center min-w-[220px] px-8 py-3.5 text-sm font-semibold tracking-wider uppercase bg-white text-foreground rounded-sm hover:bg-white/90 transition-colors">
                  CREATE AN ACCOUNT
                </Link>
              </div>
              <p className="mt-6 text-sm text-white/60">
                Already tracking an order?{" "}
                <Link href="/orders/track" className="text-white underline underline-offset-2 hover:text-white/80">
                  Track it here
                </Link>
                , no account needed.
              </p>
            </div>
          </div>
        </div>

        <div className="relative z-10 mt-auto py-3 flex justify-center">
          <ScrollButton targetId="customer-content" label="See how it works" inline />
        </div>
      </section>

      {/* Body — sections share with /how-it-works's For Customers panel. */}
      <div id="customer-content">
        <CustomerGuide />
      </div>
    </div>
  );
}
