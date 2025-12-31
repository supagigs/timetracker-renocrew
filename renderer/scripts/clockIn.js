document.addEventListener('DOMContentLoaded', async () => {
  const welcomeText = document.getElementById('welcomeText');
  const currentDate = document.getElementById('currentDate');
  const currentTime = document.getElementById('currentTime');
  const userName = document.getElementById('userName');
  const startSessionBtn = document.getElementById('startSessionBtn');
  const backBtn = document.getElementById('backBtn');
  const projectSelectionGroup = document.getElementById('projectSelectionGroup');
  const projectSelect = document.getElementById('projectSelect');
  const noProjectsMessage = document.getElementById('noProjectsMessage');

  // Check if user is logged in
  const email = StorageService.getItem('userEmail');
  if (!email) {
    alert('No user email found. Please login again.');
    window.location.href = 'login.html';
    return;
  }

  if (window.SessionSync) {
    window.SessionSync.setEmail(email);
    window.SessionSync.updateAppState(true);
  }

  window.addEventListener('session:remote-logout', async () => {
    NotificationService.showWarning('You were signed out from the reports site. Please log in again from the desktop app.');
    try {
      if (window.SessionSync) {
        await window.SessionSync.updateAppState(false);
        window.SessionSync.clear();
      }
    } catch (error) {
      console.error('Failed to update session state during remote logout:', error);
    }
    StorageService.removeItem('userEmail');
    StorageService.removeItem('displayName');
    StorageService.removeItem('userCategory');
    window.location.href = 'login.html';
  });

  // Check user category
  const userCategory = StorageService.getItem('userCategory');
  const isFreelancer = userCategory === 'Freelancer';

  // Clear any stale session data from previous sessions
  // This ensures a fresh start when user logs in
  StorageService.removeItem('sessionStartTime');
  StorageService.removeItem('currentSessionId');
  StorageService.removeItem('workStartTime');
  StorageService.removeItem('isActive');
  StorageService.removeItem('isOnBreak');
  StorageService.removeItem('breakDuration');
  StorageService.removeItem('activeDuration');
  StorageService.removeItem('breakCount');
  StorageService.removeItem('selectedProjectId');
  console.log('Cleared stale session data for fresh login');

  // Set user information
  const displayName = StorageService.getItem('displayName') || 'User';
  userName.textContent = displayName;
  welcomeText.textContent = `Ready to start your work session, ${displayName}?`;

  // Load projects for Freelancers
  if (isFreelancer) {
    projectSelectionGroup.classList.add('show');
    await loadAssignedProjects();
  }

  // Update date and time
  function updateDateTime() {
    const now = new Date();
    currentDate.textContent = now.toLocaleDateString();
    currentTime.textContent = now.toLocaleTimeString();
  }

  // Update time every second
  updateDateTime();
  setInterval(updateDateTime, 1000);

  // Load assigned projects from Frappe
  async function loadAssignedProjects() {
    try {
      if (!window.frappe || !window.frappe.getUserProjects) {
        NotificationService.showError('Frappe service not available.');
        projectSelect.classList.add('hidden');
        noProjectsMessage.textContent = 'Unable to connect to Frappe. Please restart the application.';
        noProjectsMessage.classList.add('show');
        startSessionBtn.disabled = true;
        return;
      }

      console.log('Fetching projects from Frappe...');
      const projects = await window.frappe.getUserProjects();
      
      console.log('Projects received from Frappe:', projects);
      console.log('Number of projects:', projects?.length || 0);
      
      // Detailed logging for each project
      if (projects && projects.length > 0) {
        console.log('Project details:');
        projects.forEach((project, index) => {
          console.log(`  Project ${index + 1}:`, {
            id: project.id,
            name: project.name
          });
        });
      } else {
        console.warn('No projects returned from Frappe API');
      }

      if (!projects || projects.length === 0) {
        console.warn('No projects found for user');
        projectSelect.classList.add('hidden');
        noProjectsMessage.textContent = 'No projects assigned to you in Frappe. Please contact your administrator.';
        noProjectsMessage.classList.add('show');
        startSessionBtn.disabled = true;
        return;
      }

      // Populate dropdown with Frappe projects
      projectSelect.innerHTML = '<option value="">Select a project...</option>';
      projects.forEach(project => {
        const option = document.createElement('option');
        option.value = project.id; // Frappe project ID (usually the name field)
        option.textContent = project.name; // Project name
        projectSelect.appendChild(option);
      });

      projectSelect.classList.remove('hidden');
      noProjectsMessage.classList.remove('show');
      console.log(`Loaded ${projects.length} project(s) from Frappe`);
    } catch (error) {
      console.error('Error in loadAssignedProjects:', error);
      NotificationService.showError('An error occurred while loading projects from Frappe.');
      projectSelect.classList.add('hidden');
      noProjectsMessage.textContent = 'Failed to load projects. Please try again later.';
      noProjectsMessage.classList.add('show');
      startSessionBtn.disabled = true;
    }
  }

  // Project selection change handler - redirect to task selection
  projectSelect.addEventListener('change', () => {
    if (projectSelect.value) {
      const selectedProjectId = projectSelect.value;
      const selectedProjectName = projectSelect.options[projectSelect.selectedIndex].textContent;
      
      // Store project info
      StorageService.setItem('selectedProjectId', selectedProjectId);
      StorageService.setItem('selectedProjectName', selectedProjectName);
      
      // Redirect to task selection screen
      window.location.href = `selectTask.html?projectId=${selectedProjectId}`;
    }
  });

  // Start session button (kept for backward compatibility, but should redirect to task selection)
  startSessionBtn.addEventListener('click', async () => {
    // Validate project selection for Freelancers
    if (isFreelancer) {
      const selectedProjectId = projectSelect.value;
      if (!selectedProjectId) {
        NotificationService.showError('Please select a project before starting the session.');
        projectSelect.focus();
        return;
      }
      
      const selectedProjectName = projectSelect.options[projectSelect.selectedIndex].textContent;
      StorageService.setItem('selectedProjectId', selectedProjectId);
      StorageService.setItem('selectedProjectName', selectedProjectName);
      
      // Redirect to task selection screen
      window.location.href = `selectTask.html?projectId=${selectedProjectId}`;
      return;
    }

    // For non-freelancers (if any), proceed with old flow
    try {
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

      // Create session record immediately in database
      const sessionStartTime = new Date().toISOString();
      const today = new Date().toISOString().split('T')[0];
      const sessionData = {
        user_email: email,
        start_time: sessionStartTime,
        end_time: null,
        break_duration: 0,
        active_duration: 0,
        session_date: today,
        company: company // Add company from user's Employee record
      };

      console.log('Creating session with data:', sessionData);

      const { data, error } = await window.supabase
        .from('time_sessions')
        .insert([sessionData])
        .select();

      if (error) {
        console.error('Error creating session:', error);
        console.error('Error details:', JSON.stringify(error, null, 2));
        NotificationService.showError(`Error starting session: ${error.message}`);
        return;
      }

      if (data && data[0]) {
        const sessionId = data[0].id;
        console.log('Session created with ID:', sessionId);
        
        // Store session data including the database ID
        StorageService.setItem('sessionStartTime', sessionStartTime);
        StorageService.setItem('currentSessionId', sessionId.toString());
        StorageService.setItem('isActive', 'false'); // Start as inactive - user must click Start
        StorageService.setItem('isOnBreak', 'false');
        StorageService.setItem('breakDuration', '0');
        StorageService.setItem('activeDuration', '0');

        // Go to tracker page
        window.location.href = 'tracker.html';
      } else {
        console.error('No data returned from session creation');
        NotificationService.showError('Error starting session: No data returned');
      }
    } catch (error) {
      console.error('Error starting session:', error);
      NotificationService.showError('Error starting session. Please try again.');
    }
  });

  // Back button
  backBtn.addEventListener('click', () => {
    window.location.href = 'home.html';
  });
});
