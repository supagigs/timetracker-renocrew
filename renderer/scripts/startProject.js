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

  // Get project info from storage
  const selectedProjectId = StorageService.getItem('selectedProjectId');
  const selectedProjectName = StorageService.getItem('selectedProjectName') || 'Project';
  const displayName = StorageService.getItem('displayName') || 'User';
  const userEmail = StorageService.getItem('userEmail');

  if (!userEmail) {
    alert('No user email found. Please login again.');
    window.location.href = 'login.html';
    return;
  }

  // Set user name
  userName.textContent = displayName;

  // Set project title and subtitle
  projectTitle.textContent = selectedProjectName;
  projectSubtitle.textContent = `Optimizing workflow for ${selectedProjectName}`;

  // Timer state variables
  let timerInterval = null;
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
  let idle2hClockOutTriggered = false;
  let lockSuspendClockOutTriggered = false;
  const IDLE_AUTO_CLOCKOUT_THRESHOLD_SECONDS = 7200; // 2 hours — auto clock out while still idle

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
        console.log(`User became active after ${idleDuration.toFixed(1)}s idle time`);
        totalIdleTime += idleDuration;
        StorageService.setItem('totalIdleTime', totalIdleTime.toString());
        isIdle = false;
        StorageService.setItem('isIdle', 'false');
        StorageService.removeItem('idleStartTime');

        if (idleDuration >= IDLE_AUTO_CLOCKOUT_THRESHOLD_SECONDS && isActive && !isOnBreak) {
          console.log(`Auto clocking out: ${idleDuration}s idle (>= ${IDLE_AUTO_CLOCKOUT_THRESHOLD_SECONDS}s threshold)`);
          clockOut({ auto: true, reason: 'idle_2h' }).catch(err => {
            console.error('Failed to auto clock out after long idle:', err);
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
    console.log(`Auto clocking out: ${currentIdleDuration}s (${(currentIdleDuration / 60).toFixed(1)}m) continuous idle — ending session now`);
    clockOut({ auto: true, reason: 'idle_2h' }).catch(err => {
      console.error('Failed to auto clock out:', err);
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

    let currentBreakTime = totalBreakDuration;
    if (isOnBreak && breakStartTime) {
      const breakStart = breakStartTime instanceof Date ? breakStartTime : new Date(breakStartTime);
      if (!isNaN(breakStart.getTime())) {
        const currentBreakDuration = Math.floor((now - breakStart) / 1000);
        currentBreakTime = totalBreakDuration + currentBreakDuration;
      }
    }

    const currentIdleTime = idleTracker ? idleTracker.getTotalIdleTime() : totalIdleTime;
    const totalSessionTime = currentActiveTime + currentBreakTime + currentIdleTime;

    if (runIdleAutoClockOutCheck()) return;

    if (isActive && !isOnBreak && isIdle && idleTracker && !idle2hClockOutTriggered) {
      const d = idleTracker.getCurrentIdleTime();
      if (d >= Math.max(0, IDLE_AUTO_CLOCKOUT_THRESHOLD_SECONDS - 120)) {
        const last = (window.__idleClockOutLogAt || 0);
        if (now.getTime() - last >= 60 * 1000) {
          window.__idleClockOutLogAt = now.getTime();
          console.log(`[Idle auto clock-out] ${d}s idle / ${IDLE_AUTO_CLOCKOUT_THRESHOLD_SECONDS}s threshold`);
        }
      }
    }

    // Update time display (show total session time)
    timeDisplay.textContent = formatTime(totalSessionTime);
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
      console.log('Starting background screenshot capture (startProject)...');

      const email = StorageService.getItem('userEmail');
      if (!email) {
        console.warn('startScreenshotCapture: userEmail not found in storage');
        return;
      }

      const sessionId = currentSessionId || 'temp-session';

      // Get numeric Supabase session ID separately - needed for time_session_id column
      const supabaseSessionId = StorageService.getItem('supabaseSessionId');
      let numericSupabaseSessionId = null;
      if (supabaseSessionId) {
        const parsed = parseInt(supabaseSessionId, 10);
        if (!isNaN(parsed) && isFinite(parsed)) {
          numericSupabaseSessionId = parsed;
        }
      }

      // Frappe project/task IDs – for this screen we only have project
      const frappeProjectId = selectedProjectId || StorageService.getItem('selectedProjectId') || null;
      const frappeTaskId = null;

      console.log('Screenshot capture (startProject) - sessionId:', sessionId);
      console.log('Screenshot capture (startProject) - supabaseSessionId:', numericSupabaseSessionId);
      console.log('Screenshot capture (startProject) - frappeProjectId:', frappeProjectId);

      if (!window.electronAPI || !window.electronAPI.startBackgroundScreenshots) {
        console.error('startScreenshotCapture: electronAPI.startBackgroundScreenshots not available');
        return;
      }

      window.electronAPI
        .startBackgroundScreenshots(email, sessionId, numericSupabaseSessionId, frappeProjectId, frappeTaskId)
        .then(() => {
          console.log('Background screenshot capture (startProject) started successfully');
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

    console.log('Stopping background screenshot capture (startProject)...');
    window.electronAPI
      .stopBackgroundScreenshots()
      .then(() => {
        console.log('Background screenshot capture (startProject) stopped successfully');
      })
      .catch((error) => {
        console.error('Failed to stop background screenshot capture (startProject):', error);
      });
  }

  // Start timer (Clock In) - optimized to start immediately
  async function startTimer() {
    if (isActive) return;

    // Start timer immediately for instant user feedback
    sessionStartTime = new Date();
    isActive = true;
    workStartTime = new Date();
    
    // Update UI immediately
    StorageService.setItem('sessionStartTime', sessionStartTime.toISOString());
    StorageService.setItem('isActive', 'true');
    StorageService.setItem('workStartTime', workStartTime.toISOString());

    // Update button to Clock Out (red) immediately
    clockInBtn.textContent = 'Clock Out';
    clockInBtn.classList.remove('start-project-btn-primary');
    clockInBtn.classList.add('start-project-btn-danger');
    takeBreakBtn.disabled = false;
    resumeBtn.style.display = 'none';

    updateTimerStateInMainProcess(true);
    idle2hClockOutTriggered = false;
    lockSuspendClockOutTriggered = false;

    // Start idle tracking immediately
    if (idleTracker) {
      idleTracker.startTracking();
    }

    // Start timer interval immediately
    if (!timerInterval) {
      timerInterval = setInterval(updateTimer, 1000);
    }
    updateTimer();

    // Start background screenshot capture for this clock-in
    startScreenshotCapture();

    // Now do database/API calls in the background (non-blocking)
    (async () => {
      try {
        // Get or create Frappe session
        let frappeSessionStr = StorageService.getItem('frappeSession');
        let session;

        if (!frappeSessionStr) {
          if (!selectedProjectId) {
            console.error('Project ID is required');
            return;
          }

          const timesheetData = { project: selectedProjectId };
          const timesheetResult = await window.frappe.getOrCreateTimesheet(timesheetData);
          const { timesheet, row } = timesheetResult;

          if (!timesheet || !row) {
            console.error('Failed to create timesheet');
            return;
          }

          session = {
            frappeTimesheetId: timesheet,
            frappeTimesheetRowId: row
          };

          StorageService.setItem('frappeSession', JSON.stringify(session));
          StorageService.setItem('frappeTimesheetId', session.frappeTimesheetId);
          StorageService.setItem('frappeTimesheetRowId', session.frappeTimesheetRowId);
        } else {
          session = JSON.parse(frappeSessionStr);
        }

        // Start the timesheet session (non-blocking)
        await window.frappe.startTimesheetSession({
          timesheet: session.frappeTimesheetId,
          row: session.frappeTimesheetRowId
        });

        // Create Supabase time_sessions record (non-blocking)
        try {
          if (window.supabase) {
            const startTimeISO = sessionStartTime.toISOString();
            const today = new Date().toISOString().split('T')[0];

            // Get company in parallel with other operations
            let company = null;
            const companyPromise = window.auth.getUserCompany(userEmail).catch(err => {
              console.warn('Error getting company:', err);
              return null;
            });

            const sessionData = {
              user_email: userEmail,
              start_time: startTimeISO,
              end_time: null,
              break_duration: 0,
              active_duration: 0,
              idle_duration: 0,
              break_count: 0,
              total_duration: 0,
              session_date: today,
              frappe_timesheet_id: session.frappeTimesheetId,
              frappe_project_id: selectedProjectId || null,
              frappe_task_id: null
            };

            // Try to get company, but don't wait too long
            try {
              const companyResult = await Promise.race([
                companyPromise,
                new Promise(resolve => setTimeout(() => resolve(null), 1000)) // 1 second timeout
              ]);
              if (companyResult && companyResult.success) {
                company = companyResult.company;
                sessionData.company = company;
              }
            } catch (companyError) {
              console.warn('Error getting company:', companyError);
            }

            const { data: supabaseSession, error: sessionError } = await window.supabase
              .from('time_sessions')
              .insert([sessionData])
              .select('id')
              .single();

            if (sessionError) {
              console.error('Error creating Supabase session:', sessionError);
            } else if (supabaseSession) {
              const numericSessionId = supabaseSession.id;
              StorageService.setItem('supabaseSessionId', numericSessionId.toString());
              currentSessionId = numericSessionId;
              console.log('Created Supabase session with ID:', numericSessionId);

              // Update background screenshot capture with the numeric session ID
              // This ensures all future screenshots have the correct time_session_id
              if (window.electronAPI && window.electronAPI.updateBackgroundScreenshotSessionId) {
                window.electronAPI
                  .updateBackgroundScreenshotSessionId(numericSessionId)
                  .catch(err => console.warn('Failed to update background screenshot session ID (startProject):', err));
              }
            }
          }
        } catch (supabaseError) {
          console.error('Error creating Supabase session:', supabaseError);
        }
      } catch (error) {
        console.error('Error in background timer setup:', error);
        // Timer is already running, so we just log the error
      }
    })();
  }

  // Stop timer (Clock Out)
  async function clockOut({ auto = false, reason = null } = {}) {
    const wasActive = isActive;
    const wasOnBreak = isOnBreak;
    const previousWorkStartTime = workStartTime ? new Date(workStartTime) : null;
    const previousTotalActiveDuration = totalActiveDuration;
    const clockOutTime = new Date();

    // If user is on break, save the current break duration before clocking out
    let finalBreakDuration = totalBreakDuration;
    if (wasOnBreak && breakStartTime) {
      const breakElapsed = Math.floor((clockOutTime - new Date(breakStartTime)) / 1000);
      if (breakElapsed > 0) {
        finalBreakDuration += breakElapsed;
        breakCount++; // Count this break
      }
    }

    let finalActiveDuration = totalActiveDuration;
    if (wasActive && !wasOnBreak && !isIdle && previousWorkStartTime) {
      const workElapsed = Math.floor((clockOutTime - previousWorkStartTime) / 1000);
      if (workElapsed > 0) {
        finalActiveDuration += workElapsed;
      }
    }

    clearInterval(timerInterval);
    timerInterval = null;

    // Stop background screenshot capture when clocking out
    stopScreenshotCapture();

    // Stop idle tracking
    if (idleTracker) {
      idleTracker.stopTracking();
    }

    isActive = false;
    StorageService.setItem('isActive', 'false');
    isIdle = false;
    StorageService.setItem('isIdle', 'false');
    workStartTime = null;
    StorageService.removeItem('workStartTime');
    idleStartTime = null;
    StorageService.removeItem('idleStartTime');

    updateTimerStateInMainProcess(false);

    const shouldProceed = true; // Always proceed without confirmation

    if (shouldProceed) {
      try {
        const sessionStart = sessionStartTime instanceof Date ? sessionStartTime : new Date(sessionStartTime);
        const sessionDuration = sessionStart ? Math.floor((clockOutTime - sessionStart) / 1000) : 0;

        const finalIdleTime = idleTracker ? idleTracker.getTotalIdleTime() : totalIdleTime;
        const totalSessionDurationSeconds = finalActiveDuration + finalBreakDuration + finalIdleTime;

        // Save session to database
        // Use totalSessionDurationSeconds (sum of components) instead of sessionDuration (elapsed time)
        await saveSession(totalSessionDurationSeconds, finalBreakDuration, finalActiveDuration, finalIdleTime, breakCount);

        // Clear session data
        StorageService.removeItem('sessionStartTime');
        StorageService.removeItem('currentSessionId');
        StorageService.removeItem('supabaseSessionId');
        StorageService.removeItem('frappeSession');
        StorageService.removeItem('frappeTimesheetId');
        StorageService.removeItem('frappeTimesheetRowId');
        StorageService.removeItem('workStartTime');
        StorageService.removeItem('isActive');
        StorageService.removeItem('isOnBreak');
        StorageService.removeItem('breakDuration');
        StorageService.removeItem('activeDuration');
        StorageService.removeItem('breakCount');
        StorageService.removeItem('totalIdleTime');
        StorageService.removeItem('isIdle');
        StorageService.removeItem('idleStartTime');

        // Reset idle tracker
        if (idleTracker) {
          idleTracker.destroy();
          idleTracker = null;
        }
        totalIdleTime = 0;

        // Reset buttons
        clockInBtn.textContent = 'Clock In';
        clockInBtn.classList.remove('start-project-btn-danger');
        clockInBtn.classList.add('start-project-btn-primary');
        resumeBtn.style.display = 'none';
        takeBreakBtn.style.display = 'inline-flex';
        takeBreakBtn.disabled = true;

        // Reset timer display
        timeDisplay.textContent = '00:00:00';

        // Session ended silently
        // Only navigate if not auto clock out (window close)
        if (!auto) {
          window.location.href = 'projects.html';
        }
      } catch (error) {
        console.error('Error during clock out:', error);
        alert('Error ending session. Please try again.');
      }
    } else {
      // User cancelled - restore state
      totalActiveDuration = previousTotalActiveDuration;
      StorageService.setItem('activeDuration', previousTotalActiveDuration.toString());
      isActive = wasActive;
      StorageService.setItem('isActive', wasActive ? 'true' : 'false');
      if (wasActive) {
        if (previousWorkStartTime && !wasIdle) {
          workStartTime = previousWorkStartTime;
          StorageService.setItem('workStartTime', previousWorkStartTime.toISOString());
        }
        updateTimerStateInMainProcess(true);
        timerInterval = setInterval(updateTimer, 1000);
        if (idleTracker) {
          idleTracker.startTracking();
        }
      }
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
              return row && row.from_time != null && row.to_time == null && row.completed == 0;
            });

            if (!activeRow) {
              throw new Error('No active time log found');
            }

            const serverNow = await window.frappe.getFrappeServerTime();
            
            if (activeRow.hasOwnProperty('hours')) {
              delete activeRow.hours;
            }
            
            activeRow.to_time = serverNow;
            activeRow.completed = 1;

            if (!activeRow.doctype) {
              activeRow.doctype = 'Timesheet Detail';
            }

            await window.frappe.saveTimesheetWithSavedocs(timesheet);
            console.log(`Successfully saved timesheet ${session.frappeTimesheetId}`);
          }
        } catch (frappeError) {
          console.error('Error updating Frappe timesheet:', frappeError);
          NotificationService.showError(`Failed to update Frappe timesheet: ${frappeError.message || 'Unknown error'}`);
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
          .eq('id', supabaseSessionId);

        if (updateError) {
          console.error('Error updating Supabase session:', updateError);
          throw new Error(`Failed to update session: ${updateError.message}`);
        }

        console.log('Successfully updated Supabase session');
      }
    } catch (error) {
      console.error('Error saving session:', error);
      throw error;
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
  }

  // Restore session state on page load
  function restoreSession() {
    // Don't restore sessions - if the app was closed, the session should have been clocked out
    // This prevents the timer from continuing in the background after app close
    const storedSessionStartTime = StorageService.getItem('sessionStartTime');
    const storedIsActive = StorageService.getItem('isActive') === 'true';
    
    // If there's a stored active session, clear it (app was closed, so session should be ended)
    if (storedSessionStartTime && storedIsActive) {
      console.log('Clearing session state from previous app session (app was closed)');
      // Clear all session-related storage
      StorageService.removeItem('sessionStartTime');
      StorageService.removeItem('isActive');
      StorageService.removeItem('workStartTime');
      StorageService.removeItem('isOnBreak');
      StorageService.removeItem('breakStartTime');
      StorageService.removeItem('breakDuration');
      StorageService.removeItem('activeDuration');
      StorageService.removeItem('breakCount');
      StorageService.removeItem('totalIdleTime');
      StorageService.removeItem('isIdle');
      StorageService.removeItem('idleStartTime');
      StorageService.removeItem('frappeSession');
      StorageService.removeItem('frappeTimesheetId');
      StorageService.removeItem('frappeTimesheetRowId');
      StorageService.removeItem('supabaseSessionId');
      StorageService.removeItem('currentSessionId');
    }
    
    // Reset all state variables
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
    
    // Ensure UI is in initial state
    clockInBtn.textContent = 'Clock In';
    clockInBtn.classList.remove('start-project-btn-danger', 'start-project-btn-danger-transparent');
    clockInBtn.classList.add('start-project-btn-primary');
    takeBreakBtn.disabled = true;
    resumeBtn.style.display = 'none';
    takeBreakBtn.style.display = 'inline-flex';
    timeDisplay.textContent = '00:00:00';
  }

  // Event listeners
  backBtn.addEventListener('click', () => {
    window.location.href = 'projects.html';
  });

  clockInBtn.addEventListener('click', () => {
    if (isActive) {
      clockOut();
    } else {
      startTimer();
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

    console.log('Opening reports site:', targetUrl);
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
  restoreSession();

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
    if (idleTracker) {
      idleTracker.destroy();
      idleTracker = null;
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && isActive && sessionStartTime) {
      // Don't save on visibility change; beforeunload handles save
    }
    if (document.visibilityState === 'visible' && sessionStartTime && typeof runIdleAutoClockOutCheck === 'function') {
      runIdleAutoClockOutCheck();
    }
  });
  window.addEventListener('focus', () => {
    if (!sessionStartTime || typeof runIdleAutoClockOutCheck !== 'function') return;
    runIdleAutoClockOutCheck();
  });

  // Clock out when laptop lid is closed (lock-screen) or system suspends
  if (window.electronAPI && window.electronAPI.onLockOrSuspendClockOut) {
    window.electronAPI.onLockOrSuspendClockOut((data) => {
      const reason = data?.reason || 'lock_screen';
      if (!sessionStartTime || !isActive || lockSuspendClockOutTriggered) return;
      lockSuspendClockOutTriggered = true;
      console.log(`Clock out on ${reason} (lid closed / system suspend)`);
      clockOut({ auto: true, reason }).catch((err) => {
        console.error('Lock/suspend clock out failed:', err);
      });
    });
  }
});
