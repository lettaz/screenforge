import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Music, X } from "lucide-react";
import { useProjectStore } from "../../stores/projectStore";
import type {
  ClickEffectsConfig,
  ClickEffectStyle,
} from "../../types/project";

const DEFAULT: ClickEffectsConfig = {
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

const STYLES: readonly { id: ClickEffectStyle; label: string }[] = [
  { id: "ripple", label: "Ripple" },
  { id: "pulse", label: "Pulse" },
  { id: "square", label: "Square" },
];

export default function ClickEffectsSection() {
  const { project, updateConfig } = useProjectStore();
  if (!project) {
    return null;
  }
  const config: ClickEffectsConfig = project.config.clickEffects ?? DEFAULT;
  const patch = (next: Partial<ClickEffectsConfig>) =>
    updateConfig({ clickEffects: { ...config, ...next } });

  const pickSound = async () => {
    const selected = await openDialog({
      title: "Choose click sound",
      filters: [{ name: "Audio", extensions: ["mp3", "wav", "ogg", "m4a"] }],
      multiple: false,
    });
    if (!selected || Array.isArray(selected)) return;
    patch({ soundUrl: convertFileSrc(selected), soundEnabled: true });
  };

  return (
    <div className="space-y-4 text-xs">
      <label className="flex items-center justify-between cursor-pointer">
        <span className="text-white/80">Enable click highlights</span>
        <input
          type="checkbox"
          checked={config.enabled}
          onChange={(e) => patch({ enabled: e.target.checked })}
          className="accent-accent"
        />
      </label>

      <div className="space-y-2">
        <span className="block text-white/70">Style</span>
        <div className="grid grid-cols-3 gap-1.5">
          {STYLES.map((style) => {
            const active = config.style === style.id;
            return (
              <button
                key={style.id}
                type="button"
                onClick={() => patch({ style: style.id })}
                className={`py-1.5 rounded-md border text-[11px] ${
                  active
                    ? "border-accent bg-accent/10 text-white"
                    : "border-border text-white/60 hover:text-white"
                }`}
              >
                {style.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label htmlFor="click-color-left" className="block text-white/70">
            Left click
          </label>
          <input
            id="click-color-left"
            type="color"
            value={config.colorLeft}
            onChange={(e) => patch({ colorLeft: e.target.value })}
            className="w-full h-8 rounded-md border border-border bg-transparent cursor-pointer"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="click-color-right" className="block text-white/70">
            Right click
          </label>
          <input
            id="click-color-right"
            type="color"
            value={config.colorRight}
            onChange={(e) => patch({ colorRight: e.target.value })}
            className="w-full h-8 rounded-md border border-border bg-transparent cursor-pointer"
          />
        </div>
      </div>

      <RangeRow
        id="click-size"
        label="Size"
        min={0.3}
        max={2.5}
        step={0.1}
        value={config.size}
        onChange={(v) => patch({ size: v })}
        format={(v) => v.toFixed(1)}
        suffix="×"
      />
      <RangeRow
        id="click-duration"
        label="Duration"
        min={100}
        max={2000}
        step={50}
        value={config.durationMs}
        onChange={(v) => patch({ durationMs: v })}
        format={(v) => Math.round(v).toString()}
        suffix="ms"
      />

      <div className="space-y-2 border-t border-border pt-3">
        <label className="flex items-center justify-between cursor-pointer">
          <span className="text-white/80">Click sound</span>
          <input
            type="checkbox"
            checked={config.soundEnabled}
            onChange={(e) => patch({ soundEnabled: e.target.checked })}
            className="accent-accent"
          />
        </label>

        {config.soundEnabled && (
          <>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={pickSound}
                className="flex-1 py-1.5 rounded-md border border-border hover:border-accent text-white/80 flex items-center justify-center gap-1.5"
              >
                <Music className="w-3 h-3" />
                {config.soundUrl ? "Replace sound…" : "Choose sound…"}
              </button>
              {config.soundUrl && (
                <button
                  type="button"
                  onClick={() => patch({ soundUrl: null })}
                  className="px-2 py-1.5 rounded-md border border-border hover:border-destructive text-white/60 hover:text-destructive"
                  title="Remove sound"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
            <RangeRow
              id="click-sound-volume"
              label="Volume"
              min={0}
              max={1}
              step={0.05}
              value={config.soundVolume}
              onChange={(v) => patch({ soundVolume: v })}
              format={(v) => `${Math.round(v * 100)}`}
              suffix="%"
            />
          </>
        )}
      </div>
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
  format: (value: number) => string;
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
  format,
  suffix,
}: RangeRowProps) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="text-white/70">
          {label}
        </label>
        <span className="text-white/50 font-mono">
          {format(value)}
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
