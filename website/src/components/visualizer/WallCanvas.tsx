"use client";

/**
 * WallCanvas — react-konva stage with full interactivity.
 *
 * Capabilities:
 *   - Drop a work from WorksPanel onto the wall to spawn a new item at
 *     the drop coordinates.
 *   - Drag existing items.
 *   - Resize via Konva Transformer with proportional-only constraints
 *     (no stretch — a Wallplace decision; users hate distorted artworks).
 *   - Alignment guides: dotted lines snap to wall thirds/halves/edges
 *     and other items' edges/centres while dragging.
 *   - Frame overlays: each item is a Group of (image + coloured border).
 *     The MVP uses solid borders; PR #5 swaps to 9-slice frame PNGs.
 *
 * Coordinates:
 *   The layout JSON stays in cm. This component converts to/from stage
 *   pixels exactly once at the boundary (drag end / resize end / drop).
 *
 * SSR:
 *   Imported via next/dynamic with ssr:false from the parent. Konva
 *   touches `window` at module init.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Group,
  Image as KonvaImage,
  Layer,
  Line,
  Rect,
  Stage,
  Transformer,
} from "react-konva";
import type Konva from "konva";
import useImage from "use-image";
import {
  SNAP_THRESHOLD_PX,
  snapAndGuide,
  type PxRect,
} from "@/lib/visualizer/alignment";
import { computeFrameGeometry, getKonvaFrameProps } from "@/lib/visualizer/frames";
import type {
  LayoutBackground,
  WallItem,
} from "@/lib/visualizer/types";
import type { PanelWork } from "./WorksPanel";

// ── Constants ───────────────────────────────────────────────────────────

const PADDING_PX = 24;
/** Minimum and maximum sizes (cm) — matches the zod validation. */
const MIN_ITEM_CM = 5;
const MAX_ITEM_CM = 1000;

// ── Props ───────────────────────────────────────────────────────────────

interface Props {
  background: LayoutBackground;
  widthCm: number;
  heightCm: number;
  items: WallItem[];
  /** Map of work id → display data (image url, dimensions). */
  workById: Record<string, PanelWork>;
  selectedItemId: string | null;
  onSelectItem: (id: string | null) => void;
  /** Called when an item moves or resizes — partial WallItem update. */
  onItemChange: (id: string, partial: Partial<WallItem>) => void;
  /** Called when a work is dropped onto the canvas. Coords are wall-cm. */
  onAddItem: (workId: string, xCm: number, yCm: number) => void;
  /**
   * Display URL for an uploaded wall photo. The parent resolves this
   * from the wall's storage path → short-lived signed URL on the
   * server (the bucket is private). When omitted, the canvas falls
   * back to background.image_path (works for already-public assets).
   */
  bgImageUrl?: string | null;
}

