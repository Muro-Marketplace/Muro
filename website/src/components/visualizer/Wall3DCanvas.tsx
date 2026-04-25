"use client";

/**
 * Wall3DCanvas — three.js scene mode for the visualizer.
 *
 * Scene composition:
 *   - Back wall (the wall the user is decorating).
 *   - Floor.
 *   - One side wall (a corner room — gives "different walls in
 *     different directions" the user can rotate around).
 *   - Subtle ambient + directional lighting from the front-top-left to
 *     produce realistic soft shadows under each item.
 *   - OrbitControls letting the user pan/rotate the camera within
 *     limits (no clipping behind the back wall, no flipping upside
 *     down).
 *
 * Items:
 *   - Each artwork is a textured plane, sitting `frameDepth` proud of
 *     the wall (the frame extends another small offset so it casts a
 *     shadow).
 *   - Frame is rendered as 4 thin boxes (top/right/bottom/left moulding)
 *     wrapping the artwork. This is much cheaper than CSG-subtracting
 *     a plane out of a box, and reads as a real frame in 3D.
 *   - Click an item → fires onSelectItem.
 *   - Drag an item → onItemChange with new (x_cm, y_cm). For the MVP
 *     resize lives in the toolbar dropdown, not via 3D handles.
 *
 * Coordinates:
 *   - Scene units = metres. Wall dims (cm) divide by 100 on the way in.
 *   - Wall sits centred on the origin; back wall lies on the z=0 plane,
 *     so item position (x_cm, y_cm) maps to (x_m, height-y_m, 0).
 *
 * Why this is a separate file from WallCanvas.tsx:
 *   - Different render engine (three.js vs Konva).
 *   - Different interaction model (raycasting vs DOM events).
 *   - Lets the 2D editor stay alive as a fallback / mobile path.
 */

