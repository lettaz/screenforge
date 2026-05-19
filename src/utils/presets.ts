import { save as saveDialog, open as openDialog } from "@tauri-apps/plugin-dialog";
import { writeTextFile, readTextFile } from "@tauri-apps/plugin-fs";
import type { ProjectConfig } from "../types/project";

const STORAGE_KEY = "screenforge.userPresets.v1";
const PRESET_FORMAT = "screenforge-preset-v1";

/**
 * A preset is a partial ProjectConfig — only the visual fields that travel
 * cleanly across projects. We intentionally exclude `recordingRange` (project-
 * specific) and any field that depends on the underlying recording.
 */
export type PresetPayload = Pick<
  ProjectConfig,
  | "background"
  | "padding"
  | "shadow"
  | "screenRadius"
  | "outputAspectRatio"
  | "cursor"
  | "camera"
>;

export interface Preset {
  id: string;
  name: string;
  builtin: boolean;
  createdAt: string;
  payload: PresetPayload;
}

interface PresetFile {
  format: typeof PRESET_FORMAT;
  preset: Preset;
}

// =============================================================================
// Built-in presets
// =============================================================================

const BUILTIN: Preset[] = [
  {
    id: "builtin-indigo-soft",
    name: "Indigo Soft",
    builtin: true,
    createdAt: "2026-01-01T00:00:00Z",
    payload: {
      background: {
        type: "gradient",
        gradient: {
          start: { x: 0, y: 0 },
          end: { x: 1, y: 1 },
          stops: [
            { color: "#3F37C9", at: 0 },
            { color: "#8C87DF", at: 1 },
          ],
        },
      },
      padding: { top: 64, right: 64, bottom: 64, left: 64 },
      shadow: { intensity: 0.65, angle: 90, distance: 30, blur: 40 },
      screenRadius: 18,
      outputAspectRatio: { x: 16, y: 9 },
      cursor: {
        size: 1.5,
        smoothing: {
          enabled: true,
          spring: { stiffness: 470, damping: 70, mass: 3 },
        },
        hideAfterMs: null,
      },
      camera: {
        enabled: true,
        position: "bottom-right",
        size: 0.32,
        roundness: 0.5,
        mirror: false,
      },
    },
  },
  {
    id: "builtin-sunset",
    name: "Sunset",
    builtin: true,
    createdAt: "2026-01-01T00:00:00Z",
    payload: {
      background: {
        type: "gradient",
        gradient: {
          start: { x: 0, y: 0 },
          end: { x: 1, y: 1 },
          stops: [
            { color: "#F97316", at: 0 },
            { color: "#DB2777", at: 1 },
          ],
        },
      },
      padding: { top: 80, right: 80, bottom: 80, left: 80 },
      shadow: { intensity: 0.55, angle: 90, distance: 40, blur: 60 },
      screenRadius: 24,
      outputAspectRatio: { x: 16, y: 9 },
      cursor: {
        size: 1.6,
        smoothing: {
          enabled: true,
          spring: { stiffness: 470, damping: 70, mass: 3 },
        },
        hideAfterMs: null,
      },
      camera: {
        enabled: true,
        position: "bottom-right",
        size: 0.32,
        roundness: 1,
        mirror: false,
      },
    },
  },
  {
    id: "builtin-minimal-dark",
    name: "Minimal Dark",
    builtin: true,
    createdAt: "2026-01-01T00:00:00Z",
    payload: {
      background: { type: "solid", color: "#0B1120" },
      padding: { top: 48, right: 48, bottom: 48, left: 48 },
      shadow: { intensity: 0.4, angle: 90, distance: 20, blur: 30 },
      screenRadius: 12,
      outputAspectRatio: { x: 16, y: 9 },
      cursor: {
        size: 1.4,
        smoothing: {
          enabled: true,
          spring: { stiffness: 470, damping: 70, mass: 3 },
        },
        hideAfterMs: null,
      },
      camera: {
        enabled: true,
        position: "bottom-right",
        size: 0.28,
        roundness: 0.2,
        mirror: false,
      },
    },
  },
  {
    id: "builtin-social-square",
    name: "Social (1:1)",
    builtin: true,
    createdAt: "2026-01-01T00:00:00Z",
    payload: {
      background: {
        type: "gradient",
        gradient: {
          start: { x: 0, y: 0 },
          end: { x: 1, y: 1 },
          stops: [
            { color: "#0EA5E9", at: 0 },
            { color: "#1E40AF", at: 1 },
          ],
        },
      },
      padding: { top: 96, right: 96, bottom: 96, left: 96 },
      shadow: { intensity: 0.6, angle: 90, distance: 28, blur: 36 },
      screenRadius: 24,
      outputAspectRatio: { x: 1, y: 1 },
      cursor: {
        size: 1.6,
        smoothing: {
          enabled: true,
          spring: { stiffness: 470, damping: 70, mass: 3 },
        },
        hideAfterMs: null,
      },
      camera: {
        enabled: true,
        position: "bottom-right",
        size: 0.3,
        roundness: 1,
        mirror: false,
      },
    },
  },
  {
    id: "builtin-vertical-9-16",
    name: "Vertical (9:16)",
    builtin: true,
    createdAt: "2026-01-01T00:00:00Z",
    payload: {
      background: {
        type: "gradient",
        gradient: {
          start: { x: 0, y: 0 },
          end: { x: 1, y: 1 },
          stops: [
            { color: "#A21CAF", at: 0 },
            { color: "#1E1B4B", at: 1 },
          ],
        },
      },
      padding: { top: 120, right: 40, bottom: 120, left: 40 },
      shadow: { intensity: 0.5, angle: 90, distance: 24, blur: 32 },
      screenRadius: 20,
      outputAspectRatio: { x: 9, y: 16 },
      cursor: {
        size: 1.7,
        smoothing: {
          enabled: true,
          spring: { stiffness: 470, damping: 70, mass: 3 },
        },
        hideAfterMs: null,
      },
      camera: {
        enabled: true,
        position: "top-right",
        size: 0.34,
        roundness: 1,
        mirror: false,
      },
    },
  },
];

