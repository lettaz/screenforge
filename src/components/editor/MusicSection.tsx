import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Music, X } from "lucide-react";
import { useProjectStore } from "../../stores/projectStore";
import type { BackgroundMusicConfig } from "../../types/project";

const DEFAULT: BackgroundMusicConfig = {
  enabled: false,
  audioUrl: null,
  audioPath: null,
  volume: 0.3,
  fadeInMs: 500,
  fadeOutMs: 1000,
};

export default function MusicSection() {
  const { project, updateConfig } = useProjectStore();
  if (!project) return null;
  const config = project.config.music ?? DEFAULT;
  const patch = (next: Partial<BackgroundMusicConfig>) =>
    updateConfig({ music: { ...config, ...next } });

  const pickFile = async () => {
    const selected = await openDialog({
      title: "Choose background music",
      filters: [{ name: "Audio", extensions: ["mp3", "wav", "ogg", "m4a", "flac"] }],
      multiple: false,
    });
    if (!selected || Array.isArray(selected)) return;
    patch({
      enabled: true,
      audioPath: selected,
      audioUrl: convertFileSrc(selected),
    });
  };

  const clearFile = () => {
    patch({ enabled: false, audioPath: null, audioUrl: null });
  };

  const filename = config.audioPath
    ? config.audioPath.split(/[\\/]/).pop()
    : null;

  return (
    <div className="space-y-4 text-xs">
      <label className="flex items-center justify-between cursor-pointer">
        <span className="text-white/80">Mix background music</span>
        <input
          type="checkbox"
          checked={config.enabled}
          onChange={(e) => patch({ enabled: e.target.checked })}
          className="accent-accent"
          disabled={!config.audioPath}
        />
      </label>

      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={pickFile}
            className="flex-1 py-1.5 rounded-md border border-border hover:border-accent text-white/80 flex items-center justify-center gap-1.5"
          >
            <Music className="w-3 h-3" />
            {filename ? "Replace…" : "Choose audio file…"}
          </button>
          {filename && (
            <button
              type="button"
              onClick={clearFile}
              className="px-2 py-1.5 rounded-md border border-border hover:border-destructive text-white/60 hover:text-destructive"
              title="Remove music"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
        {filename && (
          <p
            className="text-[11px] text-white/40 truncate"
            title={config.audioPath ?? undefined}
          >
            {filename}
          </p>
        )}
      </div>

      {config.audioPath && (
        <>
          <Slider
            id="music-volume"
            label="Volume"
            min={0}
            max={1}
            step={0.05}
            value={config.volume}
            onChange={(v) => patch({ volume: v })}
            format={(v) => `${Math.round(v * 100)}`}
            suffix="%"
          />
          <Slider
            id="music-fade-in"
            label="Fade in"
            min={0}
            max={5000}
            step={100}
            value={config.fadeInMs}
            onChange={(v) => patch({ fadeInMs: Math.round(v) })}
            format={(v) => `${(v / 1000).toFixed(1)}`}
            suffix="s"
          />
          <Slider
            id="music-fade-out"
            label="Fade out"
            min={0}
            max={5000}
            step={100}
            value={config.fadeOutMs}
            onChange={(v) => patch({ fadeOutMs: Math.round(v) })}
            format={(v) => `${(v / 1000).toFixed(1)}`}
            suffix="s"
          />
        </>
      )}

      <p className="text-[11px] text-white/40 leading-relaxed border-t border-border pt-3">
        Music plays back in the preview and is mixed into the export via
        ffmpeg with the chosen volume and fade settings. The track loops if
        shorter than the output.
      </p>
    </div>
  );
}

interface SliderProps {
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

function Slider({
  id,
  label,
  min,
  max,
  step,
  value,
  onChange,
  format,
  suffix,
}: SliderProps) {
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
