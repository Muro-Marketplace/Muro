// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";

vi.mock("@/lib/api-client", () => ({
  authFetch: vi.fn(async () => ({ ok: true, json: async () => ({}) })),
}));

import CounterPlacementDialog from "./CounterPlacementDialog";

afterEach(() => cleanup());

describe("<CounterPlacementDialog />", () => {
  it("caps note at 600 chars", () => {
    const { container } = render(
      <CounterPlacementDialog placementId="p1" onClose={() => {}} />,
    );
    const ta = container.querySelector("textarea")!;
    fireEvent.change(ta, { target: { value: "x".repeat(700) } });
    expect((ta as HTMLTextAreaElement).value.length).toBe(600);
  });

  it("shows the 'max 50% to the venue' helper when QR is on", () => {
    const { getByText } = render(
      <CounterPlacementDialog placementId="p1" onClose={() => {}} />,
    );
    expect(getByText(/max 50% to the venue/i)).toBeTruthy();
  });
});
