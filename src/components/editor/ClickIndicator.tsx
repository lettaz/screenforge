import { useMemo } from "react";
import type { MouseClickEvent } from "../../types/recording";
import type { ClickEffectsConfig } from "../../types/project";

interface ClickWithAge extends MouseClickEvent {
  age: number;
}

interface ClickIndicatorProps {
  clicks: ClickWithAge[];
  videoWidth: number;
  videoHeight: number;
  containerWidth: number;
  containerHeight: number;
  /** Optional project click-effects config; falls back to a sensible default. */
  config?: ClickEffectsConfig;
}

const DEFAULT_CONFIG: ClickEffectsConfig = {
  enabled: true,
  style: "ripple",
  colorLeft: "#3B82F6",
  colorRight: "#EF4444",
  size: 1,
  durationMs: 500,
  soundEnabled: false,
  soundUrl: null,
  soundVolume: 0.6,
};

/** Letterbox fit: scale the source rect into the container, preserving aspect. */
function calculateScale(
  videoWidth: number,
  videoHeight: number,
  containerWidth: number,
  containerHeight: number,
): { scale: number; offsetX: number; offsetY: number } {
  if (videoWidth === 0 || videoHeight === 0) {
    return { scale: 1, offsetX: 0, offsetY: 0 };
  }
  const scale = Math.min(
    containerWidth / videoWidth,
    containerHeight / videoHeight,
  );
  const offsetX = (containerWidth - videoWidth * scale) / 2;
  const offsetY = (containerHeight - videoHeight * scale) / 2;
  return { scale, offsetX, offsetY };
}

function buttonColor(
  button: MouseClickEvent["button"],
  config: ClickEffectsConfig,
): string {
  switch (button) {
    case "left":
      return config.colorLeft;
    case "right":
      return config.colorRight;
    case "middle":
      return "#A855F7";
  }
}

function hexToRgba(hex: string, alpha: number): string {
  const sanitized = hex.replace("#", "");
  const r = parseInt(sanitized.slice(0, 2), 16);
  const g = parseInt(sanitized.slice(2, 4), 16);
  const b = parseInt(sanitized.slice(4, 6), 16);
  if (
    Number.isNaN(r) ||
    Number.isNaN(g) ||
    Number.isNaN(b) ||
    sanitized.length !== 6
  ) {
    return `rgba(59, 130, 246, ${alpha})`;
  }
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function ClickIndicator({
  clicks,
  videoWidth,
  videoHeight,
  containerWidth,
  containerHeight,
  config: providedConfig,
}: ClickIndicatorProps) {
  const config = providedConfig ?? DEFAULT_CONFIG;

  const { scale, offsetX, offsetY } = useMemo(
    () =>
      calculateScale(videoWidth, videoHeight, containerWidth, containerHeight),
    [videoWidth, videoHeight, containerWidth, containerHeight],
  );

  if (!config.enabled || clicks.length === 0) {
    return null;
  }

  const baseSize = 24 * config.size;
  const maxSize = 80 * config.size;
  const fadeDuration = Math.max(50, config.durationMs);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {clicks.map((click, index) => {
        const x = click.x * scale + offsetX;
        const y = click.y * scale + offsetY;

        const progress = Math.min(click.age / fadeDuration, 1);
        const opacity = 1 - progress;
        const size = baseSize + (maxSize - baseSize) * progress;

        const color = buttonColor(click.button, config);
        const fill = hexToRgba(color, opacity * 0.3);
        const border = hexToRgba(color, opacity);

        const style: React.CSSProperties = {
          left: x - size / 2,
          top: y - size / 2,
          width: size,
          height: size,
        };

        if (config.style === "ripple") {
          return (
            <div
              key={`${click.processTimeMs}-${index}`}
              className="absolute rounded-full"
              style={{
                ...style,
                backgroundColor: fill,
                border: `2px solid ${border}`,
              }}
            />
          );
        }

        if (config.style === "pulse") {
          const pulseSize = baseSize + (maxSize - baseSize) * progress * 0.5;
          return (
            <div
              key={`${click.processTimeMs}-${index}`}
              className="absolute rounded-full"
              style={{
                ...style,
                width: pulseSize,
                height: pulseSize,
                left: x - pulseSize / 2,
                top: y - pulseSize / 2,
                backgroundColor: hexToRgba(color, opacity * 0.55),
                boxShadow: `0 0 ${20 * opacity}px ${hexToRgba(color, opacity * 0.6)}`,
              }}
            />
          );
        }

        return (
          <div
            key={`${click.processTimeMs}-${index}`}
            className="absolute rounded-md"
            style={{
              ...style,
              backgroundColor: fill,
              border: `2px solid ${border}`,
            }}
          />
        );
      })}
    </div>
  );
}

export default ClickIndicator;
