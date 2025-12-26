import axios, { AxiosInstance } from 'axios';

function getFrappeBaseURL(): string | null {
  const frappeUrl = process.env.FRAPPE_URL;
  
  if (!frappeUrl) {
    return null;
  }
  
  // Remove trailing slash if present
  const baseURL = frappeUrl.replace(/\/$/, '');
  
  // Validate URL format
  if (!baseURL.startsWith('http://') && !baseURL.startsWith('https://')) {
    return null;
  }
  
  return baseURL;
}

export function createFrappeClient(useApiKey: boolean = true): AxiosInstance {
  const baseURL = getFrappeBaseURL();
  
  if (!baseURL) {
    throw new Error('FRAPPE_URL is not configured or invalid. Please check your .env file.');
  }
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };
  
  // For server-side API calls, use API key authentication
  if (useApiKey) {
    const apiKey = process.env.FRAPPE_API_KEY;
    const apiSecret = process.env.FRAPPE_API_SECRET;
    
    if (apiKey && apiSecret) {
      headers['Authorization'] = `token ${apiKey}:${apiSecret}`;
    } else {
      console.warn('[frappeClient] FRAPPE_API_KEY and FRAPPE_API_SECRET not configured. API calls may fail. Falling back to session-based auth.');
      // Fall back to session-based auth if API keys are not configured
      return axios.create({
        baseURL: baseURL,
        withCredentials: true,
        headers: headers,
      });
    }
  }
  
  return axios.create({
    baseURL: baseURL,
    withCredentials: !useApiKey, // Only use cookies for session-based auth
    headers: headers,
  });
}

export async function frappeLogin(email: string, password: string): Promise<{ success: boolean; error?: string }> {
  try {
    // For login, use session-based auth (not API key)
    const frappe = createFrappeClient(false);
    
    const res = await frappe.post('/api/method/login', {
      usr: email,
      pwd: password,
    });

    if (res.data.message === 'Logged In') {
      return { success: true };
    }

    return { success: false, error: 'Invalid login credentials' };
  } catch (err: any) {
    let errorMessage = err.response?.data?.message || err.message || 'Login failed';
    
    // Provide more helpful error messages for common issues
    if (err.code === 'ERR_INVALID_URL' || err.message?.includes('Invalid URL')) {
      const frappeUrl = process.env.FRAPPE_URL || 'not set';
      errorMessage = `Invalid Frappe URL. Please check FRAPPE_URL in your .env file. Current value: ${frappeUrl}`;
    } else if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
      errorMessage = `Cannot connect to Frappe server at ${process.env.FRAPPE_URL}. Please check if the URL is correct and the server is accessible.`;
    }
    
    return {
      success: false,
      error: errorMessage,
    };
  }
}

export async function getFrappeCurrentUser(): Promise<string | null> {
  try {
    const frappe = createFrappeClient();
    const res = await frappe.get('/api/method/frappe.auth.get_logged_user');
    const userEmail = res.data.message; // email or null
    return userEmail;
  } catch (err) {
    console.error('[frappeClient] Error getting current user:', err);
    return null;
  }
}

/**
 * Get role profile from Frappe for the currently logged in user (session-based)
 * Uses session-based authentication - requires credentials: 'include'
 * Returns the role_profile_name from User doctype
 * 
 * Note: This requires a whitelisted Frappe method: get_current_user_profile
 * Add this to your Frappe instance:
 * 
 * @frappe.whitelist()
 * def get_current_user_profile():
 *     user = frappe.session.user
 *     if user == "Guest":
 *         return None
 *     user_doc = frappe.get_doc("User", user)
 *     return {
 *         "email": user_doc.email,
 *         "full_name": user_doc.full_name,
 *         "role_profile": user_doc.role_profile_name
 *     }
 */
