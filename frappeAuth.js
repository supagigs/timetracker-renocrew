const { getFrappeBaseURL, createFrappeClient } = require('./frappeClient');

// Logging functions will be passed from main.js
let logInfo, logError, logWarn;

function setLoggers(loggers) {
  logInfo = loggers.logInfo;
  logError = loggers.logError;
  logWarn = loggers.logWarn;
}

async function login(email, password) {
  try {
    if (logInfo) logInfo('Frappe', `Attempting login for user: ${email}`);
    
    // Check if FRAPPE_URL is configured
    const baseURL = getFrappeBaseURL();
    if (!baseURL) {
      const frappeUrl = process.env.FRAPPE_URL;
      let errorMsg;
      if (!frappeUrl) {
        errorMsg = 'FRAPPE_URL is not configured. Please add FRAPPE_URL=https://your-frappe-instance.com to your .env file.';
      } else {
        errorMsg = `Invalid FRAPPE_URL format. It must start with http:// or https://. Current value: ${frappeUrl}`;
      }
      if (logError) logError('Frappe', errorMsg);
      return { success: false, error: errorMsg };
    }
    
    // Create frappe client with current FRAPPE_URL (in case it changed)
    const frappe = createFrappeClient();
    
    const res = await frappe.post('/api/method/login', {
      usr: email,
      pwd: password,
    });

    if (res.data.message === 'Logged In') {
      if (logInfo) logInfo('Frappe', `Login successful for user: ${email}`);
      return { success: true };
    }

    if (logWarn) logWarn('Frappe', `Login failed: Invalid credentials for ${email}`);
    return { success: false, error: 'Invalid login credentials' };
  } catch (err) {
    let errorMessage = err.response?.data?.message || err.message || 'Login failed';
    
    // Provide more helpful error messages for common issues
    if (err.code === 'ERR_INVALID_URL' || err.message?.includes('Invalid URL')) {
      const frappeUrl = process.env.FRAPPE_URL || 'not set';
      errorMessage = `Invalid Frappe URL. Please check FRAPPE_URL in your .env file. Current value: ${frappeUrl}. URL must start with http:// or https://`;
    } else if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
      errorMessage = `Cannot connect to Frappe server at ${process.env.FRAPPE_URL}. Please check if the URL is correct and the server is accessible.`;
    }
    
    if (logError) logError('Frappe', `Login error for ${email}: ${errorMessage}`, err);
    return {
      success: false,
      error: errorMessage,
    };
  }
}

async function logout() {
  try {
    if (logInfo) logInfo('Frappe', 'Logging out user');
    const frappe = createFrappeClient();
    await frappe.get('/api/method/logout');
    if (logInfo) logInfo('Frappe', 'Logout successful');
  } catch (err) {
    if (logError) logError('Frappe', 'Logout error:', err);
    // Don't throw - logout should always succeed from app perspective
  } finally {
    clearFrappeSession();
  }
}

async function getCurrentUser() {
  try {
    const frappe = createFrappeClient();
    const res = await frappe.get('/api/method/frappe.auth.get_logged_user');
    const userEmail = res.data.message; // email or null
    if (logInfo) logInfo('Frappe', `Current user: ${userEmail || 'Not logged in'}`);
    return userEmail;
  } catch (err) {
    if (logError) logError('Frappe', 'Error getting current user:', err);
    return null;
  }
}

