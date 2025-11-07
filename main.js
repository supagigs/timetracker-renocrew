const { app, BrowserWindow, session, ipcMain, desktopCapturer, Notification, nativeImage, shell, dialog } = require('electron');
const path = require('path');
require('dotenv').config(); // ✅ Load .env here

// Silence DevTools Autofill protocol noise
try {
  app.commandLine.appendSwitch('disable-features', 'Autofill,AutofillServerCommunication');
} catch (_) {}

let mainWindow = null;
let isTimerActive = false;
let isUserLoggedIn = false;
let pictureInPictureWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    icon: path.join(__dirname, 'SupagigsLogo.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Intercept window close event
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

  mainWindow.loadFile('renderer/screens/login.html');
  
  // Handle window being closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Get local screenshots handler
ipcMain.handle('get-local-screenshots', async (event, email, startTime, endTime) => {
  try {
    const fs = require('fs');
    const path = require('path');
    
    const screenshotsDir = path.join(__dirname, 'screenshots');
    if (!fs.existsSync(screenshotsDir)) {
      return [];
    }
    
    const files = fs.readdirSync(screenshotsDir);
    const screenshotFiles = [];
    
    // Filter files by email and time range
    files.forEach(file => {
      if (file.startsWith('screenshot_') && file.endsWith('.png')) {
        // Extract email from filename
        const emailInFile = file.split('_')[1].replace('_at_', '@').replace(/_/g, '.');
        
        console.log(`Checking file: ${file}, Extracted email: ${emailInFile}, Target email: ${email}`);
        
        if (emailInFile === email) {
          // Extract timestamp from filename
          const timestampMatch = file.match(/(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)/);
          if (timestampMatch) {
            // Convert filename timestamp to ISO format: 2025-10-22T04-47-50-821Z -> 2025-10-22T04:47:50.821Z
            const timestamp = timestampMatch[1];
            const isoFormat = timestamp.replace(/(\d{4}-\d{2}-\d{2}T\d{2})-(\d{2})-(\d{2})-(\d{3}Z)/, '$1:$2:$3.$4');
            const fileTime = new Date(isoFormat);
            const start = new Date(startTime);
            const end = new Date(endTime);
            
            console.log(`File: ${file}, Timestamp: ${isoFormat}, FileTime: ${fileTime.toISOString()}, Start: ${start.toISOString()}, End: ${end.toISOString()}`);
            
            if (fileTime >= start && fileTime <= end) {
              screenshotFiles.push(path.join(screenshotsDir, file));
            }
          }
        }
      }
    });
    
    // Sort by timestamp
    screenshotFiles.sort();
    
    console.log(`Found ${screenshotFiles.length} local screenshots for ${email} between ${startTime} and ${endTime}`);
    return screenshotFiles;
    
  } catch (error) {
    console.error('Error getting local screenshots:', error);
    return [];
  }
});

ipcMain.handle('open-local-screenshot', async (event, filePath) => {
  if (!filePath) {
    return false;
  }
  try {
    await shell.openPath(filePath);
    return true;
  } catch (error) {
    console.error('Error opening local screenshot:', error);
    return false;
  }
});

ipcMain.handle('open-picture-in-picture', async (event, imageSrc) => {
  if (!imageSrc) {
    return false;
  }

  try {
    if (pictureInPictureWindow && !pictureInPictureWindow.isDestroyed()) {
      pictureInPictureWindow.close();
      pictureInPictureWindow = null;
    }

    pictureInPictureWindow = new BrowserWindow({
      width: 960,
      height: 600,
      alwaysOnTop: true,
      resizable: true,
      movable: true,
      minimizable: false,
      maximizable: false,
      frame: false,
      titleBarStyle: 'hidden',
      show: false,
      backgroundColor: '#0f172a',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    });

    pictureInPictureWindow.setMenuBarVisibility(false);

    const htmlContent = `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8">
          <title>Screenshot Preview</title>
          <style>
            :root { color-scheme: dark; }
            body {
              margin: 0;
              background: #0f172a;
              color: #e2e8f0;
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
              display: flex;
              flex-direction: column;
              width: 100vw;
              height: 100vh;
              overflow: hidden;
              user-select: none;
            }
            .titlebar {
              height: 38px;
              display: flex;
              align-items: center;
              justify-content: space-between;
              padding: 0 12px;
              background: rgba(15, 23, 42, 0.92);
              border-bottom: 1px solid rgba(148, 163, 184, 0.12);
              -webkit-app-region: drag;
            }
            .title {
              font-size: 14px;
              letter-spacing: 0.01em;
            }
            button {
              border: none;
              background: transparent;
              color: #e2e8f0;
              cursor: pointer;
              font-size: 16px;
              width: 28px;
              height: 28px;
              border-radius: 6px;
              display: flex;
              align-items: center;
              justify-content: center;
              -webkit-app-region: no-drag;
            }
            button:hover {
              background: rgba(148, 163, 184, 0.2);
            }
            .content {
              flex: 1;
              display: flex;
              align-items: center;
              justify-content: center;
              padding: 10px;
              background: #020617;
            }
            img {
              max-width: 100%;
              max-height: 100%;
              border-radius: 10px;
              box-shadow: 0 20px 40px rgba(15, 23, 42, 0.55);
              object-fit: contain;
            }
          </style>
        </head>
        <body>
          <div class="titlebar">
            <span class="title">Screenshot Preview</span>
            <div style="display:flex; gap:6px;">
              <button id="resizeBtn" title="Reset Size">⤢</button>
              <button id="closeBtn" title="Close">✕</button>
            </div>
          </div>
          <div class="content">
            <img id="previewImage" alt="Screenshot preview" loading="lazy" draggable="false">
          </div>
          <script>
            const imageSrc = ${JSON.stringify(imageSrc)};
            const img = document.getElementById('previewImage');
            const close = () => window.close();
            document.getElementById('closeBtn').addEventListener('click', close);
            document.getElementById('resizeBtn').addEventListener('click', () => {
              const initialWidth = 960;
              const initialHeight = 600;
              window.resizeTo(initialWidth, initialHeight);
            });
            document.addEventListener('keydown', (event) => {
              if (event.key === 'Escape') {
                close();
              }
            });
            img.addEventListener('dblclick', close);
            img.src = imageSrc;
          </script>
        </body>
      </html>
    `;

    await pictureInPictureWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(htmlContent));
    pictureInPictureWindow.once('ready-to-show', () => {
      if (pictureInPictureWindow && !pictureInPictureWindow.isDestroyed()) {
        pictureInPictureWindow.show();
      }
    });

    pictureInPictureWindow.on('closed', () => {
      pictureInPictureWindow = null;
    });

    return true;
  } catch (error) {
    console.error('Error opening picture-in-picture window:', error);
    if (pictureInPictureWindow && !pictureInPictureWindow.isDestroyed()) {
      pictureInPictureWindow.close();
      pictureInPictureWindow = null;
    }
    return false;
  }
});

