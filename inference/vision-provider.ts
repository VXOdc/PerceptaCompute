/**
 * vision-provider.ts — fix #3
 *
 * Fix #3 — Richer Mistral detection prompt:
 *   Adds three zero-cost fields to the JSON schema the model is asked to return:
 *
 *   • `heading`   — cardinal direction the object faces ("N/NE/E/SE/S/SW/W/NW").
 *                   Distinct from the direction it is moving toward the camera;
 *                   a pedestrian facing away but walking toward the road is different
 *                   from one already crossing.
 *
 *   • `occluded`  — boolean. True when the detection is partial (object partly
 *                   hidden by another object, vehicle door, edge of frame).
 *                   Lets downstream code apply extra uncertainty to occluded tracks.
 *
 *   • `intent`    — short behavioural tag: "waiting" | "crossing" | "walking" |
 *                   "running" | "reversing" | "parked" | "unknown".
 *                   "pedestrian waiting to cross" vs "pedestrian crossing" is a
 *                   critical risk difference that motion state alone can't encode.
 *
 *   All three are optional in sanitizeDetectionResponse so old callers keep working.
 *   No extra API calls, no latency change — the model resolves them in the same pass.
 */
import { DetectedObject, DetectionResponse } from '@/core/types';

// Valid intent tags the model may return
const VALID_INTENT = new Set([
  'waiting', 'crossing', 'walking', 'running', 'reversing', 'parked', 'unknown',
]);

// Valid heading values (8-point compass)
const VALID_HEADING = new Set([
  'N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW',
]);

export interface VisionProvider {
  readonly model: string;
  detect(base64Image: string): Promise<DetectionResponse>;
}

export function sanitizeDetectionResponse(
  input:       unknown,
  model?:      string,
  inferenceMs?: number
): DetectionResponse {
  const validTypes = new Set(['person', 'bike', 'car', 'obstacle', 'unknown']);
  const validPos   = new Set(['left', 'center', 'right']);
  const validDist  = new Set(['near', 'mid', 'far']);
  const validMot   = new Set(['static', 'approaching', 'leaving', 'crossing']);

  const objects: DetectedObject[] = Array.isArray((input as { objects?: unknown[] })?.objects)
    ? (input as { objects: Record<string, unknown>[] }).objects
        .slice(0, 12)
        .flatMap(object => {
          const type     = typeof object.type     === 'string' && validTypes.has(object.type)     ? object.type     : null;
          const position = typeof object.position === 'string' && validPos.has(object.position)   ? object.position : null;
          const distance = typeof object.distance === 'string' && validDist.has(object.distance)  ? object.distance : null;
          const motion   = typeof object.motion   === 'string' && validMot.has(object.motion)     ? object.motion   : 'static';
          if (!type || !position || !distance) return [];

          // BBox
          let bbox: [number, number, number, number] | undefined;
          if (Array.isArray(object.bbox) && object.bbox.length === 4) {
            const [bx, by, bw, bh] = object.bbox as unknown[];
            if (
              typeof bx === 'number' && typeof by === 'number' &&
              typeof bw === 'number' && typeof bh === 'number' &&
              bx >= 0 && by >= 0 && bw > 0 && bh > 0 &&
              bx + bw <= 1.05 && by + bh <= 1.05
            ) {
              bbox = [
                Math.max(0, Math.min(1, bx)),
                Math.max(0, Math.min(1, by)),
                Math.max(0.01, Math.min(1 - bx, bw)),
                Math.max(0.01, Math.min(1 - by, bh)),
              ];
            }
          }

          // Fix #3: Optional extended fields — validated and defaulted safely
          const heading  = typeof object.heading  === 'string' && VALID_HEADING.has(object.heading)
            ? (object.heading as string) : undefined;
          const occluded = typeof object.occluded === 'boolean' ? object.occluded : false;
          const intent   = typeof object.intent   === 'string' && VALID_INTENT.has(object.intent)
            ? (object.intent as string) : 'unknown';

          return [{
            type,
            position,
            distance,
            motion,
            confidence: typeof object.confidence === 'number'
              ? Math.max(0, Math.min(1, object.confidence))
              : undefined,
            bbox,
            // Fix #3: attach extended fields to the detection object
            heading,
            occluded,
            intent,
          } as DetectedObject & { heading?: string; occluded: boolean; intent: string }];
        })
    : [];

  return { objects, model, inferenceMs };
}

export class StaticFallbackVisionProvider implements VisionProvider {
  readonly model = 'static-fallback-v1';

  async detect(): Promise<DetectionResponse> {
    if (process.env.PERCEPTA_DEMO_DETECTIONS !== 'true') {
      return { model: this.model, inferenceMs: 0, objects: [] };
    }
    return {
      model: this.model,
      inferenceMs: 0,
      objects: [
        { type: 'person', position: 'center', distance: 'mid', motion: 'static', confidence: 0.55, bbox: [0.35, 0.2, 0.3, 0.6] },
        { type: 'car',    position: 'right',  distance: 'far', motion: 'leaving', confidence: 0.45, bbox: [0.7,  0.3, 0.25, 0.4] },
      ],
    };
  }
}

export class MistralVisionProvider implements VisionProvider {
  readonly model = 'pixtral-12b-2409';

  constructor(private readonly apiKey: string) {}

  async detect(base64Image: string): Promise<DetectionResponse> {
    const started = Date.now();

    const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model:       this.model,
        max_tokens:  900,         // slightly higher for extra fields
        temperature: 0.05,
        messages: [
          {
            role: 'system',
            // Fix #3: Extended schema — heading, occluded, intent added at zero API cost
            content:
              'Return ONLY valid JSON matching this exact schema — no markdown, no preamble:\n' +
              '{"objects":[{\n' +
              '  "type":"person|bike|car|obstacle|unknown",\n' +
              '  "position":"left|center|right",\n' +
              '  "distance":"near|mid|far",\n' +
              '  "motion":"static|approaching|leaving|crossing",\n' +
              '  "confidence":0.0,\n' +
              '  "bbox":[x,y,w,h],\n' +
              '  "heading":"N|NE|E|SE|S|SW|W|NW",\n' +
              '  "occluded":false,\n' +
              '  "intent":"waiting|crossing|walking|running|reversing|parked|unknown"\n' +
              '}]}\n' +
              'bbox is normalised [0–1] as [left, top, width, height]. Max 8 safety-relevant objects.\n' +
              'heading = direction the object is FACING (not necessarily moving toward camera).\n' +
              'occluded = true when object is partially hidden by another object or frame edge.\n' +
              'intent = behavioural state: what the object appears to be about to do.',
          },
          {
            role: 'user',
            content: [
              {
                type:      'image_url',
                image_url: { url: `data:image/jpeg;base64,${base64Image}` },
              },
              {
                type: 'text',
                text: 'Detect physical hazards, vehicles, people, bicycles, and obstacles for operator safety. Include all extended fields.',
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`Mistral detection failed: ${response.status}`);
    }

    const data    = await response.json();
    const content = String(data?.choices?.[0]?.message?.content ?? '')
      .replace(/```json|```/g, '')
      .trim();
    const parsed  = JSON.parse(content);
    return sanitizeDetectionResponse(parsed, this.model, Date.now() - started);
  }
}
