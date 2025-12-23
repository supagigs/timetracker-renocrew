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
  
        StorageService.setItem('frappeTimesheetId', timesheet.name);
        StorageService.setItem('sessionStartTime', new Date().toISOString());
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
  