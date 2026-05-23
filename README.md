<div align="center">
  <img src="https://i.postimg.cc/43PfyZQB/Screenshot-2026-05-21-at-10-21-34-PM-removebg-preview.png" alt="PerceptaCompute Logo" width="120">
  
  <h1>PerceptaCompute</h1>
  <p><strong>Autonomous AI Surveillance & Risk Telemetry Dashboard</strong></p>

  <p>
    <a href="https://perceptacompute.vercel.app/"><img src="https://img.shields.io/badge/Live_Deployment-perceptacompute.vercel.app-171717?style=flat-square" alt="Website"></a>
    <a href="https://github.com/VXOdc/perceptacompute"><img src="https://img.shields.io/badge/GitHub-VXOdc-171717?style=flat-square" alt="GitHub"></a>
  </p>
</div>

---

##  Project Overview

**PerceptaCompute** is a real-time command-center interface architected like a continuous streaming asset to handle automated threat detection, spatial entity tracking, and algorithmic risk evaluation entirely within the browser. 

Instead of processing static video files, the system intercepts live hardware feeds, runs temporal object tracking across chronological frames, and evaluates heuristic risk models to trigger dynamic multi-tier alerts on a unified dashboard. 

***Cursor was used to identify and fix errors efficiently, saving time.***

##  Core Architecture & Data Flow

The application mimics the data streaming pipeline of an enterprise-grade AI monitoring asset, moving through four decoupled processing phases:

1. **Hardware Ingestion:** Native media APIs capture the live camera stream, with utility scripts instantly compressing and formatting the frame payloads.
2. **Temporal Tracking (`lib/tracker.ts`):** Maintains object identity and spatial persistence across frames, ensuring a moving target is recognized as a continuous entity rather than a new object every second.
3. **Heuristic Risk Engine (`lib/riskEngine.ts`):** The deterministic "brain" of the application. It evaluates classification labels and confidence thresholds against a conditional matrix of safety rules to flag system states.
4. **Synchronized Telemetry (`app/page.tsx`):** A decoupled UI layer orchestrates live status updates, shifting risk panels, and tracking logs without creating performance bottlenecks during high-frequency data updates.

---

##  Tech Stack

* **Framework:** Next.js 15
* **UI Library:** React 19
* **Language:** TypeScript
* **Styling:** Tailwind CSS

### Directory Structure Highlights

```text
app/
 ├── page.tsx               # Main telemetry dashboard
 └── api/detect/route.ts    # Detection & analysis API endpoint
components/
 ├── Camera.tsx             # Hardware stream ingestion
 ├── RiskPanel.tsx          # Threat level and alert display
 └── ObjectList.tsx         # Tracked entity logs
lib/
 ├── riskEngine.ts          # Core algorithmic risk evaluation
 ├── tracker.ts             # Spatial object tracking logic
 └── frameUtils.ts          # Image preprocessing and compression
