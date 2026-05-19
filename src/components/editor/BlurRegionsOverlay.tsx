import { useCallback, useEffect, useRef, useState } from "react";
import type { BlurRegion } from "../../types/project";

interface BlurRegionsOverlayProps {
  regions: BlurRegion[];
  /** Output timeline position in ms. Regions outside their [start, end] window are hidden. */
  currentTimeMs: number;
  /** Currently-selected region id (rendered with a handle). */
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Called with the new normalized position when a region is dragged. */
  onMove: (id: string, x: number, y: number) => void;
  /** Called when a region's bottom-right resize handle is dragged. */
  onResize: (id: string, width: number, height: number) => void;
}

interface DragState {
  type: "move" | "resize";
  id: string;
  startPointerX: number;
  startPointerY: number;
  startX: number;
  startY: number;
  startWidth: number;
  startHeight: number;
}

export default function BlurRegionsOverlay({
  regions,
  currentTimeMs,
  selectedId,
  onSelect,
  onMove,
  onResize,
}: BlurRegionsOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      if (!drag) return;
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      const deltaXFrac = (e.clientX - drag.startPointerX) / rect.width;
      const deltaYFrac = (e.clientY - drag.startPointerY) / rect.height;

      if (drag.type === "move") {
        const nextX = clamp01(drag.startX + deltaXFrac);
        const nextY = clamp01(drag.startY + deltaYFrac);
        onMove(drag.id, nextX, nextY);
      } else {
        const nextW = clamp(drag.startWidth + deltaXFrac, 0.02, 1);
        const nextH = clamp(drag.startHeight + deltaYFrac, 0.02, 1);
        onResize(drag.id, nextW, nextH);
      }
    },
    [drag, onMove, onResize],
  );

  const handlePointerUp = useCallback(() => {
    setDrag(null);
  }, []);

  useEffect(() => {
    if (!drag) return;
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [drag, handlePointerMove, handlePointerUp]);

  const visible = regions.filter(
    (r) => currentTimeMs >= r.startTime && currentTimeMs <= r.endTime,
  );

  return (
    <div ref={containerRef} className="absolute inset-0">
      {visible.map((region) => {
        const isSelected = region.id === selectedId;
        const baseStyle: React.CSSProperties = {
          left: `${region.x * 100}%`,
          top: `${region.y * 100}%`,
          width: `${region.width * 100}%`,
          height: `${region.height * 100}%`,
        };
        const styleByKind = renderStyle(region);
        return (
          <div
            key={region.id}
            className={`absolute pointer-events-auto ${
              isSelected ? "ring-2 ring-accent" : ""
            }`}
            style={{ ...baseStyle, ...styleByKind, cursor: "grab" }}
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onSelect(region.id);
              setDrag({
                type: "move",
                id: region.id,
                startPointerX: e.clientX,
                startPointerY: e.clientY,
                startX: region.x,
                startY: region.y,
                startWidth: region.width,
                startHeight: region.height,
              });
            }}
            title={region.label ?? "Blur region"}
          >
            {isSelected && (
              <button
                type="button"
                aria-label="Resize"
                className="absolute -bottom-1 -right-1 w-3 h-3 bg-accent border border-white rounded-sm cursor-nwse-resize"
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDrag({
                    type: "resize",
                    id: region.id,
                    startPointerX: e.clientX,
                    startPointerY: e.clientY,
                    startX: region.x,
                    startY: region.y,
                    startWidth: region.width,
                    startHeight: region.height,
                  });
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function renderStyle(region: BlurRegion): React.CSSProperties {
  switch (region.style) {
    case "blur":
      return {
        backdropFilter: `blur(${region.intensity}px)`,
        WebkitBackdropFilter: `blur(${region.intensity}px)`,
        background: "rgba(255,255,255,0.02)",
        borderRadius: 4,
      };
    case "pixelate":
      return {
        backdropFilter: "blur(2px) contrast(110%)",
        WebkitBackdropFilter: "blur(2px) contrast(110%)",
        background:
          "repeating-linear-gradient(0deg, rgba(0,0,0,0.18) 0 6px, transparent 6px 12px)," +
          "repeating-linear-gradient(90deg, rgba(0,0,0,0.18) 0 6px, transparent 6px 12px)",
        borderRadius: 4,
      };
    case "solid":
      return {
        background: region.color ?? "#0F172A",
        borderRadius: 4,
      };
  }
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
