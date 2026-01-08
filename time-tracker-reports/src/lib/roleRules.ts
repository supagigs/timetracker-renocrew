/**
 * Role-based routing rules
 * Defines which routes are accessible to which role profiles
 * Manager roles (SuperAdmin, MainAdmin, etc.) have access to all routes
 * Employee role has limited access
 */
export const ROLE_ROUTES = {
  'SuperAdmin': [
    '/reports',
    '/reports/[userEmail]',
    '/reports/[userEmail]/employees',
    '/reports/[userEmail]/reports',
    '/reports/[userEmail]/projects',
    '/reports/[userEmail]/screenshots',
    '/reports/[userEmail]/screenshot-interval',
    '/reports/[userEmail]/timesheet',
  ],
  'MainAdmin': [
    '/reports',
    '/reports/[userEmail]',
    '/reports/[userEmail]/employees',
    '/reports/[userEmail]/reports',
    '/reports/[userEmail]/projects',
    '/reports/[userEmail]/screenshots',
    '/reports/[userEmail]/screenshot-interval',
    '/reports/[userEmail]/timesheet',
  ],
  'Employee': [
    '/reports',
    '/reports/[userEmail]',
    '/reports/[userEmail]/reports',
    '/reports/[userEmail]/projects',
    '/reports/[userEmail]/timesheet',
  ],
};

/**
 * Check if a route is accessible for a given role profile
 * @param roleProfile - User's role profile from Frappe (e.g., 'SuperAdmin', 'MainAdmin', 'Employee')
 * @param pathname - Route pathname to check
 * @returns true if route is accessible, false otherwise
 */
export function isRouteAccessible(roleProfile: string | null, pathname: string): boolean {
  if (!roleProfile) {
    return false;
  }

  // Normalize pathname (remove query params and trailing slashes)
  const normalizedPath = pathname.split('?')[0].replace(/\/$/, '');

  // Get allowed routes for this role profile
  // If role profile is not explicitly defined, treat non-Employee roles as Manager (SuperAdmin access)
  let allowedRoutes = ROLE_ROUTES[roleProfile as keyof typeof ROLE_ROUTES];
  
  if (!allowedRoutes && roleProfile !== 'Employee') {
    // Default to SuperAdmin routes for any admin role not explicitly defined
    allowedRoutes = ROLE_ROUTES['SuperAdmin'];
  }

  if (!allowedRoutes) {
    return false;
  }

  // Check if pathname matches any allowed route pattern
  for (const route of allowedRoutes) {
    // Convert route pattern to regex (handle [userEmail] as wildcard)
    const routePattern = route.replace(/\[.*?\]/g, '[^/]+');
    const routeRegex = new RegExp(`^${routePattern}$`);

    if (routeRegex.test(normalizedPath)) {
      return true;
    }
  }

  return false;
}

/**
 * Get the default redirect path for a role profile
 * @param roleProfile - User's role profile
 * @returns Default route path for the role
 */
export function getDefaultRouteForRole(roleProfile: string | null): string {
  // Manager roles (SuperAdmin, MainAdmin, etc.) - treat all non-Employee roles as Manager
  if (roleProfile && roleProfile !== 'Employee') {
    return '/reports';
  }
  if (roleProfile === 'Employee') {
    return '/reports';
  }
  return '/login';
}

