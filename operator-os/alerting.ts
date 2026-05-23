/**
 * alerting.ts — T9: Stale Key Expiry + Alert Escalation Suppression
 *
 * T9a: pruneStaleKeys() evicts cooldown map entries older than 2× maxCooldown.
 *      Without this, the map grows monotonically across a long session.
 *
 * T9b: Alert escalation suppression — if the same key fires 3+ DANGER alerts
 *      within 5 consecutive cooldown windows, a 500 ms suppression is applied
 *      to prevent alert saturation from a persistent close-proximity object.
 */
import { createId } from '@/core/ids';
import { OperationalContext, RiskAssessment } from '@/core/types';

export interface OperatorAlert {
  id:           string;
  createdAt:    number;
  severity:     RiskAssessment['risk'];
  direction:    RiskAssessment['direction'];
  message:      string;
  acknowledged: boolean;
  context:      OperationalContext;
}

interface AlertRecord {
  lastAt:       number;
  dangerCount:  number;
  suppressUntil: number;
}

const MAX_COOLDOWN_MS        = 4_000;  // Longest cooldown (WARNING)
const PRUNE_AGE_MS           = MAX_COOLDOWN_MS * 2;
const ESCALATION_WINDOW_MS   = 5_000;
const ESCALATION_THRESHOLD   = 3;
const SUPPRESSION_EXTRA_MS   = 500;

export class OperatorAlerting {
  private records = new Map<string, AlertRecord>();

  evaluate(assessment: RiskAssessment, context: OperationalContext, now = Date.now()): OperatorAlert | null {
    if (assessment.risk === 'SAFE') return null;

    // T9a: Prune stale keys on every evaluate call
    this.pruneStaleKeys(now);

    const key         = `${context.cameraId}:${assessment.risk}:${assessment.direction}`;
    const cooldownMs  = assessment.risk === 'DANGER' ? 1_200 : 4_000;
    const record      = this.records.get(key) ?? { lastAt: 0, dangerCount: 0, suppressUntil: 0 };

    // Check suppression window first
    if (now < record.suppressUntil) return null;
    if (now - record.lastAt < cooldownMs) return null;

    // T9b: Track escalation — suppress if too many rapid DANGER alerts
    let dangerCount = record.dangerCount;
    let suppressUntil = record.suppressUntil;
    if (assessment.risk === 'DANGER') {
      const withinWindow = (now - record.lastAt) < ESCALATION_WINDOW_MS;
      dangerCount = withinWindow ? dangerCount + 1 : 1;
      if (dangerCount >= ESCALATION_THRESHOLD) {
        suppressUntil = now + SUPPRESSION_EXTRA_MS;
        dangerCount   = 0;
      }
    } else {
      dangerCount = 0;
    }

    this.records.set(key, { lastAt: now, dangerCount, suppressUntil });

    const topFactor = assessment.factors[0]?.label ?? 'unclassified risk';
    return {
      id:           createId('alert', now),
      createdAt:    now,
      severity:     assessment.risk,
      direction:    assessment.direction,
      message:      `${assessment.risk}: ${topFactor} (${assessment.direction})`,
      acknowledged: false,
      context,
    };
  }

  private pruneStaleKeys(now: number): void {
    for (const [key, record] of this.records) {
      if (now - record.lastAt > PRUNE_AGE_MS) {
        this.records.delete(key);
      }
    }
  }
}
