const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('env', {
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
  REPORTS_URL: process.env.REPORTS_URL || process.env.NEXTJS_REPORTS_URL || ''
});

contextBridge.exposeInMainWorld('electronAPI', {
  startBackgroundScreenshots: (userEmail, sessionId) =>
    ipcRenderer.invoke('start-background-screenshots', userEmail, sessionId),
  stopBackgroundScreenshots: () =>
    ipcRenderer.invoke('stop-background-screenshots'),
  isBackgroundScreenshotsActive: () =>
    ipcRenderer.invoke('is-background-screenshots-active'),

  saveActiveSession: () =>
    ipcRenderer.invoke('save-active-session'),

  captureScreen: () =>
    ipcRenderer.invoke('capture-screen'),

  captureAllScreens: () =>
    ipcRenderer.invoke('capture-all-screens'),

  diagnoseScreenCapture: () =>
    ipcRenderer.invoke('diagnose-screen-capture'),

  checkScreenPermission: () =>
    ipcRenderer.invoke('check-screen-permission'),

  queueScreenshotUpload: (payload) =>
    ipcRenderer.invoke('queue-screenshot-upload', payload),

  getScreenshotBatchStatus: () =>
    ipcRenderer.invoke('get-screenshot-batch-status'),

  flushScreenshotBatch: () =>
    ipcRenderer.invoke('flush-screenshot-batch'),

  getLocalScreenshots: (email, startTime, endTime) =>
    ipcRenderer.invoke('get-local-screenshots', email, startTime, endTime),

  openLocalScreenshot: (filePath) =>
    ipcRenderer.invoke('open-local-screenshot', filePath),

  openScreenshotPictureInPicture: (imageSrc) =>
    ipcRenderer.invoke('open-picture-in-picture', imageSrc),

  getSystemIdleTime: () =>
    ipcRenderer.invoke('get-system-idle-time'),

  getSystemIdleState: (thresholdSeconds) =>
    ipcRenderer.invoke('get-system-idle-state', thresholdSeconds),

  openExternalUrl: (url) =>
    ipcRenderer.invoke('open-external-url', url),

  onSystemIdleState: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('system-idle-state', handler);
    return () => ipcRenderer.removeListener('system-idle-state', handler);
  },

  removeSystemIdleStateListener: () =>
    ipcRenderer.removeAllListeners('system-idle-state'),

  startTimeTracking: (userEmail) =>
    ipcRenderer.invoke('start-time-tracking', userEmail),

  stopTimeTracking: () =>
    ipcRenderer.invoke('stop-time-tracking'),

  pauseTimeTracking: () =>
    ipcRenderer.invoke('pause-time-tracking'),

  resumeTimeTracking: () =>
    ipcRenderer.invoke('resume-time-tracking'),

  getTimeTrackingStatus: () =>
    ipcRenderer.invoke('get-time-tracking-status'),

  onTimeTrackingUpdate: (callback) => {
    ipcRenderer.on('time-tracking-update', (event, data) => callback(data));
  },

  removeTimeTrackingListener: () =>
    ipcRenderer.removeAllListeners('time-tracking-update'),

  onScreenshotCaptured: (callback) => {
    ipcRenderer.on('screenshot-captured', (event, data) => callback(data));
  },

  removeScreenshotCapturedListener: () =>
    ipcRenderer.removeAllListeners('screenshot-captured'),

  updateIdleState: (isIdle) => {
    ipcRenderer.send('update-idle-state', isIdle);
  },

  setTimerActive: (active) =>
    ipcRenderer.invoke('set-timer-active', active),

  getTimerActive: () =>
    ipcRenderer.invoke('get-timer-active'),

  setUserLoggedIn: (loggedIn) =>
    ipcRenderer.invoke('set-user-logged-in', loggedIn),
  requestScreenPermission: () =>
  ipcRenderer.invoke('request-screen-permission'),

});

contextBridge.exposeInMainWorld('toastAPI', {
  onInit: (cb) => ipcRenderer.on('toast-init', (event, data) => cb(data)),
  deleteFile: (filePath) => ipcRenderer.invoke('toast-delete-file', filePath),
});

contextBridge.exposeInMainWorld('ipc', {
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  send: (channel, ...args) => ipcRenderer.send(channel, ...args),
  on: (channel, callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  }
});

// Listen for main process console logs and forward them to renderer console
// This allows main process console.log to appear in DevTools (Ctrl+Shift+I)
ipcRenderer.on('main-console-log', (_event, argsArray) => {
  // argsArray is an array of arguments sent from main process
  // Spread them to console.log so they appear in DevTools
  if (Array.isArray(argsArray)) {
    console.log(...argsArray);
  } else {
    console.log(argsArray);
  }
});