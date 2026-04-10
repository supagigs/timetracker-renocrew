const axios = require('axios');
const { CookieJar } = require('tough-cookie');
const { wrapper } = require('axios-cookiejar-support');

const jar = new CookieJar();

function clearFrappeSession() {
  jar.removeAllCookiesSync();
}

// Get and validate FRAPPE_URL
function getFrappeBaseURL() {
  const frappeUrl = process.env.FRAPPE_URL;
  
  if (!frappeUrl) {
    return null; // Will be handled in auth functions
  }
  
  // Remove trailing slash if present
  const baseURL = frappeUrl.replace(/\/$/, '');
  
  // Validate URL format
  if (!baseURL.startsWith('http://') && !baseURL.startsWith('https://')) {
    return null; // Invalid format, will be handled in auth functions
  }
  
  return baseURL;
}

// Create axios instance factory - creates a new instance with current FRAPPE_URL
// useApiKey: if true, uses API key authentication (for server-side calls with broader permissions)
//            if false, uses session-based authentication (for login/logout)
function createFrappeClient(useApiKey = false) {
  const baseURL = getFrappeBaseURL();
  
  if (!baseURL) {
    throw new Error('FRAPPE_URL is not configured or invalid. Please check your .env file.');
  }
  
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'Expect': '', // Prevents 417 Expectation Failed (Frappe quirk with Expect: 100-continue)
  };
  
  function addErrorLoggingInterceptor(instance) {
    instance.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 417) {
          console.error('!!! 417 ERROR DETECTED !!!');
          console.error('URL:', error.config.url);
          console.error('Check if this row is already active in ERPNext.');
        }
        console.log('[Frappe] Status:', error.response?.status);
        console.log('[Frappe] Data:', error.response?.data);
        return Promise.reject(error);
      }
    );
    return instance;
  }

  // Use API key authentication if requested and available
  if (useApiKey) {
    const apiKey = process.env.FRAPPE_API_KEY;
    const apiSecret = process.env.FRAPPE_API_SECRET;
    
    if (apiKey && apiSecret) {
      headers['Authorization'] = `token ${apiKey}:${apiSecret}`;
      const instance = axios.create({
        baseURL: baseURL,
        withCredentials: false,
        headers: headers,
      });
      return addErrorLoggingInterceptor(instance);
    }
  }
  
  // Default: session-based authentication with cookies
  const instance = wrapper(
    axios.create({
      baseURL: baseURL,
      withCredentials: true,
      jar,
      headers: headers,
    })
  );
  return addErrorLoggingInterceptor(instance);
}

module.exports = {
  jar,
  getFrappeBaseURL,
  createFrappeClient,
  clearFrappeSession
};


