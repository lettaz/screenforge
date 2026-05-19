//! Project schema definitions
//!
//! These types match the TypeScript definitions and the project file format
//! defined in TECHNICAL_PLAN.md

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

// =============================================================================
// Meta Types
// =============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectMeta {
    pub version: String,
    pub format: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl Default for ProjectMeta {
    fn default() -> Self {
        let now = Utc::now();
        Self {
            version: env!("CARGO_PKG_VERSION").to_string(),
            format: "osp-v1".to_string(),
            created_at: now,
            updated_at: now,
        }
    }
}

// =============================================================================
// Background Types
// =============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Point {
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GradientStop {
    pub color: String,
    pub at: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GradientConfig {
    pub start: Point,
    pub end: Point,
    pub stops: Vec<GradientStop>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum Background {
    Solid { color: String },
    Gradient { gradient: GradientConfig },
    Image { image_url: String },
}

impl Default for Background {
    fn default() -> Self {
        Background::Gradient {
            gradient: GradientConfig {
                start: Point { x: 0.0, y: 0.0 },
                end: Point { x: 1.0, y: 1.0 },
                stops: vec![
                    GradientStop {
                        color: "#3F37C9".to_string(),
                        at: 0.0,
                    },
                    GradientStop {
                        color: "#8C87DF".to_string(),
                        at: 1.0,
                    },
                ],
            },
        }
    }
}

// =============================================================================
// Shadow Types
// =============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShadowConfig {
    pub intensity: f64,
    pub angle: f64,
    pub distance: f64,
    pub blur: f64,
}

impl Default for ShadowConfig {
    fn default() -> Self {
        Self {
            intensity: 0.75,
            angle: 90.0,
            distance: 25.0,
            blur: 20.0,
        }
    }
}

// =============================================================================
// Cursor Types
// =============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpringConfig {
    pub stiffness: f64,
    pub damping: f64,
    pub mass: f64,
}

impl Default for SpringConfig {
    fn default() -> Self {
        Self {
            stiffness: 470.0,
            damping: 70.0,
            mass: 3.0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CursorSmoothingConfig {
    pub enabled: bool,
    pub spring: SpringConfig,
}

impl Default for CursorSmoothingConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            spring: SpringConfig::default(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CursorConfig {
    pub size: f64,
    pub smoothing: CursorSmoothingConfig,
    pub hide_after_ms: Option<u64>,
}

impl Default for CursorConfig {
    fn default() -> Self {
        Self {
            size: 1.5,
            smoothing: CursorSmoothingConfig::default(),
            hide_after_ms: None,
        }
    }
}

// =============================================================================
// Camera Types
// =============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum CameraPosition {
    TopLeft,
    TopRight,
    BottomLeft,
    BottomRight,
    Custom,
}

impl Default for CameraPosition {
    fn default() -> Self {
        Self::BottomRight
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CameraConfig {
    pub enabled: bool,
    pub position: CameraPosition,
    pub size: f64,
    pub roundness: f64,
    pub mirror: bool,
}

impl Default for CameraConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            position: CameraPosition::default(),
            size: 0.35,
            roundness: 0.25,
            mirror: false,
        }
    }
}

// =============================================================================
// Click Effects Types
// =============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ClickEffectStyle {
    Ripple,
    Pulse,
    Square,
}

impl Default for ClickEffectStyle {
    fn default() -> Self {
        Self::Ripple
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClickEffectsConfig {
    pub enabled: bool,
    pub style: ClickEffectStyle,
    pub color_left: String,
    pub color_right: String,
    pub size: f64,
    pub duration_ms: f64,
    pub sound_enabled: bool,
    pub sound_url: Option<String>,
    pub sound_volume: f64,
}

impl Default for ClickEffectsConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            style: ClickEffectStyle::default(),
            color_left: "#3B82F6".to_string(),
            color_right: "#EF4444".to_string(),
            size: 1.0,
            duration_ms: 500.0,
            sound_enabled: false,
            sound_url: None,
            sound_volume: 0.6,
        }
    }
}

// =============================================================================
// Keystrokes Overlay Types
// =============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum KeystrokesOverlayPosition {
    Top,
    Bottom,
    Center,
}

