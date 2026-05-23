import { Direction, OperationalContext, RiskAssessment, RiskFactor, RiskLevel, TrackedObject } from '@/core/types';
import { directionFromCentroid } from '@/spatial/geometry';

const MODE_MULTIPLIER: Record<OperationalContext['mode'], number> = {
  run: 1.2,
  walk: 1,
  cycle: 1.35,
  vehicle: 1.6,
  industrial: 1.45,
};

const SENSITIVITY: Record<string, { danger: number; warning: number }> = {
  low: { danger: 92, warning: 58 },
  med: { danger: 78, warning: 44 },
  high: { danger: 62, warning: 32 },
};

function baseObjectRisk(track: TrackedObject): RiskFactor[] {
  const factors: RiskFactor[] = [];
  const proximityScore = Math.max(0, 45 - track.estimatedDistanceM * 2.4);
  if (proximityScore > 0) {
    factors.push({ code: 'proximity', label: `${track.type} estimated ${track.estimatedDistanceM}m away`, score: proximityScore, objectId: track.trackId });
  }

  if (track.motion === 'approaching') {
    factors.push({ code: 'closing_velocity', label: `${track.type} moving toward operator`, score: 28 + track.speedMps * 8, objectId: track.trackId });
  }

  if (track.motion === 'crossing') {
    factors.push({ code: 'cross_traffic', label: `${track.type} crossing operator path`, score: 18, objectId: track.trackId });
  }

  if (track.timeToImpactSec !== null && track.timeToImpactSec <= 5) {
    factors.push({ code: 'short_tti', label: `time-to-impact ${track.timeToImpactSec}s`, score: 35 - track.timeToImpactSec * 4, objectId: track.trackId });
  }

  const centerBias = 1 - Math.min(1, Math.abs(track.centroid.x - 0.5) / 0.5);
  if (centerBias > 0.45) {
    factors.push({ code: 'path_occupancy', label: `${track.type} inside forward corridor`, score: centerBias * 24, objectId: track.trackId });
  }

  if (track.type === 'car' || track.type === 'bike') {
    factors.push({ code: 'vehicle_class', label: `${track.type} has high kinetic hazard`, score: track.type === 'car' ? 18 : 12, objectId: track.trackId });
  }

  if (track.stale) {
    factors.push({ code: 'stale_track', label: `${track.type} temporarily occluded`, score: -10, objectId: track.trackId });
  }

  return factors;
}

export class RiskPipeline {
  assess(
    tracks: TrackedObject[],
    context: Partial<OperationalContext> = {},
    sensitivity = 'med'
  ): RiskAssessment {
    if (tracks.length === 0) {
      return { risk: 'SAFE', direction: 'NONE', confidence: 1, score: 0, horizonSec: 5, factors: [] };
    }

    const multiplier = MODE_MULTIPLIER[context.mode ?? 'walk'] ?? 1;
    const thresholds = SENSITIVITY[sensitivity] ?? SENSITIVITY.med;
    let topScore = 0;
    let topDirection: Direction = 'NONE';
    let primaryObjectId: string | undefined;
    const factors: RiskFactor[] = [];

    for (const track of tracks) {
      const trackFactors = baseObjectRisk(track);
      const score = trackFactors.reduce((sum, factor) => sum + factor.score, 0) * multiplier;
      factors.push(...trackFactors);

      if (score > topScore) {
        topScore = score;
        topDirection = directionFromCentroid(track.centroid);
        primaryObjectId = track.trackId;
      }
    }

    const risk: RiskLevel =
      topScore >= thresholds.danger ? 'DANGER' :
      topScore >= thresholds.warning ? 'WARNING' :
      'SAFE';

    return {
      risk,
      direction: topDirection,
      confidence: Math.max(0.05, Math.min(1, topScore / thresholds.danger)),
      score: Math.round(topScore),
      horizonSec: 5,
      factors: factors
        .filter(factor => Math.abs(factor.score) > 1)
        .sort((a, b) => Math.abs(b.score) - Math.abs(a.score))
        .slice(0, 8),
      primaryObjectId,
    };
  }
}
