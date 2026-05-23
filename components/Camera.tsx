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

function drawOverlay(canvas: HTMLCanvasElement, objects: TrackedObject[]) {
  const W = canvas.width;
  const H = canvas.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.clearRect(0, 0, W, H);

  for (const obj of objects) {
    if (!obj.bbox) continue;
    const [nx, ny, nw, nh] = obj.bbox;
    const x = nx * W;
    const y = ny * H;
    const w = nw * W;
    const h = nh * H;
    const color = TYPE_COLOR[obj.type] ?? '#e2e8f0';
    const urgent = obj.motion === 'approaching';

    ctx.fillStyle = color + (urgent ? '14' : '08');
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = color + (urgent ? 'cc' : '88');
    ctx.lineWidth = urgent ? 2 : 1;
    ctx.strokeRect(x, y, w, h);

    const label = `${obj.type} · ${MOTION_LABEL[obj.motion] ?? obj.motion}`;
    ctx.font = '500 11px "JetBrains Mono", monospace';
    const textW = ctx.measureText(label).width;
    const pillH = 18;
    const pillY = Math.max(0, y - pillH - 4);

    ctx.fillStyle = 'rgba(8,11,14,0.9)';
    ctx.fillRect(x, pillY, textW + 12, pillH);
    ctx.fillStyle = color;
    ctx.fillText(label, x + 6, pillY + 13);
  }
}

export default function Camera({
  onDetection,
  onStatusChange,
  interval = 400,
  objects = [],
}: CameraProps) {
  const videoRef     = useRef<HTMLVideoElement>(null);
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const overlayRef   = useRef<HTMLCanvasElement>(null);
  const isProcessing = useRef(false);
  const timerRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef    = useRef<MediaStream | null>(null);
  const animRef      = useRef<number | null>(null);

  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isScanning, setIsScanning]     = useState(false);

  const drawVideoFrame = useCallback(() => {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) {
      animRef.current = requestAnimationFrame(drawVideoFrame);
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width  = canvas.offsetWidth  || 640;
    canvas.height = canvas.offsetHeight || 360;

    const vr = video.videoWidth / video.videoHeight;
    const cr = canvas.width / canvas.height;
    let sw = video.videoWidth, sh = video.videoHeight, sx = 0, sy = 0;
    if (vr > cr) { sw = video.videoHeight * cr; sx = (video.videoWidth - sw) / 2; }
    else         { sh = video.videoWidth / cr; sy = (video.videoHeight - sh) / 2; }

    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

    if (overlayRef.current) {
      overlayRef.current.width  = canvas.width;
      overlayRef.current.height = canvas.height;
    }

    animRef.current = requestAnimationFrame(drawVideoFrame);
  }, []);

  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    drawOverlay(overlay, objects);
  }, [objects]);

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
        headers: { 'Content-Type': 'application/json' },
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

  useEffect(() => {
    let mounted = true;

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width:      { ideal: 1280 },
            height:     { ideal: 720 },
            facingMode: 'environment',
            frameRate:  { ideal: 30 },
          },
          audio: false,
        });
        if (!mounted) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        streamRef.current = stream;
        setCameraError(null);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        onStatusChange(true);
        animRef.current  = requestAnimationFrame(drawVideoFrame);
        timerRef.current = setInterval(processFrame, interval);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Camera access denied';
        setCameraError(msg);
        onStatusChange(false);
      }
    }

    startCamera();

    return () => {
      mounted = false;
      if (timerRef.current) clearInterval(timerRef.current);
      if (animRef.current) cancelAnimationFrame(animRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      onStatusChange(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!timerRef.current) return;
    clearInterval(timerRef.current);
    timerRef.current = setInterval(processFrame, interval);
  }, [interval, processFrame]);

  const objectSummary = objects.length === 0
    ? 'No objects detected'
    : `${objects.length} object${objects.length !== 1 ? 's' : ''}: ${objects.map(o => o.type).join(', ')}`;

  return (
    <div className="relative w-full h-full flex flex-col" style={{ background: '#000', borderRadius: 4 }}>
      {/* Status bar — always visible above feed */}
      <div
        className="shrink-0 flex items-center justify-between gap-3 px-4"
        style={{
          height: 40,
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
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dim)', flexShrink: 0 }}>
          {isScanning ? 'Analyzing…' : cameraError ? 'Error' : 'Live'}
        </span>
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
            <canvas ref={overlayRef} className="absolute inset-0 w-full h-full pointer-events-none" />
          </>
        )}
      </div>
    </div>
  );
}
