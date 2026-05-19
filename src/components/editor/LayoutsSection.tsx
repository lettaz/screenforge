import { useProjectStore } from "../../stores/projectStore";
import { getLayoutTypeName } from "../../utils/layoutUtils";

export default function LayoutsSection() {
  const { project, updateConfig, getLayouts } = useProjectStore();
  if (!project) return null;

  const layouts = getLayouts();
  const transitionMs = project.config.layoutTransitionMs ?? 400;

  return (
    <div className="space-y-4 text-xs">
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label htmlFor="layout-transition" className="text-white/70">
            Transition duration
          </label>
          <span className="text-white/50 font-mono">{transitionMs}ms</span>
        </div>
        <input
          id="layout-transition"
          type="range"
          min={0}
          max={1500}
          step={50}
          value={transitionMs}
          onChange={(e) =>
            updateConfig({ layoutTransitionMs: parseInt(e.target.value, 10) })
          }
          className="w-full accent-accent"
        />
        <p className="text-[11px] text-white/40">
          Set to 0 for hard cuts. Camera and screen visibility crossfade over
          this window when adjacent layouts differ.
        </p>
      </div>

      <div className="space-y-2">
        <span className="block text-white/70">
          Layouts in this scene ({layouts.length})
        </span>
        {layouts.length === 0 ? (
          <p className="text-white/40 text-[11px]">
            Add layouts from the timeline. Each layout's time range defines
            where the camera lives during playback.
          </p>
        ) : (
          <ul className="space-y-1">
            {layouts.map((layout) => (
              <li
                key={layout.id}
                className="px-2 py-1.5 rounded-md border border-border bg-background flex items-center justify-between"
              >
                <span className="text-white/80 truncate">
                  {getLayoutTypeName(layout.type)}
                </span>
                <span className="text-white/40 font-mono text-[10px]">
                  {(layout.startTime / 1000).toFixed(1)}s –{" "}
                  {(layout.endTime / 1000).toFixed(1)}s
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
