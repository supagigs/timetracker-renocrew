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
    // Create Timesheet
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

        // Task is optional - only include it if provided
        const timesheetData = {
          project: projectId,
        };
        if (taskId) {
          timesheetData.task = taskId;
        }

        console.log('[CREATE_TIMESHEET] Prepared timesheet data:', JSON.stringify(timesheetData, null, 2));
        console.log('[CREATE_TIMESHEET] Calling window.frappe.getOrCreateTimesheet...');

        // Get or create timesheet for this project (one timesheet per project)
        const getOrCreateStartTime = Date.now();
        let timesheetResult;
        try {
          timesheetResult = await window.frappe.getOrCreateTimesheet(timesheetData);
          const getOrCreateDuration = Date.now() - getOrCreateStartTime;
          console.log('[CREATE_TIMESHEET] getOrCreateTimesheet completed in', getOrCreateDuration, 'ms');
          console.log('[CREATE_TIMESHEET] Raw response:', JSON.stringify(timesheetResult, null, 2));
        } catch (getOrCreateErr) {
          const getOrCreateDuration = Date.now() - getOrCreateStartTime;
          console.error('[CREATE_TIMESHEET] getOrCreateTimesheet FAILED after', getOrCreateDuration, 'ms');
          console.error('[CREATE_TIMESHEET] Error type:', getOrCreateErr?.constructor?.name);
          console.error('[CREATE_TIMESHEET] Error message:', getOrCreateErr?.message);
          console.error('[CREATE_TIMESHEET] Error stack:', getOrCreateErr?.stack);
          if (getOrCreateErr?.response) {
            console.error('[CREATE_TIMESHEET] Error response status:', getOrCreateErr.response.status);
            console.error('[CREATE_TIMESHEET] Error response data:', JSON.stringify(getOrCreateErr.response.data, null, 2));
          }
          throw getOrCreateErr;
        }

        const { timesheet, row } = timesheetResult;
        console.log('[CREATE_TIMESHEET] Extracted values:', {
          timesheet: timesheet,
          timesheetType: typeof timesheet,
          row: row,
          rowType: typeof row
        });

        if (!timesheet) {
          const errorMsg = 'Invalid timesheet response from server - timesheet is missing or falsy';
          console.error('[CREATE_TIMESHEET]', errorMsg);
          console.error('[CREATE_TIMESHEET] Full response object:', JSON.stringify(timesheetResult, null, 2));
          throw new Error(errorMsg);
        }

        if (!row) {
          const errorMsg = 'Invalid timesheet row response from server - row is missing or falsy';
          console.error('[CREATE_TIMESHEET]', errorMsg);
          console.error('[CREATE_TIMESHEET] Full response object:', JSON.stringify(timesheetResult, null, 2));
          throw new Error(errorMsg);
        }

        // Store in clearly named variables
        const frappeTimesheetId = timesheet;
        const frappeTimesheetRowId = row;

        console.log('[CREATE_TIMESHEET] Timesheet creation successful:', { 
          frappeTimesheetId, 
          frappeTimesheetRowId
        });

        // Store for later (start / stop / update)
        const currentSession = {
          frappeTimesheetId,
          frappeTimesheetRowId
        };
        const sessionJson = JSON.stringify(currentSession);
        console.log('[CREATE_TIMESHEET] Storing session data:', sessionJson);
        
        StorageService.setItem('frappeSession', sessionJson);

        // Also store IDs individually for backward compatibility
        StorageService.setItem('frappeTimesheetId', frappeTimesheetId);
        StorageService.setItem('frappeTimesheetRowId', frappeTimesheetRowId);
        console.log('[CREATE_TIMESHEET] Stored individual IDs to storage');

        StorageService.setItem('isActive', 'false');
        console.log('[CREATE_TIMESHEET] Set isActive to false');

        // Verify storage
        const storedSession = StorageService.getItem('frappeSession');
        console.log('[CREATE_TIMESHEET] Verification - stored session:', storedSession);

        // Note: Supabase session record will be created when user clicks "Start" on tracker page
        // This ensures we only create the record when tracking actually begins

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
        
        if (err?.response) {
          console.error('[CREATE_TIMESHEET] Error response status:', err.response.status);
          console.error('[CREATE_TIMESHEET] Error response headers:', JSON.stringify(err.response.headers, null, 2));
          console.error('[CREATE_TIMESHEET] Error response data:', JSON.stringify(err.response.data, null, 2));
        }
        
        if (err?.config) {
          console.error('[CREATE_TIMESHEET] Request config:', {
            url: err.config?.url,
            method: err.config?.method,
            data: err.config?.data,
            headers: err.config?.headers
          });
        }
        
        console.error('[CREATE_TIMESHEET] Full error object:', JSON.stringify(err, Object.getOwnPropertyNames(err), 2));
        console.error('[CREATE_TIMESHEET] ============================');
        
        NotificationService.showError(
          err.message || 'Failed to create timesheet'
        );
        createBtn.disabled = false;
        console.log('[CREATE_TIMESHEET] Button re-enabled after error');
      }
    });
  
    backBtn?.addEventListener('click', () => {
      window.location.href = 'selectTask.html';
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
  