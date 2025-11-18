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
    icon: path.join(__dirname, 'icon.ico'),
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
      return 20000;
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
        return 20000;
      }

      if (!assignment?.client_email) {
        logWarn('SCREENSHOTS', `No active client assignment found for freelancer: ${normalizedEmail}`);
        return 20000;
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
      return 20000;
    }

    if (!settings) {
      logWarn('SCREENSHOTS', `No client settings found for client: ${clientEmail} - using default interval`);
      return 20000;
    }

    logInfo('SCREENSHOTS', `Found client settings: ${JSON.stringify(settings)}`);

    const intervalSeconds = Number(settings.screenshot_interval_seconds);
    if (!Number.isFinite(intervalSeconds) || intervalSeconds <= 0) {
      logWarn('SCREENSHOTS', `Invalid interval value: ${settings.screenshot_interval_seconds} - using default`);
      return 20000;
    }

    // Clamp between 30s and 1h for safety
    const clamped = Math.min(Math.max(intervalSeconds, 30), 3600);
    const intervalMs = clamped * 1000;
    logInfo('SCREENSHOTS', `Resolved interval: ${intervalSeconds} seconds (${intervalMs} ms) for client: ${clientEmail}`);
    return intervalMs;
  } catch (e) {
    logWarn('SCREENSHOTS', `resolveScreenshotIntervalForUser error: ${e.message}`);
    return 20000;
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
    toastWin.showInactive();
    toastWin.webContents.send('toast-init', { filePath, base64Data });
  });

  setTimeout(() => { if (toastWin) toastWin.close(); }, 9000);
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

// ============ SCREENSHOT UPLOAD HANDLER ============
async function handleScreenshotUpload(uploadData) {
  const { userEmail, sessionId, screenshotData, timestamp, isIdle, contextLabel } = uploadData;
  
  try {
    const jpegBuffer = await compressToJpegBufferFromDataUrl(screenshotData);
    const jpegFilename = `${userEmail.replace(/@/g, '_at_').replace(/\./g, '_')}_${sessionId}_${timestamp.replace(/[:.]/g, '-')}.jpg`;
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error('Supabase client unavailable');

    const screenshotsDir = resolveScreenshotsDir(true);
    const filePath = path.join(screenshotsDir, jpegFilename);
    fs.writeFileSync(filePath, jpegBuffer);

    pendingScreenshots.set(filePath, false);
    logInfo(contextLabel, `Screenshot saved, added to pending: ${filePath}`);

    showToastNotification(filePath, screenshotData);

    if (isCancelled(filePath)) {
      logInfo(contextLabel, 'Upload cancelled before storage');
      pendingScreenshots.delete(filePath);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      return { ok: false, error: 'Upload cancelled by user' };
    }

    const storagePath = `${userEmail}/${sessionId}/${jpegFilename}`;
    const { error: storageError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, jpegBuffer, { contentType: 'image/jpeg', upsert: true });

    if (isCancelled(filePath)) {
      logInfo(contextLabel, 'Upload cancelled during storage upload');
      pendingScreenshots.delete(filePath);
      if (!storageError) {
        try {
          await supabase.storage.from(STORAGE_BUCKET).remove([storagePath]);
          logInfo(contextLabel, 'Removed from Supabase storage');
        } catch (e) {
          logError(contextLabel, 'Error removing from storage', e);
        }
      }
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      return { ok: false, error: 'Upload cancelled by user' };
    }

    if (storageError) throw storageError;

    const publicUrlRes = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);
    const publicUrl = publicUrlRes?.data?.publicUrl ?? null;
    if (!publicUrl) throw new Error('Unable to get storage public URL');

    const appName = await getActiveAppName() || app.getName() || 'Time Tracker';
    await insertScreenshotToDatabase(supabase, userEmail, sessionId, publicUrl, timestamp, appName, isIdle);

    broadcastScreenshotCaptured({
      timestamp,
      previewDataUrl: screenshotData,
      storageUrl: publicUrl,
      filePath,
      sessionId,
      appName,
      isIdle: Boolean(isIdle)
    });

    pendingScreenshots.delete(filePath);
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
    clearInterval(backgroundScreenshotInterval);
    backgroundScreenshotInterval = null;
  }
  currentUserEmail = userEmail;
  currentSessionId = sessionId;
  isBackgroundCaptureActive = true;

  // Resolve the screenshot interval based on the client's settings
  const intervalMs = await resolveScreenshotIntervalForUser(userEmail, sessionId);
  logInfo('IPC', `Starting background screenshots with interval: ${intervalMs}ms (${intervalMs / 1000}s)`);

  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().size;

  backgroundScreenshotInterval = setInterval(async () => {
    if (!isBackgroundCaptureActive || isBackgroundTickRunning) return;
    isBackgroundTickRunning = true;
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: screenWidth, height: screenHeight }
      });
      if (sources.length > 0) {
        const source = sources[0];
        const screenshotData = source.thumbnail.toDataURL('image/png');
        const timestamp = new Date().toISOString();

        await handleScreenshotUpload({
          userEmail: currentUserEmail,
          sessionId: currentSessionId,
          screenshotData,
          timestamp,
          isIdle: isUserIdle,
          contextLabel: 'BG-UPLOAD'
        });
      }
    } catch (error) {
      logError('BG-UPLOAD', 'Error capturing screenshot', error);
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
  isBackgroundCaptureActive = false;
  if (global.__idlePollInterval) {
    clearInterval(global.__idlePollInterval);
    global.__idlePollInterval = null;
  }
  logInfo('App', 'Application shutting down');
});
