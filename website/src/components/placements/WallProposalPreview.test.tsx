// @vitest-environment jsdom
// The proposal capture shows as a captioned thumbnail in the placement card
// and opens full size on click; malformed API data reads as no proposal.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

import WallProposalPreview, { readWallProposal } from "./WallProposalPreview";

const PROPOSAL = { wallId: "wall-1", wallName: "Front room", previewUrl: "https://cdn.example/r1.webp" };

afterEach(() => cleanup());

describe("readWallProposal", () => {
  it("accepts the API shape and rejects anything else", () => {
    expect(readWallProposal(PROPOSAL)).toEqual(PROPOSAL);
    expect(readWallProposal({ ...PROPOSAL, wallName: " " })).toEqual({ ...PROPOSAL, wallName: "Untitled wall" });
    expect(readWallProposal(null)).toBeNull();
    expect(readWallProposal({ wallId: "w", wallName: "x" })).toBeNull();
    expect(readWallProposal({ wallId: "w", wallName: "x", previewUrl: "" })).toBeNull();
    expect(readWallProposal("nope")).toBeNull();
  });
});

describe("<WallProposalPreview />", () => {
  it("shows the thumbnail with its caption and opens the capture full size", () => {
    render(<WallProposalPreview proposal={PROPOSAL} caption="See it on your Front room wall" />);
    expect(screen.getByText("See it on your Front room wall")).toBeTruthy();
    expect(screen.getAllByRole("img")[0].getAttribute("src")).toBe(PROPOSAL.previewUrl);
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /See it on your Front room wall/ }));
    const dialog = screen.getByRole("dialog", { name: "See it on your Front room wall" });
    expect(dialog.querySelector("img")?.getAttribute("src")).toBe(PROPOSAL.previewUrl);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes on the backdrop and the close button, not on the picture", () => {
    render(<WallProposalPreview proposal={PROPOSAL} caption="Your proposal on Front room" />);
    fireEvent.click(screen.getByRole("button", { name: /Your proposal on Front room/ }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(dialog.querySelector("img")!);
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Your proposal on Front room/ }));
    fireEvent.click(screen.getByRole("dialog"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