import {
  Suspense,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";
import { Canvas, useThree, type ThreeEvent } from "@react-three/fiber";
import {
  Environment,
  OrbitControls,
} from "@react-three/drei";
import * as THREE from "three";
import {
  computeFrameGeometry,
  getFrameFinish,
} from "@/lib/visualizer/frames";
import type {
  LayoutBackground,
  WallItem,
} from "@/lib/visualizer/types";
import type { PanelWork } from "./WorksPanel";

// ── Scene tuning ───────────────────────────────────────────────────────

const FLOOR_DEPTH_M = 4; // how far into the room the floor extends
const SIDE_WALL_DEPTH_M = 4; // depth of the perpendicular side wall
const FRAME_PROUD_M = 0.015; // how far in front of the wall a flat work sits
const FRAME_DEPTH_M = 0.025; // additional thickness of the frame moulding
const SHADOW_OPACITY = 0.35;

interface Props {
  background: LayoutBackground;
  /** Wall width in cm (real-world). */
  widthCm: number;
  /** Wall height in cm (real-world). */
  heightCm: number;
  items: WallItem[];
  workById: Record<string, PanelWork>;
  selectedItemId: string | null;
  onSelectItem: (id: string | null) => void;
  onItemChange: (id: string, partial: Partial<WallItem>) => void;
  onAddItem: (workId: string, xCm: number, yCm: number) => void;
  /** Optional signed URL for the wall photo (uploaded walls). */
  bgImageUrl?: string | null;
}

export default function Wall3DCanvas({
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
  const wallW = widthCm / 100; // metres
  const wallH = heightCm / 100;

  const wallColor =
    background.kind === "preset" ? `#${background.color_hex}` : "#FFFFFF";

  // HTML drop handler — converts mouse coords to a wall-plane intersection.
  // Three.js's `useThree` is only available inside a Canvas child, so we
  // grab the camera + raycaster via a ref-bridge component below.
  const dropHandlerRef = useRef<{
    pickAt: (clientX: number, clientY: number) => { xCm: number; yCm: number } | null;
  } | null>(null);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const workId = e.dataTransfer.getData("application/x-wallplace-work");
      if (!workId) return;
      const hit = dropHandlerRef.current?.pickAt(e.clientX, e.clientY);
      if (!hit) return;
      onAddItem(workId, hit.xCm, hit.yCm);
    },
    [onAddItem],
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }, []);

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      className="relative w-full h-full bg-stone-100"
      style={{ overflow: "hidden" }}
    >
      <Canvas
        shadows
        // Slight elevation + close-ish to give a modern photographer's
        // angle when looking at the wall straight-on.
        camera={{ position: [0, wallH * 0.55, wallW * 1.35], fov: 50 }}
        gl={{
          antialias: true,
          // preserveDrawingBuffer needed for canvas-to-blob if we ever
          // export the 3D view as a render output.
          preserveDrawingBuffer: true,
        }}
      >
        <Suspense fallback={null}>
          {/* Ambient + a key directional light for readable shadows. */}
          <ambientLight intensity={0.55} />
          <directionalLight
            position={[2.5, wallH + 1.5, 2]}
            intensity={1.2}
            castShadow
            shadow-mapSize-width={1024}
            shadow-mapSize-height={1024}
            shadow-camera-near={0.5}
            shadow-camera-far={12}
            shadow-camera-left={-wallW}
            shadow-camera-right={wallW}
            shadow-camera-top={wallH}
            shadow-camera-bottom={-1}
            shadow-bias={-0.0002}
          />
          {/* Soft fill from behind the camera to keep shadows from going
              fully black. */}
          <directionalLight position={[-1.5, 1.2, 3]} intensity={0.25} />
          <Environment preset="apartment" />

          <Room
            wallW={wallW}
            wallH={wallH}
            wallColor={wallColor}
            wallImageUrl={
              bgImageUrl ??
              (background.kind === "uploaded" ? background.image_path : null)
            }
            kind={background.kind}
          />

          {items
            .slice()
            .sort((a, b) => a.z_index - b.z_index)
            .map((item) => (
              <ArtworkMesh
                key={item.id}
                item={item}
                wallW={wallW}
                wallH={wallH}
                imageUrl={workById[item.work_id]?.imageUrl}
                selected={item.id === selectedItemId}
                onSelect={() => onSelectItem(item.id)}
                onMove={(xCm, yCm) =>
                  onItemChange(item.id, { x_cm: xCm, y_cm: yCm })
                }
              />
            ))}

          <DropPlane
            wallW={wallW}
            wallH={wallH}
            // Captures camera + raycaster + DOM rect, exposes pickAt
            // upwards for the parent's HTML drop handler.
            onReady={(api) => {
              dropHandlerRef.current = api;
            }}
            onClickEmpty={() => onSelectItem(null)}
          />

          <OrbitControls
            enablePan={false}
            enableDamping
            // Don't let the camera fly behind the wall or invert.
            minDistance={wallW * 0.7}
            maxDistance={wallW * 2.2}
            minPolarAngle={Math.PI / 6}
            maxPolarAngle={Math.PI / 2 - 0.05}
            // Don't let the user spin all the way around — the back of
            // the wall is a black plane.
            minAzimuthAngle={-Math.PI / 2.3}
            maxAzimuthAngle={Math.PI / 2.3}
            target={[0, wallH * 0.5, 0]}
          />
        </Suspense>
      </Canvas>
    </div>
  );
}

// ── Room ────────────────────────────────────────────────────────────────

