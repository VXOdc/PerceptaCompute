'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { captureFrame } from '@/lib/frameUtils';
import { DetectionResponse, TrackedObject } from '@/lib/types';

interface CameraProps {
  onDetection:    (result: DetectionResponse) => void;
  onStatusChange: (active: boolean) => void;
  interval?:      number;
  objects?:       TrackedObject[];
}

const TYPE_COLOR: Record<string, string> = {
  person:   '#2563eb',
  car:      '#dc2626',
  bike:     '#0284c7',
  obstacle: '#d97706',
  unknown:  '#475569',
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
  return label
    .toLowerCase()
    .replace(/^default\s*-\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function dedupeVideoDevices(devices: MediaDeviceInfo[]): VideoInput[] {
  const seen = new Set<string>();
  return devices
    .filter(device => device.kind === 'videoinput')
    .flatMap(device => {
      const normalizedLabel = normalizeDeviceLabel(device.label);
      const key = device.groupId || normalizedLabel || device.deviceId;
      if (!key || seen.has(key)) return [];
      seen.add(key);
      return [{ deviceId: device.deviceId, groupId: device.groupId, label: device.label }];
    });
}

function displayDeviceLabel(device: VideoInput | undefined, index: number) {
  if (!device?.label) return `Camera ${index + 1}`;
  const label = normalizeDeviceLabel(device.label);
  if (/\b(front|user|face)\b/.test(label)) return 'Front camera';
  if (/\b(back|rear|environment|world)\b/.test(label)) return 'Rear camera';
  return device.label.replace(/^default\s*-\s*/i, '') || `Camera ${index + 1}`;
}

function currentFrameObjects(objects: TrackedObject[]) {
  return objects.filter(obj => obj.bbox && !obj.stale && obj.framesMissing === 0);
}

function drawOverlay(canvas: HTMLCanvasElement, objects: TrackedObject[], alpha = 1) {
  const W = canvas.width;
  const H = canvas.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.clearRect(0, 0, W, H);
  const visibleObjects = currentFrameObjects(objects);
  if (visibleObjects.length === 0) return;

  ctx.save();
  ctx.globalAlpha = Math.max(0.3, Math.min(1, alpha));

  for (const obj of visibleObjects) {
    if (!obj.bbox) continue;
    const [nx, ny, nw, nh] = obj.bbox;
    const x = Math.max(0, Math.min(W, nx * W));
    const y = Math.max(0, Math.min(H, ny * H));
    const w = Math.max(1, Math.min(W - x, nw * W));
    const h = Math.max(1, Math.min(H - y, nh * H));
    const color = TYPE_COLOR[obj.type] ?? '#475569';
    const urgent = obj.motion === 'approaching';

    ctx.fillStyle = color + (urgent ? '14' : '08');
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = color + (urgent ? 'cc' : '88');
    ctx.lineWidth = urgent ? 2 : 1;
    ctx.strokeRect(x, y, w, h);

    const label = `${obj.type} · ${MOTION_LABEL[obj.motion] ?? obj.motion}`;
    ctx.font = '600 11px ui-monospace, monospace';
    const textW = ctx.measureText(label).width;
    const pillH = 18;
    const pillY = Math.max(0, y - pillH - 4);
    const pillW = Math.min(W, textW + 12);
    const pillX = Math.max(0, Math.min(x, W - pillW));

    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.fillRect(pillX, pillY, pillW, pillH);
    ctx.fillStyle = color;
    ctx.fillText(label, pillX + 6, pillY + 13);
  }

  ctx.restore();
}

export default function Camera({
  onDetection,
  onStatusChange,
  interval = 150,
  objects = [],
}: CameraProps) {
  const videoRef     = useRef<HTMLVideoElement>(null);
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const overlayRef   = useRef<HTMLCanvasElement>(null);
  const isProcessing = useRef(false);
  const timerRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef    = useRef<MediaStream | null>(null);
  const animRef      = useRef<number | null>(null);
  const objectsRef   = useRef<TrackedObject[]>(objects);
  const showOverlayRef = useRef(true);
  const lastOverlayUpdateRef = useRef(0);

  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isScanning, setIsScanning]     = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isStreamActive, setIsStreamActive] = useState(false);
  const [showTrackingOverlay, setShowTrackingOverlay] = useState(true);
  const [videoDevices, setVideoDevices] = useState<VideoInput[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [activeDeviceId, setActiveDeviceId] = useState<string | null>(null);

  const paintOverlayFrame = useCallback(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;

    const objects = objectsRef.current;
    const age = nowMs() - lastOverlayUpdateRef.current;
    if (
      !showOverlayRef.current
      || lastOverlayUpdateRef.current === 0
      || age > OVERLAY_FRAME_TTL_MS
      || currentFrameObjects(objects).length === 0
    ) {
      clearOverlay(overlay);
      return;
    }

    drawOverlay(overlay, objects, 1 - age / OVERLAY_FRAME_TTL_MS);
  }, []);

  const syncOverlaySize = useCallback(() => {
    const canvas = canvasRef.current;
    const overlay = overlayRef.current;
    if (!canvas || !overlay) return;

    const changed = overlay.width !== canvas.width || overlay.height !== canvas.height;
    if (!changed) return;

    overlay.width = canvas.width;
    overlay.height = canvas.height;
    clearOverlay(overlay);
  }, []);

  const drawVideoFrame = useCallback(() => {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) {
      animRef.current = requestAnimationFrame(drawVideoFrame);
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const nextWidth = canvas.offsetWidth || 640;
    const nextHeight = canvas.offsetHeight || 360;
    if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
      canvas.width = nextWidth;
      canvas.height = nextHeight;
    }

    const vr = video.videoWidth / video.videoHeight;
    const cr = canvas.width / canvas.height;
    let sw = video.videoWidth, sh = video.videoHeight, sx = 0, sy = 0;
    if (vr > cr) { sw = video.videoHeight * cr; sx = (video.videoWidth - sw) / 2; }
    else         { sh = video.videoWidth / cr; sy = (video.videoHeight - sh) / 2; }

    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    syncOverlaySize();
    paintOverlayFrame();

    animRef.current = requestAnimationFrame(drawVideoFrame);
  }, [paintOverlayFrame, syncOverlaySize]);

  useEffect(() => {
    objectsRef.current = objects;
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

  const processFrame = useCallback(async () => {
    if (isProcessing.current) return;
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;

    const base64 = captureFrame(video, 320, 0.65);
    if (!base64) return;

    isProcessing.current = true;
    setIsScanning(true);
    try {
      const res = await fetch('/api/detect', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'X-Percepta-Client': 'browser-frame',
        },
        body: JSON.stringify({ image: base64 }),
      });
      if (res.ok) {
        const data: DetectionResponse = await res.json();
        onDetection(data);
      }
    } catch {
      /* keep loop alive */
    } finally {
      isProcessing.current = false;
      setIsScanning(false);
    }
  }, [onDetection]);

  const stopCurrentFeed = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (animRef.current) {
      cancelAnimationFrame(animRef.current);
      animRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    isProcessing.current = false;
    setIsScanning(false);
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
    } catch {
      return [];
    }
  }, []);

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
        const video: MediaTrackConstraints = {
          width:     { ideal: 1280 },
          height:    { ideal: 720 },
          frameRate: { ideal: 30 },
          ...(selectedDeviceId
            ? { deviceId: { exact: selectedDeviceId } }
            : { facingMode: { ideal: 'environment' } }),
        };
        const stream = await navigator.mediaDevices.getUserMedia({
          video,
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        streamRef.current = stream;
        setCameraError(null);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        if (cancelled) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }

        const track = stream.getVideoTracks()[0];
        const activeId = track?.getSettings().deviceId ?? selectedDeviceId;
        setActiveDeviceId(activeId ?? null);

        onStatusChange(true);
        setIsStreamActive(true);
        animRef.current = requestAnimationFrame(drawVideoFrame);

        const devices = await updateVideoDevices();
        if (!cancelled && selectedDeviceId && devices.length > 0 && !devices.some(device => device.deviceId === selectedDeviceId)) {
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

    return () => {
      cancelled = true;
      stopCurrentFeed();
    };
  }, [drawVideoFrame, onStatusChange, selectedDeviceId, stopCurrentFeed, updateVideoDevices]);

  useEffect(() => () => {
    onStatusChange(false);
  }, [onStatusChange]);

  useEffect(() => {
    if (!isStreamActive || cameraError) return;
    if (timerRef.current) clearInterval(timerRef.current);
    processFrame();
    timerRef.current = setInterval(processFrame, interval);
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [cameraError, interval, isStreamActive, processFrame]);

  const currentDeviceId = selectedDeviceId ?? activeDeviceId;
  const activeDeviceIndex = videoDevices.findIndex(device => device.deviceId === currentDeviceId);
  const activeDeviceLabel = displayDeviceLabel(videoDevices[activeDeviceIndex], Math.max(activeDeviceIndex, 0));
  const hasMultipleCameras = videoDevices.length > 1;

  const switchCamera = useCallback(() => {
    if (videoDevices.length <= 1) return;
    const currentId = selectedDeviceId ?? activeDeviceId;
    const currentIndex = videoDevices.findIndex(device => device.deviceId === currentId);
    const nextDevice = videoDevices[(currentIndex + 1 + videoDevices.length) % videoDevices.length];
    if (nextDevice) setSelectedDeviceId(nextDevice.deviceId);
  }, [activeDeviceId, selectedDeviceId, videoDevices]);

  const objectSummary = objects.length === 0
    ? 'No objects detected'
    : `${objects.length} object${objects.length !== 1 ? 's' : ''}: ${objects.map(o => o.type).join(', ')}`;

  return (
    <div className="relative w-full h-full flex flex-col" style={{ background: '#000', borderRadius: 4 }}>
      {/* Status bar — always visible above feed */}
      <div
        className="shrink-0 flex items-center justify-between gap-3 px-4"
        style={{
          minHeight: 40,
          paddingTop: 6,
          paddingBottom: 6,
          background: 'var(--bg2)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="rounded-full shrink-0"
            style={{
              width: 8,
              height: 8,
              background: cameraError ? 'var(--red)' : isScanning ? 'var(--amber)' : objects.length > 0 ? 'var(--green)' : 'var(--border-hi)',
            }}
          />
          <span
            className="truncate"
            style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-hi)' }}
          >
            {cameraError ?? objectSummary}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            role="switch"
            aria-checked={showTrackingOverlay}
            aria-label={showTrackingOverlay ? 'Hide AI tracking overlay' : 'Show AI tracking overlay'}
            title={showTrackingOverlay ? 'Hide AI tracking overlay' : 'Show AI tracking overlay'}
            onClick={() => setShowTrackingOverlay(value => !value)}
            style={{
              height: 24,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '0 8px',
              borderRadius: 4,
              border: `1px solid ${showTrackingOverlay ? 'rgba(37,99,235,0.25)' : 'var(--border)'}`,
              background: showTrackingOverlay ? 'var(--accent-soft)' : 'var(--bg3)',
              color: showTrackingOverlay ? 'var(--amber)' : 'var(--text-dim)',
              fontFamily: 'var(--mono)',
              fontSize: 9,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            <span
              aria-hidden
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                background: showTrackingOverlay ? 'var(--amber)' : 'var(--text-dim)',
              }}
            />
            AI tracking
          </button>

          {hasMultipleCameras && (
            <button
              type="button"
              onClick={switchCamera}
              disabled={isStarting}
              aria-label={`Switch camera. Current camera: ${activeDeviceLabel}`}
              title={`Switch camera: ${activeDeviceLabel}`}
              style={{
                height: 24,
                padding: '0 8px',
                borderRadius: 4,
                border: '1px solid var(--border)',
                background: 'var(--bg3)',
                color: isStarting ? 'var(--text-dim)' : 'var(--text-hi)',
                fontFamily: 'var(--mono)',
                fontSize: 9,
                cursor: isStarting ? 'default' : 'pointer',
                maxWidth: 140,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {videoDevices.length === 2 ? 'Switch camera' : activeDeviceLabel}
            </button>
          )}

          <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dim)', flexShrink: 0 }}>
            {isScanning ? 'Analyzing…' : isStarting ? 'Starting' : cameraError ? 'Error' : 'Live'}
          </span>
        </div>
      </div>

      {/* Feed */}
      <div className="relative flex-1 min-h-0 overflow-hidden">
        {cameraError ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6" style={{ background: 'var(--bg3)' }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--red)' }}>Camera unavailable</span>
            <span style={{ fontSize: 12, color: 'var(--text-dim)', textAlign: 'center' }}>{cameraError}</span>
            <span style={{ fontSize: 11, color: 'var(--text-dim)', textAlign: 'center' }}>
              Allow camera access in your browser, then reload the page.
            </span>
          </div>
        ) : (
          <>
            <video ref={videoRef} playsInline muted className="absolute opacity-0 pointer-events-none w-px h-px" />
            <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
            <canvas
              ref={overlayRef}
              className="absolute inset-0 w-full h-full pointer-events-none"
              style={{ opacity: showTrackingOverlay ? 1 : 0 }}
            />
          </>
        )}
      </div>
    </div>
  );
}
