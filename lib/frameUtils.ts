/**
 * Capture a single frame from a video element.
 * Downscales to targetWidth at JPEG quality for fast API payloads.
 * Returns null if video is not ready or if the frame is too blurry (blur gate).
 */
export function captureFrame(
  video: HTMLVideoElement,
  targetWidth = 320,
  quality = 0.65
): string | null {
  if (!video || video.readyState < 2) return null;

  const canvas = document.createElement('canvas');
  const ar = video.videoHeight / video.videoWidth;
  canvas.width  = targetWidth;
  canvas.height = Math.round(targetWidth * (ar || 0.5625));

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  // ── Adaptive Blur gate: Laplacian variance ────────────────────────────────
  // Sample a small central region rather than the full image for speed.
  const sampleW = 80, sampleH = 60;
  const sx = Math.floor((canvas.width  - sampleW) / 2);
  const sy = Math.floor((canvas.height - sampleH) / 2);
  const imgData = ctx.getImageData(sx, sy, sampleW, sampleH).data;

  let sum = 0, sumSq = 0, n = 0;
  for (let i = 0; i < imgData.length; i += 16) {
    // Convert to greyscale using luminance coefficients
    const grey = 0.299 * imgData[i] + 0.587 * imgData[i + 1] + 0.114 * imgData[i + 2];
    sum   += grey;
    sumSq += grey * grey;
    n++;
  }
  
  const mean = sum / n;
  const variance = sumSq / n - mean * mean;

  /**
   * Adaptive Thresholding:
   * In low light (mean < 50), high ISO noise can fake variance.
   * In bright light, we want a strict threshold.
   * Baseline threshold is 60. If dark, we relax it to 30.
   */
  const brightnessFactor = Math.max(0.5, Math.min(1.0, mean / 100));
  const adaptiveThreshold = 60 * brightnessFactor;

  if (variance < adaptiveThreshold) {
    console.warn(`[BlurGate] Frame dropped: var=${variance.toFixed(1)} < thresh=${adaptiveThreshold.toFixed(1)} (mean=${mean.toFixed(1)})`);
    return null;
  }
  // ──────────────────────────────────────────────────────────────────────────

  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  return dataUrl.split(',')[1]; // base64 only
}
