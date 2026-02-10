document.addEventListener('DOMContentLoaded', () => {

    // -----------------------------
    // Populate static UI fields
    // -----------------------------
    const now = new Date();
  
    const currentDateEl = document.getElementById('currentDate');
    const currentTimeEl = document.getElementById('currentTime');
    const userNameEl = document.getElementById('userName');
  
    if (currentDateEl) currentDateEl.textContent = now.toLocaleDateString();
    if (currentTimeEl) currentTimeEl.textContent = now.toLocaleTimeString();
    if (userNameEl) {
      userNameEl.textContent =
        StorageService.getItem('displayName') ||
        StorageService.getItem('userEmail') ||
        '-';
    }
  
    // -----------------------------
    // Buttons
    // -----------------------------
    const createBtn = document.getElementById('createTimesheetBtn');
    const backBtn = document.getElementById('backBtn');
  
    if (!createBtn) {
      console.error('createTimesheetBtn not found in DOM');
      return;
    }
  
    // -----------------------------
    // Populate Timesheet Details
    // -----------------------------
    const projectDisplay = document.getElementById('projectDisplay');
    const taskDisplay = document.getElementById('taskDisplay');
  
    if (projectDisplay) {
      projectDisplay.value =
        StorageService.getItem('selectedProjectName') || '';
    }
  
    if (taskDisplay) {
      taskDisplay.value =
        StorageService.getItem('selectedTaskName') || '';
    }
  
    const projectNameEl = document.getElementById('projectName');
    const taskNameEl = document.getElementById('taskName');
  
    if (projectNameEl) {
      projectNameEl.textContent =
        StorageService.getItem('selectedProjectName') || '-';
    }
  
    if (taskNameEl) {
      taskNameEl.textContent =
        StorageService.getItem('selectedTaskName') || '-';
    }
  
    // -----------------------------
    // Navigate to Tracker
    // -----------------------------
    createBtn.addEventListener('click', async () => {
      const startTime = Date.now();
      console.log('[CREATE_TIMESHEET] ========== START ==========');
      console.log('[CREATE_TIMESHEET] Button clicked at:', new Date().toISOString());
      
      try {
        createBtn.disabled = true;
        console.log('[CREATE_TIMESHEET] Button disabled');

        const userEmail = StorageService.getItem('userEmail');
        const projectId = StorageService.getItem('selectedProjectId');
        let taskId = StorageService.getItem('selectedTaskId'); // Optional

        console.log('[CREATE_TIMESHEET] Input data:', {
          userEmail: userEmail || 'MISSING',
          projectId: projectId || 'MISSING',
          taskId: taskId || 'null/undefined'
        });

        // Ensure taskId is not empty string (treat empty as no task selected)
        if (taskId === '' || taskId === null || taskId === undefined) {
          taskId = null;
          StorageService.removeItem('selectedTaskId'); // Clean up if it's empty
          console.log('[CREATE_TIMESHEET] TaskId was empty/null, set to null and removed from storage');
        }

        if (!userEmail || !projectId) {
          const errorMsg = `Missing user or project information - userEmail: ${userEmail || 'MISSING'}, projectId: ${projectId || 'MISSING'}`;
          console.error('[CREATE_TIMESHEET] Validation failed:', errorMsg);
          throw new Error(errorMsg);
        }

        console.log('[CREATE_TIMESHEET] Validation passed, clearing local timer state');
        clearLocalTimerState();

        // Note: Timesheet will be created in Frappe when user clicks "Start" button in tracker screen
        // This ensures we only create the timesheet when tracking actually begins

        StorageService.setItem('isActive', 'false');
        console.log('[CREATE_TIMESHEET] Set isActive to false');

        const totalDuration = Date.now() - startTime;
        console.log('[CREATE_TIMESHEET] Total operation completed in', totalDuration, 'ms');
        console.log('[CREATE_TIMESHEET] Redirecting to tracker.html...');
        console.log('[CREATE_TIMESHEET] ========== SUCCESS ==========');

        window.location.href = 'tracker.html';
  
      } catch (err) {
        const totalDuration = Date.now() - startTime;
        console.error('[CREATE_TIMESHEET] ========== ERROR ==========');
        console.error('[CREATE_TIMESHEET] Operation failed after', totalDuration, 'ms');
        console.error('[CREATE_TIMESHEET] Error name:', err?.name);
        console.error('[CREATE_TIMESHEET] Error message:', err?.message);
        console.error('[CREATE_TIMESHEET] Error stack:', err?.stack);
        
        const displayMessage = getTimesheetSyncErrorMessage(err) || err.message || 'Failed to proceed to tracker';
        NotificationService.showError(displayMessage);
        createBtn.disabled = false;
        console.log('[CREATE_TIMESHEET] Button re-enabled after error');
      }
    });
  
    backBtn?.addEventListener('click', () => {
      window.location.href = 'home.html';
    });
  });
  
  // -----------------------------
  // Helpers
  // -----------------------------
  function clearLocalTimerState() {
    StorageService.removeItem('isActive');
    StorageService.removeItem('workStartTime');
    StorageService.removeItem('breakStartTime');
    StorageService.removeItem('idleStartTime');
    StorageService.removeItem('screenshotCaptureActive');
  }
  