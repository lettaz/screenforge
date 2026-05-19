//! Project-related Tauri commands
//!
//! These commands handle creating, opening, saving, and managing projects.
//! 
//! Key behavior: Auto-save
//! - Projects are automatically saved to ~/Movies/Screenforge/ when created
//! - All edits are auto-saved to disk (no manual save button)

use crate::project::{
    bundle,
    schema::{Layout, LayoutType, Point, Project, ProjectConfig, Scene, SceneType, Slice},
};
use chrono::Utc;
use dirs;
use std::fs;
use std::path::PathBuf;
use tauri::State;
use tokio::sync::Mutex;
use uuid::Uuid;

/// Application state for managing the current project
pub struct AppState {
    pub current_project: Mutex<Option<Project>>,
    pub current_project_path: Mutex<Option<PathBuf>>,
    pub temp_bundle_path: Mutex<Option<PathBuf>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            current_project: Mutex::new(None),
            current_project_path: Mutex::new(None),
            temp_bundle_path: Mutex::new(None),
        }
    }
}

/// Create a new project
#[tauri::command]
pub async fn create_project(name: Option<String>) -> Result<Project, String> {
    let project_name = name.unwrap_or_else(|| "Untitled Recording".to_string());
    let project = Project::new(project_name);
    
    tracing::info!("Created new project: {}", project.id);
    
    Ok(project)
}

/// Open an existing project from a path
#[tauri::command]
pub async fn open_project(path: String) -> Result<Project, String> {
    let project_path = PathBuf::from(&path);
    
    tracing::info!("Opening project from: {:?}", project_path);
    
    let project = bundle::read_project(&project_path)
        .map_err(|e| format!("Failed to open project: {}", e))?;
    
    Ok(project)
}

/// Save the current project to a path
#[tauri::command]
pub async fn save_project(project: Project, path: String) -> Result<(), String> {
    let project_path = PathBuf::from(&path);
    
    tracing::info!("Saving project to: {:?}", project_path);
    
    bundle::write_project(&project, &project_path)
        .map_err(|e| format!("Failed to save project: {}", e))?;
    
    Ok(())
}

/// Get the current project state
#[tauri::command]
pub async fn get_project(state: State<'_, AppState>) -> Result<Option<Project>, String> {
    let project = state.current_project.lock().await;
    Ok(project.clone())
}

/// Get the current project's saved path (None if unsaved/in temp)
#[tauri::command]
pub async fn get_project_path(state: State<'_, AppState>) -> Result<Option<String>, String> {
    let path = state.current_project_path.lock().await;
    Ok(path.as_ref().map(|p| p.to_string_lossy().to_string()))
}

/// Get the default projects directory
/// Creates the directory if it doesn't exist
#[tauri::command]
pub async fn get_default_projects_dir() -> Result<String, String> {
    let projects_dir = get_projects_directory()?;
    Ok(projects_dir.to_string_lossy().to_string())
}

/// Helper to get the default projects directory path
fn get_projects_directory() -> Result<PathBuf, String> {
    let movies_dir = dirs::video_dir()
        .or_else(|| dirs::home_dir().map(|h| h.join("Movies")))
        .ok_or("Could not determine Movies directory")?;

    // New default location for Screenforge.
    // Existing recordings under ~/Movies/Open ScreenStudio/ remain openable via the file picker.
    let projects_dir = movies_dir.join("Screenforge");
    
    // Create the directory if it doesn't exist
    if !projects_dir.exists() {
        fs::create_dir_all(&projects_dir)
            .map_err(|e| format!("Failed to create projects directory: {}", e))?;
    }
    
    Ok(projects_dir)
}

/// Generate a project filename from the current timestamp
fn generate_project_filename() -> String {
    let now = Utc::now();
    format!("Recording {}.osp", now.format("%Y-%m-%d %H-%M-%S"))
}

