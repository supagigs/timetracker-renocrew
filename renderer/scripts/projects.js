document.addEventListener('DOMContentLoaded', async () => {
  // If there was an active session that wasn't closed (e.g. app killed), save it first.
  if (typeof StorageService !== 'undefined' && StorageService.getItem('isActive') === 'true' && StorageService.getItem('sessionStartTime')) {
    window.location.href = 'startProject.html?recover=1';
    return;
  }

  const projectsList = document.getElementById('projectsList');
  const loadingMessage = document.getElementById('loadingMessage');
  const noProjectsMessage = document.getElementById('noProjectsMessage');
  const viewReportsBtn = document.getElementById('viewReportsBtn');
  const searchInput = document.getElementById('searchInput');
  const userAvatar = document.getElementById('userAvatar');
  const projectsMenuTrigger = document.getElementById('projectsMenuTrigger');
  const projectsMenuDropdown = document.getElementById('projectsMenuDropdown');
  const projectsMenuApplyLeave = document.getElementById('projectsMenuApplyLeave');
  const projectsMenuLogout = document.getElementById('projectsMenuLogout');

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

  /**
   * Fetch projects from Supabase project_users and projects tables.
   * No Frappe API call - uses local database.
   */
  async function fetchProjectsFromSupabase(userEmail) {
    if (!userEmail || !window.supabase) {
      console.warn('Cannot fetch projects: missing userEmail or Supabase');
      return [];
    }
    try {
      // 1) Get user_id from users table by email
      const { data: userRow, error: userError } = await window.supabase
        .from('users')
        .select('id')
        .eq('email', userEmail.toLowerCase().trim())
        .maybeSingle();

      if (userError) {
        console.error('Error fetching user for projects:', userError);
        return [];
      }
      if (!userRow) {
        console.warn('No user found for email:', userEmail);
        return [];
      }

      const userId = userRow.id;

      // 2) Get project_ids from project_users for this user
      const { data: projectUsers, error: puError } = await window.supabase
        .from('project_users')
        .select('project_id')
        .eq('user_id', userId);

      if (puError) {
        console.error('Error fetching project_users:', puError);
        return [];
      }
      if (!projectUsers || projectUsers.length === 0) {
        return [];
      }

      const projectIds = projectUsers.map((pu) => pu.project_id);

      // 3) Get project details (frappe_project_id, project_name) from projects
      const { data: projects, error: projError } = await window.supabase
        .from('projects')
        .select('id, frappe_project_id, project_name')
        .in('id', projectIds);

      if (projError) {
        console.error('Error fetching projects:', projError);
        return [];
      }

      // Return in format expected by UI: { id: frappe_project_id, name: project_name }
      return (projects || []).map((p) => ({
        id: p.frappe_project_id || p.id,
        name: p.project_name || p.id,
        description: p.project_name || null
      }));
    } catch (err) {
      console.error('fetchProjectsFromSupabase error:', err);
      return [];
    }
  }

  // Load projects from Supabase (project_users + projects tables)
  async function loadProjects() {
    try {
      loadingMessage.style.display = 'block';
      projectsList.style.display = 'none';
      noProjectsMessage.style.display = 'none';

      const projects = await fetchProjectsFromSupabase(userEmail);
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
            // const { data: sessions, error } = await window.supabase
            //   .from('time_sessions')
            //   .select('active_duration, break_duration, idle_duration, total_duration, session_date, start_time')
            //   .eq('frappe_project_id', project.id)
            //   .eq('user_email', userEmail);

            // if (error) {
            //   console.error('Error fetching sessions for project:', project.id, error);
            //   return { ...project, totalTime: 0, lastWorked: null, lastWorkedDaySeconds: 0, todaySeconds: 0 };
            // }

            // If you commented out the supabase call, add this line:
            const sessions = []; // new for now, will be replaced with the supabase call

            const {
              totalTime,
              lastWorked,
              lastWorkedDaySeconds,
              todaySeconds,
              lastWorkedDateKey
            } = calculateProjectTimeData(project.id, sessions);

            return {
              ...project,
              totalTime,
              lastWorked,
              lastWorkedDaySeconds,
              todaySeconds,
              lastWorkedDateKey
            };
          } catch (err) {
            console.error('Error processing project:', project.id, err);
              return { ...project, totalTime: 0, lastWorked: null, lastWorkedDaySeconds: 0, todaySeconds: 0 };
          }
        })
      );

      // Store the enriched project list (including time data) for search/filtering
      allProjects = projectsWithTime || [];

      displayProjects(allProjects);
      
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

  /**
   * Calculate total time and per-day time details for a project's sessions.
   * Returns overall total time, most recent work date, the total time for that
   * most recent day, and the total time worked today.
   *
   * @param {string} projectId
   * @param {Array} sessions
   * @returns {{
   *   totalTime: number,
   *   lastWorked: Date | null,
   *   lastWorkedDaySeconds: number,
   *   todaySeconds: number
   * }}
   */
  /** Get local date string YYYY-MM-DD from a Date or ISO string (used so "today" is user's calendar day, not UTC). */
  function toLocalDateKey(dateOrString) {
    const d = typeof dateOrString === 'string' ? new Date(dateOrString) : dateOrString;
    if (isNaN(d.getTime())) return null;
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const day = d.getDate();
    return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  function calculateProjectTimeData(projectId, sessions) {
    const dailyTotals = {};
    let totalSeconds = 0;

    const now = new Date();
    const todayKey = toLocalDateKey(now); // User's local "today" (YYYY-MM-DD)

    (sessions || []).forEach((s) => {
      let sessionTime = 0;

      if (s.total_duration && !isNaN(s.total_duration)) {
        sessionTime = parseInt(s.total_duration, 10) || 0;
      } else {
        const active = parseInt(s.active_duration || 0, 10) || 0;
        const breakTime = parseInt(s.break_duration || 0, 10) || 0;
        const idle = parseInt(s.idle_duration || 0, 10) || 0;
        sessionTime = active + breakTime + idle;
      }

      if (sessionTime > 86400) {
        console.warn(`Unusually large session time detected: ${sessionTime} seconds for project ${projectId}`);
        sessionTime = Math.min(sessionTime, 86400);
      }

      totalSeconds += sessionTime;

      // Bucket by the session's calendar day in the user's local timezone
      const rawDate = s.session_date || s.start_time;
      if (!rawDate) return;
      const dateKey = toLocalDateKey(rawDate);
      if (!dateKey) return;
      dailyTotals[dateKey] = (dailyTotals[dateKey] || 0) + sessionTime;
    });

    let lastWorked = null;
    let lastWorkedDaySeconds = 0;
    let lastWorkedDateKey = null; // Keep local date string for getDateLabel

    const dateKeys = Object.keys(dailyTotals);
    if (dateKeys.length > 0) {
      dateKeys.sort((a, b) => new Date(b) - new Date(a));
      const mostRecentKey = dateKeys[0];
      lastWorkedDateKey = mostRecentKey;
      lastWorked = new Date(mostRecentKey + 'T12:00:00'); // Noon local so getDateLabel compares correct calendar day
      lastWorkedDaySeconds = dailyTotals[mostRecentKey] || 0;
    }

    const todaySeconds = dailyTotals[todayKey] || 0;

    return {
      totalTime: totalSeconds,
      lastWorked,
      lastWorkedDaySeconds,
      todaySeconds,
      lastWorkedDateKey // so display can use local date for "Today" vs "X days ago"
    };
  }

  // Display projects grouped by time
  function displayProjects(projects) {
    projectsList.innerHTML = '';

    // Sort all projects by lastWorked date (most recent first)
    const sortedProjects = [...projects].sort((a, b) => {
      // Projects with lastWorked come first, sorted by date (most recent first)
      if (a.lastWorked && b.lastWorked) {
        return new Date(b.lastWorked) - new Date(a.lastWorked);
      }
      if (a.lastWorked && !b.lastWorked) return -1;
      if (!a.lastWorked && b.lastWorked) return 1;
      // If neither has lastWorked, maintain original order
      return 0;
    });

    // Group projects by last worked date
    const grouped = {};
    sortedProjects.forEach(project => {
      const label = getDateLabel(project.lastWorked) || 'Older';
      if (!grouped[label]) {
        grouped[label] = [];
      }
      grouped[label].push(project);
    });

    // Sort groups by the most recent project in each group (ascending = most recent first)
    const sortedGroups = Object.keys(grouped).sort((a, b) => {
      const groupA = grouped[a];
      const groupB = grouped[b];
      
      // Get the most recent date in each group
      const mostRecentA = groupA.length > 0 && groupA[0].lastWorked 
        ? new Date(groupA[0].lastWorked) 
        : new Date(0);
      const mostRecentB = groupB.length > 0 && groupB[0].lastWorked 
        ? new Date(groupB[0].lastWorked) 
        : new Date(0);
      
      // Sort descending (most recent first)
      return mostRecentB - mostRecentA;
    });

    sortedGroups.forEach(groupLabel => {
      const groupProjects = grouped[groupLabel];
      
      // Sort projects within group by lastWorked (most recent first)
      groupProjects.sort((a, b) => {
        if (a.lastWorked && b.lastWorked) {
          return new Date(b.lastWorked) - new Date(a.lastWorked);
        }
        if (a.lastWorked && !b.lastWorked) return -1;
        if (!a.lastWorked && b.lastWorked) return 1;
        return 0;
      });
      
      const groupDiv = document.createElement('div');
      groupDiv.className = 'projects-time-group';

      const headerDiv = document.createElement('div');
      headerDiv.className = 'projects-time-header';

      const labelSpan = document.createElement('span');
      labelSpan.className = 'projects-time-label';
      labelSpan.textContent = groupLabel;

      headerDiv.appendChild(labelSpan);
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
        // Show ONLY today's time for this project. If there was no work today,
        // this will correctly display as 00:00:00.
        const todaySeconds = typeof project.todaySeconds === 'number'
          ? project.todaySeconds
          : 0;
        projectTime.textContent = formatTime(todaySeconds);

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

  // Handle project click (navigate to start project screen)
  function handleProjectClick(project) {
    StorageService.setItem('selectedProjectId', project.id);
    StorageService.setItem('selectedProjectName', project.name);
    window.location.href = `startProject.html?projectId=${project.id}`;
  }

  // Menu dropdown: toggle on trigger click, close on outside click
  function closeMenu() {
    projectsMenuDropdown.hidden = true;
    projectsMenuTrigger.setAttribute('aria-expanded', 'false');
  }

  projectsMenuTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = !projectsMenuDropdown.hidden;
    projectsMenuDropdown.hidden = isOpen;
    projectsMenuTrigger.setAttribute('aria-expanded', String(!isOpen));
  });

  document.addEventListener('click', () => closeMenu());
  projectsMenuDropdown.addEventListener('click', (e) => e.stopPropagation());

  projectsMenuApplyLeave.addEventListener('click', () => {
    closeMenu();
    // Apply Leave: open leave application for the current user (same URL pattern as View Reports, then /app/leave-application/new)
    const reportsBaseUrl = (window.env && window.env.REPORTS_URL) || '';
    const email = StorageService.getItem('userEmail');

    if (!reportsBaseUrl) {
      NotificationService.showError('Leave application URL is not configured.');
      return;
    }
    if (!email) {
      NotificationService.showError('User email not available. Please log in again.');
      return;
    }

    const encodedEmail = encodeURIComponent(email);
    let baseWithEmail = reportsBaseUrl.trim();

    if (baseWithEmail.includes('{email}')) {
      baseWithEmail = baseWithEmail.replace('{email}', encodedEmail);
    } else if (baseWithEmail.includes('%EMAIL%')) {
      baseWithEmail = baseWithEmail.replace('%EMAIL%', encodedEmail);
    } else {
      if (!baseWithEmail.endsWith('/')) baseWithEmail += '/';
      baseWithEmail += `reports/${encodedEmail}`;
    }

    const leaveUrl = baseWithEmail.replace(/\/$/, '') + '/app/leave-application/new';
    window.electronAPI.openExternalUrl(leaveUrl).catch(() => {
      NotificationService.showError('Unable to open leave application.');
    });
  });

  async function performLogout(options = {}) {
    const { skipConfirm = false, remote = false } = options;

    if (!skipConfirm) {
      const confirmed = confirm('Are you sure you want to logout?');
      if (!confirmed) return;
    }

    try {
      const isActive = StorageService.getItem('isActive') === 'true';
      const sessionStartTime = StorageService.getItem('sessionStartTime');

      if (isActive && sessionStartTime) {
        const now = new Date();
        const sessionDuration = Math.floor((now - new Date(sessionStartTime)) / 1000);
        const totalActiveDuration = parseInt(StorageService.getItem('activeDuration') || '0');
        const totalBreakDuration = parseInt(StorageService.getItem('breakDuration') || '0');
        const isOnBreak = StorageService.getItem('isOnBreak') === 'true';
        const workStartTime = StorageService.getItem('workStartTime');
        const breakStartTime = StorageService.getItem('breakStartTime');
        const isIdle = StorageService.getItem('isIdle') === 'true';

        let finalActiveDuration = totalActiveDuration;
        let finalBreakDuration = totalBreakDuration;
        if (isActive && !isOnBreak && !isIdle && workStartTime) {
          finalActiveDuration += Math.floor((now - new Date(workStartTime)) / 1000);
        }
        if (isOnBreak && breakStartTime) {
          finalBreakDuration += Math.floor((now - new Date(breakStartTime)) / 1000);
        }

        const email = StorageService.getItem('userEmail');
        const currentSessionId = StorageService.getItem('currentSessionId');
        const today = new Date().toISOString().split('T')[0];

        if (window.supabase && email) {
          await window.supabase.from('time_sessions').upsert([{
            id: currentSessionId,
            user_email: email,
            start_time: sessionStartTime,
            end_time: now.toISOString(),
            total_duration: sessionDuration,
            break_duration: finalBreakDuration,
            active_duration: finalActiveDuration,
            session_date: today
          }]);
        }
      }

      StorageService.removeItem('userEmail');
      StorageService.removeItem('displayName');
      StorageService.removeItem('userCategory');
      StorageService.removeItem('sessionStartTime');
      StorageService.removeItem('currentSessionId');
      StorageService.removeItem('workStartTime');
      StorageService.removeItem('isActive');
      StorageService.removeItem('isOnBreak');
      StorageService.removeItem('breakStartTime');
      StorageService.removeItem('breakDuration');
      StorageService.removeItem('activeDuration');
      StorageService.removeItem('breakCount');
      StorageService.removeItem('totalIdleTime');
      StorageService.removeItem('isIdle');
      StorageService.removeItem('idleStartTime');
      StorageService.removeItem('screenshotCaptureActive');

      if (window.SessionSync && userEmail) {
        await window.SessionSync.updateAppState(false);
        window.SessionSync.clear();
      }

      if (window.electronAPI?.setUserLoggedIn) {
        window.electronAPI.setUserLoggedIn(false).catch(err => console.error('Failed to update logged-in state during logout:', err));
      }

      window.location.href = 'login.html';
    } catch (error) {
      console.error('Error during logout from projects:', error);
      if (!remote) {
        alert('Error saving session before logout. Please try again.');
      }
    }
  }

  projectsMenuLogout.addEventListener('click', () => {
    closeMenu();
    performLogout({ skipConfirm: false, remote: false });
  });

  window.addEventListener('session:remote-logout', () => {
    NotificationService.showWarning('You were signed out from the reports site. Please log in again from the desktop app.');
    performLogout({ skipConfirm: true, remote: true });
  });

  // Search functionality
  searchInput.addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase();
    if (!searchTerm) {
      // When the search is cleared, show all projects with their cached time data
      displayProjects(allProjects);
      return;
    }

    // Filter and re-display using cached project + time data
    const filtered = allProjects.filter(p => 
      (p.name || '').toLowerCase().includes(searchTerm) ||
      (p.description || '').toLowerCase().includes(searchTerm) ||
      (p.id || '').toLowerCase().includes(searchTerm)
    );
    displayProjects(filtered);
  });

  // View Reports button
  viewReportsBtn.addEventListener('click', () => {
    const reportsBaseUrl = (window.env && window.env.REPORTS_URL) || '';
    const email = StorageService.getItem('userEmail');

    if (!reportsBaseUrl) {
      NotificationService.showError('Reports site URL is not configured yet.');
      return;
    }

    if (!email) {
      NotificationService.showError('User email not available. Please log in again.');
      return;
    }

    const encodedEmail = encodeURIComponent(email);
    let targetUrl = reportsBaseUrl.trim();

    if (targetUrl.includes('{email}')) {
      targetUrl = targetUrl.replace('{email}', encodedEmail);
    } else if (targetUrl.includes('%EMAIL%')) {
      targetUrl = targetUrl.replace('%EMAIL%', encodedEmail);
    } else {
      if (!targetUrl.endsWith('/')) {
        targetUrl += '/';
      }
      targetUrl += `reports/${encodedEmail}`;
    }

    console.log('Opening reports site:', targetUrl);
    window.electronAPI.openExternalUrl(targetUrl)
      .then((ok) => {
        if (!ok) {
          NotificationService.showError('Unable to open the reports site.');
        }
      })
      .catch((error) => {
        console.error('openExternalUrl failed:', error);
        NotificationService.showError('Unable to open the reports site.');
      });
  });

  // Initial load
  await loadProjects();
});
