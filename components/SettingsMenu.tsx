'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

export interface Settings {
  interval: number;
  showConfidence: boolean;
  hapticAlerts: boolean;
  mode: 'run' | 'walk' | 'cycle';
  sensitivity: 'low' | 'med' | 'high';
}

interface SettingsMenuProps {
  settings: Settings;
  onChange: (s: Settings) => void;
}

const MODE_INTERVALS: Record<Settings['mode'], number> = { run: 300, walk: 600, cycle: 200 };

const MODE_LABELS: Record<Settings['mode'], string> = {
  run: 'Run',
  walk: 'Walk',
  cycle: 'Cycle',
};

function GearIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="7.5" cy="7.5" r="2" />
      <path d="M7.5 1v1.5M7.5 12.5V14M1 7.5h1.5M12.5 7.5H14M2.6 2.6l1.1 1.1M11.3 11.3l1.1 1.1M11.3 3.7l-1.1 1.1M3.8 11.3l-1.1 1.1" />
    </svg>
  );
}

function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  labels,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  labels?: Record<T, string>;
}) {
  return (
    <div className="grid grid-cols-3 gap-1">
      {options.map(opt => {
        const active = value === opt;
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            style={{
              padding: '8px 4px',
              fontFamily: 'var(--mono)',
              fontSize: 11,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              borderRadius: 4,
              border: `1px solid ${active ? 'var(--amber)' : 'var(--border)'}`,
              background: active ? 'rgba(245,158,11,0.12)' : 'var(--bg3)',
              color: active ? 'var(--amber)' : 'var(--text-dim)',
              cursor: 'pointer',
            }}
          >
            {labels?.[opt] ?? opt}
          </button>
        );
      })}
    </div>
  );
}

function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: () => void; label: string; description?: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <div style={{ fontSize: 13, color: 'var(--text-hi)' }}>{label}</div>
        {description && (
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2, lineHeight: 1.4 }}>{description}</div>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={onChange}
        style={{
          width: 40,
          height: 22,
          borderRadius: 11,
          border: `1px solid ${checked ? 'rgba(245,158,11,0.4)' : 'var(--border)'}`,
          background: checked ? 'rgba(245,158,11,0.2)' : 'var(--bg3)',
          position: 'relative',
          flexShrink: 0,
          cursor: 'pointer',
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 2,
            left: checked ? 20 : 2,
            width: 16,
            height: 16,
            borderRadius: 8,
            background: checked ? 'var(--amber)' : 'var(--text-dim)',
            transition: 'left 0.15s ease',
          }}
        />
      </button>
    </div>
  );
}

export default function SettingsMenu({ settings, onChange }: SettingsMenuProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open]);

  const update = (patch: Partial<Settings>) => onChange({ ...settings, ...patch });

  const drawer = open && mounted ? createPortal(
    <>
      <div
        role="presentation"
        onClick={() => setOpen(false)}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.55)',
          zIndex: 100,
        }}
      />
      <aside
        role="dialog"
        aria-label="Settings"
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          width: 320,
          maxWidth: '100vw',
          height: '100vh',
          background: 'var(--bg2)',
          borderLeft: '1px solid var(--border)',
          zIndex: 101,
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '-8px 0 32px rgba(0,0,0,0.4)',
        }}
      >
        <header
          className="flex items-center justify-between shrink-0"
          style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}
        >
          <div>
            <h2 style={{ fontFamily: 'var(--display)', fontWeight: 600, fontSize: 16, color: 'var(--text-hi)' }}>Settings</h2>
            <p style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>Detection and alert preferences</p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close settings"
            style={{
              width: 32,
              height: 32,
              border: '1px solid var(--border)',
              borderRadius: 4,
              background: 'var(--bg3)',
              color: 'var(--text-dim)',
              cursor: 'pointer',
              fontSize: 18,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </header>

        <div className="flex-1 overflow-y-auto" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 24 }}>
          <section>
            <h3 style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 8 }}>
              Activity mode
            </h3>
            <p style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 12, lineHeight: 1.5 }}>
              Sets how often frames are sent for analysis. Run scans fastest; walk scans slowest to save battery.
            </p>
            <SegmentedControl
              options={['run', 'walk', 'cycle'] as const}
              value={settings.mode}
              labels={MODE_LABELS}
              onChange={m => update({ mode: m, interval: MODE_INTERVALS[m] })}
            />
          </section>

          <section>
            <h3 style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: 8 }}>
              Alert sensitivity
            </h3>
            <p style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 12, lineHeight: 1.5 }}>
              How easily nearby objects trigger warnings. High reacts to objects farther away.
            </p>
            <SegmentedControl
              options={['low', 'med', 'high'] as const}
              value={settings.sensitivity}
              onChange={s => update({ sensitivity: s })}
            />
          </section>

          <section style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <h3 style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-dim)' }}>
              Display & alerts
            </h3>
            <Toggle
              checked={settings.showConfidence}
              onChange={() => update({ showConfidence: !settings.showConfidence })}
              label="Show confidence"
              description="Display risk confidence percentage in the risk panel."
            />
            <Toggle
              checked={settings.hapticAlerts}
              onChange={() => update({ hapticAlerts: !settings.hapticAlerts })}
              label="Haptic alerts"
              description="Vibrate on WARNING or DANGER when supported by your device."
            />
          </section>

          <section
            style={{
              padding: 12,
              background: 'var(--bg3)',
              border: '1px solid var(--border)',
              borderRadius: 4,
            }}
          >
            <div className="flex justify-between items-center">
              <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-dim)' }}>Scan interval</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--amber)' }}>{settings.interval} ms</span>
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 8, lineHeight: 1.4 }}>
              Controlled by activity mode. Change mode above to adjust scan rate.
            </p>
          </section>
        </div>
      </aside>
    </>,
    document.body
  ) : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open settings"
        aria-expanded={open}
        style={{
          width: 36,
          height: 36,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: `1px solid ${open ? 'rgba(245,158,11,0.35)' : 'var(--border)'}`,
          borderRadius: 4,
          background: open ? 'rgba(245,158,11,0.08)' : 'var(--bg2)',
          color: open ? 'var(--amber)' : 'var(--text-dim)',
          cursor: 'pointer',
        }}
      >
        <GearIcon />
      </button>
      {drawer}
    </>
  );
}
