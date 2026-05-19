// Project Bundle Types (*.osp)
// Based on the file format defined in TECHNICAL_PLAN.md

// =============================================================================
// Meta Types
// =============================================================================

export interface ProjectMeta {
  version: string;
  format: string;
  createdAt: string;
  updatedAt: string;
}

// =============================================================================
// Background Types
// =============================================================================

export interface GradientStop {
  color: string;
  at: number;
}

export interface GradientConfig {
  start: { x: number; y: number };
  end: { x: number; y: number };
  stops: GradientStop[];
}

export type BackgroundType = "solid" | "gradient" | "image";

export interface Background {
  type: BackgroundType;
  color?: string;
  gradient?: GradientConfig;
  imageUrl?: string;
}

// =============================================================================
// Shadow Types
// =============================================================================

export interface ShadowConfig {
  intensity: number;
  angle: number;
  distance: number;
  blur: number;
}

// =============================================================================
// Cursor Types
// =============================================================================

export interface SpringConfig {
  stiffness: number;
  damping: number;
  mass: number;
}

export interface CursorSmoothingConfig {
  enabled: boolean;
  spring: SpringConfig;
}

export interface CursorConfig {
  size: number;
  smoothing: CursorSmoothingConfig;
  hideAfterMs: number | null;
}

// =============================================================================
// Camera Types
// =============================================================================

export type CameraPosition =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right"
  | "custom";

export interface CameraConfig {
  enabled: boolean;
  position: CameraPosition;
  size: number;
  roundness: number;
  mirror: boolean;
}

// =============================================================================
// Click Effects Types
// =============================================================================

export type ClickEffectStyle = "ripple" | "pulse" | "square";

export interface ClickEffectsConfig {
  enabled: boolean;
  style: ClickEffectStyle;
  colorLeft: string;
  colorRight: string;
  size: number;
  durationMs: number;
  soundEnabled: boolean;
  soundUrl: string | null;
  soundVolume: number;
}

// =============================================================================
// Keystrokes Overlay Types
// =============================================================================

export type KeystrokesOverlayPosition = "top" | "bottom" | "center";
export type KeystrokesOverlayTheme = "dark" | "light";

export interface KeystrokesOverlayConfig {
  enabled: boolean;
  position: KeystrokesOverlayPosition;
  theme: KeystrokesOverlayTheme;
  /** Duration (ms) a chip stays visible after the keystroke. */
  visibleDurationMs: number;
  /** Maximum number of chips to render simultaneously. */
  maxChips: number;
}

// =============================================================================
// Background Music Types
// =============================================================================

export interface BackgroundMusicConfig {
  enabled: boolean;
  /** Local file URL (from `convertFileSrc`) for preview playback. */
  audioUrl: string | null;
  /** Absolute filesystem path used by the Rust export pipeline. */
  audioPath: string | null;
  /** Output volume in [0..1]. */
  volume: number;
  fadeInMs: number;
  fadeOutMs: number;
}

// =============================================================================
// Audio Types
// =============================================================================

export interface AudioConfig {
  systemVolume: number;
  microphoneVolume: number;
  enhanceMicrophone: boolean;
}

// =============================================================================
// Project Config
// =============================================================================

export interface Padding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface AspectRatio {
  x: number;
  y: number;
}

export interface ProjectConfig {
  background: Background;
  padding: Padding;
  shadow: ShadowConfig;
  cursor: CursorConfig;
  camera: CameraConfig;
  audio: AudioConfig;
  recordingRange: [number, number];
  outputAspectRatio: AspectRatio;
  /** Corner radius for the screen frame, in pixels. Added in Screenforge v0.2. */
  screenRadius?: number;
  /** Click highlight effect configuration. Added in Screenforge v0.2. */
  clickEffects?: ClickEffectsConfig;
  /** On-screen keystrokes overlay configuration. Added in Screenforge v0.2. */
  keystrokesOverlay?: KeystrokesOverlayConfig;
  /** Background music to mix into the exported video. Added in Screenforge v0.2. */
  music?: BackgroundMusicConfig;
  /** Cursor motion-blur intensity (0 = off). Added in Screenforge v0.2. */
  motionBlur?: number;
  /** Optional H.264 video bitrate override in kbps. Added in Screenforge v0.2. */
  exportBitrateKbps?: number;
  /** Crossfade / position-tween duration between layouts (ms). Added in Screenforge v0.2. */
  layoutTransitionMs?: number;
}

// =============================================================================
// Scene Types
// =============================================================================

export interface Slice {
  id: string;
  sourceStartMs: number;
  sourceEndMs: number;
  timeScale: number;
  volume: number;
  hideCursor: boolean;
  disableCursorSmoothing: boolean;
}

export type ZoomType = "follow-cursor" | "follow-clicks" | "manual";

export interface ZoomRange {
  id: string;
  startTime: number;
  endTime: number;
  zoom: number;
  type: ZoomType;
  targetPoint?: { x: number; y: number };
  snapToEdges: number;
  instant: boolean;
}

export type LayoutType =
  | "screen-only"
  | "camera-only"
  | "screen-with-camera"
  | "side-by-side";

