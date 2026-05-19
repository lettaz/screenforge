import { useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { convertFileSrc } from "@tauri-apps/api/core";
import {
  BookOpen,
  Image as ImageIcon,
  Palette,
  Sparkles,
  Square,
} from "lucide-react";
import { useProjectStore } from "../../stores/projectStore";
import PresetsSection from "./PresetsSection";
import type {
  BackgroundType,
  GradientConfig,
  Padding,
  ShadowConfig,
} from "../../types/project";

type Section = "background" | "frame" | "shadow" | "aspect" | "presets";

const SOLID_PRESETS: readonly string[] = [
  "#0F172A",
  "#1E293B",
  "#3F37C9",
  "#7C3AED",
  "#DB2777",
  "#F97316",
  "#10B981",
  "#FFFFFF",
];

const GRADIENT_PRESETS: readonly { name: string; stops: GradientConfig["stops"] }[] = [
  { name: "Indigo", stops: [{ color: "#3F37C9", at: 0 }, { color: "#8C87DF", at: 1 }] },
  { name: "Sunset", stops: [{ color: "#F97316", at: 0 }, { color: "#DB2777", at: 1 }] },
  { name: "Ocean", stops: [{ color: "#0EA5E9", at: 0 }, { color: "#1E40AF", at: 1 }] },
  { name: "Mint", stops: [{ color: "#10B981", at: 0 }, { color: "#0F766E", at: 1 }] },
  { name: "Plum", stops: [{ color: "#A21CAF", at: 0 }, { color: "#1E1B4B", at: 1 }] },
  { name: "Charcoal", stops: [{ color: "#1F2937", at: 0 }, { color: "#0B1120", at: 1 }] },
];

const ASPECT_PRESETS: readonly { name: string; x: number; y: number }[] = [
  { name: "16:9", x: 16, y: 9 },
  { name: "4:3", x: 4, y: 3 },
  { name: "1:1", x: 1, y: 1 },
  { name: "9:16", x: 9, y: 16 },
  { name: "21:9", x: 21, y: 9 },
];

export default function StylingPanel() {
  const { project, updateConfig } = useProjectStore();
  const [section, setSection] = useState<Section>("background");

  if (!project) {
    return null;
  }

  const config = project.config;

  const setBackgroundType = (type: BackgroundType) => {
    if (type === "solid") {
      updateConfig({
        background: { type: "solid", color: config.background.color ?? "#0F172A" },
      });
    } else if (type === "gradient") {
      updateConfig({
        background: {
          type: "gradient",
          gradient:
            config.background.gradient ??
            {
              start: { x: 0, y: 0 },
              end: { x: 1, y: 1 },
              stops: [
                { color: "#3F37C9", at: 0 },
                { color: "#8C87DF", at: 1 },
              ],
            },
        },
      });
    } else {
      updateConfig({
        background: { type: "image", imageUrl: config.background.imageUrl },
      });
    }
  };

  const pickImage = async () => {
    const selected = await openDialog({
      title: "Choose background image",
      filters: [{ name: "Image", extensions: ["png", "jpg", "jpeg", "webp"] }],
      multiple: false,
    });
    if (!selected || Array.isArray(selected)) return;
    const url = convertFileSrc(selected);
    updateConfig({ background: { type: "image", imageUrl: url } });
  };

  const setPadding = (next: Partial<Padding>) => {
    updateConfig({ padding: { ...config.padding, ...next } });
  };

  const setUniformPadding = (value: number) => {
    updateConfig({
      padding: { top: value, right: value, bottom: value, left: value },
    });
  };

  const setShadow = (next: Partial<ShadowConfig>) => {
    updateConfig({ shadow: { ...config.shadow, ...next } });
  };

  return (
    <aside className="w-72 bg-panel border-l border-border flex flex-col h-full">
      <div className="px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold text-white/90">Styling</h3>
        <p className="text-xs text-white/40 mt-0.5">Live preview, auto-saved</p>
      </div>

      <nav className="flex border-b border-border text-[10px]">
        {(
          [
            { id: "background", label: "Bg", icon: Palette },
            { id: "frame", label: "Frame", icon: Square },
            { id: "shadow", label: "Shadow", icon: Sparkles },
            { id: "aspect", label: "Aspect", icon: ImageIcon },
            { id: "presets", label: "Presets", icon: BookOpen },
          ] as const
        ).map(({ id, label, icon: Icon }) => {
          const active = section === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setSection(id)}
              className={`flex-1 flex flex-col items-center gap-1 py-2 transition-colors ${
                active
                  ? "bg-accent/10 text-white border-b-2 border-accent"
                  : "text-white/50 hover:text-white"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{label}</span>
            </button>
          );
        })}
      </nav>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 text-xs">
        {section === "background" && (
          <>
            <div className="flex gap-1">
              {(["solid", "gradient", "image"] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setBackgroundType(type)}
                  className={`flex-1 capitalize py-1.5 rounded-md border transition-colors ${
                    config.background.type === type
                      ? "border-accent bg-accent/10 text-white"
                      : "border-border text-white/60 hover:text-white"
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>

            {config.background.type === "solid" && (
              <div className="space-y-2">
                <label
                  htmlFor="bg-solid-color"
                  className="block text-white/70"
                >
                  Color
                </label>
                <input
                  id="bg-solid-color"
                  type="color"
                  value={config.background.color ?? "#0F172A"}
                  onChange={(e) =>
                    updateConfig({
                      background: { type: "solid", color: e.target.value },
                    })
                  }
                  className="w-full h-9 rounded-md bg-transparent border border-border cursor-pointer"
                />
                <div className="grid grid-cols-8 gap-1.5">
                  {SOLID_PRESETS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      aria-label={`Use ${color}`}
                      onClick={() =>
                        updateConfig({
                          background: { type: "solid", color },
                        })
                      }
                      className="w-6 h-6 rounded-md border border-white/10 hover:scale-110 transition-transform"
                      style={{ background: color }}
                    />
                  ))}
                </div>
              </div>
            )}

            {config.background.type === "gradient" && config.background.gradient && (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-1.5">
                  {GRADIENT_PRESETS.map((preset) => (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() =>
                        updateConfig({
                          background: {
                            type: "gradient",
                            gradient: {
                              start: { x: 0, y: 0 },
                              end: { x: 1, y: 1 },
                              stops: preset.stops,
                            },
                          },
                        })
                      }
                      className="h-10 rounded-md border border-border hover:border-accent text-[10px] text-white/80 font-medium"
                      style={{
                        background: `linear-gradient(135deg, ${preset.stops[0].color}, ${preset.stops[1].color})`,
                      }}
                    >
                      {preset.name}
                    </button>
                  ))}
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="bg-grad-start"
                    className="block text-white/70"
                  >
                    Stop 1
                  </label>
                  <input
                    id="bg-grad-start"
                    type="color"
                    value={config.background.gradient.stops[0].color}
                    onChange={(e) => {
                      const stops = [...config.background.gradient!.stops];
                      stops[0] = { ...stops[0], color: e.target.value };
                      updateConfig({
                        background: {
                          type: "gradient",
                          gradient: { ...config.background.gradient!, stops },
                        },
                      });
                    }}
                    className="w-full h-8 rounded-md bg-transparent border border-border cursor-pointer"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="bg-grad-end" className="block text-white/70">
                    Stop 2
                  </label>
                  <input
                    id="bg-grad-end"
                    type="color"
                    value={config.background.gradient.stops[1]?.color ?? "#000000"}
                    onChange={(e) => {
                      const stops = [...config.background.gradient!.stops];
                      stops[1] = {
                        ...(stops[1] ?? { at: 1, color: "#000000" }),
                        color: e.target.value,
                      };
                      updateConfig({
                        background: {
                          type: "gradient",
                          gradient: { ...config.background.gradient!, stops },
                        },
                      });
                    }}
                    className="w-full h-8 rounded-md bg-transparent border border-border cursor-pointer"
                  />
                </div>
              </div>
            )}

            {config.background.type === "image" && (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={pickImage}
                  className="w-full py-2 rounded-md border border-border hover:border-accent text-white/80"
                >
                  Choose image…
                </button>
                {config.background.imageUrl && (
                  <div className="rounded-md overflow-hidden border border-border h-20">
                    <img
                      src={config.background.imageUrl}
                      alt="Background"
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {section === "frame" && (
          <>
            <Slider
              id="screen-radius"
              label="Corner radius"
              min={0}
              max={80}
              step={1}
              value={config.screenRadius ?? 0}
              onChange={(v) => updateConfig({ screenRadius: v })}
              suffix="px"
            />
            <div className="h-px bg-border" />
            <Slider
              id="padding-uniform"
              label="Padding (uniform)"
              min={0}
              max={120}
              step={1}
              value={Math.max(
                config.padding.top,
                config.padding.right,
                config.padding.bottom,
                config.padding.left,
              )}
              onChange={(v) => setUniformPadding(v)}
              suffix="px"
            />
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ["top", "Top"],
                  ["right", "Right"],
                  ["bottom", "Bottom"],
                  ["left", "Left"],
                ] as const
              ).map(([key, label]) => (
                <Slider
                  key={key}
                  id={`pad-${key}`}
                  label={label}
                  min={0}
                  max={200}
                  step={1}
                  value={config.padding[key]}
                  onChange={(v) => setPadding({ [key]: v } as Partial<Padding>)}
                  compact
                />
              ))}
            </div>
          </>
        )}

        {section === "shadow" && (
          <>
            <Slider
              id="shadow-intensity"
              label="Intensity"
              min={0}
              max={1}
              step={0.05}
              value={config.shadow.intensity}
              onChange={(v) => setShadow({ intensity: v })}
            />
            <Slider
              id="shadow-blur"
              label="Blur"
              min={0}
              max={80}
              step={1}
              value={config.shadow.blur}
              onChange={(v) => setShadow({ blur: v })}
              suffix="px"
            />
            <Slider
              id="shadow-distance"
              label="Distance"
              min={0}
              max={80}
              step={1}
              value={config.shadow.distance}
              onChange={(v) => setShadow({ distance: v })}
              suffix="px"
            />
            <Slider
              id="shadow-angle"
              label="Angle"
              min={0}
              max={360}
              step={1}
              value={config.shadow.angle}
              onChange={(v) => setShadow({ angle: v })}
              suffix="°"
            />
          </>
        )}

        {section === "aspect" && (
          <>
            <div className="grid grid-cols-3 gap-1.5">
              {ASPECT_PRESETS.map((preset) => {
                const active =
                  config.outputAspectRatio.x === preset.x &&
                  config.outputAspectRatio.y === preset.y;
                return (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() =>
                      updateConfig({
                        outputAspectRatio: { x: preset.x, y: preset.y },
                      })
                    }
                    className={`py-2 rounded-md border text-xs font-medium ${
                      active
                        ? "border-accent bg-accent/10 text-white"
                        : "border-border text-white/60 hover:text-white"
                    }`}
                  >
                    {preset.name}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-white/40 leading-relaxed">
              Output aspect ratio affects the export canvas. Source recording
              is letterboxed into this ratio.
            </p>
          </>
        )}

        {section === "presets" && <PresetsSection />}
      </div>
    </aside>
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
  suffix?: string;
  compact?: boolean;
}

function Slider({
  id,
  label,
  min,
  max,
  step,
  value,
  onChange,
  suffix,
  compact,
}: SliderProps) {
  return (
    <div className={compact ? "space-y-0.5" : "space-y-1"}>
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="text-white/70">
          {label}
        </label>
        <span className="text-white/50 font-mono">
          {Number.isInteger(step) ? Math.round(value) : value.toFixed(2)}
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
