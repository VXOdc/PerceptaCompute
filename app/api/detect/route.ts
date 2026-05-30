import { NextRequest, NextResponse } from 'next/server';
import { DetectionResponse } from '@/lib/types';
import {
  apiProblemResponse,
  guardApiRequest,
  normalizeBase64Image,
  readJsonObject,
} from '@/lib/apiSecurity';
import {
  MistralVisionProvider,
  sanitizeDetectionResponse,
  StaticFallbackVisionProvider,
  VisionProvider,
} from '@/inference/vision-provider';

const EMPTY: DetectionResponse = { objects: [], model: 'none', inferenceMs: 0 };

function providerFromEnv(): VisionProvider {
  const apiKey = process.env.MISTRAL_API_KEY;
  return apiKey ? new MistralVisionProvider(apiKey) : new StaticFallbackVisionProvider();
}

export async function POST(req: NextRequest) {
  const started = Date.now();
  const guard = guardApiRequest(req, {
    route: 'detect',
    maxRequests: 45,
    windowMs: 60_000,
  });
  if (!guard.ok) return guard.response;

  try {
    const body = await readJsonObject(req);
    const image = normalizeBase64Image(body.image);

    const provider = providerFromEnv();
    const result = await provider.detect(image);
    return NextResponse.json(
      sanitizeDetectionResponse(result, result.model ?? provider.model, result.inferenceMs ?? Date.now() - started),
      { headers: guard.headers }
    );
  } catch (err) {
    if (typeof (err as { status?: unknown }).status === 'number') {
      return apiProblemResponse(err, guard.headers);
    }

    console.error('Detect route failed');
    return NextResponse.json(
      { ...EMPTY, inferenceMs: Date.now() - started },
      { headers: guard.headers }
    );
  }
}
