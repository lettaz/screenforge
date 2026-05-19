import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Loader2,
  Download,
  FolderOpen,
} from "lucide-react";
import ExportDialog from "../export/ExportDialog";
import StylingPanel from "./StylingPanel";
import { useProjectStore } from "../../stores/projectStore";
import { usePlaybackStore } from "../../stores/playbackStore";
import { useEditorStore } from "../../stores/editorStore";
import { backgroundToCss, shadowToCss } from "../../utils/styleUtils";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";
import { CursorOverlay } from "./CursorOverlay";
import { ClickIndicator } from "./ClickIndicator";
import { WebcamOverlay } from "./WebcamOverlay";
import { KeystrokeOverlay } from "./KeystrokeOverlay";
import BlurRegionsOverlay from "./BlurRegionsOverlay";
import { Timeline } from "./timeline";
import {
  CursorSmoother,
  type SmoothedPosition,
} from "../../processing/cursorSmoothing";
import {
  DEFAULT_SPRING_CONFIG,
  type SpringConfig,
} from "../../processing/spring";
import type {
  RecordingBundle,
  MouseMoveEvent,
  MouseClickEvent,
  CursorInfo,
} from "../../types/recording";
import {
  findCursorAtTime,
  findCursorAtTimeInterpolated,
  findRecentClicks,
} from "../../utils/recordingPlayback";
import {
  outputTimeToSource,
  calculateTotalDuration,
} from "../../utils/sliceUtils";
import { getLayoutTransitionState } from "../../utils/layoutUtils";

export default function EditorView() {
  const {
    project,
    projectPath,
    initializeFromRecording,
    getScreenSlices,
    getCameraSlices,
    getLayouts,
    getBlurRegions,
    updateBlurRegion,
    activeSceneIndex,
    openProject,
  } = useProjectStore();
  const selectedBlurRegionId = useEditorStore((s) => s.selectedBlurRegionId);
  const selectBlurRegion = useEditorStore((s) => s.selectBlurRegion);

  const {
    currentTimeMs,
    isPlaying,
    totalDurationMs,
    setCurrentTime,
    setTotalDuration,
    play,
    pause,
  } = usePlaybackStore();

  const [showExportDialog, setShowExportDialog] = useState(false);

  // Recording data
  const [recordingPath, setRecordingPath] = useState<string | null>(null);
  const [recordingBundle, setRecordingBundle] =
    useState<RecordingBundle | null>(null);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [webcamSrc, setWebcamSrc] = useState<string | null>(null);
  const [micAudioSrc, setMicAudioSrc] = useState<string | null>(null);
  const [systemAudioSrc, setSystemAudioSrc] = useState<string | null>(null);
  const [isLoadingRecording, setIsLoadingRecording] = useState(true);
  const [recordingDuration, setRecordingDuration] = useState(0);

  // Refs for media elements
  const videoRef = useRef<HTMLVideoElement>(null);
  const micAudioRef = useRef<HTMLAudioElement>(null);
  const systemAudioRef = useRef<HTMLAudioElement>(null);
  const clickSoundRef = useRef<HTMLAudioElement>(null);
  const lastPlayedClickTimeRef = useRef<number>(-1);
  const musicAudioRef = useRef<HTMLAudioElement>(null);

  // Audio offset state - compensates for audio starting later than video during recording
  const [micAudioOffset, setMicAudioOffset] = useState(0);
  const [systemAudioOffset, setSystemAudioOffset] = useState(0);

  // Cursor smoothing state
  const [cursorSize] = useState(3.0);
  const [smoothingEnabled] = useState(true);
  const [springConfig] = useState<SpringConfig>(DEFAULT_SPRING_CONFIG);
  const [cursorPosition, setCursorPosition] = useState<SmoothedPosition | null>(
    null,
  );
  const [recentClicks, setRecentClicks] = useState<
    Array<MouseClickEvent & { age: number }>
  >([]);

  // Refs for animation
  const smootherRef = useRef<CursorSmoother | null>(null);
  const animationRef = useRef<number | null>(null);
  const lastAnimationTimeRef = useRef<number>(0);
  const previewRef = useRef<HTMLDivElement>(null);
  const [previewSize, setPreviewSize] = useState({ width: 800, height: 450 });

  // Get slices and layouts from store
  // Use screen slices as the primary timeline reference (they should stay in sync)
  const screenSlices = getScreenSlices();
  const cameraSlices = getCameraSlices();
  const layouts = getLayouts();
  // For backward compat with existing code that expects a single slices array
  const slices = screenSlices;

  // Calculate source time from output time using slices
  const { sliceIndex, sourceTimeMs } = useMemo(() => {
    if (slices.length === 0) {
      return { sliceIndex: 0, sourceTimeMs: currentTimeMs };
    }
    return outputTimeToSource(slices, currentTimeMs);
  }, [slices, currentTimeMs]);

  // Resolve the layout transition state for the current output time. This
  // returns the active layout, an optional `next` (during the transition
  // window), and crossfade opacities so the preview tweens smoothly between
  // layouts instead of snapping at boundaries.
  const layoutTransition = useMemo(
    () =>
      getLayoutTransitionState(
        layouts,
        currentTimeMs,
        project?.config.layoutTransitionMs ?? 400,
      ),
    [layouts, currentTimeMs, project?.config.layoutTransitionMs],
  );

  // Update total duration when slices change
  useEffect(() => {
    if (slices.length > 0) {
      const duration = calculateTotalDuration(slices);
      setTotalDuration(duration);
    }
  }, [slices, setTotalDuration]);

  // Helper to update cursor position at a specific time
  const updateCursorForTime = useCallback(
    (timeMs: number, resetSmoother: boolean = false) => {
      if (!recordingBundle?.mouseMoves?.length) {
        return;
      }

      const cursorAtTime = findCursorAtTimeInterpolated(
        recordingBundle.mouseMoves,
        timeMs,
      );

      if (cursorAtTime) {
        if (resetSmoother && smootherRef.current) {
          smootherRef.current.reset(cursorAtTime.x, cursorAtTime.y);
        }

        if (smootherRef.current && smoothingEnabled) {
          const newPosition = smootherRef.current.update(
            {
              x: cursorAtTime.x,
              y: cursorAtTime.y,
              cursorId: cursorAtTime.cursorId,
              processTimeMs: timeMs,
            },
            0,
          );
          setCursorPosition(newPosition);
        } else {
          setCursorPosition({
            x: cursorAtTime.x,
            y: cursorAtTime.y,
            rawX: cursorAtTime.x,
            rawY: cursorAtTime.y,
            cursorId: cursorAtTime.cursorId,
          });
        }
      }
    },
    [recordingBundle?.mouseMoves, smoothingEnabled],
  );

  // Initialize cursor smoother
  useEffect(() => {
    if (smoothingEnabled) {
      smootherRef.current = new CursorSmoother(springConfig);
    } else {
      smootherRef.current = null;
    }
  }, [smoothingEnabled, springConfig]);

  // Load recording bundle from URL params
  useEffect(() => {
    const loadRecording = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const recording = urlParams.get("recording");

      if (!recording) {
        setIsLoadingRecording(false);
        return;
      }

      setIsLoadingRecording(true);
      setRecordingPath(recording);

      try {
        const bundle = await invoke<RecordingBundle>("load_recording_bundle", {
          bundlePath: recording,
        });

        setRecordingBundle(bundle);
        setRecordingDuration(bundle.videoMetadata.durationMs);

        // Initialize project with default scene if needed
        initializeFromRecording(bundle.videoMetadata.durationMs);

        // Convert paths to asset URLs
        setVideoSrc(convertFileSrc(bundle.videoPath));

        if (bundle.webcamVideoPath) {
          setWebcamSrc(convertFileSrc(bundle.webcamVideoPath));
        }
        if (bundle.micAudioPath) {
          setMicAudioSrc(convertFileSrc(bundle.micAudioPath));
        }
        if (bundle.systemAudioPath) {
          setSystemAudioSrc(convertFileSrc(bundle.systemAudioPath));
        }

        console.log("Loaded recording bundle:", {
          path: recording,
          mouseMoves: bundle.mouseMoves.length,
          mouseClicks: bundle.mouseClicks.length,
          cursors: Object.keys(bundle.cursors).length,
          metadata: bundle.videoMetadata,
        });
      } catch (err) {
        console.error("Failed to load recording:", err);
      } finally {
        setIsLoadingRecording(false);
      }
    };

    loadRecording();
  }, [initializeFromRecording]);

  // Set initial cursor position when recording bundle loads
  useEffect(() => {
    if (!recordingBundle?.mouseMoves?.length) {
      return;
    }
    updateCursorForTime(0, true);
  }, [recordingBundle, updateCursorForTime]);

  // Update cursor position when seeking while paused (use source time)
  useEffect(() => {
    if (isPlaying) {
      return;
    }
    if (!recordingBundle?.mouseMoves?.length) {
      return;
    }
    updateCursorForTime(sourceTimeMs, true);
  }, [
    sourceTimeMs,
    isPlaying,
    recordingBundle?.mouseMoves,
    updateCursorForTime,
  ]);

  // Play click sound when a new click enters the recent window during playback.
  // We track the highest processTimeMs we've already played and only fire for
  // strictly newer events to avoid replaying the same click as it ages.
  useEffect(() => {
    if (!isPlaying) {
      return;
    }
    const config = project?.config.clickEffects;
    if (!config?.soundEnabled || !config.soundUrl || recentClicks.length === 0) {
      return;
    }
    const audio = clickSoundRef.current;
    if (!audio) {
      return;
    }
    const newest = recentClicks.reduce(
      (max, click) => Math.max(max, click.processTimeMs),
      -1,
    );
    if (newest <= lastPlayedClickTimeRef.current) {
      return;
    }
    lastPlayedClickTimeRef.current = newest;
    audio.volume = Math.max(0, Math.min(1, config.soundVolume));
    audio.currentTime = 0;
    audio.play().catch(() => {
      /* ignore autoplay failures */
    });
  }, [recentClicks, isPlaying, project?.config.clickEffects]);

  // Reset the click-sound dedup cursor whenever the user seeks while paused.
  useEffect(() => {
    if (!isPlaying) {
      lastPlayedClickTimeRef.current = -1;
    }
  }, [sourceTimeMs, isPlaying]);

  // Measure preview container size
  useEffect(() => {
    const updateSize = () => {
      if (previewRef.current) {
        const rect = previewRef.current.getBoundingClientRect();
        setPreviewSize({ width: rect.width, height: rect.height });
      }
    };
    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  // Sync video position to source time when slices change or seeking
  useEffect(() => {
    if (!videoRef.current || slices.length === 0) return;

    const currentVideoTime = videoRef.current.currentTime * 1000;
    const diff = Math.abs(currentVideoTime - sourceTimeMs);

    // Only seek if difference is significant (avoid micro-seeks during playback)
    if (diff > 100) {
      videoRef.current.currentTime = sourceTimeMs / 1000;

      // Sync audio too
      if (micAudioRef.current) {
        micAudioRef.current.currentTime = sourceTimeMs / 1000;
      }
      if (systemAudioRef.current) {
        systemAudioRef.current.currentTime = sourceTimeMs / 1000;
      }
    }
  }, [sourceTimeMs, slices]);

  // Cursor playback animation loop
  useEffect(() => {
    if (!isPlaying || !recordingBundle) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      lastAnimationTimeRef.current = 0;
      return;
    }

    // When playback starts, ensure smoother is initialized
    const videoTime = videoRef.current
      ? videoRef.current.currentTime * 1000
      : 0;
    const initialCursor = findCursorAtTime(
      recordingBundle.mouseMoves,
      videoTime,
    );
    if (initialCursor && smootherRef.current) {
      smootherRef.current.reset(initialCursor.x, initialCursor.y);
    }

    const animate = (timestamp: number) => {
      if (!lastAnimationTimeRef.current) {
        lastAnimationTimeRef.current = timestamp;
      }
      const deltaMs = Math.min(timestamp - lastAnimationTimeRef.current, 100);
      lastAnimationTimeRef.current = timestamp;

      // Get current time from video element (this is source time)
      const videoTime = videoRef.current
        ? videoRef.current.currentTime * 1000
        : 0;

      // Find cursor position at current source time
      const cursorAtTime = findCursorAtTime(
        recordingBundle.mouseMoves,
        videoTime,
      );

      if (cursorAtTime) {
        const rawMove: MouseMoveEvent = cursorAtTime;

        let newPosition: SmoothedPosition;
        if (smootherRef.current && smoothingEnabled) {
          newPosition = smootherRef.current.update(
            {
              x: rawMove.x,
              y: rawMove.y,
              cursorId: rawMove.cursorId,
              processTimeMs: rawMove.processTimeMs,
            },
            deltaMs / 1000,
          );
        } else {
          newPosition = {
            x: rawMove.x,
            y: rawMove.y,
            rawX: rawMove.x,
            rawY: rawMove.y,
            cursorId: rawMove.cursorId,
          };
        }

        setCursorPosition(newPosition);
      }

      // Find recent clicks for visualization
      const clicks = findRecentClicks(
        recordingBundle.mouseClicks,
        videoTime,
        500,
      );
      setRecentClicks(clicks);

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isPlaying, recordingBundle, smoothingEnabled]);

  // Calculate audio offset when audio metadata loads
  // If video is longer than audio, audio started late during recording
  const handleMicAudioLoaded = useCallback(() => {
    if (micAudioRef.current && recordingBundle) {
      const videoDuration = recordingBundle.videoMetadata.durationMs / 1000;
      const audioDuration = micAudioRef.current.duration;
      if (audioDuration && !isNaN(audioDuration)) {
        const offset = videoDuration - audioDuration;
        setMicAudioOffset(offset > 0 ? offset : 0);
        console.log(
          `Mic audio offset calculated: ${offset.toFixed(3)}s (video: ${videoDuration.toFixed(3)}s, audio: ${audioDuration.toFixed(3)}s)`,
        );
      }
    }
  }, [recordingBundle]);

  const handleSystemAudioLoaded = useCallback(() => {
    if (systemAudioRef.current && recordingBundle) {
      const videoDuration = recordingBundle.videoMetadata.durationMs / 1000;
      const audioDuration = systemAudioRef.current.duration;
      if (audioDuration && !isNaN(audioDuration)) {
        const offset = videoDuration - audioDuration;
        setSystemAudioOffset(offset > 0 ? offset : 0);
        console.log(
          `System audio offset calculated: ${offset.toFixed(3)}s (video: ${videoDuration.toFixed(3)}s, audio: ${audioDuration.toFixed(3)}s)`,
        );
      }
    }
  }, [recordingBundle]);

  // Sync audio with video, applying offset compensation
  // Audio started late during recording, so at video time T, audio should be at T - offset
  const syncAudio = useCallback(() => {
    if (!videoRef.current) return;

    const videoTime = videoRef.current.currentTime;

    if (micAudioRef.current) {
      // Apply offset: audio started late, so it should be behind video by the offset amount
      const targetTime = Math.max(0, videoTime - micAudioOffset);
      const diff = Math.abs(micAudioRef.current.currentTime - targetTime);
      if (diff > 0.02) {
        micAudioRef.current.currentTime = targetTime;
      }
    }

    if (systemAudioRef.current) {
      const targetTime = Math.max(0, videoTime - systemAudioOffset);
      const diff = Math.abs(systemAudioRef.current.currentTime - targetTime);
      if (diff > 0.02) {
        systemAudioRef.current.currentTime = targetTime;
      }
    }
  }, [micAudioOffset, systemAudioOffset]);

  // Handle play/pause
  const handlePlayPause = useCallback(async () => {
    if (!videoRef.current) return;

    if (isPlaying) {
      videoRef.current.pause();
      micAudioRef.current?.pause();
      systemAudioRef.current?.pause();
      musicAudioRef.current?.pause();
      pause();
    } else {
      syncAudio();

      // Start all media elements together; sync happens via currentTime alignment.
      try {
        const musicConfig = project?.config.music;
        if (musicAudioRef.current && musicConfig?.enabled) {
          musicAudioRef.current.volume = Math.max(
            0,
            Math.min(1, musicConfig.volume),
          );
          musicAudioRef.current.currentTime = videoRef.current.currentTime;
        }
        await Promise.all([
          videoRef.current.play(),
          micAudioRef.current?.play(),
          systemAudioRef.current?.play(),
          musicAudioRef.current?.play(),
        ]);
      } catch {
        /* ignore autoplay errors */
      }
      play();
    }
  }, [isPlaying, syncAudio, play, pause, project?.config.music]);

  // Handle video time update - convert source time to output time
  const handleVideoTimeUpdate = useCallback(
    (e: React.SyntheticEvent<HTMLVideoElement>) => {
      if (slices.length === 0) {
        setCurrentTime(e.currentTarget.currentTime * 1000);
        return;
      }

      // Video time is source time, but we need to find the corresponding output time
      // For now, during playback we just track based on the current slice
      // This is a simplified approach - proper slice boundary handling would be more complex
      const videoSourceTime = e.currentTarget.currentTime * 1000;

      // Check if we've reached the end of the current slice
      if (sliceIndex >= 0 && sliceIndex < slices.length) {
        const currentSlice = slices[sliceIndex];

        if (videoSourceTime >= currentSlice.sourceEndMs) {
          // Move to next slice
          if (sliceIndex + 1 < slices.length) {
            const nextSlice = slices[sliceIndex + 1];
            e.currentTarget.currentTime = nextSlice.sourceStartMs / 1000;

            // Sync audio
            if (micAudioRef.current) {
              micAudioRef.current.currentTime = nextSlice.sourceStartMs / 1000;
            }
            if (systemAudioRef.current) {
              systemAudioRef.current.currentTime =
                nextSlice.sourceStartMs / 1000;
            }
          } else {
            // End of all slices
            e.currentTarget.pause();
            pause();
          }
        }
      }

      // Calculate output time from current source position
      // Find which slice this source time belongs to and compute output time
      let outputTime = 0;
      for (let i = 0; i < slices.length; i++) {
        const slice = slices[i];
        if (
          videoSourceTime >= slice.sourceStartMs &&
          videoSourceTime < slice.sourceEndMs
        ) {
          const offsetInSlice = videoSourceTime - slice.sourceStartMs;
          outputTime += offsetInSlice / slice.timeScale;
          break;
        } else if (videoSourceTime >= slice.sourceEndMs) {
          const sliceDuration =
            (slice.sourceEndMs - slice.sourceStartMs) / slice.timeScale;
          outputTime += sliceDuration;
        }
      }

      setCurrentTime(outputTime);
    },
    [slices, sliceIndex, setCurrentTime, pause],
  );

  // Handle seeking from timeline
  const handleSeek = useCallback(
    (outputTimeMs: number) => {
      if (!videoRef.current) return;

      // Convert output time to source time
      const { sourceTimeMs } = outputTimeToSource(slices, outputTimeMs);

      videoRef.current.currentTime = sourceTimeMs / 1000;

      // Sync audio
      if (micAudioRef.current) {
        micAudioRef.current.currentTime = sourceTimeMs / 1000;
      }
      if (systemAudioRef.current) {
        systemAudioRef.current.currentTime = sourceTimeMs / 1000;
      }

      setCurrentTime(outputTimeMs);

      // Reset smoother on seek
      if (smootherRef.current && recordingBundle) {
        const cursorAtTime = findCursorAtTime(
          recordingBundle.mouseMoves,
          sourceTimeMs,
        );
        if (cursorAtTime) {
          smootherRef.current.reset(cursorAtTime.x, cursorAtTime.y);
        }
      }
    },
    [slices, setCurrentTime, recordingBundle],
  );

  // Handle frame stepping
  const handleFrameStep = useCallback(
    (direction: "back" | "forward") => {
      if (!recordingBundle) return;

      const frameTime = 1000 / recordingBundle.videoMetadata.fps;
      const newTime =
        currentTimeMs + (direction === "forward" ? frameTime : -frameTime);
      const clampedTime = Math.max(0, Math.min(totalDurationMs, newTime));

      handleSeek(clampedTime);
    },
    [currentTimeMs, totalDurationMs, recordingBundle, handleSeek],
  );

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      const { setActiveTool, selectedSliceId } = useEditorStore.getState();
      const {
        removeSlice,
        splitAllTracksAt,
        activeSceneIndex,
        openProject: open,
      } = useProjectStore.getState();

      // Cmd/Ctrl+O - Open
      if ((e.metaKey || e.ctrlKey) && e.key === "o") {
        e.preventDefault();
        await open();
        return;
      }

      switch (e.key) {
        case " ": // Space - play/pause
          e.preventDefault();
          handlePlayPause();
          break;

        case "ArrowLeft":
          e.preventDefault();
          if (e.shiftKey) {
            // Shift+Left - seek back 1 second
            handleSeek(Math.max(0, currentTimeMs - 1000));
          } else {
            // Left - previous frame
            handleFrameStep("back");
          }
          break;

        case "ArrowRight":
          e.preventDefault();
          if (e.shiftKey) {
            // Shift+Right - seek forward 1 second
            handleSeek(Math.min(totalDurationMs, currentTimeMs + 1000));
          } else {
            // Right - next frame
            handleFrameStep("forward");
          }
          break;

        case "s":
        case "S":
          // S - split at playhead or activate split tool
          if (e.shiftKey) {
            setActiveTool("split");
          } else {
            // Split all tracks at current playhead position (linked split)
            splitAllTracksAt(activeSceneIndex, currentTimeMs);
          }
          break;

        case "v":
        case "V":
          // V - select tool
          setActiveTool("select");
          break;

        case "t":
        case "T":
          // T - trim tool
          setActiveTool("trim");
          break;

        case "Delete":
        case "Backspace":
          // Delete - remove selected slice
          if (selectedSliceId && slices.length > 1) {
            removeSlice(activeSceneIndex, selectedSliceId);
          }
          break;

        case "Home":
          e.preventDefault();
          handleSeek(0);
          break;

        case "End":
          e.preventDefault();
          handleSeek(totalDurationMs);
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    currentTimeMs,
    totalDurationMs,
    slices,
    handlePlayPause,
    handleSeek,
    handleFrameStep,
  ]);

  const formatTime = (ms: number): string => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  // Get cursors from bundle or use empty object
  const cursors: Record<string, CursorInfo> = recordingBundle?.cursors || {};
  const videoWidth = recordingBundle?.videoMetadata.width || 1920;
  const videoHeight = recordingBundle?.videoMetadata.height || 1080;

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header Bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <div className="flex items-center gap-4">
          <span className="text-sm text-foreground/60">
            {project?.name || "Untitled Recording"}
          </span>
          {projectPath && (
            <span
              className="text-xs text-foreground/30 truncate max-w-[200px]"
              title={projectPath}
            >
              {projectPath.split("/").pop()}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Open button */}
          <button
            type="button"
            onClick={() => openProject()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-foreground/70 hover:text-foreground hover:bg-accent transition-colors"
            title="Open Project (Cmd+O)"
          >
            <FolderOpen className="w-4 h-4" />
            Open
          </button>
          {/* Export button */}
          <button
            type="button"
            onClick={() => setShowExportDialog(true)}
            className="flex items-center gap-2 bg-[hsl(var(--destructive))] hover:bg-[hsl(var(--destructive))]/90 text-[hsl(var(--destructive-foreground))] px-4 py-1.5 rounded-lg text-sm font-medium transition-colors"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>
      </div>

      {/* Main Preview Area */}
      <div className="flex-1 flex min-h-0">
        <div className="flex-1 flex items-center justify-center p-4 min-h-0">
          <div
            className="relative w-full max-w-5xl rounded-xl overflow-hidden"
            style={{
              aspectRatio: project
                ? `${project.config.outputAspectRatio.x} / ${project.config.outputAspectRatio.y}`
                : "16 / 9",
              background: project
                ? backgroundToCss(project.config.background)
                : "#000",
              padding: project
                ? `${project.config.padding.top}px ${project.config.padding.right}px ${project.config.padding.bottom}px ${project.config.padding.left}px`
                : 0,
            }}
          >
        <div
          ref={previewRef}
          className="relative w-full h-full bg-black overflow-hidden"
          style={{
            borderRadius: `${project?.config.screenRadius ?? 0}px`,
            boxShadow: project ? shadowToCss(project.config.shadow) : "0 0 0 transparent",
          }}
        >
          {/* Loading state */}
          {isLoadingRecording && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="w-10 h-10 animate-spin text-white/50" />
            </div>
          )}

          {/* Video element */}
          {videoSrc && !isLoadingRecording && (
            <video
              ref={videoRef}
              src={videoSrc}
              className="absolute inset-0 w-full h-full object-contain"
              style={{ opacity: layoutTransition.screenOpacity }}
              onTimeUpdate={handleVideoTimeUpdate}
              onPlay={() => play()}
              onPause={() => pause()}
              onEnded={() => pause()}
              onSeeked={syncAudio}
            >
              <track kind="captions" />
            </video>
          )}

          {/* Hidden audio elements */}
          {micAudioSrc && (
            <audio
              ref={micAudioRef}
              src={micAudioSrc}
              preload="auto"
              onLoadedMetadata={handleMicAudioLoaded}
            >
              <track kind="captions" />
            </audio>
          )}
          {systemAudioSrc && (
            <audio
              ref={systemAudioRef}
              src={systemAudioSrc}
              preload="auto"
              onLoadedMetadata={handleSystemAudioLoaded}
            >
              <track kind="captions" />
            </audio>
          )}

          {/* No recording message */}
          {!videoSrc && !isLoadingRecording && (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-white/50 text-lg">
                {recordingPath
                  ? "Failed to load recording"
                  : "No recording loaded"}
              </p>
            </div>
          )}

          {/* Webcam Overlay */}
          {webcamSrc && recordingBundle && (
            <WebcamOverlay
              webcamSrc={webcamSrc}
              currentTimeMs={sourceTimeMs}
              isPlaying={isPlaying}
              videoWidth={videoWidth}
              videoHeight={videoHeight}
              containerWidth={previewSize.width}
              containerHeight={previewSize.height}
              currentLayout={layoutTransition.current}
              nextLayout={layoutTransition.next}
              transitionProgress={layoutTransition.progress}
              opacity={layoutTransition.cameraOpacity}
            />
          )}

          {/* Click Indicator */}
          {recordingBundle && (
            <ClickIndicator
              clicks={recentClicks}
              videoWidth={videoWidth}
              videoHeight={videoHeight}
              containerWidth={previewSize.width}
              containerHeight={previewSize.height}
              config={project?.config.clickEffects}
            />
          )}
          {/* Click sound (hidden audio element, played on new clicks during preview) */}
          {project?.config.clickEffects?.soundEnabled &&
            project.config.clickEffects.soundUrl && (
              <audio
                ref={clickSoundRef}
                src={project.config.clickEffects.soundUrl}
                preload="auto"
              >
                <track kind="captions" />
              </audio>
            )}
          {/* Background music (hidden, looped during preview) */}
          {project?.config.music?.enabled && project.config.music.audioUrl && (
            <audio
              ref={musicAudioRef}
              src={project.config.music.audioUrl}
              preload="auto"
              loop
            >
              <track kind="captions" />
            </audio>
          )}

          {/* Cursor Overlay */}
          {recordingBundle && (
            <CursorOverlay
              position={cursorPosition}
              cursors={cursors}
              cursorSize={cursorSize}
              videoWidth={videoWidth}
              videoHeight={videoHeight}
              containerWidth={previewSize.width}
              containerHeight={previewSize.height}
            />
          )}
          {/* Keystroke overlay */}
          {recordingBundle && recordingBundle.keystrokes && (
            <KeystrokeOverlay
              keystrokes={recordingBundle.keystrokes}
              sourceTimeMs={sourceTimeMs}
              config={project?.config.keystrokesOverlay}
            />
          )}
          {/* Blur regions overlay */}
          <BlurRegionsOverlay
            regions={getBlurRegions()}
            currentTimeMs={currentTimeMs}
            selectedId={selectedBlurRegionId}
            onSelect={selectBlurRegion}
            onMove={(id, x, y) =>
              updateBlurRegion(activeSceneIndex, id, { x, y })
            }
            onResize={(id, width, height) =>
              updateBlurRegion(activeSceneIndex, id, { width, height })
            }
          />
          </div>
          </div>
        </div>
        <StylingPanel />
      </div>

      {/* Timeline */}
      {screenSlices.length > 0 && (
        <Timeline
          screenSlices={screenSlices}
          cameraSlices={cameraSlices}
          currentTimeMs={currentTimeMs}
          onSeek={handleSeek}
          systemAudioPath={recordingBundle?.systemAudioPath ?? undefined}
          micAudioPath={recordingBundle?.micAudioPath ?? undefined}
        />
      )}

      {/* Playback Controls */}
      <div className="bg-muted border-t border-border">
        <div className="flex items-center justify-center gap-6 py-3">
          {/* Time display */}
          <span className="text-foreground/60 text-sm font-mono w-20 text-right">
            {formatTime(currentTimeMs)}
          </span>

          {/* Control buttons */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleFrameStep("back")}
              className="p-2 rounded-full hover:bg-accent text-foreground/70 hover:text-foreground transition-colors"
              title="Previous Frame"
            >
              <SkipBack className="w-5 h-5" />
            </button>

            <button
              type="button"
              onClick={handlePlayPause}
              disabled={!videoSrc}
              className="p-4 rounded-full bg-foreground text-background hover:opacity-90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? (
                <Pause className="w-6 h-6" />
              ) : (
                <Play className="w-6 h-6 ml-0.5" />
              )}
            </button>

            <button
              type="button"
              onClick={() => handleFrameStep("forward")}
              className="p-2 rounded-full hover:bg-accent text-foreground/70 hover:text-foreground transition-colors"
              title="Next Frame"
            >
              <SkipForward className="w-5 h-5" />
            </button>
          </div>

          {/* Duration display */}
          <span className="text-foreground/60 text-sm font-mono w-20">
            {formatTime(totalDurationMs || recordingDuration)}
          </span>
        </div>
      </div>

      {/* Export Dialog */}
      <ExportDialog
        isOpen={showExportDialog}
        onClose={() => setShowExportDialog(false)}
        recordingPath={recordingPath}
        projectName={project?.name || "Untitled Recording"}
        durationMs={totalDurationMs || recordingDuration}
      />
    </div>
  );
}
