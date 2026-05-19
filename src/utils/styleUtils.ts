import type { Background, ShadowConfig } from "../types/project";

/**
 * Convert a project Background config to a CSS `background` value.
 * Handles solid colors, linear gradients, and images.
 */
export function backgroundToCss(background: Background): string {
  switch (background.type) {
    case "solid":
      return background.color ?? "#0F172A";
    case "gradient": {
      const g = background.gradient;
      if (!g || g.stops.length === 0) {
        return "#0F172A";
      }
      const dx = g.end.x - g.start.x;
      const dy = g.end.y - g.start.y;
      const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
      const stops = g.stops
        .map((s) => `${s.color} ${Math.round(s.at * 100)}%`)
        .join(", ");
      return `linear-gradient(${angleDeg}deg, ${stops})`;
    }
    case "image":
      return background.imageUrl
        ? `url("${background.imageUrl}") center / cover no-repeat`
        : "#0F172A";
  }
}

/**
 * Convert a project ShadowConfig to a CSS `boxShadow` value.
 * Angle is in degrees, 0 = up, 90 = right.
 */
export function shadowToCss(shadow: ShadowConfig): string {
  if (shadow.intensity <= 0) {
    return "none";
  }
  const angleRad = (shadow.angle * Math.PI) / 180;
  const offsetX = Math.round(Math.sin(angleRad) * shadow.distance);
  const offsetY = Math.round(-Math.cos(angleRad) * shadow.distance);
  const alpha = Math.max(0, Math.min(1, shadow.intensity));
  return `${offsetX}px ${offsetY}px ${Math.round(shadow.blur)}px rgba(0, 0, 0, ${alpha.toFixed(2)})`;
}
