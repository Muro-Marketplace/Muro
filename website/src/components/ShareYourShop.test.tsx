// @vitest-environment jsdom
//
// Until this component existed there was no way for an artist to get a link to
// their own shop. /artist-portal/labels makes per-artwork print labels, and
// nothing anywhere produced a URL or a code for the profile as a whole, so the
// "share your shop" pitch on the marketing site had nothing behind it.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const generateQRDataURL = vi.hoisted(() =>
  vi.fn(async () => "data:image/png;base64,QRPLACEHOLDER"),
);
vi.mock("@/lib/qr", () => ({ generateQRDataURL }));

import ShareYourShop from "./ShareYourShop";

const writeText = vi.fn(async () => {});

beforeEach(() => {
  process.env.NEXT_PUBLIC_SITE_URL = "https://wallplace.co.uk";
  vi.clearAllMocks();
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
});
afterEach(() => cleanup());

describe("<ShareYourShop />", () => {
  it("shows the short URL, not the canonical /browse one", async () => {
    // The point of the whole feature is a link an artist is willing to post.
    render(<ShareYourShop slug="fin-coles" />);
    expect(screen.getByText("wallplace.co.uk/fin-coles")).toBeTruthy();
    expect(screen.queryByText(/\/browse\//)).toBeNull();
  });

  it("copies the absolute URL, so it is pasteable straight into a bio", async () => {
    // The displayed form drops the scheme for readability. Pasting that into
    // Instagram's website field gives an unclickable string, so the copy has to
    // carry https://.
    render(<ShareYourShop slug="fin-coles" />);
    await userEvent.click(screen.getByRole("button", { name: /copy/i }));
    expect(writeText).toHaveBeenCalledWith("https://wallplace.co.uk/fin-coles");
  });

  it("confirms the copy happened", async () => {
    render(<ShareYourShop slug="fin-coles" />);
    await userEvent.click(screen.getByRole("button", { name: /copy/i }));
    await waitFor(() => expect(screen.getByText(/copied/i)).toBeTruthy());
  });

  it("survives a clipboard the browser refuses", async () => {
    // Safari denies clipboard writes outside a user gesture it recognises, and
    // an unhandled rejection here would blank the portal page.
    writeText.mockRejectedValueOnce(new Error("denied"));
    render(<ShareYourShop slug="fin-coles" />);
    await userEvent.click(screen.getByRole("button", { name: /copy/i }));
    await waitFor(() => expect(screen.getByText(/wallplace\.co\.uk/)).toBeTruthy());
  });

  describe("full variant", () => {
    it("generates the QR for the shop URL, not the browse URL", async () => {
      render(<ShareYourShop slug="fin-coles" variant="full" />);
      await waitFor(() =>
        expect(generateQRDataURL).toHaveBeenCalledWith(
          "https://wallplace.co.uk/fin-coles",
          expect.any(Number),
        ),
      );
    });

    it("offers the QR as a download named for the artist", async () => {
      render(<ShareYourShop slug="fin-coles" variant="full" />);
      const link = await screen.findByRole("link", { name: /download/i });
      expect(link.getAttribute("download")).toBe("wallplace-shop-fin-coles.png");
      expect(link.getAttribute("href")).toBe("data:image/png;base64,QRPLACEHOLDER");
    });

    it("tells the artist where to put the link", async () => {
      render(<ShareYourShop slug="fin-coles" variant="full" />);
      expect(screen.getByText(/bio/i)).toBeTruthy();
    });
  });

  describe("compact variant", () => {
    it("is the default", () => {
      render(<ShareYourShop slug="fin-coles" />);
      expect(screen.queryByRole("link", { name: /download/i })).toBeNull();
    });

    it("does not pay for a QR it never shows", () => {
      render(<ShareYourShop slug="fin-coles" />);
      expect(generateQRDataURL).not.toHaveBeenCalled();
    });

    it("points at the profile page, where the QR and the rest live", () => {
      render(<ShareYourShop slug="fin-coles" />);
      const link = screen.getByRole("link", { name: /share|more|shop/i });
      expect(link.getAttribute("href")).toBe("/artist-portal/profile");
    });
  });

  it("renders nothing before the artist's slug is known", () => {
    // useCurrentArtist resolves asynchronously. A half-built URL like
    // "wallplace.co.uk/" is worse than no block at all.
    const { container } = render(<ShareYourShop slug="" />);
    expect(container.textContent).toBe("");
  });
});
