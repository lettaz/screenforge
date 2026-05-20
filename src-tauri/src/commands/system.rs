//! System-related Tauri commands
//!
//! Holds small platform-integration commands that don't fit elsewhere
//! (system info, clipboard, etc.)
//!
//! These commands provide system information like displays, audio devices, etc.

use serde::{Deserialize, Serialize};

/// Display information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DisplayInfo {
    pub id: u32,
    pub name: String,
    pub width: u32,
    pub height: u32,
    pub scale_factor: f64,
    pub is_primary: bool,
    pub refresh_rate: Option<u32>,
}

/// System information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemInfo {
    pub os: String,
    pub os_version: String,
    pub arch: String,
}

/// Get basic system information
#[tauri::command]
pub async fn get_system_info() -> Result<SystemInfo, String> {
    Ok(SystemInfo {
        os: std::env::consts::OS.to_string(),
        os_version: get_os_version(),
        arch: std::env::consts::ARCH.to_string(),
    })
}

fn get_os_version() -> String {
    #[cfg(target_os = "macos")]
    {
        // Try to get macOS version
        std::process::Command::new("sw_vers")
            .arg("-productVersion")
            .output()
            .ok()
            .and_then(|output| String::from_utf8(output.stdout).ok())
            .map(|s| s.trim().to_string())
            .unwrap_or_else(|| "Unknown".to_string())
    }
    
    #[cfg(target_os = "windows")]
    {
        // Try to get Windows version
        std::process::Command::new("cmd")
            .args(["/C", "ver"])
            .output()
            .ok()
            .and_then(|output| String::from_utf8(output.stdout).ok())
            .map(|s| s.trim().to_string())
            .unwrap_or_else(|| "Unknown".to_string())
    }
    
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        "Unknown".to_string()
    }
}

/// Copy a file reference to the system clipboard (Screenforge #27).
///
/// On macOS this uses AppleScript to put the file on the clipboard so it
/// pastes into apps that accept file drops (Slack, Mail, Finder, etc.). On
/// other platforms this returns an error — copying a file (vs file path)
/// is not portable.
#[tauri::command]
pub async fn copy_file_to_clipboard(path: String) -> Result<(), String> {
    if !std::path::Path::new(&path).exists() {
        return Err(format!("File not found: {}", path));
    }

    #[cfg(target_os = "macos")]
    {
        // AppleScript escapes: single quotes are illegal in a `-e` value
        // because the outer shell quoting is single-quoted; escape any
        // embedded double-quotes in the path.
        let safe = path.replace('"', "\\\"");
        let script = format!(
            "set the clipboard to (POSIX file \"{}\") as «class furl»",
            safe
        );
        let output = std::process::Command::new("osascript")
            .args(["-e", &script])
            .output()
            .map_err(|e| format!("Failed to invoke osascript: {}", e))?;
        if !output.status.success() {
            return Err(format!(
                "osascript failed: {}",
                String::from_utf8_lossy(&output.stderr)
            ));
        }
        return Ok(());
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = path;
        Err("File-to-clipboard is only supported on macOS in this build".to_string())
    }
}