export interface Layout {
  id: string;
  startTime: number;
  endTime: number;
  type: LayoutType;
  cameraSize: number;
  cameraPosition: { x: number; y: number };
}

export type SceneType = "recording" | "title" | "transition";

export type BlurRegionStyle = "blur" | "pixelate" | "solid";

export interface BlurRegion {
  id: string;
  /** Output-time start (ms). */
  startTime: number;
  /** Output-time end (ms). */
  endTime: number;
  /** Position/size in normalized [0..1] of the screen frame. */
  x: number;
  y: number;
  width: number;
  height: number;
  style: BlurRegionStyle;
  /** Blur intensity in pixels (only for `style === "blur"`). */
  intensity: number;
  /** Solid fill color (only for `style === "solid"`). */
  color?: string;
  label?: string;
}

export interface Scene {
  id: string;
  name: string;
  type: SceneType;
  sessionIndex: number;
  /** @deprecated Use screenSlices instead */
  slices?: Slice[];
  screenSlices: Slice[];
  cameraSlices: Slice[];
  zoomRanges: ZoomRange[];
  layouts: Layout[];
  /** Blur / pixelate / solid masks bound to time ranges. Added in Screenforge v0.2. */
  blurRegions?: BlurRegion[];
}

// =============================================================================
// Project
// =============================================================================

export interface Project {
  id: string;
  name: string;
  createdAt: string;
  config: ProjectConfig;
  scenes: Scene[];
}

// =============================================================================
// Recording Metadata Types
// =============================================================================

export interface RecordingSession {
  durationMs: number;
  processTimeStartMs: number;
  processTimeEndMs: number;
  unixStartMs: number;
  unixEndMs: number;
}

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface VideoSize {
  width: number;
  height: number;
}

// =============================================================================
// Channel Types
// =============================================================================

export type ChannelType =
  | "display"
  | "systemAudio"
  | "microphone"
  | "webcam"
  | "input"
  | "cursor";

export interface DisplayChannelConfig {
  displayId: number;
  excludedWindowIds: number[];
}

export interface MicrophoneChannelConfig {
  deviceId: string;
}

export interface WebcamChannelConfig {
  deviceId: string;
}

export interface InputChannelConfig {
  captureKeystrokes: boolean;
}

export interface DisplayChannelSession {
  outputFile: string;
  bounds: Bounds;
  recordingScale: number;
  displayRefreshRate: number;
  durationMs: number;
}

export interface AudioChannelSession {
  outputFile: string;
  durationMs: number;
}

export interface WebcamChannelSession {
  outputFile: string;
  videoSize: VideoSize;
  frameRate: number;
  durationMs: number;
}

export interface InputChannelSession {
  mouseMovesFile: string;
  mouseClicksFile: string;
  keystrokesFile: string;
  durationMs: number;
}

export interface Channel {
  id: string;
  type: ChannelType;
  config?:
    | DisplayChannelConfig
    | MicrophoneChannelConfig
    | WebcamChannelConfig
    | InputChannelConfig;
  sessions?: (
    | DisplayChannelSession
    | AudioChannelSession
    | WebcamChannelSession
    | InputChannelSession
  )[];
  cursorsInfoFile?: string;
  cursorImagesFolder?: string;
}

export type RecordingState = "idle" | "recording" | "paused" | "complete";

export interface RecordingMetadata {
  version: string;
  state: RecordingState;
  sessions: RecordingSession[];
  channels: Channel[];
}

// =============================================================================
// Input Event Types
// =============================================================================

export type Modifier = "shift" | "control" | "option" | "command";

export interface MouseMove {
  type: "mouseMoved";
  x: number;
  y: number;
  cursorId: string;
  activeModifiers: Modifier[];
  processTimeMs: number;
  unixTimeMs: number;
}

export type MouseButton = "left" | "right" | "middle";

export interface MouseClick {
  type: "mouseDown" | "mouseUp";
  button: MouseButton;
  x: number;
  y: number;
  cursorId: string;
  activeModifiers: Modifier[];
  processTimeMs: number;
  unixTimeMs: number;
}

export interface Keystroke {
  type: "keyDown" | "keyUp";
  character: string;
  activeModifiers: Modifier[];
  isARepeat: boolean;
  processTimeMs: number;
  unixTimeMs: number;
}

// =============================================================================
// Cursor Types
// =============================================================================

export interface CursorHotSpot {
  x: number;
  y: number;
}

export interface CursorSize {
  width: number;
  height: number;
}

export interface CursorInfo {
  id: string;
  hotSpot: CursorHotSpot;
  standardSize: CursorSize;
  systemCursor: boolean;
}

// =============================================================================
// Marker Types
// =============================================================================

export interface Marker {
  id: string;
  time: number;
  label: string;
  color?: string;
}

// =============================================================================
// Project Bundle (Full structure)
// =============================================================================

export interface ProjectBundle {
  meta: ProjectMeta;
  project: Project;
  markers: Marker[];
  recording?: {
    metadata: RecordingMetadata;
    cursors?: CursorInfo[];
  };
}
