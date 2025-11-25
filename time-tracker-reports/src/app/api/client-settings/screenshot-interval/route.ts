import { NextResponse } from 'next/server';
import { upsertClientScreenshotInterval } from '@/lib/clientSettings';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const clientEmail = typeof body.clientEmail === 'string' ? body.clientEmail : '';
    const intervalSeconds = Number(body.intervalSeconds);

    if (!clientEmail || !Number.isFinite(intervalSeconds) || intervalSeconds <= 0) {
      return NextResponse.json(
        { error: 'Invalid payload' },
        { status: 400 },
      );
    }

    const settings = await upsertClientScreenshotInterval(clientEmail, intervalSeconds);

    if (!settings) {
      return NextResponse.json(
        { error: 'Failed to save settings' },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, settings });
  } catch (error) {
    console.error('[api] screenshot-interval POST failed:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}











