// Schemas are the boundary contract for the visualizer. We test:
//   - happy paths for each schema
//   - the boundary numbers (50–1000cm walls, 5–1000cm items, 50-item layout cap)
//   - the discriminated union picks the right shape per `kind`
//   - cross-field refines on the quick-render schema

import { describe, expect, it } from "vitest";
import {
  createLayoutSchema,
  createWallSchema,
  frameConfigSchema,
  quickRenderRequestSchema,
  renderRequestSchema,
  saveMockupSchema,
  updateLayoutSchema,
  updateWallSchema,
  wallItemSchema,
  wallLayoutItemsSchema,
} from "./validations";

const validFrame = { style: "thin_black", finish: "matte", depth_mm: 0 };

const validItem = {
  id: "item-1",
  work_id: "work-abc",
  x_cm: 10,
  y_cm: 20,
  width_cm: 60,
  height_cm: 80,
  rotation_deg: 0,
  z_index: 0,
  frame: validFrame,
};

describe("frameConfigSchema", () => {
  it("accepts every valid style", () => {
    for (const style of ["none", "thin_black", "classic_wood", "ornate_gold", "floater"]) {
      expect(frameConfigSchema.safeParse({ style, finish: "x", depth_mm: 0 }).success).toBe(true);
    }
  });

  it("rejects unknown styles", () => {
    expect(frameConfigSchema.safeParse({ style: "neon", finish: "x", depth_mm: 0 }).success).toBe(false);
  });

  it("clamps depth_mm to [0, 100]", () => {
    expect(frameConfigSchema.safeParse({ style: "none", finish: "", depth_mm: -1 }).success).toBe(false);
    expect(frameConfigSchema.safeParse({ style: "none", finish: "", depth_mm: 101 }).success).toBe(false);
    expect(frameConfigSchema.safeParse({ style: "none", finish: "", depth_mm: 50 }).success).toBe(true);
  });
});

describe("wallItemSchema", () => {
  it("accepts a valid item", () => {
    expect(wallItemSchema.safeParse(validItem).success).toBe(true);
  });

  it("rejects width below 5cm (catches metres-vs-cm slip)", () => {
    expect(wallItemSchema.safeParse({ ...validItem, width_cm: 0.6 }).success).toBe(false);
  });

  it("rejects rotation beyond ±15°", () => {
    expect(wallItemSchema.safeParse({ ...validItem, rotation_deg: 16 }).success).toBe(false);
    expect(wallItemSchema.safeParse({ ...validItem, rotation_deg: -16 }).success).toBe(false);
    expect(wallItemSchema.safeParse({ ...validItem, rotation_deg: 14.9 }).success).toBe(true);
  });

  it("allows partially-off-canvas positions during drag", () => {
    expect(wallItemSchema.safeParse({ ...validItem, x_cm: -50 }).success).toBe(true);
    expect(wallItemSchema.safeParse({ ...validItem, y_cm: 1500 }).success).toBe(true);
  });
});

describe("wallLayoutItemsSchema", () => {
  it("caps at 50 items per layout", () => {
    const fifty = Array.from({ length: 50 }, (_, i) => ({ ...validItem, id: `i-${i}` }));
    const fiftyOne = [...fifty, { ...validItem, id: "i-51" }];
    expect(wallLayoutItemsSchema.safeParse(fifty).success).toBe(true);
    expect(wallLayoutItemsSchema.safeParse(fiftyOne).success).toBe(false);
  });
});

