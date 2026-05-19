import { useProjectStore } from "../../stores/projectStore";
import type {
  KeystrokesOverlayConfig,
  KeystrokesOverlayPosition,
  KeystrokesOverlayTheme,
} from "../../types/project";

const DEFAULT: KeystrokesOverlayConfig = {
  enabled: true,
  position: "bottom",
  theme: "dark",
  visibleDurationMs: 1500,
  maxChips: 8,
};

const POSITIONS: readonly { id: KeystrokesOverlayPosition; label: string }[] = [
  { id: "top", label: "Top" },
  { id: "center", label: "Center" },
  { id: "bottom", label: "Bottom" },
];

const THEMES: readonly { id: KeystrokesOverlayTheme; label: string }[] = [
  { id: "dark", label: "Dark" },
  { id: "light", label: "Light" },
];

export default function KeystrokesSection() {
  const { project, updateConfig } = useProjectStore();
  if (!project) return null;
  const config = project.config.keystrokesOverlay ?? DEFAULT;
  const patch = (next: Partial<KeystrokesOverlayConfig>) =>
    updateConfig({ keystrokesOverlay: { ...config, ...next } });

  return (
    <div className="space-y-4 text-xs">
      <label className="flex items-center justify-between cursor-pointer">
        <span className="text-white/80">Show keystrokes on screen</span>
        <input
          type="checkbox"
          checked={config.enabled}
          onChange={(e) => patch({ enabled: e.target.checked })}
          className="accent-accent"
        />
      </label>

      <div className="space-y-1">
        <span className="block text-white/70">Position</span>
        <div className="grid grid-cols-3 gap-1.5">
          {POSITIONS.map((opt) => {
            const active = config.position === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => patch({ position: opt.id })}
                className={`py-1.5 rounded-md border text-[11px] ${
                  active
                    ? "border-accent bg-accent/10 text-white"
                    : "border-border text-white/60 hover:text-white"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-1">
        <span className="block text-white/70">Theme</span>
        <div className="grid grid-cols-2 gap-1.5">
          {THEMES.map((opt) => {
            const active = config.theme === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => patch({ theme: opt.id })}
                className={`py-1.5 rounded-md border text-[11px] ${
                  active
                    ? "border-accent bg-accent/10 text-white"
                    : "border-border text-white/60 hover:text-white"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label htmlFor="ks-duration" className="text-white/70">
            Chip lifetime
          </label>
          <span className="text-white/50 font-mono">
            {Math.round(config.visibleDurationMs)}ms
          </span>
        </div>
        <input
          id="ks-duration"
          type="range"
          min={500}
          max={5000}
          step={100}
          value={config.visibleDurationMs}
          onChange={(e) => patch({ visibleDurationMs: parseFloat(e.target.value) })}
          className="w-full accent-accent"
        />
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label htmlFor="ks-max" className="text-white/70">
            Max chips
          </label>
          <span className="text-white/50 font-mono">{config.maxChips}</span>
        </div>
        <input
          id="ks-max"
          type="range"
          min={1}
          max={16}
          step={1}
          value={config.maxChips}
          onChange={(e) => patch({ maxChips: parseInt(e.target.value, 10) })}
          className="w-full accent-accent"
        />
      </div>

      <p className="text-[11px] text-white/40 leading-relaxed border-t border-border pt-3">
        Keystrokes are rendered from the input channel that was captured at
        record time. Older recordings without keystroke capture won't show
        chips here.
      </p>
    </div>
  );
}
