import type { Layout, LayoutType } from "../types/project";

/**
 * Find the active layout at a given output time
 */
export function findLayoutAtTime(
  layouts: Layout[],
  outputTimeMs: number,
): Layout | null {
  for (const layout of layouts) {
    if (outputTimeMs >= layout.startTime && outputTimeMs < layout.endTime) {
      return layout;
    }
  }
  return null;
}

/**
 * Position and size for camera overlay
 */
export interface CameraRect {
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
}

/**
 * Position and size for screen content
 */
export interface ScreenRect {
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
}

/**
 * Combined layout rendering info
 */
export interface LayoutRenderInfo {
  camera: CameraRect;
  screen: ScreenRect;
  layoutType: LayoutType;
}

/**
 * Default camera aspect ratio (16:9)
 */
const CAMERA_ASPECT_RATIO = 16 / 9;

/**
 * Calculate camera and screen positions for a given layout
 */
export function calculateLayoutPositions(
  layout: Layout | null,
  containerWidth: number,
  containerHeight: number,
): LayoutRenderInfo {
  // Default: screen-with-camera layout
  if (!layout) {
    return calculateScreenWithCamera(
      containerWidth,
      containerHeight,
      0.2, // default size
      { x: 0.9, y: 0.9 }, // bottom-right
    );
  }

  switch (layout.type) {
    case "screen-only":
      return {
        screen: {
          x: 0,
          y: 0,
          width: containerWidth,
          height: containerHeight,
          visible: true,
        },
        camera: {
          x: 0,
          y: 0,
          width: 0,
          height: 0,
          visible: false,
        },
        layoutType: "screen-only",
      };

    case "camera-only":
      return {
        screen: {
          x: 0,
          y: 0,
          width: 0,
          height: 0,
          visible: false,
        },
        camera: {
          x: 0,
          y: 0,
          width: containerWidth,
          height: containerHeight,
          visible: true,
        },
        layoutType: "camera-only",
      };

    case "side-by-side":
      return calculateSideBySide(containerWidth, containerHeight);

    case "screen-with-camera":
    default:
      return calculateScreenWithCamera(
        containerWidth,
        containerHeight,
        layout.cameraSize,
        layout.cameraPosition,
      );
  }
}

/**
 * Calculate screen-with-camera layout (PiP)
 */
function calculateScreenWithCamera(
  containerWidth: number,
  containerHeight: number,
  cameraSize: number,
  cameraPosition: { x: number; y: number },
): LayoutRenderInfo {
  // Camera size is a fraction of container width
  const cameraWidth = containerWidth * cameraSize;
  const cameraHeight = cameraWidth / CAMERA_ASPECT_RATIO;

  // Camera position is normalized (0-1), where position indicates center
  const padding = 16; // Padding from edges

  // Calculate camera position with padding constraints
  let cameraX = cameraPosition.x * containerWidth - cameraWidth / 2;
  let cameraY = cameraPosition.y * containerHeight - cameraHeight / 2;

  // Clamp to container bounds with padding
  cameraX = Math.max(
    padding,
    Math.min(containerWidth - cameraWidth - padding, cameraX),
  );
  cameraY = Math.max(
    padding,
    Math.min(containerHeight - cameraHeight - padding, cameraY),
  );

  return {
    screen: {
      x: 0,
      y: 0,
      width: containerWidth,
      height: containerHeight,
      visible: true,
    },
    camera: {
      x: cameraX,
      y: cameraY,
      width: cameraWidth,
      height: cameraHeight,
      visible: true,
    },
    layoutType: "screen-with-camera",
  };
}

/**
 * Calculate side-by-side layout
 */
function calculateSideBySide(
  containerWidth: number,
  containerHeight: number,
): LayoutRenderInfo {
  const halfWidth = containerWidth / 2;
  const gap = 8;

  return {
    screen: {
      x: 0,
      y: 0,
      width: halfWidth - gap / 2,
      height: containerHeight,
      visible: true,
    },
    camera: {
      x: halfWidth + gap / 2,
      y: 0,
      width: halfWidth - gap / 2,
      height: containerHeight,
      visible: true,
    },
    layoutType: "side-by-side",
  };
}

/**
 * Generate a unique layout ID
 */
