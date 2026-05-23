'use client';

/**
 * Camera.tsx — T1: OffscreenCanvas Web Worker Integration
 *
 * T1: Frame capture is moved off the main thread entirely.
 *     - A FrameWorker (public/workers/frame-worker.js) owns the persistent
 *       OffscreenCanvas and all pixel processing.
 *     - The main thread transfers ImageBitmap objects to the worker via
 *       zero-copy Transferable postMessage — no serialisation.
 *     - requestVideoFrameCallback (rVFC) replaces setInterval for frame
 *       sampling, synchronising with the browser's video decode pipeline.
 *     - The fetch('/api/detect') call is now triggered by worker FRAME_READY
 *       messages, not from within the rAF/rVFC loop — so inference latency
 *       never blocks the video render loop.
 *     - AdaptiveFrameScheduler feedback is sent to the worker after each
 *       inference result via INFERENCE_RESULT messages.
 *
 * The overlay drawing and all UI state remain on the main thread unchanged.
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { DetectionResponse, TrackedObject } from '@/lib/types';

interface CameraProps {
  onDetection:    (result: DetectionResponse) => void;
  onStatusChange: (active: boolean) => void;
  interval?:      number;   // kept for API compatibility; worker handles scheduling
  objects?:       TrackedObject[];
}

const TYPE_COLOR: Record<string, string> = {
  person:   '#e2e8f0',
  car:      '#f87171',
  bike:     '#22d3ee',
  obstacle: '#fb923c',
  unknown:  '#64748b',
};

const MOTION_LABEL: Record<string, string> = {
  approaching: 'Approaching',
  static:      'Static',
  leaving:     'Leaving',
  crossing:    'Crossing',
};

const OVERLAY_FRAME_TTL_MS = 220;

type VideoInput = Pick<MediaDeviceInfo, 'deviceId' | 'groupId' | 'label'>;

function nowMs() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function clearOverlay(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function normalizeDeviceLabel(label: string) {
  return label.toLowerCase().replace(/^default\s*-\s*/, '').replace(/\s+/g, ' ').trim();
}

function dedupeVideoDevices(devices: MediaDeviceInfo[]): VideoInput[] {
  const seen = new Set<string>();
  return devices
    .filter(d => d.kind === 'videoinput')
    .flatMap(d => {
      const key = d.groupId || normalizeDeviceLabel(d.label) || d.deviceId;
      if (!key || seen.has(key)) return [];
      seen.add(key);
      return [{ deviceId: d.deviceId, groupId: d.groupId, label: d.label }];
    });
}

function displayDeviceLabel(device: VideoInput | undefined, index: number) {
  if (!device?.label) return `Camera ${index + 1}`;
  const label = normalizeDeviceLabel(device.label);
  if (/\b(front|user|face)\b/.test(label))              return 'Front camera';
  if (/\b(back|rear|environment|world)\b/.test(label))  return 'Rear camera';
  return device.label.replace(/^default\s*-\s*/i, '') || `Camera ${index + 1}`;
}

function currentFrameObjects(objects: TrackedObject[]) {
  return objects.filter(obj => obj.bbox && !obj.stale && obj.framesMissing === 0);
}

