import { useMemo, useState } from "react";
import { CheckCircle2, FastForward, ScanLine } from "lucide-react";
import { useProjectStore } from "../../stores/projectStore";
import {
  DEFAULT_TYPING_OPTIONS,
  detectTypingWindows,
  type TypingWindow,
} from "../../utils/typingDetection";
import type { KeystrokeEvent } from "../../types/recording";

const SPEED_CHOICES: readonly { label: string; value: number }[] = [
  { label: "1.5×", value: 1.5 },
  { label: "2×", value: 2 },
  { label: "3×", value: 3 },
  { label: "4×", value: 4 },
];

interface TypingSpeedupSectionProps {
  keystrokes: KeystrokeEvent[];
}

export default function TypingSpeedupSection({ keystrokes }: TypingSpeedupSectionProps) {
  const { activeSceneIndex, getScreenSlices, applySpeedRange } = useProjectStore();
  const screenSlices = getScreenSlices();

  const [defaultSpeed, setDefaultSpeed] = useState(
    DEFAULT_TYPING_OPTIONS.defaultTimeScale,
  );
  const [perWindowSpeed, setPerWindowSpeed] = useState<Record<string, number>>(
    {},
  );

  const detected = useMemo(
    () =>
      detectTypingWindows(keystrokes, screenSlices, {
        defaultTimeScale: defaultSpeed,
      }),
    [keystrokes, screenSlices, defaultSpeed],
  );

  if (keystrokes.length === 0) {
    return (
      <p className="text-white/40 text-[11px] leading-relaxed">
        No keystroke data in this recording. Typing speed-up needs a
        recording where the input channel captured keystrokes.
      </p>
    );
  }

  const speedFor = (w: TypingWindow): number =>
    perWindowSpeed[w.id] ?? w.proposedTimeScale;

  const applyOne = (w: TypingWindow) => {
    applySpeedRange(activeSceneIndex, w.startMs, w.endMs, speedFor(w));
  };

  const applyAllPending = () => {
    for (const w of detected) {
      if (!w.alreadyApplied) {
        applySpeedRange(activeSceneIndex, w.startMs, w.endMs, speedFor(w));
      }
    }
  };

  const pendingCount = detected.filter((w) => !w.alreadyApplied).length;

  return (
    <div className="space-y-4 text-xs">
      <div className="space-y-1">
        <span className="block text-white/70">Default speed-up</span>
        <div className="grid grid-cols-4 gap-1.5">
          {SPEED_CHOICES.map((choice) => {
            const active = defaultSpeed === choice.value;
            return (
              <button
                key={choice.value}
                type="button"
                onClick={() => setDefaultSpeed(choice.value)}
                className={`py-1.5 rounded-md border text-[11px] ${
                  active
                    ? "border-accent bg-accent/10 text-white"
                    : "border-border text-white/60 hover:text-white"
                }`}
              >
                {choice.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-white/60">
          {detected.length} burst{detected.length === 1 ? "" : "s"} detected
          {pendingCount > 0 && ` · ${pendingCount} pending`}
        </span>
        <button
          type="button"
          onClick={applyAllPending}
          disabled={pendingCount === 0}
          className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-accent/40 hover:border-accent text-accent disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <FastForward className="w-3 h-3" />
          Apply all
        </button>
      </div>

      {detected.length === 0 ? (
        <p className="text-white/40 text-[11px] leading-relaxed">
          No long typing bursts found. Defaults: ≥
          {DEFAULT_TYPING_OPTIONS.minKeystrokes} keystrokes over ≥
          {(DEFAULT_TYPING_OPTIONS.minDurationMs / 1000).toFixed(1)}s with gaps
          ≤{DEFAULT_TYPING_OPTIONS.maxGapMs}ms.
        </p>
      ) : (
        <ul className="space-y-1">
          {detected.map((w) => {
            const speed = speedFor(w);
            return (
              <li
                key={w.id}
                className={`rounded-md border bg-background px-2 py-2 ${
                  w.alreadyApplied ? "border-success/40 opacity-70" : "border-border"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-white/80 font-mono text-[11px]">
                    {(w.startMs / 1000).toFixed(2)}s –{" "}
                    {(w.endMs / 1000).toFixed(2)}s
                  </span>
                  <span className="text-white/50 text-[10px]">
                    {w.keystrokeCount} keys
                  </span>
                </div>

                <div className="mt-1.5 flex items-center gap-1">
                  {SPEED_CHOICES.map((choice) => {
                    const active = speed === choice.value;
                    return (
                      <button
                        key={choice.value}
                        type="button"
                        onClick={() =>
                          setPerWindowSpeed((s) => ({
                            ...s,
                            [w.id]: choice.value,
                          }))
                        }
                        className={`flex-1 py-1 rounded-md border text-[10px] ${
                          active
                            ? "border-accent bg-accent/10 text-white"
                            : "border-border text-white/55 hover:text-white"
                        }`}
                        disabled={w.alreadyApplied}
                      >
                        {choice.label}
                      </button>
                    );
                  })}
                  {w.alreadyApplied ? (
                    <span
                      className="text-success flex items-center gap-1 px-1"
                      title="Already applied"
                    >
                      <CheckCircle2 className="w-3 h-3" />
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => applyOne(w)}
                      className="px-2 py-1 rounded-md border border-accent/40 hover:border-accent text-accent"
                      title="Apply to this burst only"
                    >
                      <FastForward className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-[10px] text-white/40 leading-relaxed border-t border-border pt-3 flex items-start gap-1.5">
        <ScanLine className="w-3 h-3 mt-0.5 shrink-0" />
        <span>
          Speed-ups are applied as ordinary slice edits — undoable by deleting
          the inserted slice or setting its timeScale back to 1.
        </span>
      </p>
    </div>
  );
}
