import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const webLoggedIn = typeof body.web_logged_in === 'boolean' ? body.web_logged_in : null;
    const appLoggedIn = typeof body.app_logged_in === 'boolean' ? body.app_logged_in : null;

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    if (webLoggedIn === null && appLoggedIn === null) {
      return NextResponse.json(
        { error: 'At least one session state (web_logged_in or app_logged_in) must be provided' },
        { status: 400 }
      );
    }

    // No-op: user_sessions table is no longer used
    // Return success response without database access
    return NextResponse.json({
      success: true,
      email: email,
      web_logged_in: webLoggedIn,
      app_logged_in: appLoggedIn,
      updated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[api/session/update] Error:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return NextResponse.json(
      { 
        error: 'Failed to update session state',
        message: errorMessage,
      },
      { status: 500 }
    );
  }
}

