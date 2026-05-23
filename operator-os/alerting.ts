import { createId } from '@/core/ids';
import { OperationalContext, RiskAssessment } from '@/core/types';

export interface OperatorAlert {
  id: string;
  createdAt: number;
  severity: RiskAssessment['risk'];
  direction: RiskAssessment['direction'];
  message: string;
  acknowledged: boolean;
  context: OperationalContext;
}

export class OperatorAlerting {
  private lastAlertAt = new Map<string, number>();

  evaluate(assessment: RiskAssessment, context: OperationalContext, now = Date.now()): OperatorAlert | null {
    if (assessment.risk === 'SAFE') return null;

    const key = `${context.cameraId}:${assessment.risk}:${assessment.direction}`;
    const cooldownMs = assessment.risk === 'DANGER' ? 1_200 : 4_000;
    const last = this.lastAlertAt.get(key) ?? 0;
    if (now - last < cooldownMs) return null;

    this.lastAlertAt.set(key, now);
    const topFactor = assessment.factors[0]?.label ?? 'unclassified risk';
    return {
      id: createId('alert', now),
      createdAt: now,
      severity: assessment.risk,
      direction: assessment.direction,
      message: `${assessment.risk}: ${topFactor} (${assessment.direction})`,
      acknowledged: false,
      context,
    };
  }
}
