import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { UnlistenFn } from "@tauri-apps/api/event";
import {
  Film,
  Image,
  Globe,
  Monitor,
  Smartphone,
  Square,
  CheckCircle,
  ClipboardCheck,
  Clipboard,
  Loader2,
  AlertCircle,
  FolderOpen,
  Youtube,
  Twitter,
  Instagram,
  X,
} from "lucide-react";
import { useProjectStore } from "../../stores/projectStore";
import type { Slice } from "../../types/project";
import type { TrackEdits, ExportSegment } from "../../types/export";

type ExportFormat = "mp4" | "gif" | "webm";
type ExportQuality = "low" | "medium" | "high" | "lossless";
type ExportState = "idle" | "exporting" | "complete" | "error";

interface ExportPreset {
  id: string;
  name: string;
  icon: typeof Monitor;
  format: ExportFormat;
  quality: ExportQuality;
  // Resolution is now optional - if not specified, uses source resolution
  // "original" means use source, otherwise "WIDTHxHEIGHT" for specific size
  resolution?: string;
  fps?: number; // Optional - if not specified, uses source fps
  /** Optional video bitrate override in kbps (platform presets, Screenforge #8). */
  bitrateKbps?: number;
}

interface ExportProgress {
  percent: number;
  stage: {
    type:
      | "preparing"
      | "smoothingCursor"
      | "encoding"
      | "finalizing"
      | "complete"
      | "error";
    message?: string;
  };
  currentFrame: number;
  totalFrames: number;
}

interface ExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  recordingPath: string | null;
  projectName?: string;
  durationMs?: number;
}

// YouTube recommended bitrates: 1080p30 = 8 Mbps, 1080p60 = 12 Mbps, 4K = 35 Mbps.
// Twitter caps at 25 Mbps but recommends 6 Mbps for 720p.
// Instagram (feed/Reels) recommends ~5 Mbps for 1080×1920.
const presets: ExportPreset[] = [
  {
    id: "original",
    name: "Original",
    icon: Monitor,
    format: "mp4",
    quality: "high",
  },
  {
    id: "web-hd",
    name: "Web HD",
    icon: Globe,
    format: "mp4",
    quality: "high",
    resolution: "1920x1080",
  },
  {
    id: "youtube-1080",
    name: "YouTube 1080",
    icon: Youtube,
    format: "mp4",
    quality: "high",
    resolution: "1920x1080",
    fps: 60,
    bitrateKbps: 12000,
  },
  {
    id: "youtube-4k",
    name: "YouTube 4K",
    icon: Youtube,
    format: "mp4",
    quality: "high",
    resolution: "3840x2160",
    fps: 60,
    bitrateKbps: 45000,
  },
  {
    id: "twitter",
    name: "Twitter",
    icon: Twitter,
    format: "mp4",
    quality: "medium",
    resolution: "1280x720",
    fps: 30,
    bitrateKbps: 6000,
  },
  {
    id: "instagram-reel",
    name: "Reels 9:16",
    icon: Instagram,
    format: "mp4",
    quality: "medium",
    resolution: "1080x1920",
    fps: 30,
    bitrateKbps: 5000,
  },
  {
    id: "social",
    name: "Social",
    icon: Smartphone,
    format: "mp4",
    quality: "medium",
    resolution: "1280x720",
  },
  {
    id: "gif",
    name: "GIF",
    icon: Image,
    format: "gif",
    quality: "medium",
    resolution: "640x480",
    fps: 15,
  },
];

function parseResolution(resolution?: string): {
  width: number | null;
  height: number | null;
} {
  if (!resolution) {
    // No resolution specified = use source (null means "use source")
    return { width: null, height: null };
  }
  const [width, height] = resolution.split("x").map(Number);
  return { width: width || null, height: height || null };
}

function getStageLabel(stage: ExportProgress["stage"]): string {
  switch (stage.type) {
    case "preparing":
      return "Preparing...";
    case "smoothingCursor":
      return "Smoothing cursor...";
    case "encoding":
      return "Encoding video...";
    case "finalizing":
      return "Finalizing...";
    case "complete":
      return "Complete!";
    case "error":
      return `Error: ${stage.message || "Unknown error"}`;
    default:
      return "Exporting...";
  }
}

/**
 * Convert project slices to TrackEdits format for export.
 * Values are rounded to integers since Rust expects u64.
 */
function slicesToTrackEdits(slices: Slice[]): TrackEdits {
  return {
    segments: slices.map(
      (s): ExportSegment => ({
        sourceStartMs: Math.round(s.sourceStartMs),
        sourceEndMs: Math.round(s.sourceEndMs),
        timeScale: s.timeScale ?? 1.0,
      }),
    ),
  };
}

export default function ExportDialog({
  isOpen,
  onClose,
  recordingPath,
  projectName = "Untitled Recording",
  durationMs = 0,
}: ExportDialogProps) {
  const { project, projectPath, getScreenSlices } = useProjectStore();
  const [selectedPreset, setSelectedPreset] = useState<string>("web-hd");
  const [exportState, setExportState] = useState<ExportState>("idle");
  const [exportProgress, setExportProgress] = useState(0);
  const [exportStage, setExportStage] = useState<string>("Exporting...");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [outputPath, setOutputPath] = useState<string>("");
  // "Copy to clipboard" UI feedback after a successful export.
  const [copyState, setCopyState] = useState<"idle" | "copying" | "copied" | "error">("idle");
  const [copyError, setCopyError] = useState<string>("");

  // Custom settings (when not using preset)
  const [customFormat, setCustomFormat] = useState<ExportFormat>("mp4");
  const [customQuality, setCustomQuality] = useState<ExportQuality>("high");
  const [customResolution, setCustomResolution] = useState("1920x1080");
  const [customFps, setCustomFps] = useState(60);
  const [useCustom, setUseCustom] = useState(false);

  // GIF-specific options (Screenforge #29)
  type GifDither = "bayer" | "sierra2" | "sierra2_4a" | "none";
  const [gifLoop, setGifLoop] = useState<number>(0);
  const [gifDither, setGifDither] = useState<GifDither>("bayer");

  // Custom bitrate override (Screenforge #8)
  const [customBitrateKbps, setCustomBitrateKbps] = useState<number | undefined>(
    undefined,
  );

  // Refs for event listeners
  const unlistenProgressRef = useRef<UnlistenFn | null>(null);
  const unlistenCompleteRef = useRef<UnlistenFn | null>(null);
  const unlistenErrorRef = useRef<UnlistenFn | null>(null);

  // Reset state when dialog opens
  useEffect(() => {
    if (isOpen) {
      setExportState("idle");
      setExportProgress(0);
      setErrorMessage("");
      setCopyState("idle");
      setCopyError("");
    }
  }, [isOpen]);

  // Cleanup event listeners on unmount
  useEffect(() => {
    return () => {
      unlistenProgressRef.current?.();
      unlistenCompleteRef.current?.();
      unlistenErrorRef.current?.();
    };
  }, []);

  const handleExport = async () => {
    // Use recordingPath prop, fall back to project store
    const projectDir =
      recordingPath ||
      projectPath ||
      (project ? `/tmp/open-screenstudio-${project.id}` : null);

    if (!projectDir) {
      setExportState("error");
      setErrorMessage("No recording path available");
      return;
    }

    setExportState("exporting");
    setExportProgress(0);
    setExportStage("Preparing...");
    setErrorMessage("");

    // Get current settings
    const preset = useCustom
      ? null
      : presets.find((p) => p.id === selectedPreset);
    const format = useCustom ? customFormat : preset?.format || "mp4";
    const quality = useCustom ? customQuality : preset?.quality || "high";
    // Resolution is optional - undefined/null means use source resolution
    const resolution = useCustom ? customResolution : preset?.resolution;
    // FPS is optional - undefined means use source fps
    const fps = useCustom ? customFps : preset?.fps;

    const { width, height } = parseResolution(resolution);

    const exportOutputPath = `${projectDir}/export.${format}`;
    setOutputPath(exportOutputPath);

    try {
      // Set up event listeners
      unlistenProgressRef.current = await listen<ExportProgress>(
        "export-progress",
        (event) => {
          const progress = event.payload;
          setExportProgress(Math.round(progress.percent));
          setExportStage(getStageLabel(progress.stage));
        },
      );

      unlistenCompleteRef.current = await listen("export-complete", () => {
        setExportState("complete");
        setExportProgress(100);
        setExportStage("Complete!");
        // Cleanup listeners
        unlistenProgressRef.current?.();
        unlistenCompleteRef.current?.();
        unlistenErrorRef.current?.();
      });

      unlistenErrorRef.current = await listen<string>(
        "export-error",
        (event) => {
          setExportState("error");
          setErrorMessage(event.payload);
          setExportStage("Error");
          // Cleanup listeners
          unlistenProgressRef.current?.();
          unlistenCompleteRef.current?.();
          unlistenErrorRef.current?.();
        },
      );

      // Get screen slices and convert to edits
      const screenSlices = getScreenSlices();
      const edits = slicesToTrackEdits(screenSlices);

      const music = project?.config.music;
      const motionBlur = project?.config.motionBlur ?? 0;
      // Bitrate precedence: explicit custom override > selected platform preset >
      // project-level default > unset (CRF-only).
      const bitrate =
        (useCustom && customBitrateKbps ? customBitrateKbps : undefined) ??
        (!useCustom ? preset?.bitrateKbps : undefined) ??
        project?.config.exportBitrateKbps;

      await invoke("start_export_with_edits", {
        projectDir: projectDir,
        options: {
          format,
          quality,
          width,
          height,
          fps,
          outputPath: exportOutputPath,
          includeCursor: true,
          includeWebcam: true,
          includeMicAudio: true,
          includeSystemAudio: true,
          musicAudioFile:
            music?.enabled && music.audioPath ? music.audioPath : null,
          musicVolume: music?.enabled ? music.volume : 0,
          musicFadeInMs: music?.enabled ? music.fadeInMs : 0,
          musicFadeOutMs: music?.enabled ? music.fadeOutMs : 0,
          motionBlur,
          videoBitrateKbps: bitrate ?? null,
          gifLoop: format === "gif" ? gifLoop : null,
          gifDither: format === "gif" ? gifDither : null,
          gifStatsMode: format === "gif" ? "diff" : null,
        },
        edits,
      });
    } catch (e) {
      setExportState("error");
      setErrorMessage(e instanceof Error ? e.message : String(e));
      // Cleanup listeners on error
      unlistenProgressRef.current?.();
      unlistenCompleteRef.current?.();
      unlistenErrorRef.current?.();
    }
  };

  const handleCancel = async () => {
    if (exportState === "exporting") {
      try {
        await invoke("cancel_export");
      } catch (e) {
        console.error("Failed to cancel export:", e);
      }
      // Cleanup listeners
      unlistenProgressRef.current?.();
      unlistenCompleteRef.current?.();
      unlistenErrorRef.current?.();
    }
    setExportState("idle");
    setExportProgress(0);
    onClose();
  };

  const handleOpenFolder = async () => {
    if (!outputPath) return;
    try {
      // Open the folder containing the export
      const folderPath = outputPath.substring(0, outputPath.lastIndexOf("/"));
      await invoke("plugin:shell|open", { path: folderPath });
    } catch (e) {
      console.error("Failed to open folder:", e);
    }
  };

  const handleCopyToClipboard = async () => {
    if (!outputPath) return;
    setCopyState("copying");
    setCopyError("");
    try {
      await invoke("copy_file_to_clipboard", { path: outputPath });
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 2200);
    } catch (e) {
      setCopyState("error");
      setCopyError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleClose = () => {
    if (exportState === "exporting") {
      // Don't allow closing while exporting
      return;
    }
    onClose();
  };

  if (!isOpen) return null;

  const currentPreset = presets.find((p) => p.id === selectedPreset);
  const displayFormat = useCustom
    ? customFormat.toUpperCase()
    : currentPreset?.format.toUpperCase() || "MP4";
  const displayResolution = useCustom
    ? customResolution
    : currentPreset?.resolution || "Original";
  const displayFps = useCustom
    ? `${customFps}fps`
    : currentPreset?.fps
      ? `${currentPreset.fps}fps`
      : "Original";
  const displayBitrate = useCustom
    ? customBitrateKbps
      ? `${customBitrateKbps}kbps`
      : null
    : currentPreset?.bitrateKbps
      ? `${currentPreset.bitrateKbps}kbps`
      : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <button
        type="button"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm cursor-default"
        onClick={handleClose}
        aria-label="Close dialog"
      />

      {/* Dialog */}
      <div className="relative bg-background border border-border rounded-xl shadow-2xl w-full max-w-lg mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="text-lg font-semibold text-white">Export Video</h2>
            <p className="text-xs text-white/40">{projectName}</p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={exportState === "exporting"}
            className="p-1 rounded-md hover:bg-white/10 transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5 text-white/60" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-5">
          {exportState === "idle" && (
            <>
              {/* Preset Selection */}
              <div>
                <span className="text-sm font-medium text-white/80 block mb-2">
                  Preset
                </span>
                <div className="grid grid-cols-4 gap-2">
                  {presets.map((preset) => {
                    const Icon = preset.icon;
                    const isSelected =
                      !useCustom && selectedPreset === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => {
                          setSelectedPreset(preset.id);
                          setUseCustom(false);
                        }}
                        className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border transition-colors ${
                          isSelected
                            ? "border-accent bg-accent/10 text-white"
                            : "border-border hover:border-border/80 text-white/60 hover:text-white"
                        }`}
                      >
                        <Icon className="w-5 h-5" />
                        <span className="text-xs font-medium">
                          {preset.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Custom Settings Toggle */}
              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useCustom}
                    onChange={(e) => setUseCustom(e.target.checked)}
                    className="rounded border-border bg-transparent"
                  />
                  <span className="text-sm text-white/80">
                    Use custom settings
                  </span>
                </label>
              </div>

              {/* Custom Settings Form */}
              {useCustom && (
                <div className="grid grid-cols-2 gap-3 p-4 bg-panel rounded-lg">
                  <div>
                    <label
                      htmlFor="export-format"
                      className="text-xs text-white/60 block mb-1"
                    >
                      Format
                    </label>
                    <select
                      id="export-format"
                      value={customFormat}
                      onChange={(e) =>
                        setCustomFormat(e.target.value as ExportFormat)
                      }
                      className="w-full bg-background border border-border rounded-md px-2 py-1.5 text-sm text-white"
                    >
                      <option value="mp4">MP4</option>
                      <option value="webm">WebM</option>
                      <option value="gif">GIF</option>
                    </select>
                  </div>
                  <div>
                    <label
                      htmlFor="export-quality"
                      className="text-xs text-white/60 block mb-1"
                    >
                      Quality
                    </label>
                    <select
                      id="export-quality"
                      value={customQuality}
                      onChange={(e) =>
                        setCustomQuality(e.target.value as ExportQuality)
                      }
                      className="w-full bg-background border border-border rounded-md px-2 py-1.5 text-sm text-white"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="lossless">Lossless</option>
                    </select>
                  </div>
                  <div>
                    <label
                      htmlFor="export-resolution"
                      className="text-xs text-white/60 block mb-1"
                    >
                      Resolution
                    </label>
                    <select
                      id="export-resolution"
                      value={customResolution}
                      onChange={(e) => setCustomResolution(e.target.value)}
                      className="w-full bg-background border border-border rounded-md px-2 py-1.5 text-sm text-white"
                    >
                      <option value="3840x2160">4K</option>
                      <option value="1920x1080">1080p</option>
                      <option value="1280x720">720p</option>
                      <option value="854x480">480p</option>
                    </select>
                  </div>
                  <div>
                    <label
                      htmlFor="export-fps"
                      className="text-xs text-white/60 block mb-1"
                    >
                      FPS
                    </label>
                    <select
                      id="export-fps"
                      value={customFps}
                      onChange={(e) => setCustomFps(Number(e.target.value))}
                      className="w-full bg-background border border-border rounded-md px-2 py-1.5 text-sm text-white"
                    >
                      <option value="60">60</option>
                      <option value="30">30</option>
                      <option value="24">24</option>
                      <option value="15">15</option>
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label
                      htmlFor="export-bitrate"
                      className="text-xs text-white/60 block mb-1"
                    >
                      Bitrate cap (kbps) — leave blank for CRF-only
                    </label>
                    <input
                      id="export-bitrate"
                      type="number"
                      min={500}
                      max={80000}
                      step={500}
                      placeholder="e.g. 8000 for YouTube 1080p"
                      value={customBitrateKbps ?? ""}
                      onChange={(e) => {
                        const v = e.target.value.trim();
                        if (v === "") {
                          setCustomBitrateKbps(undefined);
                        } else {
                          const n = Number(v);
                          setCustomBitrateKbps(Number.isFinite(n) ? n : undefined);
                        }
                      }}
                      className="w-full bg-background border border-border rounded-md px-2 py-1.5 text-sm text-white placeholder:text-white/30"
                    />
                  </div>
                </div>
              )}

              {/* GIF-specific options (Screenforge #29) */}
              {(useCustom ? customFormat : currentPreset?.format) === "gif" && (
                <div className="grid grid-cols-2 gap-3 p-4 bg-panel rounded-lg">
                  <div>
                    <label
                      htmlFor="gif-loop"
                      className="text-xs text-white/60 block mb-1"
                    >
                      Loop
                    </label>
                    <select
                      id="gif-loop"
                      value={gifLoop}
                      onChange={(e) => setGifLoop(parseInt(e.target.value, 10))}
                      className="w-full bg-background border border-border rounded-md px-2 py-1.5 text-sm text-white"
                    >
                      <option value={0}>Infinite</option>
                      <option value={-1}>Play once</option>
                      <option value={1}>2 times</option>
                      <option value={2}>3 times</option>
                      <option value={4}>5 times</option>
                    </select>
                  </div>
                  <div>
                    <label
                      htmlFor="gif-dither"
                      className="text-xs text-white/60 block mb-1"
                    >
                      Dither
                    </label>
                    <select
                      id="gif-dither"
                      value={gifDither}
                      onChange={(e) =>
                        setGifDither(e.target.value as GifDither)
                      }
                      className="w-full bg-background border border-border rounded-md px-2 py-1.5 text-sm text-white"
                    >
                      <option value="bayer">Bayer (sharp)</option>
                      <option value="sierra2">Sierra (smooth)</option>
                      <option value="sierra2_4a">Sierra Lite</option>
                      <option value="none">None (smallest)</option>
                    </select>
                  </div>
                  <p className="col-span-2 text-[11px] text-white/40 leading-relaxed">
                    Two-pass palette + chosen dither. Most screen recordings
                    look best with Bayer at 720p / 15 fps.
                  </p>
                </div>
              )}

              {/* Summary */}
              <div className="flex items-center justify-between text-sm text-white/60 pt-2 border-t border-border">
                <span>
                  {displayFormat} • {displayResolution} • {displayFps}
                  {displayBitrate ? ` • ${displayBitrate}` : ""}
                </span>
                <span>
                  {durationMs > 0
                    ? `${Math.round(durationMs / 1000)}s`
                    : project
                      ? `${Math.round(
                          (project.config.recordingRange[1] -
                            project.config.recordingRange[0]) /
                            1000,
                        )}s`
                      : ""}
                </span>
              </div>
            </>
          )}

          {exportState === "exporting" && (
            <div className="py-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  <span className="text-sm text-white">{exportStage}</span>
                </div>
                <span className="text-sm text-white/60">{exportProgress}%</span>
              </div>
              <div className="h-2 bg-border rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent transition-all duration-300"
                  style={{ width: `${exportProgress}%` }}
                />
              </div>
            </div>
          )}

          {exportState === "complete" && (
            <div className="py-4 text-center space-y-4">
              <div className="flex items-center justify-center gap-2 text-success">
                <CheckCircle className="w-6 h-6" />
                <span className="text-lg font-medium">Export Complete!</span>
              </div>
              <p className="text-sm text-white/60">
                Your video has been exported successfully.
              </p>
            </div>
          )}

          {exportState === "error" && (
            <div className="py-4 text-center space-y-4">
              <div className="flex items-center justify-center gap-2 text-destructive">
                <AlertCircle className="w-6 h-6" />
                <span className="text-lg font-medium">Export Failed</span>
              </div>
              {errorMessage && (
                <p className="text-sm text-white/60">{errorMessage}</p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-border">
          {exportState === "idle" && (
            <>
              <button
                type="button"
                onClick={handleCancel}
                className="px-4 py-2 text-sm text-white/60 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExport}
                className="flex items-center gap-2 bg-accent hover:bg-accent/90 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                <Film className="w-4 h-4" />
                Export
              </button>
            </>
          )}

          {exportState === "exporting" && (
            <button
              type="button"
              onClick={handleCancel}
              className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm text-white/60 hover:text-white hover:border-muted-foreground/50 transition-colors"
            >
              <Square className="w-4 h-4" />
              Cancel
            </button>
          )}

          {exportState === "complete" && (
            <>
              <button
                type="button"
                onClick={handleCopyToClipboard}
                disabled={copyState === "copying"}
                className={`flex items-center gap-2 px-4 py-2 border rounded-lg text-sm transition-colors disabled:opacity-60 ${
                  copyState === "copied"
                    ? "border-success/60 text-success"
                    : copyState === "error"
                      ? "border-destructive/60 text-destructive"
                      : "border-border text-white/60 hover:text-white hover:border-muted-foreground/50"
                }`}
                title={
                  copyState === "error" && copyError
                    ? copyError
                    : "Copy file to clipboard"
                }
              >
                {copyState === "copying" ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : copyState === "copied" ? (
                  <ClipboardCheck className="w-4 h-4" />
                ) : (
                  <Clipboard className="w-4 h-4" />
                )}
                {copyState === "copying"
                  ? "Copying…"
                  : copyState === "copied"
                    ? "Copied"
                    : "Copy"}
              </button>
              <button
                type="button"
                onClick={handleOpenFolder}
                className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm text-white/60 hover:text-white hover:border-muted-foreground/50 transition-colors"
              >
                <FolderOpen className="w-4 h-4" />
                Open Folder
              </button>
              <button
                type="button"
                onClick={onClose}
                className="flex items-center gap-2 bg-accent hover:bg-accent/90 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                Done
              </button>
            </>
          )}

          {exportState === "error" && (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm text-white/60 hover:text-white transition-colors"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => setExportState("idle")}
                className="flex items-center gap-2 bg-accent hover:bg-accent/90 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                <Film className="w-4 h-4" />
                Try Again
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
