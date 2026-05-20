import type { KeystrokeEvent } from "../types/recording";
import type { Slice } from "../types/project";

export interface TypingWindow {
  id: string;
  /** Source-time start (ms). */
  startMs: number;
  /** Source-time end (ms). */
  endMs: number;
  /** Number of non-repeat keyDown events inside the window. */
  keystrokeCount: number;
  /** Suggested timeScale, e.g. 2.0 for 2× speed. */
  proposedTimeScale: number;
  /** True if at least one screen slice covering this window already has timeScale > 1. */
  alreadyApplied: boolean;
}

export interface TypingDetectionOptions {
  /** Maximum gap between consecutive keystrokes for them to count as one burst. */
  maxGapMs: number;
  /** Minimum number of keystrokes for a burst to be reported as a typing window. */
  minKeystrokes: number;
  /** Minimum total duration for a burst (ms). */
  minDurationMs: number;
  /** Default proposed timeScale. */
  defaultTimeScale: number;
}

export const DEFAULT_TYPING_OPTIONS: TypingDetectionOptions = {
  maxGapMs: 600,
  minKeystrokes: 8,
  minDurationMs: 1500,
  defaultTimeScale: 2.0,
};

/**
 * Detect typing bursts in a keystroke log and propose source-time windows
 * where playback could be sped up. Pure function — does not mutate input.
 *
 * Each window already includes an `alreadyApplied` flag so the UI can fade
 * windows whose range is fully covered by a slice with timeScale > 1.
 */
export function detectTypingWindows(
  keystrokes: KeystrokeEvent[],
  screenSlices: Slice[],
  options: Partial<TypingDetectionOptions> = {},
): TypingWindow[] {
  const opts: TypingDetectionOptions = { ...DEFAULT_TYPING_OPTIONS, ...options };

  const downs = keystrokes
    .filter((k) => k.type === "keyDown" && !k.isARepeat)
    .sort((a, b) => a.processTimeMs - b.processTimeMs);
  if (downs.length === 0) return [];

  const windows: TypingWindow[] = [];

  let burstStart = downs[0].processTimeMs;
  let burstLast = downs[0].processTimeMs;
  let burstCount = 1;

  const flush = () => {
    const durationMs = burstLast - burstStart;
    if (burstCount >= opts.minKeystrokes && durationMs >= opts.minDurationMs) {
      const startMs = burstStart;
      const endMs = burstLast + 100; // small tail so the slice contains the last key
      windows.push({
        id: `typing-${startMs}-${endMs}`,
        startMs,
        endMs,
        keystrokeCount: burstCount,
        proposedTimeScale: opts.defaultTimeScale,
        alreadyApplied: windowAlreadyApplied(screenSlices, startMs, endMs),
      });
    }
  };

  for (let i = 1; i < downs.length; i += 1) {
    const cur = downs[i];
    const prev = downs[i - 1];
    if (cur.processTimeMs - prev.processTimeMs <= opts.maxGapMs) {
      burstLast = cur.processTimeMs;
      burstCount += 1;
    } else {
      flush();
      burstStart = cur.processTimeMs;
      burstLast = cur.processTimeMs;
      burstCount = 1;
    }
  }
  flush();

  return windows;
}

function windowAlreadyApplied(
  slices: Slice[],
  startMs: number,
  endMs: number,
): boolean {
  // Considered "applied" if every millisecond of the window lies inside
  // some slice whose timeScale is strictly greater than 1.
  let cursor = startMs;
  while (cursor < endMs) {
    const slice = slices.find(
      (s) => cursor >= s.sourceStartMs && cursor < s.sourceEndMs,
    );
    if (!slice || slice.timeScale <= 1.0001) {
      return false;
    }
    cursor = slice.sourceEndMs;
  }
  return true;
}
