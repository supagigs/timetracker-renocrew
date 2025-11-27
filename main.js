const { app, BrowserWindow, ipcMain, desktopCapturer, powerMonitor, screen, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');

if (process.platform === 'win32') {
  app.setAppUserModelId("Supagigs Time Tracker");
}

const envPath = app?.isPackaged
  ? path.join(process.resourcesPath, '.env')
  : path.join(__dirname, '.env');
require('dotenv').config({ path: envPath });

const resolveScreenshotsDir = (ensure = true) => {
  const baseDir = app.isPackaged
    ? path.join(app.getPath('userData'), 'screenshots')
    : path.join(__dirname, 'screenshots');
  if (ensure && !fs.existsSync(baseDir)) fs.mkdirSync(baseDir, { recursive: true });
  return baseDir;
};

// ============ LOGGING HELPER ============
function log(level, context, message, ...args) {
  const ts = new Date().toISOString();
  const lvl = level.toUpperCase();
  console.log(`[${ts}] [${lvl}] [${context}] ${message}`, ...args);
}
function logInfo(context, message, ...args) { log('info', context, message, ...args); }
function logWarn(context, message, ...args) { log('warn', context, message, ...args); }
function logError(context, message, ...args) { log('error', context, message, ...args); }

// ============ macOS PERMISSIONS HELPER ============
// Check Accessibility permission on macOS using native API
function checkMacOSAccessibilityPermission() {
  if (process.platform !== 'darwin') {
    return 'not_applicable';
  }
  
  try {
    // Use AppleScript to check if we have accessibility permissions
    const { execSync } = require('child_process');
    try {
      // Try to get the frontmost application - this will fail if we don't have permission
      execSync('osascript -e "tell application \\"System Events\\" to get name of first application process whose frontmost is true"', { 
        encoding: 'utf8',
        timeout: 1000 
      });
      return 'authorized';
    } catch (e) {
      // If it fails, we likely don't have permission
      return 'denied';
    }
  } catch (error) {
    logWarn('Permissions', 'Error checking Accessibility permission:', error);
    return 'unknown';
  }
}

// Get active app name and window title using AppleScript (fallback for macOS when active-win fails)
function getActiveAppNameViaAppleScript() {
  return new Promise((resolve, reject) => {
    if (process.platform !== 'darwin') {
      return resolve(null);
    }

    // AppleScript command to get both the app name and window title
    // This gets the frontmost application name and its frontmost window title
    // The window title often contains tab/page names for browsers
    const command = `osascript -e 'tell application "System Events"
      set frontApp to first application process whose frontmost is true
      set appName to name of frontApp
      set windowTitle to ""
      try
        set windowTitle to name of first window of frontApp
      on error
        try
          -- Some apps use different window properties
          set windowTitle to title of first window of frontApp
        on error
          set windowTitle to ""
        end try
      end try
      return appName & "|" & windowTitle
    end tell'`;

    const { exec } = require('child_process');
    exec(command, (error, stdout, stderr) => {
      if (error) {
        logWarn('ActiveWindow', `AppleScript error: ${error.message}`);
        // This error often means Accessibility is blocked
        return resolve(null);
      }
      if (stderr) {
        logWarn('ActiveWindow', `AppleScript stderr: ${stderr}`);
      }
      
      // Parse the result: "AppName|WindowTitle"
      const result = stdout.trim();
      
      if (result && result.length > 0) {
        const parts = result.split('|');
        const appName = parts[0] ? parts[0].trim() : null;
        const windowTitle = parts[1] ? parts[1].trim() : null;
        
        logInfo('ActiveWindow', `AppleScript Success - App: ${appName || 'null'}, Title: ${windowTitle || 'null'}`);
        
        // Return an object similar to active-win format for consistency
        resolve({
          owner: { name: appName },
          title: windowTitle
        });
      } else {
        logWarn('ActiveWindow', 'AppleScript returned empty result');
        resolve(null);
      }
    });
  });
}

// ============ GLOBAL STATE ============
const IDLE_THRESHOLD_SECONDS = 30;
let activeWindowModule = null;
let mainWindow = null;
let sharp = null;   //lazy load for first screenshot only
let isTimerActive = false;
let isUserLoggedIn = false;
let isUserIdle = false;
let backgroundScreenshotInterval = null;
let isBackgroundCaptureActive = false;
let isBackgroundTickRunning = false;
let supabaseClientInstance = null;
let currentUserEmail = null;
let currentSessionId = null;
const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'screenshots';

// Track pending uploads that can be cancelled
const pendingScreenshots = new Map();
let toastWindows = []; // Array to track toast windows on all displays

// ============ SCREENSHOT BATCH QUEUE ============
const SCREENSHOT_BATCH_SIZE = 5;
const SCREENSHOT_BATCH_FLUSH_INTERVAL = 5 * 60 * 1000; // Flush every 5 minutes if batch not full
const screenshotBatchQueue = [];
let isBatchUploading = false;
let batchFlushInterval = null;

// ============ MAIN WINDOW CREATION ============
function createWindow() {
  // Set icon based on platform
  let iconPath = null;
  //does not block window creation
  try{
  if (process.platform === 'darwin') {
    // macOS prefers .icns, but .png also works, .ico as last resort
    const icnsPath = path.join(__dirname, 'SupagigsIcon.icns');
    const pngPath = path.join(__dirname, 'SupagigsIcon.png');
    const icoPath = path.join(__dirname, 'SupagigsIcon.ico');
    if (fs.existsSync(icnsPath)) {
      iconPath = icnsPath;
    } else if (fs.existsSync(pngPath)) {
      iconPath = pngPath;
    } else if (fs.existsSync(icoPath)) {
      iconPath = icoPath; // Fallback to .ico on macOS
    }
  } else {
    // Windows and Linux use .ico
    const icoPath = path.join(__dirname, 'SupagigsIcon.ico');
    if (fs.existsSync(icoPath)) {
      iconPath = icoPath;
    }
  }
} catch (e) {
  logWarn('Window', 'Error Checking icon:', e);
}
  
  const windowOptions = {
    width: 900,
    height: 700,
    show: false, // do not show up until ready
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    }
  };
  
  // Only set icon if file exists
  if (iconPath) {
    windowOptions.icon = iconPath;
  }
  
  mainWindow = new BrowserWindow(windowOptions);
  mainWindow.loadFile('renderer/screens/login.html');
  mainWindow.on('closed', () => { mainWindow = null; });

  mainWindow.webContents.once('dom-ready', () => {
    if(mainWindow && !mainWindow.isDestroyed()){
      mainWindow.show();
      logInfo('Window', 'Window displayed (DOM is Ready)')
    }
  })

  // Check screen recording and accessibility permissions on macOS after window is ready
  if (process.platform === 'darwin') {
    mainWindow.webContents.once('did-finish-load', () => {
      // Delay permission check slightly to ensure window is fully ready
      setTimeout(() => {
        // Check screen recording permission
        checkScreenRecordingPermission().then((hasPermission) => {
          if (!hasPermission) {
            // Show permission dialog after a short delay
            setTimeout(() => {
              requestScreenRecordingPermission();
            }, 1000);
          }
        });
        
        // Check accessibility permission (needed for app name detection)
        checkAccessibilityPermission().then((hasPermission) => {
          if (!hasPermission) {
            // Show permission dialog after a short delay
            setTimeout(() => {
              requestAccessibilityPermission();
            }, 2000); // Show after screen recording dialog
          }
        });
      }, 500);
    });
  }

  const broadcastIdleState = (isIdle) => {
    BrowserWindow.getAllWindows().forEach((window) => {
      window.webContents.send('system-idle-state', { idle: isIdle, timestamp: Date.now() });
    });
  };

  if (powerMonitor.listenerCount('user-did-become-idle') === 0) {
    try {
      powerMonitor.on('user-did-become-idle', () => {
        isUserIdle = true;
        broadcastIdleState(true);
      });
      powerMonitor.on('user-did-become-active', () => {
        isUserIdle = false;
        broadcastIdleState(false);
      });
      powerMonitor.on('resume', () => {
        isUserIdle = false;
        broadcastIdleState(false);
      });
    } catch (e) {
      logWarn('PowerMonitor', 'Unable to register idle listeners', e);
    }
  }

  if (!global.__idlePollInterval) {
    let lastBroadcast = null;
    global.__idlePollInterval = setInterval(() => {
      try {
        const idleSeconds = powerMonitor.getSystemIdleTime();
        const isIdle = idleSeconds >= IDLE_THRESHOLD_SECONDS;
        if (lastBroadcast === null || lastBroadcast !== isIdle) {
          lastBroadcast = isIdle;
          isUserIdle = isIdle;
          broadcastIdleState(isIdle);
        }
      } catch (err) {
        logWarn('IdlePolling', 'Idle polling failed', err);
      }
    }, 2000);
  }

  mainWindow.on('close', (event) => {
    if (isTimerActive) {
      event.preventDefault();
      dialog.showMessageBox(mainWindow, {
        type: 'warning',
        title: 'Timer is Active',
        message: 'Please clock out first before closing the application.',
        detail: 'Your timer is still running. You must clock out to end your session before closing the app.',
        buttons: ['OK']
      });
    } else if (isUserLoggedIn) {
      event.preventDefault();
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Please Log Out',
        message: 'Log out before closing the application.',
        detail: 'To keep your data safe, please log out from the app before closing the window.',
        buttons: ['OK']
      });
    }
  });
}

