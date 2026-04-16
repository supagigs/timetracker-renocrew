const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('env', {
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
  REPORTS_URL: process.env.REPORTS_URL || process.env.NEXTJS_REPORTS_URL || ''
});

contextBridge.exposeInMainWorld('auth', {
  login: (email, password) =>
    ipcRenderer.invoke('auth:login', { email, password }),

  logout: () =>
    ipcRenderer.invoke('auth:logout'),

  me: () =>
    ipcRenderer.invoke('auth:me'),

  getUserCompany: (userEmail) =>
    ipcRenderer.invoke('auth:get-user-company', userEmail),

  getUserRoleProfile: (userEmail) =>
    ipcRenderer.invoke('auth:get-user-role-profile', userEmail),

  getUserFullName: (userEmail) =>
    ipcRenderer.invoke('auth:get-user-full-name', userEmail),
});

contextBridge.exposeInMainWorld('frappe', {
  resolveRowForStart: (data) =>
    ipcRenderer.invoke('frappe:resolve-row-for-start', data),

  getUserProjects: () =>
    ipcRenderer.invoke('frappe:get-user-projects'),

  getEmployeeForUser: (userEmail) =>
    ipcRenderer.invoke('frappe:get-employee-for-user', userEmail),

  getUsersAssignedToProject: (projectId) =>
    ipcRenderer.invoke('frappe:get-users-assigned-to-project', projectId),

  getTasksForProject: (projectId) =>
    ipcRenderer.invoke('frappe:get-tasks-for-project', projectId),

  createTimesheet: (payload) =>
    ipcRenderer.invoke('frappe:create-timesheet', payload),

  getTimesheetForProject: (projectId) =>
    ipcRenderer.invoke('frappe:get-timesheet-for-project', projectId),

  addTimeLogToTimesheet: (timesheetId, timeLog) =>
    ipcRenderer.invoke('frappe:add-time-log-to-timesheet', timesheetId, timeLog),

  getOrCreateTimesheet: (payload) =>
    ipcRenderer.invoke('frappe:get-or-create-timesheet', payload),

  startTimesheetSession: (payload) =>
    ipcRenderer.invoke('frappe:start-timesheet-session', payload),

  updateTimesheetRow: (payload) =>
    ipcRenderer.invoke('frappe:update-timesheet-row', payload),

  getTimesheetById: (timesheetId) =>
    ipcRenderer.invoke('frappe:get-timesheet-by-id', timesheetId),

  saveTimesheetWithSavedocs: (timesheetDoc) =>
    ipcRenderer.invoke('frappe:save-timesheet-with-savedocs', timesheetDoc),

  getFrappeServerTime: () =>
    ipcRenderer.invoke('frappe:get-server-time'),

});


contextBridge.exposeInMainWorld('electronAPI', {
  startBackgroundScreenshots: (userEmail, sessionId, supabaseSessionId, frappeProjectId, frappeTaskId) =>
    ipcRenderer.invoke('start-background-screenshots', userEmail, sessionId, supabaseSessionId, frappeProjectId, frappeTaskId),
  updateBackgroundScreenshotSessionId: (supabaseSessionId) =>
    ipcRenderer.invoke('update-background-screenshot-session-id', supabaseSessionId),
  captureBackgroundScreenshotNow: () =>
    ipcRenderer.invoke('capture-background-screenshot-now'),
  stopBackgroundScreenshots: () =>
    ipcRenderer.invoke('stop-background-screenshots'),
  isBackgroundScreenshotsActive: () =>
    ipcRenderer.invoke('is-background-screenshots-active'),
  onForceStopTimer: (callback) =>
    ipcRenderer.on('force-stop-timer', callback),
  notifyTimerStopped: () =>
    ipcRenderer.send('timer-stopped'),
  onLockOrSuspendClockOut: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('lock-or-suspend-clock-out', handler);
    return () => ipcRenderer.removeListener('lock-or-suspend-clock-out', handler);
  },
  /** Notify main process that lid-close/suspend clock-out completed (releases power save blocker). */
  notifyLidCloseClockOutDone: () => ipcRenderer.send('lid-close-clock-out-done'),
  /** Show native Windows notification when timer is stopped (manual or auto). */
  showTimerStoppedNotification: () => ipcRenderer.send('show-timer-stopped-notification'),

  onSystemResumed: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('system-resumed', handler);
    return () => ipcRenderer.removeListener('system-resumed', handler);
  },

  getLastSystemResume: () =>
    ipcRenderer.invoke('get-last-system-resume'),

  saveActiveSession: () =>
    ipcRenderer.invoke('save-active-session'),

  saveSessionBeforeClose: (sessionData) =>
    ipcRenderer.invoke('save-session-before-close', sessionData),

  /** Tell main process that session was saved so it can close the window (used when closing from a page that had no save handler). */
  sendSessionSavedPleaseClose: () => ipcRenderer.send('session-saved-please-close'),

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

  getAppVersion: () =>
    ipcRenderer.invoke('get-app-version'),

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
    //console.log(...argsArray);
  } else {
    //console.log(argsArray);
  }
});