function Room({
  wallW,
  wallH,
  wallColor,
  wallImageUrl,
  kind,
}: {
  wallW: number;
  wallH: number;
  wallColor: string;
  wallImageUrl: string | null;
  kind: LayoutBackground["kind"];
}) {
  const wallTexture = useOptionalTexture(
    kind === "uploaded" ? wallImageUrl : null,
  );

  return (
    <group>
      {/* Back wall — z=0 plane, rises from y=0 to y=wallH. */}
      <mesh position={[0, wallH / 2, 0]} receiveShadow>
        <planeGeometry args={[wallW, wallH]} />
        {wallTexture ? (
          <meshStandardMaterial map={wallTexture} roughness={0.85} />
        ) : (
          <meshStandardMaterial color={wallColor} roughness={0.92} />
        )}
      </mesh>

      {/* Floor — light wood plank base. */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, FLOOR_DEPTH_M / 2]}
        receiveShadow
      >
        <planeGeometry args={[wallW * 2.2, FLOOR_DEPTH_M]} />
        <meshStandardMaterial color="#3D3026" roughness={0.65} />
      </mesh>

      {/* Right side wall — perpendicular to back wall, recedes into z. */}
      <mesh
        position={[wallW / 2, wallH / 2, SIDE_WALL_DEPTH_M / 2]}
        rotation={[0, -Math.PI / 2, 0]}
        receiveShadow
      >
        <planeGeometry args={[SIDE_WALL_DEPTH_M, wallH]} />
        <meshStandardMaterial color={wallColor} roughness={0.92} />
      </mesh>

      {/* Subtle ceiling — lighter than walls, just visible at the top
          when camera tilts up. */}
      <mesh
        position={[0, wallH, SIDE_WALL_DEPTH_M / 2]}
        rotation={[Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[wallW * 2.2, SIDE_WALL_DEPTH_M]} />
        <meshStandardMaterial color="#F2EFEA" roughness={0.95} />
      </mesh>
    </group>
  );
}

// ── Artwork mesh ────────────────────────────────────────────────────────

interface ArtworkMeshProps {
  item: WallItem;
  wallW: number;
  wallH: number;
  imageUrl: string | undefined;
  selected: boolean;
  onSelect: () => void;
  onMove: (xCm: number, yCm: number) => void;
}

