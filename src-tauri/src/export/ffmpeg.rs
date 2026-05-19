//! FFmpeg encoder and decoder wrappers for export
//!
//! This module provides FFmpeg-based video decoding and encoding
//! for the export pipeline.

use crate::export::types::{ExportError, ExportFormat, ExportOptions, ExportSegment, TrackEdits};
use std::io::{BufReader, Read, Write};
use std::path::Path;
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};

/// Video decoder using FFmpeg to read frames from a video file
pub struct VideoDecoder {
    process: Child,
    stdout: BufReader<ChildStdout>,
    width: u32,
    height: u32,
    fps: f64,
    frame_size: usize,
    total_frames: u64,
    frames_read: u64,
}

impl VideoDecoder {
    /// Open a video file for decoding
    pub fn open(video_path: &Path) -> Result<Self, ExportError> {
        // First, probe the video to get metadata
        let (width, height, total_frames, fps) = Self::probe_video(video_path)?;

        tracing::info!(
            "Opening video decoder for {:?}: {}x{}, {} frames @ {}fps",
            video_path,
            width,
            height,
            total_frames,
            fps
        );

        // Start FFmpeg to decode video to raw RGBA frames
        // IMPORTANT: Must specify -s to ensure exact dimensions without padding
        let mut process = Command::new("ffmpeg")
            .args([
                "-i",
                video_path.to_str().unwrap_or(""),
                "-f",
                "rawvideo",
                "-pix_fmt",
                "rgba",
                "-s",
                &format!("{}x{}", width, height),
                "-",
            ])
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| ExportError::Ffmpeg(format!("Failed to start FFmpeg decoder: {}", e)))?;

        let frame_size = (width * height * 4) as usize; // RGBA = 4 bytes per pixel

        let stdout = process
            .stdout
            .take()
            .ok_or_else(|| ExportError::Ffmpeg("Failed to capture FFmpeg stdout".to_string()))?;

        Ok(Self {
            process,
            stdout: BufReader::with_capacity(frame_size * 2, stdout),
            width,
            height,
            fps,
            frame_size,
            total_frames,
            frames_read: 0,
        })
    }

    /// Probe video file to get metadata
    fn probe_video(video_path: &Path) -> Result<(u32, u32, u64, f64), ExportError> {
        let output = Command::new("ffprobe")
            .args([
                "-v",
                "error",
                "-select_streams",
                "v:0",
                "-count_packets",
                "-show_entries",
                "stream=width,height,nb_read_packets,r_frame_rate",
                "-of",
                "csv=p=0",
                video_path.to_str().unwrap_or(""),
            ])
            .output()
            .map_err(|e| ExportError::Ffmpeg(format!("Failed to run ffprobe: {}", e)))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(ExportError::Ffmpeg(format!("ffprobe failed: {}", stderr)));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let parts: Vec<&str> = stdout.trim().split(',').collect();

        if parts.len() < 4 {
            return Err(ExportError::Ffmpeg(format!(
                "Unexpected ffprobe output: {}",
                stdout
            )));
        }

        let width: u32 = parts[0]
            .parse()
            .map_err(|_| ExportError::Ffmpeg("Invalid width".to_string()))?;
        let height: u32 = parts[1]
            .parse()
            .map_err(|_| ExportError::Ffmpeg("Invalid height".to_string()))?;

        // Parse frame rate (format: "30/1" or "30000/1001")
        let fps_parts: Vec<&str> = parts[2].split('/').collect();
        let fps = if fps_parts.len() == 2 {
            let num: f64 = fps_parts[0].parse().unwrap_or(30.0);
            let den: f64 = fps_parts[1].parse().unwrap_or(1.0);
            num / den
        } else {
            parts[2].parse().unwrap_or(30.0)
        };

        let total_frames: u64 = parts[3].parse().unwrap_or(0);

        Ok((width, height, total_frames, fps))
    }

    /// Get video dimensions
    pub fn dimensions(&self) -> (u32, u32) {
        (self.width, self.height)
    }

    /// Get video frame rate
    pub fn fps(&self) -> f64 {
        self.fps
    }

    /// Get total frame count
    pub fn frame_count(&self) -> u64 {
        self.total_frames
    }

    /// Get number of frames read so far
    pub fn frames_read(&self) -> u64 {
        self.frames_read
    }

    /// Read the next frame as RGBA data
    /// Returns None when all frames have been read
    pub fn read_frame(&mut self) -> Result<Option<Vec<u8>>, ExportError> {
        let mut buffer = vec![0u8; self.frame_size];

        match self.stdout.read_exact(&mut buffer) {
            Ok(()) => {
                self.frames_read += 1;
                Ok(Some(buffer))
            }
            Err(e) if e.kind() == std::io::ErrorKind::UnexpectedEof => {
                // End of video
                Ok(None)
            }
            Err(e) => Err(ExportError::Decoding(format!(
                "Failed to read frame: {}",
                e
            ))),
        }
    }
}

