//! Recording-related Tauri commands

use crate::capture::audio::get_audio_input_devices;
use crate::capture::traits::{AudioDeviceInfo, CameraInfo, DisplayInfo, has_screen_recording_permission, request_screen_recording_permission};
use crate::recorder::state::{RecordingConfig, RecordingResult as RecordingOutput, RecordingState};
use crate::recorder::RecordingCoordinator;
use std::sync::Arc;
use tauri::State;
use tokio::sync::Mutex;

/// Application state for recording
pub struct RecorderState {
    pub coordinator: Arc<Mutex<RecordingCoordinator>>,
}

impl Default for RecorderState {
    fn default() -> Self {
        Self {
            coordinator: Arc::new(Mutex::new(RecordingCoordinator::new())),
        }
    }
}

/// Get list of available audio input devices (microphones)
#[tauri::command]
pub async fn get_audio_devices() -> Result<Vec<AudioDeviceInfo>, String> {
    Ok(get_audio_input_devices())
}

/// Get list of available cameras/webcams
#[tauri::command]
pub async fn get_cameras() -> Result<Vec<CameraInfo>, String> {
    #[cfg(target_os = "macos")]
    {
        Ok(crate::capture::macos::webcam::get_cameras())
    }
    
    #[cfg(target_os = "windows")]
    {
        // TODO: Implement Windows camera enumeration
        Ok(vec![])
    }
    
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        Ok(vec![])
    }
}

/// Check if camera permission is granted
#[tauri::command]
pub async fn check_camera_permission() -> Result<bool, String> {
    #[cfg(target_os = "macos")]
    {
        Ok(crate::capture::macos::permissions::has_camera_permission())
    }
    
    #[cfg(target_os = "windows")]
    {
        // Windows handles permissions at runtime when accessing camera
        Ok(true)
    }
    
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        Ok(false)
    }
}

/// Request camera permission
#[tauri::command]
pub async fn request_camera_permission() -> Result<bool, String> {
    #[cfg(target_os = "macos")]
    {
        Ok(crate::capture::macos::permissions::request_camera_permission())
    }
    
    #[cfg(target_os = "windows")]
    {
        Ok(true)
    }
    
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        Ok(false)
    }
}

/// Check if system audio capture is available
#[tauri::command]
pub async fn check_system_audio_available() -> Result<bool, String> {
    #[cfg(target_os = "macos")]
    {
        Ok(crate::capture::macos::system_audio::is_system_audio_available())
    }
    
    #[cfg(target_os = "windows")]
    {
        // Windows WASAPI loopback is generally available
        Ok(true)
    }
    
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        Ok(false)
    }
}

/// Get list of available displays
#[tauri::command]
pub async fn get_displays() -> Result<Vec<DisplayInfo>, String> {
    #[cfg(target_os = "macos")]
    {
        Ok(crate::capture::macos::screen::get_displays())
    }
    
    #[cfg(target_os = "windows")]
    {
        Ok(crate::capture::windows::screen::get_displays())
    }
    
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        Ok(vec![])
    }
}

/// Check if screen recording permission is granted
#[tauri::command]
pub async fn check_screen_permission() -> Result<bool, String> {
    Ok(has_screen_recording_permission())
}

/// Request screen recording permission
#[tauri::command]
pub async fn request_screen_permission() -> Result<bool, String> {
    Ok(request_screen_recording_permission())
}