function drawOverlay(canvas: HTMLCanvasElement, objects: TrackedObject[], alpha = 1) {
  const W   = canvas.width;
  const H   = canvas.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.clearRect(0, 0, W, H);
  const visible = currentFrameObjects(objects);
  if (visible.length === 0) return;

  ctx.save();
  ctx.globalAlpha = Math.max(0.3, Math.min(1, alpha));

  for (const obj of visible) {
    if (!obj.bbox) continue;
    const [nx, ny, nw, nh] = obj.bbox;
    const x = Math.max(0, Math.min(W, nx * W));
    const y = Math.max(0, Math.min(H, ny * H));
    const w = Math.max(1, Math.min(W - x, nw * W));
    const h = Math.max(1, Math.min(H - y, nh * H));
    const color  = TYPE_COLOR[obj.type] ?? '#e2e8f0';
    const urgent = obj.motion === 'approaching';

    ctx.fillStyle   = color + (urgent ? '14' : '08');
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = color + (urgent ? 'cc' : '88');
    ctx.lineWidth   = urgent ? 2 : 1;
    ctx.strokeRect(x, y, w, h);

    const label = `${obj.type} · ${MOTION_LABEL[obj.motion] ?? obj.motion}`;
    ctx.font = '500 11px "JetBrains Mono", monospace';
    const textW  = ctx.measureText(label).width;
    const pillH  = 18;
    const pillY  = Math.max(0, y - pillH - 4);
    const pillW  = Math.min(W, textW + 12);
    const pillX  = Math.max(0, Math.min(x, W - pillW));

    ctx.fillStyle = 'rgba(8,11,14,0.9)';
    ctx.fillRect(pillX, pillY, pillW, pillH);
    ctx.fillStyle = color;
    ctx.fillText(label, pillX + 6, pillY + 13);
  }

  ctx.restore();
}

// rVFC shim — falls back to rAF on browsers without requestVideoFrameCallback
type VideoFrameCallback = (now: DOMHighResTimeStamp, metadata: Record<string, unknown>) => void;
declare global {
  interface HTMLVideoElement {
    requestVideoFrameCallback?(cb: VideoFrameCallback): number;
    cancelVideoFrameCallback?(handle: number): void;
  }
}

