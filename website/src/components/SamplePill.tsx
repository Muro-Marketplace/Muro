/**
 * Owner instruction (2026-09-02): the seed artists stay on the site exactly
 * as they are, plus this pill. Grey on purpose (owner choice, 2 September):
 * a neutral label beside the terracotta accent, not a badge of merit; it
 * reads as a label rather
 * than a badge of merit.
 */
export default function SamplePill({ className = "" }: { className?: string }) {
  return (
    <span
      title="A sample profile showing the kind of work Wallplace places"
      className={`inline-flex items-center rounded-full bg-neutral-500 px-2 py-0.5 text-[11px] font-medium tracking-wide text-white ${className}`}
    >
      Sample
    </span>
  );
}