describe("createWallSchema (discriminated)", () => {
  const presetBase = {
    kind: "preset" as const,
    name: "Café back wall",
    width_cm: 300,
    height_cm: 240,
    wall_color_hex: "F5F1EB",
    owner_type: "venue" as const,
    preset_id: "cafe_back_wall",
  };

  const uploadedBase = {
    kind: "uploaded" as const,
    name: "Real wall",
    width_cm: 300,
    height_cm: 240,
    owner_type: "venue" as const,
    source_image_path: "uploads/abc.jpg",
  };

  it("accepts a valid preset wall", () => {
    expect(createWallSchema.safeParse(presetBase).success).toBe(true);
  });

  it("accepts a valid uploaded wall", () => {
    expect(createWallSchema.safeParse(uploadedBase).success).toBe(true);
  });

  it("rejects preset without preset_id", () => {
    const { preset_id: _omit, ...bad } = presetBase;
    void _omit;
    expect(createWallSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects uploaded without source_image_path", () => {
    const { source_image_path: _omit, ...bad } = uploadedBase;
    void _omit;
    expect(createWallSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects walls smaller than 50cm", () => {
    expect(createWallSchema.safeParse({ ...presetBase, width_cm: 49 }).success).toBe(false);
  });

  it("rejects walls larger than 1000cm", () => {
    expect(createWallSchema.safeParse({ ...presetBase, width_cm: 1001 }).success).toBe(false);
  });

  it("rejects malformed hex colour", () => {
    expect(createWallSchema.safeParse({ ...presetBase, wall_color_hex: "#FFFFFF" }).success).toBe(false);
    expect(createWallSchema.safeParse({ ...presetBase, wall_color_hex: "FFF" }).success).toBe(false);
    expect(createWallSchema.safeParse({ ...presetBase, wall_color_hex: "ZZZZZZ" }).success).toBe(false);
  });
});

describe("updateWallSchema", () => {
  it("accepts a partial update", () => {
    expect(updateWallSchema.safeParse({ name: "New name" }).success).toBe(true);
  });

  it("does not allow changing kind", () => {
    // kind is intentionally absent from the schema, extra props are ignored
    // but width_cm bounds still apply.
    expect(updateWallSchema.safeParse({ width_cm: 49 }).success).toBe(false);
  });

  it("permits clearing notes via null", () => {
    expect(updateWallSchema.safeParse({ notes: null }).success).toBe(true);
  });
});

describe("createLayoutSchema / updateLayoutSchema", () => {
  it("accepts an empty layout", () => {
    expect(
      createLayoutSchema.safeParse({ wall_id: "w1", name: "Layout", items: [] }).success,
    ).toBe(true);
  });

  it("defaults items to []", () => {
    const parsed = createLayoutSchema.parse({ wall_id: "w1", name: "Layout" });
    expect(parsed.items).toEqual([]);
  });

  it("update with no fields is allowed (no-op)", () => {
    expect(updateLayoutSchema.safeParse({}).success).toBe(true);
  });
});

describe("renderRequestSchema", () => {
  it("defaults kind to 'standard'", () => {
    const parsed = renderRequestSchema.parse({});
    expect(parsed.kind).toBe("standard");
  });

  it("accepts an items override", () => {
    expect(renderRequestSchema.safeParse({ items: [validItem] }).success).toBe(true);
  });
});

describe("quickRenderRequestSchema", () => {
  it("requires wall_id or preset_id", () => {
    expect(quickRenderRequestSchema.safeParse({ work_id: "w" }).success).toBe(false);
  });

  it("accepts a preset request with dimensions", () => {
    expect(
      quickRenderRequestSchema.safeParse({
        preset_id: "cafe_back_wall",
        width_cm: 300,
        height_cm: 240,
        work_id: "work-a",
      }).success,
    ).toBe(true);
  });

  it("rejects a preset request without dimensions", () => {
    expect(
      quickRenderRequestSchema.safeParse({
        preset_id: "cafe_back_wall",
        work_id: "work-a",
      }).success,
    ).toBe(false);
  });

  it("accepts a saved-wall request without dimensions", () => {
    expect(
      quickRenderRequestSchema.safeParse({
        wall_id: "wall-xyz",
        work_id: "work-a",
      }).success,
    ).toBe(true);
  });
});

describe("saveMockupSchema", () => {
  it("requires render_id", () => {
    expect(saveMockupSchema.safeParse({}).success).toBe(false);
    expect(saveMockupSchema.safeParse({ render_id: "r1" }).success).toBe(true);
  });
});
