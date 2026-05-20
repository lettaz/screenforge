//! Export types and configuration
//!
//! This module defines the types used for video export configuration,
//! progress tracking, and error handling.

use serde::{Deserialize, Serialize};
use thiserror::Error;

/// Export format options
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ExportFormat {
    Mp4,
    Webm,
    Gif,
}

impl ExportFormat {
    /// Get the file extension for this format
    pub fn extension(&self) -> &'static str {
        match self {
            ExportFormat::Mp4 => "mp4",
            ExportFormat::Webm => "webm",
            ExportFormat::Gif => "gif",
        }
    }

    /// Get the FFmpeg video codec for this format
    pub fn video_codec(&self) -> &'static str {
        match self {
            ExportFormat::Mp4 => "libx264",
            ExportFormat::Webm => "libvpx-vp9",
            ExportFormat::Gif => "gif",
        }
    }
}

/// Export quality levels
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ExportQuality {
    Low,
    Medium,
    High,
    Lossless,
}

impl ExportQuality {
    /// Get the CRF value for H.264/VP9 encoding
    /// Lower values = higher quality, larger files
    pub fn crf(&self) -> u8 {
        match self {
            ExportQuality::Low => 28,
            ExportQuality::Medium => 23,
            ExportQuality::High => 18,
            // CRF 1 is "visually lossless" - no perceptible quality loss
            // CRF 0 (true lossless) has compatibility issues with scaling and yuv420p
            ExportQuality::Lossless => 1,
        }
    }

    /// Get the FFmpeg preset for H.264 encoding
    pub fn h264_preset(&self) -> &'static str {
        match self {
            ExportQuality::Low => "faster",
            ExportQuality::Medium => "medium",
            ExportQuality::High => "slow",
            ExportQuality::Lossless => "veryslow",
        }
    }
}

/// A single segment to include in export (represents trim/cut edits)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportSegment {
    /// Start time in source media (milliseconds)
    pub source_start_ms: u64,
    /// End time in source media (milliseconds)
    pub source_end_ms: u64,
    /// Time scale factor (1.0 = normal, 2.0 = 2x speed, 0.5 = half speed)
    #[serde(default = "default_time_scale")]
    pub time_scale: f64,
}

fn default_time_scale() -> f64 {
    1.0
}

impl ExportSegment {
    /// Duration in the source media (milliseconds)
    pub fn source_duration_ms(&self) -> u64 {
        self.source_end_ms.saturating_sub(self.source_start_ms)
    }

    /// Duration in the output after time scaling (milliseconds)
    pub fn output_duration_ms(&self) -> u64 {
        (self.source_duration_ms() as f64 / self.time_scale) as u64
    }

    /// Start time in seconds for FFmpeg
    pub fn source_start_secs(&self) -> f64 {
        self.source_start_ms as f64 / 1000.0
    }

    /// End time in seconds for FFmpeg
    pub fn source_end_secs(&self) -> f64 {
        self.source_end_ms as f64 / 1000.0
    }
}

/// Edit instructions for a track (screen or camera)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackEdits {
    /// Ordered list of segments to include
    pub segments: Vec<ExportSegment>,
}

impl TrackEdits {
    /// Check if this represents the full source with no cuts
    pub fn is_full_source(&self, source_duration_ms: u64) -> bool {
        if self.segments.len() != 1 {
            return false;
        }
        let seg = &self.segments[0];
        seg.source_start_ms == 0
            && seg.source_end_ms >= source_duration_ms.saturating_sub(100) // Allow small tolerance
            && (seg.time_scale - 1.0).abs() < 0.01
    }

    /// Total output duration after all edits (milliseconds)
    pub fn total_output_duration_ms(&self) -> u64 {
        self.segments.iter().map(|s| s.output_duration_ms()).sum()
    }
}

