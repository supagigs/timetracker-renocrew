import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabaseServer';

type Screenshot = {
  id: number;
  session_id: number;
  screenshot_data: string;
  captured_at: string;
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
    const { data, error } = await supabase
      .from('screenshots')
      .select('id, session_id, screenshot_data, captured_at')
      .eq('user_email', email)
      .eq('session_id', sessionId)
      .order('captured_at', { ascending: true })
      .limit(500);

    if (error) {
      console.error('Error fetching screenshots:', error);
      return NextResponse.json(
        { error: 'Failed to fetch screenshots' },
        { status: 500 }
      );
    }

    console.log(`API: Found ${data?.length ?? 0} screenshots for session ${sessionId}, user ${email}`);
    return NextResponse.json((data ?? []) as Screenshot[]);
  } catch (error) {
    console.error('Error in screenshots API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

