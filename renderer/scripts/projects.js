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

    const container = document.createElement('div');
    container.style.cssText = 'display: grid; gap: 16px;';

    projects.forEach((project, index) => {
      const projectCard = document.createElement('div');
      projectCard.style.cssText = `
        background: linear-gradient(135deg, rgba(51, 65, 85, 0.95) 0%, rgba(30, 41, 59, 0.95) 100%);
        border: 1px solid #475569;
        border-radius: 12px;
        padding: 20px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        transition: all 0.3s ease;
      `;
      
      projectCard.addEventListener('mouseenter', () => {
        projectCard.style.borderColor = '#64748b';
        projectCard.style.transform = 'translateY(-2px)';
        projectCard.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3)';
      });
      
      projectCard.addEventListener('mouseleave', () => {
        projectCard.style.borderColor = '#475569';
        projectCard.style.transform = 'translateY(0)';
        projectCard.style.boxShadow = 'none';
      });

      const projectInfo = document.createElement('div');
      projectInfo.style.cssText = 'flex: 1;';

      const projectName = document.createElement('h3');
      projectName.style.cssText = 'margin: 0 0 8px 0; color: #e2e8f0; font-size: 1.2rem; font-weight: 600;';
      projectName.textContent = project.project_name;

      const projectDate = document.createElement('p');
      projectDate.style.cssText = 'margin: 0; color: #94a3b8; font-size: 0.9rem;';
      const createdDate = new Date(project.created_at);
      projectDate.textContent = `Created: ${createdDate.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      })}`;

      projectInfo.appendChild(projectName);
      projectInfo.appendChild(projectDate);

      // Load and display assignments
      const assignmentsDiv = document.createElement('div');
      assignmentsDiv.style.cssText = 'margin-top: 12px;';
      loadProjectAssignments(project.id, assignmentsDiv);

      projectInfo.appendChild(assignmentsDiv);

      // Assign button
      const assignButton = document.createElement('button');
      assignButton.textContent = 'Assign to Freelancer';
      assignButton.className = 'btn-secondary';
      assignButton.style.cssText = 'margin-left: 16px;';
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

    projectsList.appendChild(container);
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
        assignmentsTitle.style.cssText = 'margin: 8px 0 4px 0; color: #cbd5e1; font-size: 0.9rem; font-weight: 600;';
        assignmentsTitle.textContent = 'Assigned to:';
        container.appendChild(assignmentsTitle);

        const assignmentsList = document.createElement('div');
        assignmentsList.style.cssText = 'display: flex; flex-wrap: wrap; gap: 8px;';

        assignments.forEach(assignment => {
          const assignmentTag = document.createElement('div');
          assignmentTag.style.cssText = `
            display: inline-flex;
            align-items: center;
            gap: 8px;
            background: rgba(59, 130, 246, 0.2);
            border: 1px solid rgba(59, 130, 246, 0.4);
            padding: 6px 12px;
            border-radius: 6px;
            font-size: 0.85rem;
          `;

          const emailSpan = document.createElement('span');
          emailSpan.style.cssText = 'color: #93c5fd;';
          emailSpan.textContent = assignment.freelancer_email;

          const removeBtn = document.createElement('button');
          removeBtn.textContent = '×';
          removeBtn.style.cssText = `
            background: rgba(239, 68, 68, 0.3);
            border: none;
            color: #fca5a5;
            border-radius: 50%;
            width: 20px;
            height: 20px;
            cursor: pointer;
            font-size: 16px;
            line-height: 1;
            padding: 0;
            display: flex;
            align-items: center;
            justify-content: center;
          `;
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
        noAssignments.style.cssText = 'margin: 8px 0 0 0; color: #64748b; font-size: 0.85rem; font-style: italic;';
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

