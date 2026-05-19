/**
 * WebcamOverlay - Renders the webcam video overlay on top of the screen recording preview
 *
 * Displays the webcam video based on the current layout configuration.
 * Supports multiple layout types: screen-with-camera, camera-only, side-by-side, screen-only
 */

import { useRef, useEffect, useState, useMemo } from "react";
import type { Layout } from "../../types/project";
import {
  calculateLayoutPositions,
  lerpCameraRect,
} from "../../utils/layoutUtils";

interface WebcamOverlayProps {
  webcamSrc: string;
  currentTimeMs: number;
  isPlaying: boolean;
  videoWidth: number;
  videoHeight: number;
  containerWidth: number;
  containerHeight: number;
  /** Current layout (optional - uses default if not provided) */
  currentLayout?: Layout | null;
  /** Next layout — when set, the overlay tweens between `currentLayout` and `nextLayout`. */
  nextLayout?: Layout | null;
  /** Transition progress in [0..1]. 0 = fully current, 1 = fully next. */
  transitionProgress?: number;
  /** Opacity multiplier (used to crossfade camera visibility across type changes). */
  opacity?: number;
  /** Corner radius as percentage of webcam width (default 0.08 = 8%) */
  cornerRadius?: number;
}

/**
 * Calculate the scale factor to fit video in container while maintaining aspect ratio
 */
function calculateVideoScale(
  videoWidth: number,
  videoHeight: number,
  containerWidth: number,
  containerHeight: number,
): { scale: number; offsetX: number; offsetY: number } {
  if (videoWidth === 0 || videoHeight === 0) {
    return { scale: 1, offsetX: 0, offsetY: 0 };
  }

  const scaleX = containerWidth / videoWidth;
  const scaleY = containerHeight / videoHeight;
  const scale = Math.min(scaleX, scaleY);

  // Center the video in the container
  const scaledWidth = videoWidth * scale;
  const scaledHeight = videoHeight * scale;
  const offsetX = (containerWidth - scaledWidth) / 2;
  const offsetY = (containerHeight - scaledHeight) / 2;

  return { scale, offsetX, offsetY };
}

export function WebcamOverlay({
  webcamSrc,
  currentTimeMs,
  isPlaying,
  videoWidth,
  videoHeight,
  containerWidth,
  containerHeight,
  currentLayout,
  nextLayout,
  transitionProgress = 0,
  opacity = 1,
  cornerRadius = 0.08,
}: WebcamOverlayProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [webcamDimensions, setWebcamDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);

  // Sync webcam playback with main video
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const targetTime = currentTimeMs / 1000;
    const diff = Math.abs(video.currentTime - targetTime);

    // Only sync if difference is significant (> 100ms)
    if (diff > 0.1) {
      video.currentTime = targetTime;
    }
  }, [currentTimeMs]);

  // Handle play/pause sync
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.play().catch(() => {
        // Ignore play errors (e.g., user hasn't interacted yet)
      });
    } else {
      video.pause();
    }
  }, [isPlaying]);

  // Get webcam dimensions when loaded
  const handleLoadedMetadata = () => {
    const video = videoRef.current;
    if (video) {
      setWebcamDimensions({
        width: video.videoWidth,
        height: video.videoHeight,
      });
    }
  };

  // Calculate positioning based on video scale
  const { scale, offsetX, offsetY } = calculateVideoScale(
    videoWidth,
    videoHeight,
    containerWidth,
    containerHeight,
  );

  // Get the scaled video dimensions
  const scaledVideoWidth = videoWidth * scale;
  const scaledVideoHeight = videoHeight * scale;

  // Calculate layout positions within the scaled video area. If a next layout
  // is provided with a positive transition progress, lerp the camera rect.
  const layoutInfo = useMemo(() => {
    const current = calculateLayoutPositions(
      currentLayout ?? null,
      scaledVideoWidth,
      scaledVideoHeight,
    );
    if (!nextLayout || transitionProgress <= 0) {
      return current;
    }
    const next = calculateLayoutPositions(
      nextLayout,
      scaledVideoWidth,
      scaledVideoHeight,
    );
    return {
      ...current,
      camera: lerpCameraRect(current.camera, next.camera, transitionProgress),
    };
  }, [currentLayout, nextLayout, transitionProgress, scaledVideoWidth, scaledVideoHeight]);

  // If the camera is fully invisible (no visibility AND no opacity remaining), bail.
  if (!layoutInfo.camera.visible && opacity <= 0) {
    return null;
  }

  // Calculate webcam size and position
  const webcamWidth = layoutInfo.camera.width;
  const webcamHeight = layoutInfo.camera.height;

  // Adjust for webcam's actual aspect ratio if available
  let adjustedHeight = webcamHeight;
  if (
    webcamDimensions &&
    layoutInfo.layoutType !== "side-by-side" &&
    layoutInfo.layoutType !== "camera-only"
  ) {
    const webcamAspectRatio = webcamDimensions.width / webcamDimensions.height;
    adjustedHeight = webcamWidth / webcamAspectRatio;
  }

  // Final position (add container offset for centering)
  const webcamX = offsetX + layoutInfo.camera.x;
  const webcamY = offsetY + layoutInfo.camera.y;

  // Calculate border radius (only for PiP, not side-by-side or fullscreen)
  const showRoundedCorners = layoutInfo.layoutType === "screen-with-camera";
  const borderRadius = showRoundedCorners ? webcamWidth * cornerRadius : 0;

  // Different styling for different layout types
  const isFillMode =
    layoutInfo.layoutType === "camera-only" ||
    layoutInfo.layoutType === "side-by-side";

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      <video
        ref={videoRef}
        src={webcamSrc}
        muted
        playsInline
        onLoadedMetadata={handleLoadedMetadata}
        className={`absolute transition-all duration-300 ease-out ${
          isFillMode ? "object-cover" : "object-cover"
        }`}
        style={{
          left: webcamX,
          top: webcamY,
          width: webcamWidth,
          height: isFillMode ? webcamHeight : adjustedHeight,
          borderRadius: borderRadius,
          opacity: Math.max(0, Math.min(1, opacity)),
          boxShadow: showRoundedCorners
            ? "0 4px 20px rgba(0, 0, 0, 0.4)"
            : "none",
        }}
      >
        <track kind="captions" />
      </video>
    </div>
  );
}

export default WebcamOverlay;
