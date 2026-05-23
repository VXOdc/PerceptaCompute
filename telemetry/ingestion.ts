import { createId } from '@/core/ids';
import { FrameTelemetry, OperationalContext } from '@/core/types';

export interface FrameIngestInput {
  context: OperationalContext;
  imageBase64?: string;
  width?: number;
  height?: number;
  quality?: number;
  capturedAt?: number;
}

export class TelemetryIngestion {
  frame(input: FrameIngestInput): FrameTelemetry {
    const capturedAt = input.capturedAt ?? Date.now();
    return {
      frameId: createId('frame', capturedAt),
      capturedAt,
      context: input.context,
      imageBytes: input.imageBase64 ? Math.ceil((input.imageBase64.length * 3) / 4) : undefined,
      width: input.width,
      height: input.height,
      quality: input.quality,
    };
  }
}
