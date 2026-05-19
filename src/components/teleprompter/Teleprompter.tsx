import { useCallback, useEffect, useRef, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import {
  ChevronsUp,
  FileText,
  Minus,
  Pause,
  Play,
  Plus,
  Upload,
  X,
} from "lucide-react";

const STORAGE_KEY = "screenforge.teleprompter.v1";

interface TeleprompterState {
  notes: string;
  fontSize: number;
  scrollSpeed: number;
}

const DEFAULT_STATE: TeleprompterState = {
  notes:
    "Welcome to your teleprompter.\n\nType or paste your notes here. " +
    "This window is excluded from screen captures on macOS, so your notes " +
    "stay invisible to viewers.\n\nUse the controls below to auto-scroll " +
    "while you speak.",
  fontSize: 22,
  scrollSpeed: 30,
};

function loadState(): TeleprompterState {
  if (typeof window === "undefined") return DEFAULT_STATE;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return DEFAULT_STATE;
  const parsed = JSON.parse(raw) as Partial<TeleprompterState> | null;
  if (!parsed || typeof parsed !== "object") return DEFAULT_STATE;
  return {
    notes: typeof parsed.notes === "string" ? parsed.notes : DEFAULT_STATE.notes,
    fontSize:
      typeof parsed.fontSize === "number" ? parsed.fontSize : DEFAULT_STATE.fontSize,
    scrollSpeed:
      typeof parsed.scrollSpeed === "number"
        ? parsed.scrollSpeed
        : DEFAULT_STATE.scrollSpeed,
  };
}

function saveState(state: TeleprompterState): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export default function Teleprompter() {
  const [state, setState] = useState<TeleprompterState>(() => loadState());
  const [isScrolling, setIsScrolling] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef<number>(0);

  useEffect(() => {
    saveState(state);
  }, [state]);

  const startScroll = useCallback(() => {
    setIsScrolling(true);
  }, []);

  const stopScroll = useCallback(() => {
    setIsScrolling(false);
  }, []);

  // Auto-scroll loop driven by requestAnimationFrame so speed is in px/sec.
  useEffect(() => {
    if (!isScrolling) {
      lastTickRef.current = 0;
      return;
    }
    const tick = (timestamp: number) => {
      const el = scrollRef.current;
      if (!el) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      if (lastTickRef.current === 0) {
        lastTickRef.current = timestamp;
      }
      const deltaSec = (timestamp - lastTickRef.current) / 1000;
      lastTickRef.current = timestamp;
      el.scrollTop += state.scrollSpeed * deltaSec;
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 1) {
        setIsScrolling(false);
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [isScrolling, state.scrollSpeed]);

  const importFile = useCallback(async () => {
    const selected = await openDialog({
      title: "Import notes",
      filters: [{ name: "Text", extensions: ["txt", "md", "markdown"] }],
      multiple: false,
    });
    if (!selected || Array.isArray(selected)) return;
    const content = await readTextFile(selected);
    setState((s) => ({ ...s, notes: content }));
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, []);

  const close = useCallback(async () => {
    try {
      await invoke("hide_teleprompter_window");
    } catch {
      window.close();
    }
  }, []);

  const adjustFont = (delta: number) => {
    setState((s) => ({
      ...s,
      fontSize: Math.max(12, Math.min(72, s.fontSize + delta)),
    }));
  };

  const adjustSpeed = (delta: number) => {
    setState((s) => ({
      ...s,
      scrollSpeed: Math.max(5, Math.min(200, s.scrollSpeed + delta)),
    }));
  };

  const resetScroll = () => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    setIsScrolling(false);
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-background text-white">
      <header className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2 text-xs text-white/60">
          <FileText className="w-3.5 h-3.5" />
          <span>Teleprompter</span>
          <span className="text-white/30 hidden sm:inline">
            · Excluded from screen capture
          </span>
        </div>
        <button
          type="button"
          onClick={close}
          className="text-white/50 hover:text-white p-1"
          title="Hide window"
        >
          <X className="w-4 h-4" />
        </button>
      </header>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-6 py-6 leading-relaxed whitespace-pre-wrap font-serif"
        style={{ fontSize: state.fontSize }}
        onClick={() => {
          if (isScrolling) stopScroll();
        }}
        onKeyDown={(e) => {
          if (e.key === " " && !isEditing) {
            e.preventDefault();
            isScrolling ? stopScroll() : startScroll();
          }
        }}
        tabIndex={0}
      >
        {isEditing ? (
          <textarea
            value={state.notes}
            onChange={(e) => setState((s) => ({ ...s, notes: e.target.value }))}
            className="w-full h-full bg-transparent outline-none resize-none font-serif"
            style={{ fontSize: state.fontSize }}
            autoFocus
          />
        ) : (
          state.notes
        )}
      </div>

      <footer className="border-t border-border px-2 py-2 flex items-center gap-2 text-xs">
        <button
          type="button"
          onClick={isScrolling ? stopScroll : startScroll}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-accent text-white font-medium"
          title="Spacebar to toggle"
        >
          {isScrolling ? (
            <>
              <Pause className="w-3.5 h-3.5" />
              Pause
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5" />
              Scroll
            </>
          )}
        </button>

        <button
          type="button"
          onClick={resetScroll}
          className="p-1.5 rounded-md border border-border text-white/60 hover:text-white"
          title="Back to top"
        >
          <ChevronsUp className="w-3.5 h-3.5" />
        </button>

        <div className="flex items-center gap-0.5 px-1 border border-border rounded-md">
          <button
            type="button"
            onClick={() => adjustFont(-2)}
            className="p-1 text-white/60 hover:text-white"
            title="Smaller text"
          >
            <Minus className="w-3 h-3" />
          </button>
          <span className="text-white/60 font-mono w-7 text-center">
            {state.fontSize}
          </span>
          <button
            type="button"
            onClick={() => adjustFont(2)}
            className="p-1 text-white/60 hover:text-white"
            title="Bigger text"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>

        <div className="flex items-center gap-0.5 px-1 border border-border rounded-md">
          <button
            type="button"
            onClick={() => adjustSpeed(-5)}
            className="p-1 text-white/60 hover:text-white"
            title="Slower"
          >
            <Minus className="w-3 h-3" />
          </button>
          <span className="text-white/60 font-mono w-7 text-center">
            {state.scrollSpeed}
          </span>
          <button
            type="button"
            onClick={() => adjustSpeed(5)}
            className="p-1 text-white/60 hover:text-white"
            title="Faster"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>

        <div className="flex-1" />

        <button
          type="button"
          onClick={() => setIsEditing((v) => !v)}
          className={`px-2 py-1.5 rounded-md border ${
            isEditing
              ? "border-accent bg-accent/10 text-white"
              : "border-border text-white/60 hover:text-white"
          }`}
        >
          {isEditing ? "Done" : "Edit"}
        </button>

        <button
          type="button"
          onClick={importFile}
          className="flex items-center gap-1 px-2 py-1.5 rounded-md border border-border text-white/60 hover:text-white"
          title="Import text/markdown"
        >
          <Upload className="w-3 h-3" />
          Import
        </button>
      </footer>
    </div>
  );
}
