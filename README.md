# PerceptaCompute

Real-time spatial intelligence system. Detects objects via webcam, estimates motion, computes collision risk, and displays directional safety alerts.

## Setup

```bash
npm install
cp .env.local.example .env.local
# Add your MISTRAL_API_KEY to .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

| Variable | Description |
|---|---|
| `MISTRAL_API_KEY` | Your Mistral API key (pixtral-12b-2409) |

If `MISTRAL_API_KEY` is not set, the API route returns mock detection data so the UI and risk engine are always testable.

## Architecture

```
Webcam → Frame Capture (320px JPEG @0.6) → /api/detect → Mistral Pixtral
       → Tracker (motion delta) → Risk Engine (score-based) → UI
```

## Design System

- **Colors:** #0B0F14 bg / #111827 panels / #22D3EE accent / system status colors only
- **Font:** Inter only
- **Spacing:** 8px grid (4, 8, 16, 24, 32, 48, 64px)
- **Radius:** 8px or 12px only
- **Animations:** fade only, 200ms

## Performance

- Max 1 concurrent API request (frame skipping enforced)
- 500ms capture interval
- 320px JPEG frames at quality 0.6
- Risk engine runs client-side — no blocking

## Deployment

Push to GitHub, connect to Vercel, add `MISTRAL_API_KEY` to Vercel environment variables.

## Roadmap

- [x] Phase 1: Browser simulation (this repo)
- [ ] Phase 2: ESP32 wearable + vibration alerts

## License

MIT © PerceptaCompute
