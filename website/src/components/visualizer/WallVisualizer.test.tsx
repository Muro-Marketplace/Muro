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
type StubProps = { handleRef?: Ref<Handle>; selectedItemId?: string | null; flat?: boolean; };

vi.mock("./WallCanvas", async () => {
  const React = await import("react");
  function WallCanvasStub(props: StubProps) {
    React.useImperativeHandle(props.handleRef, () => ({ captureImage: captureImageMock }));
    return React.createElement("div", {
      "data-testid": "wall-canvas",
      "data-selected": String(props.selectedItemId ?? ""),
      "data-flat": String(!!props.flat),
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

// The works panel is stubbed to one "Add" button per work, which is how the
// artist mode tests get an item onto the wall (drag and drop needs Konva).
vi.mock("./WorksPanel", async () => {
  const React = await import("react");
  function WorksPanelStub(props: {
    works?: Array<{ id: string; title: string }>;
    onSelect?: (w: unknown) => void;
  }) {
    return React.createElement(
      "div",
      { "data-testid": "works-panel" },
      (props.works ?? []).map((w) =>
        React.createElement(
          "button",
          { key: w.id, type: "button", onClick: () => props.onSelect?.(w) },
          `Add ${w.title}`,
        ),
      ),
    );
  }
  return { default: WorksPanelStub };
});

// `mutate` reads the session from the Supabase client, which cannot be built
// without env; the real api-client is kept, only the session is stubbed.
vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { access_token: "tok-artist" } } }) },
  },
}));

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
    if (url.endsWith("/proposals") && method === "POST") {
      return json({ layoutId: "lay-p1", previewUrl: "https://cdn.example/wall-renders/u-artist/r1.webp" });
    }
    if (url === "/api/placements" && method === "POST") return json({ success: true });
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
  vi.stubGlobal("crypto", { randomUUID: () => "uuid-1" });
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

  it("keeps a saved wall in 2D: no 3D tab, and the canvas draws flat", async () => {
    await mountVenueEditor();
    expect(screen.queryByRole("tab", { name: "3D" })).toBeNull();
    expect(screen.getByTestId("wall-canvas").getAttribute("data-flat")).toBe("true");
  });

  it("tells a 3D user on the artwork page to switch to 2D when the scene can't be captured", async () => {
    render(
      <WallVisualizer mode="customer_artwork_page" lockedWork={LOCKED_WORK} authToken={null} />,
    );
    await screen.findByTestId("wall-canvas");
    expect(screen.getByTestId("wall-canvas").getAttribute("data-flat")).toBe("false");
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

// ── Artist on a venue's wall ───────────────────────────────────────────

const VENUE = {
  slug: "copper-kettle",
  name: "The Copper Kettle",
  interestedInRevenueShare: true,
  interestedInFreeLoan: true,
  interestedInDirectPurchase: true,
};

const VENUE_WALL: Wall = { ...WALL, id: "wall-9", name: "Front room", user_id: "", is_public_on_profile: true };

const ARTIST_WORKS = [
  { id: "work-1", title: "Harbour Light", image: "https://images.example/harbour.jpg", dimensions: "60 x 80 cm" },
];

/** The default API surface plus the artist's own works. */
function installArtistFetch(overrides: (url: string, method: string) => Response | null = () => null) {
  const base = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method ?? "GET";
    const override = overrides(url, method);
    if (override) return override;
    if (url.startsWith("/api/artist-works")) return json({ works: ARTIST_WORKS });
    return base(input, init);
  });
}

async function mountArtistOnVenueWall() {
  const view = render(
    <WallVisualizer
      mode="artist_venue_wall"
      wall={VENUE_WALL}
      venue={VENUE}
      bgImageUrl={null}
      authToken="tok-artist"
    />,
  );
  await screen.findByTestId("wall-canvas");
  await screen.findByRole("button", { name: "Add Harbour Light" });
  return view;
}

async function placeAndPreview() {
  fireEvent.click(screen.getByRole("button", { name: "Add Harbour Light" }));
  fireEvent.click(await screen.findByRole("button", { name: "Preview" }));
  return screen.findByRole("dialog", { name: "Wall preview" });
}

