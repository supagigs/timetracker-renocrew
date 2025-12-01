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

    // Enhanced AppleScript command to get both the app name and window title
    // This gets the frontmost application name and its frontmost window title
    // The window title often contains tab/page names for browsers, file names for editors, etc.
    const command = `osascript -e 'tell application "System Events"
      set frontApp to first application process whose frontmost is true
      set appName to name of frontApp
      set windowTitle to ""
      try
        -- Try to get the frontmost window's title
        set frontWindow to first window of frontApp whose visible is true
        try
          set windowTitle to name of frontWindow
        on error
          try
            set windowTitle to title of frontWindow
          on error
            -- For some apps, try getting the value property
            try
              set windowTitle to value of attribute "AXTitle" of frontWindow
            on error
              set windowTitle to ""
            end try
          end try
        end try
      on error
        -- If no visible window, try getting any window
        try
          set windowTitle to name of first window of frontApp
        on error
          try
            set windowTitle to title of first window of frontApp
          on error
            set windowTitle to ""
          end try
        end try
      end try
      return appName & "|" & windowTitle
    end tell'`;

    const { exec } = require('child_process');
    exec(command, { timeout: 2000 }, (error, stdout, stderr) => {
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
let toastWin = null;
let toastQueue = []; // Queue for toast notifications when multiple screenshots are captured
let isProcessingToastQueue = false;

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
        checkScreenRecordingPermission()
        .then((hasPermission) => {
          if (!hasPermission) {
            setTimeout(() => {
              requestScreenRecordingPermission();
            }, 1000);
          }
        })
        .catch((error) => {
          logWarn('Permissions', `Screen recording check failed: ${error?.message || error}`);
        });
      
      checkAccessibilityPermission()
        .then((hasPermission) => {
          if (!hasPermission) {
            setTimeout(() => {
              requestAccessibilityPermission();
            }, 2000);
          }
        })
        .catch((error) => {
          logWarn('Permissions', `Accessibility check failed: ${error?.message || error}`);
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
            
            // On Mac, if active-win succeeded but didn't return a window title, try AppleScript to get it
            if (process.platform === 'darwin' && (!result.title || result.title.trim() === '')) {
              logInfo('ActiveWindow', 'active-win returned no window title, trying AppleScript to get title');
              const appleScriptResult = await getActiveAppNameViaAppleScript();
              if (appleScriptResult && appleScriptResult.title && appleScriptResult.title.trim() !== '') {
                // Merge the window title from AppleScript with the result from active-win
                result.title = appleScriptResult.title;
                logInfo('ActiveWindow', `Merged window title from AppleScript: ${result.title}`);
              }
            }
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
        if (windowTitle && windowTitle.length > 0) {
          // For browsers, the window title often contains the tab/page name
          // Even if windowTitle contains the app name, include it for context
          // Format: "App Name - Window Title" (e.g., "Google Chrome - YouTube")
          // Check if window title already contains app name to avoid duplication
          const windowTitleLower = windowTitle.toLowerCase();
          const ownerNameLower = ownerName.toLowerCase();
          
          if (windowTitleLower.includes(ownerNameLower) && windowTitleLower.length > ownerNameLower.length) {
            // Window title already contains app name with additional info (e.g., "Google Chrome - YouTube")
            // Use the full window title as it has more context
            finalAppName = windowTitle;
          } else if (windowTitle !== ownerName) {
            // Window title is different from app name, combine them
            finalAppName = `${ownerName} - ${windowTitle}`;
          } else {
            // Window title is same as app name, just use app name
            finalAppName = ownerName;
          }
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
  if (!sharp) {
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
  let jpegBuffer = await sharp(inputBuffer)
    .resize(UPLOAD_WIDTH, null, { withoutEnlargement: true, fit: 'inside' })
    .jpeg({ quality: quality, mozjpeg: true })
    .toBuffer();

  // Keep compressing if needed
  // Keep compressing if needed
let attempts = 0;

while (jpegBuffer.length > TARGET_SIZE_BYTES && attempts < 5 && quality > 30) {
  attempts++;
  quality -= (jpegBuffer.length > TARGET_SIZE_BYTES * 1.5) ? 15 : 5;

  if (quality <= 30) {
    quality = 30;
    const scaleFactor = Math.sqrt(TARGET_SIZE_BYTES / jpegBuffer.length);
    const newWidth = Math.floor(UPLOAD_WIDTH * scaleFactor);

    jpegBuffer = await sharp(inputBuffer)
      .resize(newWidth, null, { withoutEnlargement: true, fit: 'inside' })
      .jpeg({ quality: 30, mozjpeg: true })
      .toBuffer();
    break;
  }

  jpegBuffer = await sharp(inputBuffer)
    .resize(UPLOAD_WIDTH, null, { withoutEnlargement: true, fit: 'inside' })
    .jpeg({ quality: quality, mozjpeg: true })
    .toBuffer();
}


  logInfo('Compress', `JPEG size: ${(jpegBuffer.length / 1024).toFixed(2)} KB`);
  return jpegBuffer;
}

// Process toast queue - ensures only one toast is shown at a time
function processToastQueue() {
  if (isProcessingToastQueue || toastQueue.length === 0) {
    return;
  }
  
  isProcessingToastQueue = true;
  
  // Get the most recent toast from queue (last item)
  // This ensures we show the latest screenshot when multiple are captured
  const toastItem = toastQueue.pop();
  toastQueue = []; // Clear queue, we only show the most recent
  
  if (!toastItem) {
    isProcessingToastQueue = false;
    return;
  }
  
  const { filePath, base64Data } = toastItem;
  
  // If there's an existing toast, close it first
  if (toastWin && !toastWin.isDestroyed()) {
    const existingToastAge = Date.now() - (toastWin._createdAt || 0);
    const delay = existingToastAge < 1000 ? (process.platform === 'darwin' ? 600 : 500) : 0;
    
    setTimeout(() => {
      if (toastWin && !toastWin.isDestroyed()) {
        toastWin.close();
        toastWin = null;
      }
      // Create new toast after closing the old one
      setTimeout(() => {
        createToastWindow(filePath, base64Data);
        isProcessingToastQueue = false;
      }, process.platform === 'darwin' ? 100 : 50);
    }, delay);
  } else {
    // No existing toast, create immediately
    createToastWindow(filePath, base64Data);
    isProcessingToastQueue = false;
  }
}

function showToastNotification(filePath, base64Data) {
  try {
    // Validate inputs
    if (!filePath || !base64Data) {
      logWarn('Toast', 'Invalid toast notification data - missing filePath or base64Data');
      return;
    }
    
    // Add to queue instead of showing immediately
    // This prevents conflicts when multiple screenshots are captured rapidly
    toastQueue.push({ filePath, base64Data, timestamp: Date.now() });
    
    // Process queue with a small delay to batch rapid captures
    // This ensures we only show the most recent screenshot
    setTimeout(() => {
      processToastQueue();
    }, 100);
  } catch (error) {
    logError('Toast', `Error queuing toast notification: ${error.message}`, error);
    // Try to create toast anyway, even if there was an error
    try {
      const retryDelay = process.platform === 'darwin' ? 200 : 0;
      setTimeout(() => {
        createToastWindow(filePath, base64Data);
      }, retryDelay);
    } catch (e) {
      logError('Toast', `Failed to create toast window: ${e.message}`, e);
    }
  }
}

function createToastWindow(filePath, base64Data) {
  try {
    // Use a consistent, sufficiently large size on all platforms so that
    // the preview image + side column (delete button + timer) are fully visible.
    // On macOS the previous smaller size (300x200) caused the side column
    // to be clipped, which made the delete button and 5s timer invisible.
    const TOAST_WIDTH = 520;
    const TOAST_HEIGHT = 340;
    toastWin = new BrowserWindow({
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

    // Track when this toast was created
    toastWin._createdAt = Date.now();

    const { workArea } = screen.getPrimaryDisplay();
    const x = workArea.x + workArea.width - TOAST_WIDTH - 20;
    const y = workArea.y + workArea.height - TOAST_HEIGHT - 20;
    toastWin.setPosition(x, y);

    toastWin.loadFile(path.join(__dirname, 'toast.html'));

    toastWin.once('ready-to-show', () => {
      // Check if window still exists (might have been closed)
      if (!toastWin || toastWin.isDestroyed()) {
        logWarn('Toast', 'Toast window was destroyed before ready-to-show');
        return;
      }
      
      try {
        // On Mac, use show() instead of showInactive() for better reliability
        // Add a small delay to ensure the window is properly initialized
        setTimeout(() => {
          if (!toastWin || toastWin.isDestroyed()) {
            logWarn('Toast', 'Toast window was destroyed before showing');
            return;
          }
          
          // On Mac, ensure the window is properly shown and visible
          if (process.platform === 'darwin') {
            toastWin.show();
            // Ensure window is on top and visible
            toastWin.setAlwaysOnTop(true, 'screen-saver');
            toastWin.moveTop();
          } else {
            toastWin.showInactive();
          }
          
          logInfo('Toast', `Toast notification displayed for: ${path.basename(filePath)}`);
          
          // Send init message after a brief delay to ensure window is ready
          // Validate base64Data before sending
          setTimeout(() => {
            if (toastWin && !toastWin.isDestroyed() && toastWin.webContents && !toastWin.webContents.isDestroyed()) {
              // Validate base64Data format
              let validBase64Data = base64Data;
              if (base64Data && typeof base64Data === 'string') {
                // Ensure it's a valid data URL
                if (!base64Data.startsWith('data:image/')) {
                  // If it's just base64 without data URL prefix, add it
                  if (base64Data.startsWith('iVBORw0KGgo') || base64Data.includes('/9j/')) {
                    // PNG or JPEG base64
                    const mimeType = base64Data.startsWith('iVBORw0KGgo') ? 'image/png' : 'image/jpeg';
                    validBase64Data = `data:${mimeType};base64,${base64Data}`;
                  } else {
                    logWarn('Toast', 'Invalid base64Data format, attempting to use as-is');
                  }
                }
              } else {
                logWarn('Toast', 'base64Data is not a string, cannot display preview');
                validBase64Data = null;
              }
              
              toastWin.webContents.send('toast-init', { filePath, base64Data: validBase64Data });
              logInfo('Toast', `Sent init message with preview data (length: ${validBase64Data ? validBase64Data.length : 0})`);
            } else {
              logWarn('Toast', 'Toast webContents was destroyed before sending init message');
            }
          }, 50);
        }, process.platform === 'darwin' ? 100 : 0);
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
    }, 9000);
    
    toastWin.on('closed', () => { 
      toastWin = null; 
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
  const {
    userEmail,
    sessionId,
    screenshotData,
    timestamp,
    isIdle,
    contextLabel,
    screenIndex,
    screenName,
    appName
  } = uploadData;

  const screenSuffix = screenIndex ? `_screen${screenIndex}` : '';
  const jpegFilename = `${userEmail.replace(/@/g, '_at_').replace(/\./g, '_')}_${sessionId}_${timestamp.replace(/[:.]/g, '-')}${screenSuffix}.jpg`;
  const screenshotsDir = resolveScreenshotsDir(true);
  const filePath = path.join(screenshotsDir, jpegFilename);

  try {
    showToastNotification(filePath, screenshotData);
  } catch {}

  try {
    let capturedAppName = appName;
    if (!capturedAppName) {
      try {
        capturedAppName = await getActiveAppName() || 'Unknown';
      } catch {
        capturedAppName = 'Unknown';
      }
    }

    const jpegBuffer = await compressToJpegBufferFromDataUrl(screenshotData);
    fs.writeFileSync(filePath, jpegBuffer);

    const batchItem = {
      userEmail,
      sessionId,
      screenshotData, // kept for preview; cleared later
      timestamp,
      isIdle,
      contextLabel,
      screenIndex,
      screenName,
      appName: capturedAppName,
      filePath,
      jpegBuffer,
      jpegFilename,
      addedAt: Date.now()
    };

    screenshotBatchQueue.push(batchItem);
    pendingScreenshots.set(filePath, false);

    if (!batchFlushInterval && screenshotBatchQueue.length > 0) {
      batchFlushInterval = setInterval(async () => {
        if (screenshotBatchQueue.length > 0 && !isBatchUploading) {
          logInfo('BATCH-UPLOAD', `Periodic flush: processing ${screenshotBatchQueue.length} screenshot(s) after timeout`);
          await processScreenshotBatch();
        }
        if (screenshotBatchQueue.length === 0) {
          clearInterval(batchFlushInterval);
          batchFlushInterval = null;
          logInfo('BATCH-UPLOAD', `Flush interval cleared (queue empty)`);
        }
      }, SCREENSHOT_BATCH_FLUSH_INTERVAL);
      logInfo('BATCH-UPLOAD', `Created flush interval (${SCREENSHOT_BATCH_FLUSH_INTERVAL}ms)`);
    }

    if (screenshotBatchQueue.length >= SCREENSHOT_BATCH_SIZE) {
      logInfo(contextLabel, `Batch full (${SCREENSHOT_BATCH_SIZE} screenshots), starting upload...`);
      await processScreenshotBatch();
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

  const batchToUpload = [...screenshotBatchQueue];
  screenshotBatchQueue.length = 0;

  logInfo('BATCH-UPLOAD', `Processing batch of ${batchToUpload.length} screenshot(s)`);

  const validScreenshots = batchToUpload.filter(item => {
    const isCancelled = pendingScreenshots.get(item.filePath) === true;
    const exists = fs.existsSync(item.filePath);
    
    if (isCancelled) {
      logInfo('BATCH-UPLOAD', `[FILTERED] CANCELLED: ${item.jpegFilename}`);
      pendingScreenshots.delete(item.filePath);
      return false;
    }
    if (!exists) {
      logInfo('BATCH-UPLOAD', `[FILTERED] MISSING: ${item.jpegFilename}`);
      pendingScreenshots.delete(item.filePath);
      return false;
    }
    
    return true;
  });

  const supabase = getSupabaseClient();
  if (!supabase) {
    logError('BATCH-UPLOAD', 'Supabase client unavailable, re-queuing batch');
    screenshotBatchQueue.unshift(...validScreenshots);
    isBatchUploading = false;
    return;
  }

  const uploadResults = [];
  const filesToDelete = [];

  try {
    const uploadPromises = validScreenshots.map(async (item) => {
      try {
        if (pendingScreenshots.get(item.filePath) === true) {
          logInfo('BATCH-UPLOAD', `[PRE-UPLOAD-CHECK] Skipping cancelled: ${item.jpegFilename}`);
          pendingScreenshots.delete(item.filePath);
          return { ok: false, skipped: true, reason: 'cancelled', filePath: item.filePath };
        }

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

        const appName = item.appName || 'Unknown';
        await insertScreenshotToDatabase(
          supabase,
          item.userEmail,
          item.sessionId,
          publicUrl,
          item.timestamp,
          appName,
          item.isIdle
        );

        broadcastScreenshotCaptured({
          timestamp: item.timestamp,
          previewDataUrl: item.screenshotData,
          storageUrl: publicUrl,
          filePath: item.filePath,
          sessionId: item.sessionId,
          appName,
          isIdle: Boolean(item.isIdle)
        });

        // safe to clear preview only on successful upload
        item.screenshotData = null;

        try {
          if (toastWin && !toastWin.isDestroyed()) {
            toastWin.webContents.send('toast-file-uploaded', {
              oldFilePath: item.filePath,
              remoteUrl: publicUrl
            });
          }
        } catch {}

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

    const failedUploads = results.filter(r => !r.ok && r.item);
    if (failedUploads.length > 0) {
      logWarn('BATCH-UPLOAD', `Re-queuing ${failedUploads.length} failed upload(s)`);

      const itemsToRequeue = failedUploads.map(f => {
        const original = f.item;
        const retryCount = (original.retryCount || 0) + 1;
        const MAX_RETRIES_WITH_PREVIEW = 3;

        return {
          userEmail: original.userEmail,
          sessionId: original.sessionId,
          screenshotData: retryCount < MAX_RETRIES_WITH_PREVIEW ? original.screenshotData : null,
          timestamp: original.timestamp,
          isIdle: original.isIdle,
          contextLabel: original.contextLabel,
          screenIndex: original.screenIndex,
          screenName: original.screenName,
          appName: original.appName,
          filePath: original.filePath,
          jpegBuffer: original.jpegBuffer,
          jpegFilename: original.jpegFilename,
          addedAt: Date.now(),
          retryCount: retryCount
        };
      });

      screenshotBatchQueue.push(...itemsToRequeue);
    }

    const successCount = results.filter(r => r.ok).length;
    logInfo(
      'BATCH-UPLOAD',
      `Batch complete: ${successCount}/${validScreenshots.length} uploaded, ${deletedCount} files deleted`
    );

  } catch (error) {
    logError('BATCH-UPLOAD', `Batch processing error: ${error.message}`, error);
    const MAX_RETRIES_WITH_PREVIEW = 3;
    const itemsToRequeue = validScreenshots.map(item => {
      const retryCount = (item.retryCount || 0) + 1;
      return {
        ...item,
        retryCount: retryCount,
        screenshotData: retryCount < MAX_RETRIES_WITH_PREVIEW ? item.screenshotData : null
      };
    });
    screenshotBatchQueue.unshift(...itemsToRequeue);
  } finally {
    isBatchUploading = false;
  }
}

// Flush remaining screenshots in queue (called on app close or session end)
async function flushScreenshotBatch() {
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

    const normalizedFreelancer = userEmail.trim().toLowerCase();
    const DEFAULT_INTERVAL_SECONDS = 300; // 5 minutes default
    let clientEmail = null;

    // 1) Get project_id from time_sessions using sessionId
    if (!sessionId) {
      logWarn('ScreenshotInterval', 'No sessionId provided, using default interval');
      return DEFAULT_INTERVAL_SECONDS * 1000;
    }

    const { data: sessionData, error: sessionError } = await supabase
      .from('time_sessions')
      .select('project_id')
      .eq('id', sessionId)
      .maybeSingle();

    if (sessionError) {
      logWarn(
        'ScreenshotInterval',
        `Error fetching session ${sessionId}: ${sessionError.message}, using default`,
      );
      return DEFAULT_INTERVAL_SECONDS * 1000;
    }

    if (!sessionData || !sessionData.project_id) {
      logInfo(
        'ScreenshotInterval',
        `Session ${sessionId} has no project_id, using default interval`,
      );
      return DEFAULT_INTERVAL_SECONDS * 1000;
    }

    const projectId = sessionData.project_id;

    // 2) Get client email from project_assignments (assigned_by) or projects (user_email)
    // Try project_assignments first (most reliable - shows who assigned the project)
    const { data: projectAssignment, error: assignmentError } = await supabase
      .from('project_assignments')
      .select('assigned_by')
      .eq('project_id', projectId)
      .eq('freelancer_email', normalizedFreelancer)
      .maybeSingle();

    if (!assignmentError && projectAssignment && projectAssignment.assigned_by) {
      // Use assigned_by (the client who assigned the project)
      clientEmail = projectAssignment.assigned_by.trim().toLowerCase();
    }

    // 3) If project_assignments lookup failed or has no assigned_by, try getting client from projects table directly
    if (!clientEmail) {
      const { data: projectData, error: projectError } = await supabase
    .from('projects')
    .select('screenshot_interval, user_id')
    .eq('id', projectId)
    .maybeSingle();

    if (!projectError && projectData && projectData.user_id) {
      // Declare variables OUTSIDE the if block to avoid scope issues
      let userData = null;
      let userError = null;
    
      // Fetch email from users table using userid foreign key
      const result = await supabase
        .from('users')
        .select('email')
        .eq('id', projectData.user_id)
        .maybeSingle();
      
      userData = result.data;
      userError = result.error;
    
      // Now can safely use userData and userError here
      if (!userError && userData && userData.email) {
        clientEmail = userData.email.trim().toLowerCase();
        logInfo('ScreenshotInterval', `Using project owner email: ${clientEmail}`);
      } else if (userError) {
        logError('ScreenshotInterval', `Error fetching user email: ${userError.message}`);
      }
    }
  }
    
    // 4) Final fallback: assume logged-in user is the client
    if (!clientEmail) {
      logInfo(
        'ScreenshotInterval',
        `Could not resolve client for project ${projectId}, assuming user is client`,
      );
      clientEmail = normalizedFreelancer;
    }

    // 5) Load client settings (per-freelancer map) for the resolved client
    const { data: clientSettings, error: settingsError } = await supabase
      .from('client_settings')
      .select('freelancer_intervals')
      .eq('client_email', clientEmail)
      .maybeSingle();

    if (settingsError) {
      logWarn(
        'ScreenshotInterval',
        `Error fetching client_settings for client ${clientEmail}: ${settingsError.message}, using default`,
      );
      return DEFAULT_INTERVAL_SECONDS * 1000;
    }

    if (!clientSettings) {
      logInfo(
        'ScreenshotInterval',
        `No client_settings found for client ${clientEmail}, using default interval`,
      );
      return DEFAULT_INTERVAL_SECONDS * 1000;
    }

    // 6) Get the interval from freelancer_intervals map using freelancer email as key
    const map = clientSettings.freelancer_intervals || {};
    const perFreelancerSeconds = Number(map[normalizedFreelancer]);

    const intervalSeconds =
      Number.isFinite(perFreelancerSeconds) && perFreelancerSeconds > 0
        ? perFreelancerSeconds
        : DEFAULT_INTERVAL_SECONDS;

    if (!Number.isFinite(intervalSeconds) || intervalSeconds <= 0) {
      logWarn(
        'ScreenshotInterval',
        `Invalid interval value: ${intervalSeconds}, using default`,
      );
      return DEFAULT_INTERVAL_SECONDS * 1000;
    }

    const intervalMs = intervalSeconds * 1000;
    logInfo(
      'ScreenshotInterval',
      `Using interval for client ${clientEmail}, freelancer ${normalizedFreelancer}, project ${projectId}: ${intervalSeconds} seconds (${intervalMs}ms)`,
    );
    return intervalMs;
  } catch (e) {
    logError('ScreenshotInterval', 'Failed to get interval', e);
    return 300000;
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
ipcMain.handle('toast-delete-file', async (event, filePath) => {
  logInfo('DELETE', `Handler called with filePath: ${filePath}`);

  try {
    // ✅ STEP 1: ATOMIC - Set cancellation flag FIRST (BEFORE anything else)
    pendingScreenshots.set(filePath, true);
    logInfo('DELETE', `[ATOMIC] Marked for cancellation: ${filePath}`);

    // ✅ STEP 2: Remove from batch queue IMMEDIATELY
    const indexInQueue = screenshotBatchQueue.findIndex(item => item.filePath === filePath);
    if (indexInQueue !== -1) {
      screenshotBatchQueue.splice(indexInQueue, 1);
      logInfo('DELETE', `[QUEUE] Removed from batch queue at index ${indexInQueue}`);
    }

    // ✅ STEP 3: Delete from local disk
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      logInfo('DELETE', `[DISK] File deleted: ${filePath}`);
    } else {
      logWarn('DELETE', `[DISK] File does not exist: ${filePath}`);
    }

    // ✅ STEP 4: Clean up pending map with 1000ms delay
    setTimeout(() => {
      pendingScreenshots.delete(filePath);
      logInfo('DELETE', `[CLEANUP] Removed from pending map: ${filePath}`);
    }, 1000);

    // ✅ STEP 5: Close toast window
    if (toastWin && !toastWin.isDestroyed()) {
      try {
        toastWin.close();
      } catch (e) {
        logWarn('DELETE', `Error closing toast: ${e.message}`);
      }
      toastWin = null;
    }

    // ✅ STEP 6: Broadcast deletion
    BrowserWindow.getAllWindows().forEach(window => {
      if (!window.isDestroyed()) {
        try {
          window.webContents.send('screenshot-deleted', { filePath });
        } catch (e) {
          logWarn('DELETE', `Error broadcasting: ${e.message}`);
        }
      }
    });

    logInfo('DELETE', `✓ COMPLETED: ${path.basename(filePath)}`);
    return { success: true, message: 'Screenshot deleted' };

  } catch (error) {
    logError('DELETE', `Error: ${error.message}`, error);
    return { success: false, message: error.message };
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

    // Generate random delay between 70% and 120% of the interval
    // This ensures screenshots are captured randomly within the specified range
    const minDelay = Math.floor(intervalMs * 0.7);
    const maxDelay = Math.floor(intervalMs * 1.2);
    const randomDelay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;

    backgroundScreenshotInterval = setTimeout(async () => {
      if (!isBackgroundCaptureActive || isBackgroundTickRunning) {
        scheduleNextScreenshot(); // Reschedule even if skipped
        return;
      }
      
      isBackgroundTickRunning = true;
      
      // Set a timeout to ensure we don't block indefinitely
      const captureTimeout = setTimeout(() => {
        if (isBackgroundTickRunning) {
          logWarn('BG-UPLOAD', 'Screenshot capture timeout (30s) - resetting flag to allow next capture');
          isBackgroundTickRunning = false;
        }
      }, 30000); // 30 second timeout
      
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
          // Use Promise.allSettled to ensure all screenshots are attempted even if some fail
          const uploadPromises = sources.map(async (source, index) => {
            try {
              // Validate thumbnail exists and is valid
              if (!source || !source.thumbnail) {
                logWarn('BG-UPLOAD', `No thumbnail available for screen ${index + 1} (${source?.name || 'Unknown'})`);
                return { success: false, screenIndex: index + 1, error: 'No thumbnail available' };
              }
              
              // Get thumbnail size for validation
              const thumbnailSize = source.thumbnail.getSize();
              if (!thumbnailSize || thumbnailSize.width === 0 || thumbnailSize.height === 0) {
                logWarn('BG-UPLOAD', `Invalid thumbnail size for screen ${index + 1}: ${thumbnailSize?.width || 0}x${thumbnailSize?.height || 0}`);
                return { success: false, screenIndex: index + 1, error: 'Invalid thumbnail size' };
              }
              
              // Convert thumbnail to data URL
              const screenshotData = source.thumbnail.toDataURL('image/png');
              if (!screenshotData || screenshotData.length === 0 || !screenshotData.startsWith('data:image/')) {
                logWarn('BG-UPLOAD', `Invalid screenshot data format for screen ${index + 1}`);
                return { success: false, screenIndex: index + 1, error: 'Invalid screenshot data format' };
              }
              
              logInfo('BG-UPLOAD', `Screen ${index + 1} (${source.name || `Screen ${index + 1}`}): thumbnail ${thumbnailSize.width}x${thumbnailSize.height}, data length: ${screenshotData.length}`);
              
              const result = await handleScreenshotUpload({
                userEmail: currentUserEmail,
                sessionId: currentSessionId,
                screenshotData,
                timestamp,
                isIdle: isUserIdle,
                contextLabel: 'BG-UPLOAD',
                screenIndex: index + 1,
                screenName: source.name || `Screen ${index + 1}`
              });
              
              if (result && result.ok) {
                logInfo('BG-UPLOAD', `Successfully queued screenshot for screen ${index + 1} (${source.name || `Screen ${index + 1}`})`);
                return { success: true, screenIndex: index + 1 };
              } else {
                logWarn('BG-UPLOAD', `Failed to queue screenshot for screen ${index + 1}: ${result?.error || 'Unknown error'}`);
                return { success: false, screenIndex: index + 1, error: result?.error || 'Unknown error' };
              }
            } catch (error) {
              logError('BG-UPLOAD', `Error capturing screenshot for screen ${index + 1}:`, error);
              return { success: false, screenIndex: index + 1, error: error.message };
            }
          });
          
          // Wait for all screenshots to complete (using allSettled so failures don't stop others)
          const results = await Promise.allSettled(uploadPromises);
          const successful = results.filter(r => r.status === 'fulfilled' && r.value?.success).length;
          const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value?.success)).length;
          
          logInfo('BG-UPLOAD', `Screenshot capture complete: ${successful} successful, ${failed} failed out of ${sources.length} screen(s)`);
          
          // Log any failures for debugging
          results.forEach((result, index) => {
            if (result.status === 'rejected') {
              logError('BG-UPLOAD', `Screen ${index + 1} capture rejected:`, result.reason);
            } else if (result.value && !result.value.success) {
              logWarn('BG-UPLOAD', `Screen ${index + 1} capture failed: ${result.value.error}`);
            }
          });
        } else {
          logWarn('BG-UPLOAD', 'No screen sources found');
        }
      } catch (error) {
        logError('BG-UPLOAD', 'Error capturing screenshot', error);
      } finally {
        // Clear timeout
        clearTimeout(captureTimeout);
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
  
  logInfo('IPC', `Background screenshots started with random intervals between ${Math.floor(intervalMs * 0.7)}ms and ${Math.floor(intervalMs * 1.2)}ms`);
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

// Check screen recording permission (used by preload.js -> checkScreenPermission)
ipcMain.handle('check-screen-permission', async () => {
  try {
    const hasPermission = await checkScreenRecordingPermission();
    return { ok: true, hasPermission };
  } catch (error) {
    logWarn('Permissions', `check-screen-permission failed: ${error?.message || error}`);
    return { ok: false, error: error?.message || String(error) };
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

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

let isQuitting = false;

async function flushScreenshotBatchOnShutdown() {
  // wait for any running batch
  while (isBatchUploading) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  await flushScreenshotBatch();
}

app.on('before-quit', (event) => {
  if (!isQuitting) {
    event.preventDefault();
    isQuitting = true;

    (async () => {
      try {
        await flushScreenshotBatch();
      } catch (err) {
        logWarn('Shutdown', `Error flushing screenshot batch on quit: ${err?.message || err}`);
      } finally {
        app.quit();
      }
    })();

    return;
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  logInfo('App', 'Activate event triggered - checking if window needs restoration');
  
  if (mainWindow === null || mainWindow.isDestroyed()) {
    logInfo('App', 'Main window is null or destroyed, creating new window');
    createWindow();
  } else {
    if (!mainWindow.isVisible()) {
      logInfo('App', 'Main window exists but hidden, showing it');
      mainWindow.show();
    }
    mainWindow.focus();
    logInfo('App', 'Main window focused');
  }
});
