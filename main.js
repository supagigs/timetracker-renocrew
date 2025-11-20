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

// ============ GLOBAL STATE ============
const IDLE_THRESHOLD_SECONDS = 30;
// Screenshot retention period in days (screenshots older than this will be automatically deleted)
const SCREENSHOT_RETENTION_DAYS = parseInt(process.env.SCREENSHOT_RETENTION_DAYS || '90', 10);
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

// ============ MAIN WINDOW CREATION ============
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    icon: path.join(__dirname, 'SupagigsIcon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    }
  });

  mainWindow.loadFile('renderer/screens/login.html');
  mainWindow.on('closed', () => { mainWindow = null; });

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
async function getActiveAppName() {
  try {
    // load module if not loaded
    if (!activeWindowModule) activeWindowModule = await import('active-win');

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
      return null;
    }

    const result = await fn();
    if (!result) return null;
    const windowTitle = typeof result.title === 'string' ? result.title.trim() : null;
    const ownerName = typeof result.owner?.name === 'string' ? result.owner.name.trim() : null;
    return windowTitle || ownerName || null;
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
      const isServiceRole = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
      
      if (!isServiceRole) {
        logWarn('Supabase', 'WARNING: SUPABASE_SERVICE_ROLE_KEY not set, using ANON_KEY. RLS policies may block deletions!');
      } else {
        logInfo('Supabase', 'Using SERVICE_ROLE_KEY - RLS policies will be bypassed');
      }
      
      supabaseClientInstance = createClient(process.env.SUPABASE_URL, serviceRoleKey);
    }
    return supabaseClientInstance;
  } catch (e) {
    logError('Supabase', 'Failed to create client', e);
    return null;
  }
}

async function resolveScreenshotIntervalForUser(email, sessionId) {
  try {
    const supabase = getSupabaseClient();
    if (!supabase) {
      logWarn('SCREENSHOTS', 'No Supabase client available, using default interval');
      return 300000; // 5 minutes default
    }

    const normalizedEmail = email.trim().toLowerCase();
    logInfo('SCREENSHOTS', `Resolving interval for freelancer: ${normalizedEmail}, session: ${sessionId}`);

    let clientEmail = null;

    // First, try to get the client from the session's project
    if (sessionId) {
      const sessionIdNum = typeof sessionId === 'string' ? parseInt(sessionId, 10) : sessionId;
      if (!isNaN(sessionIdNum)) {
        // Get the session to find the project_id
        const { data: session, error: sessionError } = await supabase
          .from('time_sessions')
          .select('project_id')
          .eq('id', sessionIdNum)
          .maybeSingle();

        if (!sessionError && session?.project_id) {
          logInfo('SCREENSHOTS', `Found session with project_id: ${session.project_id}`);
          
          // Get the project assignment to find the client (assigned_by)
          const { data: projectAssignment, error: projectError } = await supabase
            .from('project_assignments')
            .select('assigned_by')
            .eq('project_id', session.project_id)
            .eq('freelancer_email', normalizedEmail)
            .maybeSingle();

          if (!projectError && projectAssignment?.assigned_by) {
            clientEmail = projectAssignment.assigned_by.trim().toLowerCase();
            logInfo('SCREENSHOTS', `Found client from project assignment: ${clientEmail}`);
          } else if (projectError) {
            logWarn('SCREENSHOTS', `Error looking up project assignment: ${projectError.message}`);
          }
        } else if (sessionError) {
          logWarn('SCREENSHOTS', `Error looking up session: ${sessionError.message}`);
        }
      }
    }

    // Fallback: If we couldn't get client from project, use the most recent assignment
    if (!clientEmail) {
      logInfo('SCREENSHOTS', 'Falling back to most recent client assignment');
      const { data: assignment, error: assignmentError } = await supabase
        .from('client_freelancer_assignments')
        .select('client_email')
        .eq('freelancer_email', normalizedEmail)
        .eq('is_active', true)
        .order('assigned_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (assignmentError) {
        logWarn('SCREENSHOTS', `Failed to lookup client assignment: ${assignmentError.message}`);
        return 300000; // 5 minutes default
      }

      if (!assignment?.client_email) {
        logWarn('SCREENSHOTS', `No active client assignment found for freelancer: ${normalizedEmail}`);
        return 300000; // 5 minutes default
      }

      clientEmail = assignment.client_email.trim().toLowerCase();
      logInfo('SCREENSHOTS', `Using client from most recent assignment: ${clientEmail}`);
    }

    // Now look up the client settings
    const { data: settings, error: settingsError } = await supabase
      .from('client_settings')
      .select('screenshot_interval_seconds, client_email')
      .eq('client_email', clientEmail)
      .maybeSingle();

    if (settingsError) {
      logWarn('SCREENSHOTS', `Failed to lookup client settings: ${settingsError.message}`);
      return 300000; // 5 minutes default
    }

    if (!settings) {
      logWarn('SCREENSHOTS', `No client settings found for client: ${clientEmail} - using default interval`);
      return 300000; // 5 minutes default
    }

    logInfo('SCREENSHOTS', `Found client settings: ${JSON.stringify(settings)}`);

    const intervalSeconds = Number(settings.screenshot_interval_seconds);
    if (!Number.isFinite(intervalSeconds) || intervalSeconds <= 0) {
      logWarn('SCREENSHOTS', `Invalid interval value: ${settings.screenshot_interval_seconds} - using default`);
      return 300000; // 5 minutes default
    }

    // Clamp between 30s and 1h for safety
    const clamped = Math.min(Math.max(intervalSeconds, 30), 3600);
    const intervalMs = clamped * 1000;
    logInfo('SCREENSHOTS', `Resolved interval: ${intervalSeconds} seconds (${intervalMs} ms) for client: ${clientEmail}`);
    return intervalMs;
  } catch (e) {
    logWarn('SCREENSHOTS', `resolveScreenshotIntervalForUser error: ${e.message}`);
    return 300000; // 5 minutes default
  }
}

