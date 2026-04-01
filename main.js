require('dotenv').config();
const { app, BrowserWindow, ipcMain, desktopCapturer, powerMonitor, powerSaveBlocker, Notification, screen, dialog, shell, systemPreferences, session } = require('electron');
const {autoUpdater} = require('electron-updater');

const log1 = require('electron-log');

if (!app.requestSingleInstanceLock()) app.quit();

autoUpdater.logger = log1;
autoUpdater.logger.transports.file.level = 'info';

/*autoUpdater.on('update-available', (info) => {
  logInfo('AutoUpdater', 'Update available:', info);
});

autoUpdater.on('update-downloaded', (info) => {
  logInfo('AutoUpdater', 'Update downloaded:', info);
});
*/

// ================= SAFE AUTO UPDATER SETUP =================
let updateDownloadedButDeferred = false;
let updateInfoCache = null;
let updateDialogVisible = false;
let lastPowerEventTime = 0;
const POWER_EVENT_COOLDOWN_MS = 3000; // 3-second cooldown

autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = false;

// HARD FAILSAFE: never auto-install silently
autoUpdater.on('error', (err) => {
  logError('Updater', 'AutoUpdater error:', err?.message || err);
  updateDownloadedButDeferred = false;
  updateInfoCache = null;
});


// Helper function to prevent OS event spam
// function canProcessPowerEvent(eventName) {
//   const now = Date.now();
//   if (now - lastPowerEventTime < POWER_EVENT_COOLDOWN_MS) {
//     logInfo('PowerMonitor', `Ignored ${eventName} - too close to previous event.`);
//     return false;
//   }
//   lastPowerEventTime = now;
//   return true;
// }

// // Update your powerMonitor listeners to use the check:
// powerMonitor.on('suspend', () => {
//   if (!canProcessPowerEvent('suspend')) return;
//   logInfo('PowerMonitor', 'System suspended');
//   if (mainWindow) mainWindow.webContents.send('lock-suspend-clock-out');
// });

// powerMonitor.on('lock-screen', () => {
//   if (!canProcessPowerEvent('lock-screen')) return;
//   logInfo('PowerMonitor', 'Screen locked');
//   if (mainWindow) mainWindow.webContents.send('lock-suspend-clock-out');
// });

// powerMonitor.on('resume', () => {
//   if (!canProcessPowerEvent('resume')) return;
//   logInfo('PowerMonitor', 'System resumed');
//   if (mainWindow) mainWindow.webContents.send('unlock-resume-clock-in');
// });

// powerMonitor.on('unlock-screen', () => {
//   if (!canProcessPowerEvent('unlock-screen')) return;
//   logInfo('PowerMonitor', 'Screen unlocked');
//   if (mainWindow) mainWindow.webContents.send('unlock-resume-clock-in');
// });

// Capture all screens once and queue uploads + per-screen toasts
async function backgroundCaptureScreenshots() {
  try {
    logInfo('BG-UPLOAD', '===========================================================');
    logInfo('BG-UPLOAD', 'Starting background screenshot capture');
    
    const allDisplays = screen.getAllDisplays();
    if (!allDisplays || allDisplays.length === 0) {
      logWarn('BG-UPLOAD', 'No displays detected for background capture');
      return;
    }

    sendToRendererConsole("=== DISPLAYS ===");
    allDisplays.forEach((d, i) => {
      sendToRendererConsole(`Display ${i}: id=${d.id}, bounds=`, d.bounds);
    });

    logInfo('BG-UPLOAD', `Detected ${allDisplays.length} display(s):`);
    allDisplays.forEach((display, idx) => {
      logInfo('BG-UPLOAD', `  Display ${idx + 1}: ID=${display.id}, Name="${display.name || 'Unknown'}", Size=${display.size.width}x${display.size.height}, Bounds=(${display.bounds.x}, ${display.bounds.y}, ${display.bounds.width}, ${display.bounds.height}), Scale=${display.scaleFactor}`);
    });

    const maxDimension = Math.max(...allDisplays.map(d => Math.max(d.size.width, d.size.height)));

    let sources;
    try {
      logInfo('BG-UPLOAD', `Requesting desktopCapturer sources with thumbnailSize: ${maxDimension}x${maxDimension}`);
      const captureStartTime = Date.now();
      sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: maxDimension, height: maxDimension }
      });
      const captureDuration = Date.now() - captureStartTime;
      //logInfo('BG-UPLOAD', `desktopCapturer.getSources() completed in ${captureDuration}ms, returned ${sources?.length || 0} source(s)`);
    } catch (e) {
      logError('BG-UPLOAD', 'desktopCapturer.getSources failed:', e);
      return;
    }

    if (!sources || sources.length === 0) {
      logWarn('BG-UPLOAD', 'No sources returned by desktopCapturer (permissions likely denied).');
      return;
    }

    sendToRendererConsole("=== SOURCES ===");
    sources.forEach((src, i) => {
      sendToRendererConsole(`Source ${i}: id=${src.id}, display_id=${src.display_id}, name=${src.name}`);
    });

    logInfo('BG-UPLOAD', `Received ${sources.length} source(s) from desktopCapturer:`);
    sources.forEach((source, idx) => {
      logInfo('BG-UPLOAD', `  Source ${idx + 1}: id="${source.id}", name="${source.name}", display_id="${source.display_id || 'N/A'}"`);
    });

    const displayLookup = new Map();
    allDisplays.forEach((display, idx) => {
      const idKey = String(display.id);
      const nameKey = (display.name || `Screen ${idx + 1}`).toLowerCase();
      displayLookup.set(idKey, {
        index: idx,
        name: display.name || `Screen ${idx + 1}`,
        nameKey,
      });
    });
    
    logInfo('BG-UPLOAD', `Created display lookup map with ${displayLookup.size} entries`);

    const resolveSourceScreenMeta = (source, fallbackIndex) => {
      let screenIndex = fallbackIndex;
      let screenName = source?.name || `Screen ${fallbackIndex}`;
      let displayId = null;
      let display = null;
      let matchMethod = 'none';

      // Try to match source to display using display_id (Electron 25+)
      const sourceDisplayId =
        (typeof source?.display_id === 'string' && source.display_id) ||
        (typeof source?.id === 'string' && source.id.includes(':') ? source.id.split(':')[1] : null);
      
      if (sourceDisplayId && displayLookup.has(sourceDisplayId)) {
        const { index, name } = displayLookup.get(sourceDisplayId);
        displayId = sourceDisplayId;
        display = allDisplays[index];
        matchMethod = 'display_id';
        sendToRendererConsole(`Matching Display ${display.id} → Source:`, source ? source.display_id : "NOT FOUND");
        logInfo('BG-UPLOAD', `  ✓ Matched source "${source.name}" to Display ${index + 1} (ID: ${displayId}) using display_id`);
        return { screenIndex: index + 1, screenName: name || screenName, displayId, display };
      } else if (sourceDisplayId) {
        logWarn('BG-UPLOAD', `  ⚠ Source "${source.name}" has display_id="${sourceDisplayId}" but no matching display found in lookup`);
      }

      // Fallback: Try matching by name
      const name = (source?.name || '').toLowerCase().trim();
      const nameMatch = name.match(/(\d+)/);
      if (nameMatch) {
        const numericIdx = parseInt(nameMatch[1], 10);
        if (!Number.isNaN(numericIdx) && allDisplays[numericIdx - 1]) {
          const mapped = allDisplays[numericIdx - 1];
          const mappedName = mapped.name || `Screen ${numericIdx}`;
          displayId = String(mapped.id);
          display = mapped;
          matchMethod = 'name';
          logInfo('BG-UPLOAD', `  ✓ Matched source "${source.name}" to Display ${numericIdx} (ID: ${displayId}) using name pattern`);
          return { screenIndex: numericIdx, screenName: mappedName, displayId, display };
        }
      }

      // Final fallback: use primary display
      if (allDisplays.length > 0) {
        display = allDisplays[0];
        displayId = String(display.id);
        matchMethod = 'fallback-primary';
        logWarn('BG-UPLOAD', `  ⚠ Could not match source "${source.name}", using primary display (ID: ${displayId}) as fallback`);
      }

      return { screenIndex, screenName, displayId, display };
    };

    const timestamp = new Date().toISOString();
    //const contextAppName = await getActiveAppName();
    const isIdle = isUserIdle;

    const uploadPromises = sources.map(async (source, index) => {
      const screenIndex = index + 1;
    
      try {
        const dataUrl = source.thumbnail.toDataURL();
    
        // Resolve display info
        const displays = screen.getAllDisplays();
        const display = displays[index];
        const displayId = display ? String(display.id) : null;
        const screenName = display
          ? `Display ${index + 1} (${display.bounds.width}x${display.bounds.height})`
          : `Screen ${screenIndex}`;
    
        // 🔥 IMPORTANT: resolve app name PER SCREEN
        let appNameForScreen = null;
    
        // Windows / Linux → true per-display resolution
        if (process.platform !== 'darwin') {
          try {
            appNameForScreen = await getAppNameForDisplay(index);
          } catch (e) {
            logWarn('BG-UPLOAD', `Per-display app detection failed for screen ${screenIndex}: ${e.message}`);
          }
        }
    
        // macOS OR fallback → global foreground app
        if (!appNameForScreen) {
          appNameForScreen = await getActiveAppName();
        }
    
        appNameForScreen ||= 'Unknown';
    
        logInfo(
          'BG-UPLOAD',
          `Screen ${screenIndex}: resolved app = "${appNameForScreen}"`
        );
    
        const uploadData = {
          userEmail: currentUserEmail,
          sessionId: currentSessionId,
          supabaseSessionId: currentSupabaseSessionId, // Numeric Supabase session ID for time_session_id column
          screenshotData: dataUrl,
          timestamp,
          isIdle,
          contextLabel: 'BG-UPLOAD',
          screenIndex,
          screenName,
          appName: appNameForScreen,
          displayId,
          frappeProjectId: currentFrappeProjectId,
          frappeTaskId: currentFrappeTaskId
        };
        
        logInfo('BG-UPLOAD', `Screen ${screenIndex}: frappe_project_id=${currentFrappeProjectId}, frappe_task_id=${currentFrappeTaskId}`);
    
        return addScreenshotToBatch(uploadData);
    
      } catch (err) {
        logError(
          'BG-UPLOAD',
          `Failed to process screenshot for screen ${screenIndex}: ${err.message}`,
          err
        );
        return null;
      }
    });
    
    await Promise.allSettled(uploadPromises);
    logInfo('BG-UPLOAD', `Completed processing ${sources.length} screen(s)`);
    logInfo('BG-UPLOAD', '===========================================================');
  } catch (error) {
    logError('BG-UPLOAD', '[backgroundCaptureScreenshots] Unexpected error:', error);
    logError('BG-UPLOAD', '===========================================================');
  }
}

