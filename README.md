<p align="center">
  <img src="https://i.postimg.cc/43PfyZQB/Screenshot-2026-05-21-at-10-21-34-PM-removebg-preview.png" height="200" width="auto" alt="PerceptaCompute Logo" />
</p>

<h1 align="center">PerceptaCompute</h1>

<p align="center">
  <b>Autonomous AI Surveillance & Risk Telemetry Dashboard</b>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Status-Live-brightgreen?style=for-the-badge" alt="Status" />
  <img src="https://img.shields.io/badge/Vision-Mistral_Pixtral_12B-blue?style=for-the-badge" alt="Vision Model" />
  <img src="https://img.shields.io/badge/Framework-Next.js_15-171717?style=for-the-badge" alt="Framework" />
  <img src="https://img.shields.io/badge/Access-Demo_Only-red?style=for-the-badge" alt="Access" />
</p>

<p align="center">
  <a href="https://perceptacompute.vercel.app/">Live Deployment</a> · <a href="https://github.com/VXOdc/perceptacompute">GitHub</a>
</p>

<br>

---

## Table of Contents

- [Project Overview](#project-overview)
- [Core Systems](#core-systems)
- [Application Screenshots](#application-screenshots)
- [Architecture & Data Flow](#architecture--data-flow)
- [Tech Stack](#tech-stack)
- [Access](#access)

---

## Project Overview

**PerceptaCompute** is a real-time command-center interface engineered for automated threat detection, spatial entity tracking, and algorithmic risk evaluation — running entirely within the browser.

Rather than processing static video files, the system intercepts live hardware feeds, runs temporal object tracking across chronological frames, and evaluates physics-informed risk models to trigger dynamic multi-tier alerts on a unified dashboard.

### The Core Engineering Challenge

Real-time surveillance demands simultaneous guarantees on accuracy, latency, and consistency. A single missed frame can lose object identity; a misclassified trajectory can either suppress a genuine threat or flood operators with false alerts. PerceptaCompute was architected to handle these failure states through deterministic heuristics, second-order kinematic modeling, and perceptual similarity gating — keeping the pipeline stable even under noisy, real-world camera conditions.

<br>

---

## Core Systems

<table width="100%">
  <tr>
    <td width="50%" valign="top">
      <h3>Temporal Object Tracking</h3>
      <p>Maintains persistent object identity and spatial continuity across frames:</p>
      <ul>
        <li><b>Multi-Object Tracker:</b> Spatial association across frames using IoU and velocity priors.</li>
        <li><b>Kinematic Estimation:</b> Second-order velocity and acceleration modeling per entity.</li>
        <li><b>Identity Persistence:</b> Moving targets are recognized as continuous entities rather than re-classified each frame.</li>
      </ul>
    </td>
    <td width="50%" valign="top">
      <h3>Vector-Based Risk Engine</h3>
      <p>Evaluates compound threat states through deterministic spatial reasoning:</p>
      <ul>
        <li><b>2D Time-to-Collision:</b> Vector projection for real-time TTC estimation.</li>
        <li><b>Corridor Occupancy:</b> Sweep-based spatial occupancy analysis for moving objects.</li>
        <li><b>Compound Threat Scoring:</b> Multi-factor risk aggregation with directional awareness.</li>
      </ul>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <h3>Live Camera Pipeline</h3>
      <p>Robust hardware ingestion with intelligent frame scheduling:</p>
      <ul>
        <li><b>Adaptive Scheduling:</b> Frame rate modulation based on scene activity.</li>
        <li><b>Blur Detection:</b> Automatic frame rejection on motion blur or occlusion.</li>
        <li><b>Perceptual Gating:</b> Similarity hashing to suppress redundant API calls.</li>
      </ul>
    </td>
    <td width="50%" valign="top">
      <h3>Real-Time Telemetry Dashboard</h3>
      <p>A decoupled UI layer that surfaces risk state without bottlenecking inference:</p>
      <ul>
        <li><b>Risk States:</b> SAFE / WARNING / DANGER with explanatory factors.</li>
        <li><b>Session Intelligence:</b> Full object history, danger event logging, and CSV export.</li>
        <li><b>Haptic + Audio Alerts:</b> Device-native feedback for high-risk events.</li>
      </ul>
    </td>
  </tr>
</table>

<br>

---

## Application Screenshots

<table width="100%">
  <tr>
    <td width="50%" align="center">
      <img src="https://i.postimg.cc/43PfyZQB/Screenshot-2026-05-21-at-10-21-34-PM-removebg-preview.png" width="100%" alt="PerceptaCompute Dashboard" />
    </td>
    <td width="50%" align="center">
      <!-- Add a second screenshot here -->
    </td>
  </tr>
</table>

<br>

---

## Architecture & Data Flow

The application mirrors the data streaming pipeline of an enterprise-grade AI monitoring system, moving through four decoupled processing phases:

```
Camera Feed → Frame Processor → Mistral Pixtral Vision → Temporal Tracker → Risk Pipeline → Telemetry Dashboard
```

1. **Hardware Ingestion** — `getUserMedia` captures the live stream; utility scripts compress and format frame payloads with blur detection and perceptual similarity gating.
2. **Vision Layer** — Mistral Pixtral 12B classifies objects and returns spatial metadata per frame, with a static fallback for offline/demo use.
3. **Temporal Tracking (`lib/temporal/multi-object-tracker.ts`)** — Maintains object identity across frames using spatial association and kinematic priors.
4. **Risk Pipeline (`lib/risk-engine/risk-pipeline.ts`)** — Evaluates TTC vectors, corridor occupancy, and compound threat scores against a deterministic conditional matrix.
5. **Synchronized Telemetry (`app/page.tsx`)** — Decoupled UI layer drives live status updates, shifting risk panels, and tracking logs without creating inference bottlenecks.

### Directory Structure

```text
app/
 ├── page.tsx                  # Main telemetry dashboard
 ├── api/detect/route.ts       # Vision API endpoint
 └── api/pipeline/route.ts     # Full inference pipeline

components/
 ├── Camera.tsx                # Hardware stream ingestion
 ├── RiskPanel.tsx             # Threat level and alert display
 ├── ObjectList.tsx            # Tracked entity logs
 ├── SessionLog.tsx            # Danger event history
 └── SettingsMenu.tsx          # Sensitivity and scan controls

lib/ & core/
 ├── temporal/multi-object-tracker.ts   # Identity persistence
 ├── spatial/geometry.ts               # Vector geometry utilities
 ├── risk-engine/risk-pipeline.ts       # Compound threat scoring
 ├── simulation/physics-predictor.ts    # Kinematic trajectory modeling
 └── frameUtils.ts                      # Image preprocessing & compression
```

<br>

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) |
| UI Library | React 19 |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Vision Model | Mistral Pixtral 12B |
| Deployment | Vercel |

<br>

---

## Access

PerceptaCompute is **not open source** and is not available for forking, cloning, or self-hosting.

The system is accessible exclusively through the live deployment:

<p align="center">
  <a href="https://perceptacompute.vercel.app/"><img src="https://img.shields.io/badge/Launch_PerceptaCompute-perceptacompute.vercel.app-171717?style=for-the-badge" alt="Live Demo" /></a>
</p>

No installation. No API keys required. Open the link, allow camera access, and the system is live.

> Source code is proprietary. Redistribution, reproduction, or derivative use is not permitted.

<br>

<p align="center">
  Built for spatial intelligence. Engineered for real-time certainty.
</p>
