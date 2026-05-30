import { NextRequest, NextResponse } from 'next/server';
import { InferenceOrchestrator } from '@/inference/orchestrator';
import { MistralVisionProvider, StaticFallbackVisionProvider } from '@/inference/vision-provider';
import {
  apiProblemResponse,
  contextFromBody,
  guardApiRequest,
  normalizeBase64Image,
  numberInRange,
  readJsonObject,
  sanitizeSensitivity,
} from '@/lib/apiSecurity';

export async function POST(req: NextRequest) {
  const guard = guardApiRequest(req, {
    route: 'pipeline',
    maxRequests: 30,
    windowMs: 60_000,
  });
  if (!guard.ok) return guard.response;

  let body: Record<string, unknown>;
  let imageBase64: string;

  try {
    body = await readJsonObject(req);
    imageBase64 = normalizeBase64Image(body.image);
  } catch (err) {
    return apiProblemResponse(err, guard.headers);
  }

  const provider = process.env.MISTRAL_API_KEY
    ? new MistralVisionProvider(process.env.MISTRAL_API_KEY)
    : new StaticFallbackVisionProvider();

  const orchestrator = new InferenceOrchestrator(provider);
  try {
    const state = await orchestrator.processFrame({
      imageBase64,
      context: contextFromBody(body),
      sensitivity: sanitizeSensitivity(body.sensitivity),
      width: numberInRange(body.width, 1, 7680),
      height: numberInRange(body.height, 1, 4320),
      quality: numberInRange(body.quality, 0, 1),
    });

    return NextResponse.json(state, { headers: guard.headers });
  } catch {
    console.error('Pipeline route failed');
    return NextResponse.json({ error: 'Frame processing unavailable' }, {
      status: 502,
      headers: guard.headers,
    });
  }
}