// Screenshot save handler
ipcMain.handle('save-screenshot', async (event, screenshotData, filename) => {
  try {
    const fs = require('fs');
    const fsp = require('fs').promises;
    const path = require('path');
    
    // Ensure screenshots directory exists
    const screenshotsDir = path.join(__dirname, 'screenshots');
    if (!fs.existsSync(screenshotsDir)) {
      fs.mkdirSync(screenshotsDir, { recursive: true });
    }
    
    // Convert base64 data URL to buffer
    const base64Data = screenshotData.split(',')[1];
    const filePath = path.join(screenshotsDir, filename);
    
    await fsp.writeFile(filePath, base64Data, 'base64');
    
    console.log('Screenshot saved to:', filePath);
    return filePath;
  } catch (error) {
    console.error('Error saving screenshot file:', error);
    throw error;
  }
});

// Screenshot capture handler (for immediate screenshots)
ipcMain.handle('capture-screen', async () => {
  try {
    console.log('Main process: Capturing screenshot...');
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      // Smaller thumbnail to reduce memory and CPU
      thumbnailSize: { width: 1280, height: 720 }
    });

    if (sources.length > 0) {
      const source = sources[0];
      console.log('Main process: Screenshot captured successfully');
      return source.thumbnail;
    }
    throw new Error('No screen sources available');
  } catch (error) {
    console.error('Main process: Error capturing screen:', error);
    throw error;
  }
});

// Background screenshot capture for active sessions
let backgroundScreenshotInterval = null;
let isBackgroundCaptureActive = false;
let isBackgroundTickRunning = false; // prevent overlapping ticks
let supabaseClientInstance = null; // reuse client to avoid re-initialization overhead
let currentUserEmail = null;
let currentSessionId = null;
let uploadQueue = [];
const MAX_BATCH_SIZE = 15;
const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'screenshots';

function getSupabaseClient() {
  try {
    if (!supabaseClientInstance) {
      const { createClient } = require('@supabase/supabase-js');
      // Use service role key for main process storage uploads to bypass RLS
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
      supabaseClientInstance = createClient(process.env.SUPABASE_URL, serviceRoleKey);
    }
    return supabaseClientInstance;
  } catch (e) {
    return null;
  }
}

