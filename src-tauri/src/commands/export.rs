//! Export command handlers
//!
//! This module provides Tauri commands for video export functionality.

use crate::export::{export_with_edits, ExportOptions, ExportPipeline, ExportProgress, TrackEdits};
use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};

/// State for tracking active export jobs
#[derive(Default)]
pub struct ExportState {
    /// Cancel flag for the current export
    cancel_flag: Arc<AtomicBool>,
    /// Whether an export is currently running
    is_exporting: Arc<AtomicBool>,
}

/// Start an export job
///
/// This command starts the export process in a background task and
/// emits progress events via Tauri's event system.
#[tauri::command]
pub async fn start_export(
    app: AppHandle,
    state: State<'_, ExportState>,
    project_dir: String,
    options: ExportOptions,
) -> Result<(), String> {
    // Check if already exporting
    if state.is_exporting.load(Ordering::Relaxed) {
        return Err("An export is already in progress".to_string());
    }

    // Reset cancel flag
    state.cancel_flag.store(false, Ordering::Relaxed);
    state.is_exporting.store(true, Ordering::Relaxed);

    let cancel_flag = state.cancel_flag.clone();
    let is_exporting = state.is_exporting.clone();

    tracing::info!("Starting export for project: {}", project_dir);
    tracing::info!("Export options: {:?}", options);

    // Run export in background task
    tauri::async_runtime::spawn(async move {
        let pipeline = ExportPipeline::new(
            PathBuf::from(&project_dir),
            options,
            cancel_flag,
        );

        let app_handle = app.clone();
        let result = tokio::task::spawn_blocking(move || {
            pipeline.run(|progress| {
                // Emit progress event
                if let Err(e) = app_handle.emit("export-progress", &progress) {
                    tracing::warn!("Failed to emit export progress: {}", e);
                }
            })
        })
        .await;

        // Mark export as complete
        is_exporting.store(false, Ordering::Relaxed);

        // Handle result
        match result {
            Ok(Ok(())) => {
                tracing::info!("Export completed successfully");
                if let Err(e) = app.emit("export-complete", ()) {
                    tracing::warn!("Failed to emit export-complete: {}", e);
                }
            }
            Ok(Err(e)) => {
                tracing::error!("Export failed: {}", e);
                if let Err(emit_err) = app.emit("export-error", e.to_string()) {
                    tracing::warn!("Failed to emit export-error: {}", emit_err);
                }
            }
            Err(e) => {
                tracing::error!("Export task panicked: {}", e);
                if let Err(emit_err) = app.emit("export-error", format!("Export task panicked: {}", e)) {
                    tracing::warn!("Failed to emit export-error: {}", emit_err);
                }
            }
        }
    });

    Ok(())
}

/// Cancel the current export job
#[tauri::command]
pub fn cancel_export(state: State<'_, ExportState>) -> Result<(), String> {
    if !state.is_exporting.load(Ordering::Relaxed) {
        return Err("No export in progress".to_string());
    }

    tracing::info!("Cancelling export");
    state.cancel_flag.store(true, Ordering::Relaxed);
    Ok(())
}

/// Check if an export is currently in progress
#[tauri::command]
pub fn is_exporting(state: State<'_, ExportState>) -> bool {
    state.is_exporting.load(Ordering::Relaxed)
}

/// Export with edits (trim/cut/speed) using FFmpeg filter_complex
///
/// This is a simplified export that applies edits directly via FFmpeg,
/// without frame-by-frame cursor compositing. Use this for exports
/// that don't need cursor overlay, or when edits are specified.
#[tauri::command]
pub async fn start_export_with_edits(
    app: AppHandle,
    state: State<'_, ExportState>,
    project_dir: String,
    options: ExportOptions,
    edits: TrackEdits,
) -> Result<(), String> {
    // Check if already exporting
    if state.is_exporting.load(Ordering::Relaxed) {
        return Err("An export is already in progress".to_string());
    }

    // Reset cancel flag
    state.cancel_flag.store(false, Ordering::Relaxed);
    state.is_exporting.store(true, Ordering::Relaxed);

    let is_exporting = state.is_exporting.clone();

    tracing::info!("Starting export with edits for project: {}", project_dir);
    tracing::info!("Export options: {:?}", options);
    tracing::info!("Edits: {} segments", edits.segments.len());

    // TODO(Screenforge #21): apply Scene.blur_regions during ffmpeg filter
    // graph build (split -> crop -> boxblur -> overlay with `enable=between(t,start,end)`).
    // The project bundle round-trips blur_regions today; only the export
    // burn-in is missing.

    // Calculate total output duration for progress reporting
    let total_duration_ms = edits.total_output_duration_ms();
    let total_duration_us = total_duration_ms * 1000; // FFmpeg reports in microseconds

    // Build paths - recording files are in the "recording" subdirectory
    let project_path = PathBuf::from(&project_dir);
    let recording_dir = project_path.join("recording");
    let video_path = recording_dir.join("recording-0.mp4");
    let webcam_video_path = recording_dir.join("recording-0-webcam.mp4");
    let mic_audio_path = recording_dir.join("recording-0-mic.m4a");
    let system_audio_path = recording_dir.join("recording-0-system.m4a");

    // Check video exists
    if !video_path.exists() {
        is_exporting.store(false, Ordering::Relaxed);
        return Err(format!("Video file not found: {:?}", video_path));
    }

    // Run export in background task
    tauri::async_runtime::spawn(async move {
        // Start FFmpeg process
        let result = export_with_edits(
            &video_path,
            if webcam_video_path.exists() {
                Some(webcam_video_path.as_path())
            } else {
                None
            },
            if mic_audio_path.exists() {
                Some(mic_audio_path.as_path())
            } else {
                None
            },
            if system_audio_path.exists() {
                Some(system_audio_path.as_path())
            } else {
                None
            },
            &options,
            &edits,
        );

        match result {
            Ok(mut child) => {
                // Parse progress from stdout
                if let Some(stdout) = child.stdout.take() {
                    let reader = BufReader::new(stdout);
                    for line in reader.lines().map_while(Result::ok) {
                        if line.starts_with("out_time_us=") {
                            if let Ok(time_us) = line[12..].parse::<u64>() {
                                let progress = ExportProgress::encoding(
                                    time_us / 1000, // Convert to ms as "current frame"
                                    total_duration_ms,
                                );

                                if let Err(e) = app.emit("export-progress", &progress) {
                                    tracing::warn!("Failed to emit export progress: {}", e);
                                }
                            }
                        }
                    }
                }

                // Wait for FFmpeg to complete
                match child.wait() {
                    Ok(status) if status.success() => {
                        tracing::info!("Export with edits completed successfully");
                        let _ = app.emit("export-progress", ExportProgress::complete());
                        let _ = app.emit("export-complete", ());
                    }
                    Ok(status) => {
                        let stderr = child
                            .stderr
                            .map(|s| {
                                let mut buf = String::new();
                                let _ = BufReader::new(s).read_line(&mut buf);
                                buf
                            })
                            .unwrap_or_default();
                        tracing::error!("FFmpeg exited with status {}: {}", status, stderr);
                        let _ = app.emit("export-error", format!("FFmpeg failed: {}", stderr));
                    }
                    Err(e) => {
                        tracing::error!("Failed to wait for FFmpeg: {}", e);
                        let _ = app.emit("export-error", e.to_string());
                    }
                }
            }
            Err(e) => {
                tracing::error!("Failed to start export: {}", e);
                let _ = app.emit("export-error", e.to_string());
            }
        }

        // Mark export as complete
        is_exporting.store(false, Ordering::Relaxed);
    });

    Ok(())
}
