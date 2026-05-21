import { TrackedObject, RiskAssessment, RiskLevel, Direction } from './types';

const DISTANCE_SCORE: Record<string, number> = { near: 40, mid: 20, far: 5 };
const MOTION_SCORE: Record<string, number> = { approaching: 40, static: 5, leaving: -10 };
const POSITION_SCORE: Record<string, number> = { center: 20, left: 10, right: 10 };

function objectDirection(obj: TrackedObject): Direction {
  if (obj.position === 'center') return 'FRONT';
  if (obj.position === 'left') return 'LEFT';
  return 'RIGHT';
}

/**
 * Converts tracked objects into a single risk decision.
 * Pure rule-based scoring — no ML, no external calls.
 */
export function computeRisk(objects: TrackedObject[]): RiskAssessment {
  if (objects.length === 0) {
    return { risk: 'SAFE', direction: 'NONE', confidence: 1.0 };
  }

  let topScore = 0;
  let topDirection: Direction = 'NONE';

  for (const obj of objects) {
    const score =
      (DISTANCE_SCORE[obj.distance] ?? 0) +
      (MOTION_SCORE[obj.motion] ?? 0) +
      (POSITION_SCORE[obj.position] ?? 0);

    if (score > topScore) {
      topScore = score;
      topDirection = objectDirection(obj);
    }
  }

  let risk: RiskLevel = 'SAFE';
  if (topScore >= 90) risk = 'DANGER';
  else if (topScore >= 50) risk = 'WARNING';

  const confidence = Math.min(topScore / 100, 1.0);

  return { risk, direction: topDirection, confidence };
}
