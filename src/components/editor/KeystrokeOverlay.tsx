import { useMemo } from "react";
import type { KeystrokeEvent } from "../../types/recording";
import type { KeystrokesOverlayConfig } from "../../types/project";
import { chipsAtTime } from "../../utils/keystrokeUtils";

interface KeystrokeOverlayProps {
  keystrokes: KeystrokeEvent[];
  sourceTimeMs: number;
  config?: KeystrokesOverlayConfig;
}

const DEFAULT: KeystrokesOverlayConfig = {
  enabled: true,
  position: "bottom",
  theme: "dark",
  visibleDurationMs: 1500,
  maxChips: 8,
};

export function KeystrokeOverlay({
  keystrokes,
  sourceTimeMs,
  config: providedConfig,
}: KeystrokeOverlayProps) {
  const config = providedConfig ?? DEFAULT;

  const chips = useMemo(
    () =>
      chipsAtTime(
        keystrokes,
        sourceTimeMs,
        config.visibleDurationMs,
        config.maxChips,
      ),
    [keystrokes, sourceTimeMs, config.visibleDurationMs, config.maxChips],
  );

  if (!config.enabled || chips.length === 0) {
    return null;
  }

  const positionClass =
    config.position === "top"
      ? "top-6"
      : config.position === "center"
        ? "top-1/2 -translate-y-1/2"
        : "bottom-6";

  const chipClass =
    config.theme === "light"
      ? "bg-white/90 text-gray-900 border-gray-300"
      : "bg-black/70 text-white border-white/20";

  return (
    <div
      className={`absolute left-1/2 -translate-x-1/2 ${positionClass} pointer-events-none flex flex-wrap items-center justify-center gap-1.5 max-w-[90%]`}
    >
      {chips.map((chip) => {
        const age = sourceTimeMs - chip.processTimeMs;
        const fadeStart = config.visibleDurationMs * 0.7;
        const opacity =
          age <= fadeStart
            ? 1
            : Math.max(0, 1 - (age - fadeStart) / (config.visibleDurationMs - fadeStart));
        return (
          <span
            key={chip.id}
            className={`${chipClass} backdrop-blur-sm border rounded-md px-2 py-1 text-[13px] font-mono font-medium shadow-lg`}
            style={{ opacity }}
          >
            {chip.label}
          </span>
        );
      })}
    </div>
  );
}

export default KeystrokeOverlay;
