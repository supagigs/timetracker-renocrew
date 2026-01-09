import axios, { AxiosInstance } from 'axios';
import { CookieJar } from 'tough-cookie';
import { wrapper } from 'axios-cookiejar-support';

// Shared cookie jar for session-based authentication
// This allows cookies from frappeLogin to be used by subsequent requests
const cookieJar = new CookieJar();

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
    'Expect': '', // 🔥 REQUIRED for Frappe - prevents 417 errors
  };
  
  // For server-side API calls, use API key authentication
  if (useApiKey) {
    const apiKey = process.env.FRAPPE_API_KEY;
    const apiSecret = process.env.FRAPPE_API_SECRET;
    
    if (apiKey && apiSecret) {
      headers['Authorization'] = `token ${apiKey}:${apiSecret}`;
      
      // API key auth - no cookies needed
      return axios.create({
        baseURL: baseURL,
        headers: headers,
      });
    } else {
      console.warn('[frappeClient] FRAPPE_API_KEY and FRAPPE_API_SECRET not configured. Falling back to session-based auth.');
    }
  }
  
  // Session-based auth with cookie jar for server-side cookie management
  // In Node.js, withCredentials doesn't work, so we use a cookie jar
  return wrapper(
    axios.create({
      baseURL: baseURL,
      jar: cookieJar, // Shared cookie jar for session-based auth
      withCredentials: true,
      headers: headers,
    })
  );
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
 * Uses session-based authentication with axios
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
 * 
 * Note: In server-side Next.js, this uses the same axios instance as frappeLogin,
 * which should maintain the session cookies. For client-side calls, use API key auth instead.
 */
export async function getFrappeCurrentUserRoleProfile(): Promise<{
  email: string;
  full_name: string | null;
  role_profile: string | null;
} | null> {
  try {
    // Use session-based auth (useApiKey: false) to use the session from frappeLogin
    const frappe = createFrappeClient(false);
    
    const res = await frappe.get('/api/method/get_current_user_profile');
    return res.data?.message || null;
  } catch (err: any) {
    console.error('[frappeClient] Error getting current user role profile:', err);
    return null;
  }
}

/**
 * Get role profile from Frappe for a specific user email
 * Matches the app's getUserRoleProfile logic:
 * 1. First tries API key authentication with method endpoint
 * 2. Falls back to querying User doctype directly with API key
 * 3. Falls back to session-based authentication
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

    // Frappe stores role_profile_name on User doctype
    // This is the correct way to check for Role Profile (not roles list)

    // First, try with API key authentication (has broader permissions)
    const apiKey = process.env.FRAPPE_API_KEY;
    const apiSecret = process.env.FRAPPE_API_SECRET;
    
    if (apiKey && apiSecret) {
      try {
        const frappeApiKey = createFrappeClient(true); // Use API key auth
        
        // Try method endpoint first (if whitelisted method exists)
        try {
          const methodRes = await frappeApiKey.get('/api/method/get_user_role_profile_by_email', {
            params: {
              email: userEmail,
            },
          });

          if (methodRes?.data?.message) {
            const roleProfile = methodRes.data.message || null;
            console.log(`[frappeClient] Role profile for user ${userEmail} (via API key method): ${roleProfile || 'None'}`);
            return roleProfile;
          }
        } catch (methodErr) {
          // Method endpoint not available, fallback to resource API
          console.warn(`[frappeClient] Method endpoint failed, trying resource API: ${methodErr}`);
        }

        // Fallback: Query User doctype directly with API key
        const res = await frappeApiKey.get('/api/resource/User', {
          params: {
            fields: JSON.stringify(['name', 'role_profile_name']),
            filters: JSON.stringify([['name', '=', userEmail]]),
            limit_page_length: 1,
          },
        });

        const users = res?.data?.data || [];
        if (users.length > 0) {
          const roleProfile = users[0]?.role_profile_name || null;
          console.log(`[frappeClient] Role profile for user ${userEmail} (via API key resource): ${roleProfile || 'None'}`);
          return roleProfile;
        }
      } catch (apiKeyErr: any) {
        const errorMsg = apiKeyErr.response?.data?.exception || apiKeyErr.message || 'Unknown error';
        console.warn(`[frappeClient] API key auth failed, trying session-based: ${errorMsg}`);
      }
    }

    // Fallback: Try with session-based authentication
    const frappe = createFrappeClient(false); // Use session-based auth
    
    // Query User doctype directly
    const res = await frappe.get('/api/resource/User', {
      params: {
        fields: JSON.stringify(['name', 'role_profile_name']),
        filters: JSON.stringify([['name', '=', userEmail]]),
        limit_page_length: 1,
      },
    });

    const users = res?.data?.data || [];
    if (users.length > 0) {
      const roleProfile = users[0]?.role_profile_name || null;
      console.log(`[frappeClient] Role profile for user ${userEmail} (via session): ${roleProfile || 'None'}`);
      return roleProfile;
    }

    console.warn(`[frappeClient] No role profile found for user ${userEmail}`);
    return null;
  } catch (err: any) {
    const status = err?.response?.status;
    if (status === 403) {
      console.warn(`[frappeClient] 403 getting role profile for ${userEmail}; returning null (will fallback)`);
      return null;
    }
    console.error(`[frappeClient] Error getting role profile for user ${userEmail}:`, err);
    return null;
  }
}

/**
 * Determine user role from Frappe role profile
 * Manager roles: SuperAdmin, MainAdmin, and any other non-Employee role profiles
 * Employee role: Only when role_profile_name is exactly "Employee"
 * 
 * @param roleProfile - The role_profile_name from Frappe (e.g., 'SuperAdmin', 'MainAdmin', 'Employee')
 * @returns 'Manager' for admin roles, 'Employee' for Employee role, 'Manager' as default for null/unknown roles
 */