async function addIdleIndicatorToScreenshot(sourceThumbnail) {
  try {
    const { createCanvas, loadImage } = require('canvas');
    
    // Get the thumbnail image data
    const imageData = sourceThumbnail.toDataURL('image/png');
    
    // Load the image into a canvas
    const img = await loadImage(imageData);
    const canvas = createCanvas(img.width, img.height);
    const ctx = canvas.getContext('2d');
    
    // Draw the original image
    ctx.drawImage(img, 0, 0);
    
    // Draw a larger red circle (scaled by image size) with white outline for visibility
    const margin = Math.round(Math.min(canvas.width, canvas.height) * 0.02); // 2% margin
    const radius = Math.max(12, Math.round(Math.min(canvas.width, canvas.height) * 0.03)); // ~3% of smallest dimension

    // White outline
    ctx.beginPath();
    ctx.arc(canvas.width - margin - radius, margin + radius, radius + 3, 0, Math.PI * 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();

    // Red fill
    ctx.beginPath();
    ctx.arc(canvas.width - margin - radius, margin + radius, radius, 0, Math.PI * 2);
    ctx.fillStyle = '#FF2D2D';
    ctx.fill();
    
    // Convert canvas to data URL
    return canvas.toDataURL('image/png');
  } catch (error) {
    console.error('Error in addIdleIndicatorToScreenshot:', error);
    // Return original if we can't add indicator
    return sourceThumbnail.toDataURL('image/png');
  }
}

async function compressToJpegBufferFromDataUrl(dataUrl) {
  const sharp = require('sharp');
  const base64 = dataUrl.split(',')[1];
  const inputBuffer = Buffer.from(base64, 'base64');
  // Compress more aggressively to stay under 200KB bucket file size limit
  // Target: ~60% quality and resize to max 1280px width
  return await sharp(inputBuffer)
    .resize(1280, null, { 
      withoutEnlargement: true,
      fit: 'inside'
    })
    .jpeg({ quality: 60 })
    .toBuffer();
}

async function flushUploadQueue(force = false) {
  try {
    if (uploadQueue.length === 0) return;
    if (!force && uploadQueue.length < MAX_BATCH_SIZE) return;

    const supabase = getSupabaseClient();
    if (!supabase) {
      console.warn('Supabase client unavailable; skipping upload batch');
      return;
    }

    const batch = uploadQueue.splice(0, uploadQueue.length);
    console.log(`Uploading batch of ${batch.length} screenshots to storage...`);

    // Upload all files to storage
    const uploadResults = await Promise.all(batch.map(async (item) => {
      const path = `${item.userEmail}/${item.sessionId}/${item.filename}`;
      const { error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(path, item.buffer, { contentType: 'image/jpeg', upsert: true });
      if (error) {
        console.error('Storage upload error:', error);
        return { ok: false };
      }
      const { data: pub } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
      return { ok: true, url: pub.publicUrl, captured_at: item.timestamp, session_id: item.sessionId, user_email: item.userEmail };
    }));

    const rows = uploadResults.filter(r => r.ok).map(r => ({
      user_email: r.user_email,
      session_id: r.session_id,
      screenshot_data: r.url,
      captured_at: r.captured_at
    }));

    if (rows.length > 0) {
      const { error: dbErr } = await supabase.from('screenshots').insert(rows);
      if (dbErr) {
        console.error('Error inserting screenshot URLs:', dbErr);
      } else {
        console.log(`Inserted ${rows.length} screenshot URLs into database`);
      }
    }
  } catch (e) {
    console.error('Error flushing upload queue:', e);
  }
}

// Allow renderer to queue ad-hoc screenshots for upload (e.g., manual capture)
ipcMain.handle('queue-screenshot-upload', async (event, { userEmail, sessionId, screenshotData, timestamp }) => {
  try {
    const jpegBuffer = await compressToJpegBufferFromDataUrl(screenshotData);
    const jpegFilename = `${userEmail.replace('@', '_at_').replace('.', '_')}_${sessionId}_${timestamp.replace(/[:.]/g, '-')}.jpg`;
    uploadQueue.push({ userEmail, sessionId, filename: jpegFilename, timestamp, buffer: jpegBuffer });
    // Try flushing opportunistically
    flushUploadQueue(false);
    return { ok: true };
  } catch (e) {
    console.error('queue-screenshot-upload error:', e);
    return { ok: false, error: e?.message || 'queue error' };
  }
});

// Start background screenshot capture
ipcMain.handle('start-background-screenshots', async (event, userEmail, sessionId) => {
  console.log('Starting background screenshot capture for:', userEmail);
  
  // Prevent multiple intervals from being created
  if (backgroundScreenshotInterval) {
    console.log('Screenshot interval already exists, clearing old one...');
    clearInterval(backgroundScreenshotInterval);
    backgroundScreenshotInterval = null;
  }
  
  currentUserEmail = userEmail;
  currentSessionId = sessionId;
  isBackgroundCaptureActive = true;
  
  backgroundScreenshotInterval = setInterval(async () => {
    if (!isBackgroundCaptureActive || isBackgroundTickRunning) return;
    isBackgroundTickRunning = true;
    
    try {
      console.log('Background screenshot capture...');
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 1280, height: 720 }
      });

      if (sources.length > 0) {
        const source = sources[0];
        
        // Add red circle indicator if user is idle
        let screenshotData;
        console.log('User idle state:', isUserIdle);
        if (isUserIdle) {
          try {
            screenshotData = await addIdleIndicatorToScreenshot(source.thumbnail);
            console.log('✓ Added idle indicator to screenshot (red dot in top-right corner)');
          } catch (indicatorError) {
            console.error('Error adding idle indicator:', indicatorError);
            screenshotData = source.thumbnail.toDataURL('image/png');
          }
        } else {
          screenshotData = source.thumbnail.toDataURL('image/png');
          console.log('No idle indicator (user is active)');
        }
        
        // Save screenshot locally and queue compressed upload to storage
        const timestamp = new Date().toISOString();
        const filenamePng = `screenshot_${currentUserEmail.replace('@', '_at_').replace('.', '_')}_${currentSessionId}_${timestamp.replace(/[:.]/g, '-')}.png`;
        
        const fs = require('fs');
        const fsp = require('fs').promises;
        const path = require('path');
        const screenshotsDir = path.join(__dirname, 'screenshots');
        if (!fs.existsSync(screenshotsDir)) {
          fs.mkdirSync(screenshotsDir, { recursive: true });
        }
        
        const base64Data = screenshotData.split(',')[1];
        const filePath = path.join(screenshotsDir, filenamePng);
        await fsp.writeFile(filePath, base64Data, 'base64');
        
        console.log('Background screenshot saved:', filePath);

        // Queue compressed upload (as JPEG) to Supabase Storage
        try {
          const jpegBuffer = await compressToJpegBufferFromDataUrl(screenshotData);
          const jpegFilename = `${currentUserEmail.replace('@', '_at_').replace('.', '_')}_${currentSessionId}_${timestamp.replace(/[:.]/g, '-')}.jpg`;
          uploadQueue.push({
            userEmail: currentUserEmail,
            sessionId: currentSessionId,
            filename: jpegFilename,
            timestamp,
            buffer: jpegBuffer
          });
          // attempt flush if threshold met
          flushUploadQueue(false);
        } catch (qe) {
          console.error('Queue compress/upload error:', qe);
        }
        
        // Try to save to Supabase (optional, don't fail if it doesn't work)
        try {
          const supabase = getSupabaseClient();
          if (supabase) {
          
            // Do not insert raw base64 anymore to reduce DB size. We'll insert URL after storage upload in flushUploadQueue()
          
            console.log('Background screenshot saved to database');
          }
        } catch (dbError) {
          console.log('Background screenshot saved locally only:', dbError.message);
        }
        
        // Send notification to renderer
        const { BrowserWindow } = require('electron');
        const allWindows = BrowserWindow.getAllWindows();
        allWindows.forEach(window => {
          window.webContents.send('screenshot-captured', {
            timestamp: timestamp,
            filename: filenamePng,
            filePath: filePath
          });
        });
        
        // Show native system notification (appears even when app is minimized/background)
        const timeString = new Date(timestamp).toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        });
        
        if (Notification.isSupported()) {
          new Notification({
            title: 'Time Tracker - Screenshot Captured',
            body: `Screenshot saved at ${timeString}`,
            // Avoid embedding large image data as icon to reduce overhead
            silent: true
          }).show();
        }
      }
    } catch (error) {
      console.error('Error in background screenshot capture:', error);
      // Don't let errors break the interval - continue capturing
    } finally {
      isBackgroundTickRunning = false;
    }
  }, 20000); // Capture every 20 seconds
  
  console.log('Background screenshot capture interval started');
  return true;
});