const { login: frappeLogin, logout: frappeLogout, getCurrentUser: frappeGetCurrentUser, getUserCompany: frappeGetUserCompany, getUserRoleProfile: frappeGetUserRoleProfile, getUserFullName: frappeGetUserFullName, setLoggers: setFrappeAuthLoggers } = require('./frappeAuth');
const { 
  getUserProjects: frappeGetUserProjects, 
  setLoggers: setFrappeServiceLoggers, 
  createTimesheet,
  getTimesheetForProject,
  addTimeLogToTimesheet,
  getOrCreateTimesheet,
  startTimesheetSession,
  updateTimesheetRow,
  getTimesheetById,
  saveTimesheetWithSavedocs,
  getFrappeServerTime,
  getUsersAssignedToProject, 
  resolveRowForStart
} = require('./frappeService');
const path = require('path');
const fs = require('fs');
const { execSync, exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const { getMyTasksForProject } = require('./frappeService');


if (process.platform === 'win32') {
  app.setAppUserModelId("Renocrew Time Tracker");
}

const envPath = app?.isPackaged
  ? path.join(process.resourcesPath, '.env')
  : path.join(__dirname, '.env');
require('dotenv').config({ path: envPath });

// Validate Frappe configuration on startup
if (!process.env.FRAPPE_URL) {
  console.error('⚠️  WARNING: FRAPPE_URL is not set in .env file');
  console.error(`   Looking for .env at: ${envPath}`);
  console.error('   Please add FRAPPE_URL=https://your-frappe-instance.com to your .env file');
} else {
  console.log(`✓ FRAPPE_URL configured: ${process.env.FRAPPE_URL}`);
}

const resolveScreenshotsDir = (ensure = true) => {
  const baseDir = app.isPackaged
    ? path.join(app.getPath('userData'), 'screenshots')
    : path.join(__dirname, 'screenshots');
  if (ensure && !fs.existsSync(baseDir)) fs.mkdirSync(baseDir, { recursive: true });
  return baseDir;
};

// ============ FIRST LAUNCH DETECTION ============
// Check if this is the first launch after installation
function isFirstLaunch() {
  const firstLaunchFlagPath = path.join(app.getPath('userData'), '.first-launch-completed');
  return !fs.existsSync(firstLaunchFlagPath);
}

// Mark first launch as completed
function markFirstLaunchCompleted() {
  try {
    const firstLaunchFlagPath = path.join(app.getPath('userData'), '.first-launch-completed');
    const userDataDir = app.getPath('userData');
    
    // Ensure userData directory exists
    if (!fs.existsSync(userDataDir)) {
      fs.mkdirSync(userDataDir, { recursive: true });
    }
    
    // Create the flag file
    fs.writeFileSync(firstLaunchFlagPath, JSON.stringify({
      completed: true,
      timestamp: new Date().toISOString(),
      appVersion: app.getVersion()
    }), 'utf8');
    
    logInfo('FirstLaunch', 'First launch flag file created');
  } catch (error) {
    logWarn('FirstLaunch', `Failed to mark first launch as completed: ${error?.message || error}`);
  }
}

// ============ LOGGING HELPER ============
// Helper function to send console logs to renderer process (for DevTools)
function sendToRendererConsole(...args) {
  // Send to all renderer windows
  BrowserWindow.getAllWindows().forEach((win) => {
    if (win && !win.isDestroyed() && win.webContents) {
      try {
        // Send as array so we can spread it in renderer
        win.webContents.send('main-console-log', args);
      } catch (e) {
        // Ignore errors if window is closing
      }
    }
  });
  // Also log to main process console
  // console.log(...args);
}

function log(level, context, message, ...args) {
  const ts = new Date().toISOString();
  const lvl = level.toUpperCase();
  const logMessage = `[${ts}] [${lvl}] [${context}] ${message}`;
  // Log to main process console
  // console.log(logMessage, ...args);
  // Also send to renderer console (DevTools)
  sendToRendererConsole(logMessage, ...args);
}
function logInfo(context, message, ...args) { log('info', context, message, ...args); }
function logWarn(context, message, ...args) { log('warn', context, message, ...args); }
function logError(context, message, ...args) { log('error', context, message, ...args); }

// Set up logging for Frappe modules (after log functions are defined)
setFrappeAuthLoggers({ logInfo, logError, logWarn });
setFrappeServiceLoggers({ logInfo, logError, logWarn });

// ============ macOS PERMISSIONS HELPER ============
// Check Accessibility permission on macOS using native API without triggering prompts
function checkMacOSAccessibilityPermission() {
  if (process.platform !== 'darwin') {
    return 'not_applicable';
  }
  
  const bundleId = getMacOSBundleId();
  let finalStatus = 'unknown';
  let methodUsed = 'none';
  
  try {
    // METHOD 1: Try to use node-mac-permissions if available (doesn't trigger prompts)
    try {
      const permissions = require('node-mac-permissions');
      const status = permissions.getStatus('accessibility');
      logInfo('Permissions', `Accessibility permission status (via node-mac-permissions): ${status}`);
      finalStatus = status; // Returns: 'authorized', 'denied', 'not-determined', or 'restricted'
      methodUsed = 'node-mac-permissions';
    } catch (moduleError) {
      // Module not available, fall back to other methods
      logInfo('Permissions', 'node-mac-permissions not available, using fallback method');
    }
    
    // Normalize any earlier value
    if (finalStatus === 'granted') {
      finalStatus = 'authorized';
    }
    
    // METHOD 2: Electron API that queries accessibility trust without prompting
    if (finalStatus === 'unknown' && typeof systemPreferences.isTrustedAccessibilityClient === 'function') {
      const trusted = systemPreferences.isTrustedAccessibilityClient(false);
      finalStatus = trusted ? 'authorized' : 'denied';
      methodUsed = 'systemPreferences.isTrustedAccessibilityClient';
      logInfo('Permissions', `Accessibility permission (via systemPreferences): ${finalStatus}`);
    }
    
    // METHOD 3: Try TCC database query (most reliable fallback)
    if (finalStatus === 'unknown' && bundleId) {
      try {
        const tccStatus = checkTCCDatabasePermission(bundleId, 'accessibility');
        if (tccStatus !== 'unknown') {
          finalStatus = tccStatus === 'granted' ? 'authorized' : tccStatus;
          methodUsed = 'TCC-database-query';
          logInfo('Permissions', `Accessibility permission (via TCC database): ${finalStatus}`);
        }
      } catch (error) {
        logWarn('Permissions', `TCC database check failed: ${error?.message || error}`);
      }
    }
    
    // METHOD 4: Fallback - Use a silent check that doesn't trigger permission prompts
    // We check if we can query System Events without actually triggering a prompt
    if (finalStatus === 'unknown') {
      try {
        // This command checks permission status without triggering a new prompt
        // It will only work if permission is already granted
        execSync('osascript -e "tell application \\"System Events\\" to get name of first application process whose frontmost is true" 2>&1', { 
          encoding: 'utf8',
          timeout: 1000,
          stdio: 'pipe'
        });
        finalStatus = 'authorized';
        methodUsed = 'AppleScript-test';
        logInfo('Permissions', `Accessibility permission (via AppleScript test): authorized`);
      } catch (e) {
        const errorMsg = String(e.message || e.stdout || e.stderr || '');
        // Check if error is due to permission denial
        if (errorMsg.includes('not allowed assistive') || 
            errorMsg.includes('(-1719)') || 
            errorMsg.includes('accessibility')) {
          finalStatus = 'denied';
          methodUsed = 'AppleScript-test';
          logInfo('Permissions', `Accessibility permission (via AppleScript test): denied`);
        }
        // If it's a different error, we can't determine status
      }
    }
    
    logInfo('Permissions', `Accessibility permission final status: ${finalStatus} (method: ${methodUsed})`);
    return finalStatus;
  } catch (error) {
    logWarn('Permissions', 'Error checking Accessibility permission:', error);
    return 'unknown';
  }
}

// // Cache for permission status to avoid repeated checks
// let cachedScreenRecordingPermission = null;
// let permissionCheckTimestamp = 0;
// const PERMISSION_CACHE_DURATION = 5000; // Cache for 5 seconds

// Helper function to get the actual bundle ID from the app bundle
function getMacOSBundleId() {
  if (process.platform !== 'darwin') {
    return null;
  }

  try {
    let appPath = app.getAppPath();

    if (app.isPackaged) {
      appPath = app.getPath('exe');
      if (appPath.endsWith('/Contents/MacOS/Electron') || appPath.endsWith('/Contents/MacOS/Time Tracker')) {
        appPath = path.resolve(appPath, '../../..');
      }

      const infoPlistPath = path.join(appPath, 'Contents', 'Info.plist');
      if (fs.existsSync(infoPlistPath)) {
        try {
          const plistContent = fs.readFileSync(infoPlistPath, 'utf8');
          const bundleIdMatch = plistContent.match(/<key>CFBundleIdentifier<\/key>\s*<string>([^<]+)<\/string>/);
          if (bundleIdMatch && bundleIdMatch[1]) {
            return bundleIdMatch[1].trim();
          }
        } catch (e) {
          logWarn('Permissions', `Failed to read Info.plist: ${e.message}`);
        }
      }
    }

    try {
      const packageJsonPath = app.isPackaged
        ? path.join(process.resourcesPath, 'package.json')
        : path.join(__dirname, 'package.json');

      if (fs.existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        if (packageJson.build && packageJson.build.appId) {
          return packageJson.build.appId;
        }
      }
    } catch (e) {
      logWarn('Permissions', `Failed to read package.json for bundle ID: ${e.message}`);
    }

    return null;
  } catch (error) {
    logWarn('Permissions', `Error getting bundle ID: ${error.message}`);
    return null;
  }
}

// Check TCC database directly for permission status (most reliable method)
// This queries the macOS TCC (Transparency, Consent, and Control) database
// auth_value = 2 means 'authorized', auth_value = 0 means 'denied'
function checkTCCDatabasePermission(bundleId, service) {
  if (process.platform !== 'darwin' || !bundleId) {
    return 'unknown';
  }

  try {
    // TCC database paths (user-level is more accessible)
    const tccPaths = [
      `${process.env.HOME}/Library/Application Support/com.apple.TCC/TCC.db`,
      '/Library/Application Support/com.apple.TCC/TCC.db'
    ];

    let tccPath = null;
    for (const tccPathCandidate of tccPaths) {
      if (fs.existsSync(tccPathCandidate)) {
        tccPath = tccPathCandidate;
        break;
      }
    }

    if (!tccPath) {
      logInfo('Permissions', 'TCC database not found - this is OK, will use other permission check methods');
      logInfo('Permissions', 'Note: The app does NOT need Full Disk Access to function');
      return 'unknown';
    }

    // Service names in TCC database
    const serviceMap = {
      'screenCapture': 'kTCCServiceScreenCapture',
      'accessibility': 'kTCCServiceAccessibility'
    };

    const tccService = serviceMap[service] || service;
    
    // Query TCC database for permission status
    // auth_value: 0 = denied, 2 = authorized, 1 = not determined
    const query = `SELECT auth_value FROM access WHERE service = '${tccService}' AND client = '${bundleId}';`;
    const command = `sqlite3 "${tccPath}" "${query}"`;
    
    try {
      const result = execSync(command, { 
        encoding: 'utf8', 
        timeout: 2000,
        stdio: 'pipe'
      }).trim();

      if (result === '2') {
        logInfo('Permissions', `TCC database shows ${service} permission as AUTHORIZED (auth_value=2) for ${bundleId}`);
        return 'granted';
      } else if (result === '0') {
        logInfo('Permissions', `TCC database shows ${service} permission as DENIED (auth_value=0) for ${bundleId}`);
        return 'denied';
      } else if (result === '1') {
        logInfo('Permissions', `TCC database shows ${service} permission as NOT DETERMINED (auth_value=1) for ${bundleId}`);
        return 'not-determined';
      } else if (result === '') {
        logInfo('Permissions', `TCC database has no entry for ${service} permission (not-determined) for ${bundleId}`);
        return 'not-determined';
      } else {
        logWarn('Permissions', `TCC database returned unexpected value: ${result}`);
        return 'unknown';
      }
    } catch (execError) {
      const errorMsg = String(execError.message || execError.stderr || execError.stdout || '');
      // If sqlite3 is not available or database is locked, that's okay - we'll use other methods
      if (errorMsg.includes('command not found') || errorMsg.includes('sqlite3')) {
        logInfo('Permissions', 'sqlite3 command not available - TCC database check skipped (will use other methods)');
      } else if (errorMsg.includes('database is locked') || errorMsg.includes('permission denied')) {
        // This is EXPECTED and OK - the app doesn't need Full Disk Access to function
        // We'll use other methods (node-mac-permissions, systemPreferences) to check permissions
        logInfo('Permissions', `TCC database is inaccessible (permission denied) - this is EXPECTED and OK`);
        logInfo('Permissions', 'The app does NOT need Full Disk Access to function. Using alternative permission check methods.');
      } else {
        logWarn('Permissions', `TCC database query failed: ${errorMsg} (will use other methods)`);
      }
      return 'unknown';
    }
  } catch (error) {
    logWarn('Permissions', `Error checking TCC database: ${error?.message || error}`);
    return 'unknown';
  }
}

// Check Screen Recording permission on macOS using multiple methods for reliability
// Tries node-mac-permissions first (most reliable), then systemPreferences, then verification
// Returns: 'granted', 'denied', 'not-determined', 'restricted', 'unknown', or 'not_applicable'
function checkMacOSScreenRecordingPermission() {
  if (process.platform !== 'darwin') {
    return 'not_applicable';
  }
  
  // Return cached value if still valid
  const now = Date.now();
  if (cachedScreenRecordingPermission !== null && (now - permissionCheckTimestamp) < PERMISSION_CACHE_DURATION) {
    logInfo('Permissions', `Screen recording permission status (cached): ${cachedScreenRecordingPermission}`);
    return cachedScreenRecordingPermission;
  }
  
  // Log context for debugging
  const bundleId = getMacOSBundleId();
  const appName = app.getName();
  const isPackaged = app.isPackaged;
  
  logInfo('Permissions', `Checking screen recording permission...`);
  logInfo('Permissions', `  App Name: ${appName}`);
  logInfo('Permissions', `  Bundle ID: ${bundleId || 'unknown'}`);
  logInfo('Permissions', `  Is Packaged: ${isPackaged}`);
  // logInfo('Permissions', `  App Path: ${app.getAppPath()}`);
  
  let finalStatus = 'unknown';
  let methodUsed = 'none';
  
  // METHOD 1: Try node-mac-permissions first (most reliable, checks TCC database directly)
  // This is the recommended method per instructions
  try {
    const permissions = require('node-mac-permissions');
    
    // Use getStatus method (equivalent to hasScreenRecordingPermission)
    const status = permissions.getStatus('screenCapture');
    logInfo('Permissions', `Screen recording permission check (via node-mac-permissions.getStatus): ${status}`);
    
    // Map node-mac-permissions status to Electron's format
    // Returns: 'authorized', 'denied', 'not-determined', or 'restricted'
    if (status === 'authorized') {
      finalStatus = 'granted';
      methodUsed = 'node-mac-permissions.getStatus';
      logInfo('Permissions', '✅ Screen recording permission is AUTHORIZED');
    } else if (status === 'denied') {
      finalStatus = 'denied';
      methodUsed = 'node-mac-permissions.getStatus';
      logWarn('Permissions', '❌ Screen recording permission is DENIED');
    } else if (status === 'not-determined') {
      finalStatus = 'not-determined';
      methodUsed = 'node-mac-permissions.getStatus';
      logInfo('Permissions', '⚠️ Screen recording permission is NOT DETERMINED (not requested yet)');
    } else if (status === 'restricted') {
      finalStatus = 'restricted';
      methodUsed = 'node-mac-permissions.getStatus';
      logWarn('Permissions', '🔒 Screen recording permission is RESTRICTED (by MDM/parental controls)');
    } else {
      logWarn('Permissions', `node-mac-permissions returned unknown status: ${status}`);
    }
  } catch (moduleError) {
    logInfo('Permissions', `node-mac-permissions not available: ${moduleError?.message || moduleError}`);
    logInfo('Permissions', 'Falling back to alternative permission check methods...');
  }
  
  // METHOD 2: Try systemPreferences.getMediaAccessStatus (Electron's native method)
  // Only use this if node-mac-permissions didn't work
  if (finalStatus === 'unknown') {
    try {
      // Check if the method exists (might not be available in all Electron versions)
      if (typeof systemPreferences.getMediaAccessStatus === 'function') {
        const status = systemPreferences.getMediaAccessStatus('screen');
        logInfo('Permissions', `Screen recording permission (via systemPreferences.getMediaAccessStatus): ${status}`);
        
        if (status && status !== 'unknown') {
          // Normalize 'authorized' to 'granted' for consistency
          // Some Electron versions return 'authorized' instead of 'granted'
          if (status === 'authorized') {
            finalStatus = 'granted';
            logInfo('Permissions', 'Normalized status from "authorized" to "granted"');
          } else {
            finalStatus = status;
          }
          methodUsed = 'systemPreferences.getMediaAccessStatus';
        } else {
          logWarn('Permissions', `systemPreferences.getMediaAccessStatus returned '${status}' - may be unreliable`);
        }
      } else {
        logWarn('Permissions', 'systemPreferences.getMediaAccessStatus is not available in this Electron version');
      }
    } catch (error) {
      logWarn('Permissions', `Error checking permission via systemPreferences: ${error?.message || error}`);
    }
  }
  
  // METHOD 3: Try TCC database query (most reliable fallback - directly queries macOS permission database)
  // Only use this if previous methods didn't work or returned 'unknown'
  if (finalStatus === 'unknown' && bundleId) {
    try {
      const tccStatus = checkTCCDatabasePermission(bundleId, 'screenCapture');
      if (tccStatus !== 'unknown') {
        finalStatus = tccStatus;
        methodUsed = 'TCC-database-query';
        logInfo('Permissions', `Screen recording permission (via TCC database): ${finalStatus}`);
      }
    } catch (error) {
      logWarn('Permissions', `TCC database check failed: ${error?.message || error}`);
    }
  }
  
  // Normalize any remaining 'authorized' status to 'granted' for consistency
  if (finalStatus === 'authorized') {
    finalStatus = 'granted';
    logInfo('Permissions', 'Normalized final status from "authorized" to "granted"');
  }

  // If we still don't have a status, log detailed troubleshooting
  if (finalStatus === 'unknown' || finalStatus === 'denied') {
    logWarn('Permissions', '===========================================================');
    logWarn('Permissions', 'PERMISSION STATUS CHECK FAILED OR DENIED');
    logWarn('Permissions', '===========================================================');
    logWarn('Permissions', `Method used: ${methodUsed}`);
    logWarn('Permissions', `Status: ${finalStatus}`);
    logWarn('Permissions', `App Name: ${appName}`);
    logWarn('Permissions', `Bundle ID: ${bundleId || 'unknown'}`);
    logWarn('Permissions', `Is Packaged: ${isPackaged}`);
    logWarn('Permissions', '');
    logWarn('Permissions', 'TROUBLESHOOTING STEPS:');
    logWarn('Permissions', '1. Open System Settings → Privacy & Security → Screen Recording');
    logWarn('Permissions', `2. Look for "${appName}" in the list (NOT "Electron")`);
    logWarn('Permissions', `3. Expected Bundle ID: ${bundleId || 'com.supagigs.timetracker'}`);
    logWarn('Permissions', '4. Make sure the toggle is ON');
    logWarn('Permissions', '5. QUIT the app completely (Cmd+Q, not just close window)');
    logWarn('Permissions', '6. Restart the app');
    logWarn('Permissions', '7. If still not working, try:');
    logWarn('Permissions', `   Terminal: tccutil reset ScreenCapture ${bundleId || 'com.supagigs.timetracker'}`);
    logWarn('Permissions', '===========================================================');
    
    if (!isPackaged) {
      logWarn('Permissions', '⚠️  WARNING: Running in DEV mode');
      logWarn('Permissions', '   Dev builds use different bundle ID than packaged apps');
      logWarn('Permissions', '   Permissions are separate for dev and packaged versions');
    }
  } else if (finalStatus === 'granted') {
    logInfo('Permissions', `✅ Screen recording permission is GRANTED (checked via ${methodUsed})`);
  }
  
  // Cache the status
  cachedScreenRecordingPermission = finalStatus;
  permissionCheckTimestamp = now;
  
  return finalStatus;
}

// Trigger screen recording permission prompt using node-mac-permissions
async function triggerScreenRecordingPermissionPrompt() {
  if (process.platform !== 'darwin') {
    return { triggered: false, reason: 'not_macos' };
  }

  logInfo('Permissions', 'Triggering screen recording permission prompt...');

  try {
    // METHOD 1: Try using node-mac-permissions library (recommended method)
    try {
      const permissions = require('node-mac-permissions');
      
      // Check current status first
      const currentStatus = permissions.getStatus('screenCapture');
      logInfo('Permissions', `Current screen recording permission status (before prompt): ${currentStatus}`);
      
      // If already authorized, return success
      if (currentStatus === 'authorized') {
        logInfo('Permissions', 'Screen recording permission already authorized');
        return { triggered: false, granted: true, reason: 'already_authorized', status: currentStatus };
      }
      
      // Request permission using node-mac-permissions
      // Note: node-mac-permissions doesn't have askForScreenRecordingPermission in v2.5.0
      // So we'll use desktopCapturer as fallback to trigger the system prompt
      logInfo('Permissions', 'Using desktopCapturer to trigger system permission prompt...');
    } catch (moduleError) {
      logInfo('Permissions', `node-mac-permissions not available, using desktopCapturer method: ${moduleError?.message || moduleError}`);
    }

    // METHOD 2: Fallback - Attempt to capture a screen - this will trigger the system prompt if needed
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 150, height: 150 } // Small size for prompt trigger
    });

    // Check status again after attempting to trigger
    let finalStatus = 'unknown';
    try {
      const permissions = require('node-mac-permissions');
      finalStatus = permissions.getStatus('screenCapture');
      logInfo('Permissions', `Screen recording permission status (after prompt attempt): ${finalStatus}`);
    } catch (e) {
      // node-mac-permissions not available, use sources as indicator
      logInfo('Permissions', 'node-mac-permissions not available for status check');
    }

    if (sources && sources.length > 0) {
      logInfo('Permissions', `Permission prompt triggered successfully - ${sources.length} source(s) available, status: ${finalStatus}`);
      return { triggered: true, granted: true, sources: sources.length, status: finalStatus };
    } else {
      logWarn('Permissions', `Permission prompt triggered but no sources returned, status: ${finalStatus}`);
      return { triggered: true, granted: false, sources: 0, status: finalStatus };
    }
  } catch (error) {
    logError('Permissions', `Failed to trigger permission prompt: ${error.message}`);
    return { triggered: false, error: error.message };
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

// Resolve the active window using @paymoapp/active-window (preferred on macOS) or active-win
async function getActiveWindowDetails(preferPaymoFirst = false) {
  const providers = [];
  
  // Prefer the Paymo fork on macOS because it better handles permission edge cases
  if (process.platform === 'darwin') {
    if (preferPaymoFirst) {
      providers.push('paymo');
      providers.push('active-win');
    } else {
      providers.push('active-win');
      providers.push('paymo');
    }
  } else {
    providers.push('active-win');
  }
  
  for (const provider of providers) {
    try {
      let fn = null;
      if (provider === 'paymo') {
        if (!paymoActiveWindowModule) {
          paymoActiveWindowModule = await import('@paymoapp/active-window');
          logInfo('ActiveWindow', '@paymoapp/active-window loaded');
        }
        fn = (paymoActiveWindowModule && paymoActiveWindowModule.getActiveWindow) ||
             (paymoActiveWindowModule && paymoActiveWindowModule.activeWindow) ||
             (paymoActiveWindowModule && paymoActiveWindowModule.default) ||
             paymoActiveWindowModule;
      } else {
        if (!activeWindowModule) {
          activeWindowModule = await import('active-win');
          logInfo('ActiveWindow', 'active-win loaded');
        }
        fn = (activeWindowModule && activeWindowModule.activeWindow) ||
             (activeWindowModule && activeWindowModule.default) ||
             activeWindowModule;
      }
      
      if (typeof fn === 'function') {
        const result = await fn();
        if (result) {
          logInfo('ActiveWindow', `${provider === 'paymo' ? '@paymoapp/active-window' : 'active-win'} returned result successfully`);
          return { result, provider };
        }
      } else {
        logWarn('ActiveWindow', `${provider === 'paymo' ? '@paymoapp/active-window' : 'active-win'} export not a function`);
      }
    } catch (error) {
      logWarn('ActiveWindow', `${provider === 'paymo' ? '@paymoapp/active-window' : 'active-win'} failed: ${error.message}`);
    }
  }
  
  return { result: null, provider: null };
}

// ============ GLOBAL STATE ============
const IDLE_THRESHOLD_SECONDS = 30;
let activeWindowModule = null;
let paymoActiveWindowModule = null;
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
let currentSupabaseSessionId = null; // Numeric Supabase session ID for time_session_id column
let currentFrappeProjectId = null;
let currentFrappeTaskId = null;

// Simple in-memory time tracking state for IPC handlers used by preload.js
let timeTrackingState = {
  active: false,
  paused: false,
  userEmail: null,
  startedAt: null,
  pausedAt: null,
  totalActiveMs: 0,
};
const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'screenshots';

// Track pending uploads that can be cancelled
const pendingScreenshots = new Map();
let toastWin = null; // Keep for backward compatibility, but prefer toastWindows Map
const toastWindows = new Map(); // Map of screenIndex -> BrowserWindow for multi-screen support
let toastQueue = []; // Queue for toast notifications when multiple screenshots are captured
let isProcessingToastQueue = false;

// ============ SCREENSHOT BATCH QUEUE ============
const SCREENSHOT_BATCH_SIZE = 5; // Upload screenshots in batches of 5
const SCREENSHOT_BATCH_FLUSH_INTERVAL = 5 * 60 * 1000; // Flush every 5 minutes if batch not full
const screenshotBatchQueue = [];
let isBatchUploading = false;
let batchFlushInterval = null;
let isFlushTimerActive = false;
// Cache for macOS permission checks to avoid repeated expensive lookups
let cachedScreenRecordingPermission = null;
let permissionCheckTimestamp = 0;
const PERMISSION_CACHE_DURATION = 5000; // Cache for 5 seconds

function scheduleBatchFlush() {
  // If a flush timer is already scheduled/active or there is nothing to process, do nothing.
  if (isFlushTimerActive || batchFlushInterval) {
    if (screenshotBatchQueue.length === 0) {
      // Queue is empty, cancel any existing timer
      if (batchFlushInterval) {
        clearTimeout(batchFlushInterval);
        batchFlushInterval = null;
        isFlushTimerActive = false;
        logInfo('BATCH-UPLOAD', 'Cancelled flush timer (queue empty)');
      }
    }
    return;
  }
  
  if (screenshotBatchQueue.length === 0) {
    return; // Nothing to flush
  }

  isFlushTimerActive = true;
  const queueSizeAtSchedule = screenshotBatchQueue.length;
  logInfo('BATCH-UPLOAD', `Scheduling flush timer (${SCREENSHOT_BATCH_FLUSH_INTERVAL}ms) for ${queueSizeAtSchedule} screenshot(s) in queue`);
  
  batchFlushInterval = setTimeout(async () => {
    const queueSizeAtFlush = screenshotBatchQueue.length;
    logInfo('BATCH-UPLOAD', `Flush timer fired. Queue size: ${queueSizeAtFlush} (was ${queueSizeAtSchedule} when scheduled)`);
    
    if (screenshotBatchQueue.length > 0 && !isBatchUploading) {
      logInfo(
        'BATCH-UPLOAD',
        `Periodic flush: processing ${screenshotBatchQueue.length} screenshot(s) after timeout`,
      );
      await processScreenshotBatch();
    } else if (isBatchUploading) {
      logInfo('BATCH-UPLOAD', 'Flush timer skipped - batch upload already in progress');
    } else {
      logInfo('BATCH-UPLOAD', 'Flush timer skipped - queue is empty');
    }

    // Mark this timer as finished before deciding whether to schedule another one
    isFlushTimerActive = false;
    batchFlushInterval = null;

    if (screenshotBatchQueue.length > 0) {
      // Queue still has items (e.g. re-queued after failures) — schedule another flush.
      logInfo('BATCH-UPLOAD', `Queue still has ${screenshotBatchQueue.length} item(s), scheduling another flush timer`);
      scheduleBatchFlush();
    } else {
      logInfo('BATCH-UPLOAD', 'Flush timer finished (queue empty)');
    }
  }, SCREENSHOT_BATCH_FLUSH_INTERVAL);
}

// ============ MAIN WINDOW CREATION ============
function createWindow() {
  // Set icon based on platform
  let iconPath = null;
  //does not block window creation
  try{
  if (process.platform === 'darwin') {
    // macOS prefers .icns, but .png also works, .ico as last resort
    const icnsPath = path.join(__dirname, 'assets', 'SupagigsIcon.icns');
    const pngPath = path.join(__dirname, 'assets', 'android-chrome-512x512.png');
    const icoPath = path.join(__dirname, 'assets', 'favicon.ico');
    if (fs.existsSync(icnsPath)) {
      iconPath = icnsPath;
    } else if (fs.existsSync(pngPath)) {
      iconPath = pngPath;
    } else if (fs.existsSync(icoPath)) {
      iconPath = icoPath; // Fallback to .ico on macOS
    }
  } else {
    // Windows and Linux use .ico
    const icoPath = path.join(__dirname, 'assets', 'favicon.ico');
    if (fs.existsSync(icoPath)) {
      iconPath = icoPath;
    }
  }
} catch (e) {
  logWarn('Window', 'Error Checking icon:', e);
}
  
  // Phone-sized window (typical 6-inch phone display)
  const PHONE_WIDTH = 360;
  const PHONE_HEIGHT = 640;

  const windowOptions = {
    width: PHONE_WIDTH,
    height: PHONE_HEIGHT,
    minWidth: PHONE_WIDTH,
    minHeight: PHONE_HEIGHT,
    maxWidth: PHONE_WIDTH,
    maxHeight: PHONE_HEIGHT,
    useContentSize: true,      // <--- ADD THIS: Ensures 360x640 is for the internal page
    resizable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      zoomFactor: 1.0,         // <--- ADD THIS: Forces 100% zoom regardless of user screen scaling
      visualZoomLevelLimits: [1, 1] // <--- ADD THIS: Prevents manual zooming
    }
};
  
  // Only set icon if file exists
  if (iconPath) {
    windowOptions.icon = iconPath;
  }
  
  mainWindow = new BrowserWindow(windowOptions);
  mainWindow.loadFile('renderer/screens/login.html');
  mainWindow.on('closed', () => { mainWindow = null; });

  // CRITICAL: On macOS, window MUST be visible BEFORE requesting permissions
  // macOS rejects screen recording authorization if app appears "headless" or service-type
  // Show window first, then request permissions after it's visible
  mainWindow.once('ready-to-show', async () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      // Show window FIRST - this is required for macOS to grant permissions
      mainWindow.show();
      mainWindow.focus();
      logInfo('Window', 'Window shown and focused - ready for permission requests');
      
      // Small delay to ensure window is fully visible and not considered "headless"
      // macOS needs to see the app as a foreground GUI app, not a background service
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // NOW handle macOS permissions AFTER window is visible
      if (process.platform === 'darwin') {
        try {
          const { screenRecordingStatus, accessibilityStatus } = await ensureMacPermissionsOnStartup();
          if (screenRecordingStatus !== 'granted' || accessibilityStatus !== 'authorized') {
            logWarn('Permissions', `Startup permissions incomplete - screen: ${screenRecordingStatus}, accessibility: ${accessibilityStatus}`);
          }
          if (isFirstLaunch()) {
            markFirstLaunchCompleted();
            logInfo('FirstLaunch', 'First launch flag stored after permission preflight');
          }
        } catch (error) {
          logWarn('Permissions', `Startup permission preflight failed: ${error?.message || error}`);
        }
      }
    }
  });
  

  const broadcastIdleState = (isIdle) => {
    try {
      const payload = { idle: isIdle, timestamp: Date.now() };
      BrowserWindow.getAllWindows().forEach((win) => {
        if (!win.isDestroyed()) {
          win.webContents.send('system-idle-state', payload);
        }
      });
    } catch (e) {
      logWarn('IdleState', `Failed to broadcast system-idle-state: ${e?.message || e}`);
    }
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

  // When system resumes or screen unlocks (e.g. laptop lid opened), tell renderer to clock out
  // if the lock/suspend event was never processed. On Windows, lid open often fires
  // unlock-screen rather than resume, so we handle both.
  const broadcastSystemResumed = () => {
    try {
      global.__lastSystemResumeAt = Date.now();
      BrowserWindow.getAllWindows().forEach((win) => {
        if (!win.isDestroyed() && win.webContents && !win.webContents.isDestroyed()) {
          win.webContents.send('system-resumed', {});
        }
      });
      logInfo('PowerMonitor', 'Broadcast system-resumed');
    } catch (e) {
      logWarn('PowerMonitor', `Failed to broadcast system-resumed: ${e?.message || e}`);
    }
  };
  try {
    powerMonitor.on('resume', () => broadcastSystemResumed());
  } catch (e) {
    logWarn('PowerMonitor', 'Unable to register resume broadcast', e);
  }
  // Windows: lid open often triggers unlock-screen, not resume
  if (powerMonitor.listenerCount('unlock-screen') === 0) {
    try {
      powerMonitor.on('unlock-screen', () => broadcastSystemResumed());
    } catch (e) {
      logWarn('PowerMonitor', 'Unable to register unlock-screen broadcast', e);
    }
  }

  // Stop timer and clock out when lid is closed (lock-screen) or system suspends.
  // Use powerSaveBlocker to delay suspend so the renderer has time to save the session.
  const LID_CLOSE_CLOCKOUT_TIMEOUT_MS = 15000;
  let lidCloseBlockerId = null;
  let lidCloseBlockerTimeout = null;

  const releaseLidCloseBlocker = () => {
    if (lidCloseBlockerTimeout) {
      clearTimeout(lidCloseBlockerTimeout);
      lidCloseBlockerTimeout = null;
    }
    if (lidCloseBlockerId != null) {
      try {
        powerSaveBlocker.stop(lidCloseBlockerId);
        logInfo('PowerMonitor', '[PowerEvents] Main: Released power save blocker');
      } catch (e) {
        logWarn('PowerMonitor', `[PowerEvents] Main: Failed to stop power save blocker: ${e?.message || e}`);
      }
      lidCloseBlockerId = null;
    }
  };

  ipcMain.on('lid-close-clock-out-done', () => {
    logInfo('PowerMonitor', '[PowerEvents] Main: Renderer reported lid-close clock-out done');
    releaseLidCloseBlocker();
  });

  const broadcastLockOrSuspendClockOut = (reason) => {
    try {
      const ts = new Date().toISOString();
      logInfo('PowerMonitor', `[PowerEvents] Main: lock-or-suspend broadcast initiated`, { timestamp: ts, reason });
      // Prevent app suspension so the renderer has time to complete clock-out (works for active/idle/on break)
      if (lidCloseBlockerId == null) {
        try {
          lidCloseBlockerId = powerSaveBlocker.start('prevent-app-suspension');
          logInfo('PowerMonitor', '[PowerEvents] Main: Started power save blocker to allow clock-out');
          lidCloseBlockerTimeout = setTimeout(() => {
            logInfo('PowerMonitor', '[PowerEvents] Main: Lid-close blocker timeout, releasing');
            releaseLidCloseBlocker();
          }, LID_CLOSE_CLOCKOUT_TIMEOUT_MS);
        } catch (e) {
          logWarn('PowerMonitor', `[PowerEvents] Main: Failed to start power save blocker: ${e?.message || e}`);
        }
      }
      BrowserWindow.getAllWindows().forEach((win) => {
        if (!win.isDestroyed() && win.webContents && !win.webContents.isDestroyed()) {
          win.webContents.send('lock-or-suspend-clock-out', { reason, timestamp: ts });
        }
      });
      logInfo('PowerMonitor', `[PowerEvents] Main: Broadcast lock-or-suspend-clock-out: ${reason}`);
    } catch (e) {
      logWarn('PowerMonitor', `[PowerEvents] Main: Failed to broadcast lock-or-suspend-clock-out: ${e?.message || e}`);
      releaseLidCloseBlocker();
    }
  };
  // Fire immediately so renderer can clock out before system sleeps (no delay).
  if (powerMonitor.listenerCount('lock-screen') === 0) {
    try {
      powerMonitor.on('lock-screen', () => {
        logInfo('PowerMonitor', '[PowerEvents] Main: lock-screen — broadcasting clock-out immediately');
        broadcastLockOrSuspendClockOut('lock_screen');
      });
    } catch (e) {
      logWarn('PowerMonitor', 'Unable to register lock-screen listener', e);
    }
  }
  if (powerMonitor.listenerCount('suspend') === 0) {
    try {
      powerMonitor.on('suspend', () => {
        logInfo('PowerMonitor', '[PowerEvents] Main: suspend — broadcasting clock-out immediately');
        broadcastLockOrSuspendClockOut('suspend');
      });
    } catch (e) {
      logWarn('PowerMonitor', 'Unable to register suspend listener', e);
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

  // Graceful close handler: save session before window closes, then close.
  let isForceClosing = false;

  mainWindow.on('close', async (event) => {
    if (isForceClosing) {
      return;
    }

    if (isTimerActive) {
      event.preventDefault();
    
      // Show native confirmation dialog (only when close icon or window-close is attempted)
      const resp = await dialog.showMessageBox(mainWindow, {
        type: 'warning',
        title: 'Timer still running',
        message: 'A timer session is still running.',
        detail: 'Please clock out to save your session. Do you want to Clock Out & Close the app now?',
        buttons: ['Cancel', 'Clock Out & Close'],
        defaultId: 1,
        cancelId: 0,
        noLink: true
      });
    
      // resp.response === 0 => Cancel, === 1 => Clock Out & Close
      if (resp.response === 0) {
        // user cancelled — do nothing, keep window open
        return;
      }
    
      try {
        const savePromise = mainWindow.webContents.executeJavaScript(`
          new Promise(async (resolve) => {
            try {
              if (window.saveSessionBeforeClose) {
                const result = await window.saveSessionBeforeClose();
                resolve(result);
              } else {
                resolve({ saved: false, error: 'Save function not available' });
              }
            } catch (error) {
              resolve({ saved: false, error: error.message });
            }
          })
        `);
    
        const SAVE_ON_CLOSE_TIMEOUT_MS = 12000;
        const saveResult = await Promise.race([
          savePromise,
          new Promise((resolve) => setTimeout(() => resolve({ saved: false, error: 'Timeout' }), SAVE_ON_CLOSE_TIMEOUT_MS))
        ]);
    
        if (saveResult && saveResult.saved) {
          logInfo('WindowClose', 'Session saved successfully before window close');
          isForceClosing = true;
          mainWindow.close();
          return;
        } else if (saveResult && saveResult.error === 'Save function not available') {
          // fallback: navigate to startProject to save (your existing behaviour)
          logInfo('WindowClose', 'Navigating to startProject to save session before close');
          const startProjectPath = path.join(__dirname, 'renderer', 'screens', 'startProject.html');
          const closeTimeout = setTimeout(() => {
            logWarn('WindowClose', 'Close-after-save timeout, closing window');
            isForceClosing = true;
            mainWindow.close();
            console.log("Window close attempted. Timer active:", isTimerActive)
          }, 15000);
          ipcMain.once('session-saved-please-close', () => {
            clearTimeout(closeTimeout);
            logInfo('WindowClose', 'Renderer confirmed session saved, closing window');
            isForceClosing = true;
            mainWindow.close();
          });
          mainWindow.loadFile(startProjectPath, { query: { closeAfterSave: '1' } }).catch((err) => {
            clearTimeout(closeTimeout);
            logError('WindowClose', `Failed to load startProject for save: ${err.message}`);
            isForceClosing = true;
            mainWindow.close();
          });
          return;
        } else {
          logWarn('WindowClose', `Failed to save session: ${saveResult?.error || 'Unknown error'}`);
          // if save failed or timed out, fall through to force-close after a short delay
          setTimeout(() => {
            isForceClosing = true;
            mainWindow.close();
          }, 500);
          return;
        }
      } catch (error) {
        logError('WindowClose', `Error saving session on window close: ${error.message}`);
        setTimeout(() => {
          isForceClosing = true;
          mainWindow.close();
        }, 500);
        return;
      }
    }
  });
}

// ============ HELPER FUNCTIONS ============

// Check and request screen recording permissions on macOS
// This function checks permission status WITHOUT triggering prompts if already granted
// Uses systemPreferences.getMediaAccessStatus('screen') which is the reliable method
// Returns boolean for backward compatibility, but uses accurate status checking
async function checkScreenRecordingPermission() {
  if (process.platform !== 'darwin') {
    return true;
  }

  try {
    // Try to get sources - this is the actual test
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 0, height: 0 }
    });

    // If we can get sources, permission is working
    if (sources && sources.length > 0) {
      logInfo('Permissions', '✅ Screen recording permission check passed - sources available');
      return true;
    }

    logWarn('Permissions', '⚠️ Screen recording permission check failed - no sources returned');
    return false;
  } catch (error) {
    logWarn('Permissions', `Screen recording permission test failed: ${error.message}`);
    return false;
  }
}

