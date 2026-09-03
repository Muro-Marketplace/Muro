// @vitest-environment jsdom
// Inline "quick add" card for the profile editor's Works section (see
// src/app/(pages)/artist-portal/profile/page.tsx). Posts straight to
// POST /api/artist-works via mutate(), mirroring the Portfolio single-work
// form's upload bucket ("artworks") and payload shape.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";

const { mutateMock, uploadImageMock, showToastMock } = vi.hoisted(() => ({
  mutateMock: vi.fn(),
  uploadImageMock: vi.fn(),
  showToastMock: vi.fn(),
}));

vi.mock("@/lib/upload", () => ({ uploadImage: uploadImageMock }));
// api-client.ts imports the real Supabase client module at load time, which
// throws without env vars. Stub it so requiring the *actual* api-client
// below (to keep the real ApiError class) doesn't blow up in test.
vi.mock("@/lib/supabase", () => ({ supabase: { auth: {}, from: () => ({}) } }));
// Keep the real ApiError (the component uses `instanceof`); override only mutate.
vi.mock("@/lib/api-client", async (orig) => {
  const actual = await orig<typeof import("@/lib/api-client")>();
  return { ...actual, mutate: mutateMock };
});
vi.mock("@/context/ToastContext", () => ({ useToast: () => ({ showToast: showToastMock }) }));

import QuickAddWork from "./QuickAddWork";
import { ApiError } from "@/lib/api-client";

// jsdom doesn't implement object URLs.
URL.createObjectURL = vi.fn(() => "blob:mock");

function pngFile(name = "art.png") {
  return new File(["x"], name, { type: "image/png" });
}

function fillTitleAndImage(title = "Sunset") {
  fireEvent.change(screen.getByLabelText("Title"), { target: { value: title } });
  fireEvent.change(screen.getByLabelText("Image"), { target: { files: [pngFile()] } });
}

afterEach(() => cleanup());
beforeEach(() => {
  mutateMock.mockReset();
  uploadImageMock.mockReset();
  showToastMock.mockReset();
  uploadImageMock.mockResolvedValue("https://cdn.example/x.png");
  mutateMock.mockResolvedValue({ savedRow: { id: "server-generated-id" } });
});

describe("QuickAddWork", () => {
  it("disables Save until both a title and an image are present", () => {
    render(<QuickAddWork onAdded={vi.fn()} onCancel={vi.fn()} />);
    const save = screen.getByRole("button", { name: "Save" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Sunset" } });
    expect(save.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText("Image"), { target: { files: [pngFile()] } });
    expect(save.disabled).toBe(false);
  });

  it("uploads to the artworks bucket and posts title, image, a single pricing entry, and available:false by default", async () => {
    const onAdded = vi.fn();
    render(<QuickAddWork onAdded={onAdded} onCancel={vi.fn()} />);

    fillTitleAndImage("Sunset over the marshes");
    fireEvent.change(screen.getByLabelText("Price (£)"), { target: { value: "150" } });

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(mutateMock).toHaveBeenCalledTimes(1));
    expect(uploadImageMock).toHaveBeenCalledWith(expect.any(File), "artworks");

    const [url, options] = mutateMock.mock.calls[0];
    expect(url).toBe("/api/artist-works");
    expect(options.method).toBe("POST");
    expect(options.headers).toEqual({ "Content-Type": "application/json" });

    const body = JSON.parse(options.body as string);
    expect(body.title).toBe("Sunset over the marshes");
    expect(body.image).toBe("https://cdn.example/x.png");
    expect(body.pricing).toEqual([{ label: "Original", price: 150 }]);
    expect(body.available).toBe(false);
    expect(typeof body.id).toBe("string");
    expect(body.id.length).toBeGreaterThan(0);

    await waitFor(() => expect(onAdded).toHaveBeenCalledTimes(1));
    const work = onAdded.mock.calls[0][0];
    expect(work.id).toBe("server-generated-id");
    expect(work.title).toBe("Sunset over the marshes");
    expect(work.image).toBe("https://cdn.example/x.png");
    expect(work.available).toBe(false);
    expect(work.pricing).toEqual([{ label: "Original", price: 150 }]);
  });

  it("uses the dimensions as the size label when no size label is entered", async () => {
    render(<QuickAddWork onAdded={vi.fn()} onCancel={vi.fn()} />);
    fillTitleAndImage();
    fireEvent.change(screen.getByLabelText("Dimensions"), { target: { value: "40 x 50 cm" } });
    fireEvent.change(screen.getByLabelText("Price (£)"), { target: { value: "80" } });

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(mutateMock).toHaveBeenCalledTimes(1));
    const body = JSON.parse(mutateMock.mock.calls[0][1].body as string);
    expect(body.pricing).toEqual([{ label: "40 x 50 cm", price: 80 }]);
  });

  it("sends available:true when the tick box is checked", async () => {
    render(<QuickAddWork onAdded={vi.fn()} onCancel={vi.fn()} />);
    fillTitleAndImage();
    fireEvent.click(screen.getByLabelText("Available to buy"));

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(mutateMock).toHaveBeenCalledTimes(1));
    const body = JSON.parse(mutateMock.mock.calls[0][1].body as string);
    expect(body.available).toBe(true);
  });

  it("surfaces the ApiError message via toast and does not call onAdded", async () => {
    const onAdded = vi.fn();
    mutateMock.mockRejectedValueOnce(
      new ApiError(
        402,
        "Publishing a work requires an active Wallplace subscription.",
        "subscription_required",
        {},
      ),
    );
    render(<QuickAddWork onAdded={onAdded} onCancel={vi.fn()} />);

    fillTitleAndImage();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(showToastMock).toHaveBeenCalledWith(
        "Publishing a work requires an active Wallplace subscription.",
        expect.objectContaining({ variant: "error" }),
      ),
    );
    expect(onAdded).not.toHaveBeenCalled();
  });

  it("calls onCancel when Cancel is clicked", () => {
    const onCancel = vi.fn();
    render(<QuickAddWork onAdded={vi.fn()} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