/// Export configuration options
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportOptions {
    /// Output format
    pub format: ExportFormat,
    /// Quality level
    pub quality: ExportQuality,
    /// Output width in pixels (None = use source resolution)
    pub width: Option<u32>,
    /// Output height in pixels (None = use source resolution)
    pub height: Option<u32>,
    /// Output frame rate (None = use source fps)
    pub fps: Option<u32>,
    /// Output file path
    pub output_path: String,
    /// Whether to include cursor overlay
    pub include_cursor: bool,
    /// Whether to include webcam overlay
    pub include_webcam: bool,
    /// Whether to include microphone audio
    pub include_mic_audio: bool,
    /// Whether to include system audio
    pub include_system_audio: bool,
    /// Screen track edits (optional - if None, use full source)
    pub screen_edits: Option<TrackEdits>,
    /// Camera track edits (optional - if None, use full source)
    pub camera_edits: Option<TrackEdits>,
    /// Optional background music audio file (added in Screenforge v0.2).
    #[serde(default)]
    pub music_audio_file: Option<String>,
    /// Background music volume in [0..1] (default 0.0 = silent).
    #[serde(default)]
    pub music_volume: f64,
    /// Optional fade-in duration for the music track, in milliseconds.
    #[serde(default)]
    pub music_fade_in_ms: u64,
    /// Optional fade-out duration for the music track, in milliseconds.
    #[serde(default)]
    pub music_fade_out_ms: u64,
    /// Optional video-bitrate override in kbps (added in Screenforge v0.2 for
    /// platform presets). When None the format/quality defaults apply.
    #[serde(default)]
    pub video_bitrate_kbps: Option<u32>,
    /// Optional cursor motion-blur intensity (added in Screenforge v0.2).
    /// 0 disables; higher values produce stronger trails.
    #[serde(default)]
    pub motion_blur: u32,
    /// GIF loop count (0 = infinite, -1 = no loop, N >= 1 = play N times).
    /// Only honored when `format == Gif`. Added in Screenforge v0.2.
    #[serde(default)]
    pub gif_loop: Option<i32>,
    /// GIF dithering algorithm: "none", "bayer", "sierra2", or "sierra2_4a".
    /// Only honored when `format == Gif`. Added in Screenforge v0.2.
    #[serde(default)]
    pub gif_dither: Option<String>,
    /// GIF palette generation stats mode: "full", "diff", or "single".
    /// `diff` is the best default for screen recordings. Added in Screenforge v0.2.
    #[serde(default)]
    pub gif_stats_mode: Option<String>,
}

/// Export progress stages
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum ExportStage {
    /// Preparing to export (loading files, etc.)
    Preparing,
    /// Smoothing cursor data
    SmoothingCursor,
    /// Encoding video frames
    Encoding,
    /// Finalizing output file
    Finalizing,
    /// Export completed successfully
    Complete,
    /// Export failed with error
    Error { message: String },
}

/// Export progress information
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportProgress {
    /// Progress percentage (0.0 to 100.0)
    pub percent: f32,
    /// Current stage of export
    pub stage: ExportStage,
    /// Current frame being processed
    pub current_frame: u64,
    /// Total frames to process
    pub total_frames: u64,
}

impl ExportProgress {
    pub fn preparing() -> Self {
        Self {
            percent: 0.0,
            stage: ExportStage::Preparing,
            current_frame: 0,
            total_frames: 0,
        }
    }

    pub fn smoothing_cursor(percent: f32) -> Self {
        Self {
            percent,
            stage: ExportStage::SmoothingCursor,
            current_frame: 0,
            total_frames: 0,
        }
    }

    pub fn encoding(current_frame: u64, total_frames: u64) -> Self {
        let percent = if total_frames > 0 {
            10.0 + (current_frame as f32 / total_frames as f32) * 85.0
        } else {
            10.0
        };
        Self {
            percent,
            stage: ExportStage::Encoding,
            current_frame,
            total_frames,
        }
    }

    pub fn finalizing() -> Self {
        Self {
            percent: 95.0,
            stage: ExportStage::Finalizing,
            current_frame: 0,
            total_frames: 0,
        }
    }

    pub fn complete() -> Self {
        Self {
            percent: 100.0,
            stage: ExportStage::Complete,
            current_frame: 0,
            total_frames: 0,
        }
    }

    pub fn error(message: String) -> Self {
        Self {
            percent: 0.0,
            stage: ExportStage::Error { message },
            current_frame: 0,
            total_frames: 0,
        }
    }
}

/// Export errors
#[derive(Error, Debug)]
pub enum ExportError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("FFmpeg error: {0}")]
    Ffmpeg(String),

    #[error("Recording bundle not found: {0}")]
    BundleNotFound(String),

    #[error("Invalid configuration: {0}")]
    InvalidConfig(String),

    #[error("Export cancelled")]
    Cancelled,

    #[error("Decoding error: {0}")]
    Decoding(String),

    #[error("Encoding error: {0}")]
    Encoding(String),
}

impl From<ExportError> for String {
    fn from(e: ExportError) -> String {
        e.to_string()
    }
}