function ArtworkMesh({
  item,
  wallW,
  wallH,
  imageUrl,
  selected,
  onSelect,
  onMove,
}: ArtworkMeshProps) {
  const itemW = item.width_cm / 100;
  const itemH = item.height_cm / 100;

  // Layout JSON has y growing DOWNWARDS from the wall top. Three.js
  // y grows upwards from the wall bottom. Convert.
  const cmToMeters = (cm: number) => cm / 100;
  const xCenterM =
    cmToMeters(item.x_cm) + itemW / 2 - wallW / 2;
  const yCenterM = wallH - (cmToMeters(item.y_cm) + itemH / 2);

  // Frame geometry shared with the 2D code — gives us inner artwork
  // rect + border thickness in pixels. Rebase into metres at the same
  // unit ratio (100 px → 1 m): borderPx / 100 ≈ borderMeters.
  const SCRATCH_PX_PER_CM = 100;
  const frameGeo = useMemo(
    () =>
      computeFrameGeometry(
        itemW * SCRATCH_PX_PER_CM,
        itemH * SCRATCH_PX_PER_CM,
        item.frame,
      ),
    [itemW, itemH, item.frame],
  );
  const borderM = frameGeo.borderPx / SCRATCH_PX_PER_CM;
  const innerW = Math.max(0.001, itemW - borderM * 2);
  const innerH = Math.max(0.001, itemH - borderM * 2);
  const finishDef = getFrameFinish(item.frame.style, item.frame.finish);
  const frameColor = finishDef?.borderColor ?? "#222222";

  const texture = useOptionalTexture(imageUrl ?? null);

  // ── Drag handling ──────────────────────────────────────────────────
  // Capture pointer events on the artwork mesh and translate to wall
  // coords by intersecting the ray against the back-wall plane.
  const groupRef = useRef<THREE.Group>(null);
  const dragRef = useRef<null | {
    initialX: number;
    initialY: number;
    grabXCm: number;
    grabYCm: number;
    pointerId: number;
  }>(null);
  const wallPlane = useMemo(
    () => new THREE.Plane(new THREE.Vector3(0, 0, 1), 0),
    [],
  );

  const onPointerDown = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      onSelect();
      const target = e.target as Element;
      target.setPointerCapture?.(e.pointerId);
      const intersect = new THREE.Vector3();
      e.ray.intersectPlane(wallPlane, intersect);
      dragRef.current = {
        initialX: intersect.x,
        initialY: intersect.y,
        grabXCm: item.x_cm,
        grabYCm: item.y_cm,
        pointerId: e.pointerId,
      };
    },
    [item.x_cm, item.y_cm, onSelect, wallPlane],
  );

  const onPointerMove = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      if (!dragRef.current) return;
      const intersect = new THREE.Vector3();
      e.ray.intersectPlane(wallPlane, intersect);
      const dxM = intersect.x - dragRef.current.initialX;
      const dyM = intersect.y - dragRef.current.initialY;
      // y grows up in 3D, but layout y grows down — invert.
      const newXCm = dragRef.current.grabXCm + dxM * 100;
      const newYCm = dragRef.current.grabYCm - dyM * 100;
      onMove(newXCm, newYCm);
    },
    [onMove, wallPlane],
  );

  const onPointerUp = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      if (!dragRef.current) return;
      const target = e.target as Element;
      target.releasePointerCapture?.(dragRef.current.pointerId);
      dragRef.current = null;
    },
    [],
  );

  // ── Render ─────────────────────────────────────────────────────────
  // Stack:
  //   - Outer group rotated/positioned at the centre of the artwork.
  //   - 4 frame mouldings (BoxGeometry strips) around the perimeter,
  //     pushed slightly more proud of the wall than the artwork.
  //   - Artwork plane in the middle, just proud of the wall.
  //   - Selection halo (a thin coloured outline) when selected.
  return (
    <group
      ref={groupRef}
      position={[xCenterM, yCenterM, FRAME_PROUD_M + FRAME_DEPTH_M / 2]}
      rotation={[0, 0, (item.rotation_deg * Math.PI) / 180]}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {/* Frame — only when style != "none" */}
      {item.frame.style !== "none" && borderM > 0.001 && (
        <FrameMoulding
          itemW={itemW}
          itemH={itemH}
          borderM={borderM}
          color={frameColor}
        />
      )}

      {/* Artwork plane */}
      <mesh castShadow receiveShadow position={[0, 0, FRAME_DEPTH_M / 2]}>
        <planeGeometry args={[innerW, innerH]} />
        {texture ? (
          <meshStandardMaterial
            map={texture}
            roughness={0.5}
            metalness={0}
          />
        ) : (
          <meshStandardMaterial color="#888888" roughness={0.7} />
        )}
      </mesh>

      {/* Selection halo */}
      {selected && (
        <mesh position={[0, 0, FRAME_DEPTH_M / 2 + 0.001]}>
          <ringGeometry
            args={[
              Math.max(itemW, itemH) * 0.5 + 0.005,
              Math.max(itemW, itemH) * 0.5 + 0.012,
              64,
            ]}
          />
          <meshBasicMaterial color="#0F0F0F" transparent opacity={0.85} />
        </mesh>
      )}

      {/* Soft contact shadow under the item — a darker plane behind
          the artwork plane, slightly larger, slightly transparent. */}
      <mesh
        position={[
          itemW * 0.04,
          -itemH * 0.04,
          -0.001,
        ]}
      >
        <planeGeometry args={[itemW * 1.05, itemH * 1.05]} />
        <meshBasicMaterial
          color="#000000"
          transparent
          opacity={SHADOW_OPACITY * 0.4}
        />
      </mesh>
    </group>
  );
}

// ── Frame moulding ─────────────────────────────────────────────────────