// Show comprehensive first-launch permissions dialog (macOS only, shown once)
async function showFirstLaunchPermissionsDialog() {
  if (process.platform !== 'darwin') {
    return; // Only show on macOS
  }
  
  if (!isFirstLaunch()) {
    logInfo('FirstLaunch', 'Not first launch - skipping permissions dialog');
    return; // Not first launch, skip dialog
  }
  
  if (!mainWindow || mainWindow.isDestroyed()) {
    logWarn('FirstLaunch', 'Main window not available - cannot show first launch dialog');
    return;
  }
  
  logInfo('FirstLaunch', 'Showing first launch permissions dialog');
  
  // Check current permission status
  const screenRecordingStatus = checkMacOSScreenRecordingPermission();
  const accessibilityStatus = await checkMacOSAccessibilityPermission();
  
  const screenRecordingGranted = screenRecordingStatus === 'granted';
  const accessibilityGranted = accessibilityStatus === 'authorized';
  
  let permissionDetails = '';
  
  if (!screenRecordingGranted || !accessibilityGranted) {
    permissionDetails = '\n\n📋 Permissions Needed:\n\n';
    
    if (!screenRecordingGranted) {
      permissionDetails += '• Screen Recording:\n';
      permissionDetails += '  Status: ' + (screenRecordingStatus === 'not-determined' ? 'Not yet requested' : screenRecordingStatus) + '\n';
      permissionDetails += '  Purpose: Capture screenshots for time tracking\n';
      permissionDetails += '  Location: System Settings → Privacy & Security → Screen Recording\n\n';
    }
    
    if (!accessibilityGranted) {
      permissionDetails += '• Accessibility:\n';
      permissionDetails += '  Status: ' + (accessibilityStatus === 'not-determined' ? 'Not yet requested' : accessibilityStatus) + '\n';
      permissionDetails += '  Purpose: Detect which application you are using\n';
      permissionDetails += '  Location: System Settings → Privacy & Security → Accessibility\n\n';
    }
    
    permissionDetails += '📝 Instructions:\n';
    permissionDetails += '1. macOS will prompt you when you start tracking\n';
    permissionDetails += '2. Or manually enable permissions in System Settings\n';
    permissionDetails += '3. Restart the app after granting permissions\n';
    permissionDetails += '4. You can also open System Settings directly using the buttons below';
  } else {
    permissionDetails = '\n\n✅ All required permissions are already granted!';
  }
  
  const buttons = screenRecordingGranted && accessibilityGranted 
    ? ['OK'] 
    : ['Open Screen Recording Settings', 'Open Accessibility Settings', 'OK'];
  
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Welcome to Time Tracker',
    message: 'Permissions Required for Time Tracking',
    detail: 'This app needs the following permissions to function properly:' +
            permissionDetails,
    buttons: buttons,
    defaultId: buttons.length - 1,
    cancelId: buttons.length - 1,
    noLink: false
  }).then((result) => {
    if (result.response === 0 && !screenRecordingGranted) {
      // Open System Settings to Screen Recording
      shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
    } else if (result.response === 1 && !accessibilityGranted) {
      // Open System Settings to Accessibility
      shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility');
    }
    
    // Mark first launch as completed
    markFirstLaunchCompleted();
  });
}

// Show permission dialog on macOS if needed
async function requestScreenRecordingPermission() {
  if (process.platform !== 'darwin') {
    return;
  }

  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  // First check if permission is already working
  const hasPermission = await checkScreenRecordingPermission();
  if (hasPermission) {
    logInfo('Permissions', 'Screen recording permission already granted');
    return;
  }

  // Permission not working - show dialog
  dialog.showMessageBox(mainWindow, {
    type: 'warning',
    title: 'Screen Recording Permission Required',
    message: 'Screen Recording Permission Required',
    detail: 'This app needs screen recording permission to capture screenshots.\n\n' +
            'Please grant permission:\n' +
            '1. Open System Settings → Privacy & Security → Screen Recording\n' +
            '2. Find "Time Tracker" in the list (NOT "Electron")\n' +
            '3. Enable the toggle\n' +
            '4. **QUIT the app completely (Cmd+Q)**\n' +
            '5. **Restart the app**',
    buttons: ['Open System Settings', 'OK'],
    defaultId: 0,
    cancelId: 1
  }).then((result) => {
    if (result.response === 0) {
      shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
    }
  });
}


// Check and request Accessibility permission on macOS
// This function checks permission status WITHOUT triggering prompts if already granted
async function checkAccessibilityPermission() {
  if (process.platform !== 'darwin') {
    return true;
  }

  try {
    // Try AppleScript to test accessibility
    const result = await new Promise((resolve) => {
      const { exec } = require('child_process');
      const command = 'osascript -e "tell application \\"System Events\\" to get name of first application process whose frontmost is true"';
      
      exec(command, { timeout: 1000 }, (error) => {
        // If no error, accessibility permission is granted
        resolve(!error);
      });
    });

    if (result) {
      logInfo('Permissions', ' Accessibility permission check passed');
    } else {
      logWarn('Permissions', ' Accessibility permission check failed');
    }
    return result;
  } catch (error) {
    logWarn('Permissions', `Accessibility permission test failed: ${error.message}`);
    return false;
  }
}

// Show permission dialog for Accessibility on macOS if needed
async function requestAccessibilityPermission() {
  if (process.platform !== 'darwin') {
    return;
  }

  const hasPermission = await checkAccessibilityPermission();
  if (hasPermission) {
    return;
  }

  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  dialog.showMessageBox(mainWindow, {
    type: 'warning',
    title: 'Accessibility Permission Required',
    message: 'Accessibility Permission Required',
    detail: 'This app needs Accessibility permission to detect which application you are using.\n\n' +
            'Please grant permission:\n' +
            '1. Open System Settings → Privacy & Security → Accessibility\n' +
            '2. Find "Time Tracker" in the list\n' +
            '3. Enable the toggle\n' +
            '4. Restart the app',
    buttons: ['Open System Settings', 'OK'],
    defaultId: 1,
    cancelId: 1
  }).then((result) => {
    if (result.response === 0) {
      shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility');
    }
  });
}

// Run on app startup (before showing any UI) to check and trigger macOS prompts immediately
async function ensureMacPermissionsOnStartup() {
  if (process.platform !== 'darwin') {
    return {
      screenRecordingStatus: 'not_applicable',
      accessibilityStatus: 'not_applicable',
      screenPrompted: false,
      accessibilityPrompted: false
    };
  }

  logInfo('Permissions', '===========================================================');
  logInfo('Permissions', 'Running macOS startup permission preflight');
  logInfo('Permissions', '===========================================================');
  
  const bundleId = getMacOSBundleId();
  const appName = app.getName();
  const isPackaged = app.isPackaged;
  
  logInfo('Permissions', `App Name: ${appName}`);
  logInfo('Permissions', `Bundle ID: ${bundleId || 'unknown'}`);
  logInfo('Permissions', `Is Packaged: ${isPackaged}`);
  logInfo('Permissions', '');

  let screenRecordingStatus = 'unknown';
  let accessibilityStatus = 'unknown';
  let screenPrompted = false;
  let accessibilityPrompted = false;

  // Check screen recording permission with detailed logging
  logInfo('Permissions', 'Checking screen recording permission...');
  try {
    screenRecordingStatus = checkMacOSScreenRecordingPermission();
    logInfo('Permissions', `Screen recording permission status: ${screenRecordingStatus}`);
  } catch (error) {
    logError('Permissions', `Failed to check screen recording status: ${error?.message || error}`);
    logError('Permissions', error.stack || 'No stack trace available');
  }

  // Check accessibility permission with detailed logging
  logInfo('Permissions', 'Checking accessibility permission...');
  try {
    accessibilityStatus = checkMacOSAccessibilityPermission();
    logInfo('Permissions', `Accessibility permission status: ${accessibilityStatus}`);
  } catch (error) {
    logError('Permissions', `Failed to check accessibility status: ${error?.message || error}`);
    logError('Permissions', error.stack || 'No stack trace available');
  }

  logInfo('Permissions', '');

  // Trigger screen recording prompt immediately if missing
  if (screenRecordingStatus !== 'granted') {
    logInfo('Permissions', `Screen recording permission is ${screenRecordingStatus} - requesting permission...`);
    const promptResult = await triggerScreenRecordingPermissionPrompt();
    screenPrompted = !!promptResult?.triggered;
    
    logInfo('Permissions', `Permission prompt result: triggered=${promptResult?.triggered}, granted=${promptResult?.granted}, status=${promptResult?.status || 'unknown'}`);
    
    if (promptResult?.granted) {
      screenRecordingStatus = 'granted';
      logInfo('Permissions', '✅ Screen recording permission granted!');
    } else if (promptResult?.status) {
      // Update status based on what node-mac-permissions reports
      if (promptResult.status === 'authorized') {
        screenRecordingStatus = 'granted';
      } else {
        screenRecordingStatus = promptResult.status === 'denied' ? 'denied' : 
                                promptResult.status === 'not-determined' ? 'not-determined' : 
                                promptResult.status === 'restricted' ? 'restricted' : screenRecordingStatus;
      }
      logInfo('Permissions', `Permission status after prompt: ${screenRecordingStatus}`);
    }
  } else {
    logInfo('Permissions', '✅ Screen recording permission already granted');
  }

  // Trigger Accessibility prompt immediately if missing
  if (accessibilityStatus !== 'authorized' && typeof systemPreferences.isTrustedAccessibilityClient === 'function') {
    try {
      const trusted = systemPreferences.isTrustedAccessibilityClient(true);
      accessibilityPrompted = true;
      accessibilityStatus = trusted ? 'authorized' : (accessibilityStatus === 'unknown' ? 'denied' : accessibilityStatus);
      logInfo('Permissions', `Accessibility trust prompt displayed. New status: ${accessibilityStatus}`);
    } catch (error) {
      logWarn('Permissions', `Startup Accessibility prompt failed: ${error?.message || error}`);
    }
  }

  logInfo('Permissions', '');
  logInfo('Permissions', '===========================================================');
  logInfo('Permissions', 'Startup Permission Summary:');
  logInfo('Permissions', `  Screen Recording: ${screenRecordingStatus} ${screenRecordingStatus === 'granted' ? '✅' : '❌'}`);
  logInfo('Permissions', `  Accessibility: ${accessibilityStatus} ${accessibilityStatus === 'authorized' ? '✅' : '❌'}`);
  logInfo('Permissions', `  Screen Prompted: ${screenPrompted ? 'Yes' : 'No'}`);
  logInfo('Permissions', `  Accessibility Prompted: ${accessibilityPrompted ? 'Yes' : 'No'}`);
  
  if (screenRecordingStatus !== 'granted' || accessibilityStatus !== 'authorized') {
    logWarn('Permissions', '');
    logWarn('Permissions', '⚠️  Some permissions are missing. The app may not function correctly.');
    logWarn('Permissions', 'Please grant the required permissions in System Settings:');
    if (screenRecordingStatus !== 'granted') {
      logWarn('Permissions', '  → System Settings → Privacy & Security → Screen Recording');
    }
    if (accessibilityStatus !== 'authorized') {
      logWarn('Permissions', '  → System Settings → Privacy & Security → Accessibility');
    }
  }
  
  logInfo('Permissions', '===========================================================');

  return { screenRecordingStatus, accessibilityStatus, screenPrompted, accessibilityPrompted };
}

/*// Get app name for a specific display by finding the frontmost window on that display
async function getActiveAppNameForDisplay(displayIndex = 0) {
  if (process.platform !== 'darwin') {
    // On non-macOS, just return the frontmost app
    return await getActiveAppName();
  }
  
  try {
    const allDisplays = screen.getAllDisplays();
    // ADD THESE LOGS HERE
    sendToRendererConsole('ActiveWindow', `Total displays: ${allDisplays.length}`);
    allDisplays.forEach((d, i) => {
      sendToRendererConsole('ActiveWindow', `Display ${i+1} bounds: ${JSON.stringify(d.bounds)}`);
    });
    if (displayIndex < 0 || displayIndex >= allDisplays.length) {
      logWarn('ActiveWindow', `Invalid display index ${displayIndex}, using primary display`);
      return await getActiveAppName();
    }
    
    const targetDisplay = allDisplays[displayIndex];
    const displayCenterX = targetDisplay.bounds.x + (targetDisplay.bounds.width / 2);
    const displayCenterY = targetDisplay.bounds.y + (targetDisplay.bounds.height / 2);
    
    sendToRendererConsole('ActiveWindow',  `Target display ${displayIndex + 1} center: x=${displayCenterX}, y=${displayCenterY}, bounds=${JSON.stringify(targetDisplay.bounds)}`);
    
    // Try to use @paymoapp/active-window first (better macOS handling), then active-win
    const accessibilityStatus = await checkMacOSAccessibilityPermission();
    if (accessibilityStatus === 'authorized') {
      try {
        const { result, provider } = await getActiveWindowDetails(true);
        if (result && result.bounds) {
          // Check if the window is on the target display
          const windowCenterX = result.bounds.x + (result.bounds.width / 2);
          const windowCenterY = result.bounds.y + (result.bounds.height / 2);
          
          // Check if window center is within the target display bounds
          if (windowCenterX >= targetDisplay.bounds.x &&
              windowCenterX < targetDisplay.bounds.x + targetDisplay.bounds.width &&
              windowCenterY >= targetDisplay.bounds.y &&
              windowCenterY < targetDisplay.bounds.y + targetDisplay.bounds.height) {
            // Window is on target display, process it
            return processActiveWindowResult(result);
          } else {
            // Window is on a different display, try AppleScript to get windows on target display
            logInfo('ActiveWindow', `${provider || 'active window provider'} window is on different display, using AppleScript for display ${displayIndex + 1}`);
          }
        }
      } catch (error) {
        logWarn('ActiveWindow', `Active window provider failed for display ${displayIndex + 1}, using AppleScript: ${error.message}`);
      }
    }
    
    // Fallback to AppleScript to get windows on the target display
    return await getActiveAppNameForDisplayViaAppleScript(displayIndex, targetDisplay);
  } catch (error) {
    logWarn('ActiveWindow', `Error getting app name for display ${displayIndex + 1}: ${error.message}`);
    // Fallback to regular getActiveAppName
    return await getActiveAppName();
  }
}*/

function intersectionArea(a, b) {
  const x = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return x * y;
}

//Remove if doesn't work
async function getAppNameForDisplay(displayIndex) {
  try {
    const displays = screen.getAllDisplays();
    const display = displays[displayIndex];
    if (!display) return null;

    // macOS: no reliable per-display app info without native addon
    if (process.platform === 'darwin') {
      return null;
    }

    // You already use this elsewhere — reuse it
    const windows = getWindowsSnapshot();
    if (!windows || !windows.length) return null;

    let bestMatch = null;
    let maxArea = 0;

    for (const win of windows) {
      if (!win.bounds || win.isMinimized) continue;

      const area = intersectionArea(display.bounds, win.bounds);
      if (area > maxArea) {
        maxArea = area;
        bestMatch = win;
      }
    }

    if (!bestMatch) return null;

    const owner = bestMatch.processName || bestMatch.executable || null;
    const title = bestMatch.title || null;

    if (owner && title && owner !== title) {
      return `${owner} - ${title}`;
    }
    return owner || title || null;

  } catch (e) {
    logWarn('ActiveWindow', e.message);
    return null;
  }
}


// Get app name for a specific display using AppleScript
async function getActiveAppNameForDisplayViaAppleScript(displayIndex, targetDisplay) {
  return new Promise((resolve) => {
    if (process.platform !== 'darwin') {
      return resolve(null);
    }
    
    // AppleScript to get the frontmost window on a specific display
    // We'll get all windows and find the one whose center is on the target display
    const displayCenterX = targetDisplay.bounds.x + (targetDisplay.bounds.width / 2);
    const displayCenterY = targetDisplay.bounds.y + (targetDisplay.bounds.height / 2);
    
    const command = `osascript -e 'tell application "System Events"
      set targetX to ${displayCenterX}
      set targetY to ${displayCenterY}
      set foundApp to ""
      set foundTitle to ""
      
      -- Try to find a window near the center of the target display
      try
        set allApps to every application process whose visible is true
        repeat with appProc in allApps
          try
            set appWindows to every window of appProc whose visible is true
            repeat with appWindow in appWindows
              try
                set winPos to position of appWindow
                set winSize to size of appWindow
                set winCenterX to (item 1 of winPos) + (item 1 of winSize) / 2
                set winCenterY to (item 2 of winPos) + (item 2 of winSize) / 2
                
                -- Check if window center is within display bounds (with some tolerance)
                if winCenterX >= ${targetDisplay.bounds.x} and winCenterX < ${targetDisplay.bounds.x + targetDisplay.bounds.width} and
                   winCenterY >= ${targetDisplay.bounds.y} and winCenterY < ${targetDisplay.bounds.y + targetDisplay.bounds.height} then
                  set foundApp to name of appProc
                  try
                    set foundTitle to name of appWindow
                  on error
                    try
                      set foundTitle to title of appWindow
                    on error
                      set foundTitle to ""
                    end try
                  end try
                  exit repeat
                end if
              end try
            end repeat
            if foundApp is not "" then exit repeat
          end try
        end repeat
      end try
      
      -- Fallback: if no window found, get the frontmost app
      if foundApp is "" then
        try
          set frontApp to first application process whose frontmost is true
          set foundApp to name of frontApp
          try
            set frontWindow to first window of frontApp whose visible is true
            try
              set foundTitle to name of frontWindow
            on error
              try
                set foundTitle to title of frontWindow
              on error
                set foundTitle to ""
              end try
            end try
          end try
        end try
      end if
      
      return foundApp & "|" & foundTitle
    end tell'`;

    const { exec } = require('child_process');
    exec(command, { timeout: 3000 }, (error, stdout, stderr) => {
      if (error) {
        logWarn('ActiveWindow', `AppleScript error for display ${displayIndex + 1}: ${error.message}`);
        return resolve(null);
      }
      if (stderr) {
        logWarn('ActiveWindow', `AppleScript stderr for display ${displayIndex + 1}: ${stderr}`);
      }
      
      const result = stdout.trim();
      if (result && result.length > 0) {
        const parts = result.split('|');
        const appName = parts[0] ? parts[0].trim() : null;
        const windowTitle = parts[1] ? parts[1].trim() : null;
        
        logInfo('ActiveWindow', `AppleScript for display ${displayIndex + 1} - App: ${appName || 'null'}, Title: ${windowTitle || 'null'}`);
        
        // Process the result similar to getActiveAppName
        const processed = processActiveWindowResult({
          owner: { name: appName },
          title: windowTitle
        });
        
        resolve(processed);
      } else {
        logWarn('ActiveWindow', `AppleScript returned empty result for display ${displayIndex + 1}`);
        resolve(null);
      }
    });
  });
}

// Helper function to process active window result (extracted from getActiveAppName)
function processActiveWindowResult(result) {
  if (!result) return null;
  
  const appName = app.getName();
  const appNameLower = appName.toLowerCase();
  
  let ownerName = typeof result.owner?.name === 'string' ? result.owner.name.trim() : null;
  let windowTitle = typeof result.title === 'string' ? result.title.trim() : null;
  
  const isOwnApp = (ownerName && ownerName.toLowerCase() === appNameLower) || 
                   (windowTitle && windowTitle.toLowerCase() === appNameLower) ||
                   (ownerName && ownerName.toLowerCase().includes('time tracker')) ||
                   (ownerName && ownerName.toLowerCase().includes('electron') && ownerName.toLowerCase().includes('time'));
  
  if (isOwnApp) {
    return appName;
  }
  
  const genericNames = ['electron', 'node', 'nodejs'];
  if (ownerName) {
    const ownerNameLower = ownerName.toLowerCase();
    if (genericNames.some(generic => ownerNameLower === generic || ownerNameLower === `${generic}.exe`)) {
      ownerName = null;
    }
  }
  
  if (windowTitle) {
    const windowTitleLower = windowTitle.toLowerCase();
    if (windowTitleLower === 'electron' || windowTitleLower === 'node') {
      windowTitle = null;
    }
  }
  
  let finalAppName = null;
  if (process.platform === 'darwin') {
    if (ownerName) {
      if (windowTitle && windowTitle.length > 0) {
        const windowTitleLower = windowTitle.toLowerCase();
        const ownerNameLower = ownerName.toLowerCase();
        
        if (windowTitleLower.includes(ownerNameLower) && windowTitleLower.length > ownerNameLower.length) {
          finalAppName = windowTitle;
        } else if (windowTitle !== ownerName) {
          finalAppName = `${ownerName} - ${windowTitle}`;
        } else {
          finalAppName = ownerName;
        }
      } else {
        finalAppName = ownerName;
      }
    } else if (windowTitle) {
      finalAppName = windowTitle;
    }
  } else {
    if (ownerName) {
      if (windowTitle && windowTitle.length > 0 && windowTitle !== ownerName) {
        finalAppName = `${ownerName} - ${windowTitle}`;
      } else {
        finalAppName = ownerName;
      }
    } else if (windowTitle) {
      finalAppName = windowTitle;
    }
  }
  
  return finalAppName;
}

async function getActiveAppName() {
  try {
    // Try active-win first (provides more detailed information)
    let result = null;
    let useAppleScriptFallback = false;
    const preferPaymo = process.platform === 'darwin';
    
    // On macOS, check for Accessibility permission first
    if (process.platform === 'darwin') {
      const accessibilityStatus = await checkMacOSAccessibilityPermission();
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
        const { result: providerResult, provider } = await getActiveWindowDetails(preferPaymo);
        result = providerResult;
        if (result) {
          // On Mac, if provider succeeded but didn't return a window title, try AppleScript to get it
          if (process.platform === 'darwin' && (!result.title || result.title.trim() === '')) {
            logInfo('ActiveWindow', `${provider || 'active window provider'} returned no window title, trying AppleScript to get title`);
            const appleScriptResult = await getActiveAppNameViaAppleScript();
            if (appleScriptResult && appleScriptResult.title && appleScriptResult.title.trim() !== '') {
              // Merge the window title from AppleScript with the result from active-win
              result.title = appleScriptResult.title;
              logInfo('ActiveWindow', `Merged window title from AppleScript: ${result.title}`);
            }
          }
        } else {
          logWarn('ActiveWindow', 'Active window provider returned no result, will try AppleScript fallback');
          useAppleScriptFallback = true;
        }
      } catch (error) {
        logWarn('ActiveWindow', `Active window provider failed: ${error.message}, will try AppleScript fallback`);
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
      const supabaseUrl = process.env.SUPABASE_URL;
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
      
      if (!supabaseUrl) {
        logError('Supabase', 'SUPABASE_URL environment variable is not set');
        return null;
      }
      
      if (!serviceRoleKey) {
        logError('Supabase', 'Neither SUPABASE_SERVICE_ROLE_KEY nor SUPABASE_ANON_KEY is set');
        return null;
      }
      
      supabaseClientInstance = createClient(supabaseUrl, serviceRoleKey);
      logInfo('Supabase', 'Supabase client initialized successfully');
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

  // OPTIMIZATION: avoid re-compression if the input is already a JPEG data URL.
  // This logic is intentionally kept outside the sharp loading try/catch so
  // it runs on every call (not just the first one) and is not swallowed by
  // sharp loading errors.
  const extractBase64FromDataUrl = (dataUrlValue) => {
    if (typeof dataUrlValue !== 'string' || dataUrlValue.length === 0) {
      throw new Error('Invalid data URL: value is empty or not a string');
    }

    const parts = dataUrlValue.split(',');
    if (!parts[1]) {
      throw new Error('Invalid data URL: missing base64 payload after comma');
    }

    return parts[1];
  };

  const isAlreadyJpeg = dataUrl.includes('data:image/jpeg');
  if (isAlreadyJpeg) {
    const base64 = extractBase64FromDataUrl(dataUrl);
    const jpegBuffer = Buffer.from(base64, 'base64');
    logInfo('Compress', `JPEG (pre-compressed): ${(jpegBuffer.length / 1024).toFixed(2)} KB`);
    return jpegBuffer;
  }

  const base64 = extractBase64FromDataUrl(dataUrl);
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

// Process toast queue - handles multiple screens by showing toasts on correct displays
function processToastQueue() {
  if (isProcessingToastQueue || toastQueue.length === 0) {
    return;
  }
  
  isProcessingToastQueue = true;
  logInfo('Toast', `Processing toast queue: ${toastQueue.length} item(s) pending`);
  
  // Process all toasts in the queue (one per screen)
  // Group by displayId to handle multiple screens properly
  const toastsByDisplay = new Map();
  while (toastQueue.length > 0) {
    const toastItem = toastQueue.shift();
    if (!toastItem) continue;
    
    const { filePath, base64Data, screenIndex, displayId } = toastItem;
    
    // Skip toasts without valid base64Data (prevents null preview toasts)
    if (!base64Data) {
      logWarn('Toast', `  Skipping toast without base64Data: filePath=${filePath ? path.basename(filePath) : 'null'}, screenIndex=${screenIndex || 0}`);
      continue;
    }
    
    // Use displayId as key if available, otherwise fall back to screenIndex
    const key = displayId || `screen-${screenIndex || 0}`;
    
    logInfo('Toast', `  Queued toast: displayKey="${key}", screenIndex=${screenIndex || 0}, displayId=${displayId || 'N/A'}, filePath=${filePath ? path.basename(filePath) : 'null'}, hasBase64Data=${!!base64Data}`);
    
    // Keep only the most recent toast per display (this ensures if multiple toasts are queued for same display, only the latest one is shown)
    toastsByDisplay.set(key, { filePath, base64Data, screenIndex: screenIndex || 0, displayId });
  }
  
  logInfo('Toast', `Grouped into ${toastsByDisplay.size} unique display(s)`);
  
  // Create/update toast for each display
  toastsByDisplay.forEach((toastItem, displayKey) => {
    const { filePath, base64Data, screenIndex, displayId } = toastItem;
    
    logInfo('Toast', `Creating toast for displayKey="${displayKey}" (screenIndex=${screenIndex}, displayId=${displayId || 'N/A'})`);
    
    // Check if there's an existing toast for this display
    const existingToast = toastWindows.get(displayKey);
    
    if (existingToast && !existingToast.isDestroyed()) {
      const existingToastAge = Date.now() - (existingToast._createdAt || 0);
      const delay = existingToastAge < 1000 ? (process.platform === 'darwin' ? 600 : 500) : 0;
      logInfo('Toast', `  Existing toast found (age: ${existingToastAge}ms), will close and recreate after ${delay}ms delay`);
      
      setTimeout(() => {
        if (existingToast && !existingToast.isDestroyed()) {
          existingToast.close();
          toastWindows.delete(displayKey);
          logInfo('Toast', `  Closed existing toast for displayKey="${displayKey}"`);
        }
        // Create new toast after closing the old one
        setTimeout(() => {
          createToastWindow(filePath, base64Data, screenIndex, displayId);
        }, process.platform === 'darwin' ? 100 : 50);
      }, delay);
    } else {
      // No existing toast for this display, create immediately
      logInfo('Toast', `  No existing toast, creating immediately`);
      createToastWindow(filePath, base64Data, screenIndex, displayId);
    }
  });
  
  isProcessingToastQueue = false;
  logInfo('Toast', `Toast queue processing completed`);
}

function showToastNotification(filePath, base64Data, screenIndex = null, displayId = null) {
  try {
    // Validate inputs
    if (!filePath || !base64Data) {
      logWarn('Toast', 'Invalid toast notification data - missing filePath or base64Data');
      return;
    }
    
    // Add to queue with screenIndex and displayId to show on correct display
    // This allows multiple toasts to be shown simultaneously (one per screen)
    toastQueue.push({ filePath, base64Data, screenIndex: screenIndex || 0, displayId, timestamp: Date.now() });
    
    // Process queue with a small delay to batch rapid captures
    // This ensures each screen gets its own toast with the correct preview
    setTimeout(() => {
      processToastQueue();
    }, 100);
  } catch (error) {
    logError('Toast', `Error queuing toast notification: ${error.message}`, error);
    // Try to create toast anyway, even if there was an error
    try {
      const retryDelay = process.platform === 'darwin' ? 200 : 0;
      setTimeout(() => {
        createToastWindow(filePath, base64Data, screenIndex || 0, displayId);
      }, retryDelay);
    } catch (e) {
      logError('Toast', `Failed to create toast window: ${e.message}`, e);
    }
  }
}

function createToastWindow(filePath, base64Data, screenIndex = 0, displayId = null) {
  try {
    logInfo('Toast', '===========================================================');
    logInfo('Toast', `Creating toast window: screenIndex=${screenIndex}, displayId=${displayId || 'N/A'}, filePath=${filePath ? path.basename(filePath) : 'null'}`);
    
    // Use a consistent, sufficiently large size on all platforms so that
    // the preview image + side column (delete button + timer) are fully visible.
    // On macOS the previous smaller size (300x200) caused the side column
    // to be clipped, which made the delete button and 5s timer invisible.
    const TOAST_WIDTH = 520;
    const TOAST_HEIGHT = 340;
    const windowOptions = {
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
    };
    
    // macOS-specific settings for better visibility and reliability
    if (process.platform === 'darwin') {
      windowOptions.acceptsFirstMouse = true;
      // Don't use 'panel' type as it can cause visibility issues
      // Instead rely on alwaysOnTop and setVisibleOnAllWorkspaces
    }
    
    const newToastWin = new BrowserWindow(windowOptions);

    // Track when this toast was created
    newToastWin._createdAt = Date.now();
    
    // Use displayId as key if available, otherwise use screenIndex
    const displayKey = displayId || `screen-${screenIndex}`;
    logInfo('Toast', `Using displayKey="${displayKey}" for toast window map`);
    
    // Store in both the Map (for multi-screen) and the legacy variable (for backward compatibility)
    toastWindows.set(displayKey, newToastWin);
    toastWin = newToastWin; // Keep for backward compatibility

    // Position toast on the correct display using display bounds directly
    // This ensures toast appears on the correct monitor without relying on cursor position
    const allDisplays = screen.getAllDisplays();
    logInfo('Toast', `Available displays: ${allDisplays.length}`);
    allDisplays.forEach((d, idx) => {
      logInfo('Toast', `  Display ${idx + 1}: ID=${d.id}, Bounds=(${d.bounds.x}, ${d.bounds.y}, ${d.bounds.width}, ${d.bounds.height})`);
    });
    
    let targetDisplay = null;
    let displaySelectionMethod = 'unknown';
    
    // First, try to find display by displayId (most reliable)
    if (displayId) {
      targetDisplay = allDisplays.find(d => String(d.id) === String(displayId));
      if (targetDisplay) {
        displaySelectionMethod = 'displayId';
        logInfo('Toast', `  ✓ Found display using displayId=${displayId}: Display ID=${targetDisplay.id}`);
      } else {
        logWarn('Toast', `  ⚠ displayId=${displayId} provided but no matching display found`);
      }
    }
    
    // Fallback: try to find the display that matches the screenIndex
    if (!targetDisplay && screenIndex > 0 && screenIndex <= allDisplays.length) {
      // screenIndex from desktopCapturer is usually 1-based, so subtract 1
      targetDisplay = allDisplays[screenIndex - 1];
      displaySelectionMethod = 'screenIndex';
      logInfo('Toast', `  ✓ Found display using screenIndex=${screenIndex}: Display ID=${targetDisplay.id}`);
    }
    
    // Final fallback: use primary display
    if (!targetDisplay) {
      targetDisplay = screen.getPrimaryDisplay();
      displaySelectionMethod = 'primary-fallback';
      logWarn('Toast', `  ⚠ Using primary display as fallback: Display ID=${targetDisplay.id}`);
    }
    
    if (!targetDisplay) {
      targetDisplay = allDisplays[0] || screen.getPrimaryDisplay();
      displaySelectionMethod = 'first-available';
      logWarn('Toast', `  ⚠ Using first available display: Display ID=${targetDisplay.id}`);
    }
    
    // Use display bounds directly to position toast (not workArea, as suggested)
    // Position in bottom-right corner with 20px margin
    const x = targetDisplay.bounds.x + targetDisplay.bounds.width - TOAST_WIDTH - 5;
    const y = targetDisplay.bounds.y + targetDisplay.bounds.height - TOAST_HEIGHT - 52;
    newToastWin.setPosition(x, y);
    
    sendToRendererConsole("Toast display bounds:", targetDisplay.bounds);
    sendToRendererConsole("Toast window position:", {
      x: x,
      y: y
    });
    
    logInfo('Toast', `Toast positioning:`);
    logInfo('Toast', `  Selection method: ${displaySelectionMethod}`);
    logInfo('Toast', `  Target display: ID=${targetDisplay.id}, Name="${targetDisplay.name || 'Unknown'}"`);
    logInfo('Toast', `  Display bounds: (${targetDisplay.bounds.x}, ${targetDisplay.bounds.y}, ${targetDisplay.bounds.width}, ${targetDisplay.bounds.height})`);
    logInfo('Toast', `  Toast position: (${x}, ${y})`);
    logInfo('Toast', `  Toast size: ${TOAST_WIDTH}x${TOAST_HEIGHT}`);

    newToastWin.loadFile(path.join(__dirname, 'assets', 'toast.html'));

    newToastWin.once('ready-to-show', () => {
      // Check if window still exists (might have been closed)
      if (!newToastWin || newToastWin.isDestroyed()) {
        logWarn('Toast', `Toast window for displayKey="${displayKey}" was destroyed before ready-to-show`);
        toastWindows.delete(displayKey);
        return;
      }
      
      try {
        // On Mac, use show() instead of showInactive() for better reliability
        // Add a small delay to ensure the window is properly initialized
        const showDelay = process.platform === 'darwin' ? 150 : 0;
        setTimeout(() => {
          if (!newToastWin || newToastWin.isDestroyed()) {
            logWarn('Toast', `Toast window for displayKey="${displayKey}" was destroyed before showing`);
            toastWindows.delete(displayKey);
            return;
          }
          
          // On Mac, ensure the window is properly shown and visible
          if (process.platform === 'darwin') {
            try {
              // Set visibility on all workspaces for macOS (must be called before show)
              newToastWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
              // Ensure window is on top and visible
              newToastWin.setAlwaysOnTop(true, 'screen-saver');
              // Show the window
              newToastWin.show();
              // Move to top after showing
              newToastWin.moveTop();
              logInfo('Toast', `Toast window for screen ${screenIndex} shown on macOS with visibility settings applied`);
              
              // Additional macOS-specific visibility fixes after a brief delay
              setTimeout(() => {
                if (newToastWin && !newToastWin.isDestroyed()) {
                  try {
                    // Re-apply visibility settings to ensure they stick
                    newToastWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
                    newToastWin.setAlwaysOnTop(true, 'screen-saver');
                    newToastWin.moveTop();
                    // Ensure window is actually visible
                    if (!newToastWin.isVisible()) {
                      logWarn('Toast', `Toast window for screen ${screenIndex} not visible, attempting to show again`);
                      newToastWin.show();
                    }
                    logInfo('Toast', `Toast window for screen ${screenIndex} visibility verified: isVisible=${newToastWin.isVisible()}, isDestroyed=${newToastWin.isDestroyed()}`);
                  } catch (e) {
                    logError('Toast', `Error in macOS visibility check for screen ${screenIndex}: ${e.message}`, e);
                  }
                }
              }, 100);
            } catch (macError) {
              logError('Toast', `Error applying macOS visibility settings for screen ${screenIndex}: ${macError.message}`, macError);
              // Fallback: just show the window
              newToastWin.show();
            }
          } else {
            newToastWin.showInactive();
          }
          
          logInfo('Toast', `✓ Toast window successfully shown for displayKey="${displayKey}" (screen ${screenIndex})`);
          logInfo('Toast', `  File: ${path.basename(filePath)}`);
          logInfo('Toast', `  Position: (${x}, ${y})`);
          logInfo('Toast', `  Display: ID=${targetDisplay.id}, Name="${targetDisplay.name || 'Unknown'}"`);
          
          // Send init message after a brief delay to ensure window is ready
          // Validate base64Data before sending
          const initDelay = process.platform === 'darwin' ? 100 : 50;
          setTimeout(() => {
            if (newToastWin && !newToastWin.isDestroyed() && newToastWin.webContents && !newToastWin.webContents.isDestroyed()) {
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
              
              newToastWin.webContents.send('toast-init', { filePath, base64Data: validBase64Data });
              logInfo('Toast', `Sent init message to screen ${screenIndex} toast with preview data (length: ${validBase64Data ? validBase64Data.length : 0})`);
            } else {
              logWarn('Toast', `Toast webContents for screen ${screenIndex} was destroyed before sending init message`);
            }
          }, initDelay);
        }, showDelay);
      } catch (error) {
        logError('Toast', `Error showing toast window for screen ${screenIndex}: ${error.message}`, error);
      }
    });

    // Handle errors during load
    newToastWin.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
      logError('Toast', `Failed to load assets/toast.html for displayKey="${displayKey}": ${errorCode} - ${errorDescription}`);
    });

    // Auto-close after 9 seconds
    setTimeout(() => { 
      if (newToastWin && !newToastWin.isDestroyed()) {
        logInfo('Toast', `Auto-closing toast window for displayKey="${displayKey}" after 9 seconds`);
        newToastWin.close(); 
      }
    }, 9000);
    
    newToastWin.on('closed', () => { 
      logInfo('Toast', `Toast window closed for displayKey="${displayKey}"`);
      toastWindows.delete(displayKey);
      // Only clear toastWin if this was the last one
      if (toastWin === newToastWin) {
        toastWin = null;
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
// Supports both schemas:
// 1) Legacy schema: screenshots.user_email (TEXT) - tried first
// 2) New schema: screenshots.user_id (INTEGER FK -> users.id) - fallback
async function insertScreenshotToDatabase(
  supabase,
  userEmail,
  frappeTimesheetId,
  publicUrl,
  timestamp,
  appName,
  isIdle,
  frappeProjectId = null,
  frappeTaskId = null,
  timeTrackerSessionId = null
) {
  // Normalize email to match how it's stored in the DB
  const normalizedEmail =
    typeof userEmail === 'string' ? userEmail.trim().toLowerCase() : null;

  if (!normalizedEmail) {
    throw new Error(
      'insertScreenshotToDatabase: userEmail is required to resolve user identity'
    );
  }

  // Get company for the user
  let company = null;
  try {
    company = await frappeGetUserCompany(userEmail);
    if (company) {
      logInfo('DB', `Got company for user ${userEmail}: ${company}`);
    }
  } catch (companyError) {
    logWarn('DB', `Error getting company for user ${userEmail}: ${companyError.message}`);
    // Continue without company - non-fatal
  }

  // Normalize frappeTimesheetId: store as frappe_timesheet_id (Frappe timesheet ID)
  // frappe_timesheet_id is TEXT to support Frappe timesheet IDs (e.g., "TS-2025-00043")
  let normalizedTimesheetId = null;
  if (frappeTimesheetId && typeof frappeTimesheetId === 'string') {
    normalizedTimesheetId = frappeTimesheetId.trim();
    // Empty strings should be null
    if (normalizedTimesheetId === '') {
      normalizedTimesheetId = null;
    }
  }
  
  // Normalize Frappe project and task IDs
  const normalizedProjectId = frappeProjectId && typeof frappeProjectId === 'string' ? frappeProjectId.trim() : (frappeProjectId || null);
  const normalizedTaskId = frappeTaskId && typeof frappeTaskId === 'string' ? frappeTaskId.trim() : (frappeTaskId || null);

  // First try the legacy schema that uses user_email (most common)
  try {
    // Build insert object with renamed columns (frappe_timesheet_id, frappe_project_id, frappe_task_id)
    // screenshot_data stores the Supabase storage bucket public URL, not base64 data
    const insertData = {
      user_email: normalizedEmail,
      frappe_timesheet_id: normalizedTimesheetId, // Frappe timesheet ID (e.g., "TS-2025-00043")
      screenshot_data: publicUrl, // Storage bucket public URL
      captured_at: timestamp,
      // Attempt to set captured_idle when the column exists; fallback logic below will retry without it if missing
      captured_idle: Boolean(isIdle)
    };
    
    // Add time_session_id (time_sessions.id) if available
    if (timeTrackerSessionId && typeof timeTrackerSessionId === 'number') {
      insertData.time_session_id = timeTrackerSessionId;
    }
    
    // Add company if available
    if (company) {
      insertData.company = company;
    }
    
    // Add Frappe project and task IDs if provided
    if (normalizedProjectId) {
      insertData.frappe_project_id = normalizedProjectId;
    }
    if (normalizedTaskId) {
      insertData.frappe_task_id = normalizedTaskId;
    }
    
    // Add optional app_name if provided; fallback logic below handles column absence
    if (appName) {
      insertData.app_name = appName;
    }
    
    const { error: legacyErr } = await supabase.from('screenshots').insert(insertData);

    if (legacyErr) {
      // Check if error is because user_email column doesn't exist
      const errorMsg = String(legacyErr.message || '');
      if (errorMsg.includes('column "user_email"') || errorMsg.includes('column user_email does not exist')) {
        logWarn(
          'DB',
          `user_email column not found, trying user_id schema: ${errorMsg}`
        );
        throw legacyErr; // Will be caught and handled by fallback
      }
      
      // If error is about captured_idle or app_name column, try again without them
      if (errorMsg.includes('column "captured_idle"') || errorMsg.includes('column "app_name"') || 
          errorMsg.includes('column captured_idle does not exist') || errorMsg.includes('column app_name does not exist')) {
        logWarn(
          'DB',
          `Optional column missing, retrying without it: ${errorMsg}`
        );
        // Retry with minimal required columns only (without captured_idle and app_name)
        // screenshot_data stores the Supabase storage bucket public URL
        const minimalInsert = {
          user_email: normalizedEmail,
          frappe_timesheet_id: normalizedTimesheetId, // Frappe timesheet ID
          screenshot_data: publicUrl, // Storage bucket public URL
          captured_at: timestamp
        };
        
        // Add time_session_id (time_sessions.id) if available
        if (timeTrackerSessionId && typeof timeTrackerSessionId === 'number') {
          minimalInsert.time_session_id = timeTrackerSessionId;
        }
        
        // Add company if available
        if (company) {
          minimalInsert.company = company;
        }
        
        // Add Frappe IDs if available
        if (normalizedProjectId) {
          minimalInsert.frappe_project_id = normalizedProjectId;
        }
        if (normalizedTaskId) {
          minimalInsert.frappe_task_id = normalizedTaskId;
        }
        
        // Note: captured_idle is omitted here because column doesn't exist yet
        // After running migration, it will be included in the main insert
        const { error: retryErr } = await supabase.from('screenshots').insert(minimalInsert);
        if (retryErr) {
          logError(
            'DB',
            `Failed to insert screenshot even with minimal columns: ${retryErr.message}`,
            retryErr
          );
          throw retryErr;
        }
        logInfo(
          'DB',
          `Inserted screenshot row using user_email=${normalizedEmail} (minimal columns)`
        );
        return;
      }
      
      logError(
        'DB',
        `Failed to insert screenshot row using user_email=${normalizedEmail}: ${legacyErr.message}`,
        legacyErr
      );
      throw legacyErr;
    }

    logInfo(
      'DB',
      `Inserted screenshot row using user_email=${normalizedEmail}`
    );
    return;
  } catch (err) {
    // If the error suggests that user_email column doesn't exist,
    // try the new schema that uses user_id and a users table.
    const msg = String(err?.message || err);
    const looksLikeNewSchema =
      msg.includes('column "user_email"') ||
      msg.includes('column user_email does not exist') ||
      msg.includes('does not exist');

    if (!looksLikeNewSchema) {
      // Unexpected error – rethrow so batch logic can handle it.
      throw err;
    }

    logWarn(
      'DB',
      `Falling back to user_id schema for ${normalizedEmail}: ${msg}`
    );
  }

  // Fallback: Try new schema with user_id
  try {
    const { data: userRow, error: userErr } = await supabase
      .from('users')
      .select('id')
      .eq('email', normalizedEmail)
      .maybeSingle();

    if (userErr) {
      logError(
        'DB',
        `Failed to look up user_id for email ${normalizedEmail}: ${userErr.message}`,
        userErr
      );
      throw userErr;
    }

    if (!userRow || typeof userRow.id !== 'number') {
      const msg = `insertScreenshotToDatabase: No user found for email ${normalizedEmail} in users table`;
      logError('DB', msg);
      throw new Error(msg);
    }

    const userId = userRow.id;

    // screenshot_data stores the Supabase storage bucket public URL, not base64 data
    let insertPayload = {
      user_id: userId,
      frappe_timesheet_id: normalizedTimesheetId, // Frappe timesheet ID (e.g., "TS-2025-00043")
      screenshot_data: publicUrl, // Storage bucket public URL
      captured_at: timestamp
    };
    
    // Add time_session_id (time_sessions.id) if available
    if (timeTrackerSessionId && typeof timeTrackerSessionId === 'number') {
      insertPayload.time_session_id = timeTrackerSessionId;
    }
    
    // Add company if available
    if (company) {
      insertPayload.company = company;
    }
    
    // Add Frappe project and task IDs if provided
    if (normalizedProjectId) {
      insertPayload.frappe_project_id = normalizedProjectId;
    }
    if (normalizedTaskId) {
      insertPayload.frappe_task_id = normalizedTaskId;
    }
    
    // Add optional fields if they exist
    if (appName) {
      insertPayload.app_name = appName;
    }
    insertPayload.captured_idle = Boolean(isIdle);
    
    const { error: dbErr } = await supabase.from('screenshots').insert(insertPayload);

    if (dbErr) {
      const errorMsg = String(dbErr.message || '');
      
      // If error is about optional columns, retry without them
      if (errorMsg.includes('column "captured_idle"') || errorMsg.includes('column "app_name"') || 
          errorMsg.includes('column captured_idle does not exist') || errorMsg.includes('column app_name does not exist')) {
        logWarn(
          'DB',
          `Optional column missing, retrying without it: ${errorMsg}`
        );
        const minimalPayload = {
          user_id: userId,
          frappe_timesheet_id: normalizedTimesheetId,
          screenshot_data: publicUrl,
          captured_at: timestamp
        };
        
        // Add company if available
        if (company) {
          minimalPayload.company = company;
        }
        
        // Add Frappe IDs if available
        if (normalizedProjectId) {
          minimalPayload.frappe_project_id = normalizedProjectId;
        }
        if (normalizedTaskId) {
          minimalPayload.frappe_task_id = normalizedTaskId;
        }
        const { error: retryErr } = await supabase.from('screenshots').insert(minimalPayload);
        if (retryErr) {
          logError(
            'DB',
            `Failed to insert screenshot even with minimal columns: ${retryErr.message}`,
            retryErr
          );
          throw retryErr;
        }
        logInfo(
          'DB',
          `Inserted screenshot row using user_id=${userId} (minimal columns)`
        );
        return;
      }
      
      logError(
        'DB',
        `Failed to insert screenshot for user_id ${userId}: ${dbErr.message}`,
        dbErr
      );
      throw dbErr;
    }

    logInfo(
      'DB',
      `Inserted screenshot row using user_id=${userId} for ${normalizedEmail}`
    );
    return;
  } catch (err) {
    logError(
      'DB',
      `Both user_email and user_id schemas failed for ${normalizedEmail}: ${err?.message || err}`,
      err
    );
    throw err;
  }
}

// ============ SCREENSHOT BATCH QUEUE MANAGEMENT ============

// Add screenshot to batch queue and process if batch is full
async function addScreenshotToBatch(uploadData) {
  const {
    userEmail,
    sessionId,
    supabaseSessionId, // Numeric Supabase session ID for time_session_id column
    screenshotData,
    timestamp,
    isIdle,
    contextLabel,
    screenIndex,
    screenName,
    appName,
    displayId,
    frappeProjectId,
    frappeTaskId,
    // Optional explicit Frappe timesheet ID (preferred over inferring from sessionId)
    frappeTimesheetId: explicitFrappeTimesheetId
  } = uploadData;

  const screenSuffix = screenIndex ? `_screen${screenIndex}` : '';
  const jpegFilename = `${userEmail.replace(/@/g, '_at_').replace(/\./g, '_')}_${sessionId}_${timestamp.replace(/[:.]/g, '-')}${screenSuffix}.jpg`;

  try {
    // Resolve screenshots directory inside try-catch to handle potential errors
    // (e.g., permission denied, disk full, etc.)
    const screenshotsDir = resolveScreenshotsDir(true);
    const filePath = path.join(screenshotsDir, jpegFilename);

    try {
      // Pass screenIndex and displayId to show toast on the correct display
      showToastNotification(filePath, screenshotData, screenIndex, displayId);
    } catch {}

    // Use the provided appName if available (which should be screen-specific)
    // Otherwise fall back to getting the frontmost app
    let capturedAppName = appName;
    if (!capturedAppName) {
      try {
        // If we have screenIndex, try to get app name for that specific display
        if (screenIndex && screenIndex > 0) {
          const displayIndex = screenIndex - 1; // screenIndex is 1-based, convert to 0-based display index

          capturedAppName =
            (await getAppNameForDisplay(displayIndex)) ||
            (await getActiveAppName()) ||
            'Unknown';
        } else {
          // Fallback to regular getActiveAppName for single screen or unknown screen
          capturedAppName = (await getActiveAppName()) || 'Unknown';
        }
      } catch {
        capturedAppName = 'Unknown';
      }
    }

    const jpegBuffer = await compressToJpegBufferFromDataUrl(screenshotData);
    fs.writeFileSync(filePath, jpegBuffer);

    // Determine Frappe timesheet ID - prefer explicit value if provided,
    // otherwise infer from sessionId when it looks like a Timesheet ID (e.g., "TS-2025-00043")
    let frappeTimesheetId = null;
    if (explicitFrappeTimesheetId && typeof explicitFrappeTimesheetId === 'string') {
      frappeTimesheetId = explicitFrappeTimesheetId.trim() || null;
    }
    if (!frappeTimesheetId && sessionId && typeof sessionId === 'string' && sessionId.startsWith('TS-')) {
      frappeTimesheetId = sessionId;
    }
    
    const batchItem = {
      userEmail,
      sessionId, // Keep original for database insert (can be Supabase session ID or Frappe timesheet ID)
      supabaseSessionId: supabaseSessionId || null, // Numeric Supabase session ID for time_session_id column
      frappeTimesheetId, // Frappe timesheet ID for storage path & DB (null if not available)
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
      frappeProjectId: frappeProjectId || null,
      frappeTaskId: frappeTaskId || null,
      addedAt: Date.now()
    };

    screenshotBatchQueue.push(batchItem);
    pendingScreenshots.set(filePath, false);
    
    logInfo(contextLabel || 'BATCH-UPLOAD', `Screenshot added to batch queue. Queue size: ${screenshotBatchQueue.length}/${SCREENSHOT_BATCH_SIZE}`);

    // Ensure a single flush timer exists while there are items queued.
    scheduleBatchFlush();

    if (screenshotBatchQueue.length >= SCREENSHOT_BATCH_SIZE) {
      logInfo(contextLabel, `Batch full (${SCREENSHOT_BATCH_SIZE} screenshots), starting upload...`);
      const queueSizeBeforeProcessing = screenshotBatchQueue.length;
      
      // Try to process the batch - if it returns early, retry after a short delay
      let retryCount = 0;
      const maxRetries = 3;
      let wasProcessed = false;
      
      while (retryCount < maxRetries && screenshotBatchQueue.length >= SCREENSHOT_BATCH_SIZE && !wasProcessed) {
        await processScreenshotBatch();
        
        // Check if batch was actually processed
        const queueSizeAfterProcessing = screenshotBatchQueue.length;
        wasProcessed = queueSizeAfterProcessing < queueSizeBeforeProcessing;
        
        if (!wasProcessed) {
          if (isBatchUploading) {
            // Another batch is processing, wait a bit and retry
            logInfo('BATCH-UPLOAD', `Batch processing in progress, waiting before retry (attempt ${retryCount + 1}/${maxRetries})...`);
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
            retryCount++;
          } else if (screenshotBatchQueue.length === 0) {
            // Queue was cleared by another process, nothing to do
            wasProcessed = true;
            logInfo('BATCH-UPLOAD', 'Queue was cleared by another process');
          } else {
            // Queue still has items but processing returned early for unknown reason
            logWarn('BATCH-UPLOAD', `Batch processing returned early but queue still has ${screenshotBatchQueue.length} items. Retrying...`);
            retryCount++;
            if (retryCount < maxRetries) {
              await new Promise(resolve => setTimeout(resolve, 500)); // Wait 0.5 seconds
            }
          }
        }
      }
      
      if (!wasProcessed && screenshotBatchQueue.length >= SCREENSHOT_BATCH_SIZE) {
        logError('BATCH-UPLOAD', `Failed to process batch after ${maxRetries} attempts. Queue size: ${screenshotBatchQueue.length}`);
      }
      
      // If the queue is now empty, cancel any pending flush timer.
      // Note: We check batchFlushInterval here, but it might be null if a timer callback
      // is currently executing. That's okay - the timer callback will handle cleanup.
      if (screenshotBatchQueue.length === 0) {
        if (batchFlushInterval) {
          clearTimeout(batchFlushInterval);
          batchFlushInterval = null;
        }
        isFlushTimerActive = false;
        logInfo('BATCH-UPLOAD', 'Flush timer cleared after successful batch (queue empty)');
      } else {
        // Queue has items (possibly re-queued from failures or not yet processed)
        // If queue is still full, try processing again
        if (screenshotBatchQueue.length >= SCREENSHOT_BATCH_SIZE && !isBatchUploading) {
          logInfo('BATCH-UPLOAD', `Queue still full after batch (${screenshotBatchQueue.length} items), processing immediately...`);
          await processScreenshotBatch();
        }
        
        // Ensure flush timer is scheduled for remaining items.
        // Clear any existing timer handle/flag first to avoid stale state,
        // then schedule a fresh timer for the remaining items.
        if (batchFlushInterval) {
          clearTimeout(batchFlushInterval);
          batchFlushInterval = null;
        }
        isFlushTimerActive = false;
        scheduleBatchFlush();
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
  if (isBatchUploading) {
    logInfo('BATCH-UPLOAD', `Batch upload already in progress, skipping (queue size: ${screenshotBatchQueue.length})`);
    return;
  }
  if (screenshotBatchQueue.length === 0) {
    logInfo('BATCH-UPLOAD', 'Queue is empty, nothing to process');
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
    logError('BATCH-UPLOAD', `Supabase client unavailable, re-queuing ${validScreenshots.length} screenshot(s)`);
    // Use push() to maintain FIFO order - re-queued items should go to the end
    screenshotBatchQueue.push(...validScreenshots);
    // Explicitly schedule a flush for re-queued items. We cannot rely on the
    // finally block here because we return early, so we must trigger the timer
    // before exiting to avoid leaving items stuck in the queue.
    scheduleBatchFlush();
    isBatchUploading = false;
    logWarn('BATCH-UPLOAD', `Re-queued batch. Queue size is now: ${screenshotBatchQueue.length}. Check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.`);
    return;
  }
  
  if (validScreenshots.length === 0) {
    logWarn('BATCH-UPLOAD', 'No valid screenshots to upload after filtering');
    isBatchUploading = false;
    return;
  }

  logInfo('BATCH-UPLOAD', `Supabase client available, proceeding with upload of ${validScreenshots.length} screenshot(s)`);

  const uploadResults = [];
  const filesToDelete = [];

  try {
    logInfo('BATCH-UPLOAD', `Starting parallel upload of ${validScreenshots.length} screenshot(s)...`);
    const uploadPromises = validScreenshots.map(async (item) => {
      try {
        if (pendingScreenshots.get(item.filePath) === true) {
          logInfo('BATCH-UPLOAD', `[PRE-UPLOAD-CHECK] Skipping cancelled: ${item.jpegFilename}`);
          // Mark for deletion so cancelled screenshots don't linger on disk
          filesToDelete.push(item.filePath);
          pendingScreenshots.delete(item.filePath);
          return { ok: false, skipped: true, reason: 'cancelled', filePath: item.filePath };
        }

        // Use Frappe timesheet ID for storage path if available, otherwise use sessionId
        // Frappe timesheet IDs are like "TS-2025-00043", which is what we want for folder structure
        // Use numeric Supabase session ID for time_session_id column if available
        // Prefer supabaseSessionId from batch item (passed directly), otherwise try to resolve from sessionId
        let timeTrackerSessionId = null; // Numeric time_sessions.id
        let frappeTimesheetId = item.frappeTimesheetId;
        
        // First, check if we have the numeric Supabase session ID directly from the batch item
        if (item.supabaseSessionId && typeof item.supabaseSessionId === 'number') {
          timeTrackerSessionId = item.supabaseSessionId;
          // Try to get frappe_timesheet_id from database if we don't have it yet
          if (!frappeTimesheetId) {
            const { data: sessionData } = await supabase
              .from('time_sessions')
              .select('frappe_timesheet_id')
              .eq('id', item.supabaseSessionId)
              .maybeSingle();
            if (sessionData?.frappe_timesheet_id) {
              frappeTimesheetId = sessionData.frappe_timesheet_id;
            }
          }
        } else if (item.sessionId) {
          // Fallback: Try to resolve from sessionId if supabaseSessionId wasn't provided
          const sessionIdStr = String(item.sessionId);
          const numericSessionId = parseInt(sessionIdStr, 10);
          
          if (!isNaN(numericSessionId) && isFinite(numericSessionId)) {
            // sessionId is numeric - this is already the time_sessions.id
            timeTrackerSessionId = numericSessionId;
            // Try to get frappe_timesheet_id from database
            if (!frappeTimesheetId) {
              const { data: sessionData } = await supabase
                .from('time_sessions')
                .select('frappe_timesheet_id')
                .eq('id', numericSessionId)
                .maybeSingle();
              if (sessionData?.frappe_timesheet_id) {
                frappeTimesheetId = sessionData.frappe_timesheet_id;
              }
            }
          } else if (sessionIdStr.startsWith('TS-')) {
            // sessionId is a Frappe timesheet ID - look up the numeric id
            frappeTimesheetId = sessionIdStr;
            const { data: sessionData } = await supabase
              .from('time_sessions')
              .select('id')
              .eq('frappe_timesheet_id', sessionIdStr)
              .maybeSingle();
            if (sessionData?.id) {
              timeTrackerSessionId = sessionData.id;
            }
          }
        }
        
        // Build storage path: user_email/frappe_timesheet_id/time_tracker_session_id/screenshots/filename
        // If frappe_timesheet_id is not available, use time_tracker_session_id for that part
        const frappeFolder = frappeTimesheetId || (timeTrackerSessionId ? String(timeTrackerSessionId) : 'unknown');
        const sessionFolder = timeTrackerSessionId ? String(timeTrackerSessionId) : 'unknown';
        const storagePath = `${item.userEmail}/${frappeFolder}/${sessionFolder}/screenshots/${item.jpegFilename}`;
        
        logInfo(item.contextLabel, `Uploading to storage: ${storagePath} (Frappe ID: ${frappeTimesheetId || 'none'}, Session ID: ${timeTrackerSessionId || 'none'}) (${(item.jpegBuffer.length / 1024).toFixed(2)} KB)`);
        
        const { error: storageError } = await supabase.storage
          .from(STORAGE_BUCKET)
          .upload(storagePath, item.jpegBuffer, { contentType: 'image/jpeg', upsert: true });

        if (storageError) {
          logError(item.contextLabel, `Storage upload failed for ${item.jpegFilename}: ${storageError.message}`, storageError);
          return { ok: false, error: storageError.message, filePath: item.filePath, item };
        }
        
        logInfo(item.contextLabel, `Storage upload successful: ${storagePath}`);

        const publicUrlRes = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);
        const publicUrl = publicUrlRes?.data?.publicUrl ?? null;
        if (!publicUrl) throw new Error('Unable to get storage public URL');

        const appName = item.appName || 'Unknown';
        logInfo(item.contextLabel, `Inserting database record for ${item.jpegFilename}`);
        
        // Insert database record BEFORE deleting local file
        // This ensures we can retry if database insert fails
        // Pass frappe_timesheet_id and time_tracker_session_id (numeric id) separately
        await insertScreenshotToDatabase(
          supabase,
          item.userEmail,
          frappeTimesheetId || null, // Frappe timesheet ID
          publicUrl,
          item.timestamp,
          appName,
          item.isIdle,
          item.frappeProjectId,
          item.frappeTaskId,
          timeTrackerSessionId // Numeric time_sessions.id
        );
        logInfo(item.contextLabel, `Database record inserted successfully for ${item.jpegFilename}`);

        // Delete local file ONLY after both storage upload AND database insert succeed
        // This ensures files are removed from local storage only when fully processed
        try {
          if (fs.existsSync(item.filePath)) {
            fs.unlinkSync(item.filePath);
            logInfo(item.contextLabel, `Deleted local file after successful upload and database insert: ${item.filePath}`);
          }
        } catch (deleteError) {
          logWarn(item.contextLabel, `Failed to delete local file ${item.filePath} after upload: ${deleteError.message}`);
          // Continue processing even if deletion fails - file is already in bucket and database
        }

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
          // Send upload notification to all toast windows that might be showing this file
          toastWindows.forEach((win, idx) => {
            if (win && !win.isDestroyed()) {
              try {
                win.webContents.send('toast-file-uploaded', {
                  oldFilePath: item.filePath,
                  remoteUrl: publicUrl
                });
              } catch (e) {
                logWarn('BATCH-UPLOAD', `Error sending upload notification to toast for screen ${idx}: ${e.message}`);
              }
            }
          });
          // Also try the legacy toastWin for backward compatibility
          if (toastWin && !toastWin.isDestroyed()) {
            toastWin.webContents.send('toast-file-uploaded', {
              oldFilePath: item.filePath,
              remoteUrl: publicUrl
            });
          }
        } catch {}

        // Mark as processed (file already deleted above)
        pendingScreenshots.delete(item.filePath);

        logInfo(item.contextLabel, `Uploaded successfully: ${item.jpegFilename}`);
        return { ok: true, filePath: item.filePath, url: publicUrl, appName };
      } catch (error) {
        // Log detailed error information for debugging
        const errorDetails = {
          message: error.message,
          stack: error.stack,
          userEmail: item.userEmail,
          sessionId: item.sessionId,
          filename: item.jpegFilename
        };
        logError(item.contextLabel, `Upload error for ${item.jpegFilename}: ${error.message}`, error);
        logError(item.contextLabel, `Error details: ${JSON.stringify(errorDetails, null, 2)}`);
        
        // If storage upload succeeded but database insert failed, we need to keep the file for retry
        // The file will be deleted only after both succeed
        return { ok: false, error: error.message, filePath: item.filePath, item, errorDetails };
      }
    });

    const results = await Promise.all(uploadPromises);
    uploadResults.push(...results);
    
    logInfo('BATCH-UPLOAD', `All upload promises completed. Results: ${results.length} total, ${results.filter(r => r.ok).length} successful, ${results.filter(r => !r.ok && !r.skipped).length} failed`);

    // Files are now deleted immediately after successful storage upload (see above)
    // This section handles any remaining cleanup for cancelled or failed items
    let deletedCount = 0;
    for (const filePath of filesToDelete) {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          deletedCount++;
          logInfo('BATCH-UPLOAD', `Deleted cancelled/failed file: ${filePath}`);
        }
      } catch (error) {
        logError('BATCH-UPLOAD', `Error deleting file ${filePath}:`, error);
      }
    }

    const failedUploads = results.filter(r => !r.ok && r.item);
    if (failedUploads.length > 0) {
      const MAX_RETRIES_WITH_PREVIEW = 3;
      const MAX_TOTAL_RETRIES = 5;

      logWarn('BATCH-UPLOAD', `Handling ${failedUploads.length} failed upload(s)`);

      const itemsToRequeue = failedUploads
        .map(f => {
          const original = f.item;
          const retryCount = (original.retryCount || 0) + 1;

          if (retryCount > MAX_TOTAL_RETRIES) {
            logError(
              'BATCH-UPLOAD',
              `Dropping screenshot ${original.jpegFilename} after ${retryCount} failed upload attempts`,
            );
            try {
              if (fs.existsSync(original.filePath)) {
                fs.unlinkSync(original.filePath);
                pendingScreenshots.delete(original.filePath);
              }
            } catch (cleanupErr) {
              logWarn(
                'BATCH-UPLOAD',
                `Failed to delete dropped screenshot file ${original.filePath}: ${cleanupErr.message}`,
              );
            }
            return null;
          }

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
        })
        .filter(Boolean);

      if (itemsToRequeue.length > 0) {
        logWarn('BATCH-UPLOAD', `Re-queuing ${itemsToRequeue.length} failed upload(s) for retry`);
        screenshotBatchQueue.push(...itemsToRequeue);
        // Note: scheduleBatchFlush() will be called in finally block after isBatchUploading is set to false
        // to avoid race condition where timer callback executes before flag is cleared
      }
    }

    const successCount = results.filter(r => r.ok).length;
    const failedCount = results.filter(r => !r.ok && !r.skipped).length;
    logInfo(
      'BATCH-UPLOAD',
      `Batch complete: ${successCount}/${validScreenshots.length} uploaded successfully, ${failedCount} failed, ${deletedCount} files deleted`
    );
    
    if (successCount === 0 && validScreenshots.length > 0) {
      logError('BATCH-UPLOAD', `WARNING: All ${validScreenshots.length} screenshot(s) in batch failed to upload. Check Supabase connection and storage bucket configuration.`);
    }

  } catch (error) {
    logError('BATCH-UPLOAD', `Batch processing error: ${error.message}`, error);
    const MAX_RETRIES_WITH_PREVIEW = 3;
    const MAX_TOTAL_RETRIES = 5;
    const itemsToRequeue = validScreenshots
      .map(item => {
        const retryCount = (item.retryCount || 0) + 1;

        if (retryCount > MAX_TOTAL_RETRIES) {
          logError(
            'BATCH-UPLOAD',
            `Dropping screenshot ${item.jpegFilename} after ${retryCount} failed batch attempts`,
          );
          try {
            if (fs.existsSync(item.filePath)) {
              fs.unlinkSync(item.filePath);
              pendingScreenshots.delete(item.filePath);
            }
          } catch (cleanupErr) {
            logWarn(
              'BATCH-UPLOAD',
              `Failed to delete dropped screenshot file ${item.filePath}: ${cleanupErr.message}`,
            );
          }
          return null;
        }

        return {
          ...item,
          retryCount: retryCount,
          screenshotData: retryCount < MAX_RETRIES_WITH_PREVIEW ? item.screenshotData : null
        };
      })
      .filter(Boolean);

    if (itemsToRequeue.length > 0) {
      // Use push() to maintain FIFO order - re-queued items should go to the end
      screenshotBatchQueue.push(...itemsToRequeue);
      logWarn('BATCH-UPLOAD', `Re-queued ${itemsToRequeue.length} item(s) after batch error`);
      // Note: scheduleBatchFlush() will be called in finally block after isBatchUploading is set to false
      // to avoid race condition where timer callback executes before flag is cleared
    }
  } finally {
    isBatchUploading = false;
    // Schedule flush timer for any re-queued items after isBatchUploading is cleared
    // This ensures timer callback will see isBatchUploading = false and process items correctly
    if (screenshotBatchQueue.length > 0) {
      scheduleBatchFlush();
    }
  }
}

// Flush remaining screenshots in queue (called on app close or session end)
async function flushScreenshotBatch() {
  if (batchFlushInterval) {
    clearTimeout(batchFlushInterval);
    batchFlushInterval = null;
    isFlushTimerActive = false;
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
      return 1800000; // 30 minutes default
    }

    const normalizedFreelancer = userEmail.trim().toLowerCase();
    const DEFAULT_INTERVAL_SECONDS = 1800; // 30 minutes default
    let clientEmail = null;

    // 1) Get frappe_project_id from time_sessions using sessionId
    // Note: project_id column has been removed - we now use frappe_project_id
    // Since Frappe projects don't map to Supabase project_assignments, we'll use a simpler approach
    if (!sessionId) {
      logWarn('ScreenshotInterval', 'No sessionId provided, using default interval');
      return DEFAULT_INTERVAL_SECONDS * 1000;
    }

    // Try to parse sessionId as integer (Supabase session ID) or use as-is (Frappe timesheet ID)
    const numericSessionId = parseInt(sessionId, 10);
    let sessionData = null;
    let sessionError = null;
    let sessionUserEmail = normalizedFreelancer; // Default to provided userEmail

    if (!isNaN(numericSessionId) && isFinite(numericSessionId)) {
      // sessionId is a numeric Supabase session ID
      const result = await supabase
        .from('time_sessions')
        .select('frappe_project_id, user_email')
        .eq('id', numericSessionId)
        .maybeSingle();
      sessionData = result.data;
      sessionError = result.error;
      if (sessionData && sessionData.user_email) {
        sessionUserEmail = sessionData.user_email.trim().toLowerCase();
      }
    } else if (typeof sessionId === 'string' && sessionId.startsWith('TS-')) {
      // sessionId is a Frappe timesheet ID (e.g., "TS-2025-00043")
      // Try to find the most recent session with this timesheet ID
      const result = await supabase
        .from('time_sessions')
        .select('frappe_project_id, user_email')
        .eq('frappe_timesheet_id', sessionId)
        .order('start_time', { ascending: false })
        .limit(1)
        .maybeSingle();
      sessionData = result.data;
      sessionError = result.error;
      if (sessionData && sessionData.user_email) {
        sessionUserEmail = sessionData.user_email.trim().toLowerCase();
      }
    }

    // Log session lookup result, but don't fail - we can still get interval using userEmail
    if (sessionError) {
      logWarn(
        'ScreenshotInterval',
        `Error fetching session ${sessionId}: ${sessionError.message}, will use userEmail ${normalizedFreelancer} directly`,
      );
    } else if (sessionData) {
      logInfo('ScreenshotInterval', `Found session data for ${sessionId}, user_email: ${sessionUserEmail}`);
    } else {
      logInfo('ScreenshotInterval', `No session data found for ${sessionId}, using userEmail ${normalizedFreelancer} directly`);
    }

    // 2) Try to get manager/client email from user's company
    // The client_email in client_settings is the manager's email, not the employee's
    // Use sessionUserEmail (from session or fallback to userEmail parameter)
    if (sessionUserEmail) {
      try {
        // Get the employee's company from users table
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('company')
          .eq('email', sessionUserEmail)
          .maybeSingle();

        if (!userError && userData && userData.company) {
          // Find a manager with the same company (this is the client_email)
          const { data: managerData, error: managerError } = await supabase
            .from('users')
            .select('email, role')
            .eq('company', userData.company)
            .not('role', 'is', null)
            .limit(10); // Get multiple to find a manager

          if (!managerError && managerData && managerData.length > 0) {
            // Look for a manager role - anything that's NOT "Employee" is considered a Manager
            // (SuperAdmin, MainAdmin, etc. are all managers)
            const manager = managerData.find(u => {
              const role = (u.role || '').trim();
              // Anything that's not "Employee" is a manager
              return role && role.toLowerCase() !== 'employee';
            });
            
            if (manager) {
              clientEmail = manager.email.trim().toLowerCase();
              logInfo('ScreenshotInterval', `Found manager email from company: ${clientEmail} (role: ${manager.role})`);
            } else if (managerData.length > 0) {
              // If no explicit manager found, use the first user with the same company
              // (might be the company owner)
              clientEmail = managerData[0].email.trim().toLowerCase();
              logInfo('ScreenshotInterval', `Using first user from company as client: ${clientEmail} (role: ${managerData[0].role})`);
            }
          }
        }
      } catch (companyErr) {
        logWarn('ScreenshotInterval', `Error fetching company info: ${companyErr.message}`);
      }
    }

    // 3) Final fallback: try to find any manager in the system
    // This is a last resort - ideally we should always find the manager from company
    if (!clientEmail) {
      try {
        const { data: managers, error: managerError } = await supabase
          .from('users')
          .select('email, role')
          .not('role', 'is', null)
          .limit(10);

        if (!managerError && managers && managers.length > 0) {
          // Look for a manager role - anything that's NOT "Employee" is considered a Manager
          const manager = managers.find(u => {
            const role = (u.role || '').trim();
            return role && role.toLowerCase() !== 'employee';
          });
          
          if (manager) {
            clientEmail = manager.email.trim().toLowerCase();
            logInfo('ScreenshotInterval', `Using fallback manager: ${clientEmail} (role: ${manager.role})`);
          }
        }
      } catch (fallbackErr) {
        logWarn('ScreenshotInterval', `Error in fallback manager lookup: ${fallbackErr.message}`);
      }
    }

    // 4) Last resort: use employee's email (but this won't work if settings are stored under manager's email)
    if (!clientEmail) {
      logWarn(
        'ScreenshotInterval',
        `Could not resolve manager/client email, using employee email as fallback (may not find settings)`,
      );
      clientEmail = normalizedFreelancer;
    }

    // 5) First, try to find client_settings that contains this employee's email
    // This is more reliable than trying to guess the manager's email
    let clientSettings = null;
    let settingsError = null;
    
    // Try to find any client_settings entry that has this employee in their employee_intervals
    logInfo('ScreenshotInterval', `Searching for client_settings containing employee: ${normalizedFreelancer}`);
    const { data: allSettings, error: allSettingsError } = await supabase
      .from('client_settings')
      .select('client_email, employee_intervals')
      .limit(100); // Get all settings (should be manageable)
    
    if (allSettingsError) {
      logWarn('ScreenshotInterval', `Error fetching all client_settings: ${allSettingsError.message}`);
    } else if (!allSettings || allSettings.length === 0) {
      logWarn('ScreenshotInterval', `No client_settings records found in database`);
    } else {
      logInfo('ScreenshotInterval', `Found ${allSettings.length} client_settings record(s) in database`);
      
      // Look for a settings entry that has this employee in the map
      // Try both exact match and case-insensitive match
      const matchingSettings = allSettings.find(settings => {
        if (!settings.employee_intervals) return false;
        
        // Handle both object and JSON string formats
        let intervals = settings.employee_intervals;
        if (typeof intervals === 'string') {
          try {
            intervals = JSON.parse(intervals);
          } catch (e) {
            logWarn('ScreenshotInterval', `Failed to parse employee_intervals as JSON: ${e.message}`);
            return false;
          }
        }
        
        // Check exact match first
        if (intervals.hasOwnProperty(normalizedFreelancer)) {
          return true;
        }
        // Try case-insensitive match
        const mapKeys = Object.keys(intervals);
        return mapKeys.some(key => key.toLowerCase() === normalizedFreelancer);
      });
      
      if (matchingSettings) {
        clientSettings = matchingSettings;
        clientEmail = matchingSettings.client_email.trim().toLowerCase();
        logInfo('ScreenshotInterval', `✓ Found client_settings for employee ${normalizedFreelancer} under client: ${clientEmail}`);
      } else {
        logWarn('ScreenshotInterval', `✗ No client_settings found containing employee ${normalizedFreelancer} in employee_intervals`);
        // Log all available employee emails for debugging
        allSettings.forEach(settings => {
          let intervals = settings.employee_intervals;
          if (typeof intervals === 'string') {
            try {
              intervals = JSON.parse(intervals);
            } catch {
              intervals = {};
            }
          }
          const employeeEmails = Object.keys(intervals || {});
          if (employeeEmails.length > 0) {
            logInfo('ScreenshotInterval', `  Client ${settings.client_email} has employees: ${employeeEmails.join(', ')}`);
          } else {
            logInfo('ScreenshotInterval', `  Client ${settings.client_email} has no employees in intervals`);
          }
        });
      }
    }
    
    // If not found by employee lookup, try the resolved client_email
    if (!clientSettings && clientEmail) {
      const result = await supabase
        .from('client_settings')
        .select('client_email, employee_intervals')
        .eq('client_email', clientEmail)
        .maybeSingle();
      clientSettings = result.data;
      settingsError = result.error;
    }

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

    // 6) Get the interval from employee_intervals map using employee email as key
    let map = clientSettings.employee_intervals || {};
    
    // Handle JSON string format if needed
    if (typeof map === 'string') {
      try {
        map = JSON.parse(map);
      } catch (e) {
        logWarn('ScreenshotInterval', `Failed to parse employee_intervals as JSON: ${e.message}`);
        map = {};
      }
    }
    
    // Log the map contents for debugging
    logInfo('ScreenshotInterval', `Looking up interval for employee: ${normalizedFreelancer}`);
    const mapKeys = Object.keys(map);
    logInfo('ScreenshotInterval', `Available employee emails in map: ${mapKeys.join(', ')}`);
    logInfo('ScreenshotInterval', `Full employee_intervals map: ${JSON.stringify(map)}`);
    
    // Try to find the interval - check both exact match and case-insensitive match
    let perEmployeeSeconds = Number(map[normalizedFreelancer]);
    
    // If not found, try case-insensitive lookup
    if (!Number.isFinite(perEmployeeSeconds) || perEmployeeSeconds <= 0) {
      const matchingKey = mapKeys.find(key => key.toLowerCase() === normalizedFreelancer);
      if (matchingKey) {
        perEmployeeSeconds = Number(map[matchingKey]);
        logInfo('ScreenshotInterval', `✓ Found interval using case-insensitive match: ${matchingKey} -> ${perEmployeeSeconds} seconds`);
      } else {
        logWarn('ScreenshotInterval', `✗ Employee ${normalizedFreelancer} not found in map. Available keys: ${mapKeys.join(', ')}`);
      }
    } else {
      logInfo('ScreenshotInterval', `✓ Found interval using exact match: ${normalizedFreelancer} -> ${perEmployeeSeconds} seconds`);
    }

    const intervalSeconds =
      Number.isFinite(perEmployeeSeconds) && perEmployeeSeconds > 0
        ? perEmployeeSeconds
        : DEFAULT_INTERVAL_SECONDS;
    
    if (intervalSeconds === DEFAULT_INTERVAL_SECONDS) {
      logWarn('ScreenshotInterval', `No interval found for ${normalizedFreelancer} in map, using default ${DEFAULT_INTERVAL_SECONDS} seconds`);
    }

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
      `Using interval for client ${clientEmail}, employee ${normalizedFreelancer}: ${intervalSeconds} seconds (${intervalMs}ms)`,
    );
    return intervalMs;
  } catch (e) {
    logError('ScreenshotInterval', 'Failed to get interval', e);
    return 1800000; // 30 minutes default
  }
}


// ============ IPC HANDLERS ============

// ============ FRAPPE AUTHENTICATION IPC HANDLERS ============
ipcMain.handle('auth:login', async (event, { email, password }) => {
  try {
    const result = await frappeLogin(email, password);
    return result;
  } catch (error) {
    logError('IPC', `Frappe login error: ${error.message}`, error);
    return { success: false, error: error.message || 'Login failed' };
  }
});

ipcMain.handle('auth:get-user-company', async (event, userEmail) => {
  try {
    const company = await frappeGetUserCompany(userEmail);
    return { success: true, company };
  } catch (error) {
    logError('IPC', `Error getting user company: ${error.message}`, error);
    return { success: false, error: error.message || 'Failed to get company' };
  }
});

ipcMain.handle('auth:get-user-role-profile', async (event, userEmail) => {
  try {
    const roleProfile = await frappeGetUserRoleProfile(userEmail);
    return { success: true, roleProfile };
  } catch (error) {
    logError('IPC', `Error getting user role profile: ${error.message}`, error);
    return { success: false, error: error.message || 'Failed to get role profile' };
  }
});

ipcMain.handle('auth:get-user-full-name', async (event, userEmail) => {
  try {
    const fullName = await frappeGetUserFullName(userEmail);
    return { success: true, fullName };
  } catch (error) {
    logError('IPC', `Error getting user full name: ${error.message}`, error);
    return { success: false, error: error.message || 'Failed to get user full name' };
  }
});

ipcMain.handle('auth:logout', async () => {
  try {
    // STOP timer globally
    isTimerActive = false;
    currentSessionId = null;
    currentSupabaseSessionId = null;

    forceStopAllTimers();
    await frappeLogout();
    return { success: true };
  } catch (error) {
    logError('IPC', `Frappe logout error: ${error.message}`, error);
    return { success: false, error: error.message || 'Logout failed' };
  }
});

function forceStopAllTimers() {
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) {
      win.webContents.send('force-stop-timer');
    }
  });
}

ipcMain.handle('auth:me', async () => {
  try {
    const userEmail = await frappeGetCurrentUser();
    return userEmail;
  } catch (error) {
    logError('IPC', `Frappe getCurrentUser error: ${error.message}`, error);
    return null;
  }
});

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('frappe:get-user-projects', async () => {
  try {
    const projects = await frappeGetUserProjects();
    return projects;
  } catch (error) {
    logError('IPC', `Frappe getProjects error: ${error.message}`, error);
    return [];
  }
});

ipcMain.handle('frappe:get-users-assigned-to-project', async (_e, projectId) => {
  try {
    const users = await getUsersAssignedToProject(projectId);
    return { success: true, users };
  } catch (error) {
    logError('IPC', `Frappe getUsersAssignedToProject error: ${error.message}`, error);
    return { success: false, error: error.message, users: [] };
  }
});

ipcMain.handle('frappe:create-timesheet', async (_e, payload) => {
  return await createTimesheet(payload);
});

ipcMain.handle('frappe:get-timesheet-for-project', async (_e, projectId) => {
  return await getTimesheetForProject(projectId);
});

ipcMain.handle('frappe:add-time-log-to-timesheet', async (_e, timesheetId, timeLog) => {
  return await addTimeLogToTimesheet(timesheetId, timeLog);
});

// Timeout for Frappe IPC so requests never hang forever (session/network issues)
const FRAPPE_IPC_TIMEOUT_MS = 15000;
function callWithTimeout(promise, ms = FRAPPE_IPC_TIMEOUT_MS) {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Request timeout')), ms)
  );
  return Promise.race([promise, timeout]);
}

ipcMain.handle('frappe:get-or-create-timesheet', async (_e, payload) => {
  const startTime = Date.now();
  console.log('[IPC] frappe:get-or-create-timesheet called at', new Date().toISOString());
  console.log('[IPC] Payload received:', JSON.stringify(payload, null, 2));
  
  try {
    const result = await callWithTimeout(getOrCreateTimesheet(payload));
    const duration = Date.now() - startTime;
    console.log('[IPC] frappe:get-or-create-timesheet SUCCESS in', duration, 'ms');
    // console.log('[IPC] Result:', JSON.stringify(result, null, 2));
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('[IPC] frappe:get-or-create-timesheet FAILED after', duration, 'ms');
    console.error('[IPC] Error name:', error?.name);
    console.error('[IPC] Error message:', error?.message);
    console.error('[IPC] Error stack:', error?.stack);
    
    if (error?.response) {
      console.error('[IPC] Error response status:', error.response.status);
      // console.error('[IPC] Error response data:', JSON.stringify(error.response.data, null, 2));
    }
    
    if (error?.config) {
      console.error('[IPC] Request config:', {
        url: error.config?.url,
        method: error.config?.method,
        data: error.config?.data
      });
    }
    
    //console.error('[IPC] Full error object:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
    throw error;
  }
});

ipcMain.handle('frappe:start-timesheet-session', async (_e, payload) => {
  const startTime = Date.now();
  console.log('[IPC] frappe:start-timesheet-session called at', new Date().toISOString());
  // console.log('[IPC] Payload received:', JSON.stringify(payload, null, 2));
  
  try {
    const result = await callWithTimeout(startTimesheetSession(payload));
    const duration = Date.now() - startTime;
    console.log('[IPC] frappe:start-timesheet-session SUCCESS in', duration, 'ms');
    // console.log('[IPC] Result:', JSON.stringify(result, null, 2));
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('[IPC] frappe:start-timesheet-session FAILED after', duration, 'ms');
    console.error('[IPC] Error name:', error?.name);
    console.error('[IPC] Error message:', error?.message);
    console.error('[IPC] Error stack:', error?.stack);
    
    if (error?.response) {
      console.error('[IPC] Error response status:', error.response.status);
      console.error('[IPC] Error response data:', JSON.stringify(error.response.data, null, 2));
    }
    
    if (error?.config) {
      console.error('[IPC] Request config:', {
        url: error.config?.url,
        method: error.config?.method,
        data: error.config?.data
      });
    }
    
    // console.error('[IPC] Full error object:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
    throw error;
  }
});

ipcMain.handle('frappe:update-timesheet-row', async (_e, payload) => {
  return await updateTimesheetRow(payload);
});

ipcMain.handle('frappe:resolve-row-for-start', async (_e, payload) => {
  return await resolveRowForStart(payload);
});

ipcMain.handle('frappe:get-timesheet-by-id', async (_e, timesheetId) => {
  return await callWithTimeout(getTimesheetById(timesheetId));
});

ipcMain.handle('frappe:save-timesheet-with-savedocs', async (_e, timesheetDoc) => {
  return await callWithTimeout(saveTimesheetWithSavedocs(timesheetDoc));
});

ipcMain.handle('frappe:get-server-time', async () => {
  return await callWithTimeout(getFrappeServerTime());
});

ipcMain.handle(
  'frappe:get-tasks-for-project',
  async (_event, projectId) => {
    return await getMyTasksForProject(projectId);
  }
);

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
    // âœ… STEP 1: ATOMIC - Set cancellation flag FIRST (BEFORE anything else)
    pendingScreenshots.set(filePath, true);
    logInfo('DELETE', `[ATOMIC] Marked for cancellation: ${filePath}`);

    // âœ… STEP 2: Remove from batch queue IMMEDIATELY
    const indexInQueue = screenshotBatchQueue.findIndex(item => item.filePath === filePath);
    if (indexInQueue !== -1) {
      screenshotBatchQueue.splice(indexInQueue, 1);
      logInfo('DELETE', `[QUEUE] Removed from batch queue at index ${indexInQueue}`);
    }

    // âœ… STEP 3: Delete from local disk
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      logInfo('DELETE', `[DISK] File deleted: ${filePath}`);
    } else {
      logWarn('DELETE', `[DISK] File does not exist: ${filePath}`);
    }

    // âœ… STEP 4: Clean up pending map with 1000ms delay
    setTimeout(() => {
      pendingScreenshots.delete(filePath);
      logInfo('DELETE', `[CLEANUP] Removed from pending map: ${filePath}`);
    }, 1000);

    // âœ… STEP 5: Close toast window(s) that match this file
    // Close all toast windows that might be showing this file
    toastWindows.forEach((win, idx) => {
      if (win && !win.isDestroyed()) {
        try {
          win.close();
        } catch (e) {
          logWarn('DELETE', `Error closing toast for screen ${idx}: ${e.message}`);
        }
      }
    });
    toastWindows.clear();
    if (toastWin && !toastWin.isDestroyed()) {
      try {
        toastWin.close();
      } catch (e) {
        logWarn('DELETE', `Error closing toast: ${e.message}`);
      }
      toastWin = null;
    }

    // âœ… STEP 6: Broadcast deletion
    BrowserWindow.getAllWindows().forEach(window => {
      if (!window.isDestroyed()) {
        try {
          window.webContents.send('screenshot-deleted', { filePath });
        } catch (e) {
          logWarn('DELETE', `Error broadcasting: ${e.message}`);
        }
      }
    });

    logInfo('DELETE', `âœ“ COMPLETED: ${path.basename(filePath)}`);
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

ipcMain.handle('get-last-system-resume', () => {
  return global.__lastSystemResumeAt ?? null;
});

ipcMain.on('show-timer-stopped-notification', () => {
  try {
    if (Notification.isSupported()) {
      new Notification({
        title: 'Time-Tracker',
        body: 'Timer stopped. Work session ended.',
        silent: true
      }).show();
    }
  } catch (e) {
    logWarn('Notification', `Failed to show timer stopped notification: ${e?.message || e}`);
  }
});

ipcMain.on('update-idle-state', (_event, isIdle) => {
  try {
    isUserIdle = Boolean(isIdle);
  } catch (e) {
    logError('IPC', `Failed to update idle state: ${e?.message || e}`);
  }
});


// ============ Time tracking IPC handlers (used by preload.js) ============

function broadcastTimeTrackingUpdate() {
  try {
    const payload = {
      ...timeTrackingState,
      isTimerActive: !!isTimerActive,
      isUserLoggedIn: !!isUserLoggedIn,
    };
    BrowserWindow.getAllWindows().forEach((win) => {
      if (!win.isDestroyed()) {
        win.webContents.send('time-tracking-update', payload);
      }
    });
  } catch (e) {
    logWarn('TimeTracking', `Failed to broadcast time-tracking-update: ${e?.message || e}`);
  }
}

ipcMain.handle('start-time-tracking', async (event, userEmail) => {
  const now = Date.now();

  // If already active, reset state for a new run
  timeTrackingState = {
    active: true,
    paused: false,
    userEmail: (userEmail || currentUserEmail || '').trim().toLowerCase() || null,
    startedAt: now,
    pausedAt: null,
    totalActiveMs: 0,
  };

  isTimerActive = true;
  if (timeTrackingState.userEmail) {
    currentUserEmail = timeTrackingState.userEmail;
  }

  logInfo('TimeTracking', `start-time-tracking for ${timeTrackingState.userEmail || 'unknown user'}`);
  broadcastTimeTrackingUpdate();

  return { ok: true, state: timeTrackingState };
});

ipcMain.handle('stop-time-tracking', async () => {
  if (timeTrackingState.active && !timeTrackingState.paused && timeTrackingState.startedAt) {
    timeTrackingState.totalActiveMs += Date.now() - timeTrackingState.startedAt;
  }

  timeTrackingState.active = false;
  timeTrackingState.paused = false;
  timeTrackingState.startedAt = null;
  timeTrackingState.pausedAt = null;

  isTimerActive = false;

  logInfo('TimeTracking', 'stop-time-tracking called');
  broadcastTimeTrackingUpdate();

  return { ok: true, state: timeTrackingState };
});

ipcMain.handle('pause-time-tracking', async () => {
  if (!timeTrackingState.active || timeTrackingState.paused) {
    return { ok: true, state: timeTrackingState };
  }

  if (timeTrackingState.startedAt) {
    timeTrackingState.totalActiveMs += Date.now() - timeTrackingState.startedAt;
  }

  timeTrackingState.paused = true;
  timeTrackingState.startedAt = null;
  timeTrackingState.pausedAt = Date.now();

  logInfo('TimeTracking', 'pause-time-tracking called');
  broadcastTimeTrackingUpdate();

  return { ok: true, state: timeTrackingState };
});

ipcMain.handle('resume-time-tracking', async () => {
  if (!timeTrackingState.active || !timeTrackingState.paused) {
    return { ok: true, state: timeTrackingState };
  }

  timeTrackingState.paused = false;
  timeTrackingState.startedAt = Date.now();
  timeTrackingState.pausedAt = null;

  logInfo('TimeTracking', 'resume-time-tracking called');
  broadcastTimeTrackingUpdate();

  return { ok: true, state: timeTrackingState };
});

ipcMain.handle('get-time-tracking-status', async () => {
  // Compute an up-to-date totalActiveMs snapshot without mutating state
  let effectiveTotalMs = timeTrackingState.totalActiveMs;
  if (timeTrackingState.active && !timeTrackingState.paused && timeTrackingState.startedAt) {
    effectiveTotalMs += Date.now() - timeTrackingState.startedAt;
  }

  const snapshot = {
    ...timeTrackingState,
    totalActiveMs: effectiveTotalMs,
    isTimerActive: !!isTimerActive,
    isUserLoggedIn: !!isUserLoggedIn,
  };

  return { ok: true, state: snapshot };
});

ipcMain.handle('queue-screenshot-upload', async (event, { userEmail, sessionId, supabaseSessionId, screenshotData, timestamp, isIdle, appName, frappeProjectId, frappeTaskId, frappeTimesheetId }) => {
  return handleScreenshotUpload({
    userEmail,
    sessionId,
    supabaseSessionId, // Numeric Supabase session ID for time_session_id column
    screenshotData,
    timestamp,
    isIdle,
    appName, // Optional: if provided, will be used; otherwise captured automatically
    frappeProjectId, // Frappe project ID
    frappeTaskId, // Frappe task ID
    // Pass explicit Frappe timesheet ID through to batch handler when available
    frappeTimesheetId,
    contextLabel: 'UPLOAD'
  });
});