/// Start recording
#[tauri::command]
pub async fn start_recording(
    state: State<'_, RecorderState>,
    config: RecordingConfig,
) -> Result<(), String> {
    // Check permission first
    if !has_screen_recording_permission() {
        request_screen_recording_permission();
        return Err("Screen recording permission not granted. Please allow in System Preferences and try again.".to_string());
    }
    
    let mut coordinator = state.coordinator.lock().await;
    
    // Clear existing channels and add display capture
    coordinator.clear_channels();
    
    #[cfg(target_os = "macos")]
    {
        let display_channel = Box::new(crate::capture::macos::screen::DisplayCaptureChannel::new(config.display_id));
        coordinator.add_channel(display_channel);
    }
    
    #[cfg(target_os = "windows")]
    {
        let display_channel = Box::new(crate::capture::windows::screen::DisplayCaptureChannel::new(config.display_id));
        coordinator.add_channel(display_channel);
    }
    
    // Add input tracking channel (always-on for MVP)
    // Note: Windows implementation is currently stubbed.
    #[cfg(target_os = "macos")]
    {
        let input_channel = Box::new(crate::capture::InputTrackingChannel::new(config.display_id));
        coordinator.add_channel(input_channel);
    }

    // Add microphone channel if enabled
    if config.capture_microphone {
        let mic_channel = Box::new(crate::capture::audio::MicrophoneCaptureChannel::new(
            config.microphone_device_id.clone(),
        ));
        coordinator.add_channel(mic_channel);
    }
    
    // Add system audio channel if enabled
    if config.capture_system_audio {
        #[cfg(target_os = "macos")]
        {
            let system_audio_channel = Box::new(crate::capture::macos::system_audio::SystemAudioCaptureChannel::new(config.display_id));
            coordinator.add_channel(system_audio_channel);
        }
        
        #[cfg(target_os = "windows")]
        {
            let system_audio_channel = Box::new(crate::capture::windows::system_audio::SystemAudioCaptureChannel::new());
            coordinator.add_channel(system_audio_channel);
        }
    }
    
    // Add webcam channel if enabled
    if config.capture_webcam {
        #[cfg(target_os = "macos")]
        {
            // Default to 1280x720 @ 30fps for webcam
            let webcam_channel = Box::new(crate::capture::macos::webcam::WebcamCaptureChannel::new(
                config.webcam_device_id.clone(),
                1280,
                720,
                30,
            ));
            coordinator.add_channel(webcam_channel);
        }
        
        #[cfg(target_os = "windows")]
        {
            // TODO: Implement Windows webcam capture
            tracing::warn!("Webcam capture not yet implemented on Windows");
        }
    }
    
    coordinator.start(config).await.map_err(|e| e.to_string())
}

/// Stop recording
#[tauri::command]
pub async fn stop_recording(
    state: State<'_, RecorderState>,
) -> Result<RecordingOutput, String> {
    let mut coordinator = state.coordinator.lock().await;
    coordinator.stop().await.map_err(|e| e.to_string())
}

/// Pause recording
#[tauri::command]
pub async fn pause_recording(
    state: State<'_, RecorderState>,
) -> Result<(), String> {
    let mut coordinator = state.coordinator.lock().await;
    coordinator.pause().await.map_err(|e| e.to_string())
}

/// Resume recording
#[tauri::command]
pub async fn resume_recording(
    state: State<'_, RecorderState>,
) -> Result<(), String> {
    let mut coordinator = state.coordinator.lock().await;
    coordinator.resume().await.map_err(|e| e.to_string())
}

/// Get current recording state
#[tauri::command]
pub async fn get_recording_state(
    state: State<'_, RecorderState>,
) -> Result<RecordingState, String> {
    let coordinator = state.coordinator.lock().await;
    Ok(coordinator.state())
}

/// Get current recording duration in milliseconds
#[tauri::command]
pub async fn get_recording_duration(
    state: State<'_, RecorderState>,
) -> Result<f64, String> {
    let coordinator = state.coordinator.lock().await;
    Ok(coordinator.duration_ms())
}

/// Video metadata returned from FFprobe
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoMetadata {
    pub width: u32,
    pub height: u32,
    pub fps: f64,
    pub duration_ms: f64,
    pub codec: String,
}

