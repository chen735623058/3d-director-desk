import type { CameraMotionSnapshot } from "./cameraMotion";
import { getCameraMotionPath, getCameraMotionSnapshot } from "./cameraMotion";
import { getAnimatedCameraFocusTarget } from "./cameraTarget";
import type { DirectorCameraShot, DirectorObject } from "./directorProject";
import { getCameraViewSnapshotFromShot } from "./cameraGeometry";

export function getCameraPlaybackSnapshot(
  camera: DirectorCameraShot,
  objects: DirectorObject[],
  progress: number
): CameraMotionSnapshot {
  const motionPath = getCameraMotionPath(camera);
  const base = motionPath.keyframes.length >= 2
    ? getCameraMotionSnapshot(camera, progress)
    : getCameraViewSnapshotFromShot(camera);
  const trackingTarget = getAnimatedCameraFocusTarget(camera, objects, progress);

  return trackingTarget ? { ...base, target: trackingTarget } : base;
}
