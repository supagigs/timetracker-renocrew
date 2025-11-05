document.addEventListener('DOMContentLoaded', () => {
  const welcomeText = document.getElementById('welcomeText');
  const clockInBtn = document.getElementById('clockInBtn');
  const projectsBtn = document.getElementById('projectsBtn');
  const reportBtn = document.getElementById('reportBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const infoText = document.getElementById('infoText');

  // Set welcome message
  const displayName = StorageService.getItem('displayName') || 'User';
  welcomeText.textContent = `Hello, ${displayName}!`;

  // Check user category
  const userCategory = StorageService.getItem('userCategory');
  const isClient = userCategory === 'Client';

  // Configure UI based on user category
  if (isClient) {
    // Hide Clock In button for Clients
    clockInBtn.style.display = 'none';
    // Show Projects button
    projectsBtn.style.display = 'inline-block';
    // Update info text
    infoText.textContent = 'Manage your projects and view reports';
    
    // Projects button event listener
    projectsBtn.addEventListener('click', () => {
      window.location.href = 'projects.html';
    });
  } else {
    // Show Clock In button for Freelancers
    clockInBtn.style.display = 'inline-block';
    // Hide Projects button
    projectsBtn.style.display = 'none';
    // Check for active timer
    checkActiveTimer();
  }

  // Remove the original clockInBtn event listener since it's now handled in checkActiveTimer
  // clockInBtn.addEventListener('click', () => {
  //   // Go to clock-in screen
  //   window.location.href = 'clockIn.html';
  // });

  reportBtn.addEventListener('click', () => {
    const reportsBaseUrl = (window.env && window.env.REPORTS_URL) || '';
    const email = StorageService.getItem('userEmail');

    if (!reportsBaseUrl) {
      NotificationService.showError('Reports site URL is not configured yet.');
      return;
    }

    let targetUrl = reportsBaseUrl.trim();

    // If the URL contains a placeholder, inject the email; otherwise open as-is
    if (targetUrl.includes('{email}') || targetUrl.includes('%EMAIL%')) {
      if (!email) {
        NotificationService.showError('User email not available. Please log in again.');
        return;
      }
      const encodedEmail = encodeURIComponent(email);
      if (targetUrl.includes('{email}')) {
        targetUrl = targetUrl.replace('{email}', encodedEmail);
      } else if (targetUrl.includes('%EMAIL%')) {
        targetUrl = targetUrl.replace('%EMAIL%', encodedEmail);
      }
    }

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

  logoutBtn.addEventListener('click', async () => {
    if (confirm('Are you sure you want to logout?')) {
      try {
        // Check if there's an active session and save it
        const isActive = StorageService.getItem('isActive') === 'true';
        const sessionStartTime = StorageService.getItem('sessionStartTime');
        
        if (isActive && sessionStartTime) {
          console.log('Saving active session before logout from home page...');
          
          // We need to calculate the session data
          const now = new Date();
          const sessionDuration = Math.floor((now - new Date(sessionStartTime)) / 1000);
          
          // Get stored durations
          const totalActiveDuration = parseInt(StorageService.getItem('activeDuration') || '0');
          const totalBreakDuration = parseInt(StorageService.getItem('breakDuration') || '0');
          const isOnBreak = StorageService.getItem('isOnBreak') === 'true';
          const workStartTime = StorageService.getItem('workStartTime');
          const breakStartTime = StorageService.getItem('breakStartTime');
          
          let finalActiveDuration = totalActiveDuration;
          let finalBreakDuration = totalBreakDuration;
          
          // Add current work time if not on break
          if (isActive && !isOnBreak && workStartTime) {
            const workElapsed = Math.floor((now - new Date(workStartTime)) / 1000);
            finalActiveDuration += workElapsed;
          }
          
          // Add current break time if on break
          if (isOnBreak && breakStartTime) {
            const breakElapsed = Math.floor((now - new Date(breakStartTime)) / 1000);
            finalBreakDuration += breakElapsed;
          }
          
          // Save session to database
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
            
            console.log('Session saved successfully before logout from home');
          }
        }
        
        // Clear all user data
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
        StorageService.removeItem('screenshotCaptureActive');

        // Redirect to login
        window.location.href = 'login.html';
        
      } catch (error) {
        console.error('Error during logout from home:', error);
        alert('Error saving session before logout. Please try again.');
      }
    }
  });

  function checkActiveTimer() {
    const isActive = StorageService.getItem('isActive') === 'true';
    const sessionStartTime = StorageService.getItem('sessionStartTime');
    
    if (isActive && sessionStartTime) {
      // Update clock-in button to show active timer
      clockInBtn.textContent = 'Return to Active Timer';
      clockInBtn.className = 'btn-success';
      clockInBtn.addEventListener('click', () => {
        window.location.href = 'tracker.html';
      });
      
      showActiveTimerNotification();
    } else {
      // Normal clock-in button
      clockInBtn.textContent = 'Clock In';
      clockInBtn.className = 'btn-primary';
      clockInBtn.addEventListener('click', () => {
        window.location.href = 'clockIn.html';
      });
    }
  }

  function showActiveTimerNotification() {
    // Create a notification banner
    const notification = document.createElement('div');
    notification.className = 'active-timer-notification';
    notification.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      color: white;
      padding: 15px 20px;
      text-align: center;
      z-index: 1000;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
      font-weight: 600;
    `;
    
    notification.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; max-width: 800px; margin: 0 auto;">
        <span>⏱️ Timer is running in the background</span>
        <div>
          <button id="returnToTracker" style="
            background: rgba(255,255,255,0.2);
            border: 1px solid rgba(255,255,255,0.3);
            color: white;
            padding: 8px 16px;
            border-radius: 6px;
            cursor: pointer;
            font-weight: 600;
          ">Return to Tracker</button>
        </div>
      </div>
    `;
    
    document.body.insertBefore(notification, document.body.firstChild);
    
    // Add event listeners
    document.getElementById('returnToTracker').addEventListener('click', () => {
      window.location.href = 'tracker.html';
    });
  }
});