# Screenforge

**Beautiful, batteries-included screen recordings.**

Screenforge is a community fork of [`crafter-station/open-screenstudio`](https://github.com/crafter-station/open-screenstudio) that takes the
solid Tauri + Rust + React foundation and ships the long tail of features from
the upstream roadmap so the editor is genuinely useful day-to-day.

All upstream commit history is preserved — this fork is purely additive.

---

## What this fork adds on top of upstream

Every issue below was open on upstream when the fork was taken. Each one
became its own commit on this branch (see `git log --oneline`).

### Branding & visuals

- **Styling panel** (`#6`) — background (solid / gradient / image), padding, corner radius, drop shadow, all editable live in the editor with the existing `ProjectConfig` schema.
- **Preset system** (`#24`) — save the current styling as a JSON preset, browse a library, apply with one click, export / import preset files.
- **Customizable click ripples** (`#23`) — ripple / pulse / square highlight, color picker, size, duration, optional click sound (mp3).
- **On-screen keystroke overlay** (`#16`) — `⌘ + ⇧ + K` style chips render from the recorded keystroke channel during playback and export.
- **Dynamic camera layouts** (`#19`) — smooth tween transitions between `screen-only`, `camera-only`, `screen-with-camera`, `side-by-side`.

### Editing

- **Auto speed-up typing segments** (`#18`) — detects dense typing windows from the recorded keystrokes and proposes `timeScale` slices you can accept individually.
- **Blur / redaction regions** (`#21`) — draw rectangles on the preview, set a time range, applied during export.

### Recording-adjacent

- **Floating teleprompter** (`#28`) — separate transparent window, excluded from capture, with auto-scroll and manual scroll.
- **Project import from existing video** (`#22`) — pick an mp4 and get a project with full styling (no cursor data, as expected).

### Export

- **Platform export presets** (`#8`) — YouTube 1080p / 4K, Twitter 720p, Instagram 9:16, plus custom bitrate.
- **Optimized GIF export** (`#29`) — ffmpeg two-pass palette + dithering options + loop count + estimated file size.
- **Copy to clipboard** (`#27`) — post-export action, macOS via `osascript`.
- **Background music track** (`#20`) — pick an audio file, set volume + fade, mixed into the final render.
- **Motion blur** (`#17`) — optional cursor motion blur during export.

### Out of scope for this fork

Issues that need OS-level Rust work that has to be built and code-signed on
the user's machine (multi-monitor region capture, iOS mirroring, app-specific
system audio, hide-desktop-icons) are intentionally left for upstream.
AI captions (`#14`) and cloud uploads (`#15`) need external infra and are also
deferred.

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

## Development

### Requirements

| Platform | Requirement |
|----------|-------------|
| **macOS** | Xcode 16.2+ (macOS 15.2 SDK), Rust toolchain, Bun |
| **Windows** | Visual Studio 2022 with C++ tools, Rust toolchain, Bun |

### Run

```bash
bun install
bun run tauri:dev
```

### Build

```bash
bun run tauri:build
```

---

## Acknowledgments

This fork stands entirely on [`crafter-station/open-screenstudio`](https://github.com/crafter-station/open-screenstudio).
The architecture, recording pipeline, cursor smoothing, and editor foundation
are all theirs. This fork only adds the feature surface on top.

If upstream resumes active development, contributions from this fork are
welcome to flow back.

## License

MIT — same as upstream.
