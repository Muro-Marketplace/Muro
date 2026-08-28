// @vitest-environment jsdom
// Owner find (2026-08-28): the browse distance slider stuck on its old value
// until a refresh. These pin the two fixes: the debounced commit survives
// parent re-render churn (new onCommit identity every render), and the
// controlled input follows the drag rather than snapping back.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
// The component is module-internal to the page, and importing the page pulls
// the supabase client (env-dependent). So the behavioural test runs against a
// mirror of the component's fixed core, and the source-invariant tests below
// pin the REAL component's code so the mirror cannot drift from it silently.
import { useState, useEffect, useRef } from "react";

function Harness({ onCommitFactory }: { onCommitFactory: (v: number) => void }) {
  const [value, setValue] = useState(13);
  const [, force] = useState(0);
  // A NEW callback identity every render, exactly like the page's
  // setMaxDistance (it closes over freshly parsed URL state).
  const onCommit = (n: number) => {
    onCommitFactory(n);
    setValue(n);
  };
  // Simulate background re-render churn faster than the 250ms debounce.
  useEffect(() => {
    const t = setInterval(() => force((x) => x + 1), 100);
    return () => clearInterval(t);
  }, []);
  return <Slider value={value} onCommit={onCommit} />;
}

// Mirror of DistanceSliderControl's fixed core (ref-stable commit +
// controlled input). If the page component regresses to effect-deps on
// onCommit or an uncontrolled keyed input, the source assertions below fail.
function Slider({ value, onCommit }: { value: number; onCommit: (n: number) => void }) {
  const [draft, setDraft] = useState<number | null>(null);
  const display = draft ?? value;
  const ref = useRef(onCommit);
  useEffect(() => { ref.current = onCommit; }, [onCommit]);
  useEffect(() => {
    if (draft == null) return;
    const t = setTimeout(() => { ref.current(draft); setDraft(null); }, 250);
    return () => clearTimeout(t);
  }, [draft]);
  return (
    <input aria-label="distance" type="range" min={0} max={200} value={display}
      onChange={(e) => setDraft(Number(e.target.value))} />
  );
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("distance slider commit contract", () => {
  it("commits the dragged value despite re-render churn, and the thumb keeps it", async () => {
    const committed: number[] = [];
    render(<Harness onCommitFactory={(v) => committed.push(v)} />);
    const input = screen.getByLabelText("distance") as HTMLInputElement;
    expect(input.value).toBe("13");

    fireEvent.change(input, { target: { value: "40" } });
    // Churn re-renders for a while; the debounce must still fire once.
    await act(async () => { vi.advanceTimersByTime(600); });

    expect(committed).toEqual([40]);
    expect(input.value).toBe("40");
  });
});

// Source-level regression pins on the real component, so the mirror above
// cannot drift silently: the page must keep the controlled input and must
// not put onCommit back in the debounce effect's dependency array.
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("DistanceSliderControl source invariants", () => {
  const src = readFileSync(join(process.cwd(), "src/app/(pages)/browse/page.tsx"), "utf8");
  it("keeps the input controlled (no remount key, no defaultValue)", () => {
    expect(src).not.toContain("key={`maxd-${value}`}");
    expect(src).toContain("value={isAny ? 200 : display}");
  });
  it("keeps the debounce independent of onCommit identity", () => {
    expect(src).toContain("onCommitRef.current(draft)");
    expect(src).not.toMatch(/\[draft, onCommit\]/);
  });
});
