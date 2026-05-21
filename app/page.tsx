'use client';

import { useState, useCallback, useRef } from 'react';
import Camera from '@/components/Camera';
import ObjectList from '@/components/ObjectList';
import RiskPanel from '@/components/RiskPanel';
import SystemStatus from '@/components/SystemStatus';
import FlowDiagram from '@/components/FlowDiagram';
import { updateTracker } from '@/lib/tracker';
import { computeRisk } from '@/lib/riskEngine';
import { DetectionResponse, TrackedObject, RiskAssessment } from '@/lib/types';

const DEFAULT_RISK: RiskAssessment = { risk: 'SAFE', direction: 'NONE', confidence: 0 };

const TECH_STACK = [
  { name: 'Next.js', desc: 'App Router, edge-ready' },
  { name: 'Mistral Pixtral', desc: 'Vision language model' },
  { name: 'WebRTC / Canvas', desc: 'Frame capture at 500ms' },
  { name: 'TypeScript', desc: 'Strict mode, no any' },
  { name: 'Vercel', desc: 'Zero-config deployment' },
  { name: 'Rule Engine', desc: 'Score-based risk logic' },
];

export default function Home() {
  const [isActive, setIsActive] = useState(false);
  const [objects, setObjects] = useState<TrackedObject[]>([]);
  const [risk, setRisk] = useState<RiskAssessment>(DEFAULT_RISK);
  const [frameCount, setFrameCount] = useState(0);
  const [latency, setLatency] = useState(0);
  const lastTs = useRef(0);

  const handleDetection = useCallback((result: DetectionResponse) => {
    const now = Date.now();
    if (lastTs.current > 0) setLatency(now - lastTs.current);
    lastTs.current = now;

    const tracked = updateTracker(result.objects);
    const assessment = computeRisk(tracked);
    setObjects(tracked);
    setRisk(assessment);
    setFrameCount((n) => n + 1);
  }, []);

  const handleStatus = useCallback((active: boolean) => {
    setIsActive(active);
    if (!active) {
      setObjects([]);
      setRisk(DEFAULT_RISK);
      setFrameCount(0);
      setLatency(0);
    }
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      {/* ── NAV ── */}
      <nav className="border-b border-border px-8 h-14 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <img src="/logo.svg" alt="PerceptaCompute" className="h-6 w-6" />
          <span className="font-mono text-sm font-semibold tracking-wider text-primary">
            PERCEPTACOMPUTE
          </span>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${isActive ? 'bg-safe' : 'bg-muted'}`}
              style={isActive ? { boxShadow: '0 0 8px #22C55E' } : undefined}
            />
            <span className="text-xs font-mono text-muted uppercase tracking-wider">
              {isActive ? 'System Active' : 'Standby'}
            </span>
          </div>
          <a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-mono text-muted hover:text-primary transition-colors duration-200"
          >
            GitHub →
          </a>
        </div>
      </nav>

      <main className="flex flex-col flex-1 px-8 py-8 gap-8 max-w-[1400px] mx-auto w-full">

        {/* ── HERO ── */}
        <section className="grid grid-cols-2 gap-8 items-start">
          <div className="flex flex-col gap-4">
            <h1 className="text-5xl font-mono font-bold tracking-tight text-primary leading-tight">
              PerceptaCompute
            </h1>
            <p className="text-base text-muted leading-relaxed max-w-md">
              A real-time spatial intelligence system that predicts motion-based hazards using live
              visual input and physics-based reasoning.
            </p>
            <div className="flex flex-col gap-2 mt-2">
              {[
                { label: 'NeuroVision', status: isActive ? 'ACTIVE' : 'STANDBY' },
                { label: 'PhysicsOne', status: isActive ? 'ACTIVE' : 'STANDBY' },
                { label: 'EdgeNode', status: isActive ? 'CONNECTED' : 'WAITING' },
              ].map((s) => (
                <div key={s.label} className="flex items-center gap-2">
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-accent' : 'bg-muted'}`}
                  />
                  <span className="text-xs font-mono text-muted">
                    {s.label}:{' '}
                    <span className={isActive ? 'text-accent' : 'text-muted'}>{s.status}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Hero camera preview */}
          <div className="panel p-3 aspect-video">
            <Camera onDetection={handleDetection} onStatusChange={handleStatus} />
          </div>
        </section>

        {/* ── LIVE DASHBOARD ── */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-muted uppercase tracking-widest">
              Live System Dashboard
            </span>
            <div className="flex-1 h-px bg-border" />
            {isActive && (
              <span className="text-xs font-mono text-accent">
                ● {frameCount} frames processed
              </span>
            )}
          </div>

          <div className="grid grid-cols-3 gap-6">
            {/* Panel A: Vision Feed */}
            <div className="panel flex flex-col">
              <div className="panel-header">
                <span>NeuroVision Output</span>
                <span className={`text-xs ${isActive ? 'text-accent' : 'text-muted'}`}>
                  {isActive ? 'LIVE' : 'OFFLINE'}
                </span>
              </div>
              <div className="p-3 flex-1 min-h-[240px]">
                <Camera onDetection={handleDetection} onStatusChange={handleStatus} />
              </div>
            </div>

            {/* Panel B: Object list */}
            <div className="panel flex flex-col">
              <div className="panel-header">
                <span>Object Detection</span>
                <span className="text-xs text-muted">{objects.length} objects</span>
              </div>
              <div className="flex-1 min-h-[240px]">
                <ObjectList objects={objects} />
              </div>
            </div>

            {/* Panel C: Risk */}
            <div className="panel flex flex-col">
              <div className="panel-header">
                <span>Risk Engine</span>
                <span className="text-xs text-muted">Rule-based</span>
              </div>
              <div className="flex-1 min-h-[240px]">
                <RiskPanel assessment={risk} />
              </div>
            </div>
          </div>
        </section>

        {/* ── SYSTEM STATUS ── */}
        <section className="grid grid-cols-2 gap-6">
          <div className="panel">
            <div className="panel-header">
              <span>System Status</span>
            </div>
            <div className="p-4">
              <SystemStatus
                isActive={isActive}
                frameCount={frameCount}
                latency={latency}
              />
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <span>Data Pipeline</span>
            </div>
            <div className="p-4 overflow-x-auto">
              <FlowDiagram />
            </div>
          </div>
        </section>

        {/* ── WHY THIS EXISTS ── */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-muted uppercase tracking-widest">
              System Purpose
            </span>
            <div className="flex-1 h-px bg-border" />
          </div>
          <div className="panel p-6 max-w-2xl">
            <p className="text-sm text-muted leading-relaxed">
              PerceptaCompute is built to test real-time spatial reasoning using live visual input.
              The system focuses on motion prediction rather than static object detection, enabling
              early hazard awareness in dynamic environments. Phase 1 runs entirely in the browser.
              Phase 2 targets ESP32 wearable integration with vibration-based alerts.
            </p>
          </div>
        </section>

        {/* ── TECH STACK ── */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-muted uppercase tracking-widest">
              Tech Stack
            </span>
            <div className="flex-1 h-px bg-border" />
          </div>
          <div className="grid grid-cols-3 gap-4">
            {TECH_STACK.map((t) => (
              <div key={t.name} className="panel p-4 flex flex-col gap-1">
                <span className="text-sm font-mono text-primary">{t.name}</span>
                <span className="text-xs font-mono text-muted">{t.desc}</span>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* ── FOOTER ── */}
      <footer className="border-t border-border px-8 py-4 flex items-center justify-between">
        <span className="text-xs font-mono text-muted">
          Built for spatial intelligence research
        </span>
        <div className="flex items-center gap-6">
          <span className="text-xs font-mono text-muted">v0.1.0</span>
          <a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-mono text-muted hover:text-primary transition-colors duration-200"
          >
            GitHub
          </a>
        </div>
      </footer>
    </div>
  );
}
