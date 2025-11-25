const { app, BrowserWindow, ipcMain, desktopCapturer, powerMonitor, screen, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

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

// ============ GLOBAL STATE ============
const IDLE_THRESHOLD_SECONDS = 30;
let activeWindowModule = null;
let mainWindow = null;
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
  
  const windowOptions = {
    width: 900,
    height: 700,
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
    logInfo('Window', `Using icon: ${iconPath}`);
  } else {
    logWarn('Window', 'No icon file found, window will use default icon');
  }
  
  mainWindow = new BrowserWindow(windowOptions);

  mainWindow.loadFile('renderer/screens/login.html');
  mainWindow.on('closed', () => { mainWindow = null; });

  // Check screen recording permission on macOS after window is ready
  if (process.platform === 'darwin') {
    mainWindow.webContents.once('did-finish-load', () => {
      // Delay permission check slightly to ensure window is fully ready
      setTimeout(async () => {
        const permissionResult = await checkScreenRecordingPermission();
        if (!permissionResult.granted) {
          // Show permission dialog after a short delay
          setTimeout(() => {
            requestScreenRecordingPermission(true);
          }, 1000);
        }
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
// Returns: { granted: boolean, sources: array, error: string|null }
async function checkScreenRecordingPermission(retryCount = 0) {
  if (process.platform !== 'darwin') {
    return { granted: true, sources: [], error: null }; // Not macOS, no permission needed
  }

  const maxRetries = 2;
  
  try {
    // Use a reasonable thumbnail size for permission check
    // macOS sometimes requires a minimum size to properly trigger permission
    // Using a slightly larger size (200x200) to ensure we get valid thumbnails
    const testSize = { width: 200, height: 200 };
    
    logInfo('Permissions', `Checking screen recording permission (attempt ${retryCount + 1}/${maxRetries + 1})...`);
    
    // Try to get screen sources - this will trigger permission request if not granted
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: testSize,
      fetchWindowIcons: false
    });
    
    if (sources && sources.length > 0) {
      logInfo('Permissions', `✅ Screen recording permission granted - found ${sources.length} screen source(s)`);
      sources.forEach((source, idx) => {
        const thumbSize = source.thumbnail?.getSize();
        logInfo('Permissions', `  Source ${idx + 1}: id="${source.id}", name="${source.name}", thumbnail: ${thumbSize?.width || 'N/A'}x${thumbSize?.height || 'N/A'}`);
      });
      return { granted: true, sources, error: null };
    } else {
      // Retry once more with a delay if we got no sources
      if (retryCount < maxRetries) {
        logWarn('Permissions', `No sources found, retrying in 500ms... (attempt ${retryCount + 1}/${maxRetries + 1})`);
        await new Promise(resolve => setTimeout(resolve, 500));
        return await checkScreenRecordingPermission(retryCount + 1);
      }
      
      logWarn('Permissions', '❌ Screen recording permission denied or not granted - no sources returned');
      logWarn('Permissions', '   This usually means:');
      logWarn('Permissions', '   1. Permission was denied in System Settings');
      logWarn('Permissions', '   2. App needs to be restarted after granting permission');
      logWarn('Permissions', '   3. Permission was granted to a different app identifier (dev vs packaged)');
      return { granted: false, sources: [], error: 'No screen sources returned - permission likely denied. Please check System Settings → Privacy & Security → Screen Recording and restart the app.' };
    }
  } catch (error) {
    // Retry on error
    if (retryCount < maxRetries) {
      const errorMsg = error?.message || error?.toString() || 'Unknown error';
      logWarn('Permissions', `Error checking permission, retrying in 500ms... (attempt ${retryCount + 1}/${maxRetries + 1}):`, errorMsg);
      logWarn('Permissions', 'Full error object:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
      await new Promise(resolve => setTimeout(resolve, 500));
      return await checkScreenRecordingPermission(retryCount + 1);
    }
    
    const errorMsg = error?.message || error?.toString() || 'Unknown error';
    const errorStack = error?.stack || 'No stack trace';
    logError('Permissions', 'Error checking screen recording permission:', errorMsg);
    logError('Permissions', 'Error stack:', errorStack);
    logError('Permissions', 'Error type:', error?.constructor?.name || typeof error);
    logError('Permissions', 'Full error:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
    
    // Provide more helpful error message
    let errorDescription = errorMsg;
    if (errorMsg === 'Unknown error' || !errorMsg) {
      errorDescription = 'Failed to check screen recording permission. This may happen if the app needs to be restarted after granting permission, or if there is a mismatch between the app identifier and the permission grant.';
    }
    
    return { granted: false, sources: [], error: errorDescription };
  }
}

// Show permission dialog on macOS if needed
async function requestScreenRecordingPermission(showDialog = true) {
  if (process.platform !== 'darwin') {
    return { granted: true };
  }

  const permissionResult = await checkScreenRecordingPermission();
  
  if (!permissionResult.granted && showDialog && mainWindow && !mainWindow.isDestroyed()) {
    return new Promise((resolve) => {
      dialog.showMessageBox(mainWindow, {
        type: 'warning',
        title: 'Screen Recording Permission Required',
        message: 'Screen Recording Permission Required',
        detail: 'This app needs screen recording permission to capture screenshots.\n\n' +
                'Please grant permission:\n' +
                '1. Go to System Settings → Privacy & Security → Screen Recording\n' +
                '2. Find "Time Tracker" (or the app name) in the list\n' +
                '3. Enable the toggle\n' +
                '4. Restart the app if needed\n\n' +
                'After granting permission, screenshots will be captured automatically.',
        buttons: ['Open System Settings', 'Check Again', 'OK'],
        defaultId: 2,
        cancelId: 2
      }).then((result) => {
        if (result.response === 0) {
          // Open System Settings to Screen Recording
          shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
          resolve({ granted: false, action: 'opened_settings' });
        } else if (result.response === 1) {
          // Check again
          setTimeout(async () => {
            const recheck = await checkScreenRecordingPermission();
            resolve(recheck);
          }, 1000);
        } else {
          resolve({ granted: false, action: 'dismissed' });
        }
      }).catch((error) => {
        logError('Permissions', 'Error showing permission dialog:', error);
        resolve({ granted: false, error: error.message });
      });
    });
  }
  
  return permissionResult;
}

// Show Accessibility permission dialog on macOS if app name detection fails
function showAccessibilityPermissionDialog() {
  if (process.platform !== 'darwin' || !mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Accessibility Permission Required',
    message: 'Accessibility Permission Required',
    detail: 'To detect which application you are using, this app needs Accessibility permission.\n\n' +
            'Please grant permission:\n' +
            '1. Go to System Settings → Privacy & Security → Accessibility\n' +
            '2. Find "Time Tracker" (or the app name) in the list\n' +
            '3. Enable the toggle\n' +
            '4. Restart the app\n\n' +
            'Without this permission, app names will show as "Unknown".',
    buttons: ['Open System Settings', 'OK'],
    defaultId: 1,
    cancelId: 1
  }).then((result) => {
    if (result.response === 0) {
      // Open System Settings to Accessibility
      shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility');
    }
  }).catch((error) => {
    logError('Permissions', 'Error showing Accessibility permission dialog:', error);
  });
}

// macOS fallback: Use AppleScript to get active app name
async function getActiveAppNameAppleScript() {
  if (process.platform !== 'darwin') {
    return null;
  }
  
  try {
    // Use AppleScript to get the frontmost application name
    const script = 'tell application "System Events" to get name of first application process whose frontmost is true';
    const { stdout, stderr } = await execAsync(`osascript -e '${script}'`);
    
    if (stderr) {
      logWarn('ActiveWindow', 'AppleScript stderr:', stderr);
      return null;
    }
    
    const appName = stdout.trim();
    if (appName && appName.length > 0) {
      // Filter out our own app
      const ourAppName = app.getName();
      if (appName.toLowerCase() === ourAppName.toLowerCase()) {
        logInfo('ActiveWindow', 'AppleScript returned our own app, filtering it out');
        return null;
      }
      return appName;
    }
    
    return null;
  } catch (error) {
    logWarn('ActiveWindow', 'AppleScript failed:', error.message);
    // This might fail if Accessibility permissions aren't granted, but that's okay
    return null;
  }
}

// Convert Windows executable names to friendly application names
function getFriendlyAppName(executableName) {
  if (!executableName) return null;
  
  // Remove .exe extension if present
  const nameWithoutExt = executableName.replace(/\.exe$/i, '').trim();
  
  // Map common executable names to friendly names
  const appNameMap = {
    // Browsers
    'chrome': 'Google Chrome',
    'msedge': 'Microsoft Edge',
    'firefox': 'Mozilla Firefox',
    'brave': 'Brave Browser',
    'opera': 'Opera',
    'safari': 'Safari',
    
    // Code Editors
    'code': 'Visual Studio Code',
    'devenv': 'Visual Studio',
    'idea64': 'IntelliJ IDEA',
    'pycharm64': 'PyCharm',
    'webstorm64': 'WebStorm',
    'atom': 'Atom',
    'sublime_text': 'Sublime Text',
    'notepad++': 'Notepad++',
    
    // Git/Version Control
    'githubdesktop': 'GitHub Desktop',
    'gitkraken': 'GitKraken',
    'sourcetree': 'SourceTree',
    
    // Terminals
    'windows terminal': 'Windows Terminal',
    'wt': 'Windows Terminal',
    'powershell': 'PowerShell',
    'cmd': 'Command Prompt',
    'wsl': 'WSL',
    
    // Office
    'winword': 'Microsoft Word',
    'excel': 'Microsoft Excel',
    'powerpnt': 'Microsoft PowerPoint',
    'outlook': 'Microsoft Outlook',
    'onenote': 'Microsoft OneNote',
    
    // Communication
    'teams': 'Microsoft Teams',
    'slack': 'Slack',
    'discord': 'Discord',
    'zoom': 'Zoom',
    
    // System
    'explorer': 'File Explorer',
    'notepad': 'Notepad',
    'calc': 'Calculator',
    'mspaint': 'Paint',
    
    // Other common apps
    'spotify': 'Spotify',
    'vlc': 'VLC Media Player',
    'photoshop': 'Adobe Photoshop',
    'illustrator': 'Adobe Illustrator',
    'acrobat': 'Adobe Acrobat',
    'figma': 'Figma',
    'sketch': 'Sketch',
  };
  
  const nameLower = nameWithoutExt.toLowerCase();
  
  // Check exact match first
  if (appNameMap[nameLower]) {
    return appNameMap[nameLower];
  }
  
  // Check partial matches (e.g., "Code.exe" -> "code" -> "Visual Studio Code")
  for (const [key, value] of Object.entries(appNameMap)) {
    if (nameLower.includes(key) || key.includes(nameLower)) {
      return value;
    }
  }
  
  // If no mapping found, return the name without .exe but with proper capitalization
  // Convert "githubdesktop" to "GitHub Desktop" style
  return nameWithoutExt
    .replace(/([a-z])([A-Z])/g, '$1 $2') // Add space before capital letters
    .replace(/\b\w/g, l => l.toUpperCase()); // Capitalize first letter of each word
}

async function getActiveAppName() {
  try {
    // load module if not loaded
    if (!activeWindowModule) {
      try {
        activeWindowModule = await import('active-win');
      } catch (importError) {
        logError('ActiveWindow', 'Failed to import active-win module:', importError.message);
        logError('ActiveWindow', 'This might be a permission issue on macOS. active-win requires Accessibility permissions.');
        return null;
      }
    }

    // handle different exports across versions:
    //  - newer: activeWindow()
    //  - older: default()
    //  - some bundles export the function itself
    const fn =
      (activeWindowModule && activeWindowModule.activeWindow) ||
      (activeWindowModule && activeWindowModule.default) ||
      activeWindowModule;

    if (typeof fn !== 'function') {
      logWarn('ActiveWindow', 'active-win export not a function', typeof fn);
      logWarn('ActiveWindow', 'Module structure:', Object.keys(activeWindowModule || {}));
      return null;
    }

    let result;
    try {
      result = await fn();
    } catch (activeWinError) {
      // On macOS, active-win might fail due to missing Accessibility permissions
      if (process.platform === 'darwin') {
        logError('ActiveWindow', 'active-win failed on macOS:', activeWinError.message);
        logError('ActiveWindow', 'This usually means Accessibility permissions are not granted.');
        logError('ActiveWindow', 'Please grant Accessibility permission in System Settings → Privacy & Security → Accessibility');
        // Don't return null immediately - try to get at least window title from other sources
      } else {
        logError('ActiveWindow', 'active-win failed:', activeWinError.message);
      }
      return null;
    }
    
    if (!result) {
      logWarn('ActiveWindow', 'active-win returned no result');
      if (process.platform === 'darwin') {
        logWarn('ActiveWindow', 'On macOS, this might indicate missing Accessibility permissions.');
        logWarn('ActiveWindow', 'Check System Settings → Privacy & Security → Accessibility');
        // Show dialog once to guide user (throttle to avoid spam)
        if (!global.__accessibilityDialogShown) {
          global.__accessibilityDialogShown = true;
          setTimeout(() => {
            showAccessibilityPermissionDialog();
            // Reset after 5 minutes so it can show again if needed
            setTimeout(() => {
              global.__accessibilityDialogShown = false;
            }, 5 * 60 * 1000);
          }, 2000);
        }
      }
      return null;
    }
    
    // Log full result for debugging (always log on macOS to help diagnose permission issues)
    if (process.platform === 'darwin' || !app.isPackaged) {
      logInfo('ActiveWindow', `Full result from active-win: ${JSON.stringify(result, null, 2)}`);
      logInfo('ActiveWindow', `Result keys: ${Object.keys(result || {}).join(', ')}`);
      if (result.owner) {
        logInfo('ActiveWindow', `Owner keys: ${Object.keys(result.owner || {}).join(', ')}`);
        logInfo('ActiveWindow', `Owner object: ${JSON.stringify(result.owner, null, 2)}`);
      }
    }
    
    // Get the app's own name to filter it out
    const appName = app.getName();
    const appNameLower = appName.toLowerCase();
    
    // Extract owner name (application name) and window title
    // owner.name is the actual application (e.g., "Google Chrome", "Visual Studio Code")
    // title is the window/tab title (e.g., "GitHub - Your Repo", "New Tab")
    let ownerName = null;
    let windowTitle = null;
    let processName = null;
    
    // Try different possible structures from active-win
    // On macOS, the structure might be different, so try all possible locations
    if (result.owner) {
      ownerName = typeof result.owner.name === 'string' ? result.owner.name.trim() : null;
      processName = typeof result.owner.processName === 'string' ? result.owner.processName.trim() : null;
      
      // On macOS, also check for bundleId or other fields
      if (!ownerName && result.owner.bundleId) {
        // Try to extract app name from bundle ID (e.g., "com.google.Chrome" -> "Chrome")
        const bundleId = result.owner.bundleId;
        const parts = bundleId.split('.');
        if (parts.length > 0) {
          const lastPart = parts[parts.length - 1];
          // Capitalize first letter
          ownerName = lastPart.charAt(0).toUpperCase() + lastPart.slice(1);
          logInfo('ActiveWindow', `Extracted app name from bundleId: ${bundleId} -> ${ownerName}`);
        }
      }
    }
    
    // Try direct fields
    if (result.name && !ownerName) {
      // Some versions might have name directly
      ownerName = typeof result.name === 'string' ? result.name.trim() : null;
    }
    if (result.processName && !processName) {
      processName = typeof result.processName === 'string' ? result.processName.trim() : null;
    }
    if (result.title) {
      windowTitle = typeof result.title === 'string' ? result.title.trim() : null;
    }
    
    // On macOS, also try alternative field names
    if (process.platform === 'darwin') {
      // Try appName, application, app, etc.
      if (!ownerName && result.appName) {
        ownerName = typeof result.appName === 'string' ? result.appName.trim() : null;
        logInfo('ActiveWindow', `Found app name in appName field: ${ownerName}`);
      }
      if (!ownerName && result.application) {
        ownerName = typeof result.application === 'string' ? result.application.trim() : null;
        if (!ownerName && result.application.name) {
          ownerName = typeof result.application.name === 'string' ? result.application.name.trim() : null;
        }
        logInfo('ActiveWindow', `Found app name in application field: ${ownerName}`);
      }
      if (!ownerName && result.app) {
        ownerName = typeof result.app === 'string' ? result.app.trim() : null;
        logInfo('ActiveWindow', `Found app name in app field: ${ownerName}`);
      }
      
      // Try windowTitle, window, etc.
      if (!windowTitle && result.windowTitle) {
        windowTitle = typeof result.windowTitle === 'string' ? result.windowTitle.trim() : null;
      }
      if (!windowTitle && result.window && result.window.title) {
        windowTitle = typeof result.window.title === 'string' ? result.window.title.trim() : null;
      }
      
      // If still no owner name, try AppleScript as fallback
      if (!ownerName) {
        try {
          logInfo('ActiveWindow', 'active-win returned no owner name, trying AppleScript fallback...');
          const appleScriptResult = await getActiveAppNameAppleScript();
          if (appleScriptResult) {
            ownerName = appleScriptResult;
            logInfo('ActiveWindow', `✅ Got app name from AppleScript fallback: ${ownerName}`);
          }
        } catch (appleScriptError) {
          logWarn('ActiveWindow', 'AppleScript fallback also failed:', appleScriptError.message);
        }
      }
    }
    
    // On Windows, convert executable names to friendly names
    if (process.platform === 'win32') {
      // Try to get friendly name from process name or owner name
      if (processName) {
        const friendlyFromProcess = getFriendlyAppName(processName);
        if (friendlyFromProcess) {
          ownerName = friendlyFromProcess;
          logInfo('ActiveWindow', `Converted process name "${processName}" to friendly name: "${ownerName}"`);
        }
      }
      if (ownerName && ownerName.endsWith('.exe')) {
        const friendlyFromOwner = getFriendlyAppName(ownerName);
        if (friendlyFromOwner) {
          logInfo('ActiveWindow', `Converted owner name "${ownerName}" to friendly name: "${friendlyFromOwner}"`);
          ownerName = friendlyFromOwner;
        }
      }
    }
    
    // Debug logging
    logInfo('ActiveWindow', `Platform: ${process.platform}, Owner: ${ownerName || 'null'}, Process: ${processName || 'null'}, Title: ${windowTitle || 'null'}, Our App: ${appName}`);
    
    // Filter out the app's own name (exact match)
    // But keep window titles even if they match - they might be useful context
    if (ownerName && ownerName.toLowerCase() === appNameLower) {
      logInfo('ActiveWindow', `Filtered out owner name (matches our app): ${ownerName}`);
      ownerName = null;
    }
    // Don't filter window title if it matches app name - it might still be useful
    // Only filter if it's clearly our own app window
    if (windowTitle && windowTitle.toLowerCase() === appNameLower) {
      // Check if this is likely our own app window (e.g., "Time Tracker" window)
      // But allow it if it's something like "Chrome - Time Tracker" (a website)
      if (ownerName && ownerName.toLowerCase() === appNameLower) {
        logInfo('ActiveWindow', `Filtered out window title (matches our app and owner): ${windowTitle}`);
        windowTitle = null;
      } else {
        logInfo('ActiveWindow', `Keeping window title even though it matches app name (might be useful): ${windowTitle}`);
      }
    }
    
    // Also filter out common variations (but be less aggressive)
    // Only filter owner name, never filter window titles - they're always useful context
    const appNameVariations = [
      'time tracker',
      'supagigs time tracker',
      'electron',
      appNameLower
    ];
    
    if (ownerName) {
      const ownerNameLower = ownerName.toLowerCase();
      // Only filter if it's an exact match or clearly our app
      if (appNameVariations.some(variation => ownerNameLower === variation || ownerNameLower.includes('time tracker'))) {
        logInfo('ActiveWindow', `Filtered out owner name (variation match): ${ownerName}`);
        ownerName = null;
      }
    }
    
    // Never filter window titles - they provide valuable context even if they contain app name
    // Window titles like "Chrome - Time Tracker" or "VS Code - project-name" are always useful
    
    // Combine app name with window/tab title for more context
    // Format: "App Name - Window Title" or just "App Name" if no title
    let combinedAppName = null;
    
    if (ownerName && windowTitle) {
      // Both app name and window title available
      const ownerNameLower = ownerName.toLowerCase().trim();
      const windowTitleLower = windowTitle.toLowerCase().trim();
      
      // Only filter out truly redundant/generic titles
      // Be very permissive - we want to show tab titles, project names, file names, etc.
      const trulyRedundantTitles = [
        'new tab',
        'untitled',
        'about:blank'
      ];
      
      // Check if title is exactly one of the redundant titles
      const isTrulyRedundant = trulyRedundantTitles.includes(windowTitleLower);
      
      // Only exclude if title is exactly the app name (not if it contains it)
      // This allows titles like "Chrome DevTools" or "VS Code Settings" to show
      const isExactAppName = windowTitleLower === ownerNameLower;
      
      // Always combine if title exists and is not redundant
      // This ensures we get tab titles, project names, file names, etc.
      if (!isTrulyRedundant && !isExactAppName && windowTitle.length > 0) {
        // Limit title length to avoid very long combined names
        const maxTitleLength = 70;
        const truncatedTitle = windowTitle.length > maxTitleLength 
          ? windowTitle.substring(0, maxTitleLength) + '...'
          : windowTitle;
        combinedAppName = `${ownerName} - ${truncatedTitle}`;
        logInfo('ActiveWindow', `✅ Combined: "${ownerName}" + "${windowTitle}" = "${combinedAppName}"`);
      } else {
        combinedAppName = ownerName;
        if (isTrulyRedundant) {
          logInfo('ActiveWindow', `Title filtered as redundant: "${windowTitle}", using app name only`);
        } else if (isExactAppName) {
          logInfo('ActiveWindow', `Title is exact app name: "${windowTitle}", using app name only`);
        }
      }
    } else if (ownerName) {
      // Only app name available
      combinedAppName = ownerName;
    } else if (windowTitle) {
      // Only window title available (fallback)
      // Limit length for standalone titles too
      const maxTitleLength = 80;
      combinedAppName = windowTitle.length > maxTitleLength 
        ? windowTitle.substring(0, maxTitleLength) + '...'
        : windowTitle;
    }
    
    if (combinedAppName) {
      logInfo('ActiveWindow', `✅ Detected: App="${ownerName || 'null'}", Title="${windowTitle || 'null'}", Combined="${combinedAppName}"`);
    } else {
      logWarn('ActiveWindow', '⚠️ No app name detected after filtering');
      if (process.platform === 'darwin') {
        logWarn('ActiveWindow', 'On macOS, this might be due to:');
        logWarn('ActiveWindow', '1. Missing Accessibility permissions (required for active-win)');
        logWarn('ActiveWindow', '2. active-win module not working correctly');
        logWarn('ActiveWindow', '3. App window is focused (filtered out)');
        logWarn('ActiveWindow', 'Check System Settings → Privacy & Security → Accessibility');
      }
    }
    
    return combinedAppName;
  } catch (error) {
    logError('ActiveWindow', 'Unable to resolve active window:', error);
    logError('ActiveWindow', 'Error stack:', error.stack);
    
    // On macOS, provide helpful error message about permissions
    if (process.platform === 'darwin') {
      logError('ActiveWindow', 'macOS requires Accessibility permissions for active-win to work.');
      logError('ActiveWindow', 'Please grant permission in System Settings → Privacy & Security → Accessibility');
      // Show dialog once to guide user (throttle to avoid spam)
      if (!global.__accessibilityDialogShown) {
        global.__accessibilityDialogShown = true;
        setTimeout(() => {
          showAccessibilityPermissionDialog();
          // Reset after 5 minutes so it can show again if needed
          setTimeout(() => {
            global.__accessibilityDialogShown = false;
          }, 5 * 60 * 1000);
        }, 2000);
      }
    }
    
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

// Fallback compression using canvas (when sharp is not available)
async function compressToJpegBufferFallback(dataUrl, targetSizeKB = 50) {
  const base64 = dataUrl.split(',')[1];
  const inputBuffer = Buffer.from(base64, 'base64');
  const UPLOAD_WIDTH = 800;
  const TARGET_SIZE_BYTES = targetSizeKB * 1024;
  
  // Try to use canvas for compression
  let canvas = null;
  try {
    const { createCanvas, loadImage } = require('canvas');
    canvas = { createCanvas, loadImage };
  } catch (canvasError) {
    logWarn('Compress', 'Canvas module not available:', canvasError.message);
    // Last resort: return original buffer
    logWarn('Compress', 'Using original image buffer without compression (no compression libraries available)');
    return inputBuffer;
  }
  
  try {
    // Load image from buffer
    const img = await canvas.loadImage(inputBuffer);
    
    // Calculate dimensions maintaining aspect ratio
    let width = img.width;
    let height = img.height;
    if (width > UPLOAD_WIDTH) {
      height = Math.floor((height * UPLOAD_WIDTH) / width);
      width = UPLOAD_WIDTH;
    }
    
    // Create canvas and draw resized image
    const canvasInstance = canvas.createCanvas(width, height);
    const ctx = canvasInstance.getContext('2d');
    ctx.drawImage(img, 0, 0, width, height);
    
    // Convert to JPEG buffer with quality adjustment
    let quality = 0.7;
    let jpegBuffer = canvasInstance.toBuffer('image/jpeg', { quality });
    
    // Reduce quality if still too large
    let attempts = 0;
    while (jpegBuffer.length > TARGET_SIZE_BYTES && attempts < 5 && quality > 0.3) {
      attempts++;
      quality -= 0.1;
      jpegBuffer = canvasInstance.toBuffer('image/jpeg', { quality });
    }
    
    logInfo('Compress', `JPEG size (canvas fallback): ${(jpegBuffer.length / 1024).toFixed(2)} KB`);
    return jpegBuffer;
  } catch (error) {
    logError('Compress', 'Canvas fallback compression failed:', error.message);
    // Last resort: return original buffer (will be larger but at least it works)
    logWarn('Compress', 'Using original image buffer without compression');
    return inputBuffer;
  }
}

async function compressToJpegBufferFromDataUrl(dataUrl, targetSizeKB = 50) {
  const base64 = dataUrl.split(',')[1];
  const inputBuffer = Buffer.from(base64, 'base64');
  const UPLOAD_WIDTH = 800;
  const JPEG_QUALITY = 70;
  const TARGET_SIZE_BYTES = targetSizeKB * 1024;
  
  // Try to use sharp, fall back to canvas if it fails
  let sharp = null;
  try {
    sharp = require('sharp');
    // Test if sharp is actually working
    await sharp(inputBuffer).metadata();
  } catch (sharpError) {
    logWarn('Compress', 'Sharp module not available or failed to load:', sharpError.message);
    logWarn('Compress', 'Falling back to canvas-based compression');
    return await compressToJpegBufferFallback(dataUrl, targetSizeKB);
  }
  
  try {
    let quality = JPEG_QUALITY;
    let jpegBuffer = await sharp(inputBuffer)
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
      
      jpegBuffer = await sharp(inputBuffer)
        .resize(UPLOAD_WIDTH, null, { withoutEnlargement: true, fit: 'inside' })
        .jpeg({ quality: quality, mozjpeg: true })
        .toBuffer();
    }
    
    logInfo('Compress', `JPEG size: ${(jpegBuffer.length / 1024).toFixed(2)} KB`);
    return jpegBuffer;
  } catch (error) {
    logError('Compress', 'Sharp compression failed:', error.message);
    logWarn('Compress', 'Falling back to canvas-based compression');
    return await compressToJpegBufferFallback(dataUrl, targetSizeKB);
  }
}


function showToastNotification(filePath, base64Data) {
  if (toastWin) {
    toastWin.close();
    toastWin = null;
  }
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

  const { workArea } = screen.getPrimaryDisplay();
  const x = workArea.x + workArea.width - TOAST_WIDTH - 20;
  const y = workArea.y + workArea.height - TOAST_HEIGHT - 20;
  toastWin.setPosition(x, y);

  toastWin.loadFile(path.join(__dirname, 'toast.html'));

  toastWin.once('ready-to-show', () => {
    // Check if window still exists (might have been closed)
    if (!toastWin || toastWin.isDestroyed()) {
      return;
    }
    toastWin.showInactive();
    if (toastWin.webContents && !toastWin.webContents.isDestroyed()) {
      toastWin.webContents.send('toast-init', { filePath, base64Data });
    }
  });

  setTimeout(() => { if (toastWin && !toastWin.isDestroyed()) toastWin.close(); }, 9000);
  toastWin.on('closed', () => { toastWin = null; });
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
  const { userEmail, sessionId, screenshotData, timestamp, isIdle, contextLabel, screenIndex, screenName } = uploadData;
  
  try {
    // Capture app name NOW (when screenshot is taken), not later when batch is processed
    // This ensures each screenshot gets the correct app name for when it was actually captured
    const appName = await getActiveAppName() || 'Unknown';
    logInfo(contextLabel, `Captured app name at screenshot time: ${appName}`);
    
    // Compress and save locally
    let jpegBuffer;
    try {
      jpegBuffer = await compressToJpegBufferFromDataUrl(screenshotData);
    } catch (compressError) {
      logError(contextLabel, 'Compression failed:', compressError.message);
      // Try fallback compression
      try {
        jpegBuffer = await compressToJpegBufferFallback(screenshotData);
        logWarn(contextLabel, 'Using fallback compression method');
      } catch (fallbackError) {
        logError(contextLabel, 'Fallback compression also failed:', fallbackError.message);
        // Last resort: use original PNG data
        const base64 = screenshotData.split(',')[1];
        jpegBuffer = Buffer.from(base64, 'base64');
        logWarn(contextLabel, 'Using original image without compression (may be larger)');
      }
    }
    
    const screenSuffix = screenIndex ? `_screen${screenIndex}` : '';
    const jpegFilename = `${userEmail.replace(/@/g, '_at_').replace(/\./g, '_')}_${sessionId}_${timestamp.replace(/[:.]/g, '-')}${screenSuffix}.jpg`;
    
    const screenshotsDir = resolveScreenshotsDir(true);
    const filePath = path.join(screenshotsDir, jpegFilename);
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
      filePath,
      jpegBuffer,
      jpegFilename,
      appName, // Store the app name captured at screenshot time
      addedAt: Date.now()
    };
    
    screenshotBatchQueue.push(batchItem);
    pendingScreenshots.set(filePath, false);
    
    logInfo(contextLabel, `Screenshot queued (${screenshotBatchQueue.length}/${SCREENSHOT_BATCH_SIZE}): ${filePath}`);
    
    // Show toast notification for the screenshot
    showToastNotification(filePath, screenshotData);
    
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
  
  const supabase = getSupabaseClient();
  if (!supabase) {
    logError('BATCH-UPLOAD', 'Supabase client unavailable, re-queuing batch');
    screenshotBatchQueue.unshift(...batchToUpload); // Re-add to front of queue
    isBatchUploading = false;
    return;
  }
  
  const uploadResults = [];
  const filesToDelete = [];
  
  try {
    // Upload all screenshots in parallel
    const uploadPromises = batchToUpload.map(async (item) => {
      try {
        // Check if cancelled
        if (isCancelled(item.filePath)) {
          logInfo(item.contextLabel, 'Screenshot cancelled, skipping upload');
          pendingScreenshots.delete(item.filePath);
          if (fs.existsSync(item.filePath)) {
            fs.unlinkSync(item.filePath);
          }
          return { ok: false, error: 'Cancelled', filePath: item.filePath };
        }
        
        const storagePath = `${item.userEmail}/${item.sessionId}/${item.jpegFilename}`;
        
        // Upload to Supabase Storage
        const { error: storageError } = await supabase.storage
          .from(STORAGE_BUCKET)
          .upload(storagePath, item.jpegBuffer, { contentType: 'image/jpeg', upsert: true });
        
        if (storageError) {
          logError(item.contextLabel, `Storage upload failed: ${storageError.message}`);
          return { ok: false, error: storageError.message, filePath: item.filePath, item };
        }
        
        // Get public URL
        const publicUrlRes = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);
        const publicUrl = publicUrlRes?.data?.publicUrl ?? null;
        if (!publicUrl) {
          throw new Error('Unable to get storage public URL');
        }
        
        // Insert into database
        // Use the app name that was captured when the screenshot was taken (stored in batch item)
        // This ensures each screenshot gets the correct app name for when it was actually captured
        const appName = item.appName || 'Unknown';
        logInfo(item.contextLabel, `Using app name from screenshot time: ${appName}`);
        await insertScreenshotToDatabase(supabase, item.userEmail, item.sessionId, publicUrl, item.timestamp, appName, item.isIdle);
        
        // Broadcast screenshot captured event
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
    
    // Delete successfully uploaded files
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
    logInfo('BATCH-UPLOAD', `Batch complete: ${successCount}/${batchToUpload.length} uploaded, ${deletedCount} files deleted`);
    
  } catch (error) {
    logError('BATCH-UPLOAD', `Batch processing error: ${error.message}`, error);
    // Re-queue all items on critical error
    screenshotBatchQueue.unshift(...batchToUpload);
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
    // Step 1: Mark as cancelled in pending map
    if (pendingScreenshots.has(filePath)) {
      pendingScreenshots.set(filePath, true);
      logInfo('DELETE', 'Marked as cancelled in pending map');
    }

    // Step 2: Delete from local disk
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      logInfo('DELETE', `File deleted successfully from disk: ${filePath}`);
      pendingScreenshots.delete(filePath);
    } else {
      logWarn('DELETE', `File does not exist on disk: ${filePath}`);
    }

    // Step 3: Extract filename from path
    const filename = path.basename(filePath);
    logInfo('DELETE', `Extracted filename: ${filename}`);

    // Step 4: Get Supabase client
    const supabase = getSupabaseClient();
    if (!supabase) {
      throw new Error('Supabase client unavailable');
    }

    // Step 5: Query database - FASTER METHOD (no ilike timeout)
    // Get recent screenshots and filter in-memory
    logInfo('DELETE', `Querying database for screenshot with filename: ${filename}`);
    
    const { data: screenshots, error: queryError } = await supabase
      .from('screenshots')
      .select('id, screenshot_data, user_email, session_id')
      .order('captured_at', { ascending: false })
      .limit(100);  // Get recent records

    if (queryError) {
      logError('DELETE', `Error querying database: ${queryError.message}`, queryError);
      throw queryError;
    }

    // Find matching screenshot in-memory (much faster than database ILIKE)
    const screenshot = screenshots?.find(s => 
      s.screenshot_data && s.screenshot_data.includes(filename)
    );

    if (!screenshot) {
      logWarn('DELETE', `No database record found for: ${filename}`);
      // Continue anyway - file is already deleted from disk
    } else {
      logInfo('DELETE', `Found database record ID: ${screenshot.id}`);

      // Step 6: Delete from S3 storage
      if (screenshot.screenshot_data) {
        try {
          const urlParts = screenshot.screenshot_data.split('/');
          const bucketIndex = urlParts.indexOf(STORAGE_BUCKET);
          
          if (bucketIndex !== -1 && bucketIndex < urlParts.length - 1) {
            const storagePath = urlParts.slice(bucketIndex + 1).join('/');
            logInfo('DELETE', `Attempting to delete from S3: ${storagePath}`);
            
            const { error: storageError } = await supabase.storage
              .from(STORAGE_BUCKET)
              .remove([storagePath]);

            if (storageError) {
              logWarn('DELETE', `Error deleting from storage: ${storageError.message}`);
            } else {
              logInfo('DELETE', `Deleted from S3 storage: ${storagePath}`);
            }
          }
        } catch (e) {
          logError('DELETE', `Error parsing storage path: ${e.message}`, e);
        }
      }

      // Step 7: DELETE DATABASE RECORD
      const { error: deleteError } = await supabase
        .from('screenshots')
        .delete()
        .eq('id', screenshot.id);

      if (deleteError) {
        logError('DELETE', `Error deleting from database: ${deleteError.message}`, deleteError);
        throw deleteError;
      }

      logInfo('DELETE', `Deleted database record ID: ${screenshot.id}`);
    }

    // Step 8: Broadcast deletion event to main window so UI refreshes
    BrowserWindow.getAllWindows().forEach((window) => {
      if (window !== toastWin && !window.isDestroyed()) {
        window.webContents.send('screenshot-deleted', { filePath, filename });
      }
    });
    logInfo('DELETE', 'Broadcasted screenshot-deleted event to main window');

    // Step 9: Close toast window
    if (toastWin && !toastWin.isDestroyed()) {
      toastWin.close();
      toastWin = null;
    }

    return { 
      success: true, 
      message: 'Screenshot deleted from disk, storage, and database',
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

ipcMain.handle('queue-screenshot-upload', async (event, { userEmail, sessionId, screenshotData, timestamp, isIdle }) => {
  return handleScreenshotUpload({
    userEmail,
    sessionId,
    screenshotData,
    timestamp,
    isIdle,
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
        
        // On macOS, check permissions before attempting capture
        if (process.platform === 'darwin') {
          const permissionCheck = await checkScreenRecordingPermission();
          if (!permissionCheck.granted) {
            logWarn('BG-UPLOAD', '⚠️ Screen recording permission not granted - cannot capture screenshots');
            logWarn('BG-UPLOAD', `   Error: ${permissionCheck.error || 'Permission denied'}`);
            
            // Show permission dialog (but only once per session to avoid spam)
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('screenshot-permission-denied', {
                message: 'Screen recording permission is required to capture screenshots. Please grant permission in System Settings.',
                timestamp: Date.now()
              });
            }
            
            // Don't show dialog on every failed attempt - only log
            // User can manually check permissions via System Settings
            scheduleNextScreenshot();
            return;
          }
        }
        
        const sources = await desktopCapturer.getSources({
          types: ['screen'],
          thumbnailSize: { width: maxWidth, height: maxHeight },
          fetchWindowIcons: false
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
    // On macOS, check permissions before attempting capture
    if (process.platform === 'darwin') {
      const permissionCheck = await checkScreenRecordingPermission();
      if (!permissionCheck.granted) {
        logWarn('IPC', '[capture-screen] ⚠️ Screen recording permission not granted');
        return null;
      }
    }
    
    const { width, height } = screen.getPrimaryDisplay().size;
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width, height },
      fetchWindowIcons: false
    });
    if (!sources || sources.length === 0) return null;
    return sources[0].thumbnail.toDataURL('image/png');
  } catch (e) {
    logError('IPC', 'capture-screen failed', e);
    return null;
  }
});

// capture-all-screens (returns array of screenshots from all displays)
// Returns: { screenshots: array, error: string|null, permissionGranted: boolean }
ipcMain.handle('capture-all-screens', async () => {
  try {
    const displays = screen.getAllDisplays();
    const screenshots = [];
    
    logInfo('IPC', `[capture-all-screens] Detected ${displays.length} display(s)`);
    displays.forEach((display, idx) => {
      logInfo('IPC', `[capture-all-screens] Display ${idx + 1}: ${display.size.width}x${display.size.height}`);
    });
    
    let permissionGranted = true;
    let permissionCheckSources = null;
    
    // On macOS, check permissions before attempting capture
    // Note: We'll still try to capture even if permission check fails, as sometimes
    // the check can fail even when permissions are actually granted
    if (process.platform === 'darwin') {
      const permissionCheck = await checkScreenRecordingPermission();
      permissionGranted = permissionCheck.granted;
      permissionCheckSources = permissionCheck.sources; // Save sources from permission check
      
      if (!permissionCheck.granted) {
        logWarn('IPC', '[capture-all-screens] ⚠️ Permission check failed, but will attempt capture anyway');
        logWarn('IPC', `[capture-all-screens] Permission check error: ${permissionCheck.error || 'Unknown'}`);
        logWarn('IPC', '[capture-all-screens] Note: Sometimes getSources() works even if permission check fails');
        // Don't return early - try to capture anyway as a workaround
      } else {
        logInfo('IPC', `[capture-all-screens] ✅ Permission check passed (found ${permissionCheckSources?.length || 0} source(s) during check)`);
      }
    }
    
    // Get all screen sources
    const allDisplays = screen.getAllDisplays();
    const maxWidth = Math.max(...allDisplays.map(d => d.size.width));
    const maxHeight = Math.max(...allDisplays.map(d => d.size.height));
    
    logInfo('IPC', `[capture-all-screens] Requesting sources with thumbnail size: ${maxWidth}x${maxHeight}`);
    logInfo('IPC', `[capture-all-screens] App path: ${app.getAppPath()}`);
    logInfo('IPC', `[capture-all-screens] App name: ${app.getName()}`);
    logInfo('IPC', `[capture-all-screens] Is packaged: ${app.isPackaged}`);
    
    // Try with full size first
    let sources = null;
    let lastError = null;
    
    // On macOS, if we got sources from permission check, try using those first (but with proper size)
    if (process.platform === 'darwin' && permissionCheckSources && permissionCheckSources.length > 0) {
      logInfo('IPC', '[capture-all-screens] Attempting to use sources from permission check, but requesting full-size thumbnails...');
    }
    
    // Try multiple approaches to get sources
    const approaches = [
      { width: maxWidth, height: maxHeight, name: 'full size' },
      { width: 2560, height: 1440, name: '2560x1440' },
      { width: 1920, height: 1080, name: '1920x1080' },
      { width: 1280, height: 720, name: '1280x720' },
      { width: 640, height: 480, name: '640x480' }
    ];
    
    let captureSuccess = false;
    for (const approach of approaches) {
      try {
        logInfo('IPC', `[capture-all-screens] Trying approach: ${approach.name} (${approach.width}x${approach.height})...`);
        sources = await desktopCapturer.getSources({
          types: ['screen'],
          thumbnailSize: { width: approach.width, height: approach.height },
          fetchWindowIcons: false
        });
        
        if (sources && sources.length > 0) {
          logInfo('IPC', `[capture-all-screens] ✅ Successfully got ${sources.length} source(s) with ${approach.name}`);
          captureSuccess = true;
          break;
        } else {
          logWarn('IPC', `[capture-all-screens] Got empty array with ${approach.name}, trying next approach...`);
        }
      } catch (getSourcesError) {
        const errorMsg = getSourcesError?.message || getSourcesError?.toString() || 'Unknown error';
        lastError = getSourcesError;
        logWarn('IPC', `[capture-all-screens] ${approach.name} failed:`, errorMsg);
        logWarn('IPC', `[capture-all-screens] Error details:`, JSON.stringify(getSourcesError, Object.getOwnPropertyNames(getSourcesError)));
        continue;
      }
    }
    
    if (!captureSuccess) {
      const errorMsg = lastError?.message || lastError?.toString() || 'All capture attempts failed';
      logError('IPC', '[capture-all-screens] ❌ All capture approaches failed');
      logError('IPC', `[capture-all-screens] Last error: ${errorMsg}`);
      
      // Provide helpful troubleshooting info
      let errorMessage = `Failed to capture screens after trying ${approaches.length} different approaches. `;
      errorMessage += `Last error: ${errorMsg}. `;
      errorMessage += `Please verify:\n`;
      errorMessage += `1. Screen recording permission is enabled in System Settings → Privacy & Security → Screen Recording\n`;
      errorMessage += `2. The app is listed and enabled in the Screen Recording list\n`;
      errorMessage += `3. You have restarted the app after granting permission\n`;
      errorMessage += `4. The app bundle identifier matches (dev vs packaged apps have different identifiers)`;
      
      return {
        screenshots: [],
        error: errorMessage,
        permissionGranted
      };
    }
    
    logInfo('IPC', `[capture-all-screens] Received ${sources?.length || 0} source(s) from desktopCapturer`);
    
    if (sources && sources.length > 0) {
      sources.forEach((source, idx) => {
        logInfo('IPC', `[capture-all-screens] Source ${idx + 1}: id="${source.id}", name="${source.name}"`);
      });
    } else {
      logWarn('IPC', '[capture-all-screens] ⚠️ No screen sources found! Check macOS screen recording permissions.');
      return {
        screenshots: [],
        error: 'No screen sources returned. This usually means screen recording permission is not granted. Please check System Settings → Privacy & Security → Screen Recording and ensure the app is enabled.',
        permissionGranted
      };
    }
    
    // Map each source to a screenshot object with dataURL and name
    for (const source of sources) {
      try {
        screenshots.push({
          dataURL: source.thumbnail.toDataURL('image/png'),
          name: source.name || `Screen ${screenshots.length + 1}`
        });
      } catch (thumbnailError) {
        logError('IPC', `[capture-all-screens] Error converting thumbnail for source ${source.id}:`, thumbnailError);
      }
    }
    
    if (screenshots.length === 0) {
      return {
        screenshots: [],
        error: 'Failed to convert screen thumbnails to images. Please try restarting the app.',
        permissionGranted
      };
    }
    
    logInfo('IPC', `✅ Captured ${screenshots.length} screen(s) successfully`);
    return {
      screenshots,
      error: null,
      permissionGranted
    };
  } catch (e) {
    logError('IPC', 'capture-all-screens failed with exception:', e);
    return {
      screenshots: [],
      error: `Unexpected error: ${e.message || 'Unknown error'}. Please check the console logs for details.`,
      permissionGranted: false
    };
  }
});

// Check screen recording permission (for renderer to call)
ipcMain.handle('check-screen-permission', async () => {
  if (process.platform !== 'darwin') {
    return { granted: true, message: 'Not required on this platform' };
  }
  
  // Log app information for debugging
  const appInfo = {
    name: app.getName(),
    version: app.getVersion(),
    path: app.getAppPath(),
    isPackaged: app.isPackaged,
    bundleId: app.isPackaged ? app.getName() : 'dev-mode'
  };
  
  logInfo('Permissions', 'App info for permission check:', appInfo);
  
  const result = await checkScreenRecordingPermission();
  
  const response = {
    granted: result.granted,
    error: result.error,
    sourceCount: result.sources?.length || 0,
    appInfo: appInfo,
    message: result.granted 
      ? `Permission granted - ${result.sources?.length || 0} screen(s) available`
      : `Permission denied: ${result.error || 'Please grant permission in System Settings → Privacy & Security → Screen Recording'}`
  };
  
  // Add troubleshooting info if permission denied
  if (!result.granted) {
    response.troubleshooting = {
      appName: appInfo.name,
      isPackaged: appInfo.isPackaged,
      note: appInfo.isPackaged 
        ? 'Make sure the packaged app (not dev version) is enabled in Screen Recording settings'
        : 'Make sure the dev version is enabled in Screen Recording settings. Note: Dev and packaged apps have different identifiers.'
    };
  }
  
  return response;
});

// Diagnostic handler to check screen capture capabilities
ipcMain.handle('diagnose-screen-capture', async () => {
  const diagnostics = {
    platform: process.platform,
    displays: [],
    sources: [],
    permissions: 'unknown',
    permissionDetails: null,
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
    
    // On macOS, use the improved permission check
    if (process.platform === 'darwin') {
      const permissionResult = await checkScreenRecordingPermission();
      diagnostics.permissionDetails = {
        granted: permissionResult.granted,
        error: permissionResult.error,
        sourceCount: permissionResult.sources?.length || 0
      };
      
      if (!permissionResult.granted) {
        diagnostics.permissions = 'denied';
        diagnostics.sources = [];
        return diagnostics;
      } else {
        diagnostics.permissions = permissionResult.sources.length < displays.length ? 'partial' : 'granted';
        // Use sources from permission check if available
        if (permissionResult.sources && permissionResult.sources.length > 0) {
          diagnostics.sources = permissionResult.sources.map((source, idx) => ({
            index: idx + 1,
            id: source.id,
            name: source.name,
            thumbnailSize: source.thumbnail?.getSize()
          }));
          return diagnostics;
        }
      }
    } else {
      diagnostics.permissions = 'not_applicable';
    }
    
    // Try to get screen sources (fallback for non-macOS or if permission check didn't return sources)
    const maxWidth = Math.max(...displays.map(d => d.size.width));
    const maxHeight = Math.max(...displays.map(d => d.size.height));
    
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: maxWidth, height: maxHeight },
      fetchWindowIcons: false
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
