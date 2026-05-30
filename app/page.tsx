'use client';

import { useState, useCallback, useRef, useMemo } from 'react';
import Camera from '../components/Camera';
import ObjectList from '../components/ObjectList';
import SessionLog from '../components/SessionLog';
import RiskPanel from '../components/RiskPanel';
import SystemStatus from '../components/SystemStatus';
import SettingsMenu, { Settings } from '../components/SettingsMenu';
import AwardToast from '../components/AwardToast';
import { SpatialTracker } from '../lib/tracker';
import { computeRisk } from '../lib/riskEngine';
import { updateSessionLog, clearSessionLog, SessionSighting } from '../lib/sessionLog';
import { audioEngine } from '../lib/audioEngine';
import { exportToCSV } from '../lib/exportUtils';
import { DetectionResponse, TrackedObject, RiskAssessment } from '../lib/types';
import { AwardEngine, Award } from '../lib/awards';

const DEFAULT_RISK: RiskAssessment = {
  risk: 'SAFE',
  direction: 'NONE',
  confidence: 0,
  score: 0,
  horizonSec: 5,
  factors: [],
};
const DEFAULT_SETTINGS: Settings = {
  interval: 300,
  showConfidence: true,
  hapticAlerts: false,
  mode: 'run',
  sensitivity: 'med',
};

const MODE_LABEL: Record<string, string> = { run: 'Run', walk: 'Walk', cycle: 'Cycle' };

function currentFrameTracks(tracks: TrackedObject[]): TrackedObject[] {
  return tracks.filter(track => !track.stale && track.framesMissing === 0);
}

function triggerHaptic(risk: RiskAssessment['risk']) {
  if (typeof navigator === 'undefined' || !navigator.vibrate) return;
  if (risk === 'DANGER') navigator.vibrate([120, 60, 120]);
  else if (risk === 'WARNING') navigator.vibrate(80);
}