impl Default for KeystrokesOverlayPosition {
    fn default() -> Self {
        Self::Bottom
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum KeystrokesOverlayTheme {
    Dark,
    Light,
}

impl Default for KeystrokesOverlayTheme {
    fn default() -> Self {
        Self::Dark
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeystrokesOverlayConfig {
    pub enabled: bool,
    pub position: KeystrokesOverlayPosition,
    pub theme: KeystrokesOverlayTheme,
    pub visible_duration_ms: f64,
    pub max_chips: u32,
}

impl Default for KeystrokesOverlayConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            position: KeystrokesOverlayPosition::default(),
            theme: KeystrokesOverlayTheme::default(),
            visible_duration_ms: 1500.0,
            max_chips: 8,
        }
    }
}

// =============================================================================
// Audio Types
// =============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioConfig {
    pub system_volume: f64,
    pub microphone_volume: f64,
    pub enhance_microphone: bool,
}

impl Default for AudioConfig {
    fn default() -> Self {
        Self {
            system_volume: 1.0,
            microphone_volume: 1.0,
            enhance_microphone: true,
        }
    }
}

// =============================================================================
// Project Config
// =============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Padding {
    pub top: f64,
    pub right: f64,
    pub bottom: f64,
    pub left: f64,
}

impl Default for Padding {
    fn default() -> Self {
        Self {
            top: 0.0,
            right: 0.0,
            bottom: 0.0,
            left: 0.0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AspectRatio {
    pub x: u32,
    pub y: u32,
}

impl Default for AspectRatio {
    fn default() -> Self {
        Self { x: 16, y: 9 }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectConfig {
    pub background: Background,
    pub padding: Padding,
    pub shadow: ShadowConfig,
    pub cursor: CursorConfig,
    pub camera: CameraConfig,
    pub audio: AudioConfig,
    pub recording_range: (f64, f64),
    pub output_aspect_ratio: AspectRatio,
    /// Corner radius for the screen frame, in pixels (added in Screenforge v0.2).
    /// `#[serde(default)]` keeps older project files loadable.
    #[serde(default)]
    pub screen_radius: f64,
    /// Click highlight effect config (added in Screenforge v0.2).
    #[serde(default)]
    pub click_effects: ClickEffectsConfig,
    /// On-screen keystrokes overlay config (added in Screenforge v0.2).
    #[serde(default)]
    pub keystrokes_overlay: KeystrokesOverlayConfig,
}

impl Default for ProjectConfig {
    fn default() -> Self {
        Self {
            background: Background::default(),
            padding: Padding::default(),
            shadow: ShadowConfig::default(),
            cursor: CursorConfig::default(),
            camera: CameraConfig::default(),
            audio: AudioConfig::default(),
            recording_range: (0.0, 0.0),
            output_aspect_ratio: AspectRatio::default(),
            screen_radius: 16.0,
            click_effects: ClickEffectsConfig::default(),
            keystrokes_overlay: KeystrokesOverlayConfig::default(),
        }
    }
}

// =============================================================================
// Scene Types
// =============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Slice {
    pub id: String,
    pub source_start_ms: f64,
    pub source_end_ms: f64,
    pub time_scale: f64,
    pub volume: f64,
    pub hide_cursor: bool,
    pub disable_cursor_smoothing: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ZoomType {
    FollowCursor,
    FollowClicks,
    Manual,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ZoomRange {
    pub id: String,
    pub start_time: f64,
    pub end_time: f64,
    pub zoom: f64,
    #[serde(rename = "type")]
    pub zoom_type: ZoomType,
    pub target_point: Option<Point>,
    pub snap_to_edges: f64,
    pub instant: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum LayoutType {
    ScreenOnly,
    CameraOnly,
    ScreenWithCamera,
    SideBySide,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Layout {
    pub id: String,
    pub start_time: f64,
    pub end_time: f64,
    #[serde(rename = "type")]
    pub layout_type: LayoutType,
    pub camera_size: f64,
    pub camera_position: Point,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SceneType {
    Recording,
    Title,
    Transition,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Scene {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub scene_type: SceneType,
    pub session_index: usize,
    /// @deprecated Use screen_slices instead
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub slices: Vec<Slice>,
    pub screen_slices: Vec<Slice>,
    pub camera_slices: Vec<Slice>,
    pub zoom_ranges: Vec<ZoomRange>,
    pub layouts: Vec<Layout>,
}

// =============================================================================
// Project
// =============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub name: String,
    pub created_at: DateTime<Utc>,
    pub config: ProjectConfig,
    pub scenes: Vec<Scene>,
}

impl Project {
    /// Create a new project with default configuration
    pub fn new(name: String) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            name,
            created_at: Utc::now(),
            config: ProjectConfig::default(),
            scenes: Vec::new(),
        }
    }
}

// =============================================================================
// Marker Types
// =============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Marker {
    pub id: String,
    pub time: f64,
    pub label: String,
    pub color: Option<String>,
}