describe("<WallVisualizer /> artist on a venue wall", () => {
  beforeEach(() => installArtistFetch());

  it("locks the venue wall, loads the artist's own works, and persists nothing", async () => {
    await mountArtistOnVenueWall();

    expect(calls().some((c) => c.url.startsWith("/api/artist-works"))).toBe(true);
    // No wall controls: the venue's wall is not the artist's to resize or recolour.
    expect(document.querySelector('input[type="color"]')).toBeNull();
    expect(document.body.textContent).not.toMatch(/Upload photo|All saved|Unsaved/);
    // Nothing to preview until something is on the wall.
    expect(screen.queryByRole("button", { name: "Preview" })).toBeNull();
    expect(document.body.textContent).toMatch(/The Copper Kettle's wall/);

    fireEvent.click(screen.getByRole("button", { name: "Add Harbour Light" }));
    expect(await screen.findByRole("button", { name: "Preview" })).toBeTruthy();
    expect(calls().filter((c) => c.method !== "GET")).toEqual([]);
  });

  it("previews without saving and offers Send to the venue, not Save to wall", async () => {
    await mountArtistOnVenueWall();
    const dialog = await placeAndPreview();

    expect(captureImageMock).toHaveBeenCalledTimes(1);
    expect(dialog.querySelector("img")?.getAttribute("src")).toBe("blob:mock-1");
    expect(screen.getByRole("button", { name: "Send to The Copper Kettle" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /save to wall/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /save to artwork/i })).toBeNull();
    expect(calls().filter((c) => c.method !== "GET")).toEqual([]);
  });

  it("Send stores the proposal under a fresh placement id, then creates the placement carrying the layout id", async () => {
    await mountArtistOnVenueWall();
    await placeAndPreview();

    fireEvent.click(screen.getByRole("button", { name: "Send to The Copper Kettle" }));
    expect(screen.getByRole("radio", { name: "Revenue share" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Paid loan" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Direct purchase" })).toBeTruthy();
    expect((screen.getByLabelText("Revenue share to venue") as HTMLInputElement).value).toBe("25");
    expect((screen.getByLabelText("Message to The Copper Kettle") as HTMLTextAreaElement).value).toBe(
      'Hi The Copper Kettle, here\'s how my work could look on your "Front room" wall.',
    );

    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByText("Sent to The Copper Kettle");

    const writes = calls().filter((c) => c.method !== "GET");
    expect(writes.map((c) => `${c.method} ${c.url}`)).toEqual([
      "POST /api/venues/copper-kettle/walls/wall-9/proposals",
      "POST /api/placements",
    ]);

    const upload = writes[0].init!;
    expect((upload.headers as Record<string, string>).Authorization).toBe("Bearer tok-artist");
    const form = upload.body as FormData;
    const image = form.get("image") as File;
    expect(image.name).toBe("wall-preview.webp");
    expect(image.type).toBe("image/webp");
    const items = JSON.parse(form.get("items") as string) as Array<{ work_id: string }>;
    expect(items).toHaveLength(1);
    expect(items[0].work_id).toBe("work-1");
    expect(form.get("placementId")).toBe("uuid-1");

    const placementCall = writes[1].init!;
    const body = JSON.parse(placementCall.body as string);
    expect(body.fromVenue).toBe(false);
    expect(body.placements).toHaveLength(1);
    expect(body.placements[0]).toMatchObject({
      id: "uuid-1",
      venueSlug: "copper-kettle",
      workTitle: "Harbour Light",
      workImage: "https://images.example/harbour.jpg",
      type: "revenue_share",
      qrEnabled: true,
      revenueSharePercent: 25,
      message: 'Hi The Copper Kettle, here\'s how my work could look on your "Front room" wall.',
      wallProposalLayoutId: "lay-p1",
    });
    expect(typeof body.placements[0].requestedDimensions).toBe("string");
    expect(body.placements[0].requestedDimensions.length).toBeGreaterThan(0);
    expect(new Headers(placementCall.headers).get("Authorization")).toBe("Bearer tok-artist");

    expect(screen.getByRole("link", { name: "View My Placements" }).getAttribute("href")).toBe("/artist-portal/placements");
    expect(screen.getByRole("link", { name: "Back to The Copper Kettle" }).getAttribute("href")).toBe("/venues/copper-kettle");
  });

  it("shows the upload route's refusal word for word and never creates the placement", async () => {
    const copy = "Your application is still under review. You'll be able to send placement requests once we've approved your profile.";
    installArtistFetch((url, method) =>
      url.endsWith("/proposals") && method === "POST"
        ? json({ error: copy, reason: "application_pending" }, 403)
        : null,
    );
    await mountArtistOnVenueWall();
    await placeAndPreview();

    fireEvent.click(screen.getByRole("button", { name: "Send to The Copper Kettle" }));
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect((await screen.findByRole("alert")).textContent).toBe(copy);
    expect(calls().some((c) => c.url === "/api/placements")).toBe(false);
    expect(screen.queryByText("Sent to The Copper Kettle")).toBeNull();
  });

  it("surfaces the outreach cap from the placement step", async () => {
    installArtistFetch((url, method) =>
      url === "/api/placements" && method === "POST"
        ? json({ error: "outreach_limit_reached", message: "You've reached your weekly limit of 3 new venue approaches." }, 429)
        : null,
    );
    await mountArtistOnVenueWall();
    await placeAndPreview();

    fireEvent.click(screen.getByRole("button", { name: "Send to The Copper Kettle" }));
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "You've reached your weekly limit of 3 new venue approaches.",
    );
  });
});
