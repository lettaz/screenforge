import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type {
  Project,
  ProjectMeta,
  ProjectConfig,
  RecordingMetadata,
  Marker,
  Slice,
  Layout,
  Scene,
  BlurRegion,
} from "../types/project";
import { generateSliceId, createDefaultSlice } from "../utils/sliceUtils";

// Auto-save debounce timeout
let autoSaveTimeout: ReturnType<typeof setTimeout> | null = null;
const AUTO_SAVE_DELAY_MS = 500;

// Default project configuration
const defaultConfig: ProjectConfig = {
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
  padding: { top: 0, right: 0, bottom: 0, left: 0 },
  shadow: {
    intensity: 0.75,
    angle: 90,
    distance: 25,
    blur: 20,
  },
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
    size: 0.35,
    roundness: 0.25,
    mirror: false,
  },
  audio: {
    systemVolume: 1,
    microphoneVolume: 1,
    enhanceMicrophone: true,
  },
  recordingRange: [0, 0],
  outputAspectRatio: { x: 16, y: 9 },
  screenRadius: 16,
  clickEffects: {
    enabled: true,
    style: "ripple",
    colorLeft: "#3B82F6",
    colorRight: "#EF4444",
    size: 1,
    durationMs: 500,
    soundEnabled: false,
    soundUrl: null,
    soundVolume: 0.6,
  },
  keystrokesOverlay: {
    enabled: true,
    position: "bottom",
    theme: "dark",
    visibleDurationMs: 1500,
    maxChips: 8,
  },
  music: {
    enabled: false,
    audioUrl: null,
    audioPath: null,
    volume: 0.3,
    fadeInMs: 500,
    fadeOutMs: 1000,
  },
  layoutTransitionMs: 400,
};

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function generateLayoutId(): string {
  return `layout-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

interface ProjectState {
  // Project data
  project: Project | null;
  meta: ProjectMeta | null;
  markers: Marker[];
  recordingMetadata: RecordingMetadata | null;

  // Project path (where it's saved)
  projectPath: string | null;

  // Active scene index
  activeSceneIndex: number;

  // Loading state
  isLoading: boolean;
  error: string | null;

  // Basic project actions
  createProject: () => void;
  createProjectFromRecording: (recordingBundlePath: string) => Promise<void>;
  openProject: () => Promise<void>;
  openProjectFromPath: (path: string) => Promise<void>;
  closeProject: () => void;
  setProject: (project: Project) => void;
  updateConfig: (config: Partial<ProjectConfig>) => void;
  _resetState: () => void;

  // Scene actions
  setActiveScene: (index: number) => void;
  initializeFromRecording: (durationMs: number) => void;

  // Track type for slices
  // Slice actions (track: 'screen' | 'camera')
  addSlice: (
    sceneIndex: number,
    track: "screen" | "camera",
    slice: Slice,
  ) => void;
  updateSlice: (
    sceneIndex: number,
    track: "screen" | "camera",
    sliceId: string,
    updates: Partial<Slice>,
  ) => void;
  removeSlice: (sceneIndex: number, sliceId: string) => void; // Removes from all tracks (linked)
  splitSlice: (
    sceneIndex: number,
    sliceId: string,
    splitOutputTimeMs: number,
  ) => void; // Splits all tracks at the same time (linked)
  splitAllTracksAt: (sceneIndex: number, splitOutputTimeMs: number) => void;
  reorderSlices: (
    sceneIndex: number,
    track: "screen" | "camera",
    fromIndex: number,
    toIndex: number,
  ) => void;

  // Layout actions
  addLayout: (sceneIndex: number, layout: Layout) => void;
  updateLayout: (
    sceneIndex: number,
    layoutId: string,
    updates: Partial<Layout>,
  ) => void;
  removeLayout: (sceneIndex: number, layoutId: string) => void;
  splitLayout: (
    sceneIndex: number,
    layoutId: string,
    splitTimeMs: number,
  ) => void;

  // Blur region actions
  addBlurRegion: (sceneIndex: number, region: BlurRegion) => void;
  updateBlurRegion: (
    sceneIndex: number,
    regionId: string,
    updates: Partial<BlurRegion>,
  ) => void;
  removeBlurRegion: (sceneIndex: number, regionId: string) => void;

  // Helpers
  getActiveScene: () => Scene | null;
  getScreenSlices: () => Slice[];
  getCameraSlices: () => Slice[];
  getLayouts: () => Layout[];
  getBlurRegions: () => BlurRegion[];
}

/**
 * Trigger auto-save after a debounce delay.
 * This is called after every mutation to persist changes to disk.
 */
function triggerAutoSave(get: () => ProjectState) {
  // Clear any existing timeout
  if (autoSaveTimeout) {
    clearTimeout(autoSaveTimeout);
  }

  // Schedule a new auto-save
  autoSaveTimeout = setTimeout(async () => {
    const { project, projectPath } = get();

    // Only auto-save if we have a project and a saved path
    if (!project || !projectPath) {
      return;
    }

    try {
      // Update the project in backend state first
      await invoke("update_project", { project });
      // Then trigger auto-save
      await invoke("auto_save_project");
      console.log("Auto-saved project");
    } catch (e) {
      console.error("Auto-save failed:", e);
    }
  }, AUTO_SAVE_DELAY_MS);
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  // Initial state
  project: null,
  meta: null,
  markers: [],
  recordingMetadata: null,
  projectPath: null,
  activeSceneIndex: 0,
  isLoading: false,
  error: null,

  // Create a new project
  createProject: () => {
    const now = new Date().toISOString();
    const project: Project = {
      id: generateId(),
      name: "Untitled Recording",
      createdAt: now,
      config: { ...defaultConfig },
      scenes: [],
    };

    const meta: ProjectMeta = {
      version: "0.1.0",
      format: "osp-v1",
      createdAt: now,
      updatedAt: now,
    };

    set({
      project,
      meta,
      markers: [],
      recordingMetadata: null,
      projectPath: null,
      activeSceneIndex: 0,
      error: null,
    });
  },

  // Create a project from a recording bundle - auto-saves to default location
  createProjectFromRecording: async (recordingBundlePath: string) => {
    set({ isLoading: true, error: null });
    try {
      // Rust command now returns [Project, savedPath] tuple
      const [project, savedPath] = await invoke<[Project, string]>(
        "create_project_from_recording",
        { recordingBundlePath },
      );

      const now = new Date().toISOString();
      const meta: ProjectMeta = {
        version: "0.1.0",
        format: "osp-v1",
        createdAt: now,
        updatedAt: now,
      };

      set({
        project,
        meta,
        projectPath: savedPath, // Already saved to default location
        activeSceneIndex: 0,
        isLoading: false,
      });

      console.log(`Project created and saved to: ${savedPath}`);
    } catch (e) {
      set({ error: String(e), isLoading: false });
      throw e;
    }
  },

  // Open an existing project via file dialog
  openProject: async () => {
    try {
      // Show open dialog
      const selectedPath = await open({
        title: "Open Project",
        filters: [{ name: "ScreenStudio Project", extensions: ["osp"] }],
        directory: true, // .osp is a directory
        multiple: false,
      });

      if (!selectedPath || Array.isArray(selectedPath)) return;

      await get().openProjectFromPath(selectedPath);
    } catch (e) {
      set({ error: String(e) });
      throw e;
    }
  },

  // Open a project from a specific path
  openProjectFromPath: async (path: string) => {
    set({ isLoading: true, error: null });
    try {
      const project = await invoke<Project>("open_project", { path });

      const now = new Date().toISOString();
      const meta: ProjectMeta = {
        version: "0.1.0",
        format: "osp-v1",
        createdAt: project.createdAt,
        updatedAt: now,
      };

      set({
        project,
        meta,
        projectPath: path,
        isLoading: false,
        activeSceneIndex: 0,
      });
    } catch (e) {
      set({ error: String(e), isLoading: false });
      throw e;
    }
  },

  // Close the current project
  closeProject: () => {
    get()._resetState();
  },

  // Reset all state
  _resetState: () => {
    // Clear any pending auto-save
    if (autoSaveTimeout) {
      clearTimeout(autoSaveTimeout);
      autoSaveTimeout = null;
    }

    set({
      project: null,
      meta: null,
      markers: [],
      recordingMetadata: null,
      projectPath: null,
      activeSceneIndex: 0,
      error: null,
    });
  },

  // Set the entire project
  setProject: (project: Project) => {
    set({ project });
    triggerAutoSave(get);
  },

  // Update project config
  updateConfig: (configUpdate: Partial<ProjectConfig>) => {
    const { project } = get();
    if (!project) return;

    set({
      project: {
        ...project,
        config: { ...project.config, ...configUpdate },
      },
    });
    triggerAutoSave(get);
  },

  // Set active scene index
  setActiveScene: (index: number) => {
    const { project } = get();
    if (!project || index < 0 || index >= project.scenes.length) return;
    set({ activeSceneIndex: index });
  },

  // Initialize project with a default scene from recording duration
  initializeFromRecording: (durationMs: number) => {
    let { project } = get();

    // Create a new project if one doesn't exist
    if (!project) {
      const now = new Date().toISOString();
      project = {
        id: generateId(),
        name: "Untitled Recording",
        createdAt: now,
        config: { ...defaultConfig },
        scenes: [],
      };

      const meta: ProjectMeta = {
        version: "0.1.0",
        format: "osp-v1",
        createdAt: now,
        updatedAt: now,
      };

      set({ project, meta });
    }

    // Don't reinitialize if scenes already exist
    if (project.scenes.length > 0) {
      return;
    }

    // Create a default scene with one slice covering the entire recording
    // Both screen and camera tracks get the same initial slice
    const defaultScene: Scene = {
      id: generateId(),
      name: "Main",
      type: "recording",
      sessionIndex: 0,
      screenSlices: [createDefaultSlice(durationMs)],
      cameraSlices: [createDefaultSlice(durationMs)],
      zoomRanges: [],
      layouts: [
        {
          id: generateLayoutId(),
          startTime: 0,
          endTime: durationMs,
          type: "screen-with-camera",
          cameraSize: 0.2,
          cameraPosition: { x: 0.9, y: 0.9 },
        },
      ],
    };

    set({
      project: {
        ...project,
        scenes: [defaultScene],
        config: {
          ...project.config,
          recordingRange: [0, durationMs],
        },
      },
      activeSceneIndex: 0,
    });
    triggerAutoSave(get);
  },

  // Helper to get slices array by track type
  _getTrackSlices: (scene: Scene, track: "screen" | "camera"): Slice[] => {
    return track === "screen" ? scene.screenSlices : scene.cameraSlices;
  },

  // Add a slice to a specific track
  addSlice: (sceneIndex: number, track: "screen" | "camera", slice: Slice) => {
    const { project } = get();
    if (!project || sceneIndex < 0 || sceneIndex >= project.scenes.length)
      return;

    const scene = project.scenes[sceneIndex];
    const newScenes = [...project.scenes];

    if (track === "screen") {
      newScenes[sceneIndex] = {
        ...scene,
        screenSlices: [...scene.screenSlices, slice],
      };
    } else {
      newScenes[sceneIndex] = {
        ...scene,
        cameraSlices: [...scene.cameraSlices, slice],
      };
    }

    set({
      project: { ...project, scenes: newScenes },
    });
    triggerAutoSave(get);
  },

  // Update a slice in a specific track
  updateSlice: (
    sceneIndex: number,
    track: "screen" | "camera",
    sliceId: string,
    updates: Partial<Slice>,
  ) => {
    const { project } = get();
    if (!project || sceneIndex < 0 || sceneIndex >= project.scenes.length)
      return;

    const scene = project.scenes[sceneIndex];
    const slices = track === "screen" ? scene.screenSlices : scene.cameraSlices;
    const sliceIndex = slices.findIndex((s) => s.id === sliceId);
    if (sliceIndex === -1) return;

    const newSlices = [...slices];
    newSlices[sliceIndex] = { ...newSlices[sliceIndex], ...updates };

    const newScenes = [...project.scenes];
    if (track === "screen") {
      newScenes[sceneIndex] = { ...scene, screenSlices: newSlices };
    } else {
      newScenes[sceneIndex] = { ...scene, cameraSlices: newSlices };
    }

    set({
      project: { ...project, scenes: newScenes },
    });
    triggerAutoSave(get);
  },

  // Remove a slice from ALL tracks (linked deletion)
  // Finds the slice by ID in either track, determines its index, then removes the same index from both tracks
  removeSlice: (sceneIndex: number, sliceId: string) => {
    const { project } = get();
    if (!project || sceneIndex < 0 || sceneIndex >= project.scenes.length)
      return;

    const scene = project.scenes[sceneIndex];

    // Find the slice index in either track
    let sliceIndex = scene.screenSlices.findIndex((s) => s.id === sliceId);
    if (sliceIndex === -1) {
      sliceIndex = scene.cameraSlices.findIndex((s) => s.id === sliceId);
    }
    if (sliceIndex === -1) return;

    // Don't allow removing the last slice
    if (scene.screenSlices.length <= 1 || scene.cameraSlices.length <= 1)
      return;

    // Remove from both tracks at the same index (linked deletion)
    const newScreenSlices = [...scene.screenSlices];
    const newCameraSlices = [...scene.cameraSlices];

    if (sliceIndex < newScreenSlices.length) {
      newScreenSlices.splice(sliceIndex, 1);
    }
    if (sliceIndex < newCameraSlices.length) {
      newCameraSlices.splice(sliceIndex, 1);
    }

    const newScenes = [...project.scenes];
    newScenes[sceneIndex] = {
      ...scene,
      screenSlices: newScreenSlices,
      cameraSlices: newCameraSlices,
    };

    set({
      project: { ...project, scenes: newScenes },
    });
    triggerAutoSave(get);
  },

  // Split a slice at a given output time (kept for backward compat, but use splitAllTracksAt)
  splitSlice: (
    sceneIndex: number,
    _sliceId: string,
    splitOutputTimeMs: number,
  ) => {
    // Just call splitAllTracksAt since we now want linked splits
    get().splitAllTracksAt(sceneIndex, splitOutputTimeMs);
  },

  // Split ALL tracks at a given output time (linked split)
  splitAllTracksAt: (sceneIndex: number, splitOutputTimeMs: number) => {
    const { project } = get();
    if (!project || sceneIndex < 0 || sceneIndex >= project.scenes.length)
      return;

    const scene = project.scenes[sceneIndex];
    const minSplitDuration = 100; // Minimum 100ms per resulting slice

    // Helper to split a single track's slices
    const splitTrack = (slices: Slice[]): Slice[] | null => {
      // Find which slice contains this time
      let cumulativeTime = 0;
      for (let i = 0; i < slices.length; i++) {
        const slice = slices[i];
        const sliceDuration =
          (slice.sourceEndMs - slice.sourceStartMs) / slice.timeScale;
        const sliceOutputStart = cumulativeTime;
        const sliceOutputEnd = cumulativeTime + sliceDuration;

        if (
          splitOutputTimeMs > sliceOutputStart &&
          splitOutputTimeMs < sliceOutputEnd
        ) {
          // Calculate offset within the slice
          const offsetInSlice = splitOutputTimeMs - sliceOutputStart;
          // Round to integer to ensure clean slice boundaries
          const sourceTimeAtSplit = Math.round(
            slice.sourceStartMs + offsetInSlice * slice.timeScale,
          );

          // Validate split point
          if (
            sourceTimeAtSplit <= slice.sourceStartMs + minSplitDuration ||
            sourceTimeAtSplit >= slice.sourceEndMs - minSplitDuration
          ) {
            return null; // Split point too close to edges
          }

          // Create two new slices
          const slice1: Slice = {
            ...slice,
            id: generateSliceId(),
            sourceEndMs: sourceTimeAtSplit,
          };

          const slice2: Slice = {
            ...slice,
            id: generateSliceId(),
            sourceStartMs: sourceTimeAtSplit,
          };

          // Replace original with two new slices
          const newSlices = [...slices];
          newSlices.splice(i, 1, slice1, slice2);
          return newSlices;
        }

        cumulativeTime = sliceOutputEnd;
      }
      return null; // No slice found at this time
    };

    // Split both tracks
    const newScreenSlices = splitTrack(scene.screenSlices);
    const newCameraSlices = splitTrack(scene.cameraSlices);

    // Only update if at least one track was split
    if (!newScreenSlices && !newCameraSlices) return;

    const newScenes = [...project.scenes];
    newScenes[sceneIndex] = {
      ...scene,
      screenSlices: newScreenSlices || scene.screenSlices,
      cameraSlices: newCameraSlices || scene.cameraSlices,
    };

    set({
      project: { ...project, scenes: newScenes },
    });
    triggerAutoSave(get);
  },

  // Reorder slices within a specific track
  reorderSlices: (
    sceneIndex: number,
    track: "screen" | "camera",
    fromIndex: number,
    toIndex: number,
  ) => {
    const { project } = get();
    if (!project || sceneIndex < 0 || sceneIndex >= project.scenes.length)
      return;

    const scene = project.scenes[sceneIndex];
    const slices = track === "screen" ? scene.screenSlices : scene.cameraSlices;

    if (
      fromIndex < 0 ||
      fromIndex >= slices.length ||
      toIndex < 0 ||
      toIndex >= slices.length ||
      fromIndex === toIndex
    ) {
      return;
    }

    const newSlices = [...slices];
    const [removed] = newSlices.splice(fromIndex, 1);
    newSlices.splice(toIndex, 0, removed);

    const newScenes = [...project.scenes];
    if (track === "screen") {
      newScenes[sceneIndex] = { ...scene, screenSlices: newSlices };
    } else {
      newScenes[sceneIndex] = { ...scene, cameraSlices: newSlices };
    }

    set({
      project: { ...project, scenes: newScenes },
    });
    triggerAutoSave(get);
  },

  // Add a layout to a scene
  addLayout: (sceneIndex: number, layout: Layout) => {
    const { project } = get();
    if (!project || sceneIndex < 0 || sceneIndex >= project.scenes.length)
      return;

    const newScenes = [...project.scenes];
    newScenes[sceneIndex] = {
      ...newScenes[sceneIndex],
      layouts: [...newScenes[sceneIndex].layouts, layout],
    };

    set({
      project: { ...project, scenes: newScenes },
    });
    triggerAutoSave(get);
  },

  // Update a layout in a scene
  updateLayout: (
    sceneIndex: number,
    layoutId: string,
    updates: Partial<Layout>,
  ) => {
    const { project } = get();
    if (!project || sceneIndex < 0 || sceneIndex >= project.scenes.length)
      return;

    const scene = project.scenes[sceneIndex];
    const layoutIndex = scene.layouts.findIndex((l) => l.id === layoutId);
    if (layoutIndex === -1) return;

    const newLayouts = [...scene.layouts];
    newLayouts[layoutIndex] = { ...newLayouts[layoutIndex], ...updates };

    const newScenes = [...project.scenes];
    newScenes[sceneIndex] = { ...scene, layouts: newLayouts };

    set({
      project: { ...project, scenes: newScenes },
    });
    triggerAutoSave(get);
  },

  // Remove a layout from a scene
  removeLayout: (sceneIndex: number, layoutId: string) => {
    const { project } = get();
    if (!project || sceneIndex < 0 || sceneIndex >= project.scenes.length)
      return;

    const scene = project.scenes[sceneIndex];
    const newLayouts = scene.layouts.filter((l) => l.id !== layoutId);

    const newScenes = [...project.scenes];
    newScenes[sceneIndex] = { ...scene, layouts: newLayouts };

    set({
      project: { ...project, scenes: newScenes },
    });
    triggerAutoSave(get);
  },

  // Split a layout at a given time
  splitLayout: (sceneIndex: number, layoutId: string, splitTimeMs: number) => {
    const { project } = get();
    if (!project || sceneIndex < 0 || sceneIndex >= project.scenes.length)
      return;

    const scene = project.scenes[sceneIndex];
    const layoutIndex = scene.layouts.findIndex((l) => l.id === layoutId);
    if (layoutIndex === -1) return;

    const layout = scene.layouts[layoutIndex];

    // Validate the split point is within the layout
    const minSplitDuration = 100; // Minimum 100ms per resulting layout
    if (
      splitTimeMs <= layout.startTime + minSplitDuration ||
      splitTimeMs >= layout.endTime - minSplitDuration
    ) {
      return; // Split point too close to edges
    }

    // Create two new layouts
    const layout1: Layout = {
      ...layout,
      id: generateLayoutId(),
      endTime: splitTimeMs,
    };

    const layout2: Layout = {
      ...layout,
      id: generateLayoutId(),
      startTime: splitTimeMs,
    };

    // Replace original with two new layouts
    const newLayouts = [...scene.layouts];
    newLayouts.splice(layoutIndex, 1, layout1, layout2);

    const newScenes = [...project.scenes];
    newScenes[sceneIndex] = { ...scene, layouts: newLayouts };

    set({
      project: { ...project, scenes: newScenes },
    });
    triggerAutoSave(get);
  },

  // Get the currently active scene
  getActiveScene: () => {
    const { project, activeSceneIndex } = get();
    if (
      !project ||
      activeSceneIndex < 0 ||
      activeSceneIndex >= project.scenes.length
    ) {
      return null;
    }
    return project.scenes[activeSceneIndex];
  },

  // Get screen slices from the active scene
  getScreenSlices: () => {
    const scene = get().getActiveScene();
    return scene?.screenSlices ?? [];
  },

  // Get camera slices from the active scene
  getCameraSlices: () => {
    const scene = get().getActiveScene();
    return scene?.cameraSlices ?? [];
  },

  // Get layouts from the active scene
  getLayouts: () => {
    const scene = get().getActiveScene();
    return scene?.layouts ?? [];
  },

  // Get blur regions from the active scene
  getBlurRegions: () => {
    const scene = get().getActiveScene();
    return scene?.blurRegions ?? [];
  },

  addBlurRegion: (sceneIndex: number, region: BlurRegion) => {
    const { project } = get();
    if (!project || sceneIndex < 0 || sceneIndex >= project.scenes.length)
      return;
    const scene = project.scenes[sceneIndex];
    const newScenes = [...project.scenes];
    newScenes[sceneIndex] = {
      ...scene,
      blurRegions: [...(scene.blurRegions ?? []), region],
    };
    set({ project: { ...project, scenes: newScenes } });
    triggerAutoSave(get);
  },

  updateBlurRegion: (
    sceneIndex: number,
    regionId: string,
    updates: Partial<BlurRegion>,
  ) => {
    const { project } = get();
    if (!project || sceneIndex < 0 || sceneIndex >= project.scenes.length)
      return;
    const scene = project.scenes[sceneIndex];
    const regions = scene.blurRegions ?? [];
    const idx = regions.findIndex((r) => r.id === regionId);
    if (idx < 0) return;
    const newRegions = [...regions];
    newRegions[idx] = { ...newRegions[idx], ...updates };
    const newScenes = [...project.scenes];
    newScenes[sceneIndex] = { ...scene, blurRegions: newRegions };
    set({ project: { ...project, scenes: newScenes } });
    triggerAutoSave(get);
  },

  removeBlurRegion: (sceneIndex: number, regionId: string) => {
    const { project } = get();
    if (!project || sceneIndex < 0 || sceneIndex >= project.scenes.length)
      return;
    const scene = project.scenes[sceneIndex];
    const newRegions = (scene.blurRegions ?? []).filter((r) => r.id !== regionId);
    const newScenes = [...project.scenes];
    newScenes[sceneIndex] = { ...scene, blurRegions: newRegions };
    set({ project: { ...project, scenes: newScenes } });
    triggerAutoSave(get);
  },
}));
