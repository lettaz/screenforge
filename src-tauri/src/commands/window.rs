//! Window management commands
//!
//! Commands for creating, managing, and switching between windows
//! (recording toolbar, editor, post-recording popup, etc.)

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

/// Open the editor window for a specific recording
#[tauri::command]
pub async fn open_editor_window(
    app: AppHandle,
    recording_path: Option<String>,
) -> Result<(), String> {
    // Check if editor window already exists
    if let Some(window) = app.get_webview_window("editor") {
        window.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }

    // Build the URL with optional recording path
    let url = match recording_path {
        Some(path) => format!("index.html?window=editor&recording={}", urlencoding::encode(&path)),
        None => "index.html?window=editor".to_string(),
    };

    // Create the editor window
    let _editor_window = WebviewWindowBuilder::new(
        &app,
        "editor",
        WebviewUrl::App(url.into()),
    )
    .title("Screenforge — Editor")
    .inner_size(1400.0, 900.0)
    .min_inner_size(1000.0, 700.0)
    .resizable(true)
    .decorations(true)
    .transparent(false)
    .center()
    .focused(true)
    .build()
    .map_err(|e| e.to_string())?;

    tracing::info!("Opened editor window");
    Ok(())
}

/// Close the recording toolbar window
#[tauri::command]
pub async fn close_toolbar_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("toolbar") {
        window.close().map_err(|e| e.to_string())?;
        tracing::info!("Closed toolbar window");
    }
    Ok(())
}

/// Show/hide the recording toolbar
#[tauri::command]
pub async fn set_toolbar_visible(app: AppHandle, visible: bool) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("toolbar") {
        if visible {
            window.show().map_err(|e| e.to_string())?;
        } else {
            window.hide().map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

/// Get the current window label
#[tauri::command]
pub fn get_window_label(window: tauri::Window) -> String {
    window.label().to_string()
}

/// Minimize the toolbar during recording
#[tauri::command]
pub async fn minimize_toolbar(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("toolbar") {
        window.minimize().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Restore the toolbar after recording
#[tauri::command]
pub async fn restore_toolbar(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("toolbar") {
        window.unminimize().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Open the teleprompter / speaker-notes window.
///
/// The window floats above other apps but is marked
/// `NSWindowSharingNone` on macOS so it is excluded from ScreenCaptureKit
/// captures. Notes typed into it never appear in recordings.
#[tauri::command]
pub async fn open_teleprompter_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("teleprompter") {
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }

    let window = WebviewWindowBuilder::new(
        &app,
        "teleprompter",
        WebviewUrl::App("index.html?window=teleprompter".into()),
    )
    .title("Screenforge — Teleprompter")
    .inner_size(480.0, 320.0)
    .min_inner_size(320.0, 200.0)
    .resizable(true)
    .decorations(true)
    .transparent(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .focused(true)
    .build()
    .map_err(|e| e.to_string())?;

    // On macOS, mark the window with NSWindowSharingNone (= 0) so it is
    // excluded from ScreenCaptureKit / built-in screen recording captures.
    //
    // AppKit assertion: `setSharingType:` (and any NSWindow mutation) MUST
    // run on the main thread. The Tauri command handler executes on a tokio
    // worker, so we marshal back to the main thread via run_on_main_thread.
    // Calling it from the worker thread previously crashed the entire app
    // with `-[NSWMWindowCoordinator performTransactionUsingBlock:]` brk 1.
    #[cfg(target_os = "macos")]
    {
        let window_clone = window.clone();
        window
            .run_on_main_thread(move || {
                if let Ok(ns_window) = window_clone.ns_window() {
                    let ptr: *mut objc2::runtime::AnyObject = ns_window.cast();
                    if !ptr.is_null() {
                        unsafe {
                            let _: () = objc2::msg_send![&*ptr, setSharingType: 0u64];
                        }
                    }
                }
            })
            .map_err(|e| e.to_string())?;
    }
    let _ = &window;

    tracing::info!("Opened teleprompter window");
    Ok(())
}

/// Hide the teleprompter window without destroying it (preserves typed notes).
#[tauri::command]
pub async fn hide_teleprompter_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("teleprompter") {
        window.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}
