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

module.exports = { login, logout, getCurrentUser, setLoggers };