impl Drop for VideoDecoder {
    fn drop(&mut self) {
        let _ = self.process.kill();
    }
}

/// Video encoder using FFmpeg for export output
pub struct VideoEncoder {
    process: Child,
    stdin: ChildStdin,
    frame_count: u64,
}

impl VideoEncoder {
    /// Create a new encoder for video-only output (no audio)
    pub fn new_video_only(options: &ExportOptions, source_width: u32, source_height: u32, source_fps: f64) -> Result<Self, ExportError> {
        let crf = options.quality.crf();
        let preset = options.quality.h264_preset();

        // Calculate output dimensions - use source if not specified
        let output_width = options.width.unwrap_or(source_width);
        let output_height = options.height.unwrap_or(source_height);
        let output_fps = options.fps.unwrap_or(source_fps as u32);

        // Build scaling filter if dimensions differ
        let scale_filter = if source_width != output_width || source_height != output_height {
            format!(
                "-vf scale={}:{}:force_original_aspect_ratio=decrease,pad={}:{}:(ow-iw)/2:(oh-ih)/2:black",
                output_width, output_height, output_width, output_height
            )
        } else {
            String::new()
        };

        let mut args = vec![
            "-y".to_string(),
            "-f".to_string(),
            "rawvideo".to_string(),
            "-pix_fmt".to_string(),
            "rgba".to_string(),
            "-s".to_string(),
            format!("{}x{}", source_width, source_height),
            "-r".to_string(),
            source_fps.to_string(),
            "-i".to_string(),
            "-".to_string(), // stdin for video frames
        ];

        // Add scaling filter if needed
        if !scale_filter.is_empty() {
            args.extend(scale_filter.split_whitespace().map(String::from));
        }

        // Add codec-specific options based on format
        match options.format {
            ExportFormat::Mp4 => {
                args.extend([
                    "-c:v".to_string(),
                    "libx264".to_string(),
                    "-preset".to_string(),
                    preset.to_string(),
                    "-crf".to_string(),
                    crf.to_string(),
                    "-pix_fmt".to_string(),
                    "yuv420p".to_string(),
                    "-movflags".to_string(),
                    "+faststart".to_string(),
                ]);
            }
            ExportFormat::Webm => {
                args.extend([
                    "-c:v".to_string(),
                    "libvpx-vp9".to_string(),
                    "-crf".to_string(),
                    crf.to_string(),
                    "-b:v".to_string(),
                    "0".to_string(),
                ]);
            }
            ExportFormat::Gif => {
                // GIF needs a different pipeline with palette generation
                // Use aspect-ratio-preserving scale for GIF too
                let gif_width = output_width.min(800);
                args.extend([
                    "-vf".to_string(),
                    format!(
                        "fps={},scale={}:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse",
                        output_fps.min(15), // Limit GIF fps
                        gif_width
                    ),
                ]);
            }
        }

        args.push(options.output_path.clone());

        tracing::info!("Starting FFmpeg encoder: {:?}", args);

        let mut process = Command::new("ffmpeg")
            .args(&args)
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| ExportError::Ffmpeg(format!("Failed to start FFmpeg encoder: {}", e)))?;

        let stdin = process
            .stdin
            .take()
            .ok_or_else(|| ExportError::Ffmpeg("Failed to capture FFmpeg stdin".to_string()))?;

