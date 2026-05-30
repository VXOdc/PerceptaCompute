/**
 * frame-worker.js — T1 + T3 + fix #5
 *
 * Fix #5 — Dynamic MAD threshold:
 *   MAD_THRESHOLD is no longer a hard-coded magic number.
 *   The blur gate already computes mean frame brightness.
 *   We reuse that value to scale the MAD threshold the same way the blur
 *   threshold is scaled:
 *
 *     effectiveMAD = MAD_BASE * brightnessFactor
 *
 *   where brightnessFactor = clamp(mean / 100, 0.5, 1.0)  (same formula as blur gate)
 *
 *   Effect:
 *   • Well-lit scene  (mean ≈ 120):  brightnessFactor → 1.0 → MAD threshold stays at 6.0
 *   • Dark scene      (mean ≈ 30):   brightnessFactor → 0.5 → MAD threshold drops to 3.0
 *     (dark scenes have lower absolute luma variance, so a smaller delta still
 *      represents meaningful motion — we need to be more sensitive, not less)
 *
 *   The MAX_STALENESS_MS safety-valve is unchanged.
 *
 * T1: Off-main-thread OffscreenCanvas pipeline with AdaptiveFrameScheduler.
 * T3: MAD similarity gate — suppresses inference on static scenes.
 */

// ─── Inlined AdaptiveFrameScheduler ──────────────────────────────────────────
class AdaptiveFrameScheduler {
  constructor(options) {
    this.options               = options;
    this.intervalMs            = options.minIntervalMs;
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
      intervalMs:      this.intervalMs,
      shouldDropFrame: this.consecutiveSlowFrames >= 3,
      reason:          overloaded ? 'backpressure' : 'healthy',
    };
  }
}

// ─── Constants ────────────────────────────────────────────────────────────────
// Fix #5: base value only — actual threshold is scaled by scene brightness.
const MAD_BASE         = 6.0;
const MAX_STALENESS_MS = 2000;

// ─── Worker State ─────────────────────────────────────────────────────────────
let canvas              = null;
let ctx                 = null;
let scheduler           = null;
let previousLumaSamples = null;
let lastEmittedAt       = 0;
let lastForceEmitAt     = 0;
let currentIntervalMs   = 100;

// ─── Blur Gate (returns mean brightness as well for MAD scaling) ──────────────
function computeBlurGate(data) {
  let sum = 0, sumSq = 0, n = 0;
  for (let i = 0; i < data.length; i += 16) {
    const grey = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    sum   += grey;
    sumSq += grey * grey;
    n++;
  }
  const mean             = sum / n;
  const variance         = sumSq / n - mean * mean;
  const brightnessFactor = Math.max(0.5, Math.min(1.0, mean / 100));
  const blurThreshold    = 60 * brightnessFactor;
  return { variance, blurThreshold, mean, brightnessFactor };
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

// ─── Base64 encode (chunked to avoid call-stack overflow) ─────────────────────
function arrayBufferToBase64(buffer) {
  const bytes  = new Uint8Array(buffer);
  const chunks = [];
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
    scheduler         = new AdaptiveFrameScheduler(msg.schedulerOptions);
    currentIntervalMs = msg.schedulerOptions.minIntervalMs;
    self.postMessage({ type: 'READY' });
    return;
  }

  // ── INFERENCE_RESULT feedback ─────────────────────────────────────────────
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

    // Token-bucket rate gate
    if (now - lastEmittedAt < currentIntervalMs) {
      msg.bitmap.close();
      self.postMessage({ type: 'FRAME_DROPPED', reason: 'backpressure', capturedAt: msg.capturedAt });
      return;
    }

    ctx.drawImage(msg.bitmap, 0, 0, canvas.width, canvas.height);
    msg.bitmap.close();

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data      = imageData.data;

    // Blur gate — also returns mean + brightnessFactor for MAD scaling
    const { variance, blurThreshold, brightnessFactor } = computeBlurGate(data);
    if (variance < blurThreshold) {
      self.postMessage({ type: 'FRAME_DROPPED', reason: 'blur', capturedAt: msg.capturedAt });
      return;
    }

    // Fix #5: Scale MAD threshold by scene brightness.
    // Dark scenes (low mean) get a lower threshold so meaningful motion
    // isn't suppressed by the reduced absolute luma range.
    const effectiveMAD = MAD_BASE * brightnessFactor;

    // T3: MAD similarity gate
    const currentLuma         = extractLumaSamples(data);
    const forceDueToStaleness = now - lastForceEmitAt > MAX_STALENESS_MS;

    if (previousLumaSamples && !forceDueToStaleness) {
      const mad = computeMAD(currentLuma, previousLumaSamples);
      if (mad < effectiveMAD) {
        self.postMessage({ type: 'FRAME_DROPPED', reason: 'similarity', capturedAt: msg.capturedAt });
        return;
      }
    }

    previousLumaSamples = currentLuma;
    lastForceEmitAt     = now;

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
