document.addEventListener('DOMContentLoaded', async () => {
  const backBtn = document.getElementById('backBtn');
  const addProjectBtn = document.getElementById('addProjectBtn');
  const projectsList = document.getElementById('projectsList');
  const loadingMessage = document.getElementById('loadingMessage');
  const noProjectsMessage = document.getElementById('noProjectsMessage');
  const addProjectModal = document.getElementById('addProjectModal');
  const projectNameInput = document.getElementById('projectNameInput');
  const saveProjectBtn = document.getElementById('saveProjectBtn');
  const cancelAddProjectBtn = document.getElementById('cancelAddProjectBtn');
  const assignmentModal = document.getElementById('assignmentModal');
  const freelancerEmailInput = document.getElementById('freelancerEmailInput');
  const assignBtn = document.getElementById('assignBtn');
  const cancelAssignBtn = document.getElementById('cancelAssignBtn');

  let currentProjectId = null;

  const userEmail = StorageService.getItem('userEmail');
  if (window.SessionSync && userEmail) {
    window.SessionSync.setEmail(userEmail);
    window.SessionSync.updateAppState(true);
  }

  window.addEventListener('session:remote-logout', async () => {
    NotificationService.showWarning('You were signed out from the reports site. Please log in again from the desktop app.');
    try {
      if (window.SessionSync && userEmail) {
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

  // Back button
  backBtn.addEventListener('click', () => {
    window.location.href = 'home.html';
  });

  // Add Project button
  addProjectBtn.addEventListener('click', () => {
    projectNameInput.value = '';
    addProjectModal.style.display = 'flex';
    addProjectModal.style.alignItems = 'center';
    addProjectModal.style.justifyContent = 'center';
    projectNameInput.focus();
  });

  // Cancel Add Project button
  cancelAddProjectBtn.addEventListener('click', () => {
    addProjectModal.style.display = 'none';
    projectNameInput.value = '';
  });

  // Close Add Project modal on background click
  addProjectModal.addEventListener('click', (e) => {
    if (e.target === addProjectModal) {
      addProjectModal.style.display = 'none';
      projectNameInput.value = '';
    }
  });

  // Save Project button
  saveProjectBtn.addEventListener('click', async () => {
    await addProject();
  });

  // Allow Enter key to save project
  projectNameInput.addEventListener('keypress', async (e) => {
    if (e.key === 'Enter') {
      await addProject();
    }
  });

  // Assignment modal handlers
  cancelAssignBtn.addEventListener('click', () => {
    assignmentModal.style.display = 'none';
    freelancerEmailInput.value = '';
    currentProjectId = null;
  });

  assignBtn.addEventListener('click', async () => {
    const freelancerEmail = freelancerEmailInput.value.trim();
    if (!freelancerEmail) {
      NotificationService.showError('Please enter a freelancer email.');
      return;
    }

    if (!ValidationService.validateEmail(freelancerEmail)) {
      NotificationService.showError('Please enter a valid email address.');
      return;
    }

    await assignProjectToFreelancer(currentProjectId, freelancerEmail);
  });

  // Close modal on background click
  assignmentModal.addEventListener('click', (e) => {
    if (e.target === assignmentModal) {
      assignmentModal.style.display = 'none';
      freelancerEmailInput.value = '';
      currentProjectId = null;
    }
  });

  // Load projects
  await loadProjects();

  async function addProject() {
    try {
      const projectName = projectNameInput.value.trim();
      
      if (!projectName) {
        NotificationService.showError('Please enter a project name.');
        projectNameInput.focus();
        return;
      }

      const email = StorageService.getItem('userEmail');
      
      if (!email) {
        NotificationService.showError('User email not found. Please log in again.');
        setTimeout(() => {
          window.location.href = 'login.html';
        }, 2000);
        return;
      }

      if (!window.supabase) {
        NotificationService.showError('Database connection not available.');
        return;
      }

      // Check if project with same name already exists
      const { data: existing, error: checkError } = await SupabaseService.handleRequest(() =>
        window.supabase
          .from('projects')
          .select('*')
          .eq('user_email', email)
          .eq('project_name', projectName)
          .maybeSingle()
      );

      if (checkError && checkError.code !== 'PGRST116') {
        console.error('Error checking project:', checkError);
        NotificationService.showError('Error checking project. Please try again.');
        return;
      }

      if (existing) {
        NotificationService.showError('A project with this name already exists.');
        projectNameInput.focus();
        return;
      }

      // Create project
      const { error: insertError } = await SupabaseService.handleRequest(() =>
        window.supabase
          .from('projects')
          .insert([{
            user_email: email,
            project_name: projectName
          }])
      );

      if (insertError) {
        console.error('Error creating project:', insertError);
        NotificationService.showError('Failed to create project. Please try again.');
        return;
      }

      NotificationService.showSuccess('Project created successfully!');
      addProjectModal.style.display = 'none';
      projectNameInput.value = '';

      // Reload projects to show the new project
      await loadProjects();
    } catch (error) {
      console.error('Error in addProject:', error);
      NotificationService.showError('An error occurred while creating the project.');
    }
  }

  async function loadProjects() {
    try {
      const email = StorageService.getItem('userEmail');
      
      if (!email) {
        NotificationService.showError('User email not found. Please log in again.');
        setTimeout(() => {
          window.location.href = 'login.html';
        }, 2000);
        return;
      }

      if (!window.supabase) {
        NotificationService.showError('Database connection not available.');
        return;
      }

      // Fetch projects from database
      const { data: projects, error } = await SupabaseService.handleRequest(() =>
        window.supabase
          .from('projects')
          .select('*')
          .eq('user_email', email)
          .order('created_at', { ascending: false })
      );

      if (error) {
        console.error('Error loading projects:', error);
        NotificationService.showError('Failed to load projects. Please try again.');
        loadingMessage.style.display = 'none';
        return;
      }

      loadingMessage.style.display = 'none';

      if (!projects || projects.length === 0) {
        noProjectsMessage.style.display = 'block';
        return;
      }

      // Display projects
      displayProjects(projects);
    } catch (error) {
      console.error('Error in loadProjects:', error);
      NotificationService.showError('An error occurred while loading projects.');
      loadingMessage.style.display = 'none';
    }
  }

  function displayProjects(projects) {
    projectsList.style.display = 'block';
    projectsList.innerHTML = '';

    projects.forEach(project => {
      const projectCard = document.createElement('div');
      projectCard.className = 'project-card';

      const projectInfo = document.createElement('div');
      projectInfo.className = 'project-card__info';

      const projectName = document.createElement('h3');
      projectName.className = 'project-card__title';
      projectName.textContent = project.project_name;

      const projectDate = document.createElement('p');
      projectDate.className = 'project-card__meta';
      const createdDate = new Date(project.created_at);
      projectDate.textContent = `Created: ${createdDate.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })}`;

      projectInfo.appendChild(projectName);
      projectInfo.appendChild(projectDate);

      const assignmentsDiv = document.createElement('div');
      assignmentsDiv.className = 'project-card__assignments';
      loadProjectAssignments(project.id, assignmentsDiv);
      projectInfo.appendChild(assignmentsDiv);

      const assignButton = document.createElement('button');
      assignButton.textContent = 'Assign to Freelancer';
      assignButton.className = 'btn-secondary project-card__assign-btn';
      assignButton.addEventListener('click', () => {
        currentProjectId = project.id;
        freelancerEmailInput.value = '';
        assignmentModal.style.display = 'flex';
        assignmentModal.style.alignItems = 'center';
        assignmentModal.style.justifyContent = 'center';
        freelancerEmailInput.focus();
      });

      projectCard.appendChild(projectInfo);
      projectCard.appendChild(assignButton);
      projectsList.appendChild(projectCard);
    });
  }

  async function loadProjectAssignments(projectId, container) {
    try {
      const { data: assignments, error } = await SupabaseService.handleRequest(() =>
        window.supabase
          .from('project_assignments')
          .select('*')
          .eq('project_id', projectId)
      );

      if (error) {
        console.error('Error loading assignments:', error);
        return;
      }

      if (assignments && assignments.length > 0) {
        const assignmentsTitle = document.createElement('p');
        assignmentsTitle.className = 'project-card__assignments-title';
        assignmentsTitle.textContent = 'Assigned to:';
        container.appendChild(assignmentsTitle);

        const assignmentsList = document.createElement('div');
        assignmentsList.className = 'project-card__assignment-list';

        assignments.forEach(assignment => {
          const assignmentTag = document.createElement('div');
          assignmentTag.className = 'project-card__assignment-chip';

          const emailSpan = document.createElement('span');
          emailSpan.className = 'project-card__assignment-email';
          emailSpan.textContent = assignment.freelancer_email;

          const removeBtn = document.createElement('button');
          removeBtn.textContent = '×';
          removeBtn.className = 'project-card__assignment-remove';
          removeBtn.addEventListener('click', async () => {
            if (confirm(`Remove ${assignment.freelancer_email} from this project?`)) {
              await removeAssignment(assignment.id, projectId);
            }
          });

          assignmentTag.appendChild(emailSpan);
          assignmentTag.appendChild(removeBtn);
          assignmentsList.appendChild(assignmentTag);
        });

        container.appendChild(assignmentsList);
      } else {
        const noAssignments = document.createElement('p');
        noAssignments.className = 'project-card__empty';
        noAssignments.textContent = 'No freelancers assigned yet';
        container.appendChild(noAssignments);
      }
    } catch (error) {
      console.error('Error in loadProjectAssignments:', error);
    }
  }

  async function assignProjectToFreelancer(projectId, freelancerEmail) {
    try {
      const clientEmail = StorageService.getItem('userEmail');

      // Check if freelancer exists
      const { data: freelancer, error: userError } = await SupabaseService.handleRequest(() =>
        window.supabase
          .from('users')
          .select('email, category')
          .eq('email', freelancerEmail)
          .maybeSingle()
      );

      if (userError || !freelancer) {
        NotificationService.showError('Freelancer not found. Please make sure they have registered.');
        return;
      }

      if (freelancer.category !== 'Freelancer') {
        NotificationService.showError('The user is not registered as a Freelancer.');
        return;
      }

      // Check if assignment already exists
      const { data: existing, error: checkError } = await SupabaseService.handleRequest(() =>
        window.supabase
          .from('project_assignments')
          .select('*')
          .eq('project_id', projectId)
          .eq('freelancer_email', freelancerEmail)
          .maybeSingle()
      );

      if (checkError && checkError.code !== 'PGRST116') {
        NotificationService.showError('Error checking assignment.');
        return;
      }

      if (existing) {
        NotificationService.showError('This project is already assigned to this freelancer.');
        return;
      }

      // Create assignment
      const { error: assignError } = await SupabaseService.handleRequest(() =>
        window.supabase
          .from('project_assignments')
          .insert([{
            project_id: projectId,
            freelancer_email: freelancerEmail,
            assigned_by: clientEmail
          }])
      );

      if (assignError) {
        console.error('Error assigning project:', assignError);
        NotificationService.showError('Failed to assign project. Please try again.');
        return;
      }

      // Create or update client-freelancer assignment
      // This ensures the relationship is stored in the database
      const { error: clientFreelancerError } = await SupabaseService.handleRequest(() =>
        window.supabase
          .from('client_freelancer_assignments')
          .upsert([{
            client_email: clientEmail,
            freelancer_email: freelancerEmail,
            is_active: true
          }], {
            onConflict: 'client_email,freelancer_email'
          })
      );

      if (clientFreelancerError) {
        // Log but don't fail - the project assignment was successful
        console.warn('Error creating client-freelancer assignment:', clientFreelancerError);
        // Continue - the project assignment is the primary action
      }

      NotificationService.showSuccess('Project assigned successfully!');
      assignmentModal.style.display = 'none';
      freelancerEmailInput.value = '';
      currentProjectId = null;

      // Reload projects to show updated assignments
      await loadProjects();
    } catch (error) {
      console.error('Error in assignProjectToFreelancer:', error);
      NotificationService.showError('An error occurred while assigning the project.');
    }
  }

  async function removeAssignment(assignmentId, projectId) {
    try {
      const { error } = await SupabaseService.handleRequest(() =>
        window.supabase
          .from('project_assignments')
          .delete()
          .eq('id', assignmentId)
      );

      if (error) {
        console.error('Error removing assignment:', error);
        NotificationService.showError('Failed to remove assignment. Please try again.');
        return;
      }

      NotificationService.showSuccess('Assignment removed successfully!');
      
      // Reload projects to show updated assignments
      await loadProjects();
    } catch (error) {
      console.error('Error in removeAssignment:', error);
      NotificationService.showError('An error occurred while removing the assignment.');
    }
  }
});

