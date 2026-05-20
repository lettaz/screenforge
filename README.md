# Screenforge

**Beautiful, batteries-included screen recordings.**

Screenforge is a community fork of [`crafter-station/open-screenstudio`](https://github.com/crafter-station/open-screenstudio)
that takes the solid Tauri 2 + Rust + React foundation and ships the long tail
of features from the upstream roadmap so the editor is genuinely useful
day-to-day.

All upstream commit history is preserved — this fork is purely additive.

---

## What this fork adds on top of upstream

Every item below corresponds to an open issue on upstream at the time the
fork was taken. Each became its own commit on this branch — see
`git log --oneline` for the exact ordering.

### Branding & visuals

| Feature | Upstream | Status |
|---|---|---|
| Background / padding / corner radius / shadow panel | [#6](https://github.com/crafter-station/open-screenstudio/issues/6) | Shipped — live preview, auto-saved |
| Preset system (save / apply / export / import JSON) | [#24](https://github.com/crafter-station/open-screenstudio/issues/24) | Shipped — 5 built-in presets + user library |
| Click highlight effects (ripple / pulse / square + sound) | [#23](https://github.com/crafter-station/open-screenstudio/issues/23) | Shipped — fully configurable, click sound supported |
| On-screen keystroke overlay | [#16](https://github.com/crafter-station/open-screenstudio/issues/16) | Shipped — auto-renders from input channel |
| Smooth transitions between dynamic layouts | [#19](https://github.com/crafter-station/open-screenstudio/issues/19) | Shipped — eased crossfades + position tween |

### Editing

| Feature | Upstream | Status |
|---|---|---|
| Auto speed-up typing segments | [#18](https://github.com/crafter-station/open-screenstudio/issues/18) | Shipped — detects typing bursts, per-window speed |
| Sensitive data masking (blur / pixelate / solid) | [#21](https://github.com/crafter-station/open-screenstudio/issues/21) | Preview-complete · ffmpeg export burn-in tracked as TODO in `start_export_with_edits` |

### Recording-adjacent

| Feature | Upstream | Status |
|---|---|---|
| Floating teleprompter excluded from capture | [#28](https://github.com/crafter-station/open-screenstudio/issues/28) | Shipped — `NSWindowSharingNone` on macOS |
| Create project from existing video file | [#22](https://github.com/crafter-station/open-screenstudio/issues/22) | Shipped — mp4/mov/m4v/webm/mkv/avi via ffmpeg remux+fallback |

### Export

| Feature | Upstream | Status |
|---|---|---|
| Platform presets (YouTube 1080/4K, Twitter, Reels) + bitrate | [#8](https://github.com/crafter-station/open-screenstudio/issues/8) | Shipped — four new presets + custom bitrate cap |
| Optimized GIF export (palette + dither + loop) | [#29](https://github.com/crafter-station/open-screenstudio/issues/29) | Shipped — two-pass palette via filter graph |
| Copy exported file to clipboard | [#27](https://github.com/crafter-station/open-screenstudio/issues/27) | Shipped — macOS via `osascript` (other OSes pending) |
| Background music track (with fade in/out) | [#20](https://github.com/crafter-station/open-screenstudio/issues/20) | Shipped — preview + ffmpeg mix |
| Motion blur for cursor / scroll motion | [#17](https://github.com/crafter-station/open-screenstudio/issues/17) | Shipped — `tmix` at export time |

### Intentionally out of scope for this fork

Issues that need deep OS-level Rust work that has to be built and
code-signed on the user's machine were left for upstream:

- Multi-monitor / region capture polish (#2)
- iOS device mirroring (#5)
- App-specific system audio routing (#25)
- Hide desktop icons during recording (#26)

And two features that need additional infrastructure:

- AI captions / transcription (#14) — needs external model + API
- Cloud uploads / shareable links (#15) — needs a deployed backend

---

## What upstream already shipped (and we kept)

- Tauri 2 + Rust + React + Zustand architecture
- ScreenCaptureKit-based macOS screen capture
- Webcam + microphone + system audio capture
- Cursor smoothing (spring-based) + cursor overlay
- Timeline with slices, zoom ranges, layouts
- Auto-save project persistence (`.osp` bundle format)
- Export pipeline with edits (trim / cut / speed)
- Keyboard shortcuts for splitting / trimming / navigation

---

## Try it locally

### Requirements

| Platform | Requirement |
|----------|-------------|
| **macOS** | Xcode 16.2+ (macOS 15.2 SDK), Rust toolchain, Bun or npm |
| **Windows** | Visual Studio 2022 with C++ tools, Rust toolchain, Bun or npm |

### Run

```bash
npm install     # or bun install
npm run tauri:dev
```

### Build

```bash
npm run tauri:build
```

The output app bundle lives under `src-tauri/target/release/bundle/`.

---

## Acknowledgments

This fork stands entirely on
[`crafter-station/open-screenstudio`](https://github.com/crafter-station/open-screenstudio).
The architecture, recording pipeline, cursor smoothing, and editor foundation
are all theirs — this fork only adds the feature surface on top.

If upstream resumes active development, contributions from this fork are
welcome to flow back.

## License

MIT — same as upstream.