export async function getFrappeCurrentUserRoleProfile(): Promise<{
  email: string;
  full_name: string | null;
  role_profile: string | null;
} | null> {
  try {
    const baseURL = getFrappeBaseURL();
    if (!baseURL) {
      throw new Error('FRAPPE_URL is not configured');
    }

    // Use session-based auth with credentials: 'include'
    const res = await fetch(`${baseURL}/api/method/get_current_user_profile`, {
      method: 'GET',
      credentials: 'include', // VERY IMPORTANT - required for session-based auth
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch user role profile: ${res.statusText}`);
    }

    const json = await res.json();
    return json.message || null;
  } catch (err) {
    console.error('[frappeClient] Error getting current user role profile:', err);
    return null;
  }
}

/**
 * Get role profile from Frappe for a specific user email (API key-based)
 * Uses API key authentication - fallback when session is not available
 * 
 * Note: This requires a whitelisted Frappe method: get_user_role_profile_by_email
 * Add this to your Frappe instance:
 * 
 * @frappe.whitelist()
 * def get_user_role_profile_by_email(email):
 *     return frappe.get_value("User", email, "role_profile_name")
 */
export async function getFrappeRoleProfileForEmail(userEmail: string): Promise<string | null> {
  try {
    if (!userEmail) {
      return null;
    }

    const frappe = createFrappeClient(true); // Use API key auth
    
    // Try method endpoint first (if whitelisted method exists)
    try {
      const methodRes = await frappe.get('/api/method/get_user_role_profile_by_email', {
        params: {
          email: userEmail,
        },
      });

      if (methodRes?.data?.message) {
        return methodRes.data.message || null;
      }
    } catch (methodErr) {
      // Method endpoint not available, fallback to resource API
      console.warn('[frappeClient] Method endpoint failed, trying resource API:', methodErr);
    }

    // Fallback: Query User doctype directly with API key
    const res = await frappe.get('/api/resource/User', {
      params: {
        fields: JSON.stringify(['name', 'role_profile_name']),
        filters: JSON.stringify([['name', '=', userEmail]]),
        limit_page_length: 1,
      },
    });

    const users = res?.data?.data || [];
    if (users.length > 0) {
      return users[0]?.role_profile_name || null;
    }

    return null;
  } catch (err) {
    console.error(`[frappeClient] Error getting role profile for user ${userEmail}:`, err);
    return null;
  }
}

/**
 * @deprecated Use getFrappeCurrentUserRoleProfile() or getFrappeRoleProfileForEmail() instead
 * Get user roles from Frappe for the currently logged in user
 * This returns roles list, not role_profile_name
 */
export async function getFrappeUserRoles(): Promise<string[]> {
  try {
    const frappe = createFrappeClient();
    const res = await frappe.get('/api/method/frappe.get_roles', {
      params: {
        with_children: 1,
      },
    });
    const roles = res.data?.message || [];
    return Array.isArray(roles) ? roles : [];
  } catch (err) {
    console.error('[frappeClient] Error getting user roles:', err);
    return [];
  }
}

/**
 * @deprecated Use getFrappeRoleProfileForEmail() instead
 * Get user roles from Frappe for a specific user email
 * Queries the Has Role doctype to get all roles assigned to the user
 * This returns roles list, not role_profile_name
 */
export async function getFrappeUserRolesForEmail(userEmail: string): Promise<string[]> {
  try {
    if (!userEmail) {
      return [];
    }

    const frappe = createFrappeClient();
    
    // Query Has Role doctype to get roles for this user
    const res = await frappe.get('/api/resource/Has Role', {
      params: {
        fields: JSON.stringify(['role']),
        filters: JSON.stringify([['parent', '=', userEmail]]),
        limit_page_length: 1000,
      },
    });

    const hasRoles = res?.data?.data || [];
    const roles = hasRoles.map((hr: any) => hr.role).filter(Boolean);
    
    return roles;
  } catch (err) {
    console.error(`[frappeClient] Error getting roles for user ${userEmail}:`, err);
    return [];
  }
}

/**
 * Get all users from Frappe, optionally filtered by company
 */
export async function getAllFrappeUsers(company?: string | null): Promise<Array<{ email: string; full_name: string | null }>> {
  try {
    const frappe = createFrappeClient();
    const filters: any[] = [['enabled', '=', 1]];
    
    // Filter by company if provided
    if (company) {
      filters.push(['company', '=', company]);
    }
    
    const res = await frappe.get('/api/resource/User', {
      params: {
        fields: JSON.stringify(['name', 'full_name', 'company']),
        filters: JSON.stringify(filters),
        limit_page_length: 1000,
      },
    });
    const users = res?.data?.data || [];
    return users.map((user: any) => ({
      email: user.name,
      full_name: user.full_name || null,
    }));
  } catch (err) {
    console.error('[frappeClient] Error getting all users:', err);
    return [];
  }
}

/**
 * Get all projects from Frappe, optionally filtered by company
 * Note: Projects in Frappe may not have a direct company field.
 * If company filtering is needed, we'll filter by the company of users assigned to tasks in those projects.
 */
export async function getAllFrappeProjects(company?: string | null): Promise<Array<{ id: string; name: string }>> {
  try {
    const frappe = createFrappeClient();
    
    // If company is provided, we need to get projects where tasks are assigned to users of that company
    if (company) {
      // First, get all users of the company
      const companyUsers = await getAllFrappeUsers(company);
      const userEmails = companyUsers.map(u => u.email);
      
      if (userEmails.length === 0) {
        return [];
      }
      
      // Get tasks assigned to users of this company
      const taskRes = await frappe.get('/api/resource/Task', {
        params: {
          fields: JSON.stringify(['project']),
          filters: JSON.stringify([
            ['_assign', 'in', userEmails],
            ['project', '!=', ''],
          ]),
          limit_page_length: 1000,
        },
      });
      
      const tasks = taskRes?.data?.data || [];
      const projectIds = [...new Set(tasks.map((t: any) => t.project).filter(Boolean))];
      
      if (projectIds.length === 0) {
        return [];
      }
      
      // Get project details
      const projectRes = await frappe.get('/api/resource/Project', {
        params: {
          fields: JSON.stringify(['name', 'project_name']),
          filters: JSON.stringify([['name', 'in', projectIds]]),
          limit_page_length: 1000,
        },
      });
      
      const projects = projectRes?.data?.data || [];
      return projects.map((project: any) => ({
        id: project.name,
        name: project.project_name || project.name,
      }));
    }
    
    // No company filter - get all projects
    const res = await frappe.get('/api/resource/Project', {
      params: {
        fields: JSON.stringify(['name', 'project_name']),
        limit_page_length: 1000,
      },
    });
    const projects = res?.data?.data || [];
    return projects.map((project: any) => ({
      id: project.name,
      name: project.project_name || project.name,
    }));
  } catch (err) {
    console.error('[frappeClient] Error getting all projects:', err);
    return [];
  }
}

/**
 * Get company from Frappe for the currently logged in user
 * Returns the company name from the Employee doctype (ERPNext best practice)
 * Frappe/ERPNext does NOT store company directly on User.
 * Instead, company is linked via Employee doctype where:
 * - Employee.user_id = User email
 * - Employee.company = Company name
 * Note: For server-side calls, use getFrappeCompanyForUser(email) instead
 */
export async function getFrappeUserCompany(): Promise<string | null> {
  try {
    // Try API key auth first (for server-side)
    const frappe = createFrappeClient(true);
    const userEmail = await getFrappeCurrentUser();
    
    if (!userEmail) {
      // If API key auth doesn't work, try session-based
      const frappeSession = createFrappeClient(false);
      const sessionRes = await frappeSession.get('/api/method/frappe.auth.get_logged_user').catch(() => null);
      const sessionEmail = sessionRes?.data?.message;
      
      if (!sessionEmail) {
        return null;
      }
      
      // Query Employee doctype with user_id filter
      const res = await frappeSession.get('/api/resource/Employee', {
        params: {
          fields: JSON.stringify(['company']),
          filters: JSON.stringify([['user_id', '=', sessionEmail]]),
          limit_page_length: 1,
        },
      });

      const employees = res?.data?.data || [];
      if (employees.length === 0) {
        return null;
      }

      const company = employees[0]?.company;
      return company || null;
    }

    // Query Employee doctype with user_id filter
    const res = await frappe.get('/api/resource/Employee', {
      params: {
        fields: JSON.stringify(['company']),
        filters: JSON.stringify([['user_id', '=', userEmail]]),
        limit_page_length: 1,
      },
    });

    const employees = res?.data?.data || [];
    if (employees.length === 0) {
      return null;
    }

    const company = employees[0]?.company;
    return company || null;
  } catch (err) {
    console.error('[frappeClient] Error getting user company from Employee:', err);
    return null;
  }
}

/**
 * Get company from Frappe for a specific user email
 * Returns the company name from the Employee doctype (ERPNext best practice)
 * Frappe/ERPNext does NOT store company directly on User.
 * Instead, company is linked via Employee doctype where:
 * - Employee.user_id = User email
 * - Employee.company = Company name
 */
export async function getFrappeCompanyForUser(userEmail: string): Promise<string | null> {
  try {
    const frappe = createFrappeClient();
    
    if (!userEmail) {
      return null;
    }

    // Query Employee doctype with user_id filter
    const res = await frappe.get('/api/resource/Employee', {
      params: {
        fields: JSON.stringify(['company']),
        filters: JSON.stringify([['user_id', '=', userEmail]]),
        limit_page_length: 1,
      },
    });

    const employees = res?.data?.data || [];
    if (employees.length === 0) {
      return null;
    }

    const company = employees[0]?.company;
    return company || null;
  } catch (err) {
    console.error('[frappeClient] Error getting company for user from Employee:', err);
    return null;
  }
}

