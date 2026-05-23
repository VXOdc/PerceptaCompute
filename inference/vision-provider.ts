import { DetectedObject, DetectionResponse } from '@/core/types';

export interface VisionProvider {
  readonly model: string;
  detect(base64Image: string): Promise<DetectionResponse>;
}

export function sanitizeDetectionResponse(input: unknown, model?: string, inferenceMs?: number): DetectionResponse {
  const validTypes = new Set(['person', 'bike', 'car', 'obstacle', 'unknown']);
  const validPos = new Set(['left', 'center', 'right']);
  const validDist = new Set(['near', 'mid', 'far']);
  const validMot = new Set(['static', 'approaching', 'leaving', 'crossing']);
  const objects: DetectedObject[] = Array.isArray((input as { objects?: unknown[] })?.objects)
    ? (input as { objects: Record<string, unknown>[] }).objects.slice(0, 12).flatMap(object => {
        const type = typeof object.type === 'string' && validTypes.has(object.type) ? object.type : null;
        const position = typeof object.position === 'string' && validPos.has(object.position) ? object.position : null;
        const distance = typeof object.distance === 'string' && validDist.has(object.distance) ? object.distance : null;
        const motion = typeof object.motion === 'string' && validMot.has(object.motion) ? object.motion : 'static';
        if (!type || !position || !distance) return [];

        // Parse optional normalized bounding box [x, y, width, height]
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

        return [{
          type,
          position,
          distance,
          motion,
          confidence: typeof object.confidence === 'number' ? Math.max(0, Math.min(1, object.confidence)) : undefined,
          bbox,
        } as DetectedObject];
      })
    : [];

  return { objects, model, inferenceMs };
}

export class StaticFallbackVisionProvider implements VisionProvider {
  readonly model = 'static-fallback-v1';

  async detect(): Promise<DetectionResponse> {
    if (process.env.PERCEPTA_DEMO_DETECTIONS !== 'true') {
      return {
        model: this.model,
        inferenceMs: 0,
        objects: [],
      };
    }

    return {
      model: this.model,
      inferenceMs: 0,
      objects: [
        { type: 'person', position: 'center', distance: 'mid', motion: 'static', confidence: 0.55, bbox: [0.35, 0.2, 0.3, 0.6] },
        { type: 'car', position: 'right', distance: 'far', motion: 'leaving', confidence: 0.45, bbox: [0.7, 0.3, 0.25, 0.4] },
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
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 768,
        temperature: 0.05,
        messages: [
          {
            role: 'system',
            content:
              'Return only JSON: {"objects":[{"type":"person|bike|car|obstacle|unknown","position":"left|center|right","distance":"near|mid|far","motion":"static|approaching|leaving|crossing","confidence":0.0,"bbox":[x,y,w,h]}]}. ' +
              'bbox is normalized [0-1] as [left, top, width, height]. Max 8 safety-relevant objects. No markdown.',
          },
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Image}` } },
              { type: 'text', text: 'Detect physical hazards, vehicles, people, bicycles, and obstacles for operator safety. Include bounding boxes.' },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`Mistral detection failed: ${response.status}`);
    }

    const data = await response.json();
    const content = String(data?.choices?.[0]?.message?.content ?? '').replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(content);
    return sanitizeDetectionResponse(parsed, this.model, Date.now() - started);
  }
}
