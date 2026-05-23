/**
 * frameUtils.ts — T2: Persistent Off-Screen Canvas
 *
 * Eliminates the per-frame `document.createElement('canvas')` allocation.
 * The capture canvas is a module-level singleton, reused every frame.
 * `willReadFrequently: true` keeps the pixel buffer CPU-accessible,
 * avoiding a GPU→CPU readback stall on every getImageData call.
 */

let _captureCanvas: HTMLCanvasElement | null = null;
let _captureCtx: CanvasRenderingContext2D | null = null;

function getCaptureContext(width: number, height: number): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') return null;
  if (!_captureCanvas) {
    _captureCanvas = document.createElement('canvas');
    _captureCtx = _captureCanvas.getContext('2d', { willReadFrequently: true }) ?? null;
  }
  if (_captureCanvas.width !== width)  _captureCanvas.width  = width;
  if (_captureCanvas.height !== height) _captureCanvas.height = height;
  return _captureCtx;
}

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

  const ar     = video.videoHeight / video.videoWidth;
  const width  = targetWidth;
  const height = Math.round(targetWidth * (ar || 0.5625));

  const ctx = getCaptureContext(width, height);
  if (!ctx || !_captureCanvas) return null;

  ctx.drawImage(video, 0, 0, width, height);

  // ── Adaptive Blur gate: Laplacian variance ────────────────────────────────
  const sampleW = 80, sampleH = 60;
  const sx = Math.floor((width  - sampleW) / 2);
  const sy = Math.floor((height - sampleH) / 2);
  const imgData = ctx.getImageData(sx, sy, sampleW, sampleH).data;

  let sum = 0, sumSq = 0, n = 0;
  for (let i = 0; i < imgData.length; i += 16) {
    const grey = 0.299 * imgData[i] + 0.587 * imgData[i + 1] + 0.114 * imgData[i + 2];
    sum   += grey;
    sumSq += grey * grey;
    n++;
  }

  const mean     = sum / n;
  const variance = sumSq / n - mean * mean;

  const brightnessFactor   = Math.max(0.5, Math.min(1.0, mean / 100));
  const adaptiveThreshold  = 60 * brightnessFactor;

  if (variance < adaptiveThreshold) {
    console.warn(`[BlurGate] Frame dropped: var=${variance.toFixed(1)} < thresh=${adaptiveThreshold.toFixed(1)} (mean=${mean.toFixed(1)})`);
    return null;
  }
  // ──────────────────────────────────────────────────────────────────────────

  const dataUrl = _captureCanvas.toDataURL('image/jpeg', quality);
  return dataUrl.split(',')[1]; // base64 only
}
