document.addEventListener('DOMContentLoaded', () => {
  const taskSelect = document.getElementById('taskSelect');
  const startSessionBtn = document.getElementById('startSessionBtn');
  const backBtn = document.getElementById('backBtn');
  const noTasksMessage = document.getElementById('noTasksMessage');
  const taskSelectionGroup = document.getElementById('taskSelectionGroup');
  const welcomeText = document.getElementById('welcomeText');
  const userNameEl = document.getElementById('userName');
  const projectNameEl = document.getElementById('projectName');

  startSessionBtn.disabled = true;

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

  // ---- Fetch tasks ----
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

      if (!Array.isArray(tasks) || tasks.length === 0) {
        showNoTasks(
          'No active tasks assigned to you for this project.'
        );
        return;
      }

      populateTaskDropdown(tasks);
    } catch (err) {
      console.error('Failed to load tasks:', err);
      showNoTasks(
        err.message || 'Failed to load tasks. Please try again.'
      );
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

    if (!selectedTaskId) {
      startSessionBtn.disabled = true;
      return;
    }

    StorageService.setItem('selectedTaskId', selectedTaskId);
    startSessionBtn.disabled = false;
  });

  startSessionBtn.addEventListener('click', () => {
    if (!StorageService.getItem('selectedTaskId')) {
      NotificationService.showError('Please select a task.');
      return;
    }
    window.location.href = 'createTimesheet.html';
  });

  backBtn.addEventListener('click', redirectToProjects);

  function showNoTasks(message) {
    taskSelectionGroup.classList.remove('show');
    taskSelect.classList.add('hidden');
    noTasksMessage.textContent = message;
    noTasksMessage.classList.add('show');
    startSessionBtn.disabled = true;
  }

  function redirectToProjects() {
    window.location.href = 'clockIn.html';
  }

  function redirectToLogin() {
    StorageService.clear();
    window.location.href = 'login.html';
  }
});
