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

      // Check awards after state updates stabilise by using a microtask
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

      return next;
    });

    // Audio Alerts
    audioEngine.update(assessment.risk, assessment.direction);

    if (settings.hapticAlerts && assessment.risk !== lastRisk.current) {
      if (assessment.risk === 'DANGER' || assessment.risk === 'WARNING') {
        triggerHaptic(assessment.risk);
      }
    }
    lastRisk.current = assessment.risk;
  }, [settings.mode, settings.sensitivity, settings.hapticAlerts, tracker, awardEngine]);

  const handleStatus = useCallback((active: boolean) => {
    setIsActive(active);
    if (active) {
      sessionStartedAt.current = Date.now();
    } else {
      setObjects([]);
      setRisk(DEFAULT_RISK);
      setFrameCount(0);
      setLatency(0);
      setSessionLog(clearSessionLog());
      setDangerCount(0);
      setActiveAwards([]);
      tracker.reset();
      awardEngine.reset();
      audioEngine.stop();
      lastTs.current = 0;
      lastRisk.current = 'SAFE';
      sessionStartedAt.current = null;
    }
  }, [tracker, awardEngine]);

  const clearSession = useCallback(() => {
    setSessionLog(clearSessionLog());
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
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg)' }}>
      <nav
        className="app-nav shrink-0 flex items-center justify-between"
        style={{
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg2)',
        }}
      >
        <div className="app-brand flex items-center">
          <span style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 16, color: 'var(--text-hi)' }}>
            PerceptaCompute
          </span>
          <span className="app-brand-subtitle" style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.06em' }}>
            Spatial awareness for motion
          </span>
        </div>

        <div className="app-nav-actions flex items-center">
          <div
            className="flex items-center gap-2"
            style={{
              padding: '6px 12px',
              border: `1px solid ${isActive ? 'rgba(74,222,128,0.25)' : 'var(--border)'}`,
              borderRadius: 4,
              background: isActive ? 'var(--green-lo)' : 'transparent',
            }}
          >
            <span
              className="rounded-full"
              style={{
                width: 6,
                height: 6,
                background: isActive ? 'var(--green)' : 'var(--text-dim)',
              }}
            />
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: isActive ? 'var(--green)' : 'var(--text-dim)' }}>
              {isActive ? 'Live' : 'Standby'}
            </span>
          </div>

          <a
            className="app-nav-link"
            href="https://github.com/VXOdc/PerceptaCompute"
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-dim)', textDecoration: 'none' }}
          >
            GitHub
          </a>

          <SettingsMenu settings={settings} onChange={setSettings} />
        </div>
      </nav>

      <main className="flex-1 w-full max-w-[1280px] mx-auto px-4 sm:px-6 py-6 flex flex-col gap-6">
        {/* Top: camera + sidebar */}
        <section
          className="top-grid grid gap-6"
        >
          <aside className="flex flex-col gap-4">
            <div>
              <h1 style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 28, color: 'var(--text-hi)', lineHeight: 1.2, marginBottom: 8 }}>
                Live detection
              </h1>
              <p style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.6 }}>
                Camera frames are analyzed for people, vehicles, and obstacles. All unique objects seen this session are logged below.
              </p>
            </div>

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
                    fontFamily: 'var(--mono)',
                    fontSize: 10,
                    padding: '4px 8px',
                    borderRadius: 4,
                    border: `1px solid ${on ? 'rgba(245,158,11,0.25)' : 'var(--border)'}`,
                    background: on ? 'rgba(245,158,11,0.06)' : 'transparent',
                    color: on ? 'var(--amber)' : 'var(--text-dim)',
                  }}
                >
                  {label}
                </span>
              ))}
            </div>

            <div className="panel">
              <div className="panel-header">
                <span>Risk</span>
                <span style={{ color: riskColor }}>{risk.risk} / {risk.score}</span>
              </div>
              <div style={{ minHeight: 300 }}>
                <RiskPanel assessment={risk} showConfidence={settings.showConfidence} />
              </div>
            </div>
          </aside>

          <div className="camera-panel panel overflow-hidden flex flex-col">
            <div className="panel-header">
              <span>Camera feed</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dim)' }}>
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

        {/* Dashboard row */}
        <section>
          <div className="flex items-center gap-3 mb-4">
            <h2 style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
              Detection dashboard
            </h2>
            <div className="flex-1" style={{ height: 1, background: 'var(--border)' }} />
            {isActive && (
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dim)' }}>
                {latency > 0 ? `${latency} ms round-trip` : 'Measuring latency…'}
              </span>
            )}
          </div>

          <div className="dashboard-grid grid gap-4">
            <div className="panel flex flex-col" style={{ minHeight: 280 }}>
              <div className="panel-header">
                <span>Session log</span>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={handleExport}
                    disabled={sessionLog.length === 0}
                    style={{
                      fontFamily: 'var(--mono)',
                      fontSize: 10,
                      color: sessionLog.length === 0 ? 'var(--border-hi)' : 'var(--amber)',
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
                      fontFamily: 'var(--mono)',
                      fontSize: 10,
                      color: sessionLog.length === 0 ? 'var(--border-hi)' : 'var(--text-dim)',
                      background: 'none',
                      border: 'none',
                      cursor: sessionLog.length === 0 ? 'default' : 'pointer',
                    }}
                  >
                    Clear
                  </button>
                </div>
              </div>
              <p style={{ padding: '8px 16px 0', fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.5 }}>
                Every distinct object the model has reported this session, with first and last seen times.
              </p>
              <div className="flex-1 overflow-hidden">
                <SessionLog sightings={sessionLog} isActive={isActive} />
              </div>
            </div>

            <div className="panel flex flex-col" style={{ minHeight: 280 }}>
              <div className="panel-header">
                <span>Current frame</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dim)' }}>
                  {objects.length} detected
                </span>
              </div>
              <p style={{ padding: '8px 16px 0', fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.5 }}>
                Objects visible in the latest analysis. Updates every scan interval.
              </p>
              <div className="flex-1 overflow-hidden">
                <ObjectList objects={objects} isActive={isActive} />
              </div>
            </div>

            <div
              className="panel flex flex-col"
              style={{
                minHeight: 280,
                borderColor: risk.risk !== 'SAFE' ? `${riskColor}33` : undefined,
              }}
            >
              <div className="panel-header">
                <span>Risk assessment</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: riskColor }}>{risk.risk} / {risk.score}</span>
              </div>
              <div className="flex-1">
                <RiskPanel assessment={risk} showConfidence={settings.showConfidence} />
              </div>
            </div>
          </div>
        </section>

        {/* System status */}
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
                      background: 'var(--bg3)',
                      border: '1px solid var(--border)',
                      borderRadius: 4,
                      minWidth: 72,
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ fontFamily: 'var(--display)', fontWeight: 600, fontSize: 11, color: 'var(--text-hi)' }}>
                      {node.label}
                    </div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--text-dim)', marginTop: 2 }}>
                      {node.sub}
                    </div>
                  </div>
                  {i < arr.length - 1 && (
                    <span style={{ color: 'var(--text-dim)', margin: '0 4px', fontSize: 10 }}>→</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer
        className="flex items-center justify-between shrink-0"
        style={{ padding: '12px 24px', borderTop: '1px solid var(--border)' }}
      >
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dim)' }}>
          © {new Date().getFullYear()} PerceptaCompute
        </span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dim)' }}>
          v0.4.0
        </span>
      </footer>

      <AwardToast awards={activeAwards} onDismiss={dismissAward} />
    </div>
  );
}