// ============ HELPER FUNCTIONS ============

// Check and request screen recording permissions on macOS
async function checkScreenRecordingPermission() {
  if (process.platform !== 'darwin') {
    return true; // Not macOS, no permission needed
  }

  try {
    // Try to get screen sources - this will trigger permission request if not granted
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1, height: 1 }
    });
    
    if (sources && sources.length > 0) {
      logInfo('Permissions', 'Screen recording permission granted');
      return true;
    } else {
      logWarn('Permissions', 'Screen recording permission denied or not granted');
      return false;
    }
  } catch (error) {
    logWarn('Permissions', 'Error checking screen recording permission:', error);
    return false;
  }
}

// Show permission dialog on macOS if needed
async function requestScreenRecordingPermission() {
  if (process.platform !== 'darwin') {
    return;
  }

  const hasPermission = await checkScreenRecordingPermission();
  
  if (!hasPermission && mainWindow && !mainWindow.isDestroyed()) {
    dialog.showMessageBox(mainWindow, {
      type: 'warning',
      title: 'Screen Recording Permission Required',
      message: 'Screen Recording Permission Required',
      detail: 'This app needs screen recording permission to capture screenshots.\n\n' +
              'Please grant permission:\n' +
              '1. Go to System Settings → Privacy & Security → Screen Recording\n' +
              '2. Find "Time Tracker" in the list\n' +
              '3. Enable the toggle\n' +
              '4. Restart the app\n\n' +
              'The app will request permission automatically when you start tracking.',
      buttons: ['Open System Settings', 'OK'],
      defaultId: 1,
      cancelId: 1
    }).then((result) => {
      if (result.response === 0) {
        // Open System Settings to Screen Recording
        shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
      }
    });
  }
}

// Check and request Accessibility permission on macOS
async function checkAccessibilityPermission() {
  if (process.platform !== 'darwin') {
    return true; // Not macOS, no permission needed
  }

  try {
    const status = checkMacOSAccessibilityPermission();
    logInfo('Permissions', `Accessibility permission status: ${status}`);
    return status === 'authorized';
  } catch (error) {
    logWarn('Permissions', 'Error checking Accessibility permission:', error);
    return false;
  }
}

// Show permission dialog for Accessibility on macOS if needed
async function requestAccessibilityPermission() {
  if (process.platform !== 'darwin') {
    return;
  }

  const hasPermission = await checkAccessibilityPermission();
  
  if (!hasPermission && mainWindow && !mainWindow.isDestroyed()) {
    dialog.showMessageBox(mainWindow, {
      type: 'warning',
      title: 'Accessibility Permission Required',
      message: 'Accessibility Permission Required',
      detail: 'This app needs Accessibility permission to detect which application you are using.\n\n' +
              'Without this permission, app names will show as "Unknown".\n\n' +
              'Please grant permission:\n' +
              '1. Go to System Settings → Privacy & Security → Accessibility\n' +
              '2. Find "Time Tracker" in the list\n' +
              '3. Enable the toggle\n' +
              '4. Restart the app\n\n' +
              'The app will request permission automatically when needed.',
      buttons: ['Open System Settings', 'OK'],
      defaultId: 1,
      cancelId: 1
    }).then((result) => {
      if (result.response === 0) {
        // Open System Settings to Accessibility
        shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility');
      }
    });
  }
}

async function getActiveAppName() {
  try {
    // Try active-win first (provides more detailed information)
    let result = null;
    let useAppleScriptFallback = false;
    
    // On macOS, check for Accessibility permission first
    if (process.platform === 'darwin') {
      const accessibilityStatus = checkMacOSAccessibilityPermission();
      if (accessibilityStatus !== 'authorized') {
        logWarn('ActiveWindow', `Accessibility permission not granted (status: ${accessibilityStatus}). Will try AppleScript fallback.`);
        useAppleScriptFallback = true;
      } else {
        logInfo('ActiveWindow', 'Accessibility permission is authorized, trying active-win first');
      }
    }
    
    // Try active-win if we have permission or if not on macOS
    if (!useAppleScriptFallback) {
      try {
        // load module if not loaded
        if (!activeWindowModule) {
          activeWindowModule = await import('active-win');
          logInfo('ActiveWindow', 'active-win loaded');
        }

        // handle different exports across versions:
        //  - newer: activeWindow()
        //  - older: default()
        //  - some bundles export the function itself
        const fn =
          (activeWindowModule && activeWindowModule.activeWindow) ||
          (activeWindowModule && activeWindowModule.default) ||
          activeWindowModule;

        if (typeof fn === 'function') {
          result = await fn();
          if (result) {
            logInfo('ActiveWindow', 'active-win returned result successfully');
          } else {
            logWarn('ActiveWindow', 'active-win returned no result, will try AppleScript fallback');
            useAppleScriptFallback = true;
          }
        } else {
          logWarn('ActiveWindow', 'active-win export not a function, will try AppleScript fallback');
          useAppleScriptFallback = true;
        }
      } catch (error) {
        logWarn('ActiveWindow', `active-win failed: ${error.message}, will try AppleScript fallback`);
        useAppleScriptFallback = true;
      }
    }
    
    // If active-win failed or we don't have permission, use AppleScript fallback (macOS only)
    if (useAppleScriptFallback && process.platform === 'darwin') {
      logInfo('ActiveWindow', 'Using AppleScript fallback to get app name and window title');
      const appleScriptResult = await getActiveAppNameViaAppleScript();
      if (appleScriptResult) {
        // AppleScript returns an object similar to active-win format
        // Process it the same way as active-win result
        result = appleScriptResult;
        logInfo('ActiveWindow', 'AppleScript fallback returned result, processing...');
      }
    }
    
    // If we got a result from active-win, process it
    if (!result) {
      logWarn('ActiveWindow', 'Both active-win and AppleScript failed to get app name');
      return null;
    }
    
    // Get the app's own name for reference (but don't filter it out - we want to track when user is using our app)
    const appName = app.getName();
    const appNameLower = appName.toLowerCase();
    
    // Extract available information from result
    // active-win returns: { owner: { name, processId }, title, url, bounds, etc. }
    let ownerName = typeof result.owner?.name === 'string' ? result.owner.name.trim() : null;
    let windowTitle = typeof result.title === 'string' ? result.title.trim() : null;
    
    // Log detected information for debugging on both platforms
    logInfo('ActiveWindow', `[${process.platform}] Detected - owner: ${ownerName || 'null'}, title: ${windowTitle || 'null'}, app: ${appName}`);
    
    // Check if this is our own app - if so, we still want to return it, but use a consistent name
    const isOwnApp = (ownerName && ownerName.toLowerCase() === appNameLower) || 
                     (windowTitle && windowTitle.toLowerCase() === appNameLower) ||
                     (ownerName && ownerName.toLowerCase().includes('time tracker')) ||
                     (ownerName && ownerName.toLowerCase().includes('electron') && ownerName.toLowerCase().includes('time'));
    
    if (isOwnApp) {
      // Return the app name consistently when our app is active
      logInfo('ActiveWindow', `Detected own app - returning: ${appName}`);
      return appName;
    }
    
    // Filter out only if it's clearly Electron or generic names that don't provide value
    // But keep the app name if it's detected
    const genericNames = ['electron', 'node', 'nodejs'];
    
    if (ownerName) {
      const ownerNameLower = ownerName.toLowerCase();
      // Only filter out if it's a generic name AND not our app
      if (genericNames.some(generic => ownerNameLower === generic || ownerNameLower === `${generic}.exe`)) {
        logInfo('ActiveWindow', `Filtered out generic owner name: ${ownerName}`);
        ownerName = null;
      }
    }
    
    if (windowTitle) {
      const windowTitleLower = windowTitle.toLowerCase();
      // Only filter out generic Electron titles if they don't provide context
      if (windowTitleLower === 'electron' || windowTitleLower === 'node') {
        logInfo('ActiveWindow', `Filtered out generic window title: ${windowTitle}`);
        windowTitle = null;
      }
    }
    
    // Build the app name with better logic for both platforms
    let finalAppName = null;
    
    if (process.platform === 'darwin') {
      // macOS: prefer owner.name (application name) as it's more reliable
      // Use window title as fallback or to add context (similar to Windows)
      if (ownerName) {
        // If we have both, combine them for more context: "App Name - Window Title"
        // This matches the Windows format for consistency
        if (windowTitle && windowTitle.length > 0 && windowTitle !== ownerName) {
          // For browsers, the window title often contains the tab/page name
          // Format: "App Name - Window Title" (e.g., "Google Chrome - YouTube - Google Chrome")
          finalAppName = `${ownerName} - ${windowTitle}`;
        } else {
          finalAppName = ownerName;
        }
      } else if (windowTitle) {
        finalAppName = windowTitle;
      }
    } else {
      // Windows: prefer owner.name (application name) as it's more useful than window title
      // Window titles on Windows can be very generic or change frequently
      if (ownerName) {
        // If we have both, combine them: "App Name - Window Title"
        if (windowTitle && windowTitle.length > 0 && windowTitle !== ownerName) {
          finalAppName = `${ownerName} - ${windowTitle}`;
        } else {
          finalAppName = ownerName;
        }
      } else if (windowTitle) {
        finalAppName = windowTitle;
      }
    }
    
    if (finalAppName) {
      logInfo('ActiveWindow', `Final app name: ${finalAppName}`);
      return finalAppName;
    }
    
    logWarn('ActiveWindow', 'No valid app name found after filtering');
    return null;
  } catch (error) {
    logWarn('ActiveWindow', 'Unable to resolve active window', error);
    return null;
  }
}

function getSupabaseClient() {
  try {
    if (!supabaseClientInstance) {
      const { createClient } = require('@supabase/supabase-js');
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
      supabaseClientInstance = createClient(process.env.SUPABASE_URL, serviceRoleKey);
    }
    return supabaseClientInstance;
  } catch (e) {
    logError('Supabase', 'Failed to create client', e);
    return null;
  }
}

async function compressToJpegBufferFromDataUrl(dataUrl, targetSizeKB = 50) {
  //Lazy load sharp for first screen shot as it loads on the startup
  if(!sharp) {
    try {
      sharp = require('sharp');
      logInfo('Compress', 'Sharp module loaded successfully');


  // OPTIMIZATION: to avoid re-compression if already jpeg
  const isAlreadyJpeg = dataUrl.includes('data:image/jpeg');
  if (isAlreadyJpeg) {
    const base64 = dataUrl.split(',')[1];
    const jpegBuffer = Buffer.from(base64, 'base64');
    logInfo('Compress', `JPEG (pre-compressed): ${(jpegBuffer.length / 1024).toFixed(2)} KB`);
    return jpegBuffer;
  }

    } catch (error) {
      const platform = process.platform;
      const arch = process.arch;
      const errorMsg = error.message || String(error);
      
      logError('Compress', `Failed to load sharp module: ${errorMsg}`);
      
      // Provide platform-specific installation instructions
      let installCommand = 'npm install --include=optional sharp';
      if (platform === 'darwin') {
        if (arch === 'x64') {
          installCommand = 'npm install --os=darwin --cpu=x64 sharp';
        } else if (arch === 'arm64') {
          installCommand = 'npm install --os=darwin --cpu=arm64 sharp';
        } else {
          installCommand = 'npm install --include=optional sharp';
        }
      } else if (platform === 'win32') {
        installCommand = 'npm install --include=optional sharp';
      }
      
      const detailedError = new Error(
        `Sharp module could not be loaded (${platform}-${arch}).\n\n` +
        `To fix this issue, run the following command in your project directory:\n\n` +
        `  ${installCommand}\n\n` +
        `Or for all platforms:\n` +
        `  npm install --include=optional sharp\n\n` +
        `After running the command, restart the application.\n\n` +
        `Original error: ${errorMsg}`
      );
      
      // Also log to console for visibility
      console.error('\n========================================');
      console.error('SHARP MODULE ERROR - ACTION REQUIRED');
      console.error('========================================');
      console.error(detailedError.message);
      console.error('========================================\n');
      
      throw detailedError;
    }
  }
  
  const base64 = dataUrl.split(',')[1];
  const inputBuffer = Buffer.from(base64, 'base64');
  const UPLOAD_WIDTH = 800;
  const JPEG_QUALITY = 70;
  const TARGET_SIZE_BYTES = targetSizeKB * 1024;
  
  let quality = JPEG_QUALITY;
  let jpegBuffer = await sharp(inputBuffer)  // Changed const to let
    .resize(UPLOAD_WIDTH, null, { withoutEnlargement: true, fit: 'inside' })
    .jpeg({ quality: quality, mozjpeg: true })
    .toBuffer();
  
  // Keep compressing if needed
  let attempts = 0;
  while (jpegBuffer.length > TARGET_SIZE_BYTES && attempts < 5) {
    attempts++;
    quality -= (jpegBuffer.length > TARGET_SIZE_BYTES * 1.5) ? 15 : 5;
    
    if (quality < 30) {
      quality = 30;
      const scaleFactor = Math.sqrt(TARGET_SIZE_BYTES / jpegBuffer.length);
      const newWidth = Math.floor(UPLOAD_WIDTH * scaleFactor);
      
      jpegBuffer = await sharp(inputBuffer)
        .resize(newWidth, null, { withoutEnlargement: true, fit: 'inside' })
        .jpeg({ quality: 30, mozjpeg: true })
        .toBuffer();
      break;
    }
    
    jpegBuffer = await sharp(inputBuffer)  // Reassign jpegBuffer
      .resize(UPLOAD_WIDTH, null, { withoutEnlargement: true, fit: 'inside' })
      .jpeg({ quality: quality, mozjpeg: true })
      .toBuffer();
  }
  
  logInfo('Compress', `JPEG size: ${(jpegBuffer.length / 1024).toFixed(2)} KB`);
  return jpegBuffer;
}


function showToastNotification(filePath, base64Data, screenIndex = null) {
  try {
    // If screenIndex is provided, show toast only on that specific display
    // Otherwise, show on all displays (for backward compatibility)
    if (screenIndex !== null && screenIndex !== undefined) {
      const allDisplays = screen.getAllDisplays();
      const targetDisplayIndex = screenIndex - 1; // screenIndex is 1-based, array is 0-based
      
      if (targetDisplayIndex >= 0 && targetDisplayIndex < allDisplays.length) {
        const targetDisplay = allDisplays[targetDisplayIndex];
        logInfo('Toast', `Showing toast for screen ${screenIndex} on display ${targetDisplay.id}`);
        
        // Close any existing toast on this specific display
        closeToastOnDisplay(targetDisplay.id);
        
        // Create toast only on the target display
        createToastWindow(filePath, base64Data, targetDisplay, targetDisplayIndex);
      } else {
        logWarn('Toast', `Invalid screenIndex ${screenIndex}, showing on primary display`);
        createToastWindow(filePath, base64Data, screen.getPrimaryDisplay(), 0);
      }
    } else {
      // No screenIndex provided - show on all displays (legacy behavior)
      const now = Date.now();
      const shouldWait = toastWindows.some(win => {
        if (win && !win.isDestroyed()) {
          const age = now - (win._createdAt || 0);
          return age < 1000;
        }
        return false;
      });
      
      if (shouldWait) {
        // Wait a moment before closing old toasts
        setTimeout(() => {
          closeAllToastWindows();
          createToastWindowsOnAllDisplays(filePath, base64Data);
        }, 500);
        return;
      }
      
      // Close any existing toasts
      closeAllToastWindows();
      
      // Create toasts on all displays
      createToastWindowsOnAllDisplays(filePath, base64Data);
    }
  } catch (error) {
    logError('Toast', `Error showing toast notification: ${error.message}`, error);
    // Try to create toast anyway, even if there was an error
    try {
      if (screenIndex !== null && screenIndex !== undefined) {
        const allDisplays = screen.getAllDisplays();
        const targetDisplayIndex = screenIndex - 1;
        if (targetDisplayIndex >= 0 && targetDisplayIndex < allDisplays.length) {
          createToastWindow(filePath, base64Data, allDisplays[targetDisplayIndex], targetDisplayIndex);
        }
      } else {
        createToastWindow(filePath, base64Data, screen.getPrimaryDisplay(), 0);
      }
    } catch (e) {
      logError('Toast', `Failed to create toast window: ${e.message}`, e);
    }
  }
}

// Close all existing toast windows
function closeAllToastWindows() {
  toastWindows.forEach(win => {
    try {
      if (win && !win.isDestroyed()) {
        win.close();
      }
    } catch (error) {
      logWarn('Toast', `Error closing toast window: ${error.message}`);
    }
  });
  toastWindows = [];
}

// Close toast windows on a specific display
function closeToastOnDisplay(displayId) {
  // Filter out toasts on this display (iterate backwards to avoid index issues)
  for (let i = toastWindows.length - 1; i >= 0; i--) {
    const win = toastWindows[i];
    try {
      if (win && !win.isDestroyed() && win._displayId === displayId) {
        win.close();
        toastWindows.splice(i, 1);
      }
    } catch (error) {
      logWarn('Toast', `Error closing toast window on display ${displayId}: ${error.message}`);
    }
  }
}

// Create toast windows on all displays
function createToastWindowsOnAllDisplays(filePath, base64Data) {
  try {
    const allDisplays = screen.getAllDisplays();
    logInfo('Toast', `Creating toast notifications on ${allDisplays.length} display(s)`);
    
    allDisplays.forEach((display, index) => {
      try {
        createToastWindow(filePath, base64Data, display, index);
      } catch (error) {
        logError('Toast', `Error creating toast on display ${display.id}: ${error.message}`, error);
      }
    });
  } catch (error) {
    logError('Toast', `Error getting displays: ${error.message}`, error);
    // Fallback: create on primary display only
    createToastWindow(filePath, base64Data, screen.getPrimaryDisplay(), 0);
  }
}

