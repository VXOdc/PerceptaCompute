# PerceptaCompute Platform Upgrade Report

## Problem
The original platform mixed product UI, camera capture, model prompting, tracking, and risk scoring in one browser-first Next app. NeuroCompute duplicated the Pixtral integration with a different schema. The physics engine lived as a single 59 KB React sandbox file with useful collision concepts but no reusable platform interface.

## Why It Matters
This made PerceptaCompute look like a strong demo rather than an operational intelligence company. Operators need stable identity tracking, measurable latency, incident memory, edge backpressure, replay, alert throttling, and deployment realism. Investors will probe exactly those systems.

## Improved Architecture
PerceptaCompute now has a unified platform spine:

```text
PerceptaCompute/
  core/             shared operational schemas and IDs
  event-bus/        typed in-process event stream
  telemetry/        frame ingestion metadata
  inference/        provider abstraction and orchestration
  temporal/         multi-object tracker with association
  spatial/          geometry and corridor reasoning
  risk-engine/      risk pipeline with factors and time-to-impact
  operator-os/      alert cooldowns and operator-facing messages
  storage/          operational memory and incident retention
  simulation/       physics-backed short-horizon prediction
  replay/           incident replay buffers
  observability/    metric registry and latency percentiles
  edge-runtime/     adaptive frame scheduler and backpressure
  deployment/       Docker deployment baseline
```

## Code Changes
- Replaced `lib/tracker.ts` with a compatibility wrapper over `temporal/multi-object-tracker.ts`.
- Replaced `lib/riskEngine.ts` with a compatibility wrapper over `risk-engine/risk-pipeline.ts`.
- Replaced the fragile detection route with `inference/vision-provider.ts` sanitization and provider abstraction.
- Added `app/api/pipeline/route.ts` for full frame-to-risk pipeline output.
- Added `lib/exportUtils.ts` and removed the broken misspelled CSV exporter.
- Updated UI panels to surface risk score, risk factors, time-to-impact, and crossing motion.
- Added deployment baseline with `deployment/web.Dockerfile` and `deployment/docker-compose.yml`.

## File Structure
The main production additions are:

```text
core/types.ts
event-bus/events.ts
event-bus/in-memory-event-bus.ts
telemetry/ingestion.ts
inference/vision-provider.ts
inference/orchestrator.ts
temporal/multi-object-tracker.ts
spatial/geometry.ts
spatial/spatial-reasoner.ts
risk-engine/risk-pipeline.ts
operator-os/alerting.ts
storage/operational-memory.ts
simulation/physics-predictor.ts
replay/incident-replay.ts
observability/metrics.ts
edge-runtime/frame-scheduler.ts
deployment/web.Dockerfile
deployment/docker-compose.yml
```

## Integration Notes
The existing UI still calls `/api/detect`, so the app remains usable. The stronger path is `/api/pipeline`, which returns frame telemetry, detections, tracks, risk assessment, risk factors, and incident-ready state. That route should become the primary API for edge cameras, RTSP/WebRTC workers, and operator consoles.

## Future Scalability
The next production leap is replacing the in-memory event bus with NATS, Redpanda, or Kafka; moving inference workers out of the Next process; adding Postgres/TimescaleDB for telemetry; and using the physics predictor to simulate object trajectories across calibrated camera zones. This moves the company story from "AI camera dashboard" to "real-time physical-world operating system."

## YC Readiness
Venture-scale: operator intelligence, edge inference, temporal/spatial risk prediction, incident replay, deployment story.

Amateur before this pass: duplicated model wrappers, fake fallback detections, browser-only state, no event pipeline, typo-broken CSV export, no build validation, no real incident abstraction.

Still needed before YC: live customer deployment evidence, real camera integrations, measured latency benchmarks, persisted incident store, security posture, and a crisp ROI narrative around prevented incidents or faster operator response.
