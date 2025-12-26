import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { setUserSessionState } from '@/lib/userSessions';

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

    let supabase;
    try {
      supabase = createServerSupabaseClient();
    } catch (clientError) {
      const errorMessage = clientError instanceof Error ? clientError.message : 'Unknown error';
      console.error('[api/session/update] Failed to create Supabase client:', errorMessage);
      return NextResponse.json(
        { 
          error: 'Server configuration error',
          message: errorMessage,
          hint: 'Please check your .env.local file and ensure all Supabase variables are set correctly. Restart the server after updating environment variables.'
        },
        { status: 500 }
      );
    }
    
    const updates: { web_logged_in?: boolean; app_logged_in?: boolean } = {};
    if (webLoggedIn !== null) {
      updates.web_logged_in = webLoggedIn;
    }
    if (appLoggedIn !== null) {
      updates.app_logged_in = appLoggedIn;
    }

    const result = await setUserSessionState(supabase, email, updates);

    // Return meaningful data instead of empty object
    return NextResponse.json({
      success: true,
      email: result.email,
      web_logged_in: result.web_logged_in,
      app_logged_in: result.app_logged_in,
      updated_at: result.updated_at,
    });
  } catch (error) {
    console.error('[api/session/update] Error:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // Check if it's an authentication error
    const isAuthError = errorMessage.includes('authentication') || 
                        errorMessage.includes('API key') || 
                        errorMessage.includes('JWT') ||
                        errorMessage.includes('SUPABASE_SERVICE_ROLE_KEY');
    
    // Return a more helpful error message
    return NextResponse.json(
      { 
        error: 'Failed to update session state',
        message: errorMessage,
        hint: isAuthError 
          ? 'Please check your .env.local file and ensure SUPABASE_SERVICE_ROLE_KEY is set correctly. Restart the server after updating environment variables.'
          : undefined,
      },
      { status: 500 }
    );
  }
}