function createToastWindow(filePath, base64Data, targetDisplay = null, displayIndex = 0) {
  try {
    // Use provided display or default to primary
    if (!targetDisplay) {
      targetDisplay = screen.getPrimaryDisplay();
    }
    
    const TOAST_WIDTH = process.platform === 'darwin' ? 300:520;
    const TOAST_HEIGHT = process.platform === 'darwin' ? 200:340;
    const toastWin = new BrowserWindow({
      width: TOAST_WIDTH,
      height: TOAST_HEIGHT,
      frame: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      transparent: true,
      resizable: false,
      hasShadow: false,
      show: false,
      webPreferences: {
        preload: path.join(__dirname, "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    // Track when this toast was created and which file it's showing
    toastWin._createdAt = Date.now();
    toastWin._displayId = targetDisplay.id;
    toastWin._filePath = filePath; // Store filePath to identify which toast to close on delete
    
    // Add to the array of toast windows
    toastWindows.push(toastWin);
    
    // Position toast on the target display (bottom-right corner)
    const { workArea } = targetDisplay;
    const x = workArea.x + workArea.width - TOAST_WIDTH - 20;
    const y = workArea.y + workArea.height - TOAST_HEIGHT - 20;
    
    logInfo('Toast', `Positioning toast ${displayIndex + 1} at (${x}, ${y}) on display ${targetDisplay.id}`);
    toastWin.setPosition(x, y);

    toastWin.loadFile(path.join(__dirname, 'toast.html'));

    toastWin.once('ready-to-show', () => {
      // Check if window still exists (might have been closed)
      if (!toastWin || toastWin.isDestroyed()) {
        logWarn('Toast', 'Toast window was destroyed before ready-to-show');
        return;
      }
      
      try {
        toastWin.showInactive();
        logInfo('Toast', `Toast notification displayed for: ${path.basename(filePath)}`);
        
        if (toastWin.webContents && !toastWin.webContents.isDestroyed()) {
          toastWin.webContents.send('toast-init', { filePath, base64Data });
        } else {
          logWarn('Toast', 'Toast webContents was destroyed before sending init message');
        }
      } catch (error) {
        logError('Toast', `Error showing toast window: ${error.message}`, error);
      }
    });

    // Handle errors during load
    toastWin.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
      logError('Toast', `Failed to load toast.html: ${errorCode} - ${errorDescription}`);
    });

    // Auto-close after 9 seconds
    setTimeout(() => { 
      if (toastWin && !toastWin.isDestroyed()) {
        toastWin.close(); 
      }
      // Remove from array
      const index = toastWindows.indexOf(toastWin);
      if (index > -1) {
        toastWindows.splice(index, 1);
      }
    }, 9000);
    
    toastWin.on('closed', () => { 
      // Remove from array when closed
      const index = toastWindows.indexOf(toastWin);
      if (index > -1) {
        toastWindows.splice(index, 1);
      }
    });
  } catch (error) {
    logError('Toast', `Error creating toast window: ${error.message}`, error);
    toastWin = null;
  }
}

// ============ CANCELLATION CHECKER ============
const isCancelled = (filePath) => pendingScreenshots.get(filePath) === true;

// ============ BROADCAST HELPER ============
function broadcastScreenshotCaptured(screenshotData) {
  BrowserWindow.getAllWindows().forEach((window) => {
    window.webContents.send('screenshot-captured', screenshotData);
  });
}

// ============ DATABASE INSERTION HELPER ============
async function insertScreenshotToDatabase(supabase, userEmail, sessionId, publicUrl, timestamp, appName, isIdle) {
  const { error: dbErr } = await supabase.from('screenshots').insert({
    user_email: userEmail,
    session_id: sessionId,
    screenshot_data: publicUrl,
    captured_at: timestamp,
    app_name: appName,
    captured_idle: Boolean(isIdle)
  });
  if (dbErr) throw dbErr;
}

// ============ SCREENSHOT BATCH QUEUE MANAGEMENT ============

// Add screenshot to batch queue and process if batch is full
async function addScreenshotToBatch(uploadData) {
  const { userEmail, sessionId, screenshotData, timestamp, isIdle, contextLabel, screenIndex, screenName, appName } = uploadData;
  
  // Generate filename early so we can show toast immediately
  const screenSuffix = screenIndex ? `_screen${screenIndex}` : '';
  const jpegFilename = `${userEmail.replace(/@/g, '_at_').replace(/\./g, '_')}_${sessionId}_${timestamp.replace(/[:.]/g, '-')}${screenSuffix}.jpg`;
  const screenshotsDir = resolveScreenshotsDir(true);
  const filePath = path.join(screenshotsDir, jpegFilename);
  
  // Show toast notification immediately when screenshot is received
  // This ensures user sees feedback for every screenshot, even if processing fails
  // Pass screenIndex so toast is shown only on the corresponding display
  try {
    showToastNotification(filePath, screenshotData, screenIndex);
  } catch (toastError) {
    logWarn(contextLabel, `Failed to show toast notification: ${toastError.message}`);
    // Continue processing even if toast fails
  }
  
  try {
    // Capture app name at screenshot time if not already provided
    let capturedAppName = appName;
    if (!capturedAppName) {
      try {
        capturedAppName = await getActiveAppName() || 'Unknown';
        logInfo(contextLabel, `Captured app name at screenshot time: ${capturedAppName}`);
      } catch (error) {
        logWarn(contextLabel, `Failed to capture app name: ${error.message}`);
        capturedAppName = 'Unknown';
      }
    }
    
    // Compress and save locally
    const jpegBuffer = await compressToJpegBufferFromDataUrl(screenshotData);
    fs.writeFileSync(filePath, jpegBuffer);
    
    // Add to batch queue
    const batchItem = {
      userEmail,
      sessionId,
      screenshotData,
      timestamp,
      isIdle,
      contextLabel,
      screenIndex,
      screenName,
      appName: capturedAppName, // Store the app name captured at screenshot time
      filePath,
      jpegBuffer,
      jpegFilename,
      addedAt: Date.now()
    };
    
    screenshotBatchQueue.push(batchItem);
    pendingScreenshots.set(filePath, false);
    
    logInfo(contextLabel, `Screenshot queued (${screenshotBatchQueue.length}/${SCREENSHOT_BATCH_SIZE}): ${filePath}`);
    
    // Start periodic flush timer if not already running
    if (!batchFlushInterval && screenshotBatchQueue.length > 0) {
      batchFlushInterval = setInterval(async () => {
        if (screenshotBatchQueue.length > 0 && !isBatchUploading) {
          logInfo('BATCH-UPLOAD', `Periodic flush: processing ${screenshotBatchQueue.length} screenshot(s) after timeout`);
          await processScreenshotBatch();
        }
        // Clear interval if queue is empty
        if (screenshotBatchQueue.length === 0 && batchFlushInterval) {
          clearInterval(batchFlushInterval);
          batchFlushInterval = null;
        }
      }, SCREENSHOT_BATCH_FLUSH_INTERVAL);
    }
    
    // If batch is full, process it immediately
    if (screenshotBatchQueue.length >= SCREENSHOT_BATCH_SIZE) {
      logInfo(contextLabel, `Batch full (${SCREENSHOT_BATCH_SIZE} screenshots), starting upload...`);
      await processScreenshotBatch();
      // Clear flush interval since we just processed
      if (batchFlushInterval) {
        clearInterval(batchFlushInterval);
        batchFlushInterval = null;
      }
    }
    
    return { ok: true, queued: true, batchSize: screenshotBatchQueue.length };
  } catch (e) {
    logError(contextLabel, `Error adding to batch: ${e?.message || 'queue error'}`, e);
    return { ok: false, error: e?.message || 'queue error' };
  }
}

// Process batch of screenshots: upload all and delete local files
async function processScreenshotBatch() {
  if (isBatchUploading || screenshotBatchQueue.length === 0) {
    return;
  }

  isBatchUploading = true;
  const batchToUpload = [...screenshotBatchQueue]; // Copy the batch
  screenshotBatchQueue.length = 0; // Clear the queue

  logInfo('BATCH-UPLOAD', `Processing batch of ${batchToUpload.length} screenshot(s)`);

  // --- CRITICAL FILTER STEP ---
  // Only upload screenshots that are NOT cancelled and that DO exist.
  // Also check for duplicates by filePath to prevent double processing
  const seenFilePaths = new Set();
  const validScreenshots = batchToUpload.filter(item => {
    // Check for duplicates
    if (seenFilePaths.has(item.filePath)) {
      logWarn('BATCH-UPLOAD', `Skipping DUPLICATE: ${item.filePath}`);
      return false;
    }
    seenFilePaths.add(item.filePath);
    
    const isCancelled = pendingScreenshots.get(item.filePath) === true;
    const exists = fs.existsSync(item.filePath);
    if (isCancelled) logInfo('BATCH-UPLOAD', `Skipping CANCELLED: ${item.filePath}`);
    if (!exists) logInfo('BATCH-UPLOAD', `Skipping MISSING: ${item.filePath}`);
    return !isCancelled && exists;
  });

  const supabase = getSupabaseClient();
  if (!supabase) {
    logError('BATCH-UPLOAD', 'Supabase client unavailable, re-queuing batch');
    screenshotBatchQueue.unshift(...validScreenshots); // Only re-queue valid ones
    isBatchUploading = false;
    return;
  }

  const uploadResults = [];
  const filesToDelete = [];

  try {
    // Upload all valid screenshots in parallel
    const uploadPromises = validScreenshots.map(async (item) => {
      try {
        // Upload logic (unchanged)
        const storagePath = `${item.userEmail}/${item.sessionId}/${item.jpegFilename}`;
        const { error: storageError } = await supabase.storage
          .from(STORAGE_BUCKET)
          .upload(storagePath, item.jpegBuffer, { contentType: 'image/jpeg', upsert: true });

        if (storageError) {
          logError(item.contextLabel, `Storage upload failed: ${storageError.message}`);
          return { ok: false, error: storageError.message, filePath: item.filePath, item };
        }

        const publicUrlRes = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);
        const publicUrl = publicUrlRes?.data?.publicUrl ?? null;
        if (!publicUrl) throw new Error('Unable to get storage public URL');

        // Use the app name captured at screenshot time (stored in batch item)
        const appName = item.appName || 'Unknown';
        await insertScreenshotToDatabase(supabase, item.userEmail, item.sessionId, publicUrl, item.timestamp, appName, item.isIdle);

        broadcastScreenshotCaptured({
          timestamp: item.timestamp,
          previewDataUrl: item.screenshotData,
          storageUrl: publicUrl,
          filePath: item.filePath,
          sessionId: item.sessionId,
          appName,
          isIdle: Boolean(item.isIdle)
        });

        filesToDelete.push(item.filePath);
        pendingScreenshots.delete(item.filePath);

        logInfo(item.contextLabel, `Uploaded successfully: ${item.jpegFilename}`);
        return { ok: true, filePath: item.filePath, url: publicUrl, appName };
      } catch (error) {
        logError(item.contextLabel, `Upload error: ${error.message}`, error);
        return { ok: false, error: error.message, filePath: item.filePath, item };
      }
    });

    const results = await Promise.all(uploadPromises);
    uploadResults.push(...results);

    // Delete files
    let deletedCount = 0;
    for (const filePath of filesToDelete) {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          deletedCount++;
        }
      } catch (error) {
        logError('BATCH-UPLOAD', `Error deleting file ${filePath}:`, error);
      }
    }

    // Re-queue failed uploads
    const failedUploads = results.filter(r => !r.ok && r.item);
    if (failedUploads.length > 0) {
      logWarn('BATCH-UPLOAD', `Re-queuing ${failedUploads.length} failed upload(s)`);
      screenshotBatchQueue.push(...failedUploads.map(f => f.item));
    }

    const successCount = results.filter(r => r.ok).length;
    logInfo('BATCH-UPLOAD', `Batch complete: ${successCount}/${validScreenshots.length} uploaded, ${deletedCount} files deleted`);

  } catch (error) {
    logError('BATCH-UPLOAD', `Batch processing error: ${error.message}`, error);
    screenshotBatchQueue.unshift(...validScreenshots);
  } finally {
    isBatchUploading = false;
  }
}


