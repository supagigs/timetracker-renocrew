import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabaseServer';
import { isRouteAccessible, getDefaultRouteForRole } from '@/lib/roleRules';

export async function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  // Skip public routes
  if (
    pathname.startsWith('/login') ||
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
    // Redirect to login if no email cookie
    return NextResponse.redirect(new URL('/login', req.url));
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
    console.warn('[middleware] Error fetching user context:', error);
    // Allow through - let the page handle auth
    return NextResponse.next();
  }

  if (!user?.role_profile) {
    // No role profile found - redirect to login
    return NextResponse.redirect(new URL('/login', req.url));
  }

  // Check if route is accessible for this role profile
  if (!isRouteAccessible(user.role_profile, pathname)) {
    // Route not accessible - redirect to default route for role
    const defaultRoute = getDefaultRouteForRole(user.role_profile);
    return NextResponse.redirect(new URL(defaultRoute, req.url));
  }

  return NextResponse.next();
}

// Configure which routes this middleware runs on
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