async function getUserFullName(userEmail) {
  try {
    if (!userEmail) {
      return null;
    }

    const extractFullName = (user) => {
      if (!user) return null;

      // Prefer explicit full_name if present
      if (user.full_name && typeof user.full_name === 'string' && user.full_name.trim()) {
        return user.full_name.trim();
      }

      // Fallback: combine first_name and last_name
      const firstName = typeof user.first_name === 'string' ? user.first_name.trim() : '';
      const lastName = typeof user.last_name === 'string' ? user.last_name.trim() : '';
      const combined = `${firstName} ${lastName}`.trim();
      if (combined) {
        return combined;
      }

      // Final fallback: use name field if it's not an email
      if (user.name && typeof user.name === 'string' && user.name.trim()) {
        const value = user.name.trim();
        // If it's clearly an email, don't use it as display name
        if (!value.includes('@')) {
          return value;
        }
      }

      return null;
    };

    // First, try with API key authentication (has broader permissions)
    const apiKey = process.env.FRAPPE_API_KEY;
    const apiSecret = process.env.FRAPPE_API_SECRET;

    const baseParams = {
      fields: JSON.stringify(['name', 'full_name', 'first_name', 'last_name']),
      filters: JSON.stringify([['name', '=', userEmail]]),
      limit_page_length: 1,
    };

    if (apiKey && apiSecret) {
      try {
        const frappeApiKey = createFrappeClient(true); // Use API key auth

        const res = await frappeApiKey.get('/api/resource/User', {
          params: baseParams,
        });

        const users = res?.data?.data || [];
        if (users.length > 0) {
          const fullName = extractFullName(users[0]);
          if (fullName) {
            if (logInfo) logInfo('Frappe', `Full name for user ${userEmail} (via API key): ${fullName}`);
            return fullName;
          }
        }
      } catch (apiKeyErr) {
        const errorMsg = apiKeyErr.response?.data?.exception || apiKeyErr.message || 'Unknown error';
        if (logWarn) logWarn('Frappe', `API key auth failed in getUserFullName, trying session-based: ${errorMsg}`);
      }
    }

    // Fallback: Try with session-based authentication
    const frappe = createFrappeClient(false); // Use session-based auth
    const res = await frappe.get('/api/resource/User', {
      params: baseParams,
    });

    const users = res?.data?.data || [];
    if (users.length > 0) {
      const fullName = extractFullName(users[0]);
      if (fullName) {
        if (logInfo) logInfo('Frappe', `Full name for user ${userEmail} (via session): ${fullName}`);
        return fullName;
      }
    }

    if (logWarn) logWarn('Frappe', `No full name found for user ${userEmail}`);
    return null;
  } catch (err) {
    if (logError) logError('Frappe', 'Error getting user full name:', err);
    return null;
  }
}

async function getUserCompany(userEmail) {
  try {
    if (!userEmail) {
      return null;
    }

    // Frappe/ERPNext stores company on Employee doctype, not User doctype
    // Employee has user_id field that links to User email
    // This is the correct and clean solution (ERPNext best practice)

    // First, try with API key authentication (has broader permissions)
    const apiKey = process.env.FRAPPE_API_KEY;
    const apiSecret = process.env.FRAPPE_API_SECRET;
    
    if (apiKey && apiSecret) {
      try {
        const frappeApiKey = createFrappeClient(true); // Use API key auth
        const company = await tryGetCompanyFromEmployee(frappeApiKey, userEmail);
        if (company) {
          if (logInfo) logInfo('Frappe', `Company for user ${userEmail} (via API key from Employee): ${company}`);
          return company;
        }
      } catch (apiKeyErr) {
        const errorMsg = apiKeyErr.response?.data?.exception || apiKeyErr.message || 'Unknown error';
        if (logWarn) logWarn('Frappe', `API key auth failed, trying session-based: ${errorMsg}`);
      }
    }

    // Fallback: Try with session-based authentication
    const frappe = createFrappeClient(false); // Use session-based auth
    const company = await tryGetCompanyFromEmployee(frappe, userEmail);
    if (company) {
      if (logInfo) logInfo('Frappe', `Company for user ${userEmail} (via session from Employee): ${company}`);
      return company;
    }

    if (logWarn) logWarn('Frappe', `No company found for user ${userEmail} in Employee doctype`);
    return null;
  } catch (err) {
    if (logError) logError('Frappe', 'Error getting user company:', err);
    return null;
  }
}

