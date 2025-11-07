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

  // Load assigned projects for Freelancers
  async function loadAssignedProjects() {
    try {
      if (!window.supabase) {
        NotificationService.showError('Database connection not available.');
        return;
      }

      const { data: assignments, error } = await SupabaseService.handleRequest(() =>
        window.supabase
          .from('project_assignments')
          .select(`
            project_id,
            projects (
              id,
              project_name,
              user_email
            )
          `)
          .eq('freelancer_email', email)
      );

      if (error) {
        console.error('Error loading assigned projects:', error);
        
        // Check if the error is because the table doesn't exist
        if (error.code === 'PGRST205' || error.message?.includes('Could not find the table')) {
          console.warn('project_assignments table does not exist. Please run the database migration.');
          // Show user-friendly message instead of error
          projectSelect.classList.add('hidden');
          noProjectsMessage.textContent = 'Project assignments feature is not set up. Please contact your administrator to run the database migration.';
          noProjectsMessage.classList.add('show');
          startSessionBtn.disabled = true;
        } else {
          NotificationService.showError('Failed to load assigned projects.');
        }
        return;
      }

      if (!assignments || assignments.length === 0) {
        projectSelect.classList.add('hidden');
        noProjectsMessage.classList.add('show');
        startSessionBtn.disabled = true;
        return;
      }

      // Populate dropdown
      projectSelect.innerHTML = '<option value="">Select a project...</option>';
      assignments.forEach(assignment => {
        if (assignment.projects) {
          const option = document.createElement('option');
          option.value = assignment.projects.id;
          option.textContent = assignment.projects.project_name;
          projectSelect.appendChild(option);
        }
      });

      projectSelect.classList.remove('hidden');
      noProjectsMessage.classList.remove('show');
    } catch (error) {
      console.error('Error in loadAssignedProjects:', error);
      NotificationService.showError('An error occurred while loading projects.');
    }
  }

  // Start session button
  startSessionBtn.addEventListener('click', async () => {
    // Validate project selection for Freelancers
    if (isFreelancer) {
      const selectedProjectId = projectSelect.value;
      if (!selectedProjectId) {
        NotificationService.showError('Please select a project before starting the session.');
        projectSelect.focus();
        return;
      }
      StorageService.setItem('selectedProjectId', selectedProjectId);
    }

    try {
      // Create session record immediately in database
      const sessionStartTime = new Date().toISOString();
      const today = new Date().toISOString().split('T')[0];
      const sessionData = {
        user_email: email,
        start_time: sessionStartTime,
        end_time: null,
        break_duration: 0,
        active_duration: 0,
        session_date: today
      };

      // Add project_id for Freelancers
      if (isFreelancer && projectSelect.value) {
        sessionData.project_id = parseInt(projectSelect.value);
      }

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
        console.log('Created session data:', data[0]);
        console.log('Session project_id:', data[0].project_id);
        
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
