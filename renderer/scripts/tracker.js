document.addEventListener('DOMContentLoaded', () => {
  let timerInterval;
  let sessionStartTime;
  let currentSessionId; // Store the database session ID
  let workStartTime; // Track when user actually starts working
  let isActive = false;
  let isOnBreak = false;
  let breakStartTime;
  let totalBreakDuration = 0;
  let totalActiveDuration = 0;
  let breakCount = 0; // Track number of individual breaks taken
  let screenshotInterval;
  let activityChart = null; // Store chart instance for updates
  let projectChart = null; // Store project chart instance for updates
  let idleTracker = null; // Idle time tracker instance
  let totalIdleTime = 0; // Total idle time accumulated
  let isIdle = false; // Track idle state
  let idleStartTime = null;
  let userEmail = null;
  let removeSystemIdleListener = null;

  // DOM elements
  const activeTimeDisplay = document.getElementById('activeTimeDisplay');
  const breakTimeDisplay = document.getElementById('breakTimeDisplay');
  const totalTimeDisplay = document.getElementById('totalTimeDisplay');
  const idleTimeDisplay = document.getElementById('idleTimeDisplay');
  const startBtn = document.getElementById('startBtn');
  const breakBtn = document.getElementById('breakBtn');
  const clockOutBtn = document.getElementById('clockOutBtn');
  const totalTimeToday = document.getElementById('totalTimeToday');
  const breaksTaken = document.getElementById('breaksTaken');
  const currentSession = document.getElementById('currentSession');
  const reportBtn = document.getElementById('reportBtn');
  const homeBtn = document.getElementById('homeBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const projectNameSection = document.getElementById('projectNameSection');
  const projectNameDisplay = document.getElementById('projectNameDisplay');
  const projectTimeSection = document.getElementById('projectTimeSection');
  const projectTimeList = document.getElementById('projectTimeList');
  
  let projectTimeData = new Map(); // Store project times: projectId -> {name, time, currentSessionTime}


    // 🔥 Force-stop timer from main process (logout / remote logout / safety reset)
    if (window.electronAPI && window.electronAPI.onForceStopTimer) {
      window.electronAPI.onForceStopTimer(() => {
        console.warn('Force-stopping timer from main process');
  
        StorageService.removeItem('isActive');
        StorageService.removeItem('currentSessionId');
        StorageService.removeItem('sessionStartTime');
        StorageService.removeItem('workStartTime');
        StorageService.removeItem('breakStartTime');
        StorageService.removeItem('idleStartTime');
  
        stopScreenshotCapture();
  
        // Reset in-memory flags
        isActive = false;
        isOnBreak = false;
        isIdle = false;
      });
    }
  
  // Initialize
  init();

  // Helper function to update timer state in main process
  function updateTimerStateInMainProcess(active) {
    if (window.electronAPI && window.electronAPI.setTimerActive) {
      window.electronAPI.setTimerActive(active).catch(err => {
        console.error('Error updating timer state in main process:', err);
      });
    }
  }

  function init() {
    // 🔐 Safety: never auto-restore timer after logout
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

    const email = StorageService.getItem('userEmail');
    if (!email) {
      alert('No user email found. Please login again.');
      window.location.href = 'login.html';
      return;
    }
    userEmail = email;

    if (window.SessionSync) {
      window.SessionSync.setEmail(email);
      window.SessionSync.updateAppState(true);
    }

    // Load session data
    sessionStartTime = StorageService.getItem('sessionStartTime');
    // IMPORTANT: Always prefer Frappe timesheet ID over Supabase session ID
    // Frappe timesheet IDs are like "TS-2025-00043" and should be used for storage paths
    // Supabase session IDs are numeric (e.g., "37") and are only for internal tracking
    const frappeTimesheetId = StorageService.getItem('frappeTimesheetId');
    const supabaseSessionId = StorageService.getItem('supabaseSessionId');
    // Use Frappe timesheet ID if available, otherwise fall back to Supabase session ID
    // This ensures we use Frappe ID for screenshots when available
    currentSessionId = frappeTimesheetId || supabaseSessionId;
    workStartTime = StorageService.getItem('workStartTime');
    isActive = StorageService.getItem('isActive') === 'true';
    isOnBreak = StorageService.getItem('isOnBreak') === 'true';
    breakStartTime = StorageService.getItem('breakStartTime'); // Restore break start time
    totalBreakDuration = parseInt(StorageService.getItem('breakDuration') || '0');
    totalActiveDuration = parseInt(StorageService.getItem('activeDuration') || '0');
    breakCount = parseInt(StorageService.getItem('breakCount') || '0');
    totalIdleTime = parseInt(StorageService.getItem('totalIdleTime') || '0');
    isIdle = StorageService.getItem('isIdle') === 'true';
    idleStartTime = StorageService.getItem('idleStartTime');

    // Convert string dates back to Date objects
    if (sessionStartTime) {
      sessionStartTime = new Date(sessionStartTime);
      console.log('Restored session start time:', sessionStartTime);
    }

    if (workStartTime) {
      workStartTime = new Date(workStartTime);
      console.log('Restored work start time:', workStartTime);
    }

    if (breakStartTime) {
      breakStartTime = new Date(breakStartTime);
      console.log('Restored break start time:', breakStartTime);
    }

    if (idleStartTime) {
      idleStartTime = new Date(idleStartTime);
      console.log('Restored idle start time:', idleStartTime);
    }

    if (sessionStartTime) {
      updateTimer();
      if (isActive) {
        // Notify main process that timer is active
        updateTimerStateInMainProcess(true);
        
        if (isOnBreak) {
          // Resume break state
          breakBtn.textContent = 'End Break';
          breakBtn.className = 'btn-success';
          breakBtn.disabled = false;
          startBtn.disabled = true;
          // Don't start screenshot capture during break
        } else {
          // Don't automatically start timer - user must click Start button
          startBtn.disabled = true; // Keep disabled if work was previously started
        }
        
        // Show notification that timer was restored from background
        NotificationService.showInfo('Timer restored from background. Your session is still active.');
        
        if (isIdle) {
          console.log('Session restored while idle; active timer paused.');
        }

        // Restore screenshot capture if it should be active
        const screenshotCaptureActive = StorageService.getItem('screenshotCaptureActive') === 'true';
        if (screenshotCaptureActive) {
          console.log('Restoring screenshot capture from background');
          startScreenshotCapture();
        }
      } else {
        // Notify main process that timer is not active
        updateTimerStateInMainProcess(false);
      }
    }

    loadTodayStats();
    updateActivityChart();
    
    // Load project distribution chart for freelancers
    const userCategory = StorageService.getItem('userCategory');
    if (userCategory === 'Freelancer') {
      loadProjectDistributionChart();
      loadProjectName();
      loadProjectTimes();
      // Update project times every 5 seconds
      setInterval(updateProjectTimes, 5000);
    }
    
    // Initialize idle tracker
    initializeIdleTracker();
    
    // Setup screenshot capture notification listener
    setupScreenshotNotificationListener();

    if (window.electronAPI && typeof window.electronAPI.onSystemIdleState === 'function') {
      removeSystemIdleListener = window.electronAPI.onSystemIdleState(({ idle }) => {
        if (idleTracker) {
          idleTracker.handleExternalIdleState(Boolean(idle));
        }
      });
    }
  }

  function initializeIdleTracker() {
    // Destroy old instance if it exists to prevent memory leaks
    if (idleTracker) {
      idleTracker.destroy();
      idleTracker = null;
    }

    // Initialize idle tracker with 30-second threshold
    idleTracker = new IdleTracker({
      idleThreshold: 30, // 30 seconds of inactivity
      checkInterval: 1000, // Check every second
      onIdleStart: () => {
        console.log('🔴 User became idle - red dot will appear on next screenshot');
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
        // Notify main process that user is idle
        if (window.electronAPI && window.electronAPI.updateIdleState) {
          console.log('Sending idle state to main process: true');
          window.electronAPI.updateIdleState(true);
        } else {
          console.error('updateIdleState API not available');
        }
      },
      onIdleEnd: (idleDuration) => {
        console.log(`🟢 User became active after ${idleDuration.toFixed(1)}s idle time`);
        totalIdleTime += idleDuration;
        StorageService.setItem('totalIdleTime', totalIdleTime.toString());
        isIdle = false;
        StorageService.setItem('isIdle', 'false');
        StorageService.removeItem('idleStartTime');

        // 🔁 Auto clock-out if the user was idle continuously for 2 hours or more
        // 7200 seconds = 2 hours
        if (idleDuration >= 7200 && isActive && !isOnBreak) {
          console.log('Auto clocking out due to 2 hours of continuous idle time');
          // Fire-and-forget; clockOut will handle saving to DB and Frappe
          clockOut({ auto: true, reason: 'idle_2h' }).catch(err => {
            console.error('Failed to auto clock out after long idle:', err);
          });
          return;
        }

        if (isActive && !isOnBreak) {
          workStartTime = new Date();
          StorageService.setItem('workStartTime', workStartTime.toISOString());
        }
        // Notify main process that user is active again
        if (window.electronAPI && window.electronAPI.updateIdleState) {
          console.log('Sending idle state to main process: false');
          window.electronAPI.updateIdleState(false);
        }
      },
      onIdleTimeUpdate: (totalIdle) => {
        // Update idle time display
        idleTimeDisplay.textContent = formatTime(totalIdle);
      }
    });

    // Restore idle time from storage
    totalIdleTime = parseInt(StorageService.getItem('totalIdleTime') || '0');
    idleTimeDisplay.textContent = formatTime(totalIdleTime);
  }

  async function startTimer() {
    if (!isActive) {
      try {
        // Get or create Frappe session data
        let frappeSessionStr = StorageService.getItem('frappeSession');
        let session;

        if (!frappeSessionStr) {
          // Timesheet doesn't exist yet - create it now
          console.log('[TRACKER] No Frappe session found, creating timesheet...');
          
          const userEmail = StorageService.getItem('userEmail');
          const projectId = StorageService.getItem('selectedProjectId');
          let taskId = StorageService.getItem('selectedTaskId'); // Optional

          if (!userEmail || !projectId) {
            const errorMsg = `Missing user or project information - userEmail: ${userEmail || 'MISSING'}, projectId: ${projectId || 'MISSING'}`;
            console.error('[TRACKER] Validation failed:', errorMsg);
            throw new Error(errorMsg);
          }

          // Ensure taskId is not empty string (treat empty as no task selected)
          if (taskId === '' || taskId === null || taskId === undefined) {
            taskId = null;
            StorageService.removeItem('selectedTaskId'); // Clean up if it's empty
            console.log('[TRACKER] TaskId was empty/null, set to null and removed from storage');
          }

          // Task is optional - only include it if provided
          const timesheetData = {
            project: projectId,
          };
          if (taskId) {
            timesheetData.task = taskId;
          }

          console.log('[TRACKER] Prepared timesheet data:', JSON.stringify(timesheetData, null, 2));
          console.log('[TRACKER] Calling window.frappe.getOrCreateTimesheet...');

          // Get or create timesheet for this project (one timesheet per project)
          const getOrCreateStartTime = Date.now();
          let timesheetResult;
          try {
            timesheetResult = await window.frappe.getOrCreateTimesheet(timesheetData);
            const getOrCreateDuration = Date.now() - getOrCreateStartTime;
            console.log('[TRACKER] getOrCreateTimesheet completed in', getOrCreateDuration, 'ms');
            console.log('[TRACKER] Raw response:', JSON.stringify(timesheetResult, null, 2));
          } catch (getOrCreateErr) {
            const getOrCreateDuration = Date.now() - getOrCreateStartTime;
            console.error('[TRACKER] getOrCreateTimesheet FAILED after', getOrCreateDuration, 'ms');
            console.error('[TRACKER] Error type:', getOrCreateErr?.constructor?.name);
            console.error('[TRACKER] Error message:', getOrCreateErr?.message);
            console.error('[TRACKER] Error stack:', getOrCreateErr?.stack);
            if (getOrCreateErr?.response) {
              console.error('[TRACKER] Error response status:', getOrCreateErr.response.status);
              console.error('[TRACKER] Error response data:', JSON.stringify(getOrCreateErr.response.data, null, 2));
            }
            throw getOrCreateErr;
          }

          const { timesheet, row } = timesheetResult;
          console.log('[TRACKER] Extracted values:', {
            timesheet: timesheet,
            timesheetType: typeof timesheet,
            row: row,
            rowType: typeof row
          });

          if (!timesheet) {
            const errorMsg = 'Invalid timesheet response from server - timesheet is missing or falsy';
            console.error('[TRACKER]', errorMsg);
            console.error('[TRACKER] Full response object:', JSON.stringify(timesheetResult, null, 2));
            throw new Error(errorMsg);
          }

          if (!row) {
            const errorMsg = 'Invalid timesheet row response from server - row is missing or falsy';
            console.error('[TRACKER]', errorMsg);
            console.error('[TRACKER] Full response object:', JSON.stringify(timesheetResult, null, 2));
            throw new Error(errorMsg);
          }

          // Store in clearly named variables
          const frappeTimesheetId = timesheet;
          const frappeTimesheetRowId = row;

          console.log('[TRACKER] Timesheet creation successful:', { 
            frappeTimesheetId, 
            frappeTimesheetRowId
          });

          // Store for later (start / stop / update)
          const currentSession = {
            frappeTimesheetId,
            frappeTimesheetRowId
          };
          const sessionJson = JSON.stringify(currentSession);
          console.log('[TRACKER] Storing session data:', sessionJson);
          
          StorageService.setItem('frappeSession', sessionJson);

          // Also store IDs individually for backward compatibility
          StorageService.setItem('frappeTimesheetId', frappeTimesheetId);
          StorageService.setItem('frappeTimesheetRowId', frappeTimesheetRowId);
          console.log('[TRACKER] Stored individual IDs to storage');

          session = currentSession;
        } else {
          // Session exists - parse it
          session = JSON.parse(frappeSessionStr);
          console.log('[TRACKER] Parsed existing Frappe session:', JSON.stringify(session, null, 2));
          
          if (!session.frappeTimesheetId || !session.frappeTimesheetRowId) {
            const errorMsg = `Invalid Frappe session data. - frappeTimesheetId: ${session.frappeTimesheetId || 'MISSING'}, frappeTimesheetRowId: ${session.frappeTimesheetRowId || 'MISSING'}`;
            console.error('[TRACKER] Validation failed:', errorMsg);
            throw new Error(errorMsg);
          }
        }

        console.log('[TRACKER] Validation passed, starting timesheet session');
        console.log('[TRACKER] Calling window.frappe.startTimesheetSession with:', {
          timesheet: session.frappeTimesheetId,
          row: session.frappeTimesheetRowId
        });

        // Start the timesheet session
        const startSessionStartTime = Date.now();
        try {
          const startSessionResult = await window.frappe.startTimesheetSession({
            timesheet: session.frappeTimesheetId,
            row: session.frappeTimesheetRowId
          });
          const startSessionDuration = Date.now() - startSessionStartTime;
          console.log('[TRACKER] startTimesheetSession completed in', startSessionDuration, 'ms');
          console.log('[TRACKER] startTimesheetSession result:', JSON.stringify(startSessionResult, null, 2));
        } catch (startSessionErr) {
          const startSessionDuration = Date.now() - startSessionStartTime;
          console.error('[TRACKER] startTimesheetSession FAILED after', startSessionDuration, 'ms');
          console.error('[TRACKER] Error type:', startSessionErr?.constructor?.name);
          console.error('[TRACKER] Error message:', startSessionErr?.message);
          console.error('[TRACKER] Error stack:', startSessionErr?.stack);
          if (startSessionErr?.response) {
            console.error('[TRACKER] Error response status:', startSessionErr.response.status);
            console.error('[TRACKER] Error response data:', JSON.stringify(startSessionErr.response.data, null, 2));
          }
          throw startSessionErr;
        }

        // Set session start time (as Date object for timer calculations)
        sessionStartTime = new Date();
        StorageService.setItem('sessionStartTime', sessionStartTime.toISOString());

        // Create Supabase time_sessions record now that tracking is actually starting
        // This ensures we only create the record when user actually starts tracking
        try {
          if (window.supabase) {
            const startTimeISO = sessionStartTime.toISOString();
            const today = new Date().toISOString().split('T')[0];
            const selectedProjectId = StorageService.getItem('selectedProjectId');
            const selectedTaskId = StorageService.getItem('selectedTaskId');

            // Get company for the user
            let company = null;
            try {
              const companyResult = await window.auth.getUserCompany(userEmail);
              if (companyResult && companyResult.success) {
                company = companyResult.company;
              }
            } catch (companyError) {
              console.warn('Error getting company for user:', companyError);
              // Continue without company - non-fatal
            }

            const sessionData = {
              user_email: userEmail,
              start_time: startTimeISO,
              end_time: null,
              break_duration: 0,
              active_duration: 0,
              idle_duration: 0,
              break_count: 0,
              total_duration: 0, // Will be updated when session ends
              session_date: today,
              frappe_timesheet_id: session.frappeTimesheetId,
              frappe_project_id: selectedProjectId || null,
              frappe_task_id: (selectedTaskId && selectedTaskId !== '' && selectedTaskId !== null) ? selectedTaskId : null,
              company: company
            };

            const { data: supabaseSession, error: sessionError } = await window.supabase
              .from('time_sessions')
              .insert([sessionData])
              .select('id')
              .single();

            if (sessionError) {
              console.error('Error creating Supabase session:', sessionError);
              console.error('Session data that failed to insert:', JSON.stringify(sessionData, null, 2));
              console.error('Error details:', JSON.stringify(sessionError, null, 2));
              // Non-fatal - continue with timer start, but log the error
              NotificationService.showWarning('Session record creation failed. Timer started, but data may not appear in reports.');
            } else if (supabaseSession) {
              // Store the Supabase session ID for later updates
              const numericSessionId = supabaseSession.id;
              StorageService.setItem('supabaseSessionId', numericSessionId.toString());
              console.log('Created Supabase session with ID:', numericSessionId);
              
              // Update background screenshot capture with the numeric session ID
              // This ensures all future screenshots have the correct time_session_id
              if (window.electronAPI && window.electronAPI.updateBackgroundScreenshotSessionId) {
                window.electronAPI.updateBackgroundScreenshotSessionId(numericSessionId)
                  .catch(err => console.warn('Failed to update background screenshot session ID:', err));
              }
            }
          }
        } catch (supabaseError) {
          console.error('Error creating Supabase session record:', supabaseError);
          // Non-fatal - continue with timer start
          NotificationService.showWarning('Session record creation failed. Timer started, but data may not appear in reports.');
        }

        isActive = true;
        workStartTime = new Date().toISOString();
        StorageService.setItem('isActive', 'true');
        StorageService.setItem('workStartTime', workStartTime);
        if (isIdle) {
          isIdle = false;
          StorageService.setItem('isIdle', 'false');
          StorageService.removeItem('idleStartTime');
        }
        startBtn.disabled = true;
        breakBtn.disabled = false;
        
        // Notify main process that timer is active
        updateTimerStateInMainProcess(true);
        
        // Start idle tracking when work begins
        if (idleTracker) {
          idleTracker.startTracking();
        }
        
        // Start background screenshot capture immediately (first screenshot at 0 seconds)
        startScreenshotCapture();

        // Start the timer interval to update the display every second
        if (!timerInterval) {
          timerInterval = setInterval(updateTimer, 1000);
        }

        // Update timer immediately to show initial state
        updateTimer();
      } catch (error) {
        console.error('Error starting timer:', error);
        NotificationService.showError(error.message || 'Failed to start timer');
      }
    }
  }

  function pauseTimer() {
    if (isActive) {
      isActive = false;
      StorageService.setItem('isActive', 'false');
      StorageService.removeItem('workStartTime');
      isIdle = false;
      StorageService.setItem('isIdle', 'false');
      StorageService.removeItem('idleStartTime');
      startBtn.textContent = 'Start';
      startBtn.disabled = false;
      breakBtn.disabled = true;
      
      // Stop idle tracking when work is paused
      if (idleTracker) {
        idleTracker.stopTracking();
      }
      
      // Stop screenshot capture
      stopScreenshotCapture();
    }
  }

  function takeBreak() {
    if (isActive && !isOnBreak) {
      // Start break - save current active time
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
      StorageService.setItem('breakStartTime', breakStartTime.toISOString()); // Save break start time as ISO string
      breakBtn.textContent = 'End Break';
      breakBtn.className = 'btn-success';
      
      // Stop screenshot capture and idle tracking during break
      stopScreenshotCapture();
      if (idleTracker) {
        idleTracker.stopTracking();
      }
    } else if (isOnBreak) {
      // End break
      const breakDuration = Math.floor((new Date() - breakStartTime) / 1000);
      totalBreakDuration += breakDuration;
      breakCount++; // Increment break count
      StorageService.setItem('breakDuration', totalBreakDuration.toString());
      StorageService.setItem('breakCount', breakCount.toString());
      
      isOnBreak = false;
      StorageService.setItem('isOnBreak', 'false');
      StorageService.removeItem('breakStartTime'); // Clear break start time
      isIdle = false;
      StorageService.setItem('isIdle', 'false');
      StorageService.removeItem('idleStartTime');
      breakBtn.textContent = 'Take Break';
      breakBtn.className = 'btn-warning';
      breakBtn.disabled = false;
      // Keep start button disabled for the entire session
      
      // Resume screenshot capture, idle tracking, and reset work start time
      workStartTime = new Date().toISOString();
      StorageService.setItem('workStartTime', workStartTime);
      // Take an immediate screenshot on resume so short post-break segments are captured
      captureScreenshot();
      startScreenshotCapture();
      
      // Resume idle tracking
      if (idleTracker) {
        idleTracker.startTracking();
      }
      
      // Update breaks counter immediately
      breaksTaken.textContent = breakCount;
      loadTodayStats();
    }
  }

  /**
   * End the current tracking session.
   * 
   * @param {Object} [options]
   * @param {boolean} [options.auto=false] - If true, skip confirmation dialog (used for auto clock-out).
   * @param {string|null} [options.reason=null] - Optional machine-readable reason (e.g. 'idle_2h').
   */
  async function clockOut({ auto = false, reason = null } = {}) {
    const wasActive = isActive;
    const wasIdle = isIdle;
    const previousWorkStartTime = workStartTime ? new Date(workStartTime) : null;
    const previousIdleStartTime = idleStartTime ? new Date(idleStartTime) : null;
    const previousTotalActiveDuration = totalActiveDuration;

    // Immediately stop timer and calculate final time when button is clicked
    // This prevents any additional time from being counted after user clicks Clock Out
    const clockOutTime = new Date();

    let finalActiveDuration = totalActiveDuration;
    if (wasActive && !isOnBreak && !wasIdle && previousWorkStartTime) {
      const workElapsed = Math.floor((clockOutTime - previousWorkStartTime) / 1000);
      if (workElapsed > 0) {
        finalActiveDuration += workElapsed;
      }
    }

    clearInterval(timerInterval);
    stopScreenshotCapture();

    // Stop idle tracking
    if (idleTracker) {
      idleTracker.stopTracking();
    }

    // Mark session as ended immediately
    isActive = false;
    StorageService.setItem('isActive', 'false');
    isIdle = false;
    StorageService.setItem('isIdle', 'false');
    workStartTime = null;
    StorageService.removeItem('workStartTime');
    idleStartTime = null;
    StorageService.removeItem('idleStartTime');

    // Notify main process that timer is not active
    updateTimerStateInMainProcess(false);
    
    const shouldProceed = auto
      ? true
      : confirm('Are you sure you want to clock out? This will end your current session.');

    if (shouldProceed) {
      try {
        const sessionStart = sessionStartTime instanceof Date ? sessionStartTime : new Date(sessionStartTime);
        const sessionDuration = sessionStart ? Math.floor((clockOutTime - sessionStart) / 1000) : 0;

        console.log('Clock out calculation details:', {
          sessionDuration,
          totalActiveDuration,
          totalBreakDuration,
          finalActiveDuration,
          wasActive,
          wasIdle,
          workStartTime: previousWorkStartTime,
          clockOutTime
        });


        // Get final idle time
        const finalIdleTime = idleTracker ? idleTracker.getTotalIdleTime() : totalIdleTime;

        // Calculate total session duration (active + break + idle)
        const totalSessionDurationSeconds = finalActiveDuration + totalBreakDuration + finalIdleTime;
        const totalSessionDurationMinutes = totalSessionDurationSeconds / 60;
        const totalSessionDurationHours = totalSessionDurationSeconds / 3600;

        console.log('📊 Total Session Duration (Time Tracker):', {
          activeDuration: `${finalActiveDuration}s (${(finalActiveDuration / 60).toFixed(2)} minutes, ${(finalActiveDuration / 3600).toFixed(4)} hours)`,
          breakDuration: `${totalBreakDuration}s (${(totalBreakDuration / 60).toFixed(2)} minutes, ${(totalBreakDuration / 3600).toFixed(4)} hours)`,
          idleDuration: `${finalIdleTime}s (${(finalIdleTime / 60).toFixed(2)} minutes, ${(finalIdleTime / 3600).toFixed(4)} hours)`,
          totalSessionSeconds: `${totalSessionDurationSeconds}s`,
          totalSessionMinutes: `${totalSessionDurationMinutes.toFixed(2)} minutes`,
          totalSessionHours: `${totalSessionDurationHours.toFixed(4)} hours`,
          formatted: formatTime(totalSessionDurationSeconds)
        });

        // Save session to database and wait for completion
        await saveSession(sessionDuration, totalBreakDuration, finalActiveDuration, finalIdleTime, breakCount);

        // Clear session data
        StorageService.removeItem('sessionStartTime');
        StorageService.removeItem('currentSessionId');
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

        totalActiveDuration = finalActiveDuration;

        // Reset idle tracker
        if (idleTracker) {
          idleTracker.destroy(); // Use destroy() instead of reset() for complete cleanup
          idleTracker = null;
        }
        totalIdleTime = 0;

        if (auto && reason === 'idle_2h') {
          alert('You have been automatically clocked out after 2 hours of inactivity. Your session has been saved.');
        } else {
          alert('Session ended successfully!');
        }
        window.location.href = 'home.html';
      } catch (error) {
        console.error('Error during clock out:', error);
        alert('Error ending session. Please try again.');
      }
    } else {
      // User cancelled - restore timer and session state
      totalActiveDuration = previousTotalActiveDuration;
      StorageService.setItem('activeDuration', previousTotalActiveDuration.toString());

      isActive = wasActive;
      StorageService.setItem('isActive', wasActive ? 'true' : 'false');

      isIdle = wasIdle;
      if (wasIdle) {
        idleStartTime = previousIdleStartTime;
        StorageService.setItem('isIdle', 'true');
        if (idleStartTime) {
          StorageService.setItem('idleStartTime', idleStartTime.toISOString());
        }
      } else {
        StorageService.setItem('isIdle', 'false');
        StorageService.removeItem('idleStartTime');
        idleStartTime = null;
      }

      if (wasActive) {
        if (previousWorkStartTime && !wasIdle) {
          workStartTime = previousWorkStartTime;
          StorageService.setItem('workStartTime', previousWorkStartTime.toISOString());
        }

        updateTimerStateInMainProcess(true);
        timerInterval = setInterval(updateTimer, 1000);

        if (previousWorkStartTime && !wasIdle && !isOnBreak) {
          startScreenshotCapture();
        }

        if (idleTracker) {
          idleTracker.startTracking();
        }
      }
    }
  }

  async function saveSession(totalDuration, breakDuration, activeDuration, idleDuration = 0, breakCountVal = 0) {
    const email = StorageService.getItem('userEmail');
    const today = new Date().toISOString().split('T')[0];
    let selectedProjectId = StorageService.getItem('selectedProjectId');

    console.warn('Skipping Supabase session lookup for Frappe timesheet ID');

    console.log('Saving session with data:', {
      currentSessionId,
      email,
      selectedProjectId,
      totalDuration,
      breakDuration,
      activeDuration,
      idleDuration,
      breakCountVal
    });

    try {
      // Update Frappe timesheet row using savedocs API
      const frappeSessionStr = StorageService.getItem('frappeSession');
      if (frappeSessionStr) {
        try {
          const session = JSON.parse(frappeSessionStr);
          if (session.frappeTimesheetId && session.frappeTimesheetRowId) {
            // 1️⃣ Fetch the full timesheet JSON - DO NOT recompute, normalize, or touch old rows
            const timesheet = await window.frappe.getTimesheetById(session.frappeTimesheetId);
            
            if (!timesheet || !timesheet.time_logs || !Array.isArray(timesheet.time_logs)) {
              throw new Error('Invalid timesheet structure - time_logs not found');
            }

            // 2️⃣ Find the single open row (active Timesheet Detail)
            // Criteria: from_time != null, to_time == null, completed == 0
            const activeRow = timesheet.time_logs.find(row => {
              return row &&
                row.from_time != null &&
                row.to_time == null &&
                row.completed == 0;
            });

            if (!activeRow) {
              throw new Error('No active time log found to close');
            }

            // 3️⃣ Get SERVER TIME from Frappe (MANDATORY - prevents timezone issues)
            const serverNow = await window.frappe.getFrappeServerTime();
            
            // Calculate hours that Frappe will compute (for logging purposes only)
            const fromTime = new Date(activeRow.from_time);
            const toTime = new Date(serverNow);
            const timeDifferenceMs = toTime - fromTime;
            const timeDifferenceSeconds = Math.floor(timeDifferenceMs / 1000);
            const timeDifferenceMinutes = timeDifferenceSeconds / 60;
            const calculatedHours = timeDifferenceMs / 3600000; // milliseconds to hours

            console.log('⏱️ Hours Calculation (for Frappe - reference only, Frappe will calculate):', {
              from_time: activeRow.from_time,
              to_time: serverNow,
              timeDifferenceMs: `${timeDifferenceMs}ms`,
              timeDifferenceSeconds: `${timeDifferenceSeconds}s`,
              timeDifferenceMinutes: `${timeDifferenceMinutes.toFixed(2)} minutes`,
              calculatedHours: `${calculatedHours.toFixed(4)} hours`,
              note: 'Frappe will calculate hours automatically via doc.calculate_hours() - this is for reference only'
            });
            
            // 4️⃣ Close the active Timesheet Detail ONLY
            // ❌ Do NOT touch from_time
            // ❌ Do NOT touch other rows
            // ❌ Do NOT create new rows
            // ❌ Do NOT send hours - let Frappe calculate it via doc.calculate_hours()
            
            // Store existing hours value for logging (before we potentially remove it)
            const existingHours = activeRow.hours;
            
            // Explicitly remove hours field to ensure we're not sending it
            // Frappe will calculate it automatically via doc.calculate_hours()
            if (activeRow.hasOwnProperty('hours')) {
              delete activeRow.hours;
            }
            
            activeRow.to_time = serverNow;
            activeRow.completed = 1;

            // Ensure doctype is set for the row (required by Frappe)
            if (!activeRow.doctype) {
              activeRow.doctype = 'Timesheet Detail';
            }
            
            console.log('Closing active row with server time:', {
              rowId: activeRow.name,
              from_time: activeRow.from_time,
              to_time: activeRow.to_time,
              completed: activeRow.completed,
              serverTime: serverNow,
              removedHours: existingHours !== undefined ? existingHours : 'was not set',
              note: 'hours field removed from payload - Frappe will calculate it automatically'
            });
            
            // Log what we're sending in the payload (for debugging)
            console.log('📤 Payload being sent to Frappe savedocs:', {
              activeRowFields: {
                name: activeRow.name,
                doctype: activeRow.doctype,
                from_time: activeRow.from_time,
                to_time: activeRow.to_time,
                completed: activeRow.completed,
                hours: activeRow.hours !== undefined ? activeRow.hours : 'REMOVED (not sent)',
                project: activeRow.project,
                activity_type: activeRow.activity_type
              },
              note: 'hours field explicitly removed - Frappe will calculate it via doc.calculate_hours()'
            });
            
            // 5️⃣ HARD GUARD: Validate all rows before saving (prevents 417 errors)
            for (const row of timesheet.time_logs) {
              if (row.from_time && row.to_time) {
                const rowFromTime = new Date(row.from_time);
                const rowToTime = new Date(row.to_time);
                if (rowToTime < rowFromTime) {
                  throw new Error(
                    `Invalid row ${row.name || 'unnamed'}: to_time (${row.to_time}) < from_time (${row.from_time}). This indicates a timezone mismatch.`
                  );
                }
              }
            }

            // Log the full timesheet structure before saving (for debugging)
            console.log('Timesheet document before save:', {
              name: timesheet.name,
              doctype: timesheet.doctype,
              time_logs_count: timesheet.time_logs?.length,
              total_hours: timesheet.total_hours,
              employee: timesheet.employee
            });

            // 5️⃣ Save the timesheet using savedocs API (ONLY once per session)
            try {
              await window.frappe.saveTimesheetWithSavedocs(timesheet);
              console.log(`Successfully saved timesheet ${session.frappeTimesheetId} via savedocs with completed row`);
            } catch (saveError) {
              // Log detailed error information
              console.error('Error saving timesheet via savedocs:', {
                error: saveError,
                message: saveError.message,
                response: saveError.response?.data,
                timesheetId: session.frappeTimesheetId,
                rowId: session.frappeTimesheetRowId
              });
              // Re-throw to show error to user
              throw new Error(`Failed to save timesheet in Frappe: ${saveError.message || 'Unknown error'}`);
            }
          }
        } catch (frappeError) {
          console.error('Error updating Frappe timesheet via savedocs:', frappeError);
          // Show error to user instead of silently continuing
          NotificationService.showError(`Failed to update Frappe timesheet: ${frappeError.message || 'Unknown error'}`);
          // Still continue with Supabase update as fallback
        }
      }

      // Check if we have a Supabase session ID (integer) or Frappe timesheet ID (string)
      const supabaseSessionId = StorageService.getItem('supabaseSessionId');
      const frappeTimesheetId = StorageService.getItem('frappeTimesheetId');
      
      // Prefer Supabase session ID for updates (it's an integer)
      // If currentSessionId is a number, use it; otherwise use supabaseSessionId
      const sessionIdToUpdate = supabaseSessionId || 
        (currentSessionId && !isNaN(parseInt(currentSessionId)) && isFinite(parseInt(currentSessionId)) ? currentSessionId : null);
      
      if (sessionIdToUpdate) {
        // Get company for the user (in case it wasn't set initially)
        let company = null;
        try {
          const companyResult = await window.auth.getUserCompany(email);
          if (companyResult && companyResult.success) {
            company = companyResult.company;
          }
        } catch (companyError) {
          console.warn('Error getting company for user:', companyError);
          // Continue without company - non-fatal
        }

        // Update existing Supabase session
        const updateData = {
          end_time: new Date().toISOString(),
          break_duration: breakDuration,
          active_duration: activeDuration,
          idle_duration: idleDuration,
          break_count: breakCountVal,
          total_duration: totalDuration // Sum of active_duration + break_duration + idle_duration
        };

        // Add company if available
        if (company) {
          updateData.company = company;
        }

        // Add Frappe IDs if available
        if (frappeTimesheetId) {
          updateData.frappe_timesheet_id = frappeTimesheetId;
        }
        const selectedProjectId = StorageService.getItem('selectedProjectId');
        const selectedTaskId = StorageService.getItem('selectedTaskId');
        if (selectedProjectId) {
          updateData.frappe_project_id = selectedProjectId;
        }
        // Only include task ID if it's a valid non-empty value
        if (selectedTaskId && selectedTaskId !== '' && selectedTaskId !== null) {
          updateData.frappe_task_id = selectedTaskId;
        }

        console.log('Updating Supabase session with data:', updateData);

        const { data, error } = await window.supabase
          .from('time_sessions')
          .update(updateData)
          .eq('id', parseInt(sessionIdToUpdate))
          .select();

        if (error) {
          console.error('Error updating session:', error);
          console.error('Error details:', JSON.stringify(error, null, 2));
          NotificationService.showError(`Failed to update session: ${error.message}`);
          throw new Error(`Failed to update session: ${error.message}`);
        } else {
          console.log('Session updated successfully:', data);
          if (data && data[0]) {
            console.log('Updated session includes frappe_project_id:', data[0].frappe_project_id);
            console.log('Updated session active_duration:', data[0].active_duration);
          }
        }
      } else {
        // Fallback: create new session (shouldn't happen with new flow, but handle it)
        console.warn('No Supabase session ID found, creating new session');
        const frappeTimesheetId = StorageService.getItem('frappeTimesheetId');
        const selectedProjectId = StorageService.getItem('selectedProjectId');
        const selectedTaskId = StorageService.getItem('selectedTaskId');
        
        // Get company for the user
        let company = null;
        try {
          const companyResult = await window.auth.getUserCompany(email);
          if (companyResult && companyResult.success) {
            company = companyResult.company;
          }
        } catch (companyError) {
          console.warn('Error getting company for user:', companyError);
          // Continue without company - non-fatal
        }

        const insertData = {
          user_email: email,
          start_time: sessionStartTime ? (sessionStartTime instanceof Date ? sessionStartTime.toISOString() : sessionStartTime) : new Date().toISOString(),
          end_time: new Date().toISOString(),
          break_duration: breakDuration,
          active_duration: activeDuration,
          idle_duration: idleDuration,
          break_count: breakCountVal,
          total_duration: totalDuration, // Sum of active_duration + break_duration + idle_duration
          session_date: today,
          company: company // Add company from user's Employee record
        };

        // Add Frappe IDs if available
        if (frappeTimesheetId) {
          insertData.frappe_timesheet_id = frappeTimesheetId;
        }
        if (selectedProjectId) {
          insertData.frappe_project_id = selectedProjectId;
        }
        // Only include task ID if it's a valid non-empty value
        if (selectedTaskId && selectedTaskId !== '' && selectedTaskId !== null) {
          insertData.frappe_task_id = selectedTaskId;
        }

        console.log('Inserting new session with data:', insertData);

        const { data, error } = await window.supabase
          .from('time_sessions')
          .insert([insertData])
          .select()
          .single();

        if (error) {
          console.error('Error saving session:', error);
          console.error('Error details:', JSON.stringify(error, null, 2));
          NotificationService.showError(`Failed to save session: ${error.message}`);
          throw new Error(`Failed to save session: ${error.message}`);
        } else {
          console.log('Session saved successfully:', data);
          if (data) {
            console.log('Saved session includes frappe_project_id:', data.frappe_project_id);
            console.log('Saved session active_duration:', data.active_duration);
          }
        }
      }
    } catch (error) {
      console.error('Error saving session:', error);
      NotificationService.showError(`Error saving session: ${error.message || 'Unknown error'}`);
    }
  }

  async function updateTimer() {
    if (!sessionStartTime) return;

    const now = new Date();
    
    // Calculate current active time based on current state
    let currentActiveTime = totalActiveDuration;
    if (isActive && !isOnBreak && !isIdle && workStartTime) {
      // Currently working - calculate from work start time
      const workElapsed = Math.floor((now - new Date(workStartTime)) / 1000);
      currentActiveTime = totalActiveDuration + workElapsed;
    }

    // Calculate current break time if on break
    let currentBreakTime = totalBreakDuration;
    if (isOnBreak && breakStartTime) {
      // Ensure breakStartTime is a valid Date object
      const breakStart = breakStartTime instanceof Date ? breakStartTime : new Date(breakStartTime);
      if (!isNaN(breakStart.getTime())) {
        const currentBreakDuration = Math.floor((now - breakStart) / 1000);
        currentBreakTime = totalBreakDuration + currentBreakDuration;
      } else {
        console.error('Invalid breakStartTime:', breakStartTime);
        currentBreakTime = totalBreakDuration; // Fallback to accumulated break time only
      }
    }

    // Calculate total session time (active + break + idle)
    const currentIdleTime = idleTracker ? idleTracker.getTotalIdleTime() : totalIdleTime;
    const totalSessionTime = currentActiveTime + currentBreakTime + currentIdleTime;

    // 🔁 Continuous check for auto clock-out if user has been idle for 2 hours or more
    // This check runs every second while the timer is active, so it triggers immediately
    // when the threshold is reached, without waiting for user activity
    if (isActive && !isOnBreak && isIdle && idleTracker) {
      const currentIdleDuration = idleTracker.getCurrentIdleTime(); // Get current continuous idle time
      const IDLE_AUTO_CLOCKOUT_THRESHOLD = 7200; // 2 hours in seconds
      
      if (currentIdleDuration >= IDLE_AUTO_CLOCKOUT_THRESHOLD) {
        console.log(`Auto clocking out due to ${currentIdleDuration} seconds (${(currentIdleDuration / 3600).toFixed(2)} hours) of continuous idle time`);
        // Fire-and-forget; clockOut will handle saving to DB and Frappe
        clockOut({ auto: true, reason: 'idle_2h' }).catch(err => {
          console.error('Failed to auto clock out after long idle:', err);
        });
        return; // Stop updating timer since we're clocking out
      }
    }

    // Debug logging
    //console.log('updateTimer - isActive:', isActive, 'isOnBreak:', isOnBreak);
    //console.log('updateTimer - breakStartTime:', breakStartTime, 'type:', typeof breakStartTime);
    //console.log('updateTimer - totalBreakDuration:', totalBreakDuration, 'currentBreakTime:', currentBreakTime);
    //console.log('updateTimer - totalActiveDuration:', totalActiveDuration, 'currentActiveTime:', currentActiveTime);

    // Update all four displays
    activeTimeDisplay.textContent = formatTime(currentActiveTime);
    breakTimeDisplay.textContent = formatTime(currentBreakTime);
    totalTimeDisplay.textContent = formatTime(totalSessionTime);
    idleTimeDisplay.textContent = formatTime(currentIdleTime);
    
    // Update current session display to show only active time
    currentSession.textContent = formatTime(currentActiveTime);
    
    // NOTE: We DO NOT update Frappe timesheet while timer is running
    // This keeps the timesheet row truly "active" (from_time set, to_time null, completed !== 1)
    // We only save to Frappe on Clock Out via savedocs API
    
    // Update the activity chart and today's stats every 5 seconds
    if (Math.floor(Date.now() / 1000) % 5 === 0) {
      updateActivityChart();
      loadTodayStats();
      // Update project chart and times if user is freelancer
      const userCategory = StorageService.getItem('userCategory');
      if (userCategory === 'Freelancer') {
        if (typeof loadProjectDistributionChart === 'function') {
          loadProjectDistributionChart();
        }
        updateProjectTimes();
      }
    }
  }

  // REMOVED: updateTimesheetRowPeriodically function
  // We no longer update Frappe timesheet while timer is running
  // This prevents the "active row" from disappearing
  // We only save to Frappe on Clock Out via savedocs API

  async function loadTodayStats() {
    const email = StorageService.getItem('userEmail');
    const today = new Date().toISOString().split('T')[0];

    let retryCount = 0;
    const maxRetries = 3;
    let success = false;

    while (retryCount < maxRetries && !success) {
      try {
        const { data, error } = await supabase
          .from('time_sessions')
          .select('*')
          .eq('user_email', email)
          .eq('session_date', today);

        if (error) {
          console.error(`Error loading today stats (attempt ${retryCount + 1}):`, error);
          retryCount++;
          if (retryCount < maxRetries) {
            // Wait before retrying (exponential backoff)
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 1000));
            continue;
          } else {
            // After all retries failed, show fallback data
            console.warn('Failed to load today stats from database after all retries. Using local data only.');
            showFallbackStats();
            return;
          }
        }

        let totalActiveTime = 0;
        let totalBreakTime = 0;
        let breaksCount = 0;

        // Process all completed sessions for the day
        data.forEach(session => {
          // Add active duration (work time without breaks) from completed sessions
          totalActiveTime += session.active_duration || 0;
          // Add break duration from completed sessions
          totalBreakTime += session.break_duration || 0;
          
          // Use actual break count from database if available, otherwise estimate
          if (session.break_count && session.break_count > 0) {
            breaksCount += session.break_count;
            console.log(`Session ${session.id}: ${session.break_count} breaks (from database)`);
          } else if (session.break_duration > 0) {
            // Fallback to estimation if break_count not available
            const estimatedBreaks = Math.ceil(session.break_duration / 300); // 300 seconds = 5 minutes
            breaksCount += estimatedBreaks;
            console.log(`Session ${session.id}: ${session.break_duration}s break time = ~${estimatedBreaks} breaks (estimated)`);
          }
        });

        // Add current session data
        if (sessionStartTime) {
          let currentActiveTime = totalActiveDuration;
          let currentBreakTime = totalBreakDuration;
          
          // Only add current work time if user has explicitly started work AND is currently active
          // This prevents automatic time counting on login without user action
          if (isActive && !isOnBreak && !isIdle && workStartTime) {
            const now = new Date();
            const workElapsed = Math.floor((now - new Date(workStartTime)) / 1000);
            currentActiveTime = totalActiveDuration + workElapsed;
            console.log(`Adding current work time: ${workElapsed}s (total: ${currentActiveTime}s)`);
          } else if (isActive && !isOnBreak && (!workStartTime || isIdle)) {
            // User is marked as active but hasn't started work yet - don't count time
            console.log('User is active but work not started or currently idle - not counting time');
            currentActiveTime = totalActiveDuration; // Only count previously accumulated time
          }
          
          // If currently on break, add the current break time
          if (isOnBreak && breakStartTime) {
            const now = new Date();
            const currentBreakDuration = Math.floor((now - breakStartTime) / 1000);
            currentBreakTime = totalBreakDuration + currentBreakDuration;
          }
          
          totalActiveTime += currentActiveTime;
          totalBreakTime += currentBreakTime;
          
          // Add actual break count from current session (this is accurate)
          breaksCount += breakCount;
          console.log(`Current session: ${breakCount} actual breaks taken`);
        }

        totalTimeToday.textContent = formatTime(totalActiveTime);
        breaksTaken.textContent = breaksCount;
        
        const currentSessionBreaks = sessionStartTime ? breakCount : 0;
        const completedSessionBreaks = breaksCount - currentSessionBreaks;
        console.log(`Total breaks for today: ${breaksCount} (${currentSessionBreaks} from current session + ${completedSessionBreaks} from completed sessions)`);
        console.log(`Total active time today: ${formatTime(totalActiveTime)} (work time only, excluding ${formatTime(totalBreakTime)} break time)`);
        success = true;

      } catch (networkError) {
        console.error(`Network error loading today stats (attempt ${retryCount + 1}):`, networkError);
        retryCount++;
        if (retryCount < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 1000));
        } else {
          console.warn('Network error after all retries. Using fallback data.');
          showFallbackStats();
          return;
        }
      }
    }
  }

  function showFallbackStats() {
    // Show current session data when database is unavailable
    let currentActiveTime = totalActiveDuration;
    
    if (isActive && !isOnBreak && !isIdle && workStartTime) {
      const now = new Date();
      const workElapsed = Math.floor((now - new Date(workStartTime)) / 1000);
      currentActiveTime = totalActiveDuration + workElapsed;
    }
    
    totalTimeToday.textContent = formatTime(currentActiveTime);
    breaksTaken.textContent = breakCount;
    
    // Show a subtle indicator that we're in offline mode
    if (!document.getElementById('offline-indicator')) {
      const indicator = document.createElement('div');
      indicator.id = 'offline-indicator';
      indicator.style.cssText = `
        position: fixed;
        top: 10px;
        right: 10px;
        background: #f59e0b;
        color: white;
        padding: 5px 10px;
        border-radius: 4px;
        font-size: 12px;
        z-index: 1000;
      `;
      indicator.textContent = 'Offline Mode';
      document.body.appendChild(indicator);
    }
  }

  function updateActivityChart() {
    const ctx = document.getElementById('activityChart').getContext('2d');
    
    // Calculate current values for the chart
    const now = new Date();
    let currentActiveTime = totalActiveDuration;
    let currentBreakTime = totalBreakDuration;
    
    if (isActive && !isOnBreak && !isIdle && workStartTime) {
      const workElapsed = Math.floor((now - new Date(workStartTime)) / 1000);
      currentActiveTime = totalActiveDuration + workElapsed;
    }
    
    if (isOnBreak && breakStartTime) {
      const currentBreakDuration = Math.floor((now - breakStartTime) / 1000);
      currentBreakTime = totalBreakDuration + currentBreakDuration;
    }
    
    const currentIdleTime = idleTracker ? idleTracker.getTotalIdleTime() : totalIdleTime;
    
    const chartData = {
      labels: ['Active Time', 'Break Time', 'Idle Time'],
      datasets: [{
        data: [currentActiveTime, currentBreakTime, currentIdleTime],
        backgroundColor: ['#10B981', '#F59E0B', '#EF4444'],
        borderWidth: 2,
        borderColor: '#ffffff'
      }]
    };
    
    if (activityChart) {
      // Update existing chart
      activityChart.data = chartData;
      activityChart.update();
    } else {
      // Create new chart
      activityChart = new Chart(ctx, {
        type: 'doughnut',
        data: chartData,
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'bottom'
            },
            tooltip: {
              callbacks: {
                label: function(context) {
                  const label = context.label || '';
                  // For doughnut charts, use context.raw to get the actual data value (seconds)
                  const value = context.raw || 0;
                  // Format seconds to hh:mm:ss
                  const formattedTime = formatTime(value);
                  return `${label}: ${formattedTime}`;
                }
              }
            }
          }
        }
      });
    }
  }

  async function loadProjectName() {
    try {
      const selectedProjectId = StorageService.getItem('selectedProjectId');
      
      // If not in storage, try to get from current session
      let projectId = selectedProjectId;
      if (!projectId && currentSessionId) {
        return;
      }

      if (!projectId || !window.supabase) {
        if (projectNameSection) {
          projectNameSection.style.display = 'none';
        }
        return;
      }


      
    } catch (error) {
      console.error('Error in loadProjectName:', error);
      if (projectNameSection) {
        projectNameSection.style.display = 'none';
      }
    }
  }

  async function loadProjectTimes() {
    try {
      const email = StorageService.getItem('userEmail');
      const today = new Date().toISOString().split('T')[0];
      if (!email || !window.supabase) {
        return;
      }

      // ❌ Projects now come from Frappe, not Supabase
      // Supabase project_id and projects table no longer exist
      // Skip loading project times from Supabase since we're using Frappe
      console.warn('Skipping loadProjectTimes: Supabase projects not used (using Frappe)');
      
      // Reset the map
      projectTimeData.clear();

      // Now add current session time if active
      updateProjectTimes();
    } catch (error) {
      console.error('Error in loadProjectTimes:', error);
    }
  }

  function updateProjectTimes() {
    // Add current active session time to the current project
    const selectedProjectId = StorageService.getItem('selectedProjectId');
    
    if (!selectedProjectId) {
      updateProjectTimesDisplay();
      return;
    }

    const projectIdInt = parseInt(selectedProjectId);
    
    // Calculate current active time if timer is running
    let currentActiveTime = 0;
    if (isActive && !isOnBreak && !isIdle && workStartTime) {
      const now = new Date();
      const workElapsed = Math.floor((now - new Date(workStartTime)) / 1000);
      currentActiveTime = totalActiveDuration + workElapsed;
    } else if (totalActiveDuration > 0) {
      // If not currently active but has accumulated time, use that
      currentActiveTime = totalActiveDuration;
    }

    // Get project name if not already in map
    if (!projectTimeData.has(projectIdInt)) {
      // Try to get from existing session or fetch
      if (projectNameDisplay && projectNameDisplay.textContent) {
        projectTimeData.set(projectIdInt, {
          name: projectNameDisplay.textContent,
          time: 0, // No completed sessions yet
          currentSessionTime: currentActiveTime
        });
      } else {
        // Fetch project name
        loadProjectName().then(() => {
          if (projectNameDisplay && projectNameDisplay.textContent) {
            projectTimeData.set(projectIdInt, {
              name: projectNameDisplay.textContent,
              time: 0, // No completed sessions yet
              currentSessionTime: currentActiveTime
            });
            updateProjectTimesDisplay();
          }
        });
        return; // Will update display after name is loaded
      }
    } else {
      // Update existing project time
      // existing.time = sum of completed sessions for this project
      // currentActiveTime = current session's active time
      // We track them separately to avoid double counting
      const existing = projectTimeData.get(projectIdInt) || { name: '', time: 0, currentSessionTime: 0 };
      const existingTime = Number(existing.time) || 0;

      projectTimeData.set(projectIdInt, {
        name: existing.name,
        time: existingTime, // Keep completed sessions time unchanged
        currentSessionTime: currentActiveTime, // Update current session time
      });
    }
    
    updateProjectTimesDisplay();
  }

  function updateProjectTimesDisplay() {
    if (!projectTimeList || !projectTimeSection) {
      return;
    }

    // Show section only if there are projects
    if (projectTimeData.size === 0) {
      projectTimeSection.style.display = 'none';
      return;
    }

    projectTimeSection.style.display = 'block';
    projectTimeList.innerHTML = '';

    // Sort projects by total time (descending)
    const sortedProjects = Array.from(projectTimeData.entries())
      .map(([id, data]) => ({ 
        id, 
        ...data, 
        totalTime: (Number(data.time) || 0) + (Number(data.currentSessionTime) || 0) 
      }))
      .sort((a, b) => b.totalTime - a.totalTime);

    sortedProjects.forEach(project => {
      const totalTime = project.totalTime;

      const projectItem = document.createElement('div');
      projectItem.className = 'project-time-card';

      const projectNameDiv = document.createElement('div');
      projectNameDiv.className = 'project-time-card__info';

      const projectName = document.createElement('h4');
      projectName.className = 'project-time-card__title';
      projectName.textContent = project.name;

      projectNameDiv.appendChild(projectName);

      const timeDisplay = document.createElement('div');
      timeDisplay.className = 'project-time-card__time';

      const timeValue = document.createElement('span');
      timeValue.className = 'project-time-card__value';
      timeValue.textContent = formatTime(totalTime);

      timeDisplay.appendChild(timeValue);

      projectItem.appendChild(projectNameDiv);
      projectItem.appendChild(timeDisplay);
      projectTimeList.appendChild(projectItem);
    });
  }

  async function loadProjectDistributionChart() {
     // ❌ Projects now come from Frappe, not Supabase
  // Supabase project_id no longer exists in this flow

  console.warn(
    'Skipping loadProjectDistributionChart: Supabase projects not used'
  );

  return;
}

  function startScreenshotCapture() {
    console.log('Starting background screenshot capture...');
    const email = StorageService.getItem('userEmail');
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
    // Get Frappe project and task IDs from storage
    const frappeProjectId = StorageService.getItem('selectedProjectId');
    let frappeTaskId = StorageService.getItem('selectedTaskId');
    // Ensure taskId is not empty string (treat empty as no task selected)
    if (frappeTaskId === '' || frappeTaskId === null || frappeTaskId === undefined) {
      frappeTaskId = null;
    }
    
    console.log('Screenshot capture - sessionId:', sessionId);
    console.log('Screenshot capture - supabaseSessionId:', numericSupabaseSessionId);
    console.log('Screenshot capture - frappeProjectId from storage:', frappeProjectId);
    console.log('Screenshot capture - frappeTaskId from storage:', frappeTaskId);
    
    // Start background screenshot capture in main process
    window.electronAPI.startBackgroundScreenshots(email, sessionId, numericSupabaseSessionId, frappeProjectId, frappeTaskId)
      .then(() => {
        console.log('Background screenshot capture started successfully');
      })
      .catch((error) => {
        console.error('Failed to start background screenshot capture:', error);
        // Fallback to renderer-based capture
        screenshotInterval = setInterval(() => {
          console.log('Capturing screenshot (fallback)...');
          captureScreenshot();
        }, 20000);
      });
  }

  function stopScreenshotCapture() {
    console.log('Stopping screenshot capture...');
    
    // Stop background screenshot capture in main process
    window.electronAPI.stopBackgroundScreenshots()
      .then(() => {
        console.log('Background screenshot capture stopped successfully');
      })
      .catch((error) => {
        console.error('Failed to stop background screenshot capture:', error);
      });
    
    // Also stop any fallback renderer-based capture
    if (screenshotInterval) {
      clearInterval(screenshotInterval);
      screenshotInterval = null;
    }
  }

  async function captureScreenshot() {
    try {
      console.log('Attempting to capture screenshot from all screens...');
      
      // Get screenshot data from Electron API
      if (!window.electronAPI || !window.electronAPI.captureAllScreens) {
        console.error('Electron API not available');
        return;
      }
  
      // captureAllScreens() now returns { screenshots: array, error: string|null, permissionGranted: boolean }
      const result = await window.electronAPI.captureAllScreens();
      
      // Handle both old format (array) and new format (object)
      let screenshots = [];
      let errorMessage = null;
      
      if (Array.isArray(result)) {
        // Old format - backward compatibility
        screenshots = result;
      } else if (result && result.screenshots) {
        // New format
        screenshots = result.screenshots || [];
        errorMessage = result.error;
        
        if (errorMessage) {
          console.error('Screenshot capture error:', errorMessage);
          if (!result.permissionGranted) {
            console.error('⚠️ Screen recording permission not granted. Please:');
            console.error('1. Go to System Settings → Privacy & Security → Screen Recording');
            console.error('2. Find "Time Tracker" in the list');
            console.error('3. Enable the toggle');
            console.error('4. Restart the app');
          }
        }
      } else {
        screenshots = [];
      }
      
      if (!screenshots || screenshots.length === 0) {
        const error = errorMessage || 'Screenshot capture returned no screens';
        console.error(error);

        // Show user-friendly error message if permission is not granted
        if (result && !result.permissionGranted) {
          alert('Screen Recording Permission Required\n\n' +
                'Please enable screen recording permission:\n' +
                '1. Go to System Settings → Privacy & Security → Screen Recording\n' +
                '2. Find "Time Tracker" in the list\n' +
                '3. Enable the toggle\n' +
                '4. Restart the app\n\n' +
                'This permission is required to capture screenshots for time tracking.');
        }

        // For debugging, we still log diagnostics if available.
        if (window.electronAPI && window.electronAPI.diagnoseScreenCapture) {
          try {
            const diagnostics = await window.electronAPI.diagnoseScreenCapture();
            console.log('Screen capture diagnostics:', diagnostics);
          } catch (diagError) {
            console.error('Failed to get diagnostics:', diagError);
          }
        }
        return;
      }
  
      console.log(`✅ Captured ${screenshots.length} screen(s) successfully`);
      
      const email = StorageService.getItem('userEmail');
      const baseTimestamp = new Date().toISOString();
      
      // Queue each screenshot for storage upload via main process
      if (window.electronAPI && window.electronAPI.queueScreenshotUpload) {
        for (let i = 0; i < screenshots.length; i++) {
          const screenshot = screenshots[i];
          // Use original ISO timestamp - modification for filename happens in main process
          
          // Use the screenshot's display index if available, otherwise use array index
          // The capture-all-screens function returns screenshots in display order,
          // so screenshots[i] should be display i+1, but use the index property if available
          const screenIndex = (screenshot.screenIndex !== undefined) ? screenshot.screenIndex : 
                              (screenshot.index !== undefined) ? screenshot.index + 1 : 
                              (screenshot.displayIndex !== undefined) ? screenshot.displayIndex + 1 :
                              i + 1;
          
          // Get Frappe project and task IDs from storage
          const frappeProjectId = StorageService.getItem('selectedProjectId');
          let frappeTaskId = StorageService.getItem('selectedTaskId');
          // Ensure taskId is not empty string (treat empty as no task selected)
          if (frappeTaskId === '' || frappeTaskId === null || frappeTaskId === undefined) {
            frappeTaskId = null;
          }
          // Get Frappe timesheet ID - ALWAYS prefer it over Supabase session ID for storage path
          // This ensures screenshots are stored under Frappe timesheet ID folders (e.g., TS-2025-00043)
          const frappeTimesheetId = StorageService.getItem('frappeTimesheetId');
          // Get numeric Supabase session ID separately - needed for time_session_id column
          const supabaseSessionId = StorageService.getItem('supabaseSessionId');
          
          // Parse supabaseSessionId to numeric if it's a string
          let numericSupabaseSessionId = null;
          if (supabaseSessionId) {
            const parsed = parseInt(supabaseSessionId, 10);
            if (!isNaN(parsed) && isFinite(parsed)) {
              numericSupabaseSessionId = parsed;
            }
          }
          
          // Use Frappe timesheet ID for sessionId (for storage path compatibility)
          // But also pass numeric Supabase session ID separately for time_session_id column
          const sessionIdForUpload = frappeTimesheetId || currentSessionId || 'temp-session';
          
          // Log which ID we're using for debugging
          if (frappeTimesheetId) {
            console.log(`Using Frappe timesheet ID for screenshot: ${frappeTimesheetId}`);
          } else if (currentSessionId) {
            console.warn(`Frappe timesheet ID not found, using currentSessionId: ${currentSessionId} (this may be a numeric Supabase ID)`);
          }
          
          window.electronAPI.queueScreenshotUpload({
            userEmail: email,
            sessionId: sessionIdForUpload, // Use Frappe timesheet ID if available, otherwise currentSessionId
            supabaseSessionId: numericSupabaseSessionId, // Numeric Supabase session ID for time_session_id column
            screenshotData: screenshot.dataURL,
            timestamp: baseTimestamp, // Keep original ISO format
            isIdle,
            screenIndex: screenIndex,
            screenName: screenshot.name,
            frappeProjectId: frappeProjectId || null,
            frappeTaskId: frappeTaskId || null,
          }).then(res => {
            if (!res?.ok) {
              console.error(`queueScreenshotUpload failed for screen ${screenIndex}:`, res?.error);
            }
          }).catch(err => console.error(`queueScreenshotUpload error for screen ${screenIndex}:`, err));
        }
      }
  
    } catch (error) {
      console.error('Error capturing screenshots:', error);
    }
  }
  

  function handleHomeNavigation() {
    if (isActive) {
      // If timer is running, prevent navigation and ask user to clock out first
      NotificationService.showWarning('Please clock out first before going back to home. Your timer is still running.');
      return;
    } else {
      // No active timer, safe to navigate
      window.location.href = 'home.html';
    }
  }

  function saveCurrentState() {
    // Save all current timer state to localStorage
    StorageService.setItem('sessionStartTime', sessionStartTime);
    StorageService.setItem('currentSessionId', currentSessionId);
    StorageService.setItem('workStartTime', workStartTime);
    StorageService.setItem('isActive', isActive.toString());
    StorageService.setItem('isOnBreak', isOnBreak.toString());
    StorageService.setItem('breakStartTime', breakStartTime ? breakStartTime.toISOString() : null); // Save break start time as ISO string
    StorageService.setItem('breakDuration', totalBreakDuration.toString());
    StorageService.setItem('activeDuration', totalActiveDuration.toString());
    StorageService.setItem('breakCount', breakCount.toString());
    StorageService.setItem('totalIdleTime', totalIdleTime.toString());
    
    // Save screenshot capture state
    StorageService.setItem('screenshotCaptureActive', (isActive && !isOnBreak).toString());
    
    console.log('Timer state saved before navigation');
  }

  async function logout(options = {}) {
    const { skipConfirm = false, remote = false } = options;

    if (!skipConfirm) {
      const confirmed = confirm('Are you sure you want to logout? This will end your current session.');
      if (!confirmed) {
        return;
      }
    }

    try {
      StorageService.setItem('userLoggedOut', 'true');
      if (isActive && sessionStartTime) {
        console.log('Saving active session before logout...');

        stopScreenshotCapture();

        const now = new Date();
        const sessionDuration = Math.floor((now - new Date(sessionStartTime)) / 1000);

        let finalActiveDuration = totalActiveDuration;
        let finalBreakDuration = totalBreakDuration;

        if (isActive && !isOnBreak && !isIdle && workStartTime) {
          const workElapsed = Math.floor((now - new Date(workStartTime)) / 1000);
          finalActiveDuration += workElapsed;
        }

        if (isOnBreak && breakStartTime) {
          const breakElapsed = Math.floor((now - breakStartTime) / 1000);
          finalBreakDuration += breakElapsed;
        }

        const finalIdleTime = idleTracker ? idleTracker.getTotalIdleTime() : 0;

        await saveSession(sessionDuration, finalBreakDuration, finalActiveDuration, finalIdleTime, breakCount);

        console.log('Session saved successfully before logout');
        NotificationService.showSuccess('Session saved before logout');
      }

      StorageService.removeItem('sessionStartTime');
      StorageService.removeItem('currentSessionId');
      StorageService.removeItem('workStartTime');
      StorageService.removeItem('isActive');
      StorageService.removeItem('isOnBreak');
      StorageService.removeItem('breakStartTime');
      StorageService.removeItem('breakDuration');
      StorageService.removeItem('activeDuration');
      StorageService.removeItem('breakCount');
      StorageService.removeItem('totalIdleTime');
      StorageService.removeItem('isIdle');
      StorageService.removeItem('idleStartTime');
      StorageService.removeItem('screenshotCaptureActive');
      StorageService.removeItem('userEmail');
      StorageService.removeItem('displayName');
      StorageService.removeItem('userCategory');

      clearInterval(timerInterval);
      stopScreenshotCapture();

      if (idleTracker) {
        idleTracker.destroy();
        idleTracker = null;
      }

      if (typeof removeSystemIdleListener === 'function') {
        removeSystemIdleListener();
        removeSystemIdleListener = null;
      } else if (window.electronAPI && typeof window.electronAPI.removeSystemIdleStateListener === 'function') {
        window.electronAPI.removeSystemIdleStateListener();
      }

      const email = userEmail || StorageService.getItem('userEmail');
      if (window.SessionSync && email) {
        await window.SessionSync.updateAppState(false);
        window.SessionSync.clear();
      }

      if (window.electronAPI?.setUserLoggedIn) {
        window.electronAPI.setUserLoggedIn(false).catch(err => console.error('Failed to update logged-in state during logout:', err));
      }

      window.location.href = 'login.html';
    } catch (error) {
      console.error('Error during logout cleanup:', error);
      if (!remote) {
        NotificationService.showError('Error saving session before logout. Please try again.');
      }
    }
  }

  function formatTime(seconds) {
    // Handle NaN or invalid values
    if (isNaN(seconds) || !isFinite(seconds)) {
      console.warn('formatTime received invalid value:', seconds);
      return '00:00:00';
    }
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  // Setup screenshot notification listener
  function setupScreenshotNotificationListener() {
    window.electronAPI.onScreenshotCaptured((data) => {
      console.log(`Screenshot captured and processed (screen: ${data?.screenIndex || 'Primary'})`);
      // Toasts are rendered by the main process per-screen; no renderer toast here.
    });
  }

  // Handle window close events to save active session
  window.addEventListener('beforeunload', async (event) => {
    // Clean up idle tracker to prevent memory leaks
    if (idleTracker) {
      idleTracker.destroy();
      idleTracker = null;
    }

    if (typeof removeSystemIdleListener === 'function') {
      removeSystemIdleListener();
      removeSystemIdleListener = null;
    } else if (window.electronAPI && typeof window.electronAPI.removeSystemIdleStateListener === 'function') {
      window.electronAPI.removeSystemIdleStateListener();
    }
    
    // Clear timer interval
    clearInterval(timerInterval);
    
    if (isActive && sessionStartTime) {
      console.log('Window closing, saving active session...');
      
      try {
        // Stop screenshot capture first
        stopScreenshotCapture();
        
        // Remove screenshot notification listener
        if (window.electronAPI && window.electronAPI.removeScreenshotCapturedListener) {
          window.electronAPI.removeScreenshotCapturedListener();
        }
        
        // Calculate final durations
        const now = new Date();
        const sessionDuration = Math.floor((now - new Date(sessionStartTime)) / 1000);
        
        let finalActiveDuration = totalActiveDuration;
        let finalBreakDuration = totalBreakDuration;
        
        // Add current work time if not on break
        if (isActive && !isOnBreak && !isIdle && workStartTime) {
          const workElapsed = Math.floor((now - new Date(workStartTime)) / 1000);
          finalActiveDuration += workElapsed;
        }
        
        // Add current break time if on break
        if (isOnBreak && breakStartTime) {
          const breakElapsed = Math.floor((now - breakStartTime) / 1000);
          finalBreakDuration += breakElapsed;
        }
        
        // Get final idle time
        const finalIdleTime = totalIdleTime; // Use stored value since tracker is destroyed
        
        // Save the session to database
        await saveSession(sessionDuration, finalBreakDuration, finalActiveDuration, finalIdleTime, breakCount);
        
        console.log('Session saved successfully before window close');
      } catch (error) {
        console.error('Error saving session before window close:', error);
      }
    }
  });

  // Event listeners
  startBtn.addEventListener('click', startTimer);
  breakBtn.addEventListener('click', takeBreak);
  clockOutBtn.addEventListener('click', clockOut);
  if (reportBtn) {
    reportBtn.addEventListener('click', () => {
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
        targetUrl += encodedEmail;
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
  }
  if (homeBtn) {
    homeBtn.addEventListener('click', handleHomeNavigation);
  }
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => logout({ skipConfirm: false, remote: false }));
  }

  window.addEventListener('session:remote-logout', () => {
    NotificationService.showWarning('You were signed out from the reports site. Please log in again from the desktop app.');
    logout({ skipConfirm: true, remote: true });
  });

  // Start timer interval
  timerInterval = setInterval(updateTimer, 1000);
});