        Ok(Self {
            process,
            stdin,
            frame_count: 0,
        })
    }

    /// Create a new encoder with audio mixing
    pub fn new_with_audio(
        options: &ExportOptions,
        source_width: u32,
        source_height: u32,
        source_fps: f64,
        mic_audio_path: Option<&Path>,
        system_audio_path: Option<&Path>,
    ) -> Result<Self, ExportError> {
        let crf = options.quality.crf();
        let preset = options.quality.h264_preset();

        // IMPORTANT: Use source_fps for input frame rate, not options.fps
        // The -r flag before -i specifies the INPUT frame rate
        let mut args = vec![
            "-y".to_string(),
            "-f".to_string(),
            "rawvideo".to_string(),
            "-pix_fmt".to_string(),
            "rgba".to_string(),
            "-s".to_string(),
            format!("{}x{}", source_width, source_height),
            "-r".to_string(),
            source_fps.to_string(), // Use SOURCE fps, not requested output fps
            "-i".to_string(),
            "-".to_string(), // stdin for video frames (input 0)
        ];

        // Add audio inputs
        let mut audio_inputs = Vec::new();
        let mut input_index = 1;

        if let Some(mic_path) = mic_audio_path {
            if options.include_mic_audio && mic_path.exists() {
                args.extend(["-i".to_string(), mic_path.to_string_lossy().to_string()]);
                audio_inputs.push(input_index);
                input_index += 1;
            }
        }

        if let Some(system_path) = system_audio_path {
            if options.include_system_audio && system_path.exists() {
                args.extend(["-i".to_string(), system_path.to_string_lossy().to_string()]);
                audio_inputs.push(input_index);
            }
        }

        // Build filter complex for audio mixing if we have multiple audio tracks
        let filter_complex = if audio_inputs.len() > 1 {
            let audio_refs: Vec<String> = audio_inputs.iter().map(|i| format!("[{}:a]", i)).collect();
            Some(format!(
                "{}amix=inputs={}:duration=longest[aout]",
                audio_refs.join(""),
                audio_inputs.len()
            ))
        } else {
            None
        };

        if let Some(ref filter) = filter_complex {
            args.extend(["-filter_complex".to_string(), filter.clone()]);
        }

        // Scaling filter - only if explicit dimensions are provided AND differ from source
        // Use aspect-ratio-preserving scaling with padding to avoid distortion
        let output_width = options.width.unwrap_or(source_width);
        let output_height = options.height.unwrap_or(source_height);
        
        if output_width != source_width || output_height != source_height {
            // Use FFmpeg's aspect-ratio-preserving scale with padding
            // This scales the video to fit within the target dimensions while preserving aspect ratio,
            // then pads with black bars if needed
            args.extend([
                "-vf".to_string(),
                format!(
                    "scale={}:{}:force_original_aspect_ratio=decrease,pad={}:{}:(ow-iw)/2:(oh-ih)/2:black",
                    output_width, output_height, output_width, output_height
                ),
            ]);
            tracing::info!(
                "Scaling from {}x{} to {}x{} with aspect ratio preservation",
                source_width, source_height, output_width, output_height
            );
        } else {
            tracing::info!(
                "No scaling - exporting at source resolution {}x{}",
                source_width, source_height
            );
        }

        // Video codec options
        match options.format {
            ExportFormat::Mp4 => {
                args.extend([
                    "-c:v".to_string(),
                    "libx264".to_string(),
                    "-preset".to_string(),
                    preset.to_string(),
                    "-crf".to_string(),
                    crf.to_string(),
                    "-pix_fmt".to_string(),
                    "yuv420p".to_string(),
                    "-movflags".to_string(),
                    "+faststart".to_string(),
                ]);
            }
            ExportFormat::Webm => {
                args.extend([
                    "-c:v".to_string(),
                    "libvpx-vp9".to_string(),
                    "-crf".to_string(),
                    crf.to_string(),
                    "-b:v".to_string(),
                    "0".to_string(),
                ]);
            }
            ExportFormat::Gif => {
                // GIF doesn't support audio, fall back to video only
                return Self::new_video_only(options, source_width, source_height, source_fps);
            }
        }

        // Audio codec options
        if !audio_inputs.is_empty() {
            if filter_complex.is_some() {
                args.extend(["-map".to_string(), "0:v".to_string()]);
                args.extend(["-map".to_string(), "[aout]".to_string()]);
            } else if audio_inputs.len() == 1 {
                args.extend(["-map".to_string(), "0:v".to_string()]);
                args.extend([
                    "-map".to_string(),
                    format!("{}:a", audio_inputs[0]),
                ]);
            }
            args.extend([
                "-c:a".to_string(),
                "aac".to_string(),
                "-b:a".to_string(),
                "192k".to_string(),
            ]);
        }

        args.push(options.output_path.clone());

        tracing::info!("Starting FFmpeg encoder with audio: {:?}", args);

        let mut process = Command::new("ffmpeg")
            .args(&args)
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| ExportError::Ffmpeg(format!("Failed to start FFmpeg encoder: {}", e)))?;

        let stdin = process
            .stdin
            .take()
            .ok_or_else(|| ExportError::Ffmpeg("Failed to capture FFmpeg stdin".to_string()))?;

        Ok(Self {
            process,
            stdin,
            frame_count: 0,
        })
    }

    /// Write a frame to the encoder
    pub fn write_frame(&mut self, rgba_data: &[u8]) -> Result<(), ExportError> {
        self.stdin
            .write_all(rgba_data)
            .map_err(|e| ExportError::Encoding(format!("Failed to write frame: {}", e)))?;
        self.frame_count += 1;
        Ok(())
    }

    /// Get number of frames written
    pub fn frame_count(&self) -> u64 {
        self.frame_count
    }

    /// Finish encoding and wait for FFmpeg to complete
    pub fn finish(self) -> Result<(), ExportError> {
        // Close stdin to signal EOF to FFmpeg
        drop(self.stdin);

        // Wait for FFmpeg to finish
        let output = self
            .process
            .wait_with_output()
            .map_err(|e| ExportError::Ffmpeg(format!("Failed to wait for FFmpeg: {}", e)))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(ExportError::Ffmpeg(format!(
                "FFmpeg exited with error: {}",
                stderr
            )));
        }

        tracing::info!("FFmpeg encoder finished: {} frames written", self.frame_count);
        Ok(())
    }
}

/// Build atempo filter chain for arbitrary speed changes
/// atempo only accepts 0.5-2.0, so chain multiple for larger changes
fn build_atempo_chain(time_scale: f64) -> String {
    if (time_scale - 1.0).abs() < 0.01 {
        return "anull".to_string();
    }

    let mut remaining = time_scale;
    let mut filters = Vec::new();

    while remaining > 2.0 {
        filters.push("atempo=2.0".to_string());
        remaining /= 2.0;
    }
    while remaining < 0.5 {
        filters.push("atempo=0.5".to_string());
        remaining *= 2.0;
    }

    if (remaining - 1.0).abs() > 0.01 {
        filters.push(format!("atempo={:.4}", remaining));
    }

    if filters.is_empty() {
        "anull".to_string()
    } else {
        filters.join(",")
    }
}

/// Build filter_complex for video segments with trim/concat
fn build_video_filter(segments: &[ExportSegment], input_index: usize) -> (String, String) {
    let mut filters = Vec::new();
    let mut concat_inputs = Vec::new();

    for (i, seg) in segments.iter().enumerate() {
        let start = seg.source_start_secs();
        let end = seg.source_end_secs();
        let label = format!("v{}", i);

        // Trim and reset timestamps
        let filter = if (seg.time_scale - 1.0).abs() < 0.01 {
            // No speed change
            format!(
                "[{}:v]trim=start={}:end={},setpts=PTS-STARTPTS[{}]",
                input_index, start, end, label
            )
        } else {
            // Apply speed change via setpts
            format!(
                "[{}:v]trim=start={}:end={},setpts=(PTS-STARTPTS)/{}[{}]",
                input_index, start, end, seg.time_scale, label
            )
        };
        filters.push(filter);
        concat_inputs.push(format!("[{}]", label));
    }

    let output_label = if segments.len() > 1 {
        // Concat all segments
        filters.push(format!(
            "{}concat=n={}:v=1:a=0[vconcat]",
            concat_inputs.join(""),
            segments.len()
        ));
        "vconcat".to_string()
    } else {
        "v0".to_string()
    };

    (filters.join(";"), output_label)
}