export default function Home() {
  const [isActive, setIsActive] = useState(false);
  const [objects, setObjects] = useState<TrackedObject[]>([]);
  const [sessionLog, setSessionLog] = useState<SessionSighting[]>([]);
  const [risk, setRisk] = useState<RiskAssessment>(DEFAULT_RISK);
  const [frameCount, setFrameCount] = useState(0);
  const [latency, setLatency] = useState(0);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [activeAwards, setActiveAwards] = useState<Award[]>([]);
  const [dangerCount, setDangerCount] = useState(0);
  const sessionStartedAt = useRef<number | null>(null);

  const tracker = useMemo(() => new SpatialTracker(), []);
  const awardEngine = useMemo(() => new AwardEngine(), []);
  const lastTs = useRef(0);
  const lastRisk = useRef<RiskAssessment['risk']>('SAFE');

  const handleDetection = useCallback((result: DetectionResponse) => {
    const now = Date.now();
    if (lastTs.current > 0) setLatency(now - lastTs.current);
    lastTs.current = now;

    const tracked = tracker.update(result.objects);
    const currentTracks = currentFrameTracks(tracked);
    const assessment = computeRisk(currentTracks, settings.sensitivity, {
      siteId: 'browser-demo',
      zoneId: 'local',
      cameraId: 'browser-camera',
      mode: settings.mode,
    });

    setObjects(currentTracks);
    setRisk(assessment);
    setFrameCount(n => {
      const next = n + 1;

      setSessionLog(prev => {
        const nextLog = updateSessionLog(prev, currentTracks, now);
        setDangerCount(dc => {
          const nextDangerCount = assessment.risk === 'DANGER' && lastRisk.current !== 'DANGER' ? dc + 1 : dc;
          const newAwards = awardEngine.check({
            frameCount: next,
            sessionLog: nextLog,
            risk: assessment,
            dangerCount: nextDangerCount,
            sessionStartedAt: sessionStartedAt.current,
          });
          if (newAwards.length > 0) {
            setActiveAwards(prev => [...prev, ...newAwards]);
          }
          return nextDangerCount;
        });
        return nextLog;
      });

      if (settings.hapticAlerts) triggerHaptic(assessment.risk);
      if (assessment.risk !== lastRisk.current) { 
       audioEngine.update(assessment.risk, assessment.direction);
      }
      lastRisk.current = assessment.risk;

      return next;
    });
  }, [tracker, awardEngine, settings]);

  const handleStatus = useCallback((active: boolean) => {
    setIsActive(active);
    if (active && sessionStartedAt.current === null) {
      sessionStartedAt.current = Date.now();
    }
  }, []);

  const clearSession = useCallback(() => {
    setSessionLog([]);
    clearSessionLog();
  }, []);

  const handleExport = useCallback(() => {
    exportToCSV(sessionLog);
  }, [sessionLog]);

  const dismissAward = useCallback((id: string) => {
    setActiveAwards(prev => prev.filter(a => a.id !== id));
  }, []);

  const riskColor =
    risk.risk === 'DANGER' ? 'var(--red)' :
    risk.risk === 'WARNING' ? 'var(--orange)' : 'var(--green)';

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg)', color: 'var(--text-primary)' }}>

      {/* ── Nav — matches marketing site-nav ── */}
      <nav
        className="app-nav shrink-0 flex items-center justify-between"
        style={{
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--nav-bg)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          position: 'sticky',
          top: 0,
          zIndex: 50,
        }}
      >
        <div className="app-brand flex items-center" style={{ gap: 10 }}>
          {/* Logo matches marketing logo.svg */}
          <svg
            width="28"
            height="28"
            viewBox="0 0 100 100"
            xmlns="http://www.w3.org/2000/svg"
            style={{ borderRadius: 6, flexShrink: 0 }}
          >
            <rect width="100" height="100" rx="22" fill="#111113"/>
            <path d="M18 18 L18 32 M18 18 L32 18" stroke="#888" strokeWidth="7" strokeLinecap="round" fill="none"/>
            <path d="M82 18 L82 32 M82 18 L68 18" stroke="#888" strokeWidth="7" strokeLinecap="round" fill="none"/>
            <path d="M18 82 L18 68 M18 82 L32 82" stroke="#888" strokeWidth="7" strokeLinecap="round" fill="none"/>
            <path d="M82 82 L82 68 M82 82 L68 82" stroke="#888" strokeWidth="7" strokeLinecap="round" fill="none"/>
            <circle cx="50" cy="50" r="17" stroke="#777" strokeWidth="4" fill="none"/>
            <line x1="50" y1="26" x2="50" y2="38" stroke="#777" strokeWidth="4" strokeLinecap="round"/>
            <line x1="50" y1="62" x2="50" y2="74" stroke="#777" strokeWidth="4" strokeLinecap="round"/>
            <line x1="26" y1="50" x2="38" y2="50" stroke="#777" strokeWidth="4" strokeLinecap="round"/>
            <line x1="62" y1="50" x2="74" y2="50" stroke="#777" strokeWidth="4" strokeLinecap="round"/>
            <circle cx="50" cy="50" r="7" fill="#999"/>
          </svg>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 17, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
            PerceptaCompute
          </span>
          <span className="app-brand-subtitle" style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 400 }}>
            Live demo
          </span>
        </div>

        <div className="app-nav-actions flex items-center" style={{ gap: 16 }}>
          {/* Live / Standby badge */}
          <div
            className="flex items-center gap-2"
            style={{
              padding: '6px 12px',
              border: `1px solid ${isActive ? 'rgba(5,150,105,0.3)' : 'var(--border-subtle)'}`,
              borderRadius: 'var(--radius-full)',
              background: isActive ? 'rgba(5, 150, 105, 0.06)' : 'var(--surface-subtle)',
            }}
          >
            <span
              className="rounded-full"
              style={{
                width: 6,
                height: 6,
                background: isActive ? 'var(--green)' : 'var(--text-muted)',
              }}
            />
            <span style={{ fontSize: 12, fontWeight: 500, color: isActive ? 'var(--green)' : 'var(--text-muted)' }}>
              {isActive ? 'Live' : 'Standby'}
            </span>
          </div>

          <a
            className="app-nav-link"
            href="https://github.com/VXOdc/PerceptaCompute"
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', textDecoration: 'none' }}
          >
            GitHub
          </a>

          <SettingsMenu settings={settings} onChange={setSettings} />
        </div>
      </nav>

      <main className="flex-1 w-full max-w-[1280px] mx-auto px-4 sm:px-6 py-6 flex flex-col gap-6">

        {/* ── Top: camera + sidebar ── */}
        <section className="top-grid grid gap-6">
          <aside className="flex flex-col gap-4">
            <div>
              <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)', marginBottom: 8, letterSpacing: '0.01em' }}>
                Browser demo · no account required
              </p>
              <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 26, color: 'var(--text-primary)', lineHeight: 1.2, marginBottom: 8, letterSpacing: '-0.02em' }}>
                Live detection
              </h1>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                Camera frames are analyzed for people, vehicles, and obstacles. All unique objects seen this session are logged below.
              </p>
            </div>

            {/* Status tags */}
            <div className="flex flex-wrap gap-2">
              {[
                { label: `${MODE_LABEL[settings.mode] ?? settings.mode} mode`, on: true },
                { label: `${settings.interval} ms scan`, on: isActive },
                { label: `${objects.length} in frame`, on: objects.length > 0 },
                { label: `${sessionLog.length} session total`, on: sessionLog.length > 0 },
              ].map(({ label, on }) => (
                <span
                  key={label}
                  style={{
                    fontSize: 11,
                    fontWeight: 500,
                    padding: '4px 10px',
                    borderRadius: 'var(--radius-full)',
                    border: `1px solid ${on ? 'rgba(37,99,235,0.25)' : 'var(--border-subtle)'}`,
                    background: on ? 'var(--accent-soft)' : 'var(--surface-subtle)',
                    color: on ? 'var(--accent)' : 'var(--text-muted)',
                  }}
                >
                  {label}
                </span>
              ))}
            </div>

            {/* Risk panel */}
            <div className="panel">
              <div className="panel-header">
                <span>Risk assessment</span>
                <span style={{ fontWeight: 600, color: riskColor }}>{risk.risk} · {risk.score}</span>
              </div>
              <div style={{ minHeight: 300 }}>
                <RiskPanel assessment={risk} showConfidence={settings.showConfidence} />
              </div>
            </div>
          </aside>

          {/* Camera */}
          <div className="camera-panel panel overflow-hidden flex flex-col">
            <div className="panel-header">
              <span>Camera feed</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                Single stream · {frameCount} frames
              </span>
            </div>
            <div className="flex-1 min-h-[360px]">
              <Camera
                onDetection={handleDetection}
                onStatusChange={handleStatus}
                interval={settings.interval}
                objects={objects}
              />
            </div>
          </div>
        </section>

        {/* ── Detection dashboard ── */}
        <section>
          <div className="flex items-center gap-3 mb-4">
            <h2 style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Detection dashboard
            </h2>
            <div className="flex-1" style={{ height: 1, background: 'var(--border-subtle)' }} />
            {isActive && (
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {latency > 0 ? `${latency} ms round-trip` : 'Measuring latency…'}
              </span>
            )}
          </div>

          <div className="dashboard-grid grid gap-4">
            {/* Session log */}
            <div className="panel flex flex-col" style={{ minHeight: 280 }}>
              <div className="panel-header">
                <span>Session log</span>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={handleExport}
                    disabled={sessionLog.length === 0}
                    style={{
                      fontSize: 12,
                      fontWeight: 500,
                      color: sessionLog.length === 0 ? 'var(--border-hi)' : 'var(--accent)',
                      background: 'none',
                      border: 'none',
                      cursor: sessionLog.length === 0 ? 'default' : 'pointer',
                    }}
                  >
                    Export
                  </button>
                  <button
                    type="button"
                    onClick={clearSession}
                    disabled={sessionLog.length === 0}
                    style={{
                      fontSize: 12,
                      fontWeight: 500,
                      color: sessionLog.length === 0 ? 'var(--border-hi)' : 'var(--text-secondary)',
                      background: 'none',
                      border: 'none',
                      cursor: sessionLog.length === 0 ? 'default' : 'pointer',
                    }}
                  >
                    Clear
                  </button>
                </div>
              </div>
              <p style={{ padding: '8px 16px 0', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                Every distinct object the model has reported this session, with first and last seen times.
              </p>
              <div className="flex-1 overflow-hidden">
                <SessionLog sightings={sessionLog} isActive={isActive} />
              </div>
            </div>

            {/* Current frame */}
            <div className="panel flex flex-col" style={{ minHeight: 280 }}>
              <div className="panel-header">
                <span>Current frame</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {objects.length} detected
                </span>
              </div>
              <p style={{ padding: '8px 16px 0', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                Objects visible in the latest analysis. Updates every scan interval.
              </p>
              <div className="flex-1 overflow-hidden">
                <ObjectList objects={objects} isActive={isActive} />
              </div>
            </div>

            {/* Risk panel (dashboard row) */}
            <div
              className="panel flex flex-col"
              style={{
                minHeight: 280,
                borderColor: risk.risk !== 'SAFE' ? `${riskColor}33` : undefined,
              }}
            >
              <div className="panel-header">
                <span>Risk factors</span>
                <span style={{ fontWeight: 600, color: riskColor }}>{risk.risk} · {risk.score}</span>
              </div>
              <div className="flex-1">
                <RiskPanel assessment={risk} showConfidence={settings.showConfidence} />
              </div>
            </div>
          </div>
        </section>

        {/* ── System status + pipeline ── */}
        <section className="system-grid grid gap-4">
          <div className="panel">
            <div className="panel-header"><span>System status</span></div>
            <div className="p-4">
              <SystemStatus
                isActive={isActive}
                frameCount={frameCount}
                latency={latency}
                mode={settings.mode}
                sensitivity={settings.sensitivity}
                sessionObjectCount={sessionLog.length}
              />
            </div>
          </div>

          <div className="panel">
            <div className="panel-header"><span>Pipeline</span></div>
            <div className="p-4 flex items-center justify-between gap-2 overflow-x-auto">
              {[
                { label: 'Camera', sub: 'Device feed' },
                { label: 'BlurGate', sub: 'Quality filter' },
                { label: 'Vision', sub: 'Pixtral 12B' },
                { label: 'Tracker', sub: 'Motion delta' },
                { label: 'Risk', sub: 'Rule engine' },
                { label: 'Output', sub: 'UI + haptic' },
              ].map((node, i, arr) => (
                <div key={node.label} className="flex items-center shrink-0">
                  <div
                    style={{
                      padding: '8px 12px',
                      background: 'var(--surface-subtle)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-md)',
                      minWidth: 80,
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--text-primary)' }}>
                      {node.label}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                      {node.sub}
                    </div>
                  </div>
                  {i < arr.length - 1 && (
                    <span style={{ color: 'var(--border-hi)', margin: '0 6px', fontSize: 12 }}>→</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* ── Footer — matches marketing site-footer ── */}
      <footer
        className="flex items-center justify-between shrink-0"
        style={{
          padding: '16px 24px',
          borderTop: '1px solid var(--border-subtle)',
          background: 'var(--surface-base)',
        }}
      >
        <div className="flex items-center gap-6">
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
            PerceptaCompute
          </span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Spatial awareness for machines.
          </span>
        </div>
        <div className="flex items-center gap-4">
          <a href="https://perceptacompute.vercel.app" target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 12, color: 'var(--text-muted)', textDecoration: 'none' }}>
            Marketing site
          </a>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            © {new Date().getFullYear()} PerceptaCompute
          </span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            v0.4.0
          </span>
        </div>
      </footer>

      <AwardToast awards={activeAwards} onDismiss={dismissAward} />
    </div>
  );
}
