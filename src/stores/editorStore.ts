import { create } from "zustand";

export type EditorTool = "select" | "split" | "trim";

interface DragState {
  type: "reorder" | "trim-start" | "trim-end" | "layout-boundary";
  itemId: string;
  startX: number;
  startValue: number;
}

interface EditorState {
  // Timeline UI state
  timelineZoom: number; // 1.0 = 100%, higher = zoomed in
  timelineScrollX: number; // Horizontal scroll position (px)

  // Selection state
  selectedSliceId: string | null;
  selectedLayoutId: string | null;
  selectedBlurRegionId: string | null;

  // Tool state
  activeTool: EditorTool;

  // Drag state (for live feedback during operations)
  dragState: DragState | null;

  // Actions
  setTimelineZoom: (zoom: number) => void;
  setTimelineScrollX: (scrollX: number) => void;
  selectSlice: (id: string | null) => void;
  selectLayout: (id: string | null) => void;
  selectBlurRegion: (id: string | null) => void;
  setActiveTool: (tool: EditorTool) => void;
  setDragState: (state: DragState | null) => void;
  clearSelection: () => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  // Initial state
  timelineZoom: 1,
  timelineScrollX: 0,
  selectedSliceId: null,
  selectedLayoutId: null,
  selectedBlurRegionId: null,
  activeTool: "select",
  dragState: null,

  // Set timeline zoom (clamped between 0.25 and 4)
  setTimelineZoom: (zoom: number) => {
    const clampedZoom = Math.max(0.25, Math.min(zoom, 4));
    set({ timelineZoom: clampedZoom });
  },

  // Set timeline horizontal scroll
  setTimelineScrollX: (scrollX: number) => {
    set({ timelineScrollX: Math.max(0, scrollX) });
  },

  // Select a slice (clears other selections)
  selectSlice: (id: string | null) => {
    set({
      selectedSliceId: id,
      selectedLayoutId: null,
      selectedBlurRegionId: null,
    });
  },

  // Select a layout (clears other selections)
  selectLayout: (id: string | null) => {
    set({
      selectedLayoutId: id,
      selectedSliceId: null,
      selectedBlurRegionId: null,
    });
  },

  // Select a blur region (clears other selections)
  selectBlurRegion: (id: string | null) => {
    set({
      selectedBlurRegionId: id,
      selectedSliceId: null,
      selectedLayoutId: null,
    });
  },

  // Set active tool
  setActiveTool: (tool: EditorTool) => {
    set({ activeTool: tool });
  },

  // Set drag state
  setDragState: (state: DragState | null) => {
    set({ dragState: state });
  },

  // Clear all selections
  clearSelection: () => {
    set({
      selectedSliceId: null,
      selectedLayoutId: null,
      selectedBlurRegionId: null,
    });
  },
}));
