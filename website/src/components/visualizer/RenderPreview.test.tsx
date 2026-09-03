// @vitest-environment jsdom
// The preview modal shows the editor's own capture (a blob URL through a
// plain <img>), offers Save to wall on saved walls, keeps the venue
// anti-save behaviour, and no longer talks about cache or render units.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import RenderPreview from "./RenderPreview";

afterEach(() => cleanup());

const URL_ = "blob:http://localhost/abc-123";

describe("<RenderPreview />", () => {
  it("renders nothing when closed or without an image", () => {
    const { container } = render(<RenderPreview open={false} onClose={() => {}} imageUrl={URL_} />);
    expect(container.firstChild).toBeNull();
    cleanup();
    const second = render(<RenderPreview open onClose={() => {}} imageUrl={null} />);
    expect(second.container.firstChild).toBeNull();
  });

  it("shows the captured image straight from the blob URL with download and open links", () => {
    render(<RenderPreview open onClose={() => {}} imageUrl={URL_} downloadName="wall-preview.webp" />);
    const img = screen.getByRole("img", { name: "Wall preview" });
    expect(img.getAttribute("src")).toBe(URL_);

    const download = screen.getByRole("link", { name: "Download" });
    expect(download.getAttribute("href")).toBe(URL_);
    expect(download.getAttribute("download")).toBe("wall-preview.webp");
    expect(screen.getByRole("link", { name: "Open in new tab" }).getAttribute("href")).toBe(URL_);

    // The old footer talked about cache hits and render units; gone.
    expect(document.body.textContent).not.toMatch(/render unit|cache/i);
    expect(screen.getByRole("dialog").getAttribute("aria-label")).toBe("Wall preview");
  });

  it("hides Download and Open in new tab for venue viewers and blocks casual saves", () => {
    render(<RenderPreview open onClose={() => {}} imageUrl={URL_} venueViewer />);
    expect(screen.queryByRole("link", { name: "Download" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Open in new tab" })).toBeNull();
    const img = screen.getByRole("img", { name: "Wall preview" });
    expect(img.getAttribute("draggable")).toBe("false");
    expect(img.className).toMatch(/pointer-events-none/);
  });

  it("closes on Escape, backdrop click and the Close button, but not on clicks inside", () => {
    const onClose = vi.fn();
    render(<RenderPreview open onClose={onClose} imageUrl={URL_} />);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole("img", { name: "Wall preview" }));
    expect(onClose).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  describe("save to wall", () => {
    const base = {
      label: "Save this preview to my wall",
      hint: "Shown on My Walls and, if the wall is public, on your venue page.",
      error: null,
    };

    it("offers the primary save action with the caller's copy", () => {
      const onSave = vi.fn();
      render(
        <RenderPreview
          open
          onClose={() => {}}
          imageUrl={URL_}
          saveToWall={{ ...base, onSave, status: "idle" }}
        />,
      );
      const button = screen.getByRole("button", { name: "Save this preview to my wall" });
      expect(screen.getByText(base.hint)).toBeTruthy();
      fireEvent.click(button);
      expect(onSave).toHaveBeenCalledTimes(1);
    });

    it("disables the button while saving and once saved", () => {
      const { rerender } = render(
        <RenderPreview
          open
          onClose={() => {}}
          imageUrl={URL_}
          saveToWall={{ ...base, onSave: () => {}, status: "saving" }}
        />,
      );
      const saving = screen.getByRole("button", { name: "Saving…" }) as HTMLButtonElement;
      expect(saving.disabled).toBe(true);

      rerender(
        <RenderPreview
          open
          onClose={() => {}}
          imageUrl={URL_}
          saveToWall={{ ...base, onSave: () => {}, status: "saved" }}
        />,
      );
      const saved = screen.getByRole("button", { name: "Saved" }) as HTMLButtonElement;
      expect(saved.disabled).toBe(true);
      expect(screen.getByText("This preview is now saved to your wall.")).toBeTruthy();
    });

    it("shows the error and offers a retry after a failed save", () => {
      const onSave = vi.fn();
      render(
        <RenderPreview
          open
          onClose={() => {}}
          imageUrl={URL_}
          saveToWall={{ ...base, onSave, status: "error", error: "Save failed (500)" }}
        />,
      );
      expect(screen.getByText("Save failed (500)")).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
      expect(onSave).toHaveBeenCalledTimes(1);
    });

    it("is absent when the caller has no saved wall", () => {
      render(<RenderPreview open onClose={() => {}} imageUrl={URL_} />);
      expect(screen.queryByText(/save this preview/i)).toBeNull();
    });
  });

  describe("save as a buyer-facing mockup", () => {
    const works = [
      { id: "w1", title: "Harbour Light", image: "https://cdn/h.jpg" },
      { id: "w2", title: "Blue Hour", image: "https://cdn/b.jpg" },
    ];

    it("pre-selects the preferred work and saves against it", () => {
      const onSave = vi.fn(async () => {});
      render(
        <RenderPreview
          open
          onClose={() => {}}
          imageUrl={URL_}
          saveToArtwork={{
            works,
            preferredWorkId: "w2",
            onSave,
            saving: false,
            savedWorkId: null,
            error: null,
          }}
        />,
      );
      const select = screen.getByRole("combobox", { name: /artwork to attach/i }) as HTMLSelectElement;
      expect(select.value).toBe("w2");
      fireEvent.click(screen.getByRole("button", { name: "Save to artwork" }));
      expect(onSave).toHaveBeenCalledWith("w2");
    });

    it("reads Saved for the work it was just attached to", () => {
      render(
        <RenderPreview
          open
          onClose={() => {}}
          imageUrl={URL_}
          saveToArtwork={{
            works,
            preferredWorkId: "w1",
            onSave: async () => {},
            saving: false,
            savedWorkId: "w1",
            error: null,
          }}
        />,
      );
      const saved = screen.getByRole("button", { name: "Saved" }) as HTMLButtonElement;
      expect(saved.disabled).toBe(true);
    });
  });
});


describe("<RenderPreview /> stays reachable on short screens", () => {
  it("scrolls the overlay and caps the image height so the strip under it is never below the fold", () => {
    render(
      <RenderPreview
        open
        onClose={() => {}}
        imageUrl={URL_}
        proposal={{
          venue: { slug: "v", name: "Testing Venue", interestedInRevenueShare: true, interestedInFreeLoan: false, interestedInDirectPurchase: false },
          wallName: "Photo Rail Wall",
          status: "idle",
          error: null,
          onSend: () => {},
        }}
      />,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog.className).toContain("overflow-y-auto");
    const img = screen.getByAltText("Wall preview");
    expect(img.className).toContain("max-h-[62vh]");
    expect(screen.getByRole("button", { name: "Send to Testing Venue" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Fullscreen" })).toBeTruthy();
  });
});
