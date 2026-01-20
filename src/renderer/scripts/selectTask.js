document.addEventListener('DOMContentLoaded', () => {
  const taskSelect = document.getElementById('taskSelect');
  const startSessionBtn = document.getElementById('startSessionBtn');
  const backBtn = document.getElementById('backBtn');
  const noTasksMessage = document.getElementById('noTasksMessage');
  const taskSelectionGroup = document.getElementById('taskSelectionGroup');
  const welcomeText = document.getElementById('welcomeText');
  const userNameEl = document.getElementById('userName');
  const projectNameEl = document.getElementById('projectName');

  // Button is enabled by default since task selection is optional
  startSessionBtn.disabled = false;

  // ---- Load project info ----
  const projectId =
    new URLSearchParams(window.location.search).get('projectId') ||
    StorageService.getItem('selectedProjectId');

  const projectName =
    StorageService.getItem('selectedProjectName') || 'Selected Project';

  if (!projectId) {
    NotificationService.showError('No project selected. Please select a project.');
    return redirectToProjects();
  }

  StorageService.setItem('selectedProjectId', projectId);
  StorageService.setItem('selectedProjectName', projectName);

  projectNameEl.textContent = projectName;

  // ---- Load user ----
  const email = StorageService.getItem('userEmail');
  if (!email) {
    NotificationService.showError('Session expired. Please log in again.');
    return redirectToLogin();
  }

  const displayName = StorageService.getItem('displayName') || email;
  welcomeText.textContent = `Ready to start your work session, ${displayName}?`;
  userNameEl.textContent = displayName;

  // Clear any previously selected task ID when page loads
  // Task selection is optional, so we start fresh each time
  StorageService.removeItem('selectedTaskId');
  StorageService.removeItem('selectedTaskName');

  // ---- Fetch tasks ----
  // If no tasks exist, skip this screen and go directly to createTimesheet
  loadTasks();

  async function loadTasks() {
    try {
      if (!window.frappe?.getTasksForProject) {
        throw new Error('Frappe API not available');
      }

      const currentUser = await window.auth.me();
      if (!currentUser) {
        throw new Error('Not authenticated with Frappe');
      }

      const tasks = await window.frappe.getTasksForProject(projectId);

      // If no tasks exist for this project assigned to the user, skip task selection
      if (!Array.isArray(tasks) || tasks.length === 0) {
        console.log('No tasks found for project. Skipping task selection screen.');
        // Redirect directly to createTimesheet without showing task selection screen
        window.location.href = 'createTimesheet.html';
        return;
      }

      // Tasks exist - show the task selection screen
      populateTaskDropdown(tasks);
    } catch (err) {
      console.error('Failed to load tasks:', err);
      // On error, also skip task selection and proceed to createTimesheet
      // This ensures the user can still start a session even if task fetching fails
      console.log('Error loading tasks. Skipping task selection screen.');
      window.location.href = 'createTimesheet.html';
    }
  }

  function populateTaskDropdown(tasks) {
    taskSelect.innerHTML = '<option value="">Select a task...</option>';

    tasks.forEach(task => {
      const option = document.createElement('option');
      option.value = task.name; // Frappe Task ID
      option.textContent = `${task.subject || task.name} (${task.status})`;
      taskSelect.appendChild(option);
    });

    taskSelectionGroup.classList.add('show');
    taskSelect.classList.remove('hidden');
    noTasksMessage.classList.remove('show');
  }

  taskSelect.addEventListener('change', () => {
    const selectedTaskId = taskSelect.value;
    const selectedOption = taskSelect.options[taskSelect.selectedIndex];

    // Task selection is optional - store it if selected, clear if not
    if (selectedTaskId) {
      StorageService.setItem('selectedTaskId', selectedTaskId);
      // Also store the task name for display purposes
      const taskName = selectedOption.textContent || selectedTaskId;
      StorageService.setItem('selectedTaskName', taskName);
    } else {
      StorageService.removeItem('selectedTaskId');
      StorageService.removeItem('selectedTaskName');
    }
    // Button remains enabled regardless of task selection
  });

  startSessionBtn.addEventListener('click', () => {
    // Task selection is optional - proceed even without a task
    window.location.href = 'createTimesheet.html';
  });

  backBtn.addEventListener('click', redirectToProjects);

  function showNoTasks(message) {
    taskSelectionGroup.classList.remove('show');
    taskSelect.classList.add('hidden');
    noTasksMessage.textContent = message;
    noTasksMessage.classList.add('show');
    // Button remains enabled even when no tasks are available
    // Task selection is optional
  }

  function redirectToProjects() {
    window.location.href = 'clockIn.html';
  }

  function redirectToLogin() {
    StorageService.clear();
    window.location.href = 'login.html';
  }
});