export function determineRoleFromRoleProfile(roleProfile: string | null): 'Manager' | 'Employee' {
  // Only 'Employee' is treated as Employee, everything else (including null) is Manager
  // This ensures admin roles like SuperAdmin, MainAdmin, etc. are all treated as Managers
  return roleProfile === 'Employee' ? 'Employee' : 'Manager';
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
 * 
 * IMPORTANT: This function uses a whitelisted Frappe method instead of /api/resource/User
 * because Frappe blocks direct access to the User doctype via API (returns 417).
 * 
 * ⚠️ NOTE: You need to create a PYTHON METHOD, not a Server Script!
 * Server Scripts cannot be called via API endpoints.
 * 
 * Steps to create the method:
 * 
 * 1. Create or edit a Python file in your custom app:
 *    File: your_app/api/users.py (create this file if it doesn't exist)
 * 
 * 2. Add this code:
 * 
 *    import frappe
 * 
 *    @frappe.whitelist()
 *    def get_users(company=None):
 *        # Optional: restrict to System Manager role
 *        # frappe.only_for("System Manager")
 *        
 *        filters = {"enabled": 1}
 *        if company:
 *            filters["company"] = company
 *        
 *        users = frappe.get_all(
 *            "User",
 *            filters=filters,
 *            fields=["name", "full_name", "company"],
 *            limit_page_length=1000
 *        )
 *        
 *        return users
 * 
 * 3. Restart your Frappe bench:
 *    bench restart
 * 
 * Method path format:
 * - If file is: your_app/api/users.py → path: /api/method/your_app.api.users.get_users
 * - Or create in a simpler location for: /api/method/get_users
 * 
 * To create in a simpler location, you can add it to any existing Python file that's already
 * being loaded, or create a new file in your app's root api folder.
 */
export async function getAllFrappeUsers(company?: string | null): Promise<Array<{ email: string; full_name: string | null; company: string | null }>> {
  try {
    const frappe = createFrappeClient(true); // Use API key auth
    
    const params: Record<string, string> = {};
    if (company) {
      params.company = company;
    }
    
    const res = await frappe.get('/api/method/get_users', { params });
    
    // ✅ Always read from res.data.message (NOT res.data.data)
    const users = res.data.message || [];
    
    if (!Array.isArray(users)) {
      console.warn('[frappeClient] get_users method returned unexpected format:', users);
      return [];
    }
    
    const mappedUsers = users.map((user: any) => {
      // Extract company string from various formats (string, object with name, etc.)
      let companyValue: string | null = null;
      if (user.company) {
        if (typeof user.company === 'string') {
          companyValue = user.company.trim() || null;
        } else if (typeof user.company === 'object' && user.company.name) {
          companyValue = typeof user.company.name === 'string' ? user.company.name.trim() : null;
        } else if (typeof user.company === 'object') {
          const stringValue = Object.values(user.company).find((v: any) => typeof v === 'string' && v.trim());
          companyValue = stringValue ? (stringValue as string).trim() : null;
        }
      }
      
      return {
        email: user.name || user.email,
        full_name: user.full_name || null,
        company: companyValue,
      };
    });
    
    // Log how many users have company information
    const usersWithCompany = mappedUsers.filter(u => u.company).length;
    console.log(`[frappeClient] getAllFrappeUsers returned ${mappedUsers.length} users, ${usersWithCompany} with company information`);
    
    return mappedUsers;
  } catch (err: any) {
    // Log error details for debugging, but don't throw - return empty array
    // This allows callers to gracefully fall back to Supabase
    const errorDetails: Record<string, any> = {};
    
    if (err?.response) {
      errorDetails.status = err.response.status;
      errorDetails.statusText = err.response.statusText;
      errorDetails.data = err.response.data;
      if (err.response.headers) {
        errorDetails.contentType = err.response.headers['content-type'];
      }
    }
    
    if (err?.message) {
      errorDetails.message = err.message;
    }
    
    if (err?.code) {
      errorDetails.code = err.code;
    }
    
    // Only log if there's actual error information
    if (Object.keys(errorDetails).length > 0) {
      console.warn('[frappeClient] get_users failed:', errorDetails);
    } else {
      // If error object is empty or malformed, log the raw error
      console.warn('[frappeClient] get_users failed with unknown error:', err);
    }
    
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
 * Get projects assigned to a specific user in Frappe
 * Returns projects from multiple sources (matching frappeService.js logic):
 * 1. Projects from tasks assigned to the user
 * 2. Projects directly assigned via _assign field on Project (PRIMARY method)
 * 3. Projects via Project User doctype assignments
 */
export async function getFrappeProjectsForUser(userEmail: string): Promise<Array<{ id: string; name: string }>> {
  try {
    const frappe = createFrappeClient();
    const normalizedEmail = userEmail.trim().toLowerCase();
    const projectIds = new Set<string>();
    
    // Method 1: Get projects from tasks assigned to this user
    try {
      const taskRes = await frappe.get('/api/resource/Task', {
        params: {
          fields: JSON.stringify(['project']),
          filters: JSON.stringify([
            ['_assign', 'like', `%${normalizedEmail}%`],
            ['project', '!=', ''],
          ]),
          limit_page_length: 1000,
        },
      });
      
      const tasks = Array.isArray(taskRes?.data?.data) ? taskRes.data.data : [];
      const projectIdsFromTasks = [...new Set(tasks.map((t: any) => t.project).filter((p: any) => p))] as string[];
      projectIdsFromTasks.forEach((id) => projectIds.add(id));
      console.log(`[frappeClient] Found ${tasks.length} task(s), extracted ${projectIdsFromTasks.length} unique project(s) from tasks`);
    } catch (taskErr) {
      console.warn('[frappeClient] Error fetching tasks for projects:', taskErr);
    }
    
    // Method 2: Get projects directly assigned via _assign field on Project
    // This is the PRIMARY way projects are assigned to users in Frappe
    try {
      const projectWithAssignRes = await frappe.get('/api/resource/Project', {
        params: {
          fields: JSON.stringify(['name', 'project_name', '_assign']),
          filters: JSON.stringify([
            ['_assign', 'like', `%${normalizedEmail}%`],
          ]),
          limit_page_length: 1000,
        },
      });
      
      const projectsWithAssign = projectWithAssignRes?.data?.data || [];
      projectsWithAssign.forEach((project: any) => {
        if (project.name) {
          projectIds.add(project.name);
        }
      });
      console.log(`[frappeClient] Found ${projectsWithAssign.length} project(s) directly assigned via _assign field`);
    } catch (assignFieldErr) {
      console.warn('[frappeClient] Error checking _assign field for projects:', assignFieldErr);
    }
    
    // Method 3: Get projects via Project User doctype assignments
    try {
      const projectUserRes = await frappe.get('/api/resource/Project User', {
        params: {
          fields: JSON.stringify(['project', 'user']),
          filters: JSON.stringify([
            ['user', '=', normalizedEmail],
          ]),
          limit_page_length: 1000,
        },
      });
      
      const projectUsers = Array.isArray(projectUserRes?.data?.data) ? projectUserRes.data.data : [];
      const projectIdsFromDirect = [...new Set(projectUsers.map((pu: any) => pu.project).filter((p: any) => p))] as string[];
      projectIdsFromDirect.forEach((id) => projectIds.add(id));
      console.log(`[frappeClient] Found ${projectUsers.length} project assignment(s) via Project User doctype`);
    } catch (projectUserErr) {
      // Project User doctype might not exist, that's okay
      console.log('[frappeClient] Project User doctype not available or no assignments found');
    }
    
    if (projectIds.size === 0) {
      console.log('[frappeClient] No projects found from any source');
      return [];
    }
    
    // Get project details for all unique project IDs
    const uniqueProjectIds = Array.from(projectIds);
    console.log(`[frappeClient] Fetching details for ${uniqueProjectIds.length} unique project(s): ${uniqueProjectIds.join(', ')}`);
    
    let projects: Array<{ id: string; name: string }> = [];
    
    // Try batch fetch first (more efficient)
    try {
      const projectRes = await frappe.get('/api/resource/Project', {
        params: {
          fields: JSON.stringify(['name', 'project_name']),
          filters: JSON.stringify([
            ['name', 'in', uniqueProjectIds],
          ]),
          limit_page_length: 1000,
        },
      });
      
      projects = (projectRes.data.data || []).map((p: any) => ({
        id: p.name,
        name: p.project_name || p.name,
      }));
      
      console.log(`[frappeClient] Batch fetch returned ${projects.length} project(s)`);
    } catch (batchErr) {
      console.warn('[frappeClient] Batch fetch failed, trying individual fetches:', batchErr);
      // Fallback: fetch projects individually
      for (const projectId of uniqueProjectIds) {
        try {
          const projectRes = await frappe.get(`/api/resource/Project/${projectId}`);
          const project = projectRes?.data?.data;
          if (project) {
            projects.push({
              id: project.name,
              name: project.project_name || project.name,
            });
          }
        } catch (indErr) {
          console.warn(`[frappeClient] Failed to fetch project ${projectId}:`, indErr);
        }
      }
    }
    
    // Verify we got all projects
    const foundProjectIds = projects.map(p => p.id);
    const missingProjectIds = uniqueProjectIds.filter(id => !foundProjectIds.includes(id));
    
    if (missingProjectIds.length > 0) {
      console.warn(`[frappeClient] Warning: Could not fetch details for ${missingProjectIds.length} project(s): ${missingProjectIds.join(', ')}`);
    }
    
    console.log(`[frappeClient] Returning ${projects.length} project(s) for user ${normalizedEmail}`);
    return projects;
  } catch (err) {
    console.error('[frappeClient] Error getting projects for user:', err);
    return [];
  }
}

/**
 * Batch fetch company information for multiple users from Employee doctype
 * More efficient than calling getFrappeCompanyForUser individually for each user
 * Uses multiple query strategies to find employees
 */
export async function batchGetFrappeCompaniesForUsers(userEmails: string[]): Promise<Map<string, string | null>> {
  const companyMap = new Map<string, string | null>();
  
  if (userEmails.length === 0) {
    return companyMap;
  }
  
  try {
    const frappe = createFrappeClient(true); // Use API key auth
    
    // Helper function to extract company string
    const extractCompanyString = (companyValue: any): string | null => {
      if (!companyValue) return null;
      if (typeof companyValue === 'string') {
        return companyValue.trim() || null;
      }
      if (typeof companyValue === 'object' && companyValue.name) {
        return typeof companyValue.name === 'string' ? companyValue.name.trim() : null;
      }
      if (typeof companyValue === 'object') {
        const stringValue = Object.values(companyValue).find((v: any) => typeof v === 'string' && v.trim());
        return stringValue ? (stringValue as string).trim() : null;
      }
      return null;
    };
    
    // Strategy 1: Query all employees (if not too many) and filter in memory
    // This is more efficient than individual queries
    try {
      const res = await frappe.get('/api/resource/Employee', {
        params: {
          fields: JSON.stringify(['company', 'user_id', 'name']),
          limit_page_length: 1000,
        },
      });
      
      const employees = res?.data?.data || [];
      const userEmailSet = new Set(userEmails.map(e => e.toLowerCase().trim()));
      
      // Map user_id to company for matching users
      employees.forEach((employee: any) => {
        const userId = employee.user_id;
        if (userId) {
          const normalizedUserId = userId.toLowerCase().trim();
          const username = normalizedUserId.includes('@') ? normalizedUserId.split('@')[0] : null;
          
          // Check if this employee matches any of our requested users
          if (userEmailSet.has(normalizedUserId) || (username && userEmailSet.has(username))) {
            const company = extractCompanyString(employee.company);
            if (company) {
              // Map to all matching email formats
              for (const email of userEmails) {
                const normalizedEmail = email.toLowerCase().trim();
                if (normalizedEmail === normalizedUserId || normalizedEmail === username) {
                  companyMap.set(email, company);
                }
              }
            }
          }
        }
      });
      
      console.log(`[frappeClient] batchGetFrappeCompaniesForUsers: Found company for ${companyMap.size} users out of ${userEmails.length} requested`);
    } catch (err) {
      console.warn('[frappeClient] batchGetFrappeCompaniesForUsers failed:', err);
    }
  } catch (err) {
    console.warn('[frappeClient] batchGetFrappeCompaniesForUsers error:', err);
  }
  
  return companyMap;
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
    let userEmail = await getFrappeCurrentUser();
    
    if (!userEmail) {
      // If API key auth doesn't work, try session-based
      const frappeSession = createFrappeClient(false);
      const sessionRes = await frappeSession.get('/api/method/frappe.auth.get_logged_user').catch(() => null);
      userEmail = sessionRes?.data?.message;
      
      if (!userEmail) {
        return null;
      }
      
      // Use the improved getFrappeCompanyForUser function
      return await getFrappeCompanyForUser(userEmail);
    }

    // Use the improved getFrappeCompanyForUser function
    return await getFrappeCompanyForUser(userEmail);
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
    const frappe = createFrappeClient(true); // Use API key auth for broader permissions
    
    if (!userEmail) {
      return null;
    }

    // Extract username part (before @) in case user_id stores just the username
    const username = userEmail.split('@')[0];

    // Helper function to extract company string from various formats
    const extractCompanyString = (companyValue: any): string | null => {
      if (!companyValue) return null;
      
      // Handle string directly
      if (typeof companyValue === 'string') {
        return companyValue.trim() || null;
      }
      
      // Handle object with name property
      if (typeof companyValue === 'object' && companyValue.name) {
        return typeof companyValue.name === 'string' ? companyValue.name.trim() : null;
      }
      
      // Handle object - try to find string value
      if (typeof companyValue === 'object') {
        const stringValue = Object.values(companyValue).find((v: any) => typeof v === 'string' && v.trim());
        return stringValue ? (stringValue as string).trim() : null;
      }
      
      return null;
    };

    // Approach 1: Query by full email in user_id field
    try {
      const res = await frappe.get('/api/resource/Employee', {
        params: {
          fields: JSON.stringify(['company', 'user_id', 'name']),
          filters: JSON.stringify([['user_id', '=', userEmail]]),
          limit_page_length: 1,
        },
      });

      const employees = res?.data?.data || [];
      if (employees.length > 0) {
        const companyValue = employees[0]?.company || null;
        if (companyValue) {
          const extractedCompany = extractCompanyString(companyValue);
          if (extractedCompany) {
            console.log(`[frappeClient] Found company via user_id (email) for ${userEmail}: ${extractedCompany}`);
            return extractedCompany;
          }
        }
      }
    } catch (err1) {
      console.warn(`[frappeClient] Failed to query Employee by email user_id: ${err1}`);
    }

    // Approach 2: Query by username (before @) in user_id field
    try {
      const res = await frappe.get('/api/resource/Employee', {
        params: {
          fields: JSON.stringify(['company', 'user_id', 'name']),
          filters: JSON.stringify([['user_id', '=', username]]),
          limit_page_length: 1,
        },
      });

      const employees = res?.data?.data || [];
      if (employees.length > 0) {
        const companyValue = employees[0]?.company || null;
        if (companyValue) {
          const extractedCompany = extractCompanyString(companyValue);
          if (extractedCompany) {
            console.log(`[frappeClient] Found company via user_id (username) for ${userEmail}: ${extractedCompany}`);
            return extractedCompany;
          }
        }
      }
    } catch (err2) {
      console.warn(`[frappeClient] Failed to query Employee by username user_id: ${err2}`);
    }

    // Approach 3: Query by email in name field (some setups use email as Employee name)
    try {
      const res = await frappe.get('/api/resource/Employee', {
        params: {
          fields: JSON.stringify(['company', 'user_id', 'name']),
          filters: JSON.stringify([['name', '=', userEmail]]),
          limit_page_length: 1,
        },
      });

      const employees = res?.data?.data || [];
      if (employees.length > 0) {
        const companyValue = employees[0]?.company || null;
        if (companyValue) {
          const extractedCompany = extractCompanyString(companyValue);
          if (extractedCompany) {
            console.log(`[frappeClient] Found company via name (email) for ${userEmail}: ${extractedCompany}`);
            return extractedCompany;
          }
        }
      }
    } catch (err3) {
      console.warn(`[frappeClient] Failed to query Employee by name (email): ${err3}`);
    }

    // Approach 4: Try method endpoint with email
    try {
      const methodRes = await frappe.get('/api/method/frappe.client.get_value', {
        params: {
          doctype: 'Employee',
          filters: JSON.stringify({ user_id: userEmail }),
          fieldname: 'company',
        },
      });

      if (methodRes?.data?.message) {
        const companyValue = methodRes.data.message;
        const extractedCompany = extractCompanyString(companyValue);
        if (extractedCompany) {
          console.log(`[frappeClient] Found company via get_value (email) for ${userEmail}: ${extractedCompany}`);
          return extractedCompany;
        }
      }
    } catch (methodErr) {
      console.warn(`[frappeClient] Method endpoint failed for Employee (email): ${methodErr}`);
    }

    // Approach 5: Try method endpoint with username
    try {
      const methodRes = await frappe.get('/api/method/frappe.client.get_value', {
        params: {
          doctype: 'Employee',
          filters: JSON.stringify({ user_id: username }),
          fieldname: 'company',
        },
      });

      if (methodRes?.data?.message) {
        const companyValue = methodRes.data.message;
        const extractedCompany = extractCompanyString(companyValue);
        if (extractedCompany) {
          console.log(`[frappeClient] Found company via get_value (username) for ${userEmail}: ${extractedCompany}`);
          return extractedCompany;
        }
      }
    } catch (methodErr2) {
      console.warn(`[frappeClient] Method endpoint failed for Employee (username): ${methodErr2}`);
    }

    // Approach 6: Fallback to User.company field (some setups store company directly on User)
    try {
      const userRes = await frappe.get('/api/resource/User', {
        params: {
          fields: JSON.stringify(['company']),
          filters: JSON.stringify([['name', '=', userEmail]]),
          limit_page_length: 1,
        },
      });

      const users = userRes?.data?.data || [];
      if (users.length > 0) {
        const companyValue = users[0]?.company || null;
        if (companyValue) {
          const extractedCompany = extractCompanyString(companyValue);
          if (extractedCompany) {
            console.log(`[frappeClient] Found company via User.company for ${userEmail}: ${extractedCompany}`);
            return extractedCompany;
          }
        }
      }
    } catch (userErr) {
      console.warn(`[frappeClient] Failed to query User.company for ${userEmail}: ${userErr}`);
    }

    console.warn(`[frappeClient] Could not find company for user ${userEmail} in Employee or User doctypes`);
    return null;
  } catch (err) {
    console.error('[frappeClient] Error getting company for user from Employee:', err);
    return null;
  }
}

