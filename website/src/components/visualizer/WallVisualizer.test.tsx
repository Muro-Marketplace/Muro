// @vitest-environment jsdom
//
// Preview replaces Render. The owner's complaint: lining artwork up to a
// photo rail in the editor, then pressing Render, moved everything,
// because the server compositor rebuilt the scene with its own maths.
// Preview is now a capture of the editor stage itself, so nothing can
// shift, nothing is fetched, and nothing is metered. Saving the preview
// stores that same capture against the wall.
//
// The canvases are stubbed at the module boundary. They receive the
// capture handle target through the `handleRef` prop, exactly as the
// real canvases do, so the wiring through next/dynamic is exercised
// (a real `ref` would be swallowed by its loadable wrapper here).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Ref } from "react";

const { captureImageMock, capture3dMock, fetchMock } = vi.hoisted(() => ({
  captureImageMock: vi.fn(),
  capture3dMock: vi.fn(),
  fetchMock: vi.fn(),
}));

type Handle = { captureImage: () => Promise<Blob> };
type StubProps = { handleRef?: Ref<Handle>; selectedItemId?: string | null };

vi.mock("./WallCanvas", async () => {
  const React = await import("react");
  function WallCanvasStub(props: StubProps) {
    React.useImperativeHandle(props.handleRef, () => ({ captureImage: captureImageMock }));
    return React.createElement("div", {
      "data-testid": "wall-canvas",
      "data-selected": String(props.selectedItemId ?? ""),
    });
  }
  return { default: WallCanvasStub };
});

vi.mock("./Wall3DCanvas", async () => {
  const React = await import("react");
  function Wall3DCanvasStub(props: StubProps) {
    React.useImperativeHandle(props.handleRef, () => ({ captureImage: capture3dMock }));
    return React.createElement("div", { "data-testid": "wall-3d-canvas" });
  }
  return { default: Wall3DCanvasStub };
});

vi.mock("./WorksPanel", () => ({ default: () => null }));

import WallVisualizer from "./WallVisualizer";
import { isFeedbackBubbleHidden, _resetFeedbackBubbleVisibility } from "@/lib/ui/feedback-bubble-visibility";
import { TAINTED_MESSAGE, UNSUPPORTED_3D_MESSAGE } from "@/lib/visualizer/capture";
import type { Wall, WallLayout } from "@/lib/visualizer/types";

const WALL: Wall = {
  id: "wall-1",
  user_id: "u-venue",
  owner_type: "venue",
  name: "Front room",
  kind: "preset",
  preset_id: "minimal_white",
  source_image_path: null,
  width_cm: 300,
  height_cm: 240,
  wall_color_hex: "F5F1EB",
  perspective_homography: null,
  segmentation_mask_path: null,
  notes: null,
  is_public_on_profile: true,
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
};

const LAYOUT: WallLayout = {
  id: "lay-1",
  wall_id: "wall-1",
  user_id: "u-venue",
  name: "Layout 1",
  items: [
    {
      id: "item-1",
      work_id: "work-1",
      x_cm: 40,
      y_cm: 30,
      width_cm: 60,
      height_cm: 80,
      rotation_deg: 0,
      z_index: 0,
      frame: { style: "none", finish: "", depth_mm: 0 },
    },
  ],
  layout_hash: null,
  last_render_id: null,
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
};

const LOCKED_WORK = {
  id: "work-1",
  title: "Harbour Light",
  imageUrl: "https://images.example/harbour.jpg",
  dimensions: "60 x 80 cm",
  sizes: [],
  orientation: "portrait" as const,
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Default API surface: empty works lists, saves succeed, preview stores. */
function installFetch() {
  fetchMock.mockImplementation(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method ?? "GET";
    if (url.startsWith("/api/walls/my-works") || url.startsWith("/api/walls/saved-works")) {
      return json({ works: [] });
    }
    if (url.startsWith("/api/browse-artists")) return json({ artists: [] });
    if (url.startsWith("/api/artist-works")) return json({ works: [] });
    if (method === "PATCH") return json({ ok: true });
    if (url.endsWith("/preview") && method === "POST") {
      return json({
        render: { id: "render-77" },
        publicUrl: "https://cdn.example/wall-renders/u-venue/render-77.webp",
      });
    }
    if (url.includes("/mockups") && method === "POST") return json({ ok: true });
    return json({ error: `unexpected ${method} ${url}` }, 500);
  });
}