async function compressToJpegBufferFromDataUrl(dataUrl) {
  const sharp = require('sharp');
  const base64 = dataUrl.split(',')[1];
  const inputBuffer = Buffer.from(base64, 'base64');
  const UPLOAD_WIDTH = 800;
  const JPEG_QUALITY = 70;
  const jpegBuffer = await sharp(inputBuffer)
    .resize(UPLOAD_WIDTH, null, { withoutEnlargement: true, fit: 'inside' })
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer();
  logInfo('Compress', `JPEG size: ${(jpegBuffer.length / 1024 / 1024).toFixed(2)} MB`);
  return jpegBuffer;
}

function showToastNotification(screenshotId, base64Data) {
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
    // Check if window still exists before showing
    if (toastWin && !toastWin.isDestroyed()) {
      toastWin.showInactive();
      // Pass screenshotId instead of filePath (now represents storage path)
      toastWin.webContents.send('toast-init', { filePath: screenshotId, base64Data });
    }
  });

  setTimeout(() => { if (toastWin) toastWin.close(); }, 5000);
  toastWin.on('closed', () => { toastWin = null; });
}

// ============ CANCELLATION CHECKER ============
// screenshotId can be filePath (for backward compatibility) or storagePath
const isCancelled = (screenshotId) => pendingScreenshots.get(screenshotId) === true;

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