/// Create a project from a raw recording bundle and save to default location
///
/// This converts a recording bundle (from /tmp) into a proper project,
/// copies it to the default projects directory (~/Movies/Screenforge/),
/// and returns the project with its saved path.
#[tauri::command]
pub async fn create_project_from_recording(
    state: State<'_, AppState>,
    recording_bundle_path: String,
) -> Result<(Project, String), String> {
    let temp_bundle_path = PathBuf::from(&recording_bundle_path);

    tracing::info!(
        "Creating project from recording bundle: {:?}",
        temp_bundle_path
    );

    // Verify the bundle exists
    if !temp_bundle_path.exists() {
        return Err(format!(
            "Recording bundle not found: {}",
            recording_bundle_path
        ));
    }

    // Find the recording directory (could be "recording" subdirectory or directly in bundle)
    let recording_dir = if temp_bundle_path.join("recording").exists() {
        temp_bundle_path.join("recording")
    } else {
        temp_bundle_path.clone()
    };

    // Verify video file exists
    let video_path = recording_dir.join("recording-0.mp4");
    if !video_path.exists() {
        return Err(format!("Video file not found in bundle: {:?}", video_path));
    }

    // Get video metadata for duration
    let video_metadata =
        crate::commands::recording::get_video_metadata(video_path.to_string_lossy().to_string())
            .await?;

    let duration_ms = video_metadata.duration_ms;

    // Check if webcam exists
    let webcam_path = recording_dir.join("recording-0-webcam.mp4");
    let has_webcam = webcam_path.exists();

    // Create default scene with timeline slices
    let screen_slice = Slice {
        id: Uuid::new_v4().to_string(),
        source_start_ms: 0.0,
        source_end_ms: duration_ms,
        time_scale: 1.0,
        volume: 1.0,
        hide_cursor: false,
        disable_cursor_smoothing: false,
    };

    let camera_slice = if has_webcam {
        Some(Slice {
            id: Uuid::new_v4().to_string(),
            source_start_ms: 0.0,
            source_end_ms: duration_ms,
            time_scale: 1.0,
            volume: 1.0,
            hide_cursor: false,
            disable_cursor_smoothing: false,
        })
    } else {
        None
    };

    // Create default layout
    let default_layout = Layout {
        id: Uuid::new_v4().to_string(),
        start_time: 0.0,
        end_time: duration_ms,
        layout_type: if has_webcam {
            LayoutType::ScreenWithCamera
        } else {
            LayoutType::ScreenOnly
        },
        camera_size: 0.25,
        camera_position: Point { x: 0.95, y: 0.95 },
    };

    // Combine screen and camera slices into a single slices list
    let mut slices = vec![screen_slice];
    if let Some(cam_slice) = camera_slice {
        slices.push(cam_slice);
    }

    let scene = Scene {
        id: Uuid::new_v4().to_string(),
        name: "Main".to_string(),
        scene_type: SceneType::Recording,
        session_index: 0,
        slices,
        zoom_ranges: Vec::new(),
        layouts: vec![default_layout],
    };

    // Generate project name from timestamp
    let project_name = generate_project_filename().replace(".osp", "");

    // Create the project
    let mut config = ProjectConfig::default();
    config.recording_range = (0.0, duration_ms);
    config.camera.enabled = has_webcam;

    let project = Project {
        id: Uuid::new_v4().to_string(),
        name: project_name.clone(),
        created_at: Utc::now(),
        config,
        scenes: vec![scene],
    };

    // Determine the destination path in default projects directory
    let projects_dir = get_projects_directory()?;
    let dest_path = projects_dir.join(generate_project_filename());

    tracing::info!("Saving project to: {:?}", dest_path);

    // Create destination directory
    if !dest_path.exists() {
        fs::create_dir_all(&dest_path)
            .map_err(|e| format!("Failed to create project directory: {}", e))?;
    }

    // Copy all files from temp bundle to destination
    copy_dir_contents(&temp_bundle_path, &dest_path)
        .map_err(|e| format!("Failed to copy bundle: {}", e))?;

    // Write project.json to the destination
    bundle::write_project(&project, &dest_path)
        .map_err(|e| format!("Failed to write project: {}", e))?;

    // Store in app state - project is now saved
    {
        let mut current_project = state.current_project.lock().await;
        *current_project = Some(project.clone());
    }
    {
        let mut saved_path = state.current_project_path.lock().await;
        *saved_path = Some(dest_path.clone());
    }
    {
        // Clear temp path since we're now at a permanent location
        let mut temp_path = state.temp_bundle_path.lock().await;
        *temp_path = None;
    }

    let dest_path_str = dest_path.to_string_lossy().to_string();
    tracing::info!("Project '{}' saved to {}", project.name, dest_path_str);

    Ok((project, dest_path_str))
}

