import { NextRequest, NextResponse } from 'next/server';
import { DetectionResponse } from '@/lib/types';
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

  try {
    const { image } = await req.json();
    if (typeof image !== 'string' || image.length < 64) {
      return NextResponse.json(EMPTY);
    }

    const provider = providerFromEnv();
    const result = await provider.detect(image);
    return NextResponse.json(sanitizeDetectionResponse(result, result.model ?? provider.model, result.inferenceMs ?? Date.now() - started));
  } catch (err) {
    console.error('Detect route error:', err);
    return NextResponse.json({ ...EMPTY, inferenceMs: Date.now() - started });
  }
}