// ============ SCREENSHOT UPLOAD HANDLER ============
async function handleScreenshotUpload(uploadData) {
  const { userEmail, sessionId, screenshotData, timestamp, isIdle, contextLabel, screenIndex, screenName } = uploadData;
  
  try {
    const jpegBuffer = await compressToJpegBufferFromDataUrl(screenshotData);
    
    // Use original ISO timestamp for database
    const dbTimestamp = timestamp;
    
    // Create filename-friendly timestamp (replace colons and dots with dashes)
    let filenameTimestamp = timestamp.replace(/[:.]/g, '-');
    
    // Include screen identifier in filename if multiple screens
    const screenSuffix = screenIndex ? `_screen${screenIndex}` : '';
    const jpegFilename = `${userEmail.replace(/@/g, '_at_').replace(/\./g, '_')}_${sessionId}_${filenameTimestamp}${screenSuffix}.jpg`;
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error('Supabase client unavailable');

    const storagePath = `${userEmail}/${sessionId}/${jpegFilename}`;
    
    // Use storagePath as unique identifier for tracking
    const screenshotId = storagePath;
    pendingScreenshots.set(screenshotId, false);
    logInfo(contextLabel, `Uploading screenshot to storage: ${storagePath}`);

    // Show toast notification with storage path identifier
    showToastNotification(screenshotId, screenshotData);

    // Check if cancelled before upload
    if (isCancelled(screenshotId)) {
      logInfo(contextLabel, 'Upload cancelled before storage');
      pendingScreenshots.delete(screenshotId);
      return { ok: false, error: 'Upload cancelled by user' };
    }

    // Upload directly to Supabase Storage (no local file)
    const { error: storageError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, jpegBuffer, { contentType: 'image/jpeg', upsert: true });

    // Check if cancelled during upload
    if (isCancelled(screenshotId)) {
      logInfo(contextLabel, 'Upload cancelled during storage upload');
      pendingScreenshots.delete(screenshotId);
      if (!storageError) {
        try {
          await supabase.storage.from(STORAGE_BUCKET).remove([storagePath]);
          logInfo(contextLabel, 'Removed from Supabase storage');
        } catch (e) {
          logError(contextLabel, 'Error removing from storage', e);
        }
      }
      return { ok: false, error: 'Upload cancelled by user' };
    }

    if (storageError) throw storageError;

    // Check if cancelled after storage upload but before DB insertion
    if (isCancelled(screenshotId)) {
      logInfo(contextLabel, 'Upload cancelled after storage, before DB insertion');
      pendingScreenshots.delete(screenshotId);
      try {
        await supabase.storage.from(STORAGE_BUCKET).remove([storagePath]);
        logInfo(contextLabel, 'Removed from Supabase storage');
      } catch (e) {
        logError(contextLabel, 'Error removing from storage', e);
      }
      return { ok: false, error: 'Upload cancelled by user' };
    }

    const publicUrlRes = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);
    const publicUrl = publicUrlRes?.data?.publicUrl ?? null;
    if (!publicUrl) throw new Error('Unable to get storage public URL');

    const appName = await getActiveAppName() || app.getName() || 'Time Tracker';
    // Include screen info in app name if multiple screens
    const displayAppName = screenIndex && screenName 
      ? `${appName} (${screenName})` 
      : appName;
    
    // Final check before DB insertion
    if (isCancelled(screenshotId)) {
      logInfo(contextLabel, 'Upload cancelled right before DB insertion');
      pendingScreenshots.delete(screenshotId);
      try {
        await supabase.storage.from(STORAGE_BUCKET).remove([storagePath]);
        logInfo(contextLabel, 'Removed from Supabase storage');
      } catch (e) {
        logError(contextLabel, 'Error removing from storage', e);
      }
      return { ok: false, error: 'Upload cancelled by user' };
    }
    
    await insertScreenshotToDatabase(supabase, userEmail, sessionId, publicUrl, dbTimestamp, displayAppName, isIdle);

    broadcastScreenshotCaptured({
      timestamp,
      previewDataUrl: screenshotData,
      storageUrl: publicUrl,
      storagePath,
      sessionId,
      appName,
      isIdle: Boolean(isIdle)
    });

    pendingScreenshots.delete(screenshotId);
    logInfo(contextLabel, 'Upload completed successfully');
    
    return { ok: true, storagePath, url: publicUrl, appName, capturedIdle: Boolean(isIdle) };
  } catch (e) {
    logError(contextLabel, `Error: ${e?.message || 'queue error'}`, e);
    return { ok: false, error: e?.message || 'queue error' };
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
  logInfo('DELETE', `Handler called with storagePath: ${filePath}`);
  
  try {
    // filePath is now the storagePath (e.g., "user@email.com/session123/filename.jpg")
    const storagePath = filePath;
    
    // Step 1: Mark as cancelled in pending map - this will prevent DB insertion
    if (pendingScreenshots.has(storagePath)) {
      pendingScreenshots.set(storagePath, true);
      logInfo('DELETE', 'Marked as cancelled in pending map - will prevent DB storage');
    } else {
      logWarn('DELETE', 'Screenshot not found in pending map - may have already been processed');
    }

    // Step 2: Get Supabase client
    const supabase = getSupabaseClient();
    if (!supabase) {
      // If no supabase, just mark as cancelled and return
      logWarn('DELETE', 'Supabase client unavailable, only marking as cancelled');
      return { 
        success: true, 
        message: 'Screenshot cancelled (will not be stored)',
        filename: path.basename(storagePath)
      };
    }

    // Step 3: Try to delete from storage if it was already uploaded
    if (storagePath) {
      try {
        const { error: storageError } = await supabase.storage
          .from(STORAGE_BUCKET)
          .remove([storagePath]);
        
        if (storageError) {
          logWarn('DELETE', `Error deleting from storage (may not exist yet): ${storageError.message}`);
        } else {
          logInfo('DELETE', `Deleted from Supabase storage: ${storagePath}`);
        }
      } catch (e) {
        logWarn('DELETE', `Error attempting to delete from storage: ${e.message}`);
      }
    }

    // Step 4: Extract filename from storage path for database lookup
    const filename = path.basename(storagePath);
    logInfo('DELETE', `Extracted filename: ${filename}`);

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
      logInfo('DELETE', `No database record found for: ${filename} - screenshot was cancelled before DB insertion`);
      // Screenshot was cancelled before DB insertion - this is the desired behavior
      // Storage deletion was already attempted in Step 3
      // Return success since we prevented DB storage
      return { 
        success: true, 
        message: 'Screenshot cancelled - will not be stored in database',
        filename 
      };
    } else {
      logInfo('DELETE', `Found database record ID: ${screenshot.id} - deleting from DB and storage`);

      // Step 6: Delete from storage bucket (if not already deleted)
      if (screenshot.screenshot_data) {
        try {
          const extractedStoragePath = extractStoragePathFromUrl(screenshot.screenshot_data, STORAGE_BUCKET);
          
          if (extractedStoragePath) {
            logInfo('DELETE', `Attempting to delete from storage: ${extractedStoragePath}`);
            
            const { error: storageError } = await supabase.storage
              .from(STORAGE_BUCKET)
              .remove([extractedStoragePath]);

            if (storageError) {
              logError('DELETE', `Error deleting from storage: ${storageError.message}`, storageError);
              // Don't throw - continue to delete database record even if storage deletion fails
            } else {
              logInfo('DELETE', `Successfully deleted from storage: ${extractedStoragePath}`);
            }
          } else {
            logWarn('DELETE', `Could not extract storage path from URL: ${screenshot.screenshot_data}`);
          }
        } catch (e) {
          logError('DELETE', `Error parsing storage path: ${e.message}`, e);
          // Don't throw - continue to delete database record even if storage deletion fails
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
      if (window !== toastWin) {
        window.webContents.send('screenshot-deleted', { filePath, filename });
      }
    });
    logInfo('DELETE', 'Broadcasted screenshot-deleted event to main window');

    // Step 9: Close toast window
    if (toastWin) {
      toastWin.close();
      toastWin = null;
    }

    return { 
      success: true, 
      message: 'Screenshot deleted from storage and database',
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
    clearInterval(backgroundScreenshotInterval);
    backgroundScreenshotInterval = null;
  }
  currentUserEmail = userEmail;
  currentSessionId = sessionId;
  isBackgroundCaptureActive = true;

  // Resolve the screenshot interval based on the client's settings
  const intervalMs = await resolveScreenshotIntervalForUser(userEmail, sessionId);
  logInfo('IPC', `Starting background screenshots with interval: ${intervalMs}ms (${intervalMs / 1000}s)`);

  backgroundScreenshotInterval = setInterval(async () => {
    if (!isBackgroundCaptureActive || isBackgroundTickRunning) return;
    isBackgroundTickRunning = true;
    try {
      // Capture all screens
      const displays = screen.getAllDisplays();
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 1920, height: 1080 } // High quality
      });

      if (sources.length === 0) {
        logWarn('BG-UPLOAD', 'No screen sources found');
        return;
      }

      const baseTimestamp = new Date().toISOString();

      // Capture and upload each screen
      for (let i = 0; i < sources.length; i++) {
        try {
          const source = sources[i];
          
          // Get actual display size if available
          const display = displays[i] || displays[0];
          const { width, height } = display.size;
          
          // Get properly sized source for this specific display
          const sizedSources = await desktopCapturer.getSources({
            types: ['screen'],
            thumbnailSize: { width, height }
          });
          
          const sizedSource = sizedSources.find(s => s.id === source.id) || source;
          const screenshotData = sizedSource.thumbnail.toDataURL('image/png');
          
          // Use original ISO timestamp for database, modification will happen in handleScreenshotUpload
          await handleScreenshotUpload({
            userEmail: currentUserEmail,
            sessionId: currentSessionId,
            screenshotData,
            timestamp: baseTimestamp, // Keep original ISO format
            isIdle: isUserIdle,
            contextLabel: `BG-UPLOAD-SCREEN${i + 1}`,
            screenIndex: i + 1,
            screenName: source.name
          });
          
          logInfo('BG-UPLOAD', `Uploaded screenshot from screen ${i + 1}: ${source.name}`);
        } catch (error) {
          logError('BG-UPLOAD', `Error uploading screenshot from screen ${i + 1}:`, error);
        }
      }
    } catch (error) {
      logError('BG-UPLOAD', 'Error capturing screenshots', error);
    } finally {
      isBackgroundTickRunning = false;
    }
  }, intervalMs);
  
  logInfo('IPC', 'Background screenshots started');
  return true;
});

