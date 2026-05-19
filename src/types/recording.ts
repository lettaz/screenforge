// Recording-related TypeScript types

export interface RecordingResult {
  bundlePath: string;
  totalDurationMs: number;
  sessionCount: number;
  outputFiles: string[];
}

export interface VideoMetadata {
  width: number;
  height: number;
  fps: number;
  durationMs: number;
  codec: string;
}

export interface RecordingInfo {
  format: string;
  resolution: string;
  fps: number;
  duration: string;
  aspectRatio: number;
}

// Mouse move event from recording
export interface MouseMoveEvent {
  x: number;
  y: number;
  cursorId: string;
  activeModifiers: string[];
  processTimeMs: number;
  unixTimeMs: number;
}

// Mouse click event from recording
export interface MouseClickEvent {
  x: number;
  y: number;
  button: "left" | "right" | "middle";
  eventType: "down" | "up";
  clickCount: number;
  activeModifiers: string[];
  processTimeMs: number;
  unixTimeMs: number;
}

// Keystroke event from recording
export interface KeystrokeEvent {
  type: "keyDown" | "keyUp";
  character: string;
  activeModifiers: string[];
  isARepeat: boolean;
  processTimeMs: number;
  unixTimeMs: number;
}

// Cursor image info from recording
export interface CursorInfo {
  id: string;
  imagePath: string;
  hotspotX: number;
  hotspotY: number;
  width: number;
  height: number;
}

// Complete recording bundle data
export interface RecordingBundle {
  // Paths
  bundlePath: string;
  videoPath: string;
  webcamVideoPath: string | null;
  micAudioPath: string | null;
  systemAudioPath: string | null;

  // Data
  mouseMoves: MouseMoveEvent[];
  mouseClicks: MouseClickEvent[];
  cursors: Record<string, CursorInfo>;
  /** Keystroke events captured during recording. May be empty for older bundles. */
  keystrokes: KeystrokeEvent[];

  // Metadata
  videoMetadata: VideoMetadata;
}
