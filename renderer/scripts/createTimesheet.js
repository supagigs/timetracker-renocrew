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
      try {
        createBtn.disabled = true;
  
        const userEmail = StorageService.getItem('userEmail');
        const projectId = StorageService.getItem('selectedProjectId');
        const taskId = StorageService.getItem('selectedTaskId');
  
        if (!userEmail || !projectId || !taskId) {
          throw new Error('Missing user, project, or task information');
        }
  
        clearLocalTimerState();
  
        const timesheet = await window.frappe.createTimesheet({
          project: projectId,
          task: taskId,
        });

        if (!timesheet?.name) {
          throw new Error('Invalid timesheet response from server');
        }

        const frappeTimesheetId = timesheet.name;
        const sessionStartTime = new Date().toISOString();
        const today = new Date().toISOString().split('T')[0];

        // Create a corresponding Supabase time_sessions record
        // This allows the reports website to display session data
        try {
          if (window.supabase) {
            const sessionData = {
              user_email: userEmail,
              start_time: sessionStartTime,
              end_time: null,
              break_duration: 0,
              active_duration: 0,
              idle_duration: 0,
              break_count: 0,
              session_date: today,
              frappe_timesheet_id: frappeTimesheetId,
              frappe_project_id: projectId,
              frappe_task_id: taskId
            };

            const { data: supabaseSession, error: sessionError } = await window.supabase
              .from('time_sessions')
              .insert([sessionData])
              .select('id')
              .single();

            if (sessionError) {
              console.error('Error creating Supabase session:', sessionError);
              // Continue anyway - Frappe timesheet was created successfully
            } else if (supabaseSession) {
              // Store the Supabase session ID for later updates
              StorageService.setItem('supabaseSessionId', supabaseSession.id.toString());
              console.log('Created Supabase session with ID:', supabaseSession.id);
            }
          }
        } catch (supabaseError) {
          console.error('Error creating Supabase session record:', supabaseError);
          // Non-fatal - continue with Frappe timesheet
        }

        StorageService.setItem('frappeTimesheetId', frappeTimesheetId);
        StorageService.setItem('sessionStartTime', sessionStartTime);
        StorageService.setItem('isActive', 'false');

        window.location.href = 'tracker.html';
  
      } catch (err) {
        console.error('Create timesheet failed:', err);
        NotificationService.showError(
          err.message || 'Failed to create timesheet'
        );
        createBtn.disabled = false;
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
  