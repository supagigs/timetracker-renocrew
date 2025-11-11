const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('env', {
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
  REPORTS_URL: process.env.REPORTS_URL || process.env.NEXTJS_REPORTS_URL || ''
});

// Also expose Supabase client creation for better security
contextBridge.exposeInMainWorld('electronAPI', {
  createSupabaseClient: () => {
    const { createClient } = require('@supabase/supabase-js');
    return createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    );
  },
  
  // Background screenshot functionality
  startBackgroundScreenshots: (userEmail, sessionId) => {
    return ipcRenderer.invoke('start-background-screenshots', userEmail, sessionId);
  },
  
  stopBackgroundScreenshots: () => {
    return ipcRenderer.invoke('stop-background-screenshots');
  },
  
  isBackgroundScreenshotsActive: () => {
    return ipcRenderer.invoke('is-background-screenshots-active');
  },
  
  // Save active session before app closes
  saveActiveSession: () => {
    return ipcRenderer.invoke('save-active-session');
  },
  
  // Screenshot capture functionality
  captureScreen: () => {
    return ipcRenderer.invoke('capture-screen');
  },
  
  // Queue a screenshot (dataURL) for storage upload and DB URL insert
  queueScreenshotUpload: (payload) => {
    return ipcRenderer.invoke('queue-screenshot-upload', payload);
  },
  
  // Get local screenshots functionality
  getLocalScreenshots: (email, startTime, endTime) => {
    return ipcRenderer.invoke('get-local-screenshots', email, startTime, endTime);
  },

  openLocalScreenshot: (filePath) => {
    return ipcRenderer.invoke('open-local-screenshot', filePath);
  },

  openScreenshotPictureInPicture: (imageSrc) => {
    return ipcRenderer.invoke('open-picture-in-picture', imageSrc);
  },
  
  // System idle helpers
  getSystemIdleTime: () => {
    return ipcRenderer.invoke('get-system-idle-time');
  },
  getSystemIdleState: (thresholdSeconds) => {
    return ipcRenderer.invoke('get-system-idle-state', thresholdSeconds);
  },
  
  openExternalUrl: (url) => {
    return ipcRenderer.invoke('open-external-url', url);
  },

  onSystemIdleState: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('system-idle-state', handler);
    return () => ipcRenderer.removeListener('system-idle-state', handler);
  },

  removeSystemIdleStateListener: () => {
    ipcRenderer.removeAllListeners('system-idle-state');
  },
  
  // Time tracking methods
  startTimeTracking: (userEmail) => {
    return ipcRenderer.invoke('start-time-tracking', userEmail);
  },
  
  stopTimeTracking: () => {
    return ipcRenderer.invoke('stop-time-tracking');
  },
  
  pauseTimeTracking: () => {
    return ipcRenderer.invoke('pause-time-tracking');
  },
  
  resumeTimeTracking: () => {
    return ipcRenderer.invoke('resume-time-tracking');
  },
  
  getTimeTrackingStatus: () => {
    return ipcRenderer.invoke('get-time-tracking-status');
  },
  
  // Listen for time tracking updates from main process
  onTimeTrackingUpdate: (callback) => {
    ipcRenderer.on('time-tracking-update', (event, data) => {
      callback(data);
    });
  },
  
  // Remove time tracking listener
  removeTimeTrackingListener: () => {
    ipcRenderer.removeAllListeners('time-tracking-update');
  },
  
  // Listen for screenshot capture notifications
  onScreenshotCaptured: (callback) => {
    ipcRenderer.on('screenshot-captured', (event, data) => {
      callback(data);
    });
  },
  
  // Remove screenshot captured listener
  removeScreenshotCapturedListener: () => {
    ipcRenderer.removeAllListeners('screenshot-captured');
  },
  
  // Update idle state in main process
  updateIdleState: (isIdle) => {
    ipcRenderer.send('update-idle-state', isIdle);
  },
  
  // Timer state management
  setTimerActive: (active) => {
    return ipcRenderer.invoke('set-timer-active', active);
  },
  
  getTimerActive: () => {
    return ipcRenderer.invoke('get-timer-active');
  },

  setUserLoggedIn: (loggedIn) => {
    return ipcRenderer.invoke('set-user-logged-in', loggedIn);
  }
});