// @vitest-environment jsdom
//
// Owner instruction (2 September): once the application is submitted, the
// founding-offer banner and the sidebar disappear.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/components/ApplicationGate", () => ({
  default: ({ onSubmitted }: { onSubmitted?: () => void }) => (
    <button onClick={() => onSubmitted?.()}>fake submit</button>
  ),
}));

import ApplyClient from "./ApplyClient";

afterEach(cleanup);

describe("<ApplyClient />", () => {
  it("shows the founding banner and the sidebar before submission", () => {
    render(<ApplyClient />);
    expect(screen.getByText("Founding Artist Offer")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "The Application" })).toBeTruthy();
  });

  it("hides both once the application is submitted", () => {
    render(<ApplyClient />);
    fireEvent.click(screen.getByText("fake submit"));
    expect(screen.queryByText("Founding Artist Offer")).toBeNull();
    expect(screen.queryByRole("heading", { name: "The Application" })).toBeNull();
  });
});
