import { NextRequest, NextResponse } from 'next/server';
import { DetectionResponse } from '@/lib/types';

const SYSTEM_PROMPT = `Return only JSON objects with: type, position, distance, motion. No text. Max 7 objects. Invalid output = empty array. Types: person|bike|car|obstacle|unknown. Positions: left|center|right. Distances: near|mid|far. Motions: static|approaching|leaving. If no objects: {"objects":[]}`;

const EMPTY_RESPONSE: DetectionResponse = { objects: [] };

function parseResponse(text: string): DetectionResponse {
  try {
    const cleaned = text
      .replace(/```json/g, '')
      .replace(/```/g, '')
      .trim();
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed?.objects)) return EMPTY_RESPONSE;

    const validTypes = new Set(['person', 'bike', 'car', 'obstacle', 'unknown']);
    const validPositions = new Set(['left', 'center', 'right']);
    const validDistances = new Set(['near', 'mid', 'far']);
    const validMotions = new Set(['static', 'approaching', 'leaving']);

    const objects = parsed.objects
      .slice(0, 7)
      .filter(
        (o: Record<string, string>) =>
          validTypes.has(o.type) &&
          validPositions.has(o.position) &&
          validDistances.has(o.distance) &&
          validMotions.has(o.motion)
      );

    return { objects };
  } catch {
    return EMPTY_RESPONSE;
  }
}

export async function POST(req: NextRequest) {
  try {
    const { image } = await req.json();
    if (!image) {
      return NextResponse.json(EMPTY_RESPONSE);
    }

    const apiKey = process.env.MISTRAL_API_KEY;
    if (!apiKey) {
      // Return mock data in dev if no key
      return NextResponse.json({
        objects: [
          { type: 'person', position: 'center', distance: 'mid', motion: 'approaching' },
          { type: 'obstacle', position: 'left', distance: 'near', motion: 'static' },
        ],
      } as DetectionResponse);
    }

    const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'pixtral-12b-2409',
        max_tokens: 512,
        messages: [
          {
            role: 'system',
            content: SYSTEM_PROMPT,
          },
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: { url: `data:image/jpeg;base64,${image}` },
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      console.error('Mistral API error:', response.status);
      return NextResponse.json(EMPTY_RESPONSE);
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content ?? '';
    return NextResponse.json(parseResponse(content));
  } catch (err) {
    console.error('Detect route error:', err);
    return NextResponse.json(EMPTY_RESPONSE);
  }
}