// Stop background screenshot capture
ipcMain.handle('stop-background-screenshots', () => {
  console.log('Stopping background screenshot capture');
  isBackgroundCaptureActive = false;
  
  if (backgroundScreenshotInterval) {
    console.log('Clearing screenshot interval...');
    clearInterval(backgroundScreenshotInterval);
    backgroundScreenshotInterval = null;
    console.log('Screenshot interval cleared');
  }
  // Flush any remaining uploads when stopping capture
  flushUploadQueue(true);
  
  return true;
});

// IPC handler to save active session before app closes
ipcMain.handle('save-active-session', async (event) => {
  try {
    console.log('Main process requesting session save from renderer...');
    // This will be handled by the renderer process
    return true;
  } catch (error) {
    console.error('Error requesting session save:', error);
    return false;
  }
});

// IPC handlers to track timer state
ipcMain.handle('set-timer-active', (event, active) => {
  isTimerActive = active;
  console.log('Timer active state updated:', isTimerActive);
  return true;
});

ipcMain.handle('get-timer-active', () => {
  return isTimerActive;
});

ipcMain.handle('set-user-logged-in', (event, loggedIn) => {
  isUserLoggedIn = !!loggedIn;
  console.log('User logged in state updated:', isUserLoggedIn);
  return true;
});

