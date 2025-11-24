import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabaseServer';

type Screenshot = {
  id: number;
  session_id: number;
  screenshot_data: string;
  captured_at: string;
  app_name: string | null;
  captured_idle: boolean | null;
};

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const email = searchParams.get('email');
    const sessionIdParam = searchParams.get('sessionId');

    if (!email) {
      return NextResponse.json(
        { error: 'Email parameter is required' },
        { status: 400 }
      );
    }

    if (!sessionIdParam) {
      return NextResponse.json(
        { error: 'sessionId parameter is required' },
        { status: 400 }
      );
    }

    const sessionId = parseInt(sessionIdParam, 10);
    if (isNaN(sessionId)) {
      return NextResponse.json(
        { error: 'Invalid sessionId' },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    const buildQuery = (includeMeta: boolean) =>
      supabase
        .from('screenshots')
        .select(
          includeMeta
            ? 'id, session_id, screenshot_data, captured_at, app_name, captured_idle'
            : 'id, session_id, screenshot_data, captured_at'
        )
        .eq('user_email', email)
        .eq('session_id', sessionId)
        .order('captured_at', { ascending: true })
        .limit(500);

    const { data, error } = await buildQuery(true);

    if (error) {
      if (error.code === '42703' || /(app_name|captured_idle)/.test(error.message ?? '')) {
        const { data: fallbackData, error: fallbackError } = await buildQuery(false);
        if (fallbackError) {
          console.error('Error fetching screenshots (fallback):', fallbackError);
          return NextResponse.json(
            { error: 'Failed to fetch screenshots' },
            { status: 500 }
          );
        }
        const normalized = ((fallbackData ?? [])as any[]).map((row) => ({
          ...row,
          app_name: null,
          captured_idle: null,
        }));
        console.log(
          `API: Fallback query returned ${normalized.length} screenshots for session ${sessionId}, user ${email}`
        );
        return NextResponse.json(normalized as Screenshot[]);
      }

      console.error('Error fetching screenshots:', error);
      return NextResponse.json(
        { error: 'Failed to fetch screenshots' },
        { status: 500 }
      );
    }

    console.log(`API: Found ${data?.length ?? 0} screenshots for session ${sessionId}, user ${email}`);
    return NextResponse.json((data ?? []) as unknown as Screenshot[]);
  } catch (error) {
    console.error('Error in screenshots API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