// Helper function to get company from Employee doctype
// This is the ERPNext best practice - company is stored on Employee, not User
// Employee has user_id field that links to User email
async function tryGetCompanyFromEmployee(frappe, userEmail) {
  try {
    // Extract username part (before @) in case user_id stores just the username
    const username = userEmail.split('@')[0];
    
    // Try multiple approaches to find the Employee record
    
    // Approach 1: Query by full email in user_id field
    try {
      const employeeRes = await frappe.get('/api/resource/Employee', {
        params: {
          fields: JSON.stringify(['company', 'user_id', 'name']),
          filters: JSON.stringify([['user_id', '=', userEmail]]),
          limit_page_length: 1,
        },
      });

      const employees = employeeRes?.data?.data || [];
      if (employees.length > 0) {
        const companyValue = employees[0]?.company || null;
        if (companyValue) {
          const extractedCompany = extractCompanyString(companyValue);
          if (extractedCompany) {
            if (logInfo) logInfo('Frappe', `Found company via user_id (email) for ${userEmail}: ${extractedCompany}`);
            return extractedCompany;
          }
        }
      }
    } catch (err1) {
      if (logWarn) logWarn('Frappe', `Failed to query Employee by email user_id: ${err1.message}`);
    }

    // Approach 2: Query by username (before @) in user_id field
    try {
      const employeeRes = await frappe.get('/api/resource/Employee', {
        params: {
          fields: JSON.stringify(['company', 'user_id', 'name']),
          filters: JSON.stringify([['user_id', '=', username]]),
          limit_page_length: 1,
        },
      });

      const employees = employeeRes?.data?.data || [];
      if (employees.length > 0) {
        const companyValue = employees[0]?.company || null;
        if (companyValue) {
          const extractedCompany = extractCompanyString(companyValue);
          if (extractedCompany) {
            if (logInfo) logInfo('Frappe', `Found company via user_id (username) for ${userEmail}: ${extractedCompany}`);
            return extractedCompany;
          }
        }
      }
    } catch (err2) {
      if (logWarn) logWarn('Frappe', `Failed to query Employee by username user_id: ${err2.message}`);
    }

    // Approach 3: Query by email in name field (some setups use email as Employee name)
    try {
      const employeeRes = await frappe.get('/api/resource/Employee', {
        params: {
          fields: JSON.stringify(['company', 'user_id', 'name']),
          filters: JSON.stringify([['name', '=', userEmail]]),
          limit_page_length: 1,
        },
      });

      const employees = employeeRes?.data?.data || [];
      if (employees.length > 0) {
        const companyValue = employees[0]?.company || null;
        if (companyValue) {
          const extractedCompany = extractCompanyString(companyValue);
          if (extractedCompany) {
            if (logInfo) logInfo('Frappe', `Found company via name (email) for ${userEmail}: ${extractedCompany}`);
            return extractedCompany;
          }
        }
      }
    } catch (err3) {
      if (logWarn) logWarn('Frappe', `Failed to query Employee by name (email): ${err3.message}`);
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
          if (logInfo) logInfo('Frappe', `Found company via get_value (email) for ${userEmail}: ${extractedCompany}`);
          return extractedCompany;
        }
      }
    } catch (methodErr) {
      if (logWarn) logWarn('Frappe', `Method endpoint failed for Employee (email): ${methodErr.message}`);
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
          if (logInfo) logInfo('Frappe', `Found company via get_value (username) for ${userEmail}: ${extractedCompany}`);
          return extractedCompany;
        }
      }
    } catch (methodErr2) {
      if (logWarn) logWarn('Frappe', `Method endpoint failed for Employee (username): ${methodErr2.message}`);
    }

    // If all approaches fail, log for debugging
    if (logWarn) logWarn('Frappe', `Could not find Employee record for user ${userEmail} (tried email and username)`);
  } catch (employeeErr) {
    if (logWarn) logWarn('Frappe', `Error getting company from Employee doctype: ${employeeErr.message}`);
  }
  return null;
}

// Helper function to extract company string from various formats
function extractCompanyString(companyValue) {
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
    const stringValue = Object.values(companyValue).find(v => typeof v === 'string' && v.trim());
    return stringValue ? stringValue.trim() : null;
  }
  
  return null;
}

async function getUserRoleProfile(userEmail) {
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
            if (logInfo) logInfo('Frappe', `Role profile for user ${userEmail} (via API key method): ${roleProfile || 'None'}`);
            return roleProfile;
          }
        } catch (methodErr) {
          // Method endpoint not available, fallback to resource API
          if (logWarn) logWarn('Frappe', `Method endpoint failed, trying resource API: ${methodErr.message}`);
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
          if (logInfo) logInfo('Frappe', `Role profile for user ${userEmail} (via API key resource): ${roleProfile || 'None'}`);
          return roleProfile;
        }
      } catch (apiKeyErr) {
        const errorMsg = apiKeyErr.response?.data?.exception || apiKeyErr.message || 'Unknown error';
        if (logWarn) logWarn('Frappe', `API key auth failed, trying session-based: ${errorMsg}`);
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
      if (logInfo) logInfo('Frappe', `Role profile for user ${userEmail} (via session): ${roleProfile || 'None'}`);
      return roleProfile;
    }

    if (logWarn) logWarn('Frappe', `No role profile found for user ${userEmail}`);
    return null;
  } catch (err) {
    if (logError) logError('Frappe', 'Error getting user role profile:', err);
    return null;
  }
}

module.exports = { login, logout, getCurrentUser, getUserCompany, getUserRoleProfile, getUserFullName, setLoggers, extractCompanyString };

