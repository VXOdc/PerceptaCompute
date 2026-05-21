/**
 * Capture a single frame from a video element.
 * Downscales to targetWidth at JPEG quality for fast API payloads.
 */
export function captureFrame(
  video: HTMLVideoElement,
  targetWidth = 320,
  quality = 0.6
): string | null {
  if (!video || video.readyState < 2) return null;

  const canvas = document.createElement('canvas');
  const aspectRatio = video.videoHeight / video.videoWidth;
  canvas.width = targetWidth;
  canvas.height = Math.round(targetWidth * (aspectRatio || 0.5625));

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  return dataUrl.split(',')[1]; // base64 only, no prefix
}