function FrameMoulding({
  itemW,
  itemH,
  borderM,
  color,
}: {
  itemW: number;
  itemH: number;
  borderM: number;
  color: string;
}) {
  // Render 4 boxes — top/bottom span full width, left/right take only
  // the inner height so the corners aren't double-stacked.
  const topY = itemH / 2 - borderM / 2;
  const bottomY = -itemH / 2 + borderM / 2;
  const leftX = -itemW / 2 + borderM / 2;
  const rightX = itemW / 2 - borderM / 2;
  const sideHeight = itemH - borderM * 2;

  return (
    <group>
      {/* Top */}
      <mesh
        position={[0, topY, FRAME_DEPTH_M / 2]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[itemW, borderM, FRAME_DEPTH_M]} />
        <meshStandardMaterial color={color} roughness={0.55} metalness={0.05} />
      </mesh>
      {/* Bottom */}
      <mesh
        position={[0, bottomY, FRAME_DEPTH_M / 2]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[itemW, borderM, FRAME_DEPTH_M]} />
        <meshStandardMaterial color={color} roughness={0.55} metalness={0.05} />
      </mesh>
      {/* Left */}
      <mesh
        position={[leftX, 0, FRAME_DEPTH_M / 2]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[borderM, sideHeight, FRAME_DEPTH_M]} />
        <meshStandardMaterial color={color} roughness={0.55} metalness={0.05} />
      </mesh>
      {/* Right */}
      <mesh
        position={[rightX, 0, FRAME_DEPTH_M / 2]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[borderM, sideHeight, FRAME_DEPTH_M]} />
        <meshStandardMaterial color={color} roughness={0.55} metalness={0.05} />
      </mesh>
    </group>
  );
}

// ── Drop / empty-click plane ───────────────────────────────────────────

interface DropPlaneApi {
  pickAt: (clientX: number, clientY: number) => { xCm: number; yCm: number } | null;
}

function DropPlane({
  wallW,
  wallH,
  onReady,
  onClickEmpty,
}: {
  wallW: number;
  wallH: number;
  onReady: (api: DropPlaneApi) => void;
  onClickEmpty: () => void;
}) {
  const { camera, raycaster, gl } = useThree();
  // Sync the ref-bridge once on mount and whenever camera/wall change
  // (rare). Using a small useMemo to avoid re-instantiating the plane.
  const wallPlane = useMemo(
    () => new THREE.Plane(new THREE.Vector3(0, 0, 1), 0),
    [],
  );

  useMemo(() => {
    const api: DropPlaneApi = {
      pickAt: (clientX, clientY) => {
        const rect = gl.domElement.getBoundingClientRect();
        const ndc = new THREE.Vector2(
          ((clientX - rect.left) / rect.width) * 2 - 1,
          -((clientY - rect.top) / rect.height) * 2 + 1,
        );
        raycaster.setFromCamera(ndc, camera);
        const hit = new THREE.Vector3();
        if (!raycaster.ray.intersectPlane(wallPlane, hit)) return null;
        // Clamp inside wall bounds.
        const xM = Math.min(Math.max(hit.x, -wallW / 2), wallW / 2);
        const yM = Math.min(Math.max(hit.y, 0), wallH);
        return {
          xCm: (xM + wallW / 2) * 100,
          yCm: (wallH - yM) * 100,
        };
      },
    };
    onReady(api);
  }, [camera, raycaster, gl, wallPlane, wallW, wallH, onReady]);

  return (
    <mesh
      position={[0, wallH / 2, -0.001]}
      onPointerDown={(e) => {
        // Only deselect when clicking the wall itself (no item handler intercepts).
        if (e.button !== 0) return;
        e.stopPropagation();
        onClickEmpty();
      }}
    >
      <planeGeometry args={[wallW, wallH]} />
      <meshBasicMaterial visible={false} />
    </mesh>
  );
}

// ── Texture loading ────────────────────────────────────────────────────

/**
 * Load an image URL into a THREE.Texture. Wraps useLoader semantics in
 * a way that gracefully returns null for empty / failed URLs (so the
 * caller can render a neutral fallback material).
 */
function useOptionalTexture(url: string | null): THREE.Texture | null {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);

  // Imperative load — keeps it null while loading, sets when ready.
  // useEffect-style with a flag for cancellation.
  useMemo(() => {
    if (!url) {
      setTexture(null);
      return;
    }
    const loader = new THREE.TextureLoader();
    loader.crossOrigin = "anonymous";
    loader.load(
      url,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 8;
        setTexture(tex);
      },
      undefined,
      () => {
        setTexture(null);
      },
    );
  }, [url]);

  return texture;
}