// Check if background screenshot capture is active
ipcMain.handle('is-background-screenshots-active', () => {
  return isBackgroundCaptureActive;
});

// Store idle state from renderer
let isUserIdle = false;

ipcMain.on('update-idle-state', (event, idleState) => {
  isUserIdle = idleState;
  console.log('Idle state updated:', isUserIdle);
});

// System-wide idle time/state for robust idle detection
ipcMain.handle('get-system-idle-time', () => {
  try {
    const { powerMonitor } = require('electron');
    return powerMonitor.getSystemIdleTime();
  } catch (e) {
    return -1;
  }
});

ipcMain.handle('get-system-idle-state', (event, thresholdSeconds) => {
  try {
    const { powerMonitor } = require('electron');
    return powerMonitor.getSystemIdleState(Math.max(1, parseInt(thresholdSeconds || 30, 10)));
  } catch (e) {
    return 'unknown';
  }
});

// Open external URLs (e.g., Next.js reports site)
ipcMain.handle('open-external-url', async (event, url) => {
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
    console.warn('Invalid external URL requested:', url);
    return false;
  }
  console.log('Opening external URL:', url);
  await shell.openExternal(url);
  return true;
});

app.whenReady().then(() => {
  // Set app name for Windows notifications
  if (process.platform === 'win32') {
    app.setAppUserModelId('Time Tracker');
  }
  
  // Request notification permission
  if (Notification.isSupported()) {
    // Request permission if not already granted
    if (process.platform === 'darwin') {
      // macOS - always available
    } else {
      // Windows/Linux - request if needed
      try {
        // Just try to create a test notification to trigger permission
        new Notification({ title: 'Time Tracker', body: 'Ready' });
      } catch (e) {
        console.log('Notification permission may be required');
      }
    }
  }

  // Enforce CSP via response headers so frame-ancestors is honored
  try {
    session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
      const csp = "default-src 'self'; connect-src 'self' https://*.supabase.co https://cdn.jsdelivr.net; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://*.supabase.co; media-src 'self' data: blob:; frame-ancestors 'none'";
      const headers = { ...details.responseHeaders };
      headers['Content-Security-Policy'] = [csp];
      cb({ responseHeaders: headers });
    });
  } catch (_) {}

  createWindow();
});

// Ensure background screenshot capture is stopped when app closes
app.on('before-quit', async () => {
  console.log('App closing, performing cleanup...');
  
  // Stop background screenshot capture
  if (backgroundScreenshotInterval) {
    clearInterval(backgroundScreenshotInterval);
    backgroundScreenshotInterval = null;
  }
  isBackgroundCaptureActive = false;
  
  // Try to save any active session data
  try {
    const fs = require('fs');
    const path = require('path');
    
    // Check if there's active session data in localStorage (we can't access it directly from main process)
    // Instead, we'll rely on the renderer process to handle this via IPC
    console.log('App cleanup completed');
  } catch (error) {
    console.error('Error during app cleanup:', error);
  }
});

// Handle window close events
app.on('window-all-closed', () => {
  console.log('All windows closed, performing final cleanup...');
  
  // Stop background screenshot capture
  if (backgroundScreenshotInterval) {
    clearInterval(backgroundScreenshotInterval);
    backgroundScreenshotInterval = null;
  }
  isBackgroundCaptureActive = false;
  
  // On macOS, keep app running even when all windows are closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
