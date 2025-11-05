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
  let idleTracker = null; // Idle time tracker instance
  let totalIdleTime = 0; // Total idle time accumulated

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

  // Initialize
  init();

  function init() {
    const email = StorageService.getItem('userEmail');
    if (!email) {
      alert('No user email found. Please login again.');
      window.location.href = 'login.html';
      return;
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

    if (sessionStartTime) {
      updateTimer();
      if (isActive) {
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
        
        // Restore screenshot capture if it should be active
        const screenshotCaptureActive = StorageService.getItem('screenshotCaptureActive') === 'true';
        if (screenshotCaptureActive) {
          console.log('Restoring screenshot capture from background');
          startScreenshotCapture();
        }
      }
    }

    loadTodayStats();
    updateActivityChart();
    
    // Initialize idle tracker
    initializeIdleTracker();
    
    // Setup screenshot capture notification listener
    setupScreenshotNotificationListener();
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
      startBtn.disabled = true;
      breakBtn.disabled = false;
      
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
    // Immediately stop timer and calculate final time when button is clicked
    // This prevents any additional time from being counted after user clicks Clock Out
    const clockOutTime = new Date();
    clearInterval(timerInterval);
    stopScreenshotCapture();
    
    // Stop idle tracking
    if (idleTracker) {
      idleTracker.stopTracking();
    }
    
    // Mark session as ended immediately
    isActive = false;
    StorageService.setItem('isActive', 'false');
    
    if (confirm('Are you sure you want to clock out? This will end your current session.')) {
      try {
        // Calculate final durations using the time when Clock Out was clicked
        const sessionDuration = Math.floor((clockOutTime - new Date(sessionStartTime)) / 1000);
        
        // Calculate final active duration based on actual work periods tracked
        let finalActiveDuration = totalActiveDuration;
        
        // If currently working (not on break), add the current work time
        if (isActive && !isOnBreak && workStartTime) {
          const workElapsed = Math.floor((clockOutTime - new Date(workStartTime)) / 1000);
          finalActiveDuration = totalActiveDuration + workElapsed;
        }
        
        console.log('Clock out calculation details:', {
          sessionDuration,
          totalActiveDuration,
          totalBreakDuration,
          finalActiveDuration,
          isActive,
          isOnBreak,
          workStartTime: workStartTime ? new Date(workStartTime) : null,
          clockOutTime
        });


        // Get final idle time
        const finalIdleTime = idleTracker ? idleTracker.getTotalIdleTime() : 0;
        
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
      isActive = true;
      StorageService.setItem('isActive', 'true');
      timerInterval = setInterval(updateTimer, 1000);
      if (workStartTime) {
        startScreenshotCapture();
      }
    }
  }

  async function saveSession(totalDuration, breakDuration, activeDuration, idleDuration = 0, breakCountVal = 0) {
    const email = StorageService.getItem('userEmail');
    const today = new Date().toISOString().split('T')[0];
    const selectedProjectId = StorageService.getItem('selectedProjectId');

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
        if (selectedProjectId) {
          updateData.project_id = parseInt(selectedProjectId);
        }

        const { data, error } = await supabase
          .from('time_sessions')
          .update(updateData)
          .eq('id', parseInt(currentSessionId))
          .select();

        if (error) {
          console.error('Error updating session:', error);
          throw new Error(`Failed to update session: ${error.message}`);
        } else {
          console.log('Session updated successfully:', data);
        }
      } else {
        // Fallback: create new session (shouldn't happen with new flow)
        console.warn('No currentSessionId found, creating new session');
        const insertData = {
          user_email: email,
          start_time: sessionStartTime,
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
        }

        const { data, error } = await supabase
          .from('time_sessions')
          .insert([insertData])
          .select()
          .single();

        if (error) {
          console.error('Error saving session:', error);
          throw new Error(`Failed to save session: ${error.message}`);
        } else {
          console.log('Session saved successfully:', data);
        }
      }
    } catch (error) {
      console.error('Error saving session:', error);
    }
  }

  function updateTimer() {
    if (!sessionStartTime) return;

    const now = new Date();
    
    // Calculate current active time based on current state
    let currentActiveTime = totalActiveDuration;
    if (isActive && !isOnBreak && workStartTime) {
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

    // Calculate total session time (active + break)
    const totalSessionTime = currentActiveTime + currentBreakTime;

    // Debug logging
    //console.log('updateTimer - isActive:', isActive, 'isOnBreak:', isOnBreak);
    //console.log('updateTimer - breakStartTime:', breakStartTime, 'type:', typeof breakStartTime);
    //console.log('updateTimer - totalBreakDuration:', totalBreakDuration, 'currentBreakTime:', currentBreakTime);
    //console.log('updateTimer - totalActiveDuration:', totalActiveDuration, 'currentActiveTime:', currentActiveTime);

    // Calculate current idle time
    const currentIdleTime = idleTracker ? idleTracker.getTotalIdleTime() : totalIdleTime;
    
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
          if (isActive && !isOnBreak && workStartTime) {
            const now = new Date();
            const workElapsed = Math.floor((now - new Date(workStartTime)) / 1000);
            currentActiveTime = totalActiveDuration + workElapsed;
            console.log(`Adding current work time: ${workElapsed}s (total: ${currentActiveTime}s)`);
          } else if (isActive && !isOnBreak && !workStartTime) {
            // User is marked as active but hasn't started work yet - don't count time
            console.log('User is active but work not started - not counting time');
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
    
    if (isActive && !isOnBreak && workStartTime) {
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
    
    if (isActive && !isOnBreak && workStartTime) {
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
          }
        }).catch(err => console.error('queueScreenshotUpload error:', err));
      }

      // Always save screenshot to local file (this should work even if DB fails)
      try {
        const filename = `screenshot_${email.replace('@', '_at_').replace('.', '_')}_${timestamp.replace(/[:.]/g, '-')}.png`;
        
        // Use Electron IPC to save file in main process
        const filePath = await window.electronAPI.saveScreenshot(screenshotData, filename);
        console.log('Screenshot saved to local file:', filePath);
        
        // Show notification for manual screenshot capture
        showScreenshotNotification({
          timestamp: timestamp,
          filename: filename,
          filePath: filePath
        });
      } catch (fileError) {
        console.error('Error saving screenshot to local file:', fileError);
      }

    } catch (error) {
      console.error('Error capturing screenshot:', error);
    }
  }

  function handleHomeNavigation() {
    if (isActive) {
      // If timer is running, show confirmation dialog
      const confirmMessage = 'You have an active timer running. The timer will continue in the background. Are you sure you want to go to the home page?';
      if (confirm(confirmMessage)) {
        // Save current state before navigation
        saveCurrentState();
        window.location.href = 'home.html';
      }
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

  async function logout() {
    if (confirm('Are you sure you want to logout? This will end your current session.')) {
      try {
        // If there's an active session, save it before logging out
        if (isActive && sessionStartTime) {
          console.log('Saving active session before logout...');
          
          // Stop screenshot capture first
          stopScreenshotCapture();
          
          // Calculate final durations
          const now = new Date();
          const sessionDuration = Math.floor((now - new Date(sessionStartTime)) / 1000);
          
          let finalActiveDuration = totalActiveDuration;
          let finalBreakDuration = totalBreakDuration;
          
          // Add current work time if not on break
          if (isActive && !isOnBreak && workStartTime) {
            const workElapsed = Math.floor((now - new Date(workStartTime)) / 1000);
            finalActiveDuration += workElapsed;
          }
          
          // Add current break time if on break
          if (isOnBreak && breakStartTime) {
            const breakElapsed = Math.floor((now - breakStartTime) / 1000);
            finalBreakDuration += breakElapsed;
          }
          
          // Get final idle time
          const finalIdleTime = idleTracker ? idleTracker.getTotalIdleTime() : 0;
          
          // Save the session to database
          await saveSession(sessionDuration, finalBreakDuration, finalActiveDuration, finalIdleTime, breakCount);
          
          console.log('Session saved successfully before logout');
          NotificationService.showSuccess('Session saved before logout');
        }
        
        // Clear all session data
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
        StorageService.removeItem('screenshotCaptureActive');
        StorageService.removeItem('userEmail');
        StorageService.removeItem('displayName');
        StorageService.removeItem('userCategory');

        // Stop timers
        clearInterval(timerInterval);
        stopScreenshotCapture();
        
        // Clean up idle tracker
        if (idleTracker) {
          idleTracker.destroy();
          idleTracker = null;
        }

        // Redirect to login
        window.location.href = 'login.html';
        
      } catch (error) {
        console.error('Error during logout cleanup:', error);
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
    
    const now = new Date();
    const timeString = now.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      second: '2-digit'
    });
    
    notification.innerHTML = `
      <div class="screenshot-notification-icon">📸</div>
      <div class="screenshot-notification-content">
        <div class="screenshot-notification-title">Screenshot Captured</div>
        <div class="screenshot-notification-time">${timeString}</div>
      </div>
    `;
    
    // Add click handler to dismiss
    notification.addEventListener('click', () => {
      dismissNotification(notification);
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
        if (isActive && !isOnBreak && workStartTime) {
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
  homeBtn.addEventListener('click', handleHomeNavigation);
  if (logoutBtn) {
    logoutBtn.addEventListener('click', logout);
  }

  // Start timer interval
  timerInterval = setInterval(updateTimer, 1000);
});

