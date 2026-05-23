'use client';

import { useEffect, useState } from 'react';
import { Award } from '@/lib/awards';

interface AwardToastProps {
  awards: Award[];
  onDismiss: (id: string) => void;
}

const TIER_COLORS: Record<Award['tier'], { border: string; bg: string; text: string; label: string }> = {
  bronze:   { border: 'rgba(205,127,50,0.5)',  bg: 'rgba(205,127,50,0.08)',  text: '#cd7f32', label: 'Bronze'   },
  silver:   { border: 'rgba(192,192,192,0.5)', bg: 'rgba(192,192,192,0.08)', text: '#c0c0c0', label: 'Silver'   },
  gold:     { border: 'rgba(245,158,11,0.5)',  bg: 'rgba(245,158,11,0.08)',  text: '#f59e0b', label: 'Gold'     },
  platinum: { border: 'rgba(34,211,238,0.6)',  bg: 'rgba(34,211,238,0.10)', text: '#22d3ee', label: 'Platinum' },
};

const AUTO_DISMISS_MS = 5000;

function AwardItem({ award, onDismiss }: { award: Award; onDismiss: () => void }) {
  const [visible, setVisible] = useState(false);
  const colors = TIER_COLORS[award.tier];

  // Animate in
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 20);
    return () => clearTimeout(t);
  }, []);

  // Auto-dismiss
  useEffect(() => {
    const t = setTimeout(() => {
      setVisible(false);
      setTimeout(onDismiss, 300); // let fade-out finish
    }, AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div
      role="status"
      aria-live="polite"
      onClick={() => { setVisible(false); setTimeout(onDismiss, 300); }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 14px',
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        borderRadius: 6,
        backdropFilter: 'blur(8px)',
        cursor: 'pointer',
        userSelect: 'none',
        transform: visible ? 'translateX(0)' : 'translateX(120%)',
        opacity: visible ? 1 : 0,
        transition: 'transform 0.3s cubic-bezier(0.16,1,0.3,1), opacity 0.3s ease',
        minWidth: 260,
        maxWidth: 320,
        boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
      }}
    >
      <span style={{ fontSize: 24, lineHeight: 1 }}>{award.icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '0.16em', textTransform: 'uppercase', color: colors.text }}>
            {colors.label} Award
          </span>
        </div>
        <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 14, color: 'var(--text-hi)', lineHeight: 1.2 }}>
          {award.title}
        </div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text-dim)', marginTop: 2, lineHeight: 1.4 }}>
          {award.subtitle}
        </div>
      </div>
    </div>
  );
}

export default function AwardToast({ awards, onDismiss }: AwardToastProps) {
  if (awards.length === 0) return null;

  return (
    <div
      aria-label="Awards"
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        alignItems: 'flex-end',
        pointerEvents: 'none',
      }}
    >
      {awards.map(award => (
        <div key={award.id} style={{ pointerEvents: 'auto' }}>
          <AwardItem award={award} onDismiss={() => onDismiss(award.id)} />
        </div>
      ))}
    </div>
  );
}
