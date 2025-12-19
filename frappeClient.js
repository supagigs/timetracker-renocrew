const axios = require('axios');
const { CookieJar } = require('tough-cookie');
const { wrapper } = require('axios-cookiejar-support');

const jar = new CookieJar();

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
function createFrappeClient() {
  const baseURL = getFrappeBaseURL();
  
  if (!baseURL) {
    throw new Error('FRAPPE_URL is not configured or invalid. Please check your .env file.');
  }
  
  return wrapper(
    axios.create({
      baseURL: baseURL,
      withCredentials: true,
      jar,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    })
  );
}

module.exports = { jar, getFrappeBaseURL, createFrappeClient };

