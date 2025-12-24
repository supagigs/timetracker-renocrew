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

export function createFrappeClient(): AxiosInstance {
  const baseURL = getFrappeBaseURL();
  
  if (!baseURL) {
    throw new Error('FRAPPE_URL is not configured or invalid. Please check your .env file.');
  }
  
  return axios.create({
    baseURL: baseURL,
    withCredentials: true,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
  });
}

export async function frappeLogin(email: string, password: string): Promise<{ success: boolean; error?: string }> {
  try {
    const frappe = createFrappeClient();
    
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