// Flush remaining screenshots in queue (called on app close or session end)
async function flushScreenshotBatch() {
  // Clear periodic flush interval
  if (batchFlushInterval) {
    clearInterval(batchFlushInterval);
    batchFlushInterval = null;
  }
  
  if (screenshotBatchQueue.length > 0) {
    logInfo('BATCH-UPLOAD', `Flushing ${screenshotBatchQueue.length} remaining screenshot(s) in queue`);
    await processScreenshotBatch();
  }
}

// ============ SCREENSHOT UPLOAD HANDLER (now uses batch queue) ============
async function handleScreenshotUpload(uploadData) {
  // Add to batch queue instead of uploading immediately
  return await addScreenshotToBatch(uploadData);
}

// ============ HELPER: GET SCREENSHOT INTERVAL ============
async function getScreenshotInterval(userEmail, sessionId) {
  try {
    const supabase = getSupabaseClient();
    if (!supabase) {
      logWarn('ScreenshotInterval', 'Supabase client unavailable, using default');
      return 300000; // 5 minutes default
    }

    const normalizedEmail = userEmail.trim().toLowerCase();
    let clientEmail = normalizedEmail; // Default to user's email (for clients)

    // If sessionId is provided, try to get the client email from the project assignment
    if (sessionId && sessionId !== 'temp-session') {
      try {
        // Get the project_id from the session
        const { data: session, error: sessionError } = await supabase
          .from('time_sessions')
          .select('project_id')
          .eq('id', parseInt(sessionId))
          .maybeSingle();

        if (!sessionError && session && session.project_id) {
          // Get the client email (assigned_by) from the project assignment
          const { data: assignment, error: assignmentError } = await supabase
            .from('project_assignments')
            .select('assigned_by')
            .eq('project_id', session.project_id)
            .eq('freelancer_email', normalizedEmail)
            .maybeSingle();

          if (!assignmentError && assignment && assignment.assigned_by) {
            clientEmail = assignment.assigned_by.trim().toLowerCase();
            logInfo('ScreenshotInterval', `Found client email from project assignment: ${clientEmail}`);
          } else {
            // If no assignment found, try to get client from project owner
            const { data: project, error: projectError } = await supabase
              .from('projects')
              .select('user_email')
              .eq('id', session.project_id)
              .maybeSingle();

            if (!projectError && project && project.user_email) {
              clientEmail = project.user_email.trim().toLowerCase();
              logInfo('ScreenshotInterval', `Found client email from project owner: ${clientEmail}`);
            }
          }
        }
      } catch (e) {
        logWarn('ScreenshotInterval', `Error looking up client from session: ${e.message}, using user email`);
      }
    }

    // Now look up the screenshot interval using the client email
    const { data, error } = await supabase
      .from('client_settings')
      .select('screenshot_interval_seconds')
      .eq('client_email', clientEmail)
      .maybeSingle();

    if (error) {
      logWarn('ScreenshotInterval', `Error fetching interval: ${error.message}, using default`);
      return 300000; // 5 minutes default
    }

    if (!data || !data.screenshot_interval_seconds) {
      logInfo('ScreenshotInterval', `No custom interval found for client ${clientEmail}, using default`);
      return 300000; // 5 minutes default
    }

    const intervalSeconds = Number(data.screenshot_interval_seconds);
    if (!Number.isFinite(intervalSeconds) || intervalSeconds <= 0) {
      logWarn('ScreenshotInterval', `Invalid interval value: ${intervalSeconds}, using default`);
      return 300000; // 5 minutes default
    }

    const intervalMs = intervalSeconds * 1000;
    logInfo('ScreenshotInterval', `Using interval for client ${clientEmail}: ${intervalSeconds} seconds (${intervalMs}ms)`);
    return intervalMs;
  } catch (e) {
    logError('ScreenshotInterval', 'Failed to get interval', e);
    return 300000; // 5 minutes default
  }
}

// ============ IPC HANDLERS ============

// existing handler
ipcMain.handle('set-user-logged-in', async (event, flag) => {
  isUserLoggedIn = Boolean(flag);
  logInfo('IPC', `User logged in: ${isUserLoggedIn}`);
  return true;
});


// ============ COMPLETE CORRECTED main.js DELETE HANDLER ============
// Replace ONLY the ipcMain.handle('toast-delete-file', ...) handler in your main.js

ipcMain.handle('toast-delete-file', async (event, filePath) => {
  logInfo('DELETE', `Handler called with filePath: ${filePath}`);

  try {
    // Step 1: Mark as cancelled
    pendingScreenshots.set(filePath, true);

    // Step 1.5: Remove from batch queue if it's still there (before processing)
    const queueIndex = screenshotBatchQueue.findIndex(item => item.filePath === filePath);
    if (queueIndex !== -1) {
      const removedItem = screenshotBatchQueue.splice(queueIndex, 1)[0];
      logInfo('DELETE', `Removed screenshot from batch queue: ${filePath}`);
      pendingScreenshots.delete(filePath);
    }

    // Step 2: Delete from local disk
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      logInfo('DELETE', `File deleted successfully from disk: ${filePath}`);
      pendingScreenshots.delete(filePath);
    } else {
      logWarn('DELETE', `File does not exist on disk: ${filePath}`);
    }

    // Step 3: Extract filename and try DB/S3 deletion if needed
    const filename = path.basename(filePath);

    const supabase = getSupabaseClient();
    if (supabase) {
      const { data: screenshots, error: queryError } = await supabase
        .from('screenshots')
        .select('id, screenshot_data, user_email, session_id')
        .order('captured_at', { ascending: false })
        .limit(100);

      if (!queryError) {
        const screenshot = screenshots?.find(s =>
          s.screenshot_data && s.screenshot_data.includes(filename)
        );

        if (screenshot) {
          // Delete from S3
          if (screenshot.screenshot_data) {
            try {
              const urlParts = screenshot.screenshot_data.split('/');
              const bucketIndex = urlParts.indexOf(STORAGE_BUCKET);
              if (bucketIndex !== -1 && bucketIndex < urlParts.length - 1) {
                const storagePath = urlParts.slice(bucketIndex + 1).join('/');
                await supabase.storage
                  .from(STORAGE_BUCKET)
                  .remove([storagePath]);
                logInfo('DELETE', `Deleted from S3 storage: ${storagePath}`);
              }
            } catch (e) {
              logError('DELETE', `Error parsing storage path: ${e.message}`, e);
            }
          }
          // Delete from DB
          await supabase
            .from('screenshots')
            .delete()
            .eq('id', screenshot.id);
          logInfo('DELETE', `Deleted database record ID: ${screenshot.id}`);
        } else {
          logWarn('DELETE', `No database record found for: ${filename}`);
        }
      }
    }

    // Step 4: Broadcast to renderer
    BrowserWindow.getAllWindows().forEach(window => {
      window.webContents.send('screenshot-deleted', { filePath, filename });
    });

    // Step 5: Close only the toast window for this specific screenshot
    // Don't close all toasts - other screens may have their own toasts
    // Find and close only the toast that matches this filePath
    const toastToClose = toastWindows.find(win => {
      if (win && !win.isDestroyed() && win._filePath === filePath) {
        return true;
      }
      return false;
    });
    if (toastToClose) {
      try {
        toastToClose.close();
      } catch (error) {
        logWarn('DELETE', `Error closing toast window: ${error.message}`);
      }
    }

    return {
      success: true,
      message: 'Screenshot deleted from disk/storage/database',
      filename
    };

  } catch (error) {
    logError('DELETE', `Error: ${error.message}`, error);
    return {
      success: false,
      message: error.message || 'Delete failed'
    };
  }
});


