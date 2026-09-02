/**
 * Owner instruction (2026-09-02): the seed artists stay on the site exactly
 * as they are, plus this pill. Blue on purpose: the site accent is
 * terracotta, and the owner asked for blue so it reads as a label rather
 * than a badge of merit.
 */
export default function SamplePill({ className = "" }: { className?: string }) {
  return (
    <span
      title="A sample profile showing the kind of work Wallplace places"
      className={`inline-flex items-center rounded-full bg-blue-600 px-2 py-0.5 text-[11px] font-medium tracking-wide text-white ${className}`}
    >
      Sample
    </span>
  );
}
