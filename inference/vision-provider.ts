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
        return [{
          type,
          position,
          distance,
          motion,
          confidence: typeof object.confidence === 'number' ? Math.max(0, Math.min(1, object.confidence)) : undefined,
        } as DetectedObject];
      })
    : [];

  return { objects, model, inferenceMs };
}

export class StaticFallbackVisionProvider implements VisionProvider {
  readonly model = 'static-fallback-v1';

  async detect(): Promise<DetectionResponse> {
    return {
      model: this.model,
      inferenceMs: 0,
      objects: [
        { type: 'person', position: 'center', distance: 'mid', motion: 'static', confidence: 0.55 },
        { type: 'car', position: 'right', distance: 'far', motion: 'leaving', confidence: 0.45 },
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
        max_tokens: 512,
        temperature: 0.05,
        messages: [
          {
            role: 'system',
            content:
              'Return only JSON: {"objects":[{"type":"person|bike|car|obstacle|unknown","position":"left|center|right","distance":"near|mid|far","motion":"static|approaching|leaving|crossing","confidence":0.0}]}. Max 8 safety-relevant objects. No markdown.',
          },
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Image}` } },
              { type: 'text', text: 'Detect physical hazards, vehicles, people, bicycles, and obstacles for operator safety.' },
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