ipcMain.handle('get-system-idle-time', () => {
  try {
    return powerMonitor.getSystemIdleTime();
  } catch (e) {
    logError('IPC', 'Error getting idle time', e);
    return -1;
  }
});

ipcMain.handle('get-system-idle-state', (event, thresholdSeconds) => {
  try {
    return powerMonitor.getSystemIdleState(Math.max(1, parseInt(thresholdSeconds || 30, 10)));
  } catch (e) {
    logError('IPC', 'Error getting idle state', e);
    return 'unknown';
  }
});

ipcMain.handle('queue-screenshot-upload', async (event, { userEmail, sessionId, screenshotData, timestamp, isIdle, appName }) => {
  return handleScreenshotUpload({
    userEmail,
    sessionId,
    screenshotData,
    timestamp,
    isIdle,
    appName, // Optional: if provided, will be used; otherwise captured automatically
    contextLabel: 'UPLOAD'
  });
});

// start/stop-background already present in your earlier file
ipcMain.handle('start-background-screenshots', async (event, userEmail, sessionId) => {
  if (backgroundScreenshotInterval) {
    clearTimeout(backgroundScreenshotInterval);
    backgroundScreenshotInterval = null;
  }
  currentUserEmail = userEmail;
  currentSessionId = sessionId;
  isBackgroundCaptureActive = true;

  // Fetch screenshot interval from database (defaults to 5 minutes if not found)
  // For freelancers, this will look up the client's interval from the project assignment
  const intervalMs = await getScreenshotInterval(userEmail, sessionId);

  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().size;

  // Recursive function to capture screenshots at random intervals
  const scheduleNextScreenshot = () => {
    if (!isBackgroundCaptureActive) return;

    // Generate random delay between 50% and 100% of the interval
    // This ensures screenshots are captured randomly within the specified range
    const minDelay = Math.floor(intervalMs * 0.5);
    const maxDelay = intervalMs;
    const randomDelay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;

    backgroundScreenshotInterval = setTimeout(async () => {
      if (!isBackgroundCaptureActive || isBackgroundTickRunning) {
        scheduleNextScreenshot(); // Reschedule even if skipped
        return;
      }
      
      isBackgroundTickRunning = true;
      try {
        // Get all displays to calculate proper thumbnail size
        const allDisplays = screen.getAllDisplays();
        const maxWidth = Math.max(...allDisplays.map(d => d.size.width));
        const maxHeight = Math.max(...allDisplays.map(d => d.size.height));
        
        logInfo('BG-UPLOAD', `Detected ${allDisplays.length} display(s), requesting screenshots with size ${maxWidth}x${maxHeight}`);
        
        // Log display details for debugging
        allDisplays.forEach((display, idx) => {
          logInfo('BG-UPLOAD', `Display ${idx + 1}: ${display.size.width}x${display.size.height} at (${display.bounds.x}, ${display.bounds.y}), scale: ${display.scaleFactor}`);
        });
        
        const sources = await desktopCapturer.getSources({
          types: ['screen'],
          thumbnailSize: { width: maxWidth, height: maxHeight }
        });
        
        logInfo('BG-UPLOAD', `Received ${sources?.length || 0} screen source(s) from desktopCapturer`);
        
        // Log detailed source information for debugging
        if (sources && sources.length > 0) {
          sources.forEach((source, idx) => {
            logInfo('BG-UPLOAD', `Source ${idx + 1}: id="${source.id}", name="${source.name}", thumbnail size: ${source.thumbnail?.getSize()?.width || 'N/A'}x${source.thumbnail?.getSize()?.height || 'N/A'}`);
          });
        } else {
          logWarn('BG-UPLOAD', '⚠️ No screen sources returned! This may indicate:');
          logWarn('BG-UPLOAD', '  1. Missing screen recording permissions (macOS)');
          logWarn('BG-UPLOAD', '  2. No displays connected');
          logWarn('BG-UPLOAD', '  3. Platform-specific limitation');
          
          // On macOS, show a helpful message to the user
          if (process.platform === 'darwin' && mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('screenshot-permission-denied', {
              message: 'Screen recording permission is required to capture screenshots. Please grant permission in System Settings.',
              timestamp: Date.now()
            });
          }
        }
        
        if (sources && sources.length > 0) {
          const timestamp = new Date().toISOString();
          
          // Capture and upload screenshots from all displays
          const uploadPromises = sources.map(async (source, index) => {
            try {
              const screenshotData = source.thumbnail.toDataURL('image/png');
              await handleScreenshotUpload({
                userEmail: currentUserEmail,
                sessionId: currentSessionId,
                screenshotData,
                timestamp,
                isIdle: isUserIdle,
                contextLabel: 'BG-UPLOAD',
                screenIndex: index + 1,
                screenName: source.name || `Screen ${index + 1}`
              });
            } catch (error) {
              logError('BG-UPLOAD', `Error uploading screenshot for screen ${index + 1}:`, error);
            }
          });
          
          // Wait for all screenshots to be uploaded
          await Promise.all(uploadPromises);
          logInfo('BG-UPLOAD', `Captured and uploaded ${sources.length} screen(s)`);
        } else {
          logWarn('BG-UPLOAD', 'No screen sources found');
        }
      } catch (error) {
        logError('BG-UPLOAD', 'Error capturing screenshot', error);
      } finally {
        isBackgroundTickRunning = false;
        // Schedule the next screenshot with a new random delay
        scheduleNextScreenshot();
      }
    }, randomDelay);

    logInfo('IPC', `Next screenshot scheduled in ${randomDelay}ms (random between ${minDelay}ms and ${maxDelay}ms)`);
  };

  // Start the first screenshot immediately (or with a small initial delay)
  // Then schedule subsequent screenshots with random intervals
  scheduleNextScreenshot();
  
  logInfo('IPC', `Background screenshots started with random intervals between ${Math.floor(intervalMs * 0.5)}ms and ${intervalMs}ms`);
  return true;
});

ipcMain.handle('stop-background-screenshots', async () => {
  isBackgroundCaptureActive = false;
  if (backgroundScreenshotInterval) {
    clearTimeout(backgroundScreenshotInterval);
    backgroundScreenshotInterval = null;
  }
  // Flush any remaining screenshots in the batch queue
  await flushScreenshotBatch();
  logInfo('IPC', 'Background screenshots stopped');
  return true;
});

// Get batch queue status
ipcMain.handle('get-screenshot-batch-status', () => {
  return {
    queueSize: screenshotBatchQueue.length,
    batchSize: SCREENSHOT_BATCH_SIZE,
    isUploading: isBatchUploading,
    nextFlushIn: batchFlushInterval ? SCREENSHOT_BATCH_FLUSH_INTERVAL : null
  };
});

// Manually flush batch queue
ipcMain.handle('flush-screenshot-batch', async () => {
  await flushScreenshotBatch();
  return { ok: true, message: 'Batch flushed' };
});

