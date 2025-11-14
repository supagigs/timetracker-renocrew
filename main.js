const { app, BrowserWindow, ipcMain, desktopCapturer, powerMonitor, screen, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

if (process.platform === 'win32') {
  app.setAppUserModelId('SupaGigs.TimeTracker');
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
    icon: path.join(__dirname, 'SupagigsLogo.png'),
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
    if (!activeWindowModule) activeWindowModule = await import('active-win');
    const result = await activeWindowModule.default();
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
    hasShadow: true,
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
    // Step 1: Compress image
    const jpegBuffer = await compressToJpegBufferFromDataUrl(screenshotData);
    
    // Step 2: Generate filename
    const jpegFilename = `${userEmail.replace(/@/g, '_at_').replace(/\./g, '_')}_${sessionId}_${timestamp.replace(/[:.]/g, '-')}.jpg`;
    
    // Step 3: Get Supabase client
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error('Supabase client unavailable');

    // Step 4: Save to local storage
    const screenshotsDir = resolveScreenshotsDir(true);
    const filePath = path.join(screenshotsDir, jpegFilename);
    fs.writeFileSync(filePath, jpegBuffer);

    // Step 5: Add to pending queue
    pendingScreenshots.set(filePath, false);
    logInfo(contextLabel, `Screenshot saved, added to pending: ${filePath}`);

    // Step 6: Show toast notification
    showToastNotification(filePath, screenshotData);

    // Step 7: CHECK IF CANCELLED - before storage upload
    if (isCancelled(filePath)) {
      logInfo(contextLabel, 'Upload cancelled before storage');
      pendingScreenshots.delete(filePath);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      return { ok: false, error: 'Upload cancelled by user' };
    }

    // Step 8: Upload to Supabase Storage
    const storagePath = `${userEmail}/${sessionId}/${jpegFilename}`;
    const { error: storageError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, jpegBuffer, { contentType: 'image/jpeg', upsert: true });

    // Step 9: CHECK IF CANCELLED - during storage upload
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

    // Step 10: Get public URL
    const publicUrlRes = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);
    const publicUrl = publicUrlRes?.data?.publicUrl ?? null;
    if (!publicUrl) throw new Error('Unable to get storage public URL');

    // Step 11: Insert into database
    const appName = await getActiveAppName() || app.getName() || 'Time Tracker';
    await insertScreenshotToDatabase(supabase, userEmail, sessionId, publicUrl, timestamp, appName, isIdle);

    // Step 12: Broadcast to all windows
    broadcastScreenshotCaptured({
      timestamp,
      previewDataUrl: screenshotData,
      storageUrl: publicUrl,
      filePath,
      sessionId,
      appName,
      isIdle: Boolean(isIdle)
    });

    // Step 13: Cleanup
    pendingScreenshots.delete(filePath);
    logInfo(contextLabel, 'Upload completed successfully');
    
    return { ok: true, storagePath, url: publicUrl, appName, capturedIdle: Boolean(isIdle) };
  } catch (e) {
    logError(contextLabel, `Error: ${e?.message || 'queue error'}`, e);
    return { ok: false, error: e?.message || 'queue error' };
  }
}

// ============ IPC HANDLERS ============

ipcMain.handle('set-user-logged-in', async (event, flag) => {
  isUserLoggedIn = Boolean(flag);
  logInfo('IPC', `User logged in: ${isUserLoggedIn}`);
  return true;
});

ipcMain.handle('toast-delete-file', async (event, filePath) => {
  logInfo('DELETE', `Handler called with filePath: ${filePath}`);
  
  try {
    // Mark as cancelled first
    if (pendingScreenshots.has(filePath)) {
      pendingScreenshots.set(filePath, true);
      logInfo('DELETE', 'Marked as cancelled in pending map');
    }

    // Delete from disk
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      logInfo('DELETE', `File deleted successfully from disk: ${filePath}`);
      pendingScreenshots.delete(filePath);
      
      if (toastWin) {
        toastWin.close();
        toastWin = null;
      }
      
      return { success: true, message: 'File deleted' };
    } else {
      logWarn('DELETE', `File does not exist: ${filePath}`);
      return { success: false, message: 'File not found' };
    }
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

ipcMain.handle('start-background-screenshots', async (event, userEmail, sessionId) => {
  if (backgroundScreenshotInterval) {
    clearInterval(backgroundScreenshotInterval);
    backgroundScreenshotInterval = null;
  }
  currentUserEmail = userEmail;
  currentSessionId = sessionId;
  isBackgroundCaptureActive = true;

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
  }, 20000);
  
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

// ============ APP LIFECYCLE ============
app.whenReady().then(() => {
  createWindow();
  try {
    powerMonitor.setIdleDetectionInterval(10);
  } catch (e) {
    logWarn('PowerMonitor', 'Could not set idle detection interval', e);
  }
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
