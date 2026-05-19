import { Plus, Trash2 } from "lucide-react";
import { usePlaybackStore } from "../../stores/playbackStore";
import { useProjectStore } from "../../stores/projectStore";
import { useEditorStore } from "../../stores/editorStore";
import type { BlurRegion, BlurRegionStyle } from "../../types/project";

const STYLES: readonly { id: BlurRegionStyle; label: string }[] = [
  { id: "blur", label: "Blur" },
  { id: "pixelate", label: "Pixel" },
  { id: "solid", label: "Solid" },
];

function generateId(): string {
  return `blur-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function BlurRegionsSection() {
  const {
    activeSceneIndex,
    getBlurRegions,
    addBlurRegion,
    updateBlurRegion,
    removeBlurRegion,
  } = useProjectStore();
  const { currentTimeMs, totalDurationMs } = usePlaybackStore();
  const { selectedBlurRegionId, selectBlurRegion } = useEditorStore();

  const regions = getBlurRegions();

  const handleAdd = () => {
    const newRegion: BlurRegion = {
      id: generateId(),
      startTime: 0,
      endTime: Math.max(totalDurationMs, 1000),
      x: 0.35,
      y: 0.4,
      width: 0.3,
      height: 0.2,
      style: "blur",
      intensity: 20,
    };
    addBlurRegion(activeSceneIndex, newRegion);
    selectBlurRegion(newRegion.id);
  };

  return (
    <div className="space-y-4 text-xs">
      <button
        type="button"
        onClick={handleAdd}
        className="w-full flex items-center justify-center gap-1.5 py-2 rounded-md border border-border hover:border-accent text-white/80"
      >
        <Plus className="w-3.5 h-3.5" />
        Add blur region
      </button>

      {regions.length === 0 ? (
        <p className="text-white/40 text-[11px] leading-relaxed">
          Mask sensitive content (API keys, names, emails) with a
          blur/pixelate/solid rectangle. Regions are bound to a time range,
          and you can drag/resize them directly on the preview.
        </p>
      ) : (
        <ul className="space-y-2">
          {regions.map((region) => {
            const selected = selectedBlurRegionId === region.id;
            return (
              <li
                key={region.id}
                className={`rounded-md border ${
                  selected ? "border-accent" : "border-border"
                } bg-background`}
              >
                <header className="flex items-center gap-1 px-2 py-1.5">
                  <button
                    type="button"
                    onClick={() => selectBlurRegion(region.id)}
                    className="flex-1 text-left text-white/80 hover:text-white truncate"
                  >
                    {region.label ?? `Region ${region.id.slice(-4)}`}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      removeBlurRegion(activeSceneIndex, region.id);
                      if (selected) selectBlurRegion(null);
                    }}
                    className="text-white/40 hover:text-destructive p-0.5"
                    title="Delete region"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </header>

                {selected && (
                  <div className="border-t border-border px-2 py-2 space-y-2">
                    <div className="grid grid-cols-3 gap-1">
                      {STYLES.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() =>
                            updateBlurRegion(activeSceneIndex, region.id, {
                              style: s.id,
                            })
                          }
                          className={`py-1 rounded-md border text-[10px] ${
                            region.style === s.id
                              ? "border-accent bg-accent/10 text-white"
                              : "border-border text-white/60 hover:text-white"
                          }`}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>

                    {region.style === "blur" && (
                      <RangeRow
                        id={`blur-int-${region.id}`}
                        label="Blur"
                        min={2}
                        max={60}
                        step={1}
                        value={region.intensity}
                        onChange={(v) =>
                          updateBlurRegion(activeSceneIndex, region.id, {
                            intensity: v,
                          })
                        }
                        suffix="px"
                      />
                    )}

                    {region.style === "solid" && (
                      <div className="space-y-1">
                        <label
                          htmlFor={`blur-color-${region.id}`}
                          className="block text-white/70"
                        >
                          Fill color
                        </label>
                        <input
                          id={`blur-color-${region.id}`}
                          type="color"
                          value={region.color ?? "#0F172A"}
                          onChange={(e) =>
                            updateBlurRegion(activeSceneIndex, region.id, {
                              color: e.target.value,
                            })
                          }
                          className="w-full h-7 rounded-md border border-border bg-transparent cursor-pointer"
                        />
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                      <TimeStamp
                        label="Start"
                        value={region.startTime}
                        max={totalDurationMs}
                        onChange={(v) =>
                          updateBlurRegion(activeSceneIndex, region.id, {
                            startTime: Math.min(v, region.endTime - 100),
                          })
                        }
                        onSetCurrent={() =>
                          updateBlurRegion(activeSceneIndex, region.id, {
                            startTime: Math.min(
                              currentTimeMs,
                              region.endTime - 100,
                            ),
                          })
                        }
                      />
                      <TimeStamp
                        label="End"
                        value={region.endTime}
                        max={totalDurationMs}
                        onChange={(v) =>
                          updateBlurRegion(activeSceneIndex, region.id, {
                            endTime: Math.max(v, region.startTime + 100),
                          })
                        }
                        onSetCurrent={() =>
                          updateBlurRegion(activeSceneIndex, region.id, {
                            endTime: Math.max(
                              currentTimeMs,
                              region.startTime + 100,
                            ),
                          })
                        }
                      />
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-[10px] text-white/40 leading-relaxed border-t border-border pt-3">
        Regions are drawn live on the preview and persisted with the project
        bundle. Burning them into the ffmpeg export filter graph lives behind
        a feature flag (see TODO in <code>start_export_with_edits</code>) and
        is on the immediate roadmap.
      </p>
    </div>
  );
}

interface RangeRowProps {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
  suffix?: string;
}

function RangeRow({
  id,
  label,
  min,
  max,
  step,
  value,
  onChange,
  suffix,
}: RangeRowProps) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="text-white/70">
          {label}
        </label>
        <span className="text-white/50 font-mono">
          {value}
          {suffix ?? ""}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-accent"
      />
    </div>
  );
}

interface TimeStampProps {
  label: string;
  value: number;
  max: number;
  onChange: (value: number) => void;
  onSetCurrent: () => void;
}

function TimeStamp({ label, value, max, onChange, onSetCurrent }: TimeStampProps) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-white/70">{label}</span>
        <button
          type="button"
          onClick={onSetCurrent}
          className="text-accent hover:text-accent/80"
          title="Set to playhead"
        >
          ⏵ now
        </button>
      </div>
      <input
        type="range"
        min={0}
        max={Math.max(max, 1000)}
        step={50}
        value={Math.min(value, Math.max(max, 1000))}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-accent"
      />
      <div className="text-[10px] text-white/40 font-mono text-right">
        {(value / 1000).toFixed(2)}s
      </div>
    </div>
  );
}