ipcMain.handle('stop-background-screenshots', () => {
  isBackgroundCaptureActive = false;
  if (backgroundScreenshotInterval) {
    clearInterval(backgroundScreenshotInterval);
    backgroundScreenshotInterval = null;
  }
  logInfo('IPC', 'Background screenshots stopped');
  return true;
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
    // Get all displays to determine their actual sizes
    const displays = screen.getAllDisplays();
    
    // Get all screen sources with high resolution
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1920, height: 1080 } // Large size for high quality
    });

    if (!sources || sources.length === 0) {
      logWarn('SCREENSHOT', 'No screen sources found');
      return [];
    }

    const screenshots = [];

    // Iterate through all screen sources
    for (const source of sources) {
      try {
        // Get the actual display size if available (match by name or index)
        const display = displays.find(d => 
          d.label === source.name || 
          source.name.includes(`Screen ${displays.indexOf(d) + 1}`)
        ) || displays[0]; // Fallback to primary display

        // Use actual display size for better quality
        const { width, height } = display.size;
        
        // Get source with proper size
        const sizedSources = await desktopCapturer.getSources({
          types: ['screen'],
          thumbnailSize: { width, height }
        });
        
        const sizedSource = sizedSources.find(s => s.id === source.id) || source;
        const thumbnailImage = sizedSource.thumbnail;
        
        // Convert to data URL
        const imageDataURL = thumbnailImage.toDataURL('image/png');
        
        screenshots.push({
          id: source.id,
          name: source.name,
          displayIndex: displays.indexOf(display),
          dataURL: imageDataURL,
          width,
          height
        });
        
        logInfo('SCREENSHOT', `Captured screen: ${source.name} (${width}x${height})`);
      } catch (error) {
        logError('SCREENSHOT', `Error capturing screen ${source.name}:`, error);
      }
    }

    logInfo('SCREENSHOT', `Captured ${screenshots.length} screen(s)`);
    return screenshots;
  } catch (error) {
    logError('SCREENSHOT', 'Error capturing all screens:', error);
    return [];
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
// Note: Screenshots are no longer stored locally, only in Supabase Storage
ipcMain.handle('get-local-screenshots', async (event, email, startTime, endTime) => {
  // Return empty array since screenshots are stored only in Supabase
  return [];
});

// open-local-screenshot
// Note: Screenshots are no longer stored locally, only in Supabase Storage
ipcMain.handle('open-local-screenshot', async (event, filePath) => {
  // Screenshots are stored in Supabase, not locally
  logWarn('IPC', 'open-local-screenshot called but screenshots are not stored locally');
  return { ok: false, error: 'Screenshots are stored in Supabase, not locally' };
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

// Manual screenshot cleanup trigger (for testing/admin)
ipcMain.handle('cleanup-old-screenshots', async (event, daysOld = SCREENSHOT_RETENTION_DAYS) => {
  try {
    logInfo('IPC', `Manual cleanup triggered for screenshots older than ${daysOld} days`);
    const result = await cleanupOldScreenshots(daysOld);
    return { ok: true, ...result };
  } catch (e) {
    logError('IPC', 'cleanup-old-screenshots failed', e);
    return { ok: false, error: e.message };
  }
});

// ============ SCREENSHOT CLEANUP ============
/**
 * Extracts storage path from Supabase public URL
 * Handles formats like:
 * - https://[project].supabase.co/storage/v1/object/public/[bucket]/[path]
 * - Direct storage paths: [bucket]/[path] or [path]
 */
function extractStoragePathFromUrl(url, bucketName) {
  try {
    if (!url || !bucketName) {
      logWarn('STORAGE_PATH', `Missing url or bucketName: url=${url}, bucketName=${bucketName}`);
      return null;
    }

    // If URL already looks like a storage path (no http/https), return as-is if it starts with bucket
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      if (url.startsWith(`${bucketName}/`)) {
        return url.substring(bucketName.length + 1);
      }
      // If it's just a path without bucket prefix, assume it's the full path
      return url;
    }

    // Parse full URL
    const urlParts = url.split('/');
    const bucketIndex = urlParts.indexOf(bucketName);
    
    if (bucketIndex !== -1 && bucketIndex < urlParts.length - 1) {
      const storagePath = urlParts.slice(bucketIndex + 1).join('/');
      logInfo('STORAGE_PATH', `Extracted path from URL: ${storagePath}`);
      return storagePath;
    }
    
    logWarn('STORAGE_PATH', `Could not find bucket '${bucketName}' in URL: ${url}`);
    return null;
  } catch (e) {
    logError('STORAGE_PATH', `Error parsing storage path from URL: ${e.message}`, e);
    return null;
  }
}

/**
 * Deletes screenshots older than the specified number of days
 * @param {number} daysOld - Number of days (default: SCREENSHOT_RETENTION_DAYS)
 */
async function cleanupOldScreenshots(daysOld = SCREENSHOT_RETENTION_DAYS) {
  try {
    const supabase = getSupabaseClient();
    if (!supabase) {
      logWarn('CLEANUP', 'No Supabase client available, skipping cleanup');
      return { deleted: 0, errors: 0 };
    }

    // Calculate the cutoff date (X days ago based on daysOld parameter)
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    const cutoffDateStr = cutoffDate.toISOString();

    logInfo('CLEANUP', `Starting cleanup of screenshots older than ${daysOld} days (before ${cutoffDateStr})`);
    
    // NOTE: For optimal performance, ensure the index on captured_at exists:
    // Run: database-migration-screenshot-cleanup-index.sql in Supabase SQL editor

    // Process in smaller batches to avoid timeout with large datasets
    // Start with smaller batch size to prevent timeouts
    let BATCH_SIZE = 100; // Reduced from 1000 to prevent timeouts
    let totalDeleted = 0;
    let totalErrors = 0;
    let hasMore = true;
    let offset = 0;
    let consecutiveErrors = 0;
    const MAX_CONSECUTIVE_ERRORS = 3;

    while (hasMore) {
      // Query screenshots older than cutoff date in batches
      let oldScreenshots = null;
      let queryAttempts = 0;
      const MAX_QUERY_ATTEMPTS = 3;
      let querySuccess = false;

      // Retry logic with exponential backoff
      while (queryAttempts < MAX_QUERY_ATTEMPTS && !querySuccess) {
        try {
          const { data: queryResult, error: queryError } = await supabase
            .from('screenshots')
            .select('id, screenshot_data, captured_at')
            .lt('captured_at', cutoffDateStr)
            .order('captured_at', { ascending: true })
            .range(offset, offset + BATCH_SIZE - 1)
            .limit(BATCH_SIZE); // Explicit limit

          if (queryError) {
            queryAttempts++;
            const isTimeout = queryError.code === '57014' || queryError.message?.includes('timeout') || queryError.message?.includes('522');
            const isConnectionError = queryError.message?.includes('Connection timed out') || queryError.message?.includes('522');

            if (isTimeout || isConnectionError) {
              if (queryAttempts < MAX_QUERY_ATTEMPTS) {
                // Exponential backoff: wait 2^attempts seconds
                const backoffDelay = Math.min(2000 * Math.pow(2, queryAttempts - 1), 10000);
                logWarn('CLEANUP', `Query timeout/connection error (attempt ${queryAttempts}/${MAX_QUERY_ATTEMPTS}), retrying in ${backoffDelay}ms...`);
                await new Promise(resolve => setTimeout(resolve, backoffDelay));
                
                // Reduce batch size on retry
                if (queryAttempts === 2 && BATCH_SIZE > 50) {
                  BATCH_SIZE = Math.max(50, Math.floor(BATCH_SIZE / 2));
                  logInfo('CLEANUP', `Reducing batch size to ${BATCH_SIZE} to avoid timeouts`);
                }
                continue;
              } else {
                logError('CLEANUP', `Query failed after ${MAX_QUERY_ATTEMPTS} attempts (batch ${offset}-${offset + BATCH_SIZE}): ${queryError.message}`);
                consecutiveErrors++;
                if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
                  logError('CLEANUP', `Too many consecutive errors (${consecutiveErrors}), stopping cleanup`);
                  hasMore = false;
                  break;
                }
                // Skip this batch and continue
                offset += BATCH_SIZE;
                totalErrors += BATCH_SIZE;
                break;
              }
            } else {
              // Non-timeout error, log and break
              logError('CLEANUP', `Error querying old screenshots (batch ${offset}-${offset + BATCH_SIZE}): ${queryError.message}`, queryError);
              consecutiveErrors++;
              if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
                logError('CLEANUP', `Too many consecutive errors (${consecutiveErrors}), stopping cleanup`);
                hasMore = false;
              }
              totalErrors += BATCH_SIZE;
              break;
            }
          } else {
            // Success
            oldScreenshots = queryResult;
            querySuccess = true;
            consecutiveErrors = 0; // Reset error counter on success
          }
        } catch (e) {
          queryAttempts++;
          logError('CLEANUP', `Exception during query (attempt ${queryAttempts}): ${e.message}`, e);
          if (queryAttempts >= MAX_QUERY_ATTEMPTS) {
            consecutiveErrors++;
            if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
              logError('CLEANUP', `Too many consecutive errors (${consecutiveErrors}), stopping cleanup`);
              hasMore = false;
            }
            break;
          }
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, 1000 * queryAttempts));
        }
      }

      if (!querySuccess) {
        // Failed to get data after retries, skip this batch
        continue;
      }

      if (!oldScreenshots || oldScreenshots.length === 0) {
        hasMore = false;
        if (offset === 0) {
          logInfo('CLEANUP', 'No old screenshots found to delete');
        }
        break;
      }

      logInfo('CLEANUP', `Processing batch: ${oldScreenshots.length} screenshots (offset: ${offset})`);

      let deletedCount = 0;
      let errorCount = 0;
      const storagePathsToDelete = [];

      // Collect storage paths and prepare for batch deletion
      for (const screenshot of oldScreenshots) {
        if (screenshot.screenshot_data) {
          const storagePath = extractStoragePathFromUrl(screenshot.screenshot_data, STORAGE_BUCKET);
          if (storagePath) {
            storagePathsToDelete.push(storagePath);
          }
        }
      }

      // Delete from storage bucket (batch delete)
      if (storagePathsToDelete.length > 0) {
        logInfo('CLEANUP', `Attempting to delete ${storagePathsToDelete.length} files from storage bucket`);
        // Supabase storage remove can handle up to 1000 files at once
        const storageBatchSize = 1000;
        for (let i = 0; i < storagePathsToDelete.length; i += storageBatchSize) {
          const batch = storagePathsToDelete.slice(i, i + storageBatchSize);
          logInfo('CLEANUP', `Deleting storage batch ${i / storageBatchSize + 1} (${batch.length} files)`);
          
          const { error: storageError, data: storageData } = await supabase.storage
            .from(STORAGE_BUCKET)
            .remove(batch);

          if (storageError) {
            logError('CLEANUP', `Error deleting batch from storage: ${storageError.message}`, storageError);
            logError('CLEANUP', `Storage error details: ${JSON.stringify(storageError)}`);
            logWarn('CLEANUP', 'If you see permission errors, ensure storage bucket DELETE policy is configured in Supabase dashboard');
            errorCount += batch.length;
          } else {
            logInfo('CLEANUP', `Successfully deleted ${batch.length} files from storage bucket`);
            if (storageData) {
              logInfo('CLEANUP', `Storage deletion response: ${JSON.stringify(storageData)}`);
            }
          }
        }
      } else {
        logWarn('CLEANUP', 'No storage paths extracted from screenshot URLs - cannot delete from bucket');
      }

      // Delete from database (batch delete by IDs)
      const screenshotIds = oldScreenshots.map(s => s.id);
      logInfo('CLEANUP', `Attempting to delete ${screenshotIds.length} screenshot records from database`);
      
      if (screenshotIds.length > 0) {
        // Delete in smaller chunks if needed (Supabase has limits on IN clause size)
        const deleteChunkSize = 500;
        let dbDeletedCount = 0;
        
        for (let i = 0; i < screenshotIds.length; i += deleteChunkSize) {
          const chunk = screenshotIds.slice(i, i + deleteChunkSize);
          logInfo('CLEANUP', `Deleting chunk ${Math.floor(i / deleteChunkSize) + 1}: ${chunk.length} IDs (first few: ${chunk.slice(0, 5).join(', ')})`);
          
          // First, verify these IDs exist before deletion
          const { data: verifyData, error: verifyError } = await supabase
            .from('screenshots')
            .select('id')
            .in('id', chunk);
          
          if (verifyError) {
            logError('CLEANUP', `Error verifying IDs before deletion: ${verifyError.message}`, verifyError);
          } else {
            const existingCount = verifyData ? verifyData.length : 0;
            logInfo('CLEANUP', `Found ${existingCount} of ${chunk.length} IDs in database before deletion`);
          }
          
          // Perform the deletion
          const { data: deleteResult, error: dbError } = await supabase
            .from('screenshots')
            .delete()
            .in('id', chunk)
            .select('id'); // Return deleted IDs to verify

          if (dbError) {
            logError('CLEANUP', `Error deleting chunk from database: ${dbError.message}`, dbError);
            logError('CLEANUP', `Error details: ${JSON.stringify(dbError, null, 2)}`);
            errorCount += chunk.length;
          } else {
            const actuallyDeleted = deleteResult ? deleteResult.length : 0;
            dbDeletedCount += actuallyDeleted;
            logInfo('CLEANUP', `Delete query returned: ${actuallyDeleted} deleted records (chunk ${Math.floor(i / deleteChunkSize) + 1})`);
            
            if (deleteResult && deleteResult.length > 0) {
              logInfo('CLEANUP', `Successfully deleted IDs: ${deleteResult.slice(0, 10).map(r => r.id).join(', ')}${deleteResult.length > 10 ? '...' : ''}`);
            }
            
            // Verify deletion by checking if IDs still exist
            if (actuallyDeleted > 0) {
              await new Promise(resolve => setTimeout(resolve, 500)); // Small delay for DB to process
              const { data: verifyAfter, error: verifyAfterError } = await supabase
                .from('screenshots')
                .select('id')
                .in('id', deleteResult.map(r => r.id));
              
              if (verifyAfterError) {
                logWarn('CLEANUP', `Could not verify deletion: ${verifyAfterError.message}`);
              } else {
                const stillExists = verifyAfter ? verifyAfter.length : 0;
                if (stillExists > 0) {
                  logError('CLEANUP', `WARNING: ${stillExists} records still exist after deletion! IDs: ${verifyAfter.map(r => r.id).join(', ')}`);
                } else {
                  logInfo('CLEANUP', `Verified: All ${actuallyDeleted} records successfully deleted from database`);
                }
              }
            }
          }
        }
        
        deletedCount = dbDeletedCount;
        
        // Final verification
        if (deletedCount < screenshotIds.length) {
          logWarn('CLEANUP', `Warning: Expected to delete ${screenshotIds.length} records but only ${deletedCount} were deleted`);
          
          // Check which IDs weren't deleted
          const deletedIds = [];
          for (let i = 0; i < screenshotIds.length; i += deleteChunkSize) {
            const chunk = screenshotIds.slice(i, i + deleteChunkSize);
            const { data: stillExist } = await supabase
              .from('screenshots')
              .select('id')
              .in('id', chunk);
            if (stillExist) {
              logWarn('CLEANUP', `Still exist in DB: ${stillExist.map(r => r.id).join(', ')}`);
            }
          }
        }
      } else {
        logWarn('CLEANUP', 'No screenshot IDs to delete');
      }

      totalDeleted += deletedCount;
      totalErrors += errorCount;

      // Check if there are more records to process
      hasMore = oldScreenshots.length === BATCH_SIZE;
      offset += oldScreenshots.length; // Use actual count instead of BATCH_SIZE

      // Delay between batches to avoid overwhelming the database
      // Longer delay if we had errors, shorter if everything is smooth
      if (hasMore) {
        const delay = totalErrors > 0 ? 3000 : 2000; // 3s if errors, 2s otherwise
        logInfo('CLEANUP', `Waiting ${delay}ms before next batch...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    logInfo('CLEANUP', `Cleanup completed: ${totalDeleted} deleted, ${totalErrors} errors`);
    return { deleted: totalDeleted, errors: totalErrors };
  } catch (e) {
    logError('CLEANUP', `Error in cleanupOldScreenshots: ${e.message}`, e);
    return { deleted: 0, errors: 1 };
  }
}

// Schedule cleanup to run daily at 2 AM
let cleanupInterval = null;

function scheduleScreenshotCleanup() {
  // Run cleanup immediately on startup (after a short delay to let app initialize)
  setTimeout(() => {
    cleanupOldScreenshots(SCREENSHOT_RETENTION_DAYS).catch(err => {
      logError('CLEANUP', 'Initial cleanup failed', err);
    });
  }, 30000); // Wait 30 seconds after app starts

  // Then run cleanup daily
  // Calculate milliseconds until next 2 AM
  const now = new Date();
  const nextCleanup = new Date();
  nextCleanup.setHours(2, 0, 0, 0);
  if (nextCleanup <= now) {
    nextCleanup.setDate(nextCleanup.getDate() + 1);
  }
  const msUntilCleanup = nextCleanup.getTime() - now.getTime();

  setTimeout(() => {
    // Run cleanup at 2 AM
    cleanupOldScreenshots(SCREENSHOT_RETENTION_DAYS).catch(err => {
      logError('CLEANUP', 'Scheduled cleanup failed', err);
    });

    // Then schedule it to run every 24 hours
    cleanupInterval = setInterval(() => {
      cleanupOldScreenshots(SCREENSHOT_RETENTION_DAYS).catch(err => {
        logError('CLEANUP', 'Scheduled cleanup failed', err);
      });
    }, 24 * 60 * 60 * 1000); // 24 hours
  }, msUntilCleanup);

  logInfo('CLEANUP', `Screenshot cleanup scheduled (retention: ${SCREENSHOT_RETENTION_DAYS} days). Next run: ${nextCleanup.toISOString()}`);
}

// ============ APP LIFECYCLE ============
app.whenReady().then(() => {
  createWindow();
  scheduleScreenshotCleanup();
});

app.on('window-all-closed', () => {
  if (backgroundScreenshotInterval) clearInterval(backgroundScreenshotInterval);
  isBackgroundCaptureActive = false;
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', async () => {
  if (backgroundScreenshotInterval) {
    clearInterval(backgroundScreenshotInterval);
    backgroundScreenshotInterval = null;
  }
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
  isBackgroundCaptureActive = false;
  if (global.__idlePollInterval) {
    clearInterval(global.__idlePollInterval);
    global.__idlePollInterval = null;
  }
  logInfo('App', 'Application shutting down');
});
