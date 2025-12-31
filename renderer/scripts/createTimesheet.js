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
        let taskId = StorageService.getItem('selectedTaskId'); // Optional

        // Ensure taskId is not empty string (treat empty as no task selected)
        if (taskId === '' || taskId === null || taskId === undefined) {
          taskId = null;
          StorageService.removeItem('selectedTaskId'); // Clean up if it's empty
        }

        if (!userEmail || !projectId) {
          throw new Error('Missing user or project information');
        }

        clearLocalTimerState();

        // Task is optional - only include it if provided
        const timesheetData = {
          project: projectId,
        };
        if (taskId) {
          timesheetData.task = taskId;
        }

        // Get or create timesheet for this project (one timesheet per project)
        console.log('Getting or creating timesheet for project:', projectId);
        console.log('Current user:', userEmail);
        const { timesheet, row } = await window.frappe.getOrCreateTimesheet(timesheetData);

        if (!timesheet) {
          throw new Error('Invalid timesheet response from server');
        }

        if (!row) {
          throw new Error('Invalid timesheet row response from server');
        }

        // Store in clearly named variables
        const frappeTimesheetId = timesheet;
        const frappeTimesheetRowId = row;

        console.log('Timesheet result:', { 
          frappeTimesheetId, 
          frappeTimesheetRowId
        });

        // Store for later (start / stop / update)
        const currentSession = {
          frappeTimesheetId,
          frappeTimesheetRowId
        };
        StorageService.setItem('frappeSession', JSON.stringify(currentSession));

        // Also store IDs individually for backward compatibility
        StorageService.setItem('frappeTimesheetId', frappeTimesheetId);
        StorageService.setItem('frappeTimesheetRowId', frappeTimesheetRowId);

        const today = new Date().toISOString().split('T')[0];

        // Create a corresponding Supabase time_sessions record
        // This allows the reports website to display session data
        try {
          if (window.supabase) {
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
              start_time: null, // Will be set when user clicks Start
              end_time: null,
              break_duration: 0,
              active_duration: 0,
              idle_duration: 0,
              break_count: 0,
              session_date: today,
              frappe_timesheet_id: frappeTimesheetId,
              frappe_project_id: projectId,
              frappe_task_id: taskId || null, // Task is optional
              company: company // Add company from user's Employee record
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
  