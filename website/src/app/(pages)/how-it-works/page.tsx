"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";

export default function HowItWorksPage() {
  const router = useRouter();
  const [selected, setSelected] = useState<"venues" | "artists" | null>(null);

  if (selected) {
    router.push(selected === "venues" ? "/venues" : "/artists");
    return null;
  }

  return (
    <div className="relative min-h-[110vh] sm:min-h-screen flex items-center justify-center -mt-14 lg:-mt-16">
      <div className="absolute inset-0 -z-10">
        <Image
          src="https://images.unsplash.com/photo-1460661419201-fd4cecdf8a8b?w=1920&h=1080&fit=crop&crop=center"
          alt="Art gallery"
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-black/60" />
      </div>

      <div className="text-center px-6 py-16 -mt-[20vh] sm:mt-0">
        <p className="text-xs font-medium tracking-[0.2em] uppercase text-accent mb-4">How It Works</p>
        <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl text-white mb-4">I am a...</h1>
        <p className="text-lg text-white/50 max-w-md mx-auto mb-12">
          Choose your path to see how Wallplace works for you.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-6">
          <button
            onClick={() => setSelected("venues")}
            className="group w-80 sm:w-72 h-48 bg-white/10 backdrop-blur-sm border border-white/20 rounded-sm px-8 py-6 flex flex-col items-center justify-center hover:bg-white/20 hover:border-white/40 transition-all"
          >
            <div className="w-12 h-12 rounded-full bg-accent/20 flex items-center justify-center mx-auto mb-3 group-hover:bg-accent/30 transition-colors">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#C17C5A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
            </div>
            <h2 className="text-xl font-serif text-white mb-1.5">Venue</h2>
            <p className="text-sm text-white/50">I have a space and want artwork</p>
          </button>

          <button
            onClick={() => setSelected("artists")}
            className="group w-80 sm:w-72 h-48 bg-white/10 backdrop-blur-sm border border-white/20 rounded-sm px-8 py-6 flex flex-col items-center justify-center hover:bg-white/20 hover:border-white/40 transition-all"
          >
            <div className="w-12 h-12 rounded-full bg-accent/20 flex items-center justify-center mx-auto mb-3 group-hover:bg-accent/30 transition-colors">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#C17C5A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 19l7-7 3 3-7 7-3-3z" />
                <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
                <path d="M2 2l7.586 7.586" />
                <circle cx="11" cy="11" r="2" />
              </svg>
            </div>
            <h2 className="text-xl font-serif text-white mb-1.5">Artist</h2>
            <p className="text-sm text-white/50">I create art and want to sell it</p>
          </button>
        </div>
      </div>
    </div>
  );
}
