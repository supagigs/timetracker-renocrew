document.addEventListener('DOMContentLoaded', () => {
  const backBtn = document.getElementById('backBtn');
  const clockInBtn = document.getElementById('clockInBtn');
  const takeBreakBtn = document.getElementById('takeBreakBtn');
  const resumeBtn = document.getElementById('resumeBtn');
  const viewReportsBtn = document.getElementById('viewReportsBtn');
  const timeDisplay = document.getElementById('timeDisplay');
  const userName = document.getElementById('userName');
  const projectTitle = document.getElementById('projectTitle');
  const projectSubtitle = document.getElementById('projectSubtitle');
  const clockInInstruction = document.getElementById('clockInInstruction');
  const FRAPPE_REQUEST_TIMEOUT_MS = 30000; // 30 seconds for intelligent reconciliation
  const breakTimerContainer = document.getElementById('breakTimerContainer');
  const breakTimeDisplay = document.getElementById('breakTimeDisplay');

  // Get project info from storage
  let selectedProjectId = StorageService.getItem('selectedProjectId');
  let clockOutInProgress = false;
  const selectedProjectName = StorageService.getItem('selectedProjectName') || 'Project';
  const displayName = StorageService.getItem('displayName') || 'User';
  const userEmail = StorageService.getItem('userEmail');

  if (!userEmail) {
    alert('No user email found. Please login again.');
    window.location.href = 'login.html';
    return;
  }

  // URL flags: recovery (save then go to projects) and close-after-save (main process requested save then close)
  const urlParams = new URLSearchParams(window.location.search || '');
  const isRecoveryMode = urlParams.get('recover') === '1';
  const isCloseAfterSave = urlParams.get('closeAfterSave') === '1';

  // Safety: never auto-restore timer after logout
  const wasLoggedOut = StorageService.getItem('userLoggedOut') === 'true';
  if (wasLoggedOut) {
    StorageService.removeItem('isActive');
    StorageService.removeItem('currentSessionId');
    StorageService.removeItem('sessionStartTime');
    StorageService.removeItem('workStartTime');
    StorageService.removeItem('breakStartTime');
    StorageService.removeItem('idleStartTime');
    StorageService.removeItem('userLoggedOut');
  }

  // Set user name
  userName.textContent = displayName;

  // Set project title and subtitle
  projectTitle.textContent = selectedProjectName;
  projectSubtitle.textContent = `Optimizing workflow for ${selectedProjectName}`;

  // Timer state variables
  let timerInterval = null;
  let sessionPersistInterval = null;
  let sessionDbUpdateInterval = null; // Updates time_sessions in DB every 30s
  let sessionStartTime = null;
  let currentSessionId = null;
  let workStartTime = null;
  let isActive = false;
  let isOnBreak = false;
  let breakStartTime = null;
  let totalBreakDuration = 0;
  let totalActiveDuration = 0;
  let breakCount = 0;
  let idleTracker = null;
  let totalIdleTime = 0;
  let isIdle = false;
  let idleStartTime = null;
  let isTimerTransitioning = false;
  let idle2hClockOutTriggered = false;
  let break2mClockOutTriggered = false;
  let lockSuspendClockOutTriggered = false;
  const IDLE_AUTO_CLOCKOUT_THRESHOLD_SECONDS = 1800; // 30 mins — auto clock out while continuously idle
  const BREAK_AUTO_CLOCKOUT_THRESHOLD_SECONDS = 7200; // 2 hours — auto clock out when continuously on break

  // Initialize idle tracker
  function initializeIdleTracker() {
    if (idleTracker) {
      idleTracker.destroy();
      idleTracker = null;
    }

    idleTracker = new IdleTracker({
      idleThreshold: 30,
      checkInterval: 1000,
      onIdleStart: () => {
        console.log('User became idle');
        if (isActive && !isOnBreak && !isIdle) {
          if (workStartTime) {
            const now = new Date();
            const workElapsed = Math.floor((now - new Date(workStartTime)) / 1000);
            if (workElapsed > 0) {
              totalActiveDuration += workElapsed;
              StorageService.setItem('activeDuration', totalActiveDuration.toString());
            }
          }
          workStartTime = null;
          StorageService.removeItem('workStartTime');
        }
        isIdle = true;
        StorageService.setItem('isIdle', 'true');
        idleStartTime = new Date();
        StorageService.setItem('idleStartTime', idleStartTime.toISOString());
      },
      onIdleEnd: (idleDuration) => {
        //console.log(`User became active after ${idleDuration.toFixed(1)}s idle time`);
        totalIdleTime += idleDuration;
        StorageService.setItem('totalIdleTime', totalIdleTime.toString());
        isIdle = false;
        StorageService.setItem('isIdle', 'false');
        StorageService.removeItem('idleStartTime');

        if (idleDuration >= IDLE_AUTO_CLOCKOUT_THRESHOLD_SECONDS && isActive && !isOnBreak) {
          console.log(`Auto clocking out: ${idleDuration}s idle (>= ${IDLE_AUTO_CLOCKOUT_THRESHOLD_SECONDS}s threshold)`);
          clockOut({ auto: true, reason: 'idle_2m' }).catch(err => {
            console.error('Failed to auto clock out after idle:', err);
          });
          return;
        }

        if (isActive && !isOnBreak) {
          workStartTime = new Date();
          StorageService.setItem('workStartTime', workStartTime.toISOString());
        }
      }
    });

    totalIdleTime = parseInt(StorageService.getItem('totalIdleTime') || '0');
  }

  // Format time as HH:MM:SS
  function formatTime(seconds) {
    if (!seconds || isNaN(seconds) || seconds < 0) {
      return '00:00:00';
    }
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  function runIdleAutoClockOutCheck() {
    if (!isActive || isOnBreak || !isIdle || !idleTracker || idle2hClockOutTriggered) return false;
    const currentIdleDuration = idleTracker.getCurrentIdleTime();
    if (currentIdleDuration < IDLE_AUTO_CLOCKOUT_THRESHOLD_SECONDS) return false;
    idle2hClockOutTriggered = true;
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    //console.log(`Auto clocking out: ${currentIdleDuration}s (${(currentIdleDuration / 60).toFixed(1)}m) continuous idle — ending session now`);
    clockOut({ auto: true, reason: 'idle_2m' }).catch(err => {
      console.error('Failed to auto clock out:', err);
    });
    return true;
  }

  /** Auto clock out when user has been on break for 2 continuous minutes. */
  function runBreakAutoClockOutCheck() {
    if (!isActive || !isOnBreak || !breakStartTime || break2mClockOutTriggered) return false;
    const breakStart = breakStartTime instanceof Date ? breakStartTime : new Date(breakStartTime);
    if (isNaN(breakStart.getTime())) return false;
    const currentBreakDuration = Math.floor((new Date() - breakStart) / 1000);
    if (currentBreakDuration < BREAK_AUTO_CLOCKOUT_THRESHOLD_SECONDS) return false;
    break2mClockOutTriggered = true;
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    if (sessionPersistInterval) {
      clearInterval(sessionPersistInterval);
      sessionPersistInterval = null;
    }
    if (sessionDbUpdateInterval) {
      clearInterval(sessionDbUpdateInterval);
      sessionDbUpdateInterval = null;
    }
    //console.log(`Auto clocking out: ${currentBreakDuration}s (${(currentBreakDuration / 60).toFixed(1)}m) continuous break — ending session now`);
    clockOut({ auto: true, reason: 'break_2m' }).catch(err => {
      console.error('Failed to auto clock out after break:', err);
    });
    return true;
  }

  // Update timer display
  function updateTimer() {
    if (!sessionStartTime) return;

    const now = new Date();
    let currentActiveTime = totalActiveDuration;
    if (isActive && !isOnBreak && !isIdle && workStartTime) {
      const workElapsed = Math.floor((now - new Date(workStartTime)) / 1000);
      currentActiveTime = totalActiveDuration + workElapsed;
    }

    let currentBreakTime = 0;
    let currentSingleBreakDuration = 0;
    if (isOnBreak && breakStartTime) {
      const breakStart = breakStartTime instanceof Date ? breakStartTime : new Date(breakStartTime);
      if (!isNaN(breakStart.getTime())) {
        currentSingleBreakDuration = Math.floor((now - breakStart) / 1000);
        currentBreakTime = totalBreakDuration + currentSingleBreakDuration;
      }
    }

    const currentIdleTime = idleTracker ? idleTracker.getTotalIdleTime() : totalIdleTime;

    if (runIdleAutoClockOutCheck()) return;
    if (runBreakAutoClockOutCheck()) return;

    timeDisplay.textContent = formatTime(currentActiveTime + currentIdleTime);

    // Show total accumulated break time
    if (isOnBreak || totalBreakDuration > 0) {
      breakTimerContainer.style.display = 'block';
      breakTimeDisplay.textContent = formatTime(isOnBreak ? currentBreakTime : totalBreakDuration);
    } else {
      breakTimerContainer.style.display = 'none';
    }

    if (clockInInstruction) {
      clockInInstruction.textContent = isOnBreak ? 'You are on break.' : (isActive ? 'You are working.' : 'Click Clock In to start.');
    }
  }

  function persistSessionSnapshotForRecovery() {
    if (!sessionStartTime || !isActive) return;
    const now = new Date();
    let computedActive = totalActiveDuration;
    if (isActive && !isOnBreak && !isIdle && workStartTime) {
      computedActive += Math.floor((now - new Date(workStartTime)) / 1000);
    }
    let computedBreak = totalBreakDuration;
    if (isOnBreak && breakStartTime) {
      computedBreak += Math.floor((now - new Date(breakStartTime)) / 1000);
    }
    const computedIdle = idleTracker ? idleTracker.getTotalIdleTime() : totalIdleTime;
    StorageService.setItem('activeDuration', String(computedActive));
    StorageService.setItem('breakDuration', String(computedBreak));
    StorageService.setItem('totalIdleTime', String(computedIdle));
  }

  /** Update time_sessions row in DB with current durations (called every 30s while session is active). */
  async function updateTimeTrackerSessionInDb() {
    if (!sessionStartTime || !isActive) return;
    const supabaseSessionId = StorageService.getItem('supabaseSessionId');
    if (!supabaseSessionId) return;
    const now = new Date();
    let computedActive = totalActiveDuration;
    if (isActive && !isOnBreak && !isIdle && workStartTime) {
      computedActive += Math.floor((now - new Date(workStartTime)) / 1000);
    }
    let computedBreak = totalBreakDuration;
    if (isOnBreak && breakStartTime) {
      computedBreak += Math.floor((now - new Date(breakStartTime)) / 1000);
    }
    const computedIdle = idleTracker ? idleTracker.getTotalIdleTime() : totalIdleTime;
    const totalDuration = computedActive + computedBreak + computedIdle;
    try {
      const { error } = await window.supabase
        .from('time_sessions')
        .update({
          active_duration: computedActive,
          break_duration: computedBreak,
          idle_duration: computedIdle,
          total_duration: totalDuration
        })
        .eq('id', parseInt(supabaseSessionId, 10));
      if (error) console.warn('updateTimeTrackerSessionInDb failed:', error);
    } catch (err) {
      console.warn('updateTimeTrackerSessionInDb error:', err);
    }
  }

  // Helper function to update timer state in main process
  function updateTimerStateInMainProcess(active) {
    if (window.electronAPI && window.electronAPI.setTimerActive) {
      window.electronAPI.setTimerActive(active).catch(err => {
        console.error('Error updating timer state:', err);
      });
    }
  }

  // Start background screenshot capture for this session
  function startScreenshotCapture() {
    try {
      //console.log('Starting background screenshot capture (startProject)...');

      const email = StorageService.getItem('userEmail');
      if (!email) {
        console.warn('startScreenshotCapture: userEmail not found in storage');
        return;
      }

      const sessionId = currentSessionId || 'temp-session';

      const supabaseSessionId = StorageService.getItem('supabaseSessionId');
      let numericSupabaseSessionId = null;
      if (supabaseSessionId) {
        const parsed = parseInt(supabaseSessionId, 10);
        if (!isNaN(parsed) && isFinite(parsed)) {
          numericSupabaseSessionId = parsed;
        }
      }

      const frappeProjectId = selectedProjectId || StorageService.getItem('selectedProjectId') || null;
      const frappeTaskId = null;

      //console.log('Screenshot capture (startProject) - sessionId:', sessionId);
      //console.log('Screenshot capture (startProject) - supabaseSessionId:', numericSupabaseSessionId);
      //console.log('Screenshot capture (startProject) - frappeProjectId:', frappeProjectId);

      if (!window.electronAPI || !window.electronAPI.startBackgroundScreenshots) {
        console.error('startScreenshotCapture: electronAPI.startBackgroundScreenshots not available');
        return;
      }

      window.electronAPI
        .startBackgroundScreenshots(email, sessionId, numericSupabaseSessionId, frappeProjectId, frappeTaskId)
        .then(() => {
          //console.log('Background screenshot capture (startProject) started successfully');
        })
        .catch((error) => {
          console.error('Failed to start background screenshot capture (startProject):', error);
        });
    } catch (err) {
      console.error('startScreenshotCapture (startProject) failed:', err);
    }
  }

  // Stop background screenshot capture for this session
  function stopScreenshotCapture() {
    if (!window.electronAPI || !window.electronAPI.stopBackgroundScreenshots) {
      return;
    }

    //console.log('Stopping background screenshot capture (startProject)...');
    window.electronAPI
      .stopBackgroundScreenshots()
      .then(() => {
        //console.log('Background screenshot capture (startProject) stopped successfully');
      })
      .catch((error) => {
        console.error('Failed to stop background screenshot capture (startProject):', error);
      });
  }

  const FRAPPE_TIMEOUT_MS = 15000;
  function callWithTimeout(promise, ms) {
    const t = new Promise((_, reject) => setTimeout(() => reject(new Error('Request timeout')), ms || FRAPPE_TIMEOUT_MS));
    return Promise.race([promise, t]);
  }

  /**
   * Fetch frappe_employee_id and company for the logged-in user from Frappe.
   * Uses IPC via window.frappe.getEmployeeForUser instead of Supabase.
   * @returns {{ frappeEmployeeId: string, company: string|null } | null}
   */
  async function fetchEmployeeForUser(userEmail) {
    if (!userEmail || !window.frappe || typeof window.frappe.getEmployeeForUser !== 'function') {
      return null;
    }
    try {
      const result = await window.frappe.getEmployeeForUser(userEmail);
      if (!result || !result.success || !result.employeeId) {
        return null;
      }
      return {
        frappeEmployeeId: String(result.employeeId).trim(),
        company: result.company ? String(result.company).trim() : null
      };
    } catch (err) {
      console.error('fetchEmployeeForUser (Frappe) error:', err);
      return null;
    }
  }

  // Start timer (Clock In)
  async function startTimer() {
    if (isActive) return;

    // Prevent starting if we are currently clocking out or already starting
    if (clockOutInProgress || isTimerTransitioning) {
      if (typeof NotificationService !== 'undefined' && NotificationService.showWarning) {
        NotificationService.showWarning('Please wait, syncing with server...');
      } else {
        console.warn('Timer transition in progress, please wait.');
      }
      return;
    }

    if (!selectedProjectId) {
      NotificationService?.showError?.('Project is required to start tracking.');
      return;
    }

    // 1️⃣ Strict stop-before-start check
    const storedIsActive = StorageService.getItem('isActive') === 'true';
    if (storedIsActive) {
      console.log('[TRACKER] Existing active session detected in storage. Cleaning up first...');
      clockInBtn.textContent = 'Cleaning up (30s)...';

      try {
        // This will now enforce a 5-second cooldown internally
        await clockOut({ auto: true, reason: 'project_switch', skipRedirect: true });
        console.log('[TRACKER] Previous session closed successfully.');
      } catch (err) {
        console.warn('[TRACKER] Failed to close previous session via UI action, relying on server cleanup.', err);
      }
    }

    isTimerTransitioning = true;
    const originalLabel = clockInBtn.textContent;
    clockInBtn.disabled = true;
    clockInBtn.textContent = 'Syncing (30s)...';


    try {
      // Reset power guards for new session
      lockSuspendClockOutTriggered = false;

      // Clear cached session
      StorageService.removeItem('frappeSession');
      StorageService.removeItem('frappeTimesheetId');
      StorageService.removeItem('frappeTimesheetRowId');


      const userEmail = StorageService.getItem('userEmail');
      const projectId = StorageService.getItem('selectedProjectId');
      let taskId = StorageService.getItem('selectedTaskId') || null;

      // Get frappe_employee_id from employees table (required for timesheet)
      const employeeData = await fetchEmployeeForUser(userEmail);
      if (!employeeData || !employeeData.frappeEmployeeId) {
        throw new Error('Employee record not found. Please ensure your user is linked to an employee in the system.');
      }

      // ---- [PRE-FLIGHT SUPABASE CLEANUP] ----
      // Bypasses Frappe 403 "get list" permission restrictions by manually finding all active sessions from Supabase
      if (window.supabase) {
        console.log('[CLEANUP-FRONTEND] Checking Supabase for any lingering open sessions before contacting Frappe...');
        const { data: openSupa, error: supaErr } = await window.supabase
          .from('time_sessions')
          .select('frappe_timesheet_id')
          .eq('user_email', userEmail)
          .is('end_time', null);

        if (!supaErr && openSupa && openSupa.length > 0) {
          console.log(`[CLEANUP-FRONTEND] Found ${openSupa.length} open session(s) in Supabase. Forcing closure...`);
          for (const s of openSupa) {
            if (s.frappe_timesheet_id) {
              try {
                console.log(`[CLEANUP-FRONTEND] Pre-flight stopping ${s.frappe_timesheet_id}...`);
                await window.frappe.stopTimesheetSession({ timesheet: s.frappe_timesheet_id });
              } catch (err) {
                console.error(`[CLEANUP-FRONTEND] Failed to auto-stop ${s.frappe_timesheet_id}:`, err);
              }
            }
          }
        } else if (!supaErr) {
          console.log('[CLEANUP-FRONTEND] No open sessions found in Supabase. Proceeding to Frappe.');
        } else {
          console.error('[CLEANUP-FRONTEND] Supabase error during pre-flight check:', supaErr);
        }
      }
      // ---------------------------------------

      let { timesheet } = await callWithTimeout(
        window.frappe.getOrCreateTimesheet({
          project: projectId,
          task: taskId,
          frappeEmployeeId: employeeData.frappeEmployeeId
        }),
        FRAPPE_REQUEST_TIMEOUT_MS
      );

      if (!timesheet) {
        throw new Error('Failed to get or create timesheet');
      }

      //Resolve correct row (resume running OR create new)
      const rowResult = await callWithTimeout(
        window.frappe.resolveRowForStart({
          timesheet,
          project: projectId,
          task: taskId,
          userEmail: userEmail
        }),
        FRAPPE_REQUEST_TIMEOUT_MS
      );

      if (!rowResult || !rowResult.rowId) {
        throw new Error('Failed to resolve timesheet row');
      }

      const email = userEmail || StorageService.getItem('userEmail');
      if (rowResult.stoppedRows && rowResult.stoppedRows.length > 0 && window.supabase && email) {
        try {
          for (const stoppedRow of rowResult.stoppedRows) {
            // Find open Supabase session matching this Frappe timesheet
            const { data: openSessions, error: findErr } = await window.supabase
              .from('time_sessions')
              .select('id, start_time, total_duration, active_duration')
              .eq('user_email', email)
              .eq('frappe_timesheet_id', stoppedRow.timesheetId)
              .is('end_time', null);

            if (!findErr && openSessions && openSessions.length > 0) {
              const sessionToClose = openSessions[0];
              const safeElapsed = stoppedRow.elapsedSeconds || 0;

              const finalTotal = Math.max(sessionToClose.total_duration || 0, safeElapsed);
              const finalActive = Math.max(sessionToClose.active_duration || 0, safeElapsed);

              await window.supabase
                .from('time_sessions')
                .update({
                  end_time: stoppedRow.toTime || new Date().toISOString(),
                  total_duration: finalTotal,
                  active_duration: finalActive
                })
                .eq('id', sessionToClose.id);

              console.log(`[TRACKER] Cleaned up orphaned Supabase session ${sessionToClose.id} matched to Frappe Timesheet ${stoppedRow.timesheetId}`);
            }
          }
        } catch (cleanupErr) {
          console.warn('[TRACKER] Failed to cleanup orphaned Supabase sessions:', cleanupErr);
        }
      }

      const row = rowResult.rowId;
      if (rowResult.timesheet) {
        timesheet = rowResult.timesheet;
      }


      // Start session in Frappe ONLY if it is not already running
      if (!rowResult.isAlreadyRunning) {
        await callWithTimeout(
          window.frappe.startTimesheetSession({ timesheet, row }),
          FRAPPE_REQUEST_TIMEOUT_MS
        );
      } else {
        console.log('[TRACKER] Recovered an already running session from Frappe. Skipping start endpoint.');
      }

      console.log(`[TRACKER] Session Started:`);
      console.log(` - Timesheet: ${timesheet}`);
      console.log(` - Row: ${row}`);
      console.log(` - Project: ${projectId}`);

      const session = {
        frappeTimesheetId: timesheet,
        frappeTimesheetRowId: row
      };

      StorageService.setItem('frappeSession', JSON.stringify(session));
      StorageService.setItem('frappeTimesheetId', timesheet);
      StorageService.setItem('frappeTimesheetRowId', row);

      // Create time_sessions entry in time tracker DB and store its id
      const today = new Date().toISOString().split('T')[0];
      const startTimeIso = new Date().toISOString();
      if (window.supabase && email) {
        const insertPayload = {
          user_email: email,
          start_time: startTimeIso,
          session_date: today,
          frappe_timesheet_id: timesheet,
          frappe_project_id: projectId || null,
          frappe_task_id: taskId || null,
          frappe_employee_id: employeeData.frappeEmployeeId || null,
          active_duration: 0,
          break_duration: 0,
          idle_duration: 0,
          total_duration: 0,
          break_count: 0
        };
        if (employeeData.company) {
          insertPayload.company = employeeData.company;
        }
        const { data: inserted, error: insertError } = await window.supabase
          .from('time_sessions')
          .insert([insertPayload])
          .select('id')
          .single();
        if (insertError) {
          console.error('Error creating time_sessions entry:', insertError);
          throw new Error(`Failed to create time tracker session: ${insertError.message}`);
        }
        if (inserted && inserted.id != null) {
          const supabaseSessionId = String(inserted.id);
          StorageService.setItem('supabaseSessionId', supabaseSessionId);
          StorageService.setItem('currentSessionId', supabaseSessionId);
          currentSessionId = supabaseSessionId;
          if (window.electronAPI && window.electronAPI.updateBackgroundScreenshotSessionId) {
            window.electronAPI.updateBackgroundScreenshotSessionId(inserted.id).catch(err => {
              console.warn('updateBackgroundScreenshotSessionId failed:', err);
            });
          }
        }
      }

      // 4️⃣ Only after Frappe confirms → activate UI
      sessionStartTime = new Date();
      workStartTime = new Date();

      StorageService.setItem('sessionStartTime', sessionStartTime.toISOString());
      StorageService.setItem('workStartTime', workStartTime.toISOString());
      StorageService.setItem('isActive', 'true');

      isActive = true;
      clockInBtn.textContent = 'Clock Out';
      clockInBtn.classList.remove('start-project-btn-primary');
      clockInBtn.classList.add('start-project-btn-danger');
      clockInBtn.disabled = false;
      takeBreakBtn.disabled = false;

      updateTimerStateInMainProcess(true);

      if (idleTracker) idleTracker.startTracking();
      timerInterval = setInterval(updateTimer, 1000);
      sessionPersistInterval = setInterval(persistSessionSnapshotForRecovery, 15000);
      sessionDbUpdateInterval = setInterval(updateTimeTrackerSessionInDb, 30000); // Update DB every 30s
      updateTimer();
      startScreenshotCapture();
    } catch (error) {
      console.error('Error starting timer:', error);
      clockInBtn.disabled = false;

      clockInBtn.textContent = originalLabel || 'Clock In';

      const msg = error?.message || 'Failed to start timer';
      NotificationService?.showError?.(msg);
    } finally {
      isTimerTransitioning = false;
    }
  }

  // Stop timer (Clock Out)
  async function clockOut({ auto = false, reason = null, skipRedirect = false } = {}) {
    if (clockOutInProgress) {
      console.warn('[TRACKER] clockOut ignored — already in progress');
      return;
    }

    // // 2. QUEUE IF STARTING: If the app is currently clocking IN, wait and try clocking OUT again
    // if (isTimerTransitioning) {
    //   console.warn('[TRACKER] clockOut delayed — timer is currently starting');
    //   return;
    // }

    clockOutInProgress = true;
    isTimerTransitioning = true; // Use common flag to block other transitions

    // NEW: Update UI immediately to prevent multiple clicks and show status
    const originalBtnText = clockInBtn.textContent;
    clockInBtn.disabled = true;
    clockInBtn.textContent = 'Syncing (30s)...';
    if (takeBreakBtn) takeBreakBtn.disabled = true;

    const wasActive = isActive;
    const previousWorkStartTime = workStartTime ? new Date(workStartTime) : null;
    const clockOutTime = new Date();

    let finalBreakDuration = totalBreakDuration;
    if (isOnBreak && breakStartTime) {
      const breakElapsed = Math.floor((clockOutTime - new Date(breakStartTime)) / 1000);
      if (breakElapsed > 0) {
        finalBreakDuration += breakElapsed;
        breakCount++;
      }
    }

    let finalActiveDuration = totalActiveDuration;
    if (wasActive && !isOnBreak && !isIdle && previousWorkStartTime) {
      const workElapsed = Math.floor((clockOutTime - previousWorkStartTime) / 1000);
      if (workElapsed > 0) {
        finalActiveDuration += workElapsed;
      }
    }

    // Stop screenshots IMMEDIATELY
    stopScreenshotCapture();
    if (typeof NotificationService !== 'undefined' && !auto) {
      NotificationService.showInfo('Syncing session with server...', 0);
    }

    // Stop UI intervals ONLY (do not change state yet)
    clearInterval(timerInterval);
    timerInterval = null;

    if (sessionPersistInterval) {
      clearInterval(sessionPersistInterval);
      sessionPersistInterval = null;
    }
    if (sessionDbUpdateInterval) {
      clearInterval(sessionDbUpdateInterval);
      sessionDbUpdateInterval = null;
    }

    if (idleTracker) idleTracker.stopTracking();

    try {
      const finalIdleTime = idleTracker ? idleTracker.getTotalIdleTime() : totalIdleTime;
      const totalSessionDurationSeconds =
        finalActiveDuration + finalBreakDuration + finalIdleTime;

      console.log(`[TRACKER] Clocking out. Session Summary:`);
      console.log(` - Total Active: ${finalActiveDuration}s`);
      console.log(` - Total Break: ${finalBreakDuration}s`);
      console.log(` - Total Idle: ${finalIdleTime}s`);
      console.log(` - Total Duration: ${totalSessionDurationSeconds}s`);
      console.log(` - Reason: ${reason || 'manual'}`);

      await saveSession(
        totalSessionDurationSeconds,
        finalBreakDuration,
        finalActiveDuration,
        finalIdleTime,
        breakCount
      );

      // Clear any "Syncing" notifications
      if (typeof NotificationService !== 'undefined') {
        NotificationService.removeExistingNotifications('info');
      }

      console.log(`[TRACKER] Session successfully saved to Frappe and Supabase.`);

      // Session saved. Applying a short server sync buffer to ensure all IPC calls complete
      const cooldownMs = skipRedirect ? 10000 : 1000; // 10s cooldown for project switch/atomic cleaning
      console.log(`[TRACKER] Session saved. Waiting ${cooldownMs / 1000}s for server synchronization...`);
      await new Promise(resolve => setTimeout(resolve, cooldownMs));


      // ✅ ONLY NOW mark as stopped
      isActive = false;
      isIdle = false;
      workStartTime = null;
      idleStartTime = null;

      StorageService.setItem('isActive', 'false');
      StorageService.setItem('isIdle', 'false');
      StorageService.removeItem('workStartTime');
      StorageService.removeItem('idleStartTime');

      updateTimerStateInMainProcess(false);

      // Clear session storage
      StorageService.removeItem('sessionStartTime');
      StorageService.removeItem('currentSessionId');
      StorageService.removeItem('supabaseSessionId');
      StorageService.removeItem('frappeSession');
      StorageService.removeItem('frappeTimesheetId');
      StorageService.removeItem('frappeTimesheetRowId');
      StorageService.removeItem('breakDuration');
      StorageService.removeItem('activeDuration');
      StorageService.removeItem('breakCount');
      StorageService.removeItem('totalIdleTime');
      StorageService.removeItem('isOnBreak');

      if (idleTracker) {
        idleTracker.destroy();
        idleTracker = null;
      }

      clockInBtn.textContent = 'Clock In';
      clockInBtn.classList.remove('start-project-btn-danger');
      clockInBtn.classList.add('start-project-btn-primary');

      // Show Windows notification when timer stops (manual or auto)
      if (window.electronAPI?.showTimerStoppedNotification) {
        window.electronAPI.showTimerStoppedNotification();
      }

      // Only navigate if we aren't skipping project switch
      if (!skipRedirect) {
        window.location.href = 'projects.html';
      }


    } catch (error) {
      console.error('Clock out failed — restoring state:', error);

      // Restore button state on failure so user can retry
      clockInBtn.disabled = false;
      clockInBtn.textContent = 'Clock Out';
      if (takeBreakBtn) takeBreakBtn.disabled = false;

      // 🔁 ROLLBACK
      isActive = true;
      StorageService.setItem('isActive', 'true');
      updateTimerStateInMainProcess(true);

      timerInterval = setInterval(updateTimer, 1000);
      sessionPersistInterval = setInterval(persistSessionSnapshotForRecovery, 15000);
      sessionDbUpdateInterval = setInterval(updateTimeTrackerSessionInDb, 30000);

      if (idleTracker) idleTracker.startTracking();
      startScreenshotCapture();

      NotificationService?.showError?.(
        error.message || 'Failed to stop timer. Please try again.'
      );
    } finally {
      clockOutInProgress = false;
      isTimerTransitioning = false;
    }
  }


  // Save session to database
  async function saveSession(totalDuration, breakDuration, activeDuration, idleDuration = 0, breakCountVal = 0) {
    const email = StorageService.getItem('userEmail');
    const today = new Date().toISOString().split('T')[0];

    try {
      // Update Frappe timesheet
      const frappeSessionStr = StorageService.getItem('frappeSession');
      if (frappeSessionStr) {
        try {
          const session = JSON.parse(frappeSessionStr);
          if (session.frappeTimesheetId && session.frappeTimesheetRowId) {
            const timesheet = await window.frappe.getTimesheetById(session.frappeTimesheetId);

            if (!timesheet || !timesheet.time_logs || !Array.isArray(timesheet.time_logs)) {
              throw new Error('Invalid timesheet structure');
            }

            const activeRow = timesheet.time_logs.find(row => {
              return row && row.from_time != null && row.to_time == null;
            });

            if (!activeRow) {
              throw new Error('No active time log found');
            }

            const serverNow = await window.frappe.getFrappeServerTime();

            activeRow.to_time = serverNow;

            // Compute correct hours
            const fromTime = new Date(activeRow.from_time).getTime();
            const toTime = new Date(serverNow).getTime();
            let computedHours = 0;
            if (!isNaN(fromTime) && !isNaN(toTime)) {
              computedHours = Math.max(0, (toTime - fromTime) / (1000 * 60 * 60));
            }
            activeRow.hours = computedHours;

            activeRow.completed = 1;

            if (!activeRow.doctype) {
              activeRow.doctype = 'Timesheet Detail';
            }

            await window.frappe.saveTimesheetWithSavedocs(timesheet);
            console.log(`Successfully saved timesheet ${session.frappeTimesheetId}`);
          }
        } catch (frappeError) {
          console.error('Error updating Frappe timesheet:', frappeError);
          const displayMessage = getTimesheetSyncErrorMessage(frappeError) || `Failed to update ERP Next timesheet: ${frappeError.message || 'Unknown error'}`;
          NotificationService.showError(displayMessage);
        }
      }

      // Update Supabase session
      const supabaseSessionId = StorageService.getItem('supabaseSessionId');
      const frappeTimesheetId = StorageService.getItem('frappeTimesheetId');

      if (supabaseSessionId) {
        let company = null;
        try {
          const companyResult = await window.auth.getUserCompany(email);
          if (companyResult && companyResult.success) {
            company = companyResult.company;
          }
        } catch (companyError) {
          console.warn('Error getting company:', companyError);
        }

        const updateData = {
          end_time: new Date().toISOString(),
          break_duration: breakDuration,
          active_duration: activeDuration,
          idle_duration: idleDuration,
          break_count: breakCountVal,
          total_duration: totalDuration
        };

        if (company) {
          updateData.company = company;
        }

        if (frappeTimesheetId) {
          updateData.frappe_timesheet_id = frappeTimesheetId;
        }

        const { error: updateError } = await window.supabase
          .from('time_sessions')
          .update(updateData)
          .eq('id', parseInt(supabaseSessionId, 10));

        if (updateError) {
          console.error('Error updating Supabase session:', updateError);
          throw new Error(`Failed to update session: ${updateError.message}`);
        }

        //console.log('Successfully updated Supabase session');
      }
    } catch (error) {
      console.error('Error saving session:', error);
      throw error;
    }
  }

  async function handleProjectSwitch(newProjectData) {
    try {
      // 'isActive' is your global variable in startproject.js tracking if a timer is on
      if (typeof isActive !== 'undefined' && isActive) {
        //console.log("!! Rapid Switch Detected: Stopping previous project in Frappe first...");

        //Await clock out, but prevent it from navigating away
        await clockOut({ auto: true, reason: 'project_switch', skipRedirect: true });

        //console.log("Previous project closed. Enforcing strict 2-second cooldown...");

        // The "Cooldown" - prevents the 417 error for overlapping logs
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      //console.log("Starting new project:", newProjectData.project);

      // Update the global variables and storage for the new project BEFORE starting
      selectedProjectId = newProjectData.project;
      StorageService.setItem('selectedProjectId', newProjectData.project);

      if (newProjectData.task) {
        StorageService.setItem('selectedTaskId', newProjectData.task);
      } else {
        StorageService.removeItem('selectedTaskId');
      }

      //STart new timer safely
      await startTimer();

    } catch (error) {
      console.error("Critical Error during project switch:", error);
      if (typeof NotificationService !== 'undefined') {
        NotificationService.showError("Project switch failed. Please clock out manually.");
      }
    }
  }

  // Take break
  function takeBreak() {
    if (isActive && !isOnBreak) {
      if (workStartTime) {
        const workElapsed = Math.floor((new Date() - new Date(workStartTime)) / 1000);
        totalActiveDuration += workElapsed;
        StorageService.setItem('activeDuration', totalActiveDuration.toString());
      }

      if (isIdle) {
        isIdle = false;
        StorageService.setItem('isIdle', 'false');
        StorageService.removeItem('idleStartTime');
      }

      isOnBreak = true;
      breakStartTime = new Date();
      StorageService.setItem('isOnBreak', 'true');
      StorageService.setItem('breakStartTime', breakStartTime.toISOString());

      // Show Resume button on left, Clock Out on right
      resumeBtn.style.display = 'inline-flex';
      resumeBtn.textContent = 'Resume Work';
      takeBreakBtn.style.display = 'none';
      clockInBtn.textContent = 'Clock Out';
      clockInBtn.classList.remove('start-project-btn-primary');
      clockInBtn.classList.add('start-project-btn-danger-transparent');
      breakTimerContainer.style.display = 'block';

      if (idleTracker) {
        idleTracker.stopTracking();
      }

      // Stop background screenshot capture while on break
      stopScreenshotCapture();
    } else if (isOnBreak) {
      if (breakStartTime) {
        const breakElapsed = Math.floor((new Date() - new Date(breakStartTime)) / 1000);
        totalBreakDuration += breakElapsed;
        breakCount++;
        StorageService.setItem('breakDuration', totalBreakDuration.toString());
        StorageService.setItem('breakCount', breakCount.toString());
      }

      isOnBreak = false;
      StorageService.setItem('isOnBreak', 'false');
      StorageService.removeItem('breakStartTime');
      isIdle = false;
      StorageService.setItem('isIdle', 'false');
      StorageService.removeItem('idleStartTime');

      // Hide Resume button, show Take Break button
      resumeBtn.style.display = 'none';
      takeBreakBtn.style.display = 'inline-flex';
      takeBreakBtn.textContent = 'Take Break';
      takeBreakBtn.classList.remove('start-project-btn-success');
      takeBreakBtn.classList.add('start-project-btn-secondary');

      workStartTime = new Date();
      StorageService.setItem('workStartTime', workStartTime.toISOString());

      if (idleTracker) {
        idleTracker.startTracking();
      }

      // Resume background screenshot capture after break ends
      startScreenshotCapture();
    }
    // Instantly force the UI to reflect the state change without waiting for the interval tick
    updateTimer();

    //Resync the background interval to exactly onclick
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = setInterval(updateTimer, 1000);
    }
  }

  /** Restore in-memory session state from storage (for recovery, closeAfterSave, or return-to-timer). */
  function restoreSessionFromStorage() {
    const stored = StorageService.getItem('sessionStartTime');
    if (!stored) return false;
    sessionStartTime = new Date(stored);
    currentSessionId = StorageService.getItem('currentSessionId') || StorageService.getItem('supabaseSessionId');
    const workStored = StorageService.getItem('workStartTime');
    workStartTime = workStored ? new Date(workStored) : null;
    isActive = StorageService.getItem('isActive') === 'true';
    isOnBreak = StorageService.getItem('isOnBreak') === 'true';
    const breakStored = StorageService.getItem('breakStartTime');
    breakStartTime = breakStored ? new Date(breakStored) : null;
    totalBreakDuration = parseInt(StorageService.getItem('breakDuration') || '0', 10);
    totalActiveDuration = parseInt(StorageService.getItem('activeDuration') || '0', 10);
    breakCount = parseInt(StorageService.getItem('breakCount') || '0', 10);
    totalIdleTime = parseInt(StorageService.getItem('totalIdleTime') || '0', 10);
    isIdle = StorageService.getItem('isIdle') === 'true';
    const idleStored = StorageService.getItem('idleStartTime');
    idleStartTime = idleStored ? new Date(idleStored) : null;
    return true;
  }

  /** Apply restored session state to UI (clock out button, break/resume, timer display). */
  function applyRestoredSessionUI() {
    if (!sessionStartTime || !isActive) return;
    clockInBtn.textContent = 'Clock Out';
    clockInBtn.classList.remove('start-project-btn-primary');
    clockInBtn.classList.add('start-project-btn-danger');
    clockInBtn.disabled = false;
    takeBreakBtn.disabled = false;
    if (isOnBreak) {
      resumeBtn.style.display = 'inline-flex';
      takeBreakBtn.style.display = 'none';
      resumeBtn.textContent = 'End Break';
      resumeBtn.classList.add('start-project-btn-success');
      breakTimerContainer.style.display = 'block'; // Show sub-timer on restore
    } else {
      resumeBtn.style.display = 'none';
      takeBreakBtn.style.display = 'inline-flex';
      breakTimerContainer.style.display = totalBreakDuration > 0 ? 'block' : 'none';
    }
    if (clockInInstruction) clockInInstruction.style.display = 'none';
    updateTimer();
    updateTimerStateInMainProcess(true);
    if (idleTracker) idleTracker.startTracking();
    if (!timerInterval) {
      timerInterval = setInterval(updateTimer, 1000);
      sessionPersistInterval = setInterval(persistSessionSnapshotForRecovery, 15000);
      sessionDbUpdateInterval = setInterval(updateTimeTrackerSessionInDb, 30000);
    }
    const screenshotCaptureActive = StorageService.getItem('screenshotCaptureActive') === 'true';
    if (screenshotCaptureActive) startScreenshotCapture();
  }

  // Restore session state on page load (clear when no active session to show)
  function restoreSession() {
    const storedSessionStartTime = StorageService.getItem('sessionStartTime');
    const storedIsActive = StorageService.getItem('isActive') === 'true';

    if (storedSessionStartTime && storedIsActive) {
      // console.log('Clearing session state from previous app session (app was closed)');
      // StorageService.removeItem('sessionStartTime');
      // StorageService.removeItem('isActive');
      // StorageService.removeItem('workStartTime');
      // StorageService.removeItem('isOnBreak');
      // StorageService.removeItem('breakStartTime');
      // StorageService.removeItem('breakDuration');
      // StorageService.removeItem('activeDuration');
      // StorageService.removeItem('breakCount');
      // StorageService.removeItem('totalIdleTime');
      // StorageService.removeItem('isIdle');
      // StorageService.removeItem('idleStartTime');
      // StorageService.removeItem('frappeSession');
      // StorageService.removeItem('frappeTimesheetId');
      // StorageService.removeItem('frappeTimesheetRowId');
      // StorageService.removeItem('supabaseSessionId');
      // StorageService.removeItem('currentSessionId');
    }

    sessionStartTime = null;
    currentSessionId = null;
    workStartTime = null;
    isActive = false;
    isOnBreak = false;
    breakStartTime = null;
    totalBreakDuration = 0;
    totalActiveDuration = 0;
    breakCount = 0;
    totalIdleTime = 0;
    isIdle = false;
    idleStartTime = null;

    clockInBtn.textContent = 'Clock In';
    clockInBtn.classList.remove('start-project-btn-danger', 'start-project-btn-danger-transparent');
    clockInBtn.classList.add('start-project-btn-primary');
    takeBreakBtn.disabled = true;
    resumeBtn.style.display = 'none';
    takeBreakBtn.style.display = 'inline-flex';
    timeDisplay.textContent = '00:00:00';
    if (clockInInstruction) clockInInstruction.style.display = '';
  }

  // Event listeners
  backBtn.addEventListener('click', () => {
    if (isActive) {
      const message = 'Please clock out first before going back to the projects screen.';
      if (typeof NotificationService !== 'undefined' && typeof NotificationService.showError === 'function') {
        NotificationService.showError(message);
      } else {
        alert(message);
      }
      return;
    }
    window.location.href = 'projects.html';
  });

  clockInBtn.addEventListener('click', async () => {
    try {
      // Disable button to prevent double-clicks during the network call
      clockInBtn.disabled = true;

      if (isActive) {
        //console.log("Stopping timer in Frappe Desk...");

        // Await ensures we don't proceed until Frappe confirms the 'Stop'
        await clockOut();

        //console.log("✓ Timer successfully stopped in Frappe.");
      } else {
        //console.log("Starting new timer...");
        await startTimer();
      }
    } catch (err) {
      console.error("Operation failed:", err);
    } finally {
      clockInBtn.disabled = false;
    }
  });

  takeBreakBtn.addEventListener('click', () => {
    if (isActive) {
      takeBreak();
    }
  });

  resumeBtn.addEventListener('click', () => {
    if (isActive && isOnBreak) {
      takeBreak(); // Resume is the same as ending the break
    }
  });

  takeBreakBtn.disabled = true;

  viewReportsBtn.addEventListener('click', () => {
    const reportsBaseUrl = (window.env && window.env.REPORTS_URL) || '';
    const email = StorageService.getItem('userEmail');

    if (!reportsBaseUrl) {
      NotificationService.showError('Reports site URL is not configured yet.');
      return;
    }

    if (!email) {
      NotificationService.showError('User email not available. Please log in again.');
      return;
    }

    const encodedEmail = encodeURIComponent(email);
    let targetUrl = reportsBaseUrl.trim();

    if (targetUrl.includes('{email}')) {
      targetUrl = targetUrl.replace('{email}', encodedEmail);
    } else if (targetUrl.includes('%EMAIL%')) {
      targetUrl = targetUrl.replace('%EMAIL%', encodedEmail);
    } else {
      if (!targetUrl.endsWith('/')) {
        targetUrl += '/';
      }
      targetUrl += `reports/${encodedEmail}`;
    }

    //console.log('Opening reports site:', targetUrl);
    window.electronAPI.openExternalUrl(targetUrl)
      .then((ok) => {
        if (!ok) {
          NotificationService.showError('Unable to open the reports site.');
        }
      })
      .catch((error) => {
        console.error('openExternalUrl failed:', error);
        NotificationService.showError('Unable to open the reports site.');
      });
  });

  // Initialize
  initializeIdleTracker();
  if (isRecoveryMode || isCloseAfterSave) {
    restoreSessionFromStorage();
  } else {
    const hadStoredSession = restoreSessionFromStorage();
    if (!hadStoredSession) {
      restoreSession();
    }
  }

  // Clock out on window close - triggers full clock out functionality
  async function saveSessionOnClose() {
    if (!isActive || !sessionStartTime) {
      return { saved: false, error: 'No active session' };
    }

    try {
      // Call the full clockOut function to save session and clear all state
      // Use auto flag to skip navigation and confirmation
      await clockOut({ auto: true, reason: 'window_close' });

      return { saved: true };
    } catch (error) {
      console.error('Error clocking out on window close:', error);
      return { saved: false, error: error.message };
    }
  }

  // Expose save function globally for main process to call
  window.saveSessionBeforeClose = saveSessionOnClose;

  // Handle window close - cleanup only (save is handled by main process)
  window.addEventListener('beforeunload', (event) => {
    // Clean up intervals and trackers
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    if (sessionPersistInterval) {
      clearInterval(sessionPersistInterval);
      sessionPersistInterval = null;
    }
    if (idleTracker) {
      idleTracker.destroy();
      idleTracker = null;
    }
  });

  /**
   * Handle visibility/focus after potential system resume (e.g. lid opened).
   * Runs idle auto clock-out and, if the system recently resumed while a session
   * was active, auto-clocks out and saves the session just like the main tracker.
   */
  function handleVisibilityOrFocus() {
    if (!sessionStartTime) return;

    // 1) Idle-based auto clock-out (e.g. 2m idle while timer running)
    if (typeof runIdleAutoClockOutCheck === 'function') {
      runIdleAutoClockOutCheck();
    }

    // 2) If system recently resumed (lid opened after suspend) and we still have
    // an active session, clock out and persist session to DB.
    if (!isActive || lockSuspendClockOutTriggered || !window.electronAPI || !window.electronAPI.getLastSystemResume) {
      return;
    }

    const RESUME_WINDOW_MS = 90000; // 90 seconds
    window.electronAPI.getLastSystemResume().then((ts) => {
      if (ts == null || typeof ts !== 'number') return;
      if (Date.now() - ts > RESUME_WINDOW_MS) return;
      if (lockSuspendClockOutTriggered || !sessionStartTime || !isActive) return;

      lockSuspendClockOutTriggered = true;
      //console.log('[PowerEvents] Renderer startProject: clocking out on visibility/focus after recent system resume');
      clockOut({ auto: true, reason: 'resume_after_suspend' }).catch((err) => {
        console.error('[PowerEvents] Renderer startProject: resume clock out (on visibility/focus) failed:', err);
        // As a safety net, still navigate back to projects so user is not left on a stale timer page
        window.location.href = 'projects.html';
      });
    }).catch(() => { });
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && isActive && sessionStartTime) {
      // Don't save on visibility change; beforeunload handles save
      return;
    }
    if (document.visibilityState === 'visible') {
      handleVisibilityOrFocus();
    }
  });
  window.addEventListener('focus', () => {
    handleVisibilityOrFocus();
  });

  // When system resumes (e.g. laptop lid opened), clock out if we still have an active session.
  if (window.electronAPI && window.electronAPI.onSystemResumed) {
    //console.log('[PowerEvents] Renderer startProject: registering onSystemResumed listener');
    window.electronAPI.onSystemResumed(() => {
      const ts = new Date().toISOString();
      // console.log('[PowerEvents] Renderer startProject: system-resumed event received', {
      //   timestamp: ts,
      //   hasSessionStartTime: !!sessionStartTime,
      //   isActive,
      //   lockSuspendClockOutTriggered
      // });
      if (!sessionStartTime || !isActive || lockSuspendClockOutTriggered) {
        //console.log('[PowerEvents] Renderer startProject: resume clock-out skipped due to guard');
        return;
      }
      lockSuspendClockOutTriggered = true;
      //console.log('[PowerEvents] Renderer startProject: clocking out on system resume (lid opened after suspend)');
      clockOut({ auto: true, reason: 'resume_after_suspend' }).catch((err) => {
        console.error('[PowerEvents] Renderer startProject: resume clock out failed:', err);
      });
    });
  }

  // Clock out when laptop lid is closed (lock-screen) or system suspends.
  // Works for all session states: active working, idle, or on break.
  if (window.electronAPI && window.electronAPI.onLockOrSuspendClockOut) {
    //console.log('[PowerEvents] Renderer startProject: registering onLockOrSuspendClockOut listener');
    window.electronAPI.onLockOrSuspendClockOut(async (data) => {
      const reason = data?.reason || 'lock_screen';
      const ts = new Date().toISOString();
      const notifyDone = window.electronAPI?.notifyLidCloseClockOutDone;
      // console.log('[PowerEvents] Renderer startProject: lock-or-suspend event received', {
      //   timestamp: ts,
      //   reason,
      //   hasSessionStartTime: !!sessionStartTime,
      //   isActive,
      //   isOnBreak,
      //   isIdle,
      //   lockSuspendClockOutTriggered
      // });

      if (isTimerTransitioning || lockSuspendClockOutTriggered) {
        console.warn('[PowerEvents] Guarded: Transition already in progress.');
        if (notifyDone) notifyDone();
        return;
      }
      // Clock out whenever we have an active session, regardless of active/idle/on break
      if (!sessionStartTime || !isActive) {
        //console.log('[PowerEvents] Renderer startProject: lock/suspend clock-out skipped due to guard');
        if (notifyDone) notifyDone();
        return;
      }

      try {
        isTimerTransitioning = true; // Set the lock
        lockSuspendClockOutTriggered = true;

        //console.log(`[PowerEvents] Clocking out due to: ${reason}`);

        // Perform the clock out
        await clockOut({ auto: true, reason });
        //console.log('[PowerEvents] Clock out successful. Syncing with server clock...');
      } catch (err) {
        console.error('[PowerEvents] Clock out failed:', err);
        // Reset guard on failure so user can try again manually
        lockSuspendClockOutTriggered = false;
      } finally {
        isTimerTransitioning = false; // Release the lock
        if (notifyDone) notifyDone();
      }
    });
  }

  if (window.electronAPI && window.electronAPI.onUnlockResumeClockIn) {
    window.electronAPI.onUnlockResumeClockIn(() => {
      //console.log('[PowerEvents] System resumed. Checking if we can auto-start...');

      // CRITICAL: If the clock-out from the 'suspend' event is still 
      // waiting in its 2-second buffer, this lock will be TRUE.
      if (isTimerTransitioning || clockOutInProgress) {
        console.warn('[PowerEvents] Auto-start blocked: Previous session is still syncing.');
        // Optionally, retry once after 3 seconds
        setTimeout(() => {
          if (!isActive && selectedProjectId && !isTimerTransitioning) startTimer();
        }, 3000);
        return;
      }

      if (!isActive && selectedProjectId) {
        startTimer();
      }
    });
  }

  // ----- Recovery and close-after-save (single timer screen: no tracker.html) -----
  if (isCloseAfterSave) {
    const done = () => {
      if (window.electronAPI && window.electronAPI.sendSessionSavedPleaseClose) {
        window.electronAPI.sendSessionSavedPleaseClose();
      }
    };
    if (sessionStartTime && isActive && typeof saveSessionOnClose === 'function') {
      saveSessionOnClose().then(done).catch(() => done());
    } else {
      done();
    }
    return;
  }

  if (isRecoveryMode && isActive && sessionStartTime) {
    //console.log('[Recovery] Saving session that was not closed (app was force-closed or killed)...');
    clockOut({ auto: true, reason: 'recovered_after_force_close' })
      .then(() => { window.location.href = 'projects.html'; })
      .catch((err) => {
        console.error('[Recovery] Clock-out failed:', err);
        if (typeof NotificationService !== 'undefined' && NotificationService.showError) {
          NotificationService.showError('Could not safely close your last ERP Next session. Please log in again to resolve it.');
        }
        window.location.href = 'login.html';
      });
    return;
  }

  if (!isCloseAfterSave && !isRecoveryMode && sessionStartTime && isActive) {
    applyRestoredSessionUI();
  }
});
