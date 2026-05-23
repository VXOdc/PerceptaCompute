/**
 * frame-worker.js — T1 + T3
 *
 * T1: Runs entirely off the main thread. Owns a persistent OffscreenCanvas.
 *     Accepts ImageBitmap objects via zero-copy Transferable postMessage.
 *     Manages the AdaptiveFrameScheduler feedback loop.
 *     Emits FRAME_READY only for frames that pass all gates.
 *
 * T3: Perceptual Frame Similarity Gate — Mean Absolute Difference (MAD)
 *     on downsampled luma. Suppresses Mistral API calls for static scenes
 *     (parked bikes, stationary pedestrians) while preserving local kinematic
 *     re-evaluation cadence. Forces re-inference after MAX_STALENESS_MS
 *     regardless of MAD to prevent tracking drift on stale detections.
 *
 * Loaded by Camera.tsx via: new Worker('/workers/frame-worker.js')
 * NOTE: This is a plain JS file (not TS) so it can be served from /public
 *       without a build step. The AdaptiveFrameScheduler logic is inlined
 *       here since workers cannot import from the Next.js module graph.
 */

// ─── Inlined AdaptiveFrameScheduler ──────────────────────────────────────────
class AdaptiveFrameScheduler {
  constructor(options) {
    this.options = options;
    this.intervalMs = options.minIntervalMs;
    this.consecutiveSlowFrames = 0;
  }

  observe(lastInferenceMs, queueDepth) {
    const overloaded = lastInferenceMs > this.options.targetLatencyMs || queueDepth > 1;
    if (overloaded) {
      this.consecutiveSlowFrames += 1;
      this.intervalMs = Math.min(this.options.maxIntervalMs, Math.round(this.intervalMs * 1.25));
    } else {
      this.consecutiveSlowFrames = 0;
      this.intervalMs = Math.max(this.options.minIntervalMs, Math.round(this.intervalMs * 0.92));
    }
    return {
      intervalMs: this.intervalMs,
      shouldDropFrame: this.consecutiveSlowFrames >= 3,
      reason: overloaded ? 'backpressure' : 'healthy',
    };
  }
}

// ─── Constants ────────────────────────────────────────────────────────────────
const MAD_THRESHOLD    = 6.0;   // Luma units — tune empirically
const MAX_STALENESS_MS = 2000;  // Force inference even if MAD below threshold

// ─── Worker State ─────────────────────────────────────────────────────────────
let canvas             = null;
let ctx                = null;
let scheduler          = null;
let previousLumaSamples = null;
let lastEmittedAt      = 0;
let lastForceEmitAt    = 0;
let currentIntervalMs  = 100;

// ─── Blur Gate ────────────────────────────────────────────────────────────────
function computeLaplacianVariance(data) {
  let sum = 0, sumSq = 0, n = 0;
  for (let i = 0; i < data.length; i += 16) {
    const grey = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    sum   += grey;
    sumSq += grey * grey;
    n++;
  }
  const mean     = sum / n;
  const variance = sumSq / n - mean * mean;
  const brightnessFactor  = Math.max(0.5, Math.min(1.0, mean / 100));
  const threshold         = 60 * brightnessFactor;
  return { variance, threshold, mean };
}

// ─── T3: MAD Similarity Gate ──────────────────────────────────────────────────
function extractLumaSamples(data) {
  const samples = new Uint8Array(Math.ceil(data.length / 16));
  let j = 0;
  for (let i = 0; i < data.length; i += 16) {
    samples[j++] = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
  }
  return samples;
}

function computeMAD(a, b) {
  const len = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < len; i++) sum += Math.abs(a[i] - b[i]);
  return sum / len;
}

// ─── Base64 encode without btoa char-limit issues ─────────────────────────────
function arrayBufferToBase64(buffer) {
  const bytes  = new Uint8Array(buffer);
  const chunks = [];
  // Process in 0x8000-byte chunks to avoid call stack limits
  for (let i = 0; i < bytes.length; i += 0x8000) {
    chunks.push(String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)));
  }
  return self.btoa(chunks.join(''));
}

// ─── Message Handler ──────────────────────────────────────────────────────────
self.onmessage = async (event) => {
  const msg = event.data;

  // ── INIT ──────────────────────────────────────────────────────────────────
  if (msg.type === 'INIT') {
    canvas = new OffscreenCanvas(msg.targetWidth, msg.targetHeight);
    ctx    = canvas.getContext('2d', { willReadFrequently: true });
    scheduler        = new AdaptiveFrameScheduler(msg.schedulerOptions);
    currentIntervalMs = msg.schedulerOptions.minIntervalMs;
    self.postMessage({ type: 'READY' });
    return;
  }

  // ── INFERENCE_RESULT feedback from main thread ────────────────────────────
  if (msg.type === 'INFERENCE_RESULT') {
    if (!scheduler) return;
    const decision    = scheduler.observe(msg.inferenceMs, msg.queueDepth ?? 0);
    currentIntervalMs = decision.intervalMs;
    return;
  }

  // ── FRAME ─────────────────────────────────────────────────────────────────
  if (msg.type === 'FRAME') {
    if (!canvas || !ctx) { msg.bitmap.close(); return; }

    const now = performance.now();

    // Token-bucket rate gate (T1: scheduler-controlled interval)
    if (now - lastEmittedAt < currentIntervalMs) {
      msg.bitmap.close();
      self.postMessage({ type: 'FRAME_DROPPED', reason: 'backpressure', capturedAt: msg.capturedAt });
      return;
    }

    // Draw to persistent OffscreenCanvas — no DOM allocation (T1 + T2)
    ctx.drawImage(msg.bitmap, 0, 0, canvas.width, canvas.height);
    msg.bitmap.close();

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data      = imageData.data;

    // Blur gate
    const { variance, threshold } = computeLaplacianVariance(data);
    if (variance < threshold) {
      self.postMessage({ type: 'FRAME_DROPPED', reason: 'blur', capturedAt: msg.capturedAt });
      return;
    }

    // T3: MAD similarity gate
    const currentLuma      = extractLumaSamples(data);
    const forceDueToStaleness = now - lastForceEmitAt > MAX_STALENESS_MS;

    if (previousLumaSamples && !forceDueToStaleness) {
      const mad = computeMAD(currentLuma, previousLumaSamples);
      if (mad < MAD_THRESHOLD) {
        self.postMessage({ type: 'FRAME_DROPPED', reason: 'similarity', capturedAt: msg.capturedAt });
        return;
      }
    }

    previousLumaSamples = currentLuma;
    lastForceEmitAt     = now;

    // Encode to JPEG base64
    const blob        = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.65 });
    const arrayBuffer = await blob.arrayBuffer();
    const base64      = arrayBufferToBase64(arrayBuffer);

    lastEmittedAt = now;

    self.postMessage({
      type:       'FRAME_READY',
      base64,
      capturedAt: msg.capturedAt,
      width:      canvas.width,
      height:     canvas.height,
    });
  }
};