export default function WallCanvas({
  background,
  widthCm,
  heightCm,
  items,
  workById,
  selectedItemId,
  onSelectItem,
  onItemChange,
  onAddItem,
  bgImageUrl,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [guides, setGuides] = useState<{ vx: number[]; hy: number[] }>({
    vx: [],
    hy: [],
  });

  // Observe container size.
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const observer = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect();
      setSize({ w: Math.round(rect.width), h: Math.round(rect.height) });
    });
    observer.observe(el);
    const rect = el.getBoundingClientRect();
    setSize({ w: Math.round(rect.width), h: Math.round(rect.height) });
    return () => observer.disconnect();
  }, []);

  // Pixel scale.
  const pxPerCm = useMemo(() => {
    if (size.w === 0 || size.h === 0) return 0;
    const availW = size.w - PADDING_PX * 2;
    const availH = size.h - PADDING_PX * 2;
    if (availW <= 0 || availH <= 0) return 0;
    return Math.min(availW / widthCm, availH / heightCm);
  }, [size, widthCm, heightCm]);

  const wallPxW = widthCm * pxPerCm;
  const wallPxH = heightCm * pxPerCm;
  const wallOriginX = (size.w - wallPxW) / 2;
  const wallOriginY = (size.h - wallPxH) / 2;

  // ── Drop handler (HTML, outside Konva) ──────────────────────────────
  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const workId = e.dataTransfer.getData("application/x-wallplace-work");
      if (!workId || pxPerCm === 0) return;
      // Convert drop point to wall-cm. The drop event coords are in
      // viewport pixels; subtract container offset, then wall origin.
      const containerRect = containerRef.current?.getBoundingClientRect();
      if (!containerRect) return;
      const stageX = e.clientX - containerRect.left;
      const stageY = e.clientY - containerRect.top;
      const wallX = (stageX - wallOriginX) / pxPerCm;
      const wallY = (stageY - wallOriginY) / pxPerCm;
      // Position the new item *centred* at the drop point. The parent
      // will pick a default size.
      onAddItem(workId, wallX, wallY);
    },
    [pxPerCm, wallOriginX, wallOriginY, onAddItem],
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    // Required to enable drop. effectAllowed already set by source.
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }, []);

  // ── Background image ────────────────────────────────────────────────
  // Prefer the explicit `bgImageUrl` prop (a signed URL from the API)
  // because uploaded photos live in a private bucket and `image_path`
  // alone is just a storage key. Fall back to `image_path` for any
  // future public-asset path.
  const bgImageSrc =
    bgImageUrl ??
    (background.kind === "uploaded" ? background.image_path : null);
  const [bgImage] = useImage(bgImageSrc ?? "", "anonymous");
  const wallColor =
    background.kind === "preset" ? `#${background.color_hex}` : "#FFFFFF";

  // ── Render ──────────────────────────────────────────────────────────
  return (
    <div
      ref={containerRef}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onClick={(e) => {
        // Click-on-empty-area to deselect (only if not consumed by a Konva node).
        if (e.target === containerRef.current) onSelectItem(null);
      }}
      className="relative w-full h-full bg-stone-100"
      style={{ overflow: "hidden" }}
    >
      {pxPerCm > 0 && (
        <Stage
          ref={stageRef}
          width={size.w}
          height={size.h}
          onMouseDown={(e) => {
            // Empty-stage click → deselect.
            if (e.target === e.target.getStage()) onSelectItem(null);
          }}
        >
          <Layer>
            {/* Wall colour underlay */}
            <Rect
              x={wallOriginX}
              y={wallOriginY}
              width={wallPxW}
              height={wallPxH}
              fill={wallColor}
              shadowBlur={20}
              shadowOpacity={0.08}
              shadowOffsetY={6}
            />
            {bgImage && (
              <KonvaImage
                image={bgImage}
                x={wallOriginX}
                y={wallOriginY}
                width={wallPxW}
                height={wallPxH}
              />
            )}

            {/* Items */}
            {[...items]
              .sort((a, b) => a.z_index - b.z_index)
              .map((item) => (
                <CanvasItem
                  key={item.id}
                  item={item}
                  work={workById[item.work_id]}
                  pxPerCm={pxPerCm}
                  wallOriginX={wallOriginX}
                  wallOriginY={wallOriginY}
                  wallPxW={wallPxW}
                  wallPxH={wallPxH}
                  selected={item.id === selectedItemId}
                  otherItems={items.filter((i) => i.id !== item.id)}
                  onSelect={() => onSelectItem(item.id)}
                  onDragGuides={setGuides}
                  onClearGuides={() => setGuides({ vx: [], hy: [] })}
                  onChange={(partial) => onItemChange(item.id, partial)}
                />
              ))}

            {/* Alignment guides — drawn last so they sit above items. */}
            {guides.vx.map((x, i) => (
              <Line
                key={`vx-${i}`}
                points={[x, wallOriginY, x, wallOriginY + wallPxH]}
                stroke="#0F0F0F"
                strokeWidth={1}
                dash={[4, 4]}
                opacity={0.4}
                listening={false}
              />
            ))}
            {guides.hy.map((y, i) => (
              <Line
                key={`hy-${i}`}
                points={[wallOriginX, y, wallOriginX + wallPxW, y]}
                stroke="#0F0F0F"
                strokeWidth={1}
                dash={[4, 4]}
                opacity={0.4}
                listening={false}
              />
            ))}
          </Layer>
        </Stage>
      )}
    </div>
  );
}

// ── CanvasItem ──────────────────────────────────────────────────────────

