// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import FrameOptionsEditor, { type FrameOptionFormEntry } from "./FrameOptionsEditor";
import { STANDARD_FRAMES, frameSwatchDataUri } from "@/data/frame-catalogue";
import { frameUpliftFor } from "@/app/(pages)/browse/[slug]/[workSlug]/frame-uplift";

const { uploadImageMock } = vi.hoisted(() => ({
  uploadImageMock: vi.fn(async () => "https://cdn.example.com/custom-frame.png"),
}));

vi.mock("@/lib/upload", () => ({ uploadImage: uploadImageMock }));

vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt?: string }) => <img src={src} alt={alt} />,
}));

// Mirrors the mock used for the venue signup form's Dropdown-driven
// tests: swap the real listbox for a native <select> so interaction is
// a plain fireEvent.change with no open/close/focus choreography to
// wait on, avoiding act() warnings from the real component's effects.
vi.mock("@/components/Dropdown", () => ({
  default: ({
    value,
    onChange,
    options,
    ariaLabel,
  }: {
    value: string;
    onChange: (v: string) => void;
    options: { value: string; label: string }[];
    ariaLabel?: string;
  }) => (
    <select aria-label={ariaLabel} value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  ),
}));

const SIZES = [
  { label: "A4", price: 50 },
  { label: "A2", price: 120 },
];

function Harness({
  initial = [],
  sizes = SIZES,
  onUploadError = () => {},
}: {
  initial?: FrameOptionFormEntry[];
  sizes?: { label: string; price: number }[];
  onUploadError?: (message: string) => void;
}) {
  const [frameOptions, setFrameOptions] = useState<FrameOptionFormEntry[]>(initial);
  return (
    <FrameOptionsEditor
      frameOptions={frameOptions}
      onChange={setFrameOptions}
      sizes={sizes}
      onUploadError={onUploadError}
    />
  );
}

afterEach(() => cleanup());
beforeEach(() => uploadImageMock.mockClear());

