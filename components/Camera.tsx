'use client';

import { useEffect, useRef, useCallback } from 'react';
import { captureFrame } from '@/lib/frameUtils';
import { DetectionResponse } from '@/lib/types';

interface CameraProps {
  onDetection: (result: DetectionResponse) => void;
  onStatusChange: (active: boolean) => void;
  interval?: number;
}

export default function Camera({ onDetection, onStatusChange, interval = 500 }: CameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isProcessing = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const processFrame = useCallback(async () => {
    if (isProcessing.current) return;
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;

    const base64 = captureFrame(video, 320, 0.6);
    if (!base64) return;

    isProcessing.current = true;
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
      // Silent fail — keep loop running
    } finally {
      isProcessing.current = false;
    }
  }, [onDetection]);

  useEffect(() => {
    let mounted = true;

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: 'environment' },
          audio: false,
        });
        if (!mounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        onStatusChange(true);
        timerRef.current = setInterval(processFrame, interval);
      } catch {
        onStatusChange(false);
      }
    }

    startCamera();

    return () => {
      mounted = false;
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      onStatusChange(false);
    };
  }, [processFrame, onStatusChange, interval]);

  return (
    <div className="relative w-full h-full bg-panel rounded-lg overflow-hidden border border-border">
      <video
        ref={videoRef}
        playsInline
        muted
        className="w-full h-full object-cover"
        aria-label="Live camera feed"
      />
      <canvas ref={canvasRef} className="hidden" aria-hidden="true" />

      {/* Corner markers — tactical frame */}
      <div className="absolute top-2 left-2 w-4 h-4 border-t-2 border-l-2 border-accent pointer-events-none" />
      <div className="absolute top-2 right-2 w-4 h-4 border-t-2 border-r-2 border-accent pointer-events-none" />
      <div className="absolute bottom-2 left-2 w-4 h-4 border-b-2 border-l-2 border-accent pointer-events-none" />
      <div className="absolute bottom-2 right-2 w-4 h-4 border-b-2 border-r-2 border-accent pointer-events-none" />

      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-bg/80 backdrop-blur-sm px-3 py-1 rounded text-xs text-accent font-mono tracking-widest">
        NEUROVISION LIVE
      </div>
    </div>
  );
}