export default function Camera({
  onDetection,
  onStatusChange,
  objects = [],
}: CameraProps) {
  const videoRef      = useRef<HTMLVideoElement>(null);
  const canvasRef     = useRef<HTMLCanvasElement>(null);
  const overlayRef    = useRef<HTMLCanvasElement>(null);
  const workerRef     = useRef<Worker | null>(null);
  const workerReady   = useRef(false);
  const animRef       = useRef<number | null>(null);
  const rVFCHandle    = useRef<number | null>(null);
  const streamRef     = useRef<MediaStream | null>(null);
  const objectsRef    = useRef<TrackedObject[]>(objects);
  const showOverlayRef = useRef(true);
  const lastOverlayUpdateRef = useRef(0);
  const isScanning    = useRef(false);  // ref not state — avoids render on every frame

  const [cameraError, setCameraError]           = useState<string | null>(null);
  const [isScanningState, setIsScanningState]   = useState(false);
  const [isStarting, setIsStarting]             = useState(false);
  const [isStreamActive, setIsStreamActive]     = useState(false);
  const [showTrackingOverlay, setShowTrackingOverlay] = useState(true);
  const [videoDevices, setVideoDevices]         = useState<VideoInput[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [activeDeviceId, setActiveDeviceId]     = useState<string | null>(null);

  // ── T1: Dispatch inference from worker FRAME_READY messages ───────────────
  const dispatchInference = useCallback(async (base64: string, capturedAt: number) => {
    if (isScanning.current) return;
    isScanning.current = true;
    setIsScanningState(true);
    const startedAt = performance.now();
    try {
      const res = await fetch('/api/detect', {
        method:      'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type':    'application/json',
          'X-Percepta-Client': 'frame-worker',
        },
        body: JSON.stringify({ image: base64 }),
      });
      if (res.ok) {
        const data: DetectionResponse = await res.json();
        onDetection(data);
        // Feed inference latency back to the worker scheduler
        const inferenceMs = performance.now() - startedAt;
        workerRef.current?.postMessage({ type: 'INFERENCE_RESULT', inferenceMs, queueDepth: 0 });
      }
    } catch { /* keep loop alive */ } finally {
      isScanning.current = false;
      setIsScanningState(false);
    }
  }, [onDetection]);

  // ── T1: Initialise FrameWorker ─────────────────────────────────────────────
  useEffect(() => {
    const worker = new Worker('/workers/frame-worker.js');
    workerRef.current = worker;

    worker.onmessage = (e: MessageEvent) => {
      const msg = e.data;
      if (msg.type === 'READY') {
        workerReady.current = true;
      } else if (msg.type === 'FRAME_READY') {
        dispatchInference(msg.base64, msg.capturedAt);
      }
      // FRAME_DROPPED messages ignored — drop is intentional
    };

    worker.postMessage({
      type:   'INIT',
      targetWidth:  320,
      targetHeight: 180,
      schedulerOptions: { minIntervalMs: 80, maxIntervalMs: 600, targetLatencyMs: 180 },
    });

    return () => {
      worker.terminate();
      workerRef.current  = null;
      workerReady.current = false;
    };
  }, [dispatchInference]);

  // ── Overlay helpers ────────────────────────────────────────────────────────
  const paintOverlayFrame = useCallback(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const age = nowMs() - lastOverlayUpdateRef.current;
    if (!showOverlayRef.current || lastOverlayUpdateRef.current === 0 || age > OVERLAY_FRAME_TTL_MS || currentFrameObjects(objectsRef.current).length === 0) {
      clearOverlay(overlay);
      return;
    }
    drawOverlay(overlay, objectsRef.current, 1 - age / OVERLAY_FRAME_TTL_MS);
  }, []);

  const syncOverlaySize = useCallback(() => {
    const canvas  = canvasRef.current;
    const overlay = overlayRef.current;
    if (!canvas || !overlay) return;
    if (overlay.width !== canvas.width || overlay.height !== canvas.height) {
      overlay.width  = canvas.width;
      overlay.height = canvas.height;
      clearOverlay(overlay);
    }
  }, []);

  // ── T1: rVFC loop — capture → transfer ImageBitmap to worker ──────────────
  const onVideoFrame = useCallback(async () => {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) return;

    // Render video to display canvas (main thread — display only)
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const nextW = canvas.offsetWidth  || 640;
      const nextH = canvas.offsetHeight || 360;
      if (canvas.width !== nextW || canvas.height !== nextH) {
        canvas.width  = nextW;
        canvas.height = nextH;
      }
      const vr = video.videoWidth / video.videoHeight;
      const cr = canvas.width / canvas.height;
      let sw = video.videoWidth, sh = video.videoHeight, sx = 0, sy = 0;
      if (vr > cr) { sw = video.videoHeight * cr; sx = (video.videoWidth - sw) / 2; }
      else         { sh = video.videoWidth  / cr; sy = (video.videoHeight - sh) / 2; }
      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    }

    syncOverlaySize();
    paintOverlayFrame();

    // T1: Transfer ImageBitmap to worker — zero-copy, off main thread
    if (workerReady.current && workerRef.current) {
      try {
        const bitmap = await createImageBitmap(video);
        workerRef.current.postMessage(
          { type: 'FRAME', bitmap, capturedAt: performance.now() },
          [bitmap]  // Transferable — zero-copy, GPU texture ownership transferred
        );
      } catch { /* video not ready or worker terminated */ }
    }
  }, [paintOverlayFrame, syncOverlaySize]);

  // ── rAF draw loop (display only — no capture logic) ───────────────────────
  const drawVideoFrame = useCallback(() => {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) {
      animRef.current = requestAnimationFrame(drawVideoFrame);
      return;
    }

    const ctx = canvas.getContext('2d');
    if (ctx) {
      const nextW = canvas.offsetWidth  || 640;
      const nextH = canvas.offsetHeight || 360;
      if (canvas.width !== nextW || canvas.height !== nextH) {
        canvas.width  = nextW;
        canvas.height = nextH;
      }
      const vr = video.videoWidth / video.videoHeight;
      const cr = canvas.width / canvas.height;
      let sw = video.videoWidth, sh = video.videoHeight, sx = 0, sy = 0;
      if (vr > cr) { sw = video.videoHeight * cr; sx = (video.videoWidth - sw) / 2; }
      else         { sh = video.videoWidth  / cr; sy = (video.videoHeight - sh) / 2; }
      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    }
    syncOverlaySize();
    paintOverlayFrame();
    animRef.current = requestAnimationFrame(drawVideoFrame);
  }, [paintOverlayFrame, syncOverlaySize]);

  useEffect(() => {
    objectsRef.current    = objects;
    showOverlayRef.current = showTrackingOverlay;
    const overlay = overlayRef.current;
    if (!overlay) return;
    if (showTrackingOverlay && currentFrameObjects(objects).length > 0) {
      lastOverlayUpdateRef.current = nowMs();
      drawOverlay(overlay, objects);
    } else {
      lastOverlayUpdateRef.current = 0;
      clearOverlay(overlay);
    }
  }, [objects, showTrackingOverlay]);

  const stopCurrentFeed = useCallback(() => {
    if (animRef.current)    { cancelAnimationFrame(animRef.current); animRef.current = null; }
    if (rVFCHandle.current && videoRef.current?.cancelVideoFrameCallback) {
      videoRef.current.cancelVideoFrameCallback(rVFCHandle.current);
      rVFCHandle.current = null;
    }
    if (streamRef.current)  { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    isScanning.current = false;
    setIsScanningState(false);
    setIsStreamActive(false);
    lastOverlayUpdateRef.current = 0;
    objectsRef.current = [];
    if (overlayRef.current) clearOverlay(overlayRef.current);
  }, []);

  const updateVideoDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    try {
      const devices = dedupeVideoDevices(await navigator.mediaDevices.enumerateDevices());
      setVideoDevices(devices);
      return devices;
    } catch { return []; }
  }, []);

  // ── Camera start ──────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function startCamera() {
      stopCurrentFeed();
      setCameraError(null);
      setIsStarting(true);

      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError('Camera access is not supported by this browser.');
        setIsStarting(false);
        onStatusChange(false);
        return;
      }

      try {
        const constraints: MediaTrackConstraints = {
          width:     { ideal: 1280 },
          height:    { ideal: 720 },
          frameRate: { ideal: 30 },
          ...(selectedDeviceId
            ? { deviceId: { exact: selectedDeviceId } }
            : { facingMode: { ideal: 'environment' } }),
        };
        const stream = await navigator.mediaDevices.getUserMedia({ video: constraints, audio: false });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }

        streamRef.current = stream;
        setCameraError(null);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }

        const track    = stream.getVideoTracks()[0];
        const activeId = track?.getSettings().deviceId ?? selectedDeviceId;
        setActiveDeviceId(activeId ?? null);
        onStatusChange(true);
        setIsStreamActive(true);

        // T1: Use requestVideoFrameCallback if available, else fall back to rAF
        const video = videoRef.current;
        if (video && video.requestVideoFrameCallback) {
          const loop = () => {
            onVideoFrame();
            rVFCHandle.current = video.requestVideoFrameCallback!(loop);
          };
          rVFCHandle.current = video.requestVideoFrameCallback(loop);
        } else {
          animRef.current = requestAnimationFrame(drawVideoFrame);
        }

        const devices = await updateVideoDevices();
        if (!cancelled && selectedDeviceId && devices.length > 0 && !devices.some(d => d.deviceId === selectedDeviceId)) {
          setSelectedDeviceId(null);
        }
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : 'Camera access denied';
        setCameraError(msg);
        setIsStreamActive(false);
        onStatusChange(false);
        await updateVideoDevices();
      } finally {
        if (!cancelled) setIsStarting(false);
      }
    }

    startCamera();
    return () => { cancelled = true; stopCurrentFeed(); };
  }, [drawVideoFrame, onStatusChange, onVideoFrame, selectedDeviceId, stopCurrentFeed, updateVideoDevices]);

  useEffect(() => () => { onStatusChange(false); }, [onStatusChange]);

  const currentDeviceId    = selectedDeviceId ?? activeDeviceId;
  const activeDeviceIndex  = videoDevices.findIndex(d => d.deviceId === currentDeviceId);
  const activeDeviceLabel  = displayDeviceLabel(videoDevices[activeDeviceIndex], Math.max(activeDeviceIndex, 0));
  const hasMultipleCameras = videoDevices.length > 1;

  const switchCamera = useCallback(() => {
    if (videoDevices.length <= 1) return;
    const currentId    = selectedDeviceId ?? activeDeviceId;
    const currentIndex = videoDevices.findIndex(d => d.deviceId === currentId);
    const nextDevice   = videoDevices[(currentIndex + 1 + videoDevices.length) % videoDevices.length];
    if (nextDevice) setSelectedDeviceId(nextDevice.deviceId);
  }, [activeDeviceId, selectedDeviceId, videoDevices]);

  const objectSummary = objects.length === 0
    ? 'No objects detected'
    : `${objects.length} object${objects.length !== 1 ? 's' : ''}: ${objects.map(o => o.type).join(', ')}`;

  return (
    <div className="relative w-full h-full flex flex-col" style={{ background: '#000', borderRadius: 4 }}>
      {/* Status bar */}
      <div className="shrink-0 flex items-center justify-between gap-3 px-4" style={{ minHeight: 40, paddingTop: 6, paddingBottom: 6, background: 'var(--bg2)', borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-center gap-2 min-w-0">
          <span className="rounded-full shrink-0" style={{ width: 8, height: 8, background: cameraError ? 'var(--red)' : isScanningState ? 'var(--amber)' : objects.length > 0 ? 'var(--green)' : 'var(--border-hi)' }} />
          <span className="truncate" style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-hi)' }}>
            {cameraError ?? objectSummary}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button type="button" role="switch" aria-checked={showTrackingOverlay} aria-label={showTrackingOverlay ? 'Hide AI tracking overlay' : 'Show AI tracking overlay'} onClick={() => setShowTrackingOverlay(v => !v)}
            style={{ height: 24, display: 'flex', alignItems: 'center', gap: 6, padding: '0 8px', borderRadius: 4, border: `1px solid ${showTrackingOverlay ? 'rgba(245,158,11,0.35)' : 'var(--border)'}`, background: showTrackingOverlay ? 'rgba(245,158,11,0.10)' : 'var(--bg3)', color: showTrackingOverlay ? 'var(--amber)' : 'var(--text-dim)', fontFamily: 'var(--mono)', fontSize: 9, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            <span aria-hidden style={{ width: 6, height: 6, borderRadius: 3, background: showTrackingOverlay ? 'var(--amber)' : 'var(--text-dim)' }} />
            AI tracking
          </button>
          {hasMultipleCameras && (
            <button type="button" onClick={switchCamera} disabled={isStarting} aria-label={`Switch camera. Current: ${activeDeviceLabel}`}
              style={{ height: 24, padding: '0 8px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg3)', color: isStarting ? 'var(--text-dim)' : 'var(--text-hi)', fontFamily: 'var(--mono)', fontSize: 9, cursor: isStarting ? 'default' : 'pointer', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {videoDevices.length === 2 ? 'Switch camera' : activeDeviceLabel}
            </button>
          )}
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dim)', flexShrink: 0 }}>
            {isScanningState ? 'Analyzing…' : isStarting ? 'Starting' : cameraError ? 'Error' : 'Live'}
          </span>
        </div>
      </div>

      {/* Feed */}
      <div className="relative flex-1 min-h-0 overflow-hidden">
        {cameraError ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6" style={{ background: 'var(--bg3)' }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--red)' }}>Camera unavailable</span>
            <span style={{ fontSize: 12, color: 'var(--text-dim)', textAlign: 'center' }}>{cameraError}</span>
            <span style={{ fontSize: 11, color: 'var(--text-dim)', textAlign: 'center' }}>Allow camera access in your browser, then reload the page.</span>
          </div>
        ) : (
          <>
            <video ref={videoRef} playsInline muted className="absolute opacity-0 pointer-events-none w-px h-px" />
            <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
            <canvas ref={overlayRef} className="absolute inset-0 w-full h-full pointer-events-none" style={{ opacity: showTrackingOverlay ? 1 : 0 }} />
          </>
        )}
      </div>
    </div>
  );
}
