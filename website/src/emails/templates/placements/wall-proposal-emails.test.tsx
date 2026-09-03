// Both halves of an artist-initiated request carry the wall proposal capture
// when there is one: the venue sees how the artist pictured it on their wall,
// the artist's receipt shows the same picture. Without a proposal, neither
// template mentions a wall.

import { describe, expect, it } from "vitest";
import { render } from "@react-email/components";
import { VenueNewPlacementRequest, mock as venueMock } from "./VenueNewPlacementRequest";
import { ArtistPlacementRequestSent, mock as artistMock } from "./ArtistPlacementRequestSent";

const PREVIEW = "https://cdn.example/wall-renders/u-artist/r1.webp";

describe("VenueNewPlacementRequest with a wall proposal", () => {
  it("shows the capture with its caption and a link to the request", async () => {
    const html = await render(
      <VenueNewPlacementRequest {...venueMock} wallPreviewUrl={PREVIEW} wallName="Lobby" />,
    );
    expect(html).toContain(`src="${PREVIEW}"`);
    expect(html).toContain(`How ${venueMock.artist.name} pictured it on your Lobby wall.`);
    expect(html).toContain("Open the request");
  });

  it("says nothing about a wall when the request was not laid out on one", async () => {
    const html = await render(
      <VenueNewPlacementRequest {...venueMock} wallPreviewUrl={undefined} wallName={undefined} />,
    );
    expect(html).not.toContain("pictured it on your");
    expect(html).not.toContain(PREVIEW);
  });

  it("needs both the URL and the wall name", async () => {
    const html = await render(
      <VenueNewPlacementRequest {...venueMock} wallPreviewUrl={PREVIEW} wallName={undefined} />,
    );
    expect(html).not.toContain(PREVIEW);
  });
});

describe("ArtistPlacementRequestSent with a wall proposal", () => {
  it("shows the same capture on the artist's receipt", async () => {
    const html = await render(
      <ArtistPlacementRequestSent {...artistMock} wallPreviewUrl={PREVIEW} wallName="Lobby" />,
    );
    expect(html).toContain(`src="${PREVIEW}"`);
    expect(html).toContain("Your proposal on their Lobby wall");
  });

  it("omits it without a proposal", async () => {
    const html = await render(
      <ArtistPlacementRequestSent {...artistMock} wallPreviewUrl={undefined} wallName={undefined} />,
    );
    expect(html).not.toContain("Your proposal on their");
  });
});