interface CanvasItemProps {
  item: WallItem;
  work?: PanelWork;
  pxPerCm: number;
  wallOriginX: number;
  wallOriginY: number;
  wallPxW: number;
  wallPxH: number;
  selected: boolean;
  otherItems: WallItem[];
  onSelect: () => void;
  onChange: (partial: Partial<WallItem>) => void;
  onDragGuides: (guides: { vx: number[]; hy: number[] }) => void;
  onClearGuides: () => void;
}

function CanvasItem({
  item,
  work,
  pxPerCm,
  wallOriginX,
  wallOriginY,
  wallPxW,
  wallPxH,
  selected,
  otherItems,
  onSelect,
  onChange,
  onDragGuides,
  onClearGuides,
}: CanvasItemProps) {
  const groupRef = useRef<Konva.Group>(null);
  const transformerRef = useRef<Konva.Transformer>(null);

  // Pixel position + size derived from cm.
  const pxX = wallOriginX + item.x_cm * pxPerCm;
  const pxY = wallOriginY + item.y_cm * pxPerCm;
  const pxW = item.width_cm * pxPerCm;
  const pxH = item.height_cm * pxPerCm;

  // Attach the transformer when the item is selected — and re-attach
  // (force a re-measure) whenever the item's dimensions change so the
  // outline stays glued to the visible content. Without this, picking a
  // new size from the toolbar dropdown would leave the Transformer
  // outline at the previous size until the user clicked away and back.
  useEffect(() => {
    if (selected && transformerRef.current && groupRef.current) {
      transformerRef.current.nodes([groupRef.current]);
      transformerRef.current.forceUpdate?.();
      transformerRef.current.getLayer()?.batchDraw();
    }
  }, [selected, pxW, pxH, item.rotation_deg]);

  // Frame geometry (artwork inset + border colour).
  const frameGeo = computeFrameGeometry(pxW, pxH, item.frame);

  // Image hook — useImage handles empty src by returning undefined.
  const [img] = useImage(work?.imageUrl ?? "", "anonymous");

  const wallRect: PxRect = {
    x: wallOriginX,
    y: wallOriginY,
    width: wallPxW,
    height: wallPxH,
  };
  const otherRects: PxRect[] = otherItems.map((o) => ({
    x: wallOriginX + o.x_cm * pxPerCm,
    y: wallOriginY + o.y_cm * pxPerCm,
    width: o.width_cm * pxPerCm,
    height: o.height_cm * pxPerCm,
  }));

  // ── Drag handling ──────────────────────────────────────────────────
  const handleDragMove = useCallback(
    (e: Konva.KonvaEventObject<DragEvent>) => {
      const node = e.target;
      const dragged: PxRect = {
        x: node.x(),
        y: node.y(),
        width: pxW,
        height: pxH,
      };
      const result = snapAndGuide(dragged, wallRect, otherRects, SNAP_THRESHOLD_PX);
      // Snap by mutating the node position (cheaper than going through React).
      node.x(result.x);
      node.y(result.y);
      onDragGuides({ vx: result.verticalGuides, hy: result.horizontalGuides });
    },
    [pxW, pxH, wallRect, otherRects, onDragGuides],
  );

  const handleDragEnd = useCallback(
    (e: Konva.KonvaEventObject<DragEvent>) => {
      onClearGuides();
      const node = e.target;
      // Convert px back to cm, relative to wall origin.
      const xCm = clamp(
        (node.x() - wallOriginX) / pxPerCm,
        -item.width_cm * 0.5,
        // Allow 50% off either edge so users can crop into corners.
        wallPxW / pxPerCm + item.width_cm * 0.5 - item.width_cm,
      );
      const yCm = clamp(
        (node.y() - wallOriginY) / pxPerCm,
        -item.height_cm * 0.5,
        wallPxH / pxPerCm + item.height_cm * 0.5 - item.height_cm,
      );
      onChange({ x_cm: xCm, y_cm: yCm });
    },
    [
      onClearGuides,
      onChange,
      pxPerCm,
      wallOriginX,
      wallOriginY,
      wallPxW,
      wallPxH,
      item.width_cm,
      item.height_cm,
    ],
  );

  // ── Resize handling ─────────────────────────────────────────────────
  const handleTransformEnd = useCallback(() => {
    const node = groupRef.current;
    if (!node) return;
    // Konva applies scale during resize; bake it into width/height and
    // reset scale to 1 so future drags don't drift.
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    // Proportional only — average the two scales so a Shift-less drag still
    // produces a uniform shape.
    const uniformScale = (scaleX + scaleY) / 2;
    const newWPx = pxW * uniformScale;
    const newHPx = pxH * uniformScale;
    node.scaleX(1);
    node.scaleY(1);

    const newWCm = clamp(newWPx / pxPerCm, MIN_ITEM_CM, MAX_ITEM_CM);
    const newHCm = clamp(newHPx / pxPerCm, MIN_ITEM_CM, MAX_ITEM_CM);
    const xCm = (node.x() - wallOriginX) / pxPerCm;
    const yCm = (node.y() - wallOriginY) / pxPerCm;
    const rotationDeg = clamp(node.rotation(), -15, 15);

    onChange({
      x_cm: xCm,
      y_cm: yCm,
      width_cm: newWCm,
      height_cm: newHCm,
      rotation_deg: rotationDeg,
    });
  }, [pxW, pxH, pxPerCm, wallOriginX, wallOriginY, onChange]);

  return (
    <>
      <Group
        ref={groupRef}
        x={pxX}
        y={pxY}
        draggable
        rotation={item.rotation_deg}
        onClick={onSelect}
        onTap={onSelect}
        onDragStart={onSelect}
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
        onTransformEnd={handleTransformEnd}
      >
        {/*
         * Bounding-box "ghost". Konva's Transformer measures the union
         * of children's clientRects (including their shadow extents),
         * which is why the outline used to drift past the visible image
         * during resize. This invisible Rect anchors the bounding box
         * to the item's true outer dimensions — and since shadows on
         * other children only matter when this Rect doesn't dominate,
         * we also disable shadows on every visible child while
         * selected.
         */}
        <Rect
          width={pxW}
          height={pxH}
          fill="transparent"
          listening={false}
        />

        {/* Frame border — gradient rectangle behind artwork (preview;
            the Render output uses the much richer SVG-generated frame). */}
        {item.frame.style !== "none" && (
          <Rect
            width={pxW}
            height={pxH}
            {...getKonvaFrameProps(item.frame, pxW, pxH)}
            shadowColor="rgba(0,0,0,0.35)"
            shadowEnabled={!selected && frameGeo.hasShadow}
            shadowBlur={14}
            shadowOpacity={0.4}
            shadowOffsetY={6}
          />
        )}
        {/* Artwork — inset by border thickness */}
        {img ? (
          <KonvaImage
            image={img}
            x={frameGeo.artwork.x}
            y={frameGeo.artwork.y}
            width={frameGeo.artwork.width}
            height={frameGeo.artwork.height}
            shadowColor="rgba(0,0,0,0.25)"
            shadowEnabled={!selected && item.frame.style === "none"}
            shadowBlur={12}
            shadowOpacity={0.35}
            shadowOffsetY={5}
          />
        ) : (
          <Rect
            x={frameGeo.artwork.x}
            y={frameGeo.artwork.y}
            width={frameGeo.artwork.width}
            height={frameGeo.artwork.height}
            fill="#888"
          />
        )}
      </Group>
      {selected && (
        <Transformer
          ref={transformerRef}
          rotateEnabled={true}
          // Proportional resize: lock aspect ratio; show only corner anchors.
          enabledAnchors={[
            "top-left",
            "top-right",
            "bottom-left",
            "bottom-right",
          ]}
          keepRatio={true}
          // Bigger anchors for touch.
          anchorSize={12}
          // Visual style.
          borderStroke="#0F0F0F"
          borderStrokeWidth={1}
          anchorStroke="#0F0F0F"
          anchorFill="#FFFFFF"
          anchorCornerRadius={2}
          rotateAnchorOffset={28}
          rotationSnaps={[0]}
          rotationSnapTolerance={5}
          boundBoxFunc={(oldBox, newBox) => {
            // Hard-cap the size at MIN/MAX in pixels so users can't drag
            // a corner beyond what we'll persist.
            const minPx = MIN_ITEM_CM * pxPerCm;
            const maxPx = MAX_ITEM_CM * pxPerCm;
            if (newBox.width < minPx || newBox.height < minPx) return oldBox;
            if (newBox.width > maxPx || newBox.height > maxPx) return oldBox;
            return newBox;
          }}
        />
      )}
    </>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
