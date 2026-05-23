import { NextRequest, NextResponse } from 'next/server';
import { InferenceOrchestrator } from '@/inference/orchestrator';
import { MistralVisionProvider, StaticFallbackVisionProvider } from '@/inference/vision-provider';
import { OperationalContext } from '@/core/types';

function contextFromBody(body: Record<string, unknown>): OperationalContext {
  return {
    siteId: String(body.siteId ?? process.env.PERCEPTA_SITE_ID ?? 'local-site'),
    zoneId: String(body.zoneId ?? process.env.PERCEPTA_ZONE_ID ?? 'default-zone'),
    cameraId: String(body.cameraId ?? 'browser-camera'),
    operatorId: typeof body.operatorId === 'string' ? body.operatorId : undefined,
    mode: body.mode === 'run' || body.mode === 'cycle' || body.mode === 'vehicle' || body.mode === 'industrial'
      ? body.mode
      : 'walk',
  };
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (typeof body.image !== 'string') {
    return NextResponse.json({ error: 'image must be a base64 JPEG string' }, { status: 400 });
  }

  const provider = process.env.MISTRAL_API_KEY
    ? new MistralVisionProvider(process.env.MISTRAL_API_KEY)
    : new StaticFallbackVisionProvider();

  const orchestrator = new InferenceOrchestrator(provider);
  const state = await orchestrator.processFrame({
    imageBase64: body.image,
    context: contextFromBody(body),
    sensitivity: typeof body.sensitivity === 'string' ? body.sensitivity : 'med',
    width: typeof body.width === 'number' ? body.width : undefined,
    height: typeof body.height === 'number' ? body.height : undefined,
    quality: typeof body.quality === 'number' ? body.quality : undefined,
  });

  return NextResponse.json(state);
}