/// Get video metadata using FFprobe
#[tauri::command]
pub async fn get_video_metadata(path: String) -> Result<VideoMetadata, String> {
    use std::process::Command;
    
    // Run ffprobe to get video stream info in JSON format
    let output = Command::new("ffprobe")
        .args([
            "-v", "quiet",
            "-print_format", "json",
            "-show_streams",
            "-show_format",
            "-select_streams", "v:0",
            &path,
        ])
        .output()
        .map_err(|e| format!("Failed to run ffprobe: {}", e))?;
    
    if !output.status.success() {
        return Err(format!(
            "ffprobe failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }
    
    let json_str = String::from_utf8_lossy(&output.stdout);
    let json: serde_json::Value = serde_json::from_str(&json_str)
        .map_err(|e| format!("Failed to parse ffprobe output: {}", e))?;
    
    // Extract video stream info
    let streams = json.get("streams")
        .and_then(|s| s.as_array())
        .ok_or("No streams found in video")?;
    
    let video_stream = streams.first()
        .ok_or("No video stream found")?;
    
    let width = video_stream.get("width")
        .and_then(|v| v.as_u64())
        .unwrap_or(0) as u32;
    
    let height = video_stream.get("height")
        .and_then(|v| v.as_u64())
        .unwrap_or(0) as u32;
    
    let codec = video_stream.get("codec_name")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown")
        .to_string();
    
    // Parse frame rate (can be "30/1" or "29.97" format)
    let fps = video_stream.get("r_frame_rate")
        .and_then(|v| v.as_str())
        .map(|s| {
            if s.contains('/') {
                let parts: Vec<&str> = s.split('/').collect();
                if parts.len() == 2 {
                    let num: f64 = parts[0].parse().unwrap_or(0.0);
                    let den: f64 = parts[1].parse().unwrap_or(1.0);
                    if den > 0.0 { num / den } else { 0.0 }
                } else {
                    0.0
                }
            } else {
                s.parse().unwrap_or(0.0)
            }
        })
        .unwrap_or(0.0);
    
    // Get duration from format section (more reliable)
    let duration_secs = json.get("format")
        .and_then(|f| f.get("duration"))
        .and_then(|d| d.as_str())
        .and_then(|s| s.parse::<f64>().ok())
        .unwrap_or(0.0);
    
    let duration_ms = duration_secs * 1000.0;
    
    Ok(VideoMetadata {
        width,
        height,
        fps,
        duration_ms,
        codec,
    })
}

/// Mouse move event from recording
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MouseMoveEvent {
    pub x: f64,
    pub y: f64,
    pub cursor_id: String,
    pub active_modifiers: Vec<String>,
    pub process_time_ms: f64,
    pub unix_time_ms: u64,
}

/// Mouse click event from recording
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MouseClickEvent {
    pub x: f64,
    pub y: f64,
    pub button: String,
    pub event_type: String,
    pub click_count: u32,
    pub active_modifiers: Vec<String>,
    pub process_time_ms: f64,
    pub unix_time_ms: u64,
}

/// Cursor image info from recording
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CursorInfo {
    pub id: String,
    pub image_path: String,
    pub hotspot_x: f64,
    pub hotspot_y: f64,
    pub width: u32,
    pub height: u32,
}

/// Keystroke event from recording. Mirrors the TypeScript `Keystroke` shape.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeystrokeEvent {
    #[serde(rename = "type")]
    pub event_type: String,
    pub character: String,
    pub active_modifiers: Vec<String>,
    #[serde(default)]
    pub is_a_repeat: bool,
    pub process_time_ms: f64,
    pub unix_time_ms: u64,
}

/// Complete recording bundle data
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordingBundle {
    pub bundle_path: String,
    pub video_path: String,
    pub webcam_video_path: Option<String>,
    pub mic_audio_path: Option<String>,
    pub system_audio_path: Option<String>,
    pub mouse_moves: Vec<MouseMoveEvent>,
    pub mouse_clicks: Vec<MouseClickEvent>,
    pub cursors: std::collections::HashMap<String, CursorInfo>,
    /// Keystrokes captured by the input channel (empty for older recordings
    /// or sessions that did not opt in to keystroke capture).
    #[serde(default)]
    pub keystrokes: Vec<KeystrokeEvent>,
    pub video_metadata: VideoMetadata,
}

/// Load a recording bundle from disk
#[tauri::command]
pub async fn load_recording_bundle(bundle_path: String) -> Result<RecordingBundle, String> {
    use std::collections::HashMap;
    use std::fs;
    use std::path::Path;
    
    let bundle_dir = Path::new(&bundle_path);
    
    // Find the recording directory (could be "recording" or directly in bundle)
    let recording_dir = if bundle_dir.join("recording").exists() {
        bundle_dir.join("recording")
    } else {
        bundle_dir.to_path_buf()
    };
    
    // Find video file
    let video_path = recording_dir.join("recording-0.mp4");
    if !video_path.exists() {
        return Err(format!("Video file not found: {:?}", video_path));
    }
    
    // Get video metadata
    let video_metadata = get_video_metadata(video_path.to_string_lossy().to_string()).await?;
    
    // Load mouse moves
    let mouse_moves_path = recording_dir.join("recording-0-mouse-moves.json");
    let mouse_moves: Vec<MouseMoveEvent> = if mouse_moves_path.exists() {
        let content = fs::read_to_string(&mouse_moves_path)
            .map_err(|e| format!("Failed to read mouse moves: {}", e))?;
        serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse mouse moves: {}", e))?
    } else {
        Vec::new()
    };
    
    // Load mouse clicks
    let mouse_clicks_path = recording_dir.join("recording-0-mouse-clicks.json");
    let mouse_clicks: Vec<MouseClickEvent> = if mouse_clicks_path.exists() {
        let content = fs::read_to_string(&mouse_clicks_path)
            .map_err(|e| format!("Failed to read mouse clicks: {}", e))?;
        serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse mouse clicks: {}", e))?
    } else {
        Vec::new()
    };
    
    // Load cursor info
    let cursors_path = recording_dir.join("recording-0-cursors.json");
    let cursors: HashMap<String, CursorInfo> = if cursors_path.exists() {
        let content = fs::read_to_string(&cursors_path)
            .map_err(|e| format!("Failed to read cursors: {}", e))?;
        serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse cursors: {}", e))?
    } else {
        HashMap::new()
    };

    // Load keystrokes (optional — older bundles may not contain this file)
    let keystrokes_path = recording_dir.join("recording-0-keystrokes.json");
    let keystrokes: Vec<KeystrokeEvent> = if keystrokes_path.exists() {
        let content = fs::read_to_string(&keystrokes_path)
            .map_err(|e| format!("Failed to read keystrokes: {}", e))?;
        serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse keystrokes: {}", e))?
    } else {
        Vec::new()
    };
    
    // Find webcam and audio files
    let webcam_video_path = recording_dir.join("recording-0-webcam.mp4");
    let mic_audio_path = recording_dir.join("recording-0-mic.m4a");
    let system_audio_path = recording_dir.join("recording-0-system.m4a");
    
    tracing::info!(
        "Loaded recording bundle: {} mouse moves, {} clicks, {} cursors, {} keystrokes, webcam={}",
        mouse_moves.len(),
        mouse_clicks.len(),
        cursors.len(),
        keystrokes.len(),
        webcam_video_path.exists()
    );
    
    Ok(RecordingBundle {
        bundle_path: bundle_path.clone(),
        video_path: video_path.to_string_lossy().to_string(),
        webcam_video_path: if webcam_video_path.exists() {
            Some(webcam_video_path.to_string_lossy().to_string())
        } else {
            None
        },
        mic_audio_path: if mic_audio_path.exists() {
            Some(mic_audio_path.to_string_lossy().to_string())
        } else {
            None
        },
        system_audio_path: if system_audio_path.exists() {
            Some(system_audio_path.to_string_lossy().to_string())
        } else {
            None
        },
        mouse_moves,
        mouse_clicks,
        cursors,
        keystrokes,
        video_metadata,
    })
}
