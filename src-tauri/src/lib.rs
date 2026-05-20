//! Screenforge — beautiful, batteries-included screen recordings.
//!
//! This is the main library crate for the Screenforge desktop application.
//! Forked and extended from open-screenstudio. Adds branding presets,
//! click ripples, keystroke overlay, teleprompter, blur masks, background
//! music, optimized GIF/clipboard export, motion blur, and more.

pub mod capture;
pub mod commands;
pub mod export;
pub mod processing;
pub mod project;
pub mod recorder;
pub mod utils;

use commands::export::ExportState;
use commands::project::AppState;
use commands::recording::RecorderState;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

/// Initialize the application
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize tracing/logging
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "open_screenstudio=debug,tauri=info".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    tracing::info!("Starting Screenforge v{}", env!("CARGO_PKG_VERSION"));

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(RecorderState::default())
        .manage(ExportState::default())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            // Project commands
            commands::project::create_project,
            commands::project::open_project,
            commands::project::save_project,
            commands::project::get_project,
            commands::project::get_project_path,
            commands::project::get_default_projects_dir,
            commands::project::create_project_from_recording,
            commands::project::create_project_from_video,
            commands::project::save_project_to_path,
            commands::project::auto_save_project,
            commands::project::update_project,
            // System commands
            commands::system::get_system_info,
            commands::system::copy_file_to_clipboard,
            // Recording commands
            commands::recording::get_displays,
            commands::recording::get_audio_devices,
            commands::recording::get_cameras,
            commands::recording::check_system_audio_available,
            commands::recording::check_screen_permission,
            commands::recording::request_screen_permission,
            commands::recording::check_camera_permission,
            commands::recording::request_camera_permission,
            commands::recording::start_recording,
            commands::recording::stop_recording,
            commands::recording::pause_recording,
            commands::recording::resume_recording,
            commands::recording::get_recording_state,
            commands::recording::get_recording_duration,
            commands::recording::get_video_metadata,
            commands::recording::load_recording_bundle,
            // Processing commands
            commands::processing::smooth_cursor,
            commands::processing::process_cursor_smoothing,
            commands::processing::get_default_spring_config,
            // Window commands
            commands::window::open_editor_window,
            commands::window::close_toolbar_window,
            commands::window::set_toolbar_visible,
            commands::window::get_window_label,
            commands::window::minimize_toolbar,
            commands::window::restore_toolbar,
            commands::window::open_teleprompter_window,
            commands::window::hide_teleprompter_window,
            // Export commands
            commands::export::start_export,
            commands::export::cancel_export,
            commands::export::is_exporting,
        ])
        .setup(|app| {
            // Set up transparent background for toolbar window on macOS
            #[cfg(target_os = "macos")]
            {
                #[allow(deprecated)]
                {
                    use cocoa::appkit::NSWindow;
                    use cocoa::base::id;
                    use tauri::Manager;
                    
                    if let Some(window) = app.get_webview_window("toolbar") {
                        if let Ok(ns_window) = window.ns_window() {
                            unsafe {
                                let ns_window = ns_window as id;
                                // Make sure window background is transparent and no shadow
                                ns_window.setOpaque_(cocoa::base::NO);
                                ns_window.setHasShadow_(cocoa::base::NO);
                            }
                        }
                    }
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