describe("<FrameOptionsEditor />", () => {
  it("lists all fifteen standard frames plus a custom option", () => {
    render(<Harness initial={[{ label: "", priceUplift: "" }]} />);
    const select = screen.getByRole("combobox", { name: "Frame" }) as HTMLSelectElement;
    const options = within(select).getAllByRole("option");
    expect(options).toHaveLength(STANDARD_FRAMES.length + 1);
    expect(options[options.length - 1].textContent).toBe("Custom frame");
  });

  it("defaults a freshly added frame to Custom frame with the upload control showing", () => {
    render(<Harness initial={[]} />);
    fireEvent.click(screen.getByText("+ Add frame option"));
    expect(screen.getAllByRole("textbox", { name: "Frame label" })).toHaveLength(1);
    expect((screen.getByRole("combobox", { name: "Frame" }) as HTMLSelectElement).value).toBe("custom");
    expect(document.querySelector('input[type="file"]')).toBeTruthy();
  });

  it("choosing a standard frame fills the label and sets the swatch data URI as the image", () => {
    render(<Harness initial={[{ label: "", priceUplift: "10" }]} />);
    const walnut = STANDARD_FRAMES.find((f) => f.id === "walnut")!;
    fireEvent.change(screen.getByRole("combobox", { name: "Frame" }), {
      target: { value: "walnut" },
    });
    const labelInput = screen.getByRole("textbox", { name: "Frame label" }) as HTMLInputElement;
    expect(labelInput.value).toBe("Walnut");
    const img = screen.getByAltText("Walnut") as HTMLImageElement;
    expect(img.getAttribute("src")).toBe(frameSwatchDataUri(walnut));
    // Standard frames show a fixed preview, not the upload control.
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });

  it("switching a standard frame back to custom clears the swatch and restores the upload control", () => {
    render(<Harness initial={[{ label: "", priceUplift: "10" }]} />);
    const select = screen.getByRole("combobox", { name: "Frame" }) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "walnut" } });
    expect(select.value).toBe("walnut");
    fireEvent.change(select, { target: { value: "custom" } });
    expect(select.value).toBe("custom");
    expect(screen.queryByAltText("Walnut")).toBeNull();
    expect(document.querySelector('input[type="file"]')).toBeTruthy();
    // The label the artist saw stays put, only the image resets.
    expect((screen.getByRole("textbox", { name: "Frame label" }) as HTMLInputElement).value).toBe("Walnut");
  });

  it("re-choosing custom while already custom does not touch an uploaded photo", async () => {
    render(<Harness initial={[{ label: "My frame", priceUplift: "10" }]} />);
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, {
      target: { files: [new File(["x"], "frame.png", { type: "image/png" })] },
    });
    const img = await screen.findByAltText("My frame");
    expect(img.getAttribute("src")).toBe("https://cdn.example.com/custom-frame.png");

    const select = screen.getByRole("combobox", { name: "Frame" }) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "custom" } });
    expect(screen.getByAltText("My frame").getAttribute("src")).toBe("https://cdn.example.com/custom-frame.png");
  });

  it("uploads a custom photo via uploadImage(file, \"artworks\") and shows it", async () => {
    render(<Harness initial={[{ label: "Box frame", priceUplift: "10" }]} />);
    const file = new File(["x"], "frame.png", { type: "image/png" });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });
    const img = await screen.findByAltText("Box frame");
    expect(img.getAttribute("src")).toBe("https://cdn.example.com/custom-frame.png");
    expect(uploadImageMock).toHaveBeenCalledWith(file, "artworks");
  });

  it("calls onUploadError when the upload fails, and does not throw", async () => {
    uploadImageMock.mockRejectedValueOnce(new Error("network down"));
    const onUploadError = vi.fn();
    render(<Harness initial={[{ label: "", priceUplift: "10" }]} onUploadError={onUploadError} />);
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, {
      target: { files: [new File(["x"], "frame.png", { type: "image/png" })] },
    });
    await waitFor(() => expect(onUploadError).toHaveBeenCalledWith("Frame image upload failed."));
  });

  it("shows a default-derived placeholder per size, writes pricesBySize on input, and clears it back", () => {
    render(<Harness initial={[{ label: "Oak", priceUplift: "20" }]} sizes={SIZES} />);
    const expectedA2Default = frameUpliftFor({ priceUplift: 20 }, "A2", SIZES);
    const a4Input = screen.getByRole("spinbutton", { name: "A4 frame price" }) as HTMLInputElement;
    const a2Input = screen.getByRole("spinbutton", { name: "A2 frame price" }) as HTMLInputElement;
    expect(a4Input.placeholder).toBe(String(frameUpliftFor({ priceUplift: 20 }, "A4", SIZES)));
    expect(a2Input.placeholder).toBe(String(expectedA2Default));

    fireEvent.change(a2Input, { target: { value: "55" } });
    expect(a2Input.value).toBe("55");
    expect(screen.getByText("clear")).toBeTruthy();

    fireEvent.click(screen.getByText("clear"));
    expect(a2Input.value).toBe("");
    expect(a2Input.placeholder).toBe(String(expectedA2Default));
    expect(screen.queryByText("clear")).toBeNull();
  });

  it("hides per-size rows when the work has fewer than two sizes", () => {
    render(
      <Harness
        initial={[{ label: "Oak", priceUplift: "20" }]}
        sizes={[{ label: "A4", price: 50 }]}
      />,
    );
    expect(screen.queryByRole("spinbutton", { name: "A4 frame price" })).toBeNull();
  });

  it("adds and removes frame rows", () => {
    render(<Harness initial={[]} />);
    fireEvent.click(screen.getByText("+ Add frame option"));
    fireEvent.click(screen.getByText("+ Add frame option"));
    expect(screen.getAllByRole("textbox", { name: "Frame label" })).toHaveLength(2);

    fireEvent.click(screen.getAllByRole("button", { name: "Remove frame option" })[0]);
    expect(screen.getAllByRole("textbox", { name: "Frame label" })).toHaveLength(1);
  });
});