// start/stop-background already present in your earlier file
ipcMain.handle('start-background-screenshots', async (event, userEmail, sessionId, supabaseSessionId, frappeProjectId, frappeTaskId) => {
  const startTime = Date.now();
  global.timerStartTime = startTime; // Store globally for timing calculations
  
  if (backgroundScreenshotInterval) {
    clearTimeout(backgroundScreenshotInterval);
    backgroundScreenshotInterval = null;
  }
  currentUserEmail = userEmail;
  currentSessionId = sessionId;
  // Store numeric Supabase session ID separately for time_session_id column
  // This will be used when adding screenshots to batch
  currentSupabaseSessionId = supabaseSessionId || null;
  
  // Try to fetch frappe IDs from time_sessions table first (most reliable)
  // Fall back to passed values if not found in database
  let resolvedFrappeProjectId = frappeProjectId || null;
  let resolvedFrappeTaskId = frappeTaskId || null;
  
  try {
    const supabase = getSupabaseClient();
    if (supabase && sessionId) {
      // Try to parse sessionId as integer (Supabase session ID)
      const numericSessionId = parseInt(sessionId, 10);
      if (!isNaN(numericSessionId) && isFinite(numericSessionId)) {
        const { data: sessionData, error: sessionError } = await supabase
          .from('time_sessions')
          .select('frappe_project_id, frappe_task_id')
          .eq('id', numericSessionId)
          .maybeSingle();
        
        if (!sessionError && sessionData) {
          if (sessionData.frappe_project_id) {
            resolvedFrappeProjectId = sessionData.frappe_project_id;
            logInfo('IPC', `Fetched frappe_project_id from time_sessions: ${resolvedFrappeProjectId}`);
          }
          if (sessionData.frappe_task_id) {
            resolvedFrappeTaskId = sessionData.frappe_task_id;
            logInfo('IPC', `Fetched frappe_task_id from time_sessions: ${resolvedFrappeTaskId}`);
          }
        }
      } else if (typeof sessionId === 'string' && sessionId.startsWith('TS-')) {
        // sessionId is a Frappe timesheet ID (e.g., "TS-2025-00043")
        // Try to find the session by frappe_timesheet_id
        const { data: sessionData, error: sessionError } = await supabase
          .from('time_sessions')
          .select('frappe_project_id, frappe_task_id')
          .eq('frappe_timesheet_id', sessionId)
          .maybeSingle();
        
        if (!sessionError && sessionData) {
          if (sessionData.frappe_project_id) {
            resolvedFrappeProjectId = sessionData.frappe_project_id;
            logInfo('IPC', `Fetched frappe_project_id from time_sessions (by frappe_timesheet_id): ${resolvedFrappeProjectId}`);
          }
          if (sessionData.frappe_task_id) {
            resolvedFrappeTaskId = sessionData.frappe_task_id;
            logInfo('IPC', `Fetched frappe_task_id from time_sessions (by frappe_timesheet_id): ${resolvedFrappeTaskId}`);
          }
        }
      }
    }
  } catch (error) {
    logWarn('IPC', `Failed to fetch frappe IDs from time_sessions: ${error.message}`);
    // Continue with passed values
  }
  
  currentFrappeProjectId = resolvedFrappeProjectId;
  currentFrappeTaskId = resolvedFrappeTaskId;
  
  logInfo('IPC', `Background screenshots starting with frappe_project_id: ${currentFrappeProjectId}, frappe_task_id: ${currentFrappeTaskId}`);
  isBackgroundCaptureActive = true;

  // Fetch screenshot interval from database (defaults to 30 minutes if not found)
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
      const captureStartTime = Date.now();
      const timeSinceStart = global.timerStartTime ? captureStartTime - global.timerStartTime : 0;
      sendToRendererConsole("Capture triggered at:", timeSinceStart, "ms since timer start");
      
      // Set a timeout to ensure we don't block indefinitely
      const captureTimeout = setTimeout(() => {
        if (isBackgroundTickRunning) {
          logWarn('BG-UPLOAD', 'Screenshot capture timeout (30s) - resetting flag to allow next capture');
          isBackgroundTickRunning = false;
        }
      }, 30000); // 30 second timeout
      
      try {
        await backgroundCaptureScreenshots();
      } catch (error) {
        const errorMessage = error?.message || String(error) || 'Unknown error';
        const errorStack = error?.stack || 'No stack trace available';
        
        // Get permission status for context
        let permissionStatus = 'unknown';
        let permissionGranted = false;
        
        if (process.platform === 'darwin') {
          try {
            permissionStatus = checkMacOSScreenRecordingPermission();
            permissionGranted = permissionStatus === 'granted';
          } catch (permError) {
            logWarn('BG-UPLOAD', `Failed to check permission in error handler: ${permError?.message}`);
          }
        }
        
        const detailedError = 'BACKGROUND SCREENSHOT CAPTURE FAILED: Exception Occurred\n' +
                             '═══════════════════════════════════════════════════════\n' +
                             `Error: ${errorMessage}\n\n` +
                             `Permission Status: ${permissionStatus}\n` +
                             `Permission Granted: ${permissionGranted}\n\n` +
                             `Stack Trace:\n${errorStack}\n\n` +
                             'This error occurred during background screenshot capture. Check the logs above for more details.';
        
        logError('BG-UPLOAD', `[BACKGROUND CAPTURE] ${detailedError}`);
        logError('BG-UPLOAD', 'Error capturing screenshot:', error);
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

  // Capture first screenshot immediately (at 0 seconds)
  logInfo('IPC', '===========================================================');
  logInfo('IPC', 'Starting background screenshot capture');
  logInfo('IPC', `First screenshot: immediate (at 0 seconds)`);
  logInfo('IPC', `Screenshot interval: ${intervalMs}ms`);
  logInfo('IPC', `Random interval range: ${Math.floor(intervalMs * 0.7)}ms - ${Math.floor(intervalMs * 1.2)}ms`);
  
  const allDisplays = screen.getAllDisplays();
  logInfo('IPC', `Detected ${allDisplays.length} display(s) at startup:`);
  allDisplays.forEach((display, idx) => {
    logInfo('IPC', `  Display ${idx + 1}: ID=${display.id}, ${display.size.width}x${display.size.height}, bounds: (${display.bounds.x}, ${display.bounds.y})`);
  });
  logInfo('IPC', '===========================================================');
  
  // Capture first screenshot immediately
  const captureTriggerTime = Date.now() - startTime;
  sendToRendererConsole("Capture triggered at:", captureTriggerTime, "ms since timer start");
  logInfo('IPC', 'Capturing first screenshot immediately...');
  backgroundCaptureScreenshots();
  // Schedule subsequent screenshots with random intervals (70%-120% of interval)
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

ipcMain.handle('update-background-screenshot-session-id', async (event, supabaseSessionId) => {
  // Update the numeric Supabase session ID for background screenshots
  // This is called after the session is created in the database
  currentSupabaseSessionId = supabaseSessionId || null;
  logInfo('IPC', `Updated background screenshot session ID to: ${currentSupabaseSessionId}`);
  return { ok: true };
});

// Get batch queue status
ipcMain.handle('get-screenshot-batch-status', () => {
  const supabase = getSupabaseClient();
  const hasSupabase = !!supabase;
  const supabaseUrl = process.env.SUPABASE_URL || 'NOT SET';
  const hasServiceKey = !!(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);
  
  return {
    queueSize: screenshotBatchQueue.length,
    batchSize: SCREENSHOT_BATCH_SIZE,
    isUploading: isBatchUploading,
    nextFlushIn: batchFlushInterval ? SCREENSHOT_BATCH_FLUSH_INTERVAL : null,
    hasSupabaseClient: hasSupabase,
    supabaseUrl: supabaseUrl.substring(0, 50) + (supabaseUrl.length > 50 ? '...' : ''), // Truncate for security
    hasApiKey: hasServiceKey,
    flushTimerActive: isFlushTimerActive,
    pendingScreenshotsCount: pendingScreenshots.size,
    storageBucket: STORAGE_BUCKET
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
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.size;
    
    logInfo('IPC', `[capture-screen] Capturing primary screen: ${width}x${height}`);
    
    let sources;
    try {
      sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width, height },
      });
    } catch (capturerError) {
      const errorMsg = capturerError?.message || capturerError?.toString() || String(capturerError) || 'Unknown error';
      
      // Get detailed permission status for error analysis
      let permissionStatus = 'unknown';
      let permissionGranted = false;
      
      if (process.platform === 'darwin') {
        try {
          permissionStatus = checkMacOSScreenRecordingPermission();
          permissionGranted = permissionStatus === 'granted';
        } catch (permError) {
          logWarn('IPC', `[capture-screen] Failed to check permission: ${permError?.message}`);
        }
      }
      
      const detailedError = 'SCREENSHOT CAPTURE FAILED: desktopCapturer Error (capture-screen)\n' +
                           '═══════════════════════════════════════════════════════\n' +
                           `Error: ${errorMsg}\n\n` +
                           `Permission Status: ${permissionStatus}\n` +
                           `Permission Granted: ${permissionGranted}\n` +
                           `Primary Display: ${width}x${height}\n\n` +
                           'Check System Settings → Privacy & Security → Screen Recording for permission status.';
      
      logError('IPC', `[capture-screen] ${detailedError}`);
      logError('IPC', '[capture-screen] desktopCapturer.getSources() failed:', capturerError);
      return null;
    }
    
    if (!sources || sources.length === 0) {
      // No sources returned - log detailed analysis
      let permissionStatus = 'unknown';
      let permissionGranted = false;
      
      if (process.platform === 'darwin') {
        permissionStatus = checkMacOSScreenRecordingPermission();
        permissionGranted = permissionStatus === 'granted';
        
        const detailedError = 'SCREENSHOT CAPTURE FAILED: No Sources Available (capture-screen)\n' +
                             '═══════════════════════════════════════════════════════\n' +
                             `Permission Status: ${permissionStatus}\n` +
                             `Permission Granted: ${permissionGranted}\n` +
                             `Primary Display: ${width}x${height}\n\n` +
                             'Check System Settings → Privacy & Security → Screen Recording.';
        
        logError('IPC', `[capture-screen] ${detailedError}`);
      } else {
        logWarn('IPC', '[capture-screen] No screen sources returned');
      }
      
      return null;
    }
    
    const screenshotData = sources[0].thumbnail.toDataURL('image/png');
    logInfo('IPC', `[capture-screen] Successfully captured screenshot: ${screenshotData.length} bytes`);
    return screenshotData;
  } catch (e) {
    const errorMessage = e?.message || String(e) || 'Unknown error';
    const errorStack = e?.stack || 'No stack trace available';
    
    // Get permission status for context
    let permissionStatus = 'unknown';
    if (process.platform === 'darwin') {
      try {
        permissionStatus = checkMacOSScreenRecordingPermission();
      } catch (permError) {
        logWarn('IPC', `[capture-screen] Failed to check permission in error handler: ${permError?.message}`);
      }
    }
    
    const detailedError = 'SCREENSHOT CAPTURE FAILED: Exception (capture-screen)\n' +
                         '═══════════════════════════════════════════════════════\n' +
                         `Error: ${errorMessage}\n` +
                         `Permission Status: ${permissionStatus}\n\n` +
                         `Stack Trace:\n${errorStack}`;
    
    logError('IPC', `[capture-screen] ${detailedError}`);
    logError('IPC', '[capture-screen] Failed with exception:', e);
    return null;
  }
});

// capture-all-screens (returns array of screenshots from all displays)
ipcMain.handle('capture-all-screens', async () => {
  try {
    const displays = screen.getAllDisplays();
    const screenshots = [];
    const displayLookup = new Map();
    displays.forEach((display, idx) => {
      const idKey = String(display.id);
      const nameKey = (display.name || `Screen ${idx + 1}`).toLowerCase();
      displayLookup.set(idKey, {
        index: idx,
        name: display.name || `Screen ${idx + 1}`,
        nameKey,
      });
    });
    const resolveSourceScreenMeta = (source, fallbackIndex) => {
      let screenIndex = fallbackIndex;
      let screenName = source?.name || `Screen ${fallbackIndex}`;

      // 1) Try display_id (Electron 25+)
      const displayId =
        (typeof source?.display_id === 'string' && source.display_id) ||
        (typeof source?.id === 'string' && source.id.includes(':') ? source.id.split(':')[1] : null);
      if (displayId && displayLookup.has(displayId)) {
        const { index, name } = displayLookup.get(displayId);
        return { screenIndex: index + 1, screenName: name || screenName };
      }

      // 2) Try matching by name (e.g., "Screen 1", "DISPLAY1")
      const name = (source?.name || '').toLowerCase().trim();
      const nameMatch = name.match(/(\d+)/);
      if (nameMatch) {
        const numericIdx = parseInt(nameMatch[1], 10);
        if (!Number.isNaN(numericIdx) && displays[numericIdx - 1]) {
          const mapped = displays[numericIdx - 1];
          const mappedName = mapped.name || `Screen ${numericIdx}`;
          return { screenIndex: numericIdx, screenName: mappedName };
        }
      }
      // 3) Fallback to provided order
      return { screenIndex, screenName };
    };
    
    logInfo('IPC', `[capture-all-screens] Detected ${displays.length} display(s)`);
    displays.forEach((display, idx) => {
      logInfo('IPC', `[capture-all-screens] Display ${idx + 1}: ${display.size.width}x${display.size.height} (scale: ${display.scaleFactor})`);
    });
    
    // Get all screen sources using desktopCapturer.getSources()
    // Primary permission status is checked via systemPreferences.getMediaAccessStatus('screen')
    // This call gets the actual screen sources for capturing. If permission is granted, it will return sources.
    // This will NOT trigger a prompt if permission is already granted.
    const allDisplays = screen.getAllDisplays();
    const maxWidth = Math.max(...allDisplays.map(d => d.size.width));
    const maxHeight = Math.max(...allDisplays.map(d => d.size.height));
    
    logInfo('IPC', `[capture-all-screens] Requesting sources with thumbnailSize: ${maxWidth}x${maxHeight}`);
    
    let sources;
    try {
      logInfo('IPC', '[capture-all-screens] Calling desktopCapturer.getSources() with types: ["screen"]...');
      const startTime = Date.now();
      sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: maxWidth, height: maxHeight },
      });
      const duration = Date.now() - startTime;
      logInfo('IPC', `[capture-all-screens] desktopCapturer.getSources() completed in ${duration}ms, returned ${sources?.length || 0} source(s)`);
      
      if (sources && Array.isArray(sources)) {
        logInfo('IPC', `[capture-all-screens] Sources array type: ${typeof sources}, isArray: ${Array.isArray(sources)}, length: ${sources.length}`);
      } else {
        logWarn('IPC', `[capture-all-screens] Sources is not an array: ${typeof sources}, value: ${sources}`);
      }
    } catch (capturerError) {
      const errorMsg = capturerError?.message || capturerError?.toString() || String(capturerError) || 'Unknown error';
      logError('IPC', `[capture-all-screens] desktopCapturer.getSources() failed: ${errorMsg}`, capturerError);
      return {
        screenshots: [],
        error: `Failed to capture screens: ${errorMsg}`,
        permissionGranted: false
      };
    }
    
    // Update permission cache based on actual result from desktopCapturer
    // This is a secondary check - primary status comes from systemPreferences
    if (process.platform === 'darwin') {
      if (sources && sources.length > 0) {
        // Sources are available, permission is granted
        cachedScreenRecordingPermission = 'granted';
        permissionCheckTimestamp = Date.now();
        logInfo('IPC', `[capture-all-screens] Permission confirmed - ${sources.length} source(s) available, updating cache to 'granted'`);
      } else {
        // Only update cache to 'denied' if we're sure - might be a temporary issue
        // Check cache - handle both old ('authorized') and new ('granted') values
        const currentCacheStatus = cachedScreenRecordingPermission;
        if (currentCacheStatus !== 'granted' && currentCacheStatus !== 'authorized') {
          cachedScreenRecordingPermission = 'denied';
          permissionCheckTimestamp = Date.now();
          logWarn('IPC', '[capture-all-screens] No sources returned - permission may be denied, updating cache to "denied"');
        } else {
          logWarn('IPC', '[capture-all-screens] No sources returned but cache says granted - possible temporary issue, keeping cache as granted');
        }
      }
    }
    
    if (sources && sources.length > 0) {
      sources.forEach((source, idx) => {
        logInfo('IPC', `[capture-all-screens] Source ${idx + 1}: id="${source.id}", name="${source.name}"`);
      });
    } else {
      logWarn('IPC', '[capture-all-screens] ⚠️ No screen sources found! Check macOS screen recording permissions.');
    }
    
    if (!sources || sources.length === 0) {
      logWarn('IPC', `[capture-all-screens] No screen sources found (sources=${sources}, length=${sources?.length}) - checking permission status...`);
      
      // Get detailed permission status and error information
      let detailedError = '';
      let permissionGranted = false;
      let permissionStatus = 'unknown';
      
      if (process.platform === 'darwin') {
        // Get detailed permission status
        permissionStatus = checkMacOSScreenRecordingPermission();
        permissionGranted = permissionStatus === 'granted';
        
        logWarn('IPC', `[capture-all-screens] Detailed permission status check:`);
        logWarn('IPC', `  - Permission Status: ${permissionStatus}`);
        logWarn('IPC', `  - Permission Granted: ${permissionGranted}`);
        logWarn('IPC', `  - Cached Status: ${cachedScreenRecordingPermission}`);
        logWarn('IPC', `  - Display Count: ${displays.length}`);
        logWarn('IPC', `  - Requested Size: ${maxWidth}x${maxHeight}`);
        
        // Build detailed error message
        if (permissionStatus === 'granted') {
          detailedError = 'SCREENSHOT CAPTURE FAILED: Permission Status Analysis\n' +
                         '═══════════════════════════════════════════════════════\n' +
                         'Status: Screen recording permission is GRANTED\n' +
                         'Problem: desktopCapturer.getSources() returned 0 sources\n' +
                         'Possible Causes:\n' +
                         '  1. App needs to be restarted after permission was granted\n' +
                         '  2. macOS TCC (Transparency, Consent, and Control) cache needs refresh\n' +
                         '  3. Bundle ID mismatch between app and permission record\n' +
                         '  4. System-level issue with screen capture API\n\n' +
                         'Recommended Actions:\n' +
                         '  1. Quit and restart the Time Tracker app completely\n' +
                         '  2. If problem persists, check System Settings → Privacy & Security → Screen Recording\n' +
                         '  3. Verify "Time Tracker" appears in the list with toggle enabled\n' +
                         '  4. Try toggling the permission off and back on\n' +
                         '  5. Restart your Mac if issue continues\n\n' +
                         'Technical Details:\n' +
                         `  - Permission Status: ${permissionStatus}\n` +
                         `  - Displays Detected: ${displays.length}\n` +
                         `  - Sources Returned: 0\n` +
                         `  - Requested Thumbnail Size: ${maxWidth}x${maxHeight}\n`;
        } else if (permissionStatus === 'denied') {
          detailedError = 'SCREENSHOT CAPTURE FAILED: Permission Denied\n' +
                         '═══════════════════════════════════════════════════════\n' +
                         'Status: Screen recording permission is DENIED\n' +
                         'Problem: User has denied or not granted screen recording permission\n\n' +
                         'Required Action:\n' +
                         '  1. Open System Settings → Privacy & Security → Screen Recording\n' +
                         '  2. Find "Time Tracker" in the list\n' +
                         '  3. Enable the toggle next to "Time Tracker"\n' +
                         '  4. You may be prompted to enter your password\n' +
                         '  5. Quit and restart the Time Tracker app\n\n' +
                         'Note: The app needs this permission to capture screenshots for time tracking.\n' +
                         'Without it, screenshot capture will fail.\n\n' +
                         'Technical Details:\n' +
                         `  - Permission Status: ${permissionStatus}\n` +
                         `  - Displays Detected: ${displays.length}\n` +
                         `  - Sources Returned: 0\n`;
        } else if (permissionStatus === 'not-determined') {
          detailedError = 'SCREENSHOT CAPTURE FAILED: Permission Not Determined\n' +
                         '═══════════════════════════════════════════════════════\n' +
                         'Status: Screen recording permission has NOT been requested yet\n' +
                         'Problem: macOS has not shown the permission prompt to the user\n\n' +
                         'What to Expect:\n' +
                         '  - macOS will automatically show a permission prompt when you start tracking\n' +
                         '  - Or you can manually enable it in System Settings\n\n' +
                         'Required Action:\n' +
                         '  1. Start time tracking - macOS will prompt you for permission\n' +
                         '  2. Click "OK" when macOS asks for screen recording permission\n' +
                         '  3. Alternatively, go to System Settings → Privacy & Security → Screen Recording\n' +
                         '  4. Enable "Time Tracker" in the list\n' +
                         '  5. Restart the app after granting permission\n\n' +
                         'Technical Details:\n' +
                         `  - Permission Status: ${permissionStatus}\n` +
                         `  - Displays Detected: ${displays.length}\n` +
                         `  - Sources Returned: 0\n`;
        } else if (permissionStatus === 'restricted') {
          detailedError = 'SCREENSHOT CAPTURE FAILED: Permission Restricted\n' +
                         '═══════════════════════════════════════════════════════\n' +
                         'Status: Screen recording permission is RESTRICTED\n' +
                         'Problem: Permission is restricted by parental controls, MDM, or enterprise policy\n\n' +
                         'Possible Causes:\n' +
                         '  - Parental controls are enabled and blocking screen recording\n' +
                         '  - MDM (Mobile Device Management) policy is restricting access\n' +
                         '  - Enterprise/administrator restrictions\n\n' +
                         'Required Action:\n' +
                         '  - Contact your system administrator or remove restrictions\n' +
                         '  - Check System Settings → Privacy & Security → Screen Recording\n\n' +
                         'Technical Details:\n' +
                         `  - Permission Status: ${permissionStatus}\n` +
                         `  - Displays Detected: ${displays.length}\n` +
                         `  - Sources Returned: 0\n`;
        } else {
          detailedError = 'SCREENSHOT CAPTURE FAILED: Unknown Permission Status\n' +
                         '═══════════════════════════════════════════════════════\n' +
                         `Status: Permission status could not be determined (${permissionStatus})\n` +
                         'Problem: Unable to check screen recording permission status\n\n' +
                         'Recommended Actions:\n' +
                         '  1. Check System Settings → Privacy & Security → Screen Recording\n' +
                         '  2. Verify "Time Tracker" appears in the list\n' +
                         '  3. Ensure the toggle is enabled\n' +
                         '  4. Restart the app\n\n' +
                         'Technical Details:\n' +
                         `  - Permission Status: ${permissionStatus}\n` +
                         `  - Displays Detected: ${displays.length}\n` +
                         `  - Sources Returned: 0\n` +
                         `  - Cached Status: ${cachedScreenRecordingPermission}\n`;
        }
        
        // Log the detailed error
        logError('IPC', `[capture-all-screens] ${detailedError}`);
        
        if (permissionGranted) {
          return {
            screenshots: [],
            error: 'Screen recording permission is granted, but no sources are available. Please try restarting the app.',
            permissionGranted: true,
            detailedError: detailedError
          };
        }
      } else {
        // Non-macOS platform
        detailedError = 'SCREENSHOT CAPTURE FAILED: No Sources Available\n' +
                       '═══════════════════════════════════════════════════════\n' +
                       'Problem: desktopCapturer.getSources() returned 0 sources\n\n' +
                       'Possible Causes:\n' +
                       '  1. No displays connected\n' +
                       '  2. Platform-specific limitation\n' +
                       '  3. Screen capture API error\n\n' +
                       'Technical Details:\n' +
                       `  - Platform: ${process.platform}\n` +
                       `  - Displays Detected: ${displays.length}\n` +
                       `  - Sources Returned: 0\n`;
        logError('IPC', `[capture-all-screens] ${detailedError}`);
      }
      
      return {
        screenshots: [],
        error: 'No screen sources available. Please check screen recording permissions in System Settings → Privacy & Security → Screen Recording.',
        permissionGranted: permissionGranted,
        detailedError: detailedError,
        permissionStatus: permissionStatus
      };
    }
    
    // Map each source to a screenshot object with dataURL and name
    for (const source of sources) {
      try {
        const fallbackIndex = screenshots.length + 1;
        const { screenIndex, screenName } = resolveSourceScreenMeta(source, fallbackIndex);
        screenshots.push({
          dataURL: source.thumbnail.toDataURL('image/png'),
          name: screenName,
          screenIndex
        });
      } catch (thumbError) {
        logError('IPC', `[capture-all-screens] Failed to convert thumbnail to dataURL for source ${source.id}: ${thumbError.message}`);
      }
    }
    
    logInfo('IPC', `[capture-all-screens] Captured ${screenshots.length} screen(s) successfully`);
    return {
      screenshots: screenshots,
      error: null,
      permissionGranted: true
    };
  } catch (e) {
    const errorMessage = e?.message || String(e) || 'Unknown error';
    const errorStack = e?.stack || 'No stack trace available';
    
    // Get permission status for context
    let permissionStatus = 'unknown';
    let permissionGranted = false;
    
    if (process.platform === 'darwin') {
      try {
        permissionStatus = checkMacOSScreenRecordingPermission();
        permissionGranted = permissionStatus === 'granted';
      } catch (permError) {
        logWarn('IPC', `[capture-all-screens] Failed to check permission in error handler: ${permError?.message}`);
      }
    }
    
    const detailedError = 'SCREENSHOT CAPTURE FAILED: Exception Occurred\n' +
                         '═══════════════════════════════════════════════════════\n' +
                         `Error: ${errorMessage}\n\n` +
                         `Permission Status: ${permissionStatus}\n` +
                         `Permission Granted: ${permissionGranted}\n\n` +
                         'Stack Trace:\n' +
                         `${errorStack}\n\n` +
                         'This error occurred during screenshot capture. Check the logs above for more details.';
    
    logError('IPC', `[capture-all-screens] Failed with exception:`);
    logError('IPC', `  Error Message: ${errorMessage}`);
    logError('IPC', `  Permission Status: ${permissionStatus}`);
    logError('IPC', `  Permission Granted: ${permissionGranted}`);
    logError('IPC', `  Stack Trace: ${errorStack}`);
    logError('IPC', `[capture-all-screens] ${detailedError}`);
    
    return {
      screenshots: [],
      error: `Screenshot capture failed: ${errorMessage}`,
      permissionGranted: permissionGranted,
      detailedError: detailedError,
      permissionStatus: permissionStatus
    };
  }
});

