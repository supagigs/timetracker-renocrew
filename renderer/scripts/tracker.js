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
    currentSessionId = StorageService.getItem('currentSessionId');
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

  function startTimer() {
    if (!isActive) {
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
      
      // Take an immediate screenshot so short sessions still show images
      captureScreenshot();
      // Start screenshot capture
      startScreenshotCapture();
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

  async function clockOut() {
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

    if (confirm('Are you sure you want to clock out? This will end your current session.')) {
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

        // Save session to database and wait for completion
        await saveSession(sessionDuration, totalBreakDuration, finalActiveDuration, finalIdleTime, breakCount);

        // Clear session data
        StorageService.removeItem('sessionStartTime');
        StorageService.removeItem('currentSessionId');
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

        alert('Session ended successfully!');
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

    // If project_id is not in storage, try to get it from the existing session
    if (!selectedProjectId && currentSessionId) {
      try {
        const { data: existingSession } = await window.supabase
          .from('time_sessions')
          .select('project_id')
          .eq('id', parseInt(currentSessionId))
          .single();
        
        if (existingSession && existingSession.project_id) {
          selectedProjectId = existingSession.project_id.toString();
          console.log('Retrieved project_id from existing session:', selectedProjectId);
        }
      } catch (err) {
        console.log('Could not retrieve project_id from existing session:', err);
      }
    }

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
      if (currentSessionId) {
        // Update existing session
        const updateData = {
          end_time: new Date().toISOString(),
          break_duration: breakDuration,
          active_duration: activeDuration,
          idle_duration: idleDuration,
          break_count: breakCountVal
        };

        // Include project_id if available (for Freelancers)
        // Always include it if it was set, even if cleared from storage
        if (selectedProjectId) {
          updateData.project_id = parseInt(selectedProjectId);
          console.log('Including project_id in update:', updateData.project_id);
        } else {
          console.log('No project_id available for this session');
        }

        console.log('Updating session with data:', updateData);

        const { data, error } = await window.supabase
          .from('time_sessions')
          .update(updateData)
          .eq('id', parseInt(currentSessionId))
          .select();

        if (error) {
          console.error('Error updating session:', error);
          console.error('Error details:', JSON.stringify(error, null, 2));
          NotificationService.showError(`Failed to update session: ${error.message}`);
          throw new Error(`Failed to update session: ${error.message}`);
        } else {
          console.log('Session updated successfully:', data);
          if (data && data[0]) {
            console.log('Updated session includes project_id:', data[0].project_id);
            console.log('Updated session active_duration:', data[0].active_duration);
          }
        }
      } else {
        // Fallback: create new session (shouldn't happen with new flow)
        console.warn('No currentSessionId found, creating new session');
        const insertData = {
          user_email: email,
          start_time: sessionStartTime ? (sessionStartTime instanceof Date ? sessionStartTime.toISOString() : sessionStartTime) : new Date().toISOString(),
          end_time: new Date().toISOString(),
          break_duration: breakDuration,
          active_duration: activeDuration,
          idle_duration: idleDuration,
          break_count: breakCountVal,
          session_date: today
        };

        // Include project_id if available (for Freelancers)
        if (selectedProjectId) {
          insertData.project_id = parseInt(selectedProjectId);
          console.log('Including project_id in insert:', insertData.project_id);
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
            console.log('Saved session includes project_id:', data.project_id);
            console.log('Saved session active_duration:', data.active_duration);
          }
        }
      }
    } catch (error) {
      console.error('Error saving session:', error);
      NotificationService.showError(`Error saving session: ${error.message || 'Unknown error'}`);
    }
  }

  function updateTimer() {
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
    
    // Update the activity chart and today's stats every 5 seconds
    if (Math.floor(Date.now() / 1000) % 5 === 0) {
      updateActivityChart();
      loadTodayStats();
      // Update project chart and times if user is freelancer
      const userCategory = StorageService.getItem('userCategory');
      if (userCategory === 'Freelancer') {
        loadProjectDistributionChart();
        updateProjectTimes();
      }
    }
  }

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
        const { data: session } = await window.supabase
          .from('time_sessions')
          .select('project_id')
          .eq('id', parseInt(currentSessionId))
          .maybeSingle();
        
        if (session && session.project_id) {
          projectId = session.project_id.toString();
        }
      }

      if (!projectId || !window.supabase) {
        if (projectNameSection) {
          projectNameSection.style.display = 'none';
        }
        return;
      }

      // Fetch project name
      const { data: project, error } = await SupabaseService.handleRequest(() =>
        window.supabase
          .from('projects')
          .select('project_name')
          .eq('id', parseInt(projectId))
          .maybeSingle()
      );

      if (error) {
        console.error('Error loading project name:', error);
        if (projectNameSection) {
          projectNameSection.style.display = 'none';
        }
        return;
      }

      if (project && project.project_name && projectNameDisplay && projectNameSection) {
        projectNameDisplay.textContent = project.project_name;
        projectNameSection.style.display = 'block';
      } else {
        if (projectNameSection) {
          projectNameSection.style.display = 'none';
        }
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

      // Fetch all completed time sessions with project_id for today (only those with end_time)
      const { data: sessions, error } = await SupabaseService.handleRequest(() =>
        window.supabase
          .from('time_sessions')
          .select(`
            project_id,
            active_duration,
            end_time,
            projects (
              id,
              project_name
            )
          `)
          .eq('user_email', email)
          .eq('session_date', today)
          .not('project_id', 'is', null)
          .not('end_time', 'is', null) // Only completed sessions
      );

      if (error) {
        console.error('Error loading project times:', error);
        return;
      }

      // Reset the map
      projectTimeData.clear();

      // Aggregate time by project from completed sessions
      // Exclude current session if it exists in the results
      if (sessions) {
        sessions.forEach(session => {
          // Skip current session if it's in the results (shouldn't happen since we filter by end_time, but just in case)
          if (currentSessionId && session.id === parseInt(currentSessionId)) {
            return;
          }

          if (session.projects && session.project_id) {
            const projectId = session.project_id;
            const projectName = session.projects.project_name || `Project ${projectId}`;
            const activeDuration = Number(session.active_duration) || 0;

            if (projectTimeData.has(projectId)) {
              const existing = projectTimeData.get(projectId);
              const existingTime = Number(existing?.time) || 0;
              const existingCurrentSession = Number(existing?.currentSessionTime) || 0;

              projectTimeData.set(projectId, {
                name: projectName,
                time: existingTime + activeDuration,
                currentSessionTime: existingCurrentSession,
              });
            } else {
              projectTimeData.set(projectId, {
                name: projectName,
                time: activeDuration,
                currentSessionTime: 0,
              });
            }
          }
        });
      }

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

      const projectId = document.createElement('p');
      projectId.className = 'project-time-card__subtitle';
      projectId.textContent = `Project ID: ${project.id}`;

      projectNameDiv.appendChild(projectName);
      projectNameDiv.appendChild(projectId);

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
    try {
      const email = StorageService.getItem('userEmail');
      const today = new Date().toISOString().split('T')[0];
      if (!email || !window.supabase) {
        return;
      }

      // Fetch all time sessions with project_id for this user
      const { data: sessions, error } = await SupabaseService.handleRequest(() =>
        window.supabase
          .from('time_sessions')
          .select(`
            id,
            project_id,
            active_duration,
            projects (
              id,
              project_name
            )
          `)
          .eq('user_email', email)
          .eq('session_date', today)
          .not('project_id', 'is', null)
      );

      if (error) {
        console.error('Error loading project distribution:', error);
        return;
      }

      const projectChartSection = document.getElementById('projectChartSection');
      const sessionList = Array.isArray(sessions) ? sessions : [];

      // Aggregate time by project
      const projectTimeMap = new Map();
      
      sessionList.forEach(session => {
        if (session.projects && session.project_id) {
          const projectId = session.project_id;
          const projectName = session.projects.project_name || `Project ${projectId}`;
          const activeDuration = Number(session.active_duration) || 0;

          if (projectTimeMap.has(projectId)) {
            projectTimeMap.set(projectId, {
              name: projectName,
              time: projectTimeMap.get(projectId).time + activeDuration
            });
          } else {
            projectTimeMap.set(projectId, {
              name: projectName,
              time: activeDuration
            });
          }
        }
      });

      // Convert to arrays for chart
      const projectNames = [];
      const projectTimes = [];
      const colors = [
        '#3B82F6', // Blue
        '#10B981', // Green
        '#F59E0B', // Amber
        '#EF4444', // Red
        '#8B5CF6', // Purple
        '#EC4899', // Pink
        '#06B6D4', // Cyan
        '#F97316', // Orange
        '#84CC16', // Lime
        '#6366F1'  // Indigo
      ];

      projectTimeMap.forEach((value, key) => {
        // Only include projects with time > 0
        if (value.time > 0) {
          projectNames.push(value.name);
          projectTimes.push(value.time);
        }
      });

      // Add current active session time if it has a project and hasn't been saved yet
      const selectedProjectId = StorageService.getItem('selectedProjectId');
      const currentSessionId = StorageService.getItem('currentSessionId');
      if (selectedProjectId && isActive && !isOnBreak && !isIdle && workStartTime) {
        // Check if current session is already in the fetched sessions
        const currentSessionInList = sessionList.find(s => s.id === parseInt(currentSessionId));
        
        // Only add current time if session is not in the list (not saved yet) or if it's been updated since last save
        if (!currentSessionInList || (currentSessionInList && currentSessionInList.project_id === parseInt(selectedProjectId))) {
          const now = new Date();
          const currentWorkTime = Math.floor((now - new Date(workStartTime)) / 1000);
          const totalCurrentTime = totalActiveDuration + currentWorkTime;
          
          // If session exists in list, subtract its saved time to avoid double counting
          const savedTime = currentSessionInList ? (currentSessionInList.active_duration || 0) : 0;
          const additionalTime = totalCurrentTime - savedTime;
          
          if (additionalTime > 0) {
            // Find project name from sessions or fetch it
            let projectName = null;
            const existingSession = sessionList.find(s => s.project_id === parseInt(selectedProjectId));
            if (existingSession && existingSession.projects) {
              projectName = existingSession.projects.project_name;
            } else {
              // Fetch project name if not in sessions
              const { data: projectData } = await SupabaseService.handleRequest(() =>
                window.supabase
                  .from('projects')
                  .select('project_name')
                  .eq('id', parseInt(selectedProjectId))
                  .maybeSingle()
              );
              if (projectData) {
                projectName = projectData.project_name;
              }
            }
            
            if (projectName) {
              const existingIndex = projectNames.indexOf(projectName);
              
              if (existingIndex >= 0) {
                projectTimes[existingIndex] += additionalTime;
              } else {
                projectNames.push(projectName);
                projectTimes.push(additionalTime);
              }
            }
          }
        }
      }

      // Filter out any projects with zero or negative time after adding current session
      const validProjects = [];
      const validTimes = [];
      const validNames = [];
      
      for (let i = 0; i < projectTimes.length; i++) {
        if (projectTimes[i] > 0) {
          validProjects.push(i);
          validTimes.push(projectTimes[i]);
          validNames.push(projectNames[i]);
        }
      }

      if (validNames.length === 0) {
        if (projectChartSection) {
          projectChartSection.style.display = 'none';
        }
        return;
      }

      // Show chart section
      if (projectChartSection) {
        projectChartSection.style.display = 'block';
      }

      // Format times for display (convert seconds to hours)
      const formattedTimes = validTimes.map(time => {
        const hours = Math.floor(time / 3600);
        const minutes = Math.floor((time % 3600) / 60);
        return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
      });

      const chartData = {
        labels: validNames.map((name, index) => `${name} (${formattedTimes[index]})`),
        datasets: [{
          data: validTimes,
          backgroundColor: colors.slice(0, validNames.length),
          borderWidth: 2,
          borderColor: '#ffffff'
        }]
      };

      const ctx = document.getElementById('projectChart').getContext('2d');

      if (projectChart) {
        // Update existing chart
        projectChart.data = chartData;
        projectChart.update();
      } else {
        // Create new chart
        projectChart = new Chart(ctx, {
          type: 'pie',
          data: chartData,
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                position: 'bottom',
                labels: {
                  padding: 15,
                  font: {
                    size: 12
                  }
                }
              },
              tooltip: {
                callbacks: {
                  label: function(context) {
                    const label = context.label || '';
                    const value = context.parsed || 0;
                    const hours = Math.floor(value / 3600);
                    const minutes = Math.floor((value % 3600) / 60);
                    const seconds = value % 60;
                    const timeString = hours > 0 
                      ? `${hours}h ${minutes}m ${seconds}s`
                      : minutes > 0 
                        ? `${minutes}m ${seconds}s`
                        : `${seconds}s`;
                    return `${label.split(' (')[0]}: ${timeString}`;
                  }
                }
              }
            }
          }
        });
      }
    } catch (error) {
      console.error('Error in loadProjectDistributionChart:', error);
    }
  }

  function startScreenshotCapture() {
    console.log('Starting background screenshot capture...');
    const email = StorageService.getItem('userEmail');
    const sessionId = currentSessionId || 'temp-session';
    
    // Start background screenshot capture in main process
    window.electronAPI.startBackgroundScreenshots(email, sessionId)
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
      console.log('Attempting to capture screenshot...');
      const canvas = await window.electronAPI.captureScreen();
      const screenshotData = canvas.toDataURL('image/png');
      
      const email = StorageService.getItem('userEmail');
      const timestamp = new Date().toISOString();
      // Queue this screenshot for storage upload via main process (no base64 in DB)
      if (window.electronAPI && window.electronAPI.queueScreenshotUpload) {
        window.electronAPI.queueScreenshotUpload({
          userEmail: email,
          sessionId: currentSessionId || 'temp-session',
          screenshotData,
          timestamp
        }).then(res => {
          if (!res?.ok) {
            console.error('queueScreenshotUpload failed:', res?.error);
          } else {
            showScreenshotNotification({
              timestamp,
              previewDataUrl: screenshotData,
              storageUrl: res.url || null,
              sessionId: currentSessionId || 'temp-session'
            });
          }
        }).catch(err => console.error('queueScreenshotUpload error:', err));
      }

    } catch (error) {
      console.error('Error capturing screenshot:', error);
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
      console.log('Screenshot captured notification received:', data);
      showScreenshotNotification(data);
    });
  }

  // Show screenshot notification popup
  function showScreenshotNotification(data) {
    // Remove any existing notification
    const existingNotification = document.querySelector('.screenshot-notification');
    if (existingNotification) {
      existingNotification.classList.add('fade-out');
      setTimeout(() => existingNotification.remove(), 400);
    }

    // Create notification element
    const notification = document.createElement('div');
    notification.className = 'screenshot-notification';

    const previewSource =
      data?.previewDataUrl ||
      data?.dataUrl ||
      (data?.filePath ? `file://${data.filePath}` : null) ||
      data?.storageUrl ||
      null;
    
    const now = new Date();
    const timeString = now.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      second: '2-digit'
    });
    
    notification.innerHTML = `
       <div class="screenshot-notification-content">
         <div class="screenshot-notification-title">Screenshot Captured</div>
         <div class="screenshot-notification-time">${timeString}</div>
       </div>
     `;
    
    // Add click handler to dismiss
    notification.addEventListener('click', () => {
      dismissNotification(notification);
      if (previewSource) {
        if (previewSource.startsWith('http')) {
          if (window.electronAPI && window.electronAPI.openExternalUrl) {
            window.electronAPI.openExternalUrl(previewSource);
          } else {
            window.open(previewSource, '_blank', 'noopener');
          }
        } else {
          openScreenshotPreview(previewSource);
        }
      }
    });
    
    // Add to document
    document.body.appendChild(notification);
    
    // Auto-dismiss after 3 seconds
    setTimeout(() => {
      if (notification.parentElement) {
        dismissNotification(notification);
      }
    }, 3000);
  }

  function openScreenshotPreview(imageSrc) {
    const modal = document.createElement('div');
    modal.className = 'screenshot-modal';
    modal.innerHTML = `<img src="${imageSrc}" alt="Screenshot Preview">`;

    modal.addEventListener('click', () => {
      if (modal.parentElement) {
        modal.remove();
      }
    });

    document.body.appendChild(modal);
  }

  // Dismiss notification with animation
  function dismissNotification(notification) {
    notification.classList.add('fade-out');
    setTimeout(() => {
      if (notification.parentElement) {
        notification.remove();
      }
    }, 400);
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

