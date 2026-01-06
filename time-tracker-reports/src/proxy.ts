import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

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

  // No-op: user_context table is no longer used
  // Allow through - let the page handle authorization

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