// Check screen recording permission (used by preload.js -> checkScreenPermission)
// Returns the actual status from systemPreferences.getMediaAccessStatus('screen')
ipcMain.handle('check-screen-permission', async () => {
  try {
    if (process.platform !== 'darwin') {
      return {
        ok: true,
        hasPermission: true,
        platform: process.platform
      };
    }
    
    const hasPermission = await checkScreenRecordingPermission();
    
    return { 
      ok: true,
      hasPermission: hasPermission,
      platform: process.platform
    };
  } catch (error) {
    logWarn('Permissions', `check-screen-permission error: ${error?.message}`);
    return { 
      ok: false, 
      hasPermission: false,
      error: error?.message
    };
  }
});

ipcMain.handle('request-screen-permission', async () => {
  if (process.platform !== 'darwin') {
    return { ok: true, status: 'not_applicable' };
  }

  await requestScreenRecordingPermission();
  return { ok: true };
});

ipcMain.handle('request-accessibility-permission', async () => {
  if (process.platform !== 'darwin') {
    return { ok: true, status: 'not_applicable' };
  }

  await requestAccessibilityPermission();
  return { ok: true };
});

// Deep TCC database check - queries macOS TCC database directly
// This helps verify what macOS actually sees in the permission database
async function checkTCCDatabaseEntries(bundleId) {
  if (process.platform !== 'darwin' || !bundleId) {
    return { error: 'Not macOS or bundle ID missing' };
  }

  const result = {
    bundleId: bundleId,
    entries: [],
    accessible: false,
    error: null
  };

  try {
    // TCC database paths
    const tccPaths = [
      `${process.env.HOME}/Library/Application Support/com.apple.TCC/TCC.db`,
      '/Library/Application Support/com.apple.TCC/TCC.db'
    ];

    let tccPath = null;
    for (const tccPathCandidate of tccPaths) {
      if (fs.existsSync(tccPathCandidate)) {
        tccPath = tccPathCandidate;
        break;
      }
    }

    if (!tccPath) {
      result.error = 'TCC database not found (may require Full Disk Access)';
      return result;
    }

    // Query TCC database for all entries related to this bundle ID
    // This is the exact query from the instructions
    const query = `SELECT client, service, allowed, prompt_count FROM access WHERE client LIKE '%${bundleId}%' OR client LIKE '%timetracker%';`;
    const command = `sqlite3 "${tccPath}" "${query}"`;

    try {
      const output = execSync(command, {
        encoding: 'utf8',
        timeout: 3000,
        stdio: 'pipe'
      }).trim();

      result.accessible = true;

      if (output) {
        // Parse the output - each line is a row
        const lines = output.split('\n').filter(line => line.trim());
        result.entries = lines.map(line => {
          const parts = line.split('|');
          if (parts.length >= 4) {
            return {
              client: parts[0],
              service: parts[1],
              allowed: parts[2] === '1' ? 'YES' : parts[2] === '0' ? 'NO' : parts[2],
              promptCount: parts[3],
              // Interpret allowed value
              status: parts[2] === '1' ? 'ALLOWED' : parts[2] === '0' ? 'DENIED' : 'UNKNOWN'
            };
          }
          return { raw: line };
        });

        // Check for specific services
        const screenCaptureEntry = result.entries.find(e => 
          e.service === 'kTCCServiceScreenCapture' || 
          (e.service && e.service.includes('ScreenCapture'))
        );
        const accessibilityEntry = result.entries.find(e => 
          e.service === 'kTCCServiceAccessibility' || 
          (e.service && e.service.includes('Accessibility'))
        );

        result.screenCapture = screenCaptureEntry || { found: false };
        result.accessibility = accessibilityEntry || { found: false };

        // Analysis
        if (result.entries.length === 0) {
          result.analysis = 'NO ENTRIES FOUND - macOS never registered your app in TCC database';
          result.recommendation = 'App may not be properly code-signed or Hardened Runtime may not be enabled';
        } else if (screenCaptureEntry && screenCaptureEntry.allowed === '0') {
          result.analysis = 'Screen Recording entry found but ALLOWED=0 (DENIED) - even if UI shows ON';
          result.recommendation = 'This is a confirmed macOS bug. Try: sudo tccutil reset ScreenCapture';
        } else if (!screenCaptureEntry) {
          result.analysis = 'Screen Recording entry NOT FOUND in TCC database';
          result.recommendation = 'Permission may not have been requested yet, or app is not properly signed';
        } else if (screenCaptureEntry.allowed === '1') {
          result.analysis = 'Screen Recording entry found and ALLOWED=1 (GRANTED)';
          result.recommendation = 'Permission is correctly set in TCC database';
        }
      } else {
        result.analysis = 'No entries found for this bundle ID';
        result.recommendation = 'App may not be registered in TCC database - check code signing and Hardened Runtime';
      }
    } catch (execError) {
      const errorMsg = String(execError.message || execError.stderr || execError.stdout || '');
      if (errorMsg.includes('permission denied') || errorMsg.includes('database is locked')) {
        result.error = 'TCC database access denied (this is EXPECTED and OK - app does not need Full Disk Access)';
        result.accessible = false;
      } else if (errorMsg.includes('command not found') || errorMsg.includes('sqlite3')) {
        result.error = 'sqlite3 command not available';
      } else {
        result.error = `Query failed: ${errorMsg}`;
      }
    }
  } catch (error) {
    result.error = `Error checking TCC database: ${error?.message || error}`;
  }

  return result;
}

// Diagnostic handler to check screen capture capabilities
ipcMain.handle('diagnose-screen-capture', async () => {
  // Clear cache for fresh diagnostic check
  cachedScreenRecordingPermission = null;
  permissionCheckTimestamp = 0;
  
  const bundleId = process.platform === 'darwin' ? getMacOSBundleId() : null;
  const appName = app.getName();
  const isPackaged = app.isPackaged;
  
  const diagnostics = {
    platform: process.platform,
    appName: appName,
    isPackaged: isPackaged,
    bundleId: bundleId || 'unknown',
    displays: [],
    sources: [],
    permissions: 'unknown',
    permissionStatus: 'unknown',
    permissionCheck: null,
    cachedPermission: null,
    timestamp: new Date().toISOString(),
    troubleshooting: []
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
    
    if (displays.length === 0) {
      diagnostics.troubleshooting.push('WARNING: No displays detected. This may indicate a system issue.');
      logWarn('DIAGNOSTIC', 'No displays detected - this is unusual');
    }
    
    // Check permission status via systemPreferences (reliable method)
    if (process.platform === 'darwin') {
      try {
        // Get the actual status value from systemPreferences (cache already cleared above)
        const status = checkMacOSScreenRecordingPermission();
        diagnostics.permissionStatus = status; // 'granted', 'denied', 'not-determined', etc.
        diagnostics.permissions = status; // For backward compatibility
        diagnostics.permissionCheck = status === 'granted'; // Boolean for backward compatibility
        
        logInfo('DIAGNOSTIC', `Permission status (via systemPreferences): ${status}`);
        logInfo('DIAGNOSTIC', `Bundle ID: ${bundleId || 'unknown'}`);
        logInfo('DIAGNOSTIC', `App Name: ${appName}`);
        logInfo('DIAGNOSTIC', `Is Packaged: ${isPackaged}`);
        
        // Add troubleshooting steps based on status
        if (status === 'denied') {
          diagnostics.troubleshooting.push('Permission status is DENIED in TCC database.');
          diagnostics.troubleshooting.push(`Make sure "Time Tracker" (not "Electron") is enabled in System Settings → Privacy & Security → Screen Recording`);
          diagnostics.troubleshooting.push(`Expected bundle ID: ${bundleId || 'com.supagigs.timetracker'}`);
          diagnostics.troubleshooting.push('After enabling permission, QUIT the app completely (Cmd+Q) and restart it.');
          
          if (!isPackaged) {
            diagnostics.troubleshooting.push('⚠️ Running in DEV mode - permissions for dev builds are separate from packaged apps.');
            diagnostics.troubleshooting.push('If you granted permission to the packaged app, it won\'t work for dev mode and vice versa.');
          }
        } else if (status === 'not-determined') {
          diagnostics.troubleshooting.push('Permission has not been determined yet.');
          diagnostics.troubleshooting.push('macOS may prompt you when the app tries to capture a screenshot.');
        } else if (status === 'restricted') {
          diagnostics.troubleshooting.push('Permission is RESTRICTED (e.g., by parental controls or MDM).');
          diagnostics.troubleshooting.push('Contact your system administrator if this is a managed device.');
        } else if (status === 'granted') {
          diagnostics.troubleshooting.push('✅ Permission is GRANTED in TCC database.');
        }
      } catch (permError) {
        diagnostics.permissionCheckError = permError?.message || String(permError);
        diagnostics.troubleshooting.push(`Error checking permission: ${permError?.message}`);
        logWarn('DIAGNOSTIC', `Permission check failed: ${permError?.message}`);
      }
    }
    
    // Try to get screen sources - secondary verification (primary status from systemPreferences)
    let maxWidth = 1920;
    let maxHeight = 1080;
    
    if (displays && displays.length > 0) {
      maxWidth = Math.max(...displays.map(d => d.size.width));
      maxHeight = Math.max(...displays.map(d => d.size.height));
    } else {
      logWarn('DIAGNOSTIC', 'No displays detected - using default thumbnail size');
    }
    
    logInfo('DIAGNOSTIC', `Attempting desktopCapturer.getSources() with thumbnailSize: ${maxWidth}x${maxHeight}`);
    
    let sources;
    try {
      sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: maxWidth, height: maxHeight }
      });
      logInfo('DIAGNOSTIC', `desktopCapturer.getSources() returned ${sources?.length || 0} source(s)`);
    } catch (sourceError) {
      diagnostics.sourceError = sourceError?.message || String(sourceError);
      logError('DIAGNOSTIC', `desktopCapturer.getSources() failed: ${sourceError?.message}`, sourceError);
      sources = [];
    }
    
    diagnostics.sources = (sources || []).map((source, idx) => ({
      index: idx + 1,
      id: source.id,
      name: source.name,
      thumbnailSize: source.thumbnail ? source.thumbnail.getSize() : null
    }));
    
    // On macOS, use systemPreferences status as primary indicator
    // Sources check is secondary verification
    if (process.platform === 'darwin') {
      const statusFromSystemPreferences = diagnostics.permissionStatus || 'unknown';
      
      // Primary status from systemPreferences (most reliable)
      diagnostics.permissions = statusFromSystemPreferences;
      
      // Verify with sources if we have status
      if (statusFromSystemPreferences === 'granted') {
        if (!sources || sources.length === 0) {
          diagnostics.recommendation = 'Status shows granted in TCC, but no sources returned. App likely needs restart after granting permission.';
          diagnostics.troubleshooting.push('Permission is granted but screenshots still fail:');
          diagnostics.troubleshooting.push('1. Quit the app completely (Cmd+Q, not just close window)');
          diagnostics.troubleshooting.push('2. Restart the app');
          diagnostics.troubleshooting.push('3. Try capturing a screenshot again');
        } else if (sources.length < displays.length) {
          diagnostics.recommendation = `Status shows granted, but only ${sources.length} of ${displays.length} displays are accessible.`;
        } else {
          diagnostics.recommendation = 'Permission is granted and working correctly.';
        }
      } else if (statusFromSystemPreferences === 'denied') {
        diagnostics.recommendation = `Permission is DENIED in TCC database. Even if System Settings shows it enabled, there may be a bundle ID mismatch.`;
        diagnostics.troubleshooting.push('CRITICAL: Permission shows as DENIED. Common causes:');
        diagnostics.troubleshooting.push('1. Bundle ID mismatch - Check that the app in System Settings matches this app');
        diagnostics.troubleshooting.push(`   - Expected bundle ID: ${bundleId || 'com.supagigs.timetracker'}`);
        diagnostics.troubleshooting.push(`   - App name should be: "Time Tracker" (not "Electron")`);
        diagnostics.troubleshooting.push(`   - Current app name: "${appName}"`);
        diagnostics.troubleshooting.push(`   - Is packaged: ${isPackaged}`);
        diagnostics.troubleshooting.push('2. App not restarted after granting permission');
        diagnostics.troubleshooting.push('3. Permission granted to wrong app (dev vs packaged)');
        diagnostics.troubleshooting.push('');
        diagnostics.troubleshooting.push('SOLUTION:');
        diagnostics.troubleshooting.push('1. Open System Settings → Privacy & Security → Screen Recording');
        diagnostics.troubleshooting.push('2. Find "Time Tracker" in the list (NOT "Electron")');
        diagnostics.troubleshooting.push('3. Make sure the toggle is ON');
        diagnostics.troubleshooting.push('4. If app is not listed, try capturing a screenshot to trigger the permission prompt');
        diagnostics.troubleshooting.push('5. QUIT the app completely (Cmd+Q)');
        diagnostics.troubleshooting.push('6. Restart the app');
        diagnostics.troubleshooting.push('7. If still not working, try resetting permission:');
        diagnostics.troubleshooting.push(`   Terminal: tccutil reset ScreenCapture ${bundleId || 'com.supagigs.timetracker'}`);
      } else if (statusFromSystemPreferences === 'not-determined') {
        diagnostics.recommendation = 'Permission has not been determined yet. It may be requested when capturing screenshots.';
        diagnostics.troubleshooting.push('Permission status is "not-determined" - this means macOS hasn\'t asked for permission yet.');
        diagnostics.troubleshooting.push('Try capturing a screenshot and macOS should prompt you for permission.');
      } else if (statusFromSystemPreferences === 'restricted') {
        diagnostics.recommendation = 'Permission is restricted (e.g., by parental controls or MDM).';
        diagnostics.troubleshooting.push('Permission is RESTRICTED by system policy (parental controls or MDM).');
        diagnostics.troubleshooting.push('Contact your system administrator to enable Screen Recording permission.');
      } else {
        // Status is 'unknown' - could be due to TCC database access issues (which is OK)
        diagnostics.recommendation = 'Permission status is unknown. This may be because TCC database access was denied (which is EXPECTED and OK).';
        diagnostics.troubleshooting.push('Permission status could not be determined via TCC database.');
        diagnostics.troubleshooting.push('NOTE: If you see "permission denied" when accessing TCC database, this is NORMAL.');
        diagnostics.troubleshooting.push('The app does NOT need Full Disk Access to function - it only needs Screen Recording permission.');
        diagnostics.troubleshooting.push('Check System Settings → Privacy & Security → Screen Recording manually.');
        diagnostics.troubleshooting.push('Make sure "Time Tracker" is enabled in Screen Recording permissions.');
      }
    } else {
      diagnostics.permissions = 'not_applicable';
    }
    
    // Add TCC database check for macOS
    if (process.platform === 'darwin' && bundleId) {
      try {
        diagnostics.tccDatabase = await checkTCCDatabaseEntries(bundleId);
      } catch (tccError) {
        diagnostics.tccDatabaseError = tccError?.message || String(tccError);
        logWarn('DIAGNOSTIC', `TCC database check failed: ${tccError?.message}`);
      }
    }
    
    logInfo('DIAGNOSTIC', JSON.stringify(diagnostics, null, 2));
    return diagnostics;
  } catch (error) {
    logError('DIAGNOSTIC', 'Error diagnosing screen capture', error);
    diagnostics.error = error?.message || String(error);
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

// save-session-before-close - saves session data synchronously before window closes
ipcMain.handle('save-session-before-close', async (event, sessionData) => {
  try {
    logInfo('IPC', 'save-session-before-close called', !!sessionData);
    
    if (!sessionData) {
      return { saved: false, error: 'No session data provided' };
    }

    // The session data should already be saved by the renderer
    // This handler just confirms the save was initiated
    // The actual save happens in the renderer's beforeunload handler
    return { saved: true };
  } catch (e) {
    logError('IPC', 'save-session-before-close failed', e);
    return { saved: false, error: e.message };
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


ipcMain.on('timer-stopped', () => {
  logInfo('Timer', 'Timer stopped');

  isTimerActive = false;
  timeTrackingState.active = false;

  if (updateDownloadedButDeferred && updateInfoCache) {
    updateDownloadedButDeferred = false;
    logInfo('Updater', 'Timer stopped → showing update dialog');
    showUpdateDialogSafely();
  }
});

function safeQuitAndInstall() {
  try {
    logInfo('Updater', 'Preparing safe shutdown for update');

    // 🔒 STOP background activity FIRST
    if (global.__idlePollInterval) {
      clearInterval(global.__idlePollInterval);
      global.__idlePollInterval = null;
    }

    if (backgroundScreenshotInterval) {
      clearInterval(backgroundScreenshotInterval);
      backgroundScreenshotInterval = null;
    }

    if (batchFlushInterval) {
      clearTimeout(batchFlushInterval);
      batchFlushInterval = null;
    }

    // 🔕 Remove power & app listeners
    powerMonitor.removeAllListeners();
    app.removeAllListeners('before-quit');
    app.removeAllListeners('window-all-closed');

    // 🧹 Close windows cleanly
    BrowserWindow.getAllWindows().forEach(win => {
      if (!win.isDestroyed()) {
        win.removeAllListeners();
        win.close();
      }
    });

    // 🧠 FINAL SAFETY: delay install slightly
    setTimeout(() => {
      logInfo('Updater', 'Executing quitAndInstall');
      autoUpdater.quitAndInstall(false, true);
    }, 300);

  } catch (err) {
    logError('Updater', 'Safe install failed:', err);
  }
}


// ============ APP LIFECYCLE ============
app.whenReady().then(() => {
  logInfo('App', 'APP VERSION:', app.getVersion());
  // Enable auto-launch on system startup
  app.setLoginItemSettings({
    openAtLogin: true
  });
  logInfo('App', 'Auto-launch on login enabled');

  // Enable cookie persistence for Frappe sessions
  // This allows the session cookie (sid) to persist across app restarts
  const defaultSession = session.defaultSession;
  
  // Flush cookies to disk to ensure persistence
  defaultSession.cookies.flushStore().catch(err => {
    logWarn('Session', `Failed to flush cookie store: ${err.message}`);
  });
  
  // Set up cookie persistence
  logInfo('Session', 'Cookie persistence enabled for Frappe sessions');
  
  createWindow();
  // Register listeners FIRST
  autoUpdater.on('error', (err) => {
    logError('AutoUpdater', 'Update check failed: ' + (err?.message || err), err);
  });

  autoUpdater.on('update-available', (info) => {
    logInfo('AutoUpdater', 'Update available:', info?.version || info);
  });

  autoUpdater.on('update-not-available', () => {
    logInfo('AutoUpdater', 'No update available');
  });
  // THEN trigger check
  if (app.isPackaged) {
      try {
        logInfo('Updater', 'Checking for updates...');
        autoUpdater.checkForUpdates();
      } catch (e) {
        logWarn('Updater', 'Update check failed:', e.message);
      }

  } else {
    logInfo('AutoUpdater', 'Skipping update check (dev mode)');
  }
  // 📦 When update is downloaded
  autoUpdater.on('update-downloaded', (info) => {
    logInfo('Updater', `Update downloaded: v${info.version}`);
    updateInfoCache = info;
  
    if (isTimerActive) {
      updateDownloadedButDeferred = true;
      logInfo('Updater', 'Timer running → deferring update dialog');
      return;
    }
  
    showUpdateDialogSafely();
  });
  
});

function showUpdateDialogSafely() {
  if (
    updateDialogVisible ||
    !mainWindow ||
    mainWindow.isDestroyed() ||
    !updateInfoCache ||
    isTimerActive
  ) {
    return;
  }

  updateDialogVisible = true;

  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Update Ready',
    message: 'A new version is ready to install.',
    detail: 'Restart the app to apply the update.',
    buttons: ['Restart now'],
    defaultId: 0,
    noLink: true
  }).then(() => {
    updateDialogVisible = false;
    safeQuitAndInstall();
  });
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

let isQuitting = false;
let isFlushingOnShutdown = false;

async function flushScreenshotBatchOnShutdown() {
  // Wait for any running batch, but enforce a hard timeout so shutdown
  // can't hang indefinitely if something goes wrong.
  const MAX_WAIT_MS = 30000; // 30 seconds
  const POLL_INTERVAL_MS = 100;
  const start = Date.now();

  while (isBatchUploading && Date.now() - start < MAX_WAIT_MS) {
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  if (isBatchUploading) {
    logWarn(
      'Shutdown',
      `Batch upload still running after ${MAX_WAIT_MS}ms timeout. Proceeding with flush attempt anyway.`,
    );
  }

  await flushScreenshotBatch();
}

let isUpdateQuit = false;

autoUpdater.on('before-quit-for-update', () => {
  isUpdateQuit = true;
});
app.on('before-quit', (event) => {
    if (isTimerActive && updateInfoCache) {
      logWarn('Updater', 'Blocked quit — timer still running');
      event.preventDefault();
    }
  

  // If we're already flushing, prevent quit until flush completes
  if (isFlushingOnShutdown) {
    event.preventDefault();
    return;
  }

  if (!isQuitting) {
    event.preventDefault();
    isQuitting = true;
    isFlushingOnShutdown = true;

    (async () => {
      try {
        // Ensure we wait for any in-progress batch upload before flushing
        // remaining screenshots to avoid data loss on shutdown.
        await flushScreenshotBatchOnShutdown();
      } catch (err) {
        logWarn('Shutdown', `Error flushing screenshot batch on quit: ${err?.message || err}`);
      } finally {
        isFlushingOnShutdown = false;
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

const { getEmployeeDetailsForUser }= require('./frappeService');

ipcMain.handle('frappe:get-employee-for-user', async (_event, userEmail) => {
  try {
    // Prefer using the helper that returns both ID and company:
    const details = await getEmployeeDetailsForUser(userEmail); // from frappeService.js

    if (!details || !details.employeeId) {
      return { success: false, error: 'Employee not found' };
    }

    return {
      success: true,
      employeeId: details.employeeId,
      company: details.company || null,
    };
  } catch (err) {
    logError?.('Frappe', `get-employee-for-user failed for ${userEmail}: ${err.message}`, err);
    return { success: false, error: err.message || 'Unknown error' };
  }
});