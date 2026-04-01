"use client";

export default function ScrollButton({
  targetId,
  label = "Scroll to explore",
}: {
  targetId: string;
  label?: string;
}) {
  return (
    <button
      onClick={() =>
        document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth" })
      }
      className="absolute bottom-10 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-3 text-white/60 hover:text-white transition-colors duration-300 cursor-pointer"
    >
      <span className="text-xs tracking-[0.2em] uppercase font-medium">
        {label}
      </span>
      <div className="w-10 h-10 rounded-full border border-white/30 flex items-center justify-center animate-bounce">
        <svg
          width="18"
          height="18"
          viewBox="0 0 18 18"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 7l5 5 5-5" />
        </svg>
      </div>
    </button>
  );
}