export function generateLayoutId(): string {
  return `layout-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create a default layout covering the entire duration
 */
export function createDefaultLayout(
  durationMs: number,
  type: LayoutType = "screen-with-camera",
): Layout {
  return {
    id: generateLayoutId(),
    startTime: 0,
    endTime: durationMs,
    type,
    cameraSize: 0.2,
    cameraPosition: { x: 0.9, y: 0.9 },
  };
}

/**
 * Get display name for a layout type
 */
export function getLayoutTypeName(type: LayoutType): string {
  switch (type) {
    case "screen-only":
      return "Screen Only";
    case "camera-only":
      return "Camera Only";
    case "screen-with-camera":
      return "Screen + Camera";
    case "side-by-side":
      return "Side by Side";
    default:
      return "Unknown";
  }
}

/**
 * Get all available layout types
 */
export const LAYOUT_TYPES: LayoutType[] = [
  "screen-only",
  "camera-only",
  "screen-with-camera",
  "side-by-side",
];

/**
 * Snapshot of layout state at a moment in time, possibly mid-transition.
 *
 * - When no transition is active, `to` is null and `progress` is 0.
 * - When inside a transition window, both layouts are populated and
 *   `progress` ramps from 0 → 1 over the configured duration.
 * - `cameraOpacity` and `screenOpacity` are derived for the caller so
 *   visibility flips (e.g. screen-with-camera → camera-only) crossfade
 *   smoothly instead of snapping.
 */
export interface LayoutTransitionState {
  current: Layout | null;
  next: Layout | null;
  progress: number;
  cameraOpacity: number;
  screenOpacity: number;
}

const DEFAULT_TRANSITION_MS = 400;

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function cameraVisibleForType(type: LayoutType): boolean {
  return type !== "screen-only";
}

function screenVisibleForType(type: LayoutType): boolean {
  return type !== "camera-only";
}

/**
 * Compute the layout transition state for the given output time. Pass
 * `transitionDurationMs` from `ProjectConfig.layoutTransitionMs`.
 */
export function getLayoutTransitionState(
  layouts: Layout[],
  outputTimeMs: number,
  transitionDurationMs: number = DEFAULT_TRANSITION_MS,
): LayoutTransitionState {
  if (layouts.length === 0) {
    return {
      current: null,
      next: null,
      progress: 0,
      cameraOpacity: 1,
      screenOpacity: 1,
    };
  }

  const transitionMs = Math.max(0, transitionDurationMs);

  // Walk in order — layouts are assumed non-overlapping and time-sorted.
  for (let i = 0; i < layouts.length; i += 1) {
    const layout = layouts[i];
    if (outputTimeMs < layout.startTime || outputTimeMs >= layout.endTime) {
      continue;
    }

    const next = layouts[i + 1] ?? null;
    if (!next || transitionMs === 0) {
      return {
        current: layout,
        next: null,
        progress: 0,
        cameraOpacity: cameraVisibleForType(layout.type) ? 1 : 0,
        screenOpacity: screenVisibleForType(layout.type) ? 1 : 0,
      };
    }

    const transitionStart = Math.max(
      layout.startTime,
      layout.endTime - transitionMs,
    );
    if (outputTimeMs < transitionStart) {
      return {
        current: layout,
        next: null,
        progress: 0,
        cameraOpacity: cameraVisibleForType(layout.type) ? 1 : 0,
        screenOpacity: screenVisibleForType(layout.type) ? 1 : 0,
      };
    }

    const rawProgress =
      (outputTimeMs - transitionStart) / Math.max(1, layout.endTime - transitionStart);
    const progress = easeInOut(Math.min(1, Math.max(0, rawProgress)));

    const fromCam = cameraVisibleForType(layout.type) ? 1 : 0;
    const toCam = cameraVisibleForType(next.type) ? 1 : 0;
    const fromScr = screenVisibleForType(layout.type) ? 1 : 0;
    const toScr = screenVisibleForType(next.type) ? 1 : 0;

    return {
      current: layout,
      next,
      progress,
      cameraOpacity: fromCam + (toCam - fromCam) * progress,
      screenOpacity: fromScr + (toScr - fromScr) * progress,
    };
  }

  return {
    current: null,
    next: null,
    progress: 0,
    cameraOpacity: 1,
    screenOpacity: 1,
  };
}

/**
 * Interpolate two camera rectangles (in the same container space). Used
 * during a layout transition so the webcam glides between PiP positions
 * (or PiP → side-by-side) rather than snapping.
 */
export function lerpCameraRect(
  from: CameraRect,
  to: CameraRect,
  t: number,
): CameraRect {
  return {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
    width: from.width + (to.width - from.width) * t,
    height: from.height + (to.height - from.height) * t,
    visible: t < 0.5 ? from.visible : to.visible,
  };
}
