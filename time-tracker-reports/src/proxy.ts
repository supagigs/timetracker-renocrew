import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { isRouteAccessible, getDefaultRouteForRole } from '@/lib/roleRules';

export async function proxy(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  // Skip public routes
  if (
    pathname === '/' ||
    pathname.startsWith('/post-login') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon.ico') ||
    pathname.startsWith('/static')
  ) {
    return NextResponse.next();
  }

  // Get user email from cookie
  const email = req.cookies.get('user_email')?.value;
  if (!email) {
    // Redirect to home page (which has the login form) if no email cookie
    return NextResponse.redirect(new URL('/', req.url));
  }

  const supabase = createServerSupabaseClient();

  // Get cached user context from Supabase
  const { data: user, error } = await supabase
    .from('user_context')
    .select('role_profile')
    .eq('email', email.trim().toLowerCase())
    .maybeSingle();

  // If user_context table doesn't exist or user not found, allow through
  // (the page will handle authentication)
  if (error && error.code !== 'PGRST116') {
    console.warn('[proxy] Error fetching user context:', error);
    // Allow through - let the page handle auth
    return NextResponse.next();
  }

  // If we have a role_profile, apply role-based access control
  if (user?.role_profile) {
    // Check if route is accessible for this role profile
    if (!isRouteAccessible(user.role_profile, pathname)) {
      // Route not accessible - redirect to default route for role
      const defaultRoute = getDefaultRouteForRole(user.role_profile);
      return NextResponse.redirect(new URL(defaultRoute, req.url));
    }
  }
  // If no role_profile, still allow through - the page will handle authorization
  // This allows users to access routes even if user_context sync hasn't completed yet

  return NextResponse.next();
}

// Configure which routes this proxy runs on
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};