/// Save project to a specific path (for Save As / first Save)
///
/// Copies the entire bundle directory to the destination if it's different from the source.
#[tauri::command]
pub async fn save_project_to_path(
    state: State<'_, AppState>,
    dest_path: String,
) -> Result<(), String> {
    let dest = PathBuf::from(&dest_path);

    // Get current project
    let project = {
        let proj = state.current_project.lock().await;
        proj.clone().ok_or("No project currently open")?
    };

    // Determine source path (either temp or previously saved location)
    let source_path = {
        let saved = state.current_project_path.lock().await;
        let temp = state.temp_bundle_path.lock().await;
        saved.clone().or_else(|| temp.clone())
    }
    .ok_or("No source bundle path found")?;

    tracing::info!(
        "Saving project to {:?} (source: {:?})",
        dest,
        source_path
    );

    // If destination is different from source, copy the entire bundle
    if dest != source_path {
        // Create destination directory
        if !dest.exists() {
            fs::create_dir_all(&dest)
                .map_err(|e| format!("Failed to create destination directory: {}", e))?;
        }

        // Copy all files from source to destination
        copy_dir_contents(&source_path, &dest)
            .map_err(|e| format!("Failed to copy bundle: {}", e))?;
    }

    // Update project.json with current project state and timestamp
    // Note: We don't have an updated_at field in Project, but we update meta.json via bundle::write_project
    bundle::write_project(&project, &dest)
        .map_err(|e| format!("Failed to write project: {}", e))?;

    // Update app state with new saved path
    {
        let mut saved_path = state.current_project_path.lock().await;
        *saved_path = Some(dest.clone());
    }

    // Clear temp path since we now have a saved location
    {
        let mut temp_path = state.temp_bundle_path.lock().await;
        *temp_path = None;
    }

    tracing::info!("Project saved successfully to {:?}", dest);

    Ok(())
}

/// Auto-save the current project in place
/// This is called automatically after any edit - no user action required
#[tauri::command]
pub async fn auto_save_project(state: State<'_, AppState>) -> Result<(), String> {
    let saved_path = {
        let path = state.current_project_path.lock().await;
        path.clone()
    };

    let saved_path = saved_path.ok_or("Project has no saved path - cannot auto-save")?;

    let project = {
        let proj = state.current_project.lock().await;
        proj.clone().ok_or("No project currently open")?
    };

    tracing::debug!("Auto-saving project to {:?}", saved_path);

    bundle::write_project(&project, &saved_path)
        .map_err(|e| format!("Failed to auto-save project: {}", e))?;

    tracing::debug!("Project auto-saved successfully");

    Ok(())
}

/// Update the current project in app state
#[tauri::command]
pub async fn update_project(
    state: State<'_, AppState>,
    project: Project,
) -> Result<(), String> {
    let mut current = state.current_project.lock().await;
    *current = Some(project);
    Ok(())
}

/// Helper function to recursively copy directory contents
fn copy_dir_contents(src: &PathBuf, dst: &PathBuf) -> std::io::Result<()> {
    if !dst.exists() {
        fs::create_dir_all(dst)?;
    }

    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let file_type = entry.file_type()?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());

        if file_type.is_dir() {
            copy_dir_contents(&src_path, &dst_path)?;
        } else {
            fs::copy(&src_path, &dst_path)?;
        }
    }

    Ok(())
}