function calls(): Array<{ url: string; method: string; init?: RequestInit }> {
  return fetchMock.mock.calls.map(([input, init]) => ({
    url: typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url,
    method: (init as RequestInit | undefined)?.method ?? "GET",
    init: init as RequestInit | undefined,
  }));
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_FLAG_WALL_VISUALIZER_V1 = "1";
  _resetFeedbackBubbleVisibility();
  captureImageMock.mockReset();
  capture3dMock.mockReset();
  fetchMock.mockReset();
  installFetch();
  captureImageMock.mockResolvedValue(new Blob(["webp-bytes"], { type: "image/webp" }));
  vi.stubGlobal("fetch", fetchMock);
  let n = 0;
  vi.stubGlobal("URL", Object.assign(URL, {
    createObjectURL: vi.fn(() => `blob:mock-${++n}`),
    revokeObjectURL: vi.fn(),
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function mountVenueEditor() {
  const view = render(
    <WallVisualizer
      mode="venue_my_walls"
      wall={WALL}
      initialLayout={LAYOUT}
      authToken="tok-venue"
    />,
  );
  await screen.findByTestId("wall-canvas");
  return view;
}

describe("<WallVisualizer /> Preview", () => {
  it("offers Preview, never Render, and no quota chip", async () => {
    await mountVenueEditor();

    expect(screen.getByRole("button", { name: "Preview" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /render/i })).toBeNull();
    expect(document.body.textContent).not.toMatch(/daily renders|render unit/i);
    expect(calls().some((c) => c.url.startsWith("/api/walls/quota"))).toBe(false);
  });

  it("captures the editor and shows it, with no network call at all", async () => {
    await mountVenueEditor();
    const before = calls().length;

    fireEvent.click(screen.getByRole("button", { name: "Preview" }));

    const dialog = await screen.findByRole("dialog", { name: "Wall preview" });
    expect(captureImageMock).toHaveBeenCalledTimes(1);
    const img = dialog.querySelector("img");
    expect(img?.getAttribute("src")).toBe("blob:mock-1");
    expect(calls().length).toBe(before);
    expect(calls().some((c) => /\/render(-quick)?$/.test(c.url))).toBe(false);
  });

  it("drops the selection before capturing so the wall is captured at rest", async () => {
    await mountVenueEditor();
    // Nothing is selected on mount in venue mode; select through the
    // canvas stub's own prop is not possible, so assert the invariant the
    // capture relies on: the stub sees no selection at capture time.
    captureImageMock.mockImplementation(async () => {
      expect(screen.getByTestId("wall-canvas").getAttribute("data-selected")).toBe("");
      return new Blob(["x"], { type: "image/webp" });
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    await screen.findByRole("dialog", { name: "Wall preview" });
    expect(captureImageMock).toHaveBeenCalledTimes(1);
  });

  it("holds the feedback bubble hidden while mounted and releases it on unmount", async () => {
    expect(isFeedbackBubbleHidden()).toBe(false);
    const view = await mountVenueEditor();
    expect(isFeedbackBubbleHidden()).toBe(true);
    view.unmount();
    expect(isFeedbackBubbleHidden()).toBe(false);
  });

  it("revokes the object URL when a new capture replaces it and on unmount", async () => {
    const view = await mountVenueEditor();
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    await screen.findByRole("dialog", { name: "Wall preview" });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    await waitFor(() => expect(captureImageMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-1"));
    view.unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-2");
  });

  it("names a tainted image plainly instead of a generic failure", async () => {
    await mountVenueEditor();
    const err = new Error("The operation is insecure.");
    err.name = "SecurityError";
    captureImageMock.mockRejectedValue(err);

    fireEvent.click(screen.getByRole("button", { name: "Preview" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(TAINTED_MESSAGE);
    expect(screen.queryByRole("dialog", { name: "Wall preview" })).toBeNull();
  });

  it("tells a 3D user to switch to 2D when the scene can't be captured", async () => {
    await mountVenueEditor();
    fireEvent.click(screen.getByRole("tab", { name: "3D" }));
    await screen.findByTestId("wall-3d-canvas");
    capture3dMock.mockRejectedValue(new Error("drawing buffer unavailable"));

    fireEvent.click(screen.getByRole("button", { name: "Preview" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(UNSUPPORTED_3D_MESSAGE);
    expect(captureImageMock).not.toHaveBeenCalled();
  });

  it("refuses to preview an empty wall", async () => {
    render(
      <WallVisualizer
        mode="venue_my_walls"
        wall={WALL}
        initialLayout={{ ...LAYOUT, items: [] }}
        authToken="tok-venue"
      />,
    );
    await screen.findByTestId("wall-canvas");
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/drag at least one artwork/i);
    expect(captureImageMock).not.toHaveBeenCalled();
  });
});

describe("<WallVisualizer /> Save this preview to my wall", () => {
  it("flushes the layout save, uploads the capture with the bearer token, then reads Saved", async () => {
    await mountVenueEditor();
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    await screen.findByRole("dialog", { name: "Wall preview" });

    fireEvent.click(screen.getByRole("button", { name: "Save this preview to my wall" }));

    await screen.findByRole("button", { name: "Saved" });
    expect(screen.getByText("This preview is now saved to your wall.")).toBeTruthy();

    const writes = calls().filter((c) => c.method !== "GET");
    expect(writes.map((c) => `${c.method} ${c.url}`)).toEqual([
      "PATCH /api/walls/wall-1/layouts/lay-1",
      "POST /api/walls/wall-1/layouts/lay-1/preview",
    ]);

    const upload = writes[1].init!;
    expect((upload.headers as Record<string, string>).Authorization).toBe("Bearer tok-venue");
    expect(upload.body).toBeInstanceOf(FormData);
    const part = (upload.body as FormData).get("image");
    expect(part).toBeInstanceOf(Blob);
    expect((part as File).name).toBe("wall-preview.webp");
    expect((part as Blob).type).toBe("image/webp");
  });

  it("does not report Saved when the upload is refused", async () => {
    fetchMock.mockImplementation(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : String(input);
      const method = init?.method ?? "GET";
      if (url.endsWith("/preview") && method === "POST") {
        return json({ error: "Preview too large. Max 8 MB." }, 413);
      }
      if (method === "PATCH") return json({ ok: true });
      return json({ works: [], artists: [] });
    });
    await mountVenueEditor();
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    await screen.findByRole("dialog", { name: "Wall preview" });

    fireEvent.click(screen.getByRole("button", { name: "Save this preview to my wall" }));

    expect(await screen.findByText("Preview too large. Max 8 MB.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Saved" })).toBeNull();
  });

  it("stops before uploading when the layout itself fails to save", async () => {
    fetchMock.mockImplementation(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : String(input);
      const method = init?.method ?? "GET";
      if (method === "PATCH") return new Response("boom", { status: 500 });
      if (url.endsWith("/preview") && method === "POST") return json({ render: { id: "r" }, publicUrl: "u" });
      return json({ works: [], artists: [] });
    });
    await mountVenueEditor();
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    await screen.findByRole("dialog", { name: "Wall preview" });

    fireEvent.click(screen.getByRole("button", { name: "Save this preview to my wall" }));

    await screen.findByText(/layout couldn't be saved/i);
    expect(calls().some((c) => c.url.endsWith("/preview"))).toBe(false);
  });

  it("uploads once per capture: a mockup save after Save to wall reuses the render id", async () => {
    render(
      <WallVisualizer
        mode="artist_mockup"
        wall={{ ...WALL, owner_type: "artist" }}
        initialLayout={LAYOUT}
        authToken="tok-artist"
        lockedWork={LOCKED_WORK}
      />,
    );
    await screen.findByTestId("wall-canvas");
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    await screen.findByRole("dialog", { name: "Wall preview" });

    fireEvent.click(screen.getByRole("button", { name: "Save to wall" }));
    await screen.findByRole("button", { name: "Saved" });

    fireEvent.click(screen.getByRole("button", { name: "Save to artwork" }));
    await waitFor(() =>
      expect(calls().some((c) => c.url === "/api/works/work-1/mockups" && c.method === "POST")).toBe(true),
    );

    const previewUploads = calls().filter((c) => c.url.endsWith("/preview"));
    expect(previewUploads).toHaveLength(1);
    const mockupCall = calls().find((c) => c.url === "/api/works/work-1/mockups")!;
    expect(JSON.parse(mockupCall.init!.body as string)).toEqual({ render_id: "render-77" });
  });
});

describe("<WallVisualizer /> customer artwork sheet", () => {
  it("auto-places the locked work and offers Preview only, nothing persisted", async () => {
    render(
      <WallVisualizer mode="customer_artwork_page" lockedWork={LOCKED_WORK} authToken={null} />,
    );
    await screen.findByTestId("wall-canvas");

    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: "Preview" }));
    });

    await screen.findByRole("dialog", { name: "Wall preview" });
    expect(screen.queryByText(/save this preview/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /save to wall/i })).toBeNull();
    expect(calls().filter((c) => c.method !== "GET")).toEqual([]);
    // Download stays available to non-venue viewers, straight from the blob.
    expect(screen.getByRole("link", { name: "Download" }).getAttribute("href")).toBe("blob:mock-1");
  });
});
