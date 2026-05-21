import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  Monitor,
  AppWindow,
  Square,
  Smartphone,
  Camera,
  CameraOff,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Settings,
  ScrollText,
  Upload,
  X,
  ChevronDown,
  Circle,
  Pause,
  Play,
  GripVertical,
  Check,
} from "lucide-react";
import PostRecordingPopup from "./PostRecordingPopup";
import type { RecordingResult } from "../../types/recording";
import { useProjectStore } from "../../stores/projectStore";

type RecordingState = "idle" | "recording" | "paused";
type SourceType = "display" | "window" | "area" | "device";

interface DisplayInfo {
  id: number;
  name: string;
  width: number;
  height: number;
  scaleFactor: number;
  isPrimary: boolean;
  refreshRate: number | null;
}

interface AudioDeviceInfo {
  id: string;
  name: string;
  isInput: boolean;
  isDefault: boolean;
}

interface CameraInfo {
  id: string;
  name: string;
  supportedResolutions: { width: number; height: number }[];
}

export default function RecordingToolbar() {
  // Source selection
  const [sourceType, setSourceType] = useState<SourceType>("display");
  const [selectedDisplayId, setSelectedDisplayId] = useState<number | null>(
    null,
  );
  const [displays, setDisplays] = useState<DisplayInfo[]>([]);

  // Audio/Video toggles
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [micEnabled, setMicEnabled] = useState(true);
  const [systemAudioEnabled, setSystemAudioEnabled] = useState(true);
  const [selectedMicId, setSelectedMicId] = useState<string | null>(null);
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null);
  const [audioDevices, setAudioDevices] = useState<AudioDeviceInfo[]>([]);
  const [cameras, setCameras] = useState<CameraInfo[]>([]);

  // Dropdowns
  const [showCameraDropdown, setShowCameraDropdown] = useState(false);
  const [showMicDropdown, setShowMicDropdown] = useState(false);
  const [showDisplayDropdown, setShowDisplayDropdown] = useState(false);

  // Recording state
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [recordingTime, setRecordingTime] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  // Surfaced error banner — driven from any failing invoke() so users see
  // why a click did nothing (silent flicker is the worst kind of bug).
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  // Auto-dismiss the banner after 8s so it doesn't stick around forever.
  useEffect(() => {
    if (!errorBanner) return;
    const t = window.setTimeout(() => setErrorBanner(null), 8000);
    return () => window.clearTimeout(t);
  }, [errorBanner]);

  // Post-recording popup state
  const [showPostRecording, setShowPostRecording] = useState(false);
  const [recordingResult, setRecordingResult] =
    useState<RecordingResult | null>(null);

  const timerRef = useRef<number | null>(null);
  const recordingStartTime = useRef<number>(0);

  // Load displays and audio devices
  useEffect(() => {
    const init = async () => {
      try {
        const displayList = await invoke<DisplayInfo[]>("get_displays");
        setDisplays(displayList);
        const primary = displayList.find((d) => d.isPrimary);
        if (primary) {
          setSelectedDisplayId(primary.id);
        } else if (displayList.length > 0) {
          setSelectedDisplayId(displayList[0].id);
        }
      } catch (err) {
        console.error("Failed to load displays:", err);
      }

      try {
        const devices = await invoke<AudioDeviceInfo[]>("get_audio_devices");
        setAudioDevices(devices);
        const defaultMic = devices.find((d) => d.isDefault);
        if (defaultMic) {
          setSelectedMicId(defaultMic.id);
        } else if (devices.length > 0) {
          setSelectedMicId(devices[0].id);
        }
      } catch (err) {
        console.error("Failed to load audio devices:", err);
      }

      // Load cameras
      try {
        const cameraList = await invoke<CameraInfo[]>("get_cameras");
        setCameras(cameraList);
        if (cameraList.length > 0) {
          setSelectedCameraId(cameraList[0].id);
        }
      } catch (err) {
        console.error("Failed to load cameras:", err);
      }
    };

    init();
  }, []);

  // Timer for recording duration
  useEffect(() => {
    if (recordingState === "recording") {
      if (recordingStartTime.current === 0) {
        recordingStartTime.current = Date.now();
      }
      timerRef.current = window.setInterval(() => {
        setRecordingTime(Date.now() - recordingStartTime.current);
      }, 100);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (recordingState === "idle") {
        recordingStartTime.current = 0;
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [recordingState]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      setShowCameraDropdown(false);
      setShowMicDropdown(false);
      setShowDisplayDropdown(false);
    };
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  const formatTime = (ms: number): string => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  };

  const handleStartRecording = async () => {
    if (selectedDisplayId === null) return;
    setIsLoading(true);
    setErrorBanner(null);

    try {
      const outputDir = `/tmp/open-screenstudio-${Date.now()}`;
      await invoke("start_recording", {
        config: {
          displayId: selectedDisplayId,
          captureSystemAudio: systemAudioEnabled,
          captureMicrophone: micEnabled,
          microphoneDeviceId: micEnabled ? selectedMicId : null,
          captureWebcam: cameraEnabled,
          webcamDeviceId: cameraEnabled ? selectedCameraId : null,
          trackInput: true,
          outputDir,
        },
      });
      setRecordingState("recording");
      setRecordingTime(0);
    } catch (err) {
      console.error("Failed to start recording:", err);
      const msg = err instanceof Error ? err.message : String(err);
      // Permission errors get a friendlier message + a hint to System Settings.
      if (/permission/i.test(msg)) {
        setErrorBanner(
          "Screen recording permission needed. Open System Settings → Privacy & Security → Screen Recording, enable Screenforge, then quit and relaunch.",
        );
      } else {
        setErrorBanner(`Couldn't start recording: ${msg}`);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleStopRecording = async () => {
    setIsLoading(true);
    setErrorBanner(null);
    try {
      const result = await invoke<RecordingResult>("stop_recording");
      setRecordingState("idle");
      setRecordingTime(0);
      setRecordingResult(result);
      setShowPostRecording(true);
    } catch (err) {
      console.error("Failed to stop recording:", err);
      setErrorBanner(
        `Couldn't stop recording: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handlePauseRecording = async () => {
    try {
      await invoke("pause_recording");
      setRecordingState("paused");
    } catch (err) {
      console.error("Failed to pause recording:", err);
      setErrorBanner(
        `Couldn't pause: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };

  const handleResumeRecording = async () => {
    try {
      await invoke("resume_recording");
      setRecordingState("recording");
    } catch (err) {
      console.error("Failed to resume recording:", err);
    }
  };

  const handleClose = async () => {
    try {
      const window = getCurrentWindow();
      await window.close();
    } catch (err) {
      console.error("Failed to close window:", err);
    }
  };

  // Post-recording popup handlers
  // Save: Creates project and auto-saves to default location, then dismiss
  const handleSave = async () => {
    if (!recordingResult) return;

    const { createProjectFromRecording } = useProjectStore.getState();

    try {
      // Create a project from the recording - auto-saves to ~/Movies/Screenforge/
      await createProjectFromRecording(recordingResult.bundlePath);
      // Dismiss the popup after successful save
      handleDismissPopup();
    } catch (err) {
      console.error("Failed to save recording:", err);
    }
  };

  // Edit: Creates project, auto-saves, then opens editor
  const handleEdit = async () => {
    if (!recordingResult) return;

    const { createProjectFromRecording } = useProjectStore.getState();

    try {
      // Create a project from the recording - auto-saves to ~/Movies/Screenforge/
      await createProjectFromRecording(recordingResult.bundlePath);

      // Get the saved project path to open in editor
      const savedPath = useProjectStore.getState().projectPath;

      // Open editor with the saved project
      await invoke("open_editor_window", {
        recordingPath: savedPath || recordingResult.bundlePath,
      });
      await invoke("close_toolbar_window");
    } catch (err) {
      console.error("Failed to open editor:", err);
    }
  };

  const handleDismissPopup = () => {
    setShowPostRecording(false);
    setRecordingResult(null);
  };

  const sourceButtons: {
    type: SourceType;
    icon: typeof Monitor;
    label: string;
  }[] = [
    { type: "display", icon: Monitor, label: "Display" },
    { type: "window", icon: AppWindow, label: "Window" },
    { type: "area", icon: Square, label: "Area" },
    { type: "device", icon: Smartphone, label: "Device" },
  ];

  const isRecording = recordingState !== "idle";

  // Show post-recording popup instead of toolbar
  if (showPostRecording && recordingResult) {
    return (
      <PostRecordingPopup
        recordingResult={recordingResult}
        onSave={handleSave}
        onEdit={handleEdit}
        onDismiss={handleDismissPopup}
      />
    );
  }

  return (
    <div className="toolbar-container">
      {errorBanner && (
        <div
          role="alert"
          className="absolute -bottom-12 left-1/2 -translate-x-1/2 max-w-[680px] px-3 py-2 rounded-lg bg-destructive text-white text-xs leading-relaxed shadow-lg flex items-start gap-2"
        >
          <span className="flex-1">{errorBanner}</span>
          <button
            type="button"
            onClick={() => setErrorBanner(null)}
            className="text-white/80 hover:text-white"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}
      <div className="toolbar-content">
        {/* Drag Handle */}
        <button
          type="button"
          className="drag-handle"
          title="Drag to move"
          onMouseDown={(e) => {
            if (e.button === 0) {
              e.preventDefault();
              e.stopPropagation();
              console.log("Starting drag...");
              getCurrentWindow()
                .startDragging()
                .then(() => {
                  console.log("Drag started successfully");
                })
                .catch((err) => {
                  console.error("Failed to start dragging:", err);
                });
            }
          }}
        >
          <GripVertical className="w-4 h-4" />
        </button>

        {/* Source Selection - Left Side */}
        <div className="flex items-center gap-1">
          {sourceButtons.map(({ type, icon: Icon, label }) => (
            <div key={type} className="relative">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSourceType(type);
                  if (type === "display") {
                    setShowDisplayDropdown(!showDisplayDropdown);
                  }
                }}
                disabled={isRecording}
                className={`toolbar-btn ${sourceType === type ? "active" : ""}`}
                title={label}
              >
                <Icon className="w-4 h-4" />
                <span className="text-xs">{label}</span>
                {type === "display" && (
                  <ChevronDown className="w-3 h-3 ml-0.5 opacity-60" />
                )}
              </button>

              {/* Display Dropdown - positioned relative to Display button */}
              {type === "display" &&
                showDisplayDropdown &&
                sourceType === "display" && (
                  <div className="dropdown">
                    {displays.map((display) => (
                      <button
                        key={display.id}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedDisplayId(display.id);
                          setShowDisplayDropdown(false);
                        }}
                        className={`dropdown-item ${selectedDisplayId === display.id ? "active" : ""}`}
                      >
                        <Monitor className="w-4 h-4" />
                        <span className="flex-1">{display.name}</span>
                        <span className="text-xs opacity-60">
                          {display.width}x{display.height}
                        </span>
                        {selectedDisplayId === display.id && (
                          <Check className="w-4 h-4 text-green-400 ml-2" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
            </div>
          ))}
        </div>

        {/* Divider */}
        <div className="toolbar-divider" />

        {/* Camera Toggle */}
        <div className="relative">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setCameraEnabled(!cameraEnabled);
            }}
            disabled={isRecording}
            className={`toolbar-btn ${cameraEnabled ? "active" : ""}`}
            title={cameraEnabled ? "Camera On" : "Camera Off"}
          >
            {cameraEnabled ? (
              <Camera className="w-4 h-4" />
            ) : (
              <CameraOff className="w-4 h-4" />
            )}
            <span className="text-xs">Camera</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowCameraDropdown(!showCameraDropdown);
              }}
              className="dropdown-trigger"
            >
              <ChevronDown className="w-3 h-3" />
            </button>
          </button>

          {showCameraDropdown && (
            <div className="dropdown">
              {cameras.length > 0 ? (
                cameras.map((camera) => (
                  <button
                    key={camera.id}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedCameraId(camera.id);
                      setCameraEnabled(true);
                      setShowCameraDropdown(false);
                    }}
                    className={`dropdown-item ${selectedCameraId === camera.id ? "active" : ""}`}
                  >
                    <Camera className="w-4 h-4" />
                    <span className="truncate">{camera.name}</span>
                    {selectedCameraId === camera.id && (
                      <Check className="w-4 h-4 text-green-400 ml-2" />
                    )}
                  </button>
                ))
              ) : (
                <div className="dropdown-item">
                  <span className="text-xs opacity-60">
                    No cameras detected
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Mic Toggle */}
        <div className="relative">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setMicEnabled(!micEnabled);
            }}
            disabled={isRecording}
            className={`toolbar-btn ${micEnabled ? "active" : ""}`}
            title={micEnabled ? "Mic On" : "Mic Off"}
          >
            {micEnabled ? (
              <Mic className="w-4 h-4" />
            ) : (
              <MicOff className="w-4 h-4" />
            )}
            <span className="text-xs">Mic</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowMicDropdown(!showMicDropdown);
              }}
              className="dropdown-trigger"
            >
              <ChevronDown className="w-3 h-3" />
            </button>
          </button>

          {showMicDropdown && (
            <div className="dropdown">
              {audioDevices.length > 0 ? (
                audioDevices.map((device) => (
                  <button
                    key={device.id}
                    type="button"
                    onClick={() => {
                      setSelectedMicId(device.id);
                      setShowMicDropdown(false);
                    }}
                    className={`dropdown-item ${selectedMicId === device.id ? "active" : ""}`}
                  >
                    <Mic className="w-4 h-4" />
                    <span className="truncate">{device.name}</span>
                    {device.isDefault && (
                      <span className="text-xs opacity-60">(Default)</span>
                    )}
                  </button>
                ))
              ) : (
                <div className="dropdown-item">
                  <span className="text-xs opacity-60">No mics detected</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* System Audio Toggle */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setSystemAudioEnabled(!systemAudioEnabled);
          }}
          disabled={isRecording}
          className={`toolbar-btn ${systemAudioEnabled ? "active" : ""}`}
          title={systemAudioEnabled ? "System Audio On" : "System Audio Off"}
        >
          {systemAudioEnabled ? (
            <Volume2 className="w-4 h-4" />
          ) : (
            <VolumeX className="w-4 h-4" />
          )}
          <span className="text-xs">Audio</span>
        </button>

        {/* Divider */}
        <div className="toolbar-divider" />

        {/* Record Button / Timer */}
        {recordingState === "idle" ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleStartRecording();
            }}
            disabled={isLoading || selectedDisplayId === null}
            className="record-btn"
            title="Start Recording"
          >
            <Circle className="w-4 h-4 fill-current" />
            <span className="text-xs font-medium">
              {isLoading ? "..." : "Record"}
            </span>
          </button>
        ) : (
          <div className="flex items-center gap-2">
            {/* Timer */}
            <div className="recording-timer">
              <div className="recording-dot" />
              <span className="font-mono text-sm">
                {formatTime(recordingTime)}
              </span>
            </div>

            {/* Pause/Resume */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                recordingState === "recording"
                  ? handlePauseRecording()
                  : handleResumeRecording();
              }}
              className="toolbar-btn-sm"
              title={recordingState === "recording" ? "Pause" : "Resume"}
            >
              {recordingState === "recording" ? (
                <Pause className="w-4 h-4" />
              ) : (
                <Play className="w-4 h-4" />
              )}
            </button>

            {/* Stop */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleStopRecording();
              }}
              disabled={isLoading}
              className="stop-btn"
              title="Stop Recording"
            >
              <Square className="w-3 h-3 fill-current" />
            </button>
          </div>
        )}

        {/* Right side controls */}
        <div className="flex items-center gap-1 ml-auto">
          {/* Import existing video as project */}
          <button
            type="button"
            onClick={async (e) => {
              e.stopPropagation();
              try {
                const savedPath = await useProjectStore
                  .getState()
                  .createProjectFromVideo();
                if (savedPath) {
                  await invoke("open_editor_window", {
                    recordingPath: savedPath,
                  });
                }
              } catch (err) {
                console.error("Failed to import video:", err);
              }
            }}
            className="toolbar-btn-icon"
            title="Import existing video as a project"
          >
            <Upload className="w-4 h-4" />
          </button>

          {/* Teleprompter */}
          <button
            type="button"
            onClick={async (e) => {
              e.stopPropagation();
              try {
                await invoke("open_teleprompter_window");
              } catch (err) {
                console.error("Failed to open teleprompter:", err);
              }
            }}
            className="toolbar-btn-icon"
            title="Open teleprompter (notes hidden from recording)"
          >
            <ScrollText className="w-4 h-4" />
          </button>

          {/* Settings */}
          <button
            type="button"
            onClick={(e) => e.stopPropagation()}
            className="toolbar-btn-icon"
            title="Settings"
          >
            <Settings className="w-4 h-4" />
          </button>

          {/* Close */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleClose();
            }}
            className="toolbar-btn-icon close"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
