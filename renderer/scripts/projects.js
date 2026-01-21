document.addEventListener('DOMContentLoaded', async () => {
  const projectsList = document.getElementById('projectsList');
  const loadingMessage = document.getElementById('loadingMessage');
  const noProjectsMessage = document.getElementById('noProjectsMessage');
  const viewReportsBtn = document.getElementById('viewReportsBtn');
  const searchInput = document.getElementById('searchInput');
  const userAvatar = document.getElementById('userAvatar');

  // Set up user avatar (default placeholder)
  const userEmail = StorageService.getItem('userEmail');
  if (userEmail) {
    // Create a simple avatar with first letter
    const firstLetter = userEmail.charAt(0).toUpperCase();
    userAvatar.textContent = firstLetter;
    userAvatar.style.display = 'flex';
    userAvatar.style.alignItems = 'center';
    userAvatar.style.justifyContent = 'center';
    userAvatar.style.fontSize = '14px';
    userAvatar.style.fontWeight = '600';
    userAvatar.style.color = '#294359';
    userAvatar.style.background = '#E5E7EB';
  }

  let allProjects = [];

  // Load projects from Frappe
  async function loadProjects() {
    try {
      loadingMessage.style.display = 'block';
      projectsList.style.display = 'none';
      noProjectsMessage.style.display = 'none';

      const projects = await window.frappe.getUserProjects();
      allProjects = projects || [];

      if (!allProjects || allProjects.length === 0) {
        loadingMessage.style.display = 'none';
        noProjectsMessage.style.display = 'block';
        return;
      }

      // Fetch time worked for each project from Supabase
      const projectsWithTime = await Promise.all(
        allProjects.map(async (project) => {
          try {
            // Get time sessions for this project
            const { data: sessions, error } = await window.supabase
              .from('time_sessions')
              .select('active_duration, break_duration, idle_duration, total_duration, session_date, start_time')
              .eq('frappe_project_id', project.id)
              .eq('user_email', userEmail);

            if (error) {
              console.error('Error fetching sessions for project:', project.id, error);
              return { ...project, totalTime: 0, lastWorked: null };
            }

            // Calculate total time - use total_duration if available, otherwise sum the components
            const totalSeconds = (sessions || []).reduce((sum, s) => {
              // Ensure we're working with numbers and handle null/undefined
              let sessionTime = 0;
              
              if (s.total_duration && !isNaN(s.total_duration)) {
                sessionTime = parseInt(s.total_duration, 10) || 0;
              } else {
                // Fallback: calculate from components
                const active = parseInt(s.active_duration || 0, 10) || 0;
                const breakTime = parseInt(s.break_duration || 0, 10) || 0;
                const idle = parseInt(s.idle_duration || 0, 10) || 0;
                sessionTime = active + breakTime + idle;
              }
              
              // Validate the session time is reasonable (not more than 24 hours in a single session)
              // If it's unreasonably large, cap it or log a warning
              if (sessionTime > 86400) { // More than 24 hours in a single session
                console.warn(`Unusually large session time detected: ${sessionTime} seconds for project ${project.id}`);
                // Cap at 24 hours to prevent display issues
                sessionTime = Math.min(sessionTime, 86400);
              }
              
              return sum + sessionTime;
            }, 0);
            
            // Get most recent work date
            let lastWorked = null;
            if (sessions && sessions.length > 0) {
              const sorted = sessions
                .filter(s => s.session_date || s.start_time)
                .sort((a, b) => {
                  const dateA = a.session_date || a.start_time;
                  const dateB = b.session_date || b.start_time;
                  return new Date(dateB) - new Date(dateA);
                });
              if (sorted.length > 0) {
                lastWorked = new Date(sorted[0].session_date || sorted[0].start_time);
              }
            }

            return {
              ...project,
              totalTime: totalSeconds,
              lastWorked: lastWorked
            };
          } catch (err) {
            console.error('Error processing project:', project.id, err);
            return { ...project, totalTime: 0, lastWorked: null };
          }
        })
      );

      displayProjects(projectsWithTime);
      
      loadingMessage.style.display = 'none';
      projectsList.style.display = 'flex';

    } catch (err) {
      console.error('Failed to load projects:', err);
      NotificationService.showError(
        err.message || 'Failed to load projects'
      );
      loadingMessage.style.display = 'none';
      noProjectsMessage.style.display = 'block';
    }
  }

  // Format time as HH:MM:SS
  function formatTime(seconds) {
    // Ensure seconds is a valid number
    if (!seconds || isNaN(seconds) || seconds < 0) {
      return '00:00:00';
    }
    
    // Handle very large values that might indicate data corruption
    // If more than 8760 hours (1 year), show a warning format
    const totalHours = seconds / 3600;
    if (totalHours > 8760) {
      const days = Math.floor(totalHours / 24);
      const remainingHours = Math.floor(totalHours % 24);
      const minutes = Math.floor((seconds % 3600) / 60);
      const secs = Math.floor(seconds % 60);
      // Show as days if over a year
      if (days > 365) {
        return `${days}d ${String(remainingHours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
      }
      return `${days}d ${String(remainingHours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    
    // Normal format for reasonable values
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    // For hours, don't pad - show actual number but ensure at least 2 digits for display consistency
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  // Format date label (Today, 2 days ago, etc.)
  function getDateLabel(date) {
    if (!date) return null;
    
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const projectDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    
    const diffTime = today - projectDate;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return '1 day ago';
    if (diffDays === 2) return '2 days ago';
    if (diffDays === 7) return '7 days ago';
    return `${diffDays} days ago`;
  }

  // Display projects grouped by time
  function displayProjects(projects) {
    projectsList.innerHTML = '';

    // Group projects by last worked date
    const grouped = {};
    projects.forEach(project => {
      const label = getDateLabel(project.lastWorked) || 'Older';
      if (!grouped[label]) {
        grouped[label] = [];
      }
      grouped[label].push(project);
    });

    // Sort groups: Today first, then by recency
    const groupOrder = ['Today', '1 day ago', '2 days ago', '7 days ago', 'Older'];
    const sortedGroups = Object.keys(grouped).sort((a, b) => {
      const aIndex = groupOrder.indexOf(a) !== -1 ? groupOrder.indexOf(a) : 999;
      const bIndex = groupOrder.indexOf(b) !== -1 ? groupOrder.indexOf(b) : 999;
      return aIndex - bIndex;
    });

    sortedGroups.forEach(groupLabel => {
      const groupProjects = grouped[groupLabel];
      
      // Calculate total work time for the group
      const groupTotalTime = groupProjects.reduce((sum, p) => sum + p.totalTime, 0);

      const groupDiv = document.createElement('div');
      groupDiv.className = 'projects-time-group';

      const headerDiv = document.createElement('div');
      headerDiv.className = 'projects-time-header';

      const labelSpan = document.createElement('span');
      labelSpan.className = 'projects-time-label';
      labelSpan.textContent = groupLabel;

      const timeSpan = document.createElement('span');
      timeSpan.className = 'projects-work-time';
      timeSpan.textContent = `Work Time ${formatTime(groupTotalTime)}`;

      headerDiv.appendChild(labelSpan);
      headerDiv.appendChild(timeSpan);
      groupDiv.appendChild(headerDiv);

      groupProjects.forEach(project => {
        const projectItem = document.createElement('div');
        projectItem.className = 'projects-project-item';

        const projectInfo = document.createElement('div');
        projectInfo.className = 'projects-project-info';

        const projectName = document.createElement('h3');
        projectName.className = 'projects-project-name';
        projectName.textContent = project.name || project.id;

        const projectDesc = document.createElement('p');
        projectDesc.className = 'projects-project-description';
        // Use project name as description, or create a default description
        projectDesc.textContent = project.description || project.name || `Project: ${project.id}`;

        projectInfo.appendChild(projectName);
        projectInfo.appendChild(projectDesc);

        const projectControls = document.createElement('div');
        projectControls.className = 'projects-project-controls';

        // Play icon (SVG)
        const playIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        playIcon.setAttribute('width', '22');
        playIcon.setAttribute('height', '22');
        playIcon.setAttribute('viewBox', '0 0 22 22');
        playIcon.setAttribute('fill', 'none');
        playIcon.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        playIcon.classList.add('projects-play-icon');
        playIcon.innerHTML = '<path d="M10.75 0C16.6871 0 21.5 4.81294 21.5 10.75C21.5 16.6871 16.6871 21.5 10.75 21.5C4.81294 21.5 0 16.6871 0 10.75C0 4.81294 4.81294 0 10.75 0ZM10.876 7.26562C9.64658 6.44636 8 7.3282 8 8.80566V12.6943C8 14.1719 9.64655 15.053 10.876 14.2334L13.793 12.2891C14.8914 11.5568 14.8913 9.94322 13.793 9.21094L10.876 7.26562Z" fill="#1D4ED8" style="fill:#1D4ED8;fill:color(display-p3 0.1137 0.3059 0.8471);fill-opacity:1;"/>';
        playIcon.style.cursor = 'pointer';
        playIcon.addEventListener('click', (e) => {
          e.stopPropagation();
          handleProjectClick(project);
        });

        const projectTime = document.createElement('span');
        projectTime.className = 'projects-project-time';
        projectTime.textContent = formatTime(project.totalTime);

        projectControls.appendChild(playIcon);
        projectControls.appendChild(projectTime);

        projectItem.appendChild(projectInfo);
        projectItem.appendChild(projectControls);

        projectItem.addEventListener('click', () => handleProjectClick(project));

        groupDiv.appendChild(projectItem);
      });

      projectsList.appendChild(groupDiv);
    });
  }

  // Handle project click (navigate to task selection)
  function handleProjectClick(project) {
    StorageService.setItem('selectedProjectId', project.id);
    StorageService.setItem('selectedProjectName', project.name);
    window.location.href = `selectTask.html?projectId=${project.id}`;
  }

  // Search functionality
  searchInput.addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase();
    if (!searchTerm) {
      loadProjects();
      return;
    }

    // Filter and re-display
    const filtered = allProjects.filter(p => 
      (p.name || '').toLowerCase().includes(searchTerm) ||
      (p.description || '').toLowerCase().includes(searchTerm) ||
      (p.id || '').toLowerCase().includes(searchTerm)
    );

    // Re-fetch time data for filtered projects
    Promise.all(
      filtered.map(async (project) => {
        try {
          const { data: sessions } = await window.supabase
            .from('time_sessions')
            .select('active_duration, break_duration, idle_duration, total_duration, session_date, start_time')
            .eq('frappe_project_id', project.id)
            .eq('user_email', userEmail);

          const totalSeconds = (sessions || []).reduce((sum, s) => {
            // Ensure we're working with numbers and handle null/undefined
            let sessionTime = 0;

            if (s.total_duration && !isNaN(s.total_duration)) {
              sessionTime = parseInt(s.total_duration, 10) || 0;
            } else {
              // Fallback: calculate from components
              const active = parseInt(s.active_duration || 0, 10) || 0;
              const breakTime = parseInt(s.break_duration || 0, 10) || 0;
              const idle = parseInt(s.idle_duration || 0, 10) || 0;
              sessionTime = active + breakTime + idle;
            }

            // Validate the session time is reasonable (not more than 24 hours in a single session)
            if (sessionTime > 86400) { // More than 24 hours
              console.warn(`Unusually large session time detected: ${sessionTime} seconds for project ${project.id}`);
              sessionTime = Math.min(sessionTime, 86400);
            }

            return sum + sessionTime;
          }, 0);
          let lastWorked = null;
          if (sessions && sessions.length > 0) {
            const sorted = sessions
              .filter(s => s.session_date || s.start_time)
              .sort((a, b) => {
                const dateA = a.session_date || a.start_time;
                const dateB = b.session_date || b.start_time;
                return new Date(dateB) - new Date(dateA);
              });
            if (sorted.length > 0) {
              lastWorked = new Date(sorted[0].session_date || sorted[0].start_time);
            }
          }

          return { ...project, totalTime: totalSeconds, lastWorked };
        } catch (err) {
          return { ...project, totalTime: 0, lastWorked: null };
        }
      })
    ).then(projectsWithTime => {
      displayProjects(projectsWithTime);
    });
  });

  // View Reports button
  viewReportsBtn.addEventListener('click', () => {
    window.location.href = 'report.html';
  });

  // Initial load
  await loadProjects();
});