/// Build filter_complex for audio segments with trim/concat
fn build_audio_filter(
    segments: &[ExportSegment],
    input_index: usize,
    prefix: &str,
) -> (String, String) {
    let mut filters = Vec::new();
    let mut concat_inputs = Vec::new();

    for (i, seg) in segments.iter().enumerate() {
        let start = seg.source_start_secs();
        let end = seg.source_end_secs();
        let label = format!("{}{}", prefix, i);

        // Trim, reset timestamps, and apply tempo change
        let atempo = build_atempo_chain(seg.time_scale);
        let filter = format!(
            "[{}:a]atrim=start={}:end={},asetpts=PTS-STARTPTS,{}[{}]",
            input_index, start, end, atempo, label
        );
        filters.push(filter);
        concat_inputs.push(format!("[{}]", label));
    }

    let output_label = if segments.len() > 1 {
        // Concat all segments
        let out_label = format!("{}concat", prefix);
        filters.push(format!(
            "{}concat=n={}:v=0:a=1[{}]",
            concat_inputs.join(""),
            segments.len(),
            out_label
        ));
        out_label
    } else {
        format!("{}0", prefix)
    };

    (filters.join(";"), output_label)
}

/// Export video with edits using FFmpeg filter_complex
///
/// This function handles trim, cut, and speed changes by building a filter_complex
/// that processes segments directly in FFmpeg, avoiding the need to process
/// frames in Rust.
pub fn export_with_edits(
    video_path: &Path,
    webcam_path: Option<&Path>,
    mic_audio_path: Option<&Path>,
    system_audio_path: Option<&Path>,
    options: &ExportOptions,
    edits: &TrackEdits,
) -> Result<std::process::Child, ExportError> {
    // Get source video metadata for scaling decisions
    let (source_width, source_height, _, source_fps) = VideoDecoder::probe_video(video_path)?;

    let output_width = options.width.unwrap_or(source_width);
    let output_height = options.height.unwrap_or(source_height);
    let output_fps = options.fps.unwrap_or(source_fps as u32);

    let crf = options.quality.crf();
    let preset = options.quality.h264_preset();

    // Build input args
    let mut args = vec!["-y".to_string()];

    // Input 0: video
    args.extend(["-i".to_string(), video_path.to_string_lossy().to_string()]);

    // Track input indices
    let mut webcam_input_index: Option<usize> = None;
    let mut mic_input_index: Option<usize> = None;
    let mut system_input_index: Option<usize> = None;
    let mut music_input_index: Option<usize> = None;
    let mut next_input = 1;

    // Input 1: webcam (if included)
    if let Some(wc_path) = webcam_path {
        if options.include_webcam && wc_path.exists() {
            args.extend(["-i".to_string(), wc_path.to_string_lossy().to_string()]);
            webcam_input_index = Some(next_input);
            next_input += 1;
        }
    }

    // Input 2+: audio files
    if let Some(mic_path) = mic_audio_path {
        if options.include_mic_audio && mic_path.exists() {
            args.extend(["-i".to_string(), mic_path.to_string_lossy().to_string()]);
            mic_input_index = Some(next_input);
            next_input += 1;
        }
    }

    if let Some(system_path) = system_audio_path {
        if options.include_system_audio && system_path.exists() {
            args.extend(["-i".to_string(), system_path.to_string_lossy().to_string()]);
            system_input_index = Some(next_input);
            next_input += 1;
        }
    }

    // Optional background music input (Screenforge #20).
    if let Some(music_path_str) = options.music_audio_file.as_deref() {
        let music_path = Path::new(music_path_str);
        if music_path.exists() && options.music_volume > 0.0 {
            args.extend(["-i".to_string(), music_path.to_string_lossy().to_string()]);
            music_input_index = Some(next_input);
        }
    }

    // Build filter_complex
    let mut filter_parts = Vec::new();
    let mut audio_outputs = Vec::new();

    // Video filter
    let (video_filter, video_label) = build_video_filter(&edits.segments, 0);
    filter_parts.push(video_filter);

    // Add scaling and fps conversion
    // If webcam is included, output to intermediate label; otherwise output to [vout]
    let video_scaled_label = if webcam_input_index.is_some() {
        "vscaled"
    } else {
        "vout"
    };

    let scale_filter = if source_width != output_width || source_height != output_height {
        format!(
            "[{}]scale={}:{}:force_original_aspect_ratio=decrease,pad={}:{}:(ow-iw)/2:(oh-ih)/2:black,fps={}[{}]",
            video_label, output_width, output_height, output_width, output_height, output_fps, video_scaled_label
        )
    } else {
        format!("[{}]fps={}[{}]", video_label, output_fps, video_scaled_label)
    };
    filter_parts.push(scale_filter);

    // Add webcam overlay if included
    if let Some(wc_idx) = webcam_input_index {
        // Scale webcam to 12.5% of output width, position in bottom-right with 20px margin
        let webcam_width = (output_width as f64 * 0.125) as u32;
        let margin = 20;

        // Apply same trim/concat edits to webcam as main video
        let mut wc_segment_labels = Vec::new();
        for (i, seg) in edits.segments.iter().enumerate() {
            let start_sec = seg.source_start_ms as f64 / 1000.0;
            let end_sec = seg.source_end_ms as f64 / 1000.0;
            let label = format!("wc{}", i);

            filter_parts.push(format!(
                "[{}:v]trim=start={}:end={},setpts=PTS-STARTPTS[{}]",
                wc_idx, start_sec, end_sec, label
            ));
            wc_segment_labels.push(format!("[{}]", label));
        }

        // Concat webcam segments if multiple
        let wc_concat_label = if wc_segment_labels.len() > 1 {
            filter_parts.push(format!(
                "{}concat=n={}:v=1:a=0[wcconcat]",
                wc_segment_labels.join(""),
                wc_segment_labels.len()
            ));
            "wcconcat".to_string()
        } else {
            // Single segment, use directly (strip brackets)
            wc_segment_labels[0][1..wc_segment_labels[0].len() - 1].to_string()
        };

        // Scale webcam video
        filter_parts.push(format!(
            "[{}]scale={}:-1[wc_scaled]",
            wc_concat_label, webcam_width
        ));

        // Overlay webcam on main video with 'shortest' to match main video duration
        filter_parts.push(format!(
            "[vscaled][wc_scaled]overlay=W-w-{}:H-h-{}:shortest=1[vout]",
            margin, margin
        ));
    }

    // Mic audio filter
    if let Some(mic_idx) = mic_input_index {
        let (audio_filter, audio_label) = build_audio_filter(&edits.segments, mic_idx, "mic");
        filter_parts.push(audio_filter);
        audio_outputs.push(format!("[{}]", audio_label));
    }

    // System audio filter
    if let Some(sys_idx) = system_input_index {
        let (audio_filter, audio_label) = build_audio_filter(&edits.segments, sys_idx, "sys");
        filter_parts.push(audio_filter);
        audio_outputs.push(format!("[{}]", audio_label));
    }

    // Background-music filter: volume + optional fade in/out. The music plays
    // for the full output duration, looping automatically via aloop+atrim.
    if let Some(music_idx) = music_input_index {
        let total_out_ms = edits.total_output_duration_ms();
        let total_out_secs = total_out_ms as f64 / 1000.0;
        let volume = options.music_volume.max(0.0).min(2.0);
        let mut chain = format!(
            "[{}:a]aloop=loop=-1:size=2e+09,atrim=duration={:.3},asetpts=N/SR/TB,volume={:.3}",
            music_idx, total_out_secs, volume
        );
        if options.music_fade_in_ms > 0 {
            chain.push_str(&format!(
                ",afade=t=in:st=0:d={:.3}",
                options.music_fade_in_ms as f64 / 1000.0
            ));
        }
        if options.music_fade_out_ms > 0 {
            let fade_start = (total_out_secs
                - options.music_fade_out_ms as f64 / 1000.0)
                .max(0.0);
            chain.push_str(&format!(
                ",afade=t=out:st={:.3}:d={:.3}",
                fade_start,
                options.music_fade_out_ms as f64 / 1000.0
            ));
        }
        chain.push_str("[music]");
        filter_parts.push(chain);
        audio_outputs.push("[music]".to_string());
    }

    // Mix audio if multiple sources
    let final_audio_label = if audio_outputs.len() > 1 {
        filter_parts.push(format!(
            "{}amix=inputs={}:duration=longest[aout]",
            audio_outputs.join(""),
            audio_outputs.len()
        ));
        Some("[aout]".to_string())
    } else if audio_outputs.len() == 1 {
        Some(audio_outputs[0].clone())
    } else {
        None
    };

    // Join all filter parts
    let filter_complex = filter_parts.join(";");
    args.extend(["-filter_complex".to_string(), filter_complex]);

    // Map outputs
    args.extend(["-map".to_string(), "[vout]".to_string()]);
    if let Some(audio_label) = final_audio_label {
        args.extend(["-map".to_string(), audio_label]);
    }

    // Video codec options
    match options.format {
        ExportFormat::Mp4 => {
            args.extend([
                "-c:v".to_string(),
                "libx264".to_string(),
                "-preset".to_string(),
                preset.to_string(),
                "-crf".to_string(),
                crf.to_string(),
                "-pix_fmt".to_string(),
                "yuv420p".to_string(),
                "-movflags".to_string(),
                "+faststart".to_string(),
            ]);
        }
        ExportFormat::Webm => {
            args.extend([
                "-c:v".to_string(),
                "libvpx-vp9".to_string(),
                "-crf".to_string(),
                crf.to_string(),
                "-b:v".to_string(),
                "0".to_string(),
            ]);
        }
        ExportFormat::Gif => {
            // GIF handling - simplified
            args.extend(["-f".to_string(), "gif".to_string()]);
        }
    }

    // Audio codec
    if mic_input_index.is_some()
        || system_input_index.is_some()
        || music_input_index.is_some()
    {
        args.extend([
            "-c:a".to_string(),
            "aac".to_string(),
            "-b:a".to_string(),
            "192k".to_string(),
        ]);
    }

    // Progress output for tracking
    args.extend(["-progress".to_string(), "pipe:1".to_string()]);

    // Output path
    args.push(options.output_path.clone());

    tracing::info!("Starting FFmpeg export with edits: {:?}", args);

    let process = Command::new("ffmpeg")
        .args(&args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| ExportError::Ffmpeg(format!("Failed to start FFmpeg: {}", e)))?;

    Ok(process)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_atempo_chain_normal() {
        let chain = build_atempo_chain(1.0);
        assert_eq!(chain, "anull");
    }

    #[test]
    fn test_atempo_chain_2x() {
        let chain = build_atempo_chain(2.0);
        assert!(chain.contains("atempo=2"));
    }

    #[test]
    fn test_atempo_chain_4x() {
        // 4x speed needs: atempo=2.0,atempo=2.0
        let chain = build_atempo_chain(4.0);
        assert_eq!(chain.matches("atempo=2.0").count(), 2);
    }

    #[test]
    fn test_atempo_chain_half() {
        let chain = build_atempo_chain(0.5);
        assert!(chain.contains("atempo=0.5"));
    }

    #[test]
    fn test_video_filter_single_segment() {
        let segments = vec![ExportSegment {
            source_start_ms: 1000,
            source_end_ms: 5000,
            time_scale: 1.0,
        }];
        let (filter, label) = build_video_filter(&segments, 0);
        assert!(filter.contains("trim=start=1:end=5"));
        assert_eq!(label, "v0");
    }

    #[test]
    fn test_video_filter_multiple_segments() {
        let segments = vec![
            ExportSegment {
                source_start_ms: 0,
                source_end_ms: 2000,
                time_scale: 1.0,
            },
            ExportSegment {
                source_start_ms: 5000,
                source_end_ms: 8000,
                time_scale: 1.0,
            },
        ];
        let (filter, label) = build_video_filter(&segments, 0);
        assert!(filter.contains("concat=n=2"));
        assert_eq!(label, "vconcat");
    }

    #[test]
    fn test_video_filter_with_speed() {
        let segments = vec![ExportSegment {
            source_start_ms: 0,
            source_end_ms: 4000,
            time_scale: 2.0,
        }];
        let (filter, _) = build_video_filter(&segments, 0);
        assert!(filter.contains("setpts=(PTS-STARTPTS)/2"));
    }
}