export const BUILTIN_PRESETS: readonly Preset[] = BUILTIN;

// =============================================================================
// User preset storage (localStorage)
// =============================================================================

function loadUserPresets(): Preset[] {
  if (typeof window === "undefined") {
    return [];
  }
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return [];
  }
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed.filter(isPreset);
}

function saveUserPresets(presets: Preset[]): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
}

export function listPresets(): { builtin: Preset[]; user: Preset[] } {
  return {
    builtin: [...BUILTIN_PRESETS],
    user: loadUserPresets(),
  };
}

function generateId(): string {
  return `user-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createPresetFromConfig(
  name: string,
  config: ProjectConfig,
): Preset {
  const payload: PresetPayload = {
    background: config.background,
    padding: config.padding,
    shadow: config.shadow,
    screenRadius: config.screenRadius,
    outputAspectRatio: config.outputAspectRatio,
    cursor: config.cursor,
    camera: config.camera,
  };
  return {
    id: generateId(),
    name,
    builtin: false,
    createdAt: new Date().toISOString(),
    payload,
  };
}

export function saveUserPreset(preset: Preset): void {
  if (preset.builtin) {
    throw new Error("Cannot persist built-in preset");
  }
  const presets = loadUserPresets();
  const existingIndex = presets.findIndex((p) => p.id === preset.id);
  if (existingIndex >= 0) {
    presets[existingIndex] = preset;
  } else {
    presets.push(preset);
  }
  saveUserPresets(presets);
}

export function deleteUserPreset(id: string): void {
  const presets = loadUserPresets().filter((p) => p.id !== id);
  saveUserPresets(presets);
}

export function renameUserPreset(id: string, name: string): void {
  const presets = loadUserPresets();
  const idx = presets.findIndex((p) => p.id === id);
  if (idx < 0) {
    return;
  }
  presets[idx] = { ...presets[idx], name };
  saveUserPresets(presets);
}

// =============================================================================
// File export / import
// =============================================================================

export async function exportPresetToFile(preset: Preset): Promise<string | null> {
  const file = await saveDialog({
    title: "Export preset",
    defaultPath: `${slugify(preset.name)}.screenforge-preset.json`,
    filters: [{ name: "Screenforge Preset", extensions: ["json"] }],
  });
  if (!file) {
    return null;
  }
  const payload: PresetFile = {
    format: PRESET_FORMAT,
    preset: { ...preset, builtin: false },
  };
  await writeTextFile(file, JSON.stringify(payload, null, 2));
  return file;
}

export async function importPresetFromFile(): Promise<Preset | null> {
  const selected = await openDialog({
    title: "Import preset",
    filters: [{ name: "Screenforge Preset", extensions: ["json"] }],
    multiple: false,
  });
  if (!selected || Array.isArray(selected)) {
    return null;
  }
  const raw = await readTextFile(selected);
  const parsed = JSON.parse(raw) as unknown;
  if (!isPresetFile(parsed)) {
    throw new Error("Not a valid Screenforge preset file");
  }
  const imported: Preset = {
    ...parsed.preset,
    id: generateId(),
    builtin: false,
    createdAt: new Date().toISOString(),
  };
  saveUserPreset(imported);
  return imported;
}

// =============================================================================
// Type guards
// =============================================================================

function isPreset(value: unknown): value is Preset {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.name === "string" &&
    typeof v.builtin === "boolean" &&
    typeof v.createdAt === "string" &&
    typeof v.payload === "object" &&
    v.payload !== null
  );
}

function isPresetFile(value: unknown): value is PresetFile {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return v.format === PRESET_FORMAT && isPreset(v.preset);
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "preset";
}