// ============ NEW: missing handlers your renderer expects ============

// set-timer-active / get-timer-active
ipcMain.handle('set-timer-active', (event, active) => {
  isTimerActive = Boolean(active);
  logInfo('IPC', `Timer active set to: ${isTimerActive}`);
  return true;
});
ipcMain.handle('get-timer-active', () => {
  return !!isTimerActive;
});

// capture-screen (returns base64 screenshot of primary screen)
ipcMain.handle('capture-screen', async () => {
  try {
    const { width, height } = screen.getPrimaryDisplay().size;
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width, height },
    });
    if (!sources || sources.length === 0) return null;
    return sources[0].thumbnail.toDataURL('image/png');
  } catch (e) {
    logError('IPC', 'capture-screen failed', e);
    return null;
  }
});

// capture-all-screens (returns array of screenshots from all displays)
ipcMain.handle('capture-all-screens', async () => {
  try {
    const displays = screen.getAllDisplays();
    const screenshots = [];
    
    logInfo('IPC', `[capture-all-screens] Detected ${displays.length} display(s)`);
    displays.forEach((display, idx) => {
      logInfo('IPC', `[capture-all-screens] Display ${idx + 1}: ${display.size.width}x${display.size.height}`);
    });
    
    // Get all screen sources
    const allDisplays = screen.getAllDisplays();
    const maxWidth = Math.max(...allDisplays.map(d => d.size.width));
    const maxHeight = Math.max(...allDisplays.map(d => d.size.height));
    
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: maxWidth, height: maxHeight },
    });
    
    logInfo('IPC', `[capture-all-screens] Received ${sources?.length || 0} source(s) from desktopCapturer`);
    
    if (sources && sources.length > 0) {
      sources.forEach((source, idx) => {
        logInfo('IPC', `[capture-all-screens] Source ${idx + 1}: id="${source.id}", name="${source.name}"`);
      });
    } else {
      logWarn('IPC', '[capture-all-screens] ⚠️ No screen sources found! Check macOS screen recording permissions.');
    }
    
    if (!sources || sources.length === 0) {
      logWarn('IPC', 'No screen sources found');
      return [];
    }
    
    // Map each source to a screenshot object with dataURL and name
    for (const source of sources) {
      screenshots.push({
        dataURL: source.thumbnail.toDataURL('image/png'),
        name: source.name || `Screen ${screenshots.length + 1}`
      });
    }
    
    logInfo('IPC', `Captured ${screenshots.length} screen(s)`);
    return screenshots;
  } catch (e) {
    logError('IPC', 'capture-all-screens failed', e);
    return [];
  }
});

// Diagnostic handler to check screen capture capabilities
ipcMain.handle('diagnose-screen-capture', async () => {
  const diagnostics = {
    platform: process.platform,
    displays: [],
    sources: [],
    permissions: 'unknown',
    timestamp: new Date().toISOString()
  };
  
  try {
    // Get all displays
    const displays = screen.getAllDisplays();
    diagnostics.displays = displays.map((display, idx) => ({
      index: idx + 1,
      size: display.size,
      bounds: display.bounds,
      scaleFactor: display.scaleFactor,
      primary: display === screen.getPrimaryDisplay()
    }));
    
    // Try to get screen sources
    const maxWidth = Math.max(...displays.map(d => d.size.width));
    const maxHeight = Math.max(...displays.map(d => d.size.height));
    
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: maxWidth, height: maxHeight }
    });
    
    diagnostics.sources = (sources || []).map((source, idx) => ({
      index: idx + 1,
      id: source.id,
      name: source.name,
      thumbnailSize: source.thumbnail?.getSize()
    }));
    
    // On macOS, if we get no sources, it's likely a permissions issue
    if (process.platform === 'darwin') {
      if (!sources || sources.length === 0) {
        diagnostics.permissions = 'likely_denied';
      } else if (sources.length < displays.length) {
        diagnostics.permissions = 'partial';
      } else {
        diagnostics.permissions = 'granted';
      }
    } else {
      diagnostics.permissions = 'not_applicable';
    }
    
    logInfo('DIAGNOSTIC', JSON.stringify(diagnostics, null, 2));
    return diagnostics;
  } catch (error) {
    logError('DIAGNOSTIC', 'Error diagnosing screen capture', error);
    diagnostics.error = error.message;
    return diagnostics;
  }
});

// save-active-session (stub - update as needed to persist session)
ipcMain.handle('save-active-session', async (event, sessionData) => {
  try {
    // TODO: persist to local DB or supabase if you want
    logInfo('IPC', 'save-active-session called', !!sessionData);
    return { ok: true };
  } catch (e) {
    logError('IPC', 'save-active-session failed', e);
    return { ok: false, error: e.message };
  }
});

// is-background-screenshots-active
ipcMain.handle('is-background-screenshots-active', () => {
  return !!isBackgroundCaptureActive;
});

// get-local-screenshots
ipcMain.handle('get-local-screenshots', async (event, email, startTime, endTime) => {
  try {
    const dir = resolveScreenshotsDir(false);
    if (!fs.existsSync(dir)) return [];
    const files = fs.readdirSync(dir);
    // simple filter - you can improve by parsing timestamps in filename if you have them
    const matched = files
      .filter(f => typeof email === 'string' ? f.includes(email.replace(/@/g,'_at_')) : true)
      .map(f => path.join(dir, f));
    return matched;
  } catch (e) {
    logError('IPC', 'get-local-screenshots failed', e);
    return [];
  }
});

// open-local-screenshot
ipcMain.handle('open-local-screenshot', async (event, filePath) => {
  try {
    if (!filePath || !fs.existsSync(filePath)) return { ok: false, message: 'File not found' };
    await shell.openPath(filePath);
    return { ok: true };
  } catch (e) {
    logError('IPC', 'open-local-screenshot failed', e);
    return { ok: false, error: e.message };
  }
});

// open-picture-in-picture
ipcMain.handle('open-picture-in-picture', async (event, imageSrc) => {
  try {
    const pip = new BrowserWindow({
      width: 500,
      height: 300,
      alwaysOnTop: true,
      frame: false,
      resizable: false,
      webPreferences: { nodeIntegration: false, contextIsolation: true },
    });
    // create a minimal html to show image
    const html = `
      <html><body style="margin:0;background:transparent;display:flex;align-items:center;justify-content:center">
        <img src="${imageSrc}" style="max-width:100%;max-height:100%"/>
      </body></html>`;
    pip.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    return { ok: true };
  } catch (e) {
    logError('IPC', 'open-picture-in-picture failed', e);
    return { ok: false, error: e.message };
  }
});

// open external URL
ipcMain.handle('open-external-url', async (event, url) => {
  try {
    if (!url) return { ok: false };
    await shell.openExternal(String(url));
    return { ok: true };
  } catch (e) {
    logError('IPC', 'open-external-url failed', e);
    return { ok: false, error: e.message };
  }
});

// ============ APP LIFECYCLE ============
app.whenReady().then(() => {
  createWindow();
});

app.on('window-all-closed', async () => {
  if (backgroundScreenshotInterval) clearTimeout(backgroundScreenshotInterval);
  isBackgroundCaptureActive = false;
  // Flush any remaining screenshots before closing
  await flushScreenshotBatch();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', async () => {
  if (backgroundScreenshotInterval) {
    clearTimeout(backgroundScreenshotInterval);
    backgroundScreenshotInterval = null;
  }
  isBackgroundCaptureActive = false;
  if (global.__idlePollInterval) {
    clearInterval(global.__idlePollInterval);
    global.__idlePollInterval = null;
  }
  // Flush any remaining screenshots before quitting
  await flushScreenshotBatch();
  logInfo('App', 'Application shutting down');
});
