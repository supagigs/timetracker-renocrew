document.addEventListener('DOMContentLoaded', () => {
  const monthlyChart = document.getElementById('monthlyChart');
  const totalHoursMonth = document.getElementById('totalHoursMonth');
  const avgDailyHours = document.getElementById('avgDailyHours');
  const mostProductiveDay = document.getElementById('mostProductiveDay');
  const totalIdleTimeMonth = document.getElementById('totalIdleTimeMonth');
  const avgIdlePercentage = document.getElementById('avgIdlePercentage');
  const homeBtn = document.getElementById('homeBtn');
  const trackerBtn = document.getElementById('trackerBtn');
  const sessionSelect = document.getElementById('sessionSelect');
  const loadScreenshotsBtn = document.getElementById('loadScreenshotsBtn');
  const screenshotsContainer = document.getElementById('screenshotsContainer');
  const sessionsMap = {}; // id -> session details
  const screenshotOffset = {}; // Track pagination offset for each session

  const userEmail = StorageService.getItem('userEmail');
  if (!userEmail) {
    alert('No user email found. Please login again.');
    window.location.href = 'login.html';
    return;
  }

  if (window.SessionSync) {
    window.SessionSync.setEmail(userEmail);
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

  // Load monthly data
  loadMonthlyData();
  loadSessions();

  function loadMonthlyData() {
    // Get last 30 days
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - 29); // 30 days total (0-29 = 30 days)

    console.log('Loading monthly data for email:', userEmail);
    console.log('Date range:', startDate.toISOString().split('T')[0], 'to', endDate.toISOString().split('T')[0]);

    window.supabase
      .from('time_sessions')
      .select('id, session_date, active_duration, idle_duration, break_duration, start_time, end_time')
      .eq('user_email', userEmail)
      .gte('session_date', startDate.toISOString().split('T')[0])
      .lte('session_date', endDate.toISOString().split('T')[0])
      .then(({ data, error }) => {
        if (error) {
          console.error('Error loading monthly data:', error);
          console.error('Error details:', JSON.stringify(error, null, 2));
          // Show fallback data
          processMonthlyData([]);
          return;
        }

        console.log('Monthly data loaded:', data);
        console.log('Number of sessions found:', data ? data.length : 0);
        
        // Log sample session data to verify fields
        if (data && data.length > 0) {
          console.log('Sample session data:', {
            id: data[0].id,
            session_date: data[0].session_date,
            active_duration: data[0].active_duration,
            idle_duration: data[0].idle_duration,
            break_duration: data[0].break_duration
          });
        }
        
        processMonthlyData(data || []);
      })
      .catch(err => {
        console.error('Network error loading monthly data:', err);
        // Show fallback data
        processMonthlyData([]);
      });
  }

  function loadSessions() {
    window.supabase
      .from('time_sessions')
      .select('id, start_time, end_time, session_date, active_duration, idle_duration, break_count')
      .eq('user_email', userEmail)
      .order('start_time', { ascending: false })
      .then(({ data, error }) => {
        if (error) {
          console.error('Error loading sessions:', error);
          return;
        }

        // Clear existing options
        sessionSelect.innerHTML = '<option value="">Select a session to view screenshots</option>';

        // Add session options
        data.forEach(session => {
          sessionsMap[session.id] = session;
          
          // Parse dates - explicitly treat database times as UTC by adding 'Z' if not present
          // This ensures proper timezone conversion from UTC to IST
          const ensureUTC = (dateStr) => {
            if (!dateStr) return null;
            // If it already has timezone info (Z, +, or -HH:MM), don't modify
            if (dateStr.endsWith('Z') || dateStr.includes('+') || /-\d{2}:\d{2}$/.test(dateStr)) {
              return dateStr;
            }
            // Otherwise, add 'Z' to indicate it's UTC
            return dateStr + 'Z';
          };
          
          const startTime = new Date(ensureUTC(session.start_time));
          const endTime = session.end_time ? new Date(ensureUTC(session.end_time)) : null;
          const duration = formatTime(session.active_duration);
          const idleTime = formatTime(session.idle_duration || 0);
          
          // Format date and time - JavaScript automatically converts from UTC to local timezone
          const formatDate = (date) => {
            if (!date || isNaN(date.getTime())) return 'Invalid Date';
            
            // Use toLocaleString without timeZone parameter to use system's default timezone
            // This will automatically convert from database UTC to user's local time (e.g., IST)
            return date.toLocaleString('en-US', {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              hour12: true
            });
          };
          
          const startTimeStr = formatDate(startTime);
          const endTimeStr = endTime ? formatDate(endTime) : 'Active';
          
          // Debug: Log the conversion for first session only
          if (data.indexOf(session) === 0) {
            console.log('Timezone conversion debug:', {
              databaseUTC: session.start_time,
              parsedDate: startTime.toString(),
              localTime: startTimeStr,
              systemTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone
            });
          }
          
          const option = document.createElement('option');
          option.value = session.id;
          option.textContent = `${startTimeStr} - ${endTimeStr} (${duration} active, ${idleTime} idle)`;
          sessionSelect.appendChild(option);
        });
      });
  }

  async function loadScreenshots() {
    const sessionId = sessionSelect.value;
    if (!sessionId) {
      alert('Please select a session first.');
      return;
    }

    const email = userEmail;
    console.log('Loading screenshots for session:', sessionId, 'email:', email);
    
    // Reset offset when loading a new session
    screenshotOffset[sessionId] = 0;
    
    // Add loading indicator
    const loadBtn = document.getElementById('loadScreenshotsBtn');
    const originalText = loadBtn.textContent;
    loadBtn.textContent = 'Loading...';
    loadBtn.disabled = true;
    
    try {
      // Try database first, then fallback to local screenshots
      const dbScreenshotsFound = await loadDatabaseScreenshots(email, sessionId, 0, false);
      
      if (!dbScreenshotsFound) {
        console.log('No database screenshots found, trying local screenshots...');
        await loadLocalScreenshots(email, sessionId);
      }
    } finally {
      // Restore button state
      loadBtn.textContent = originalText;
      loadBtn.disabled = false;
    }
  }

  async function loadDatabaseScreenshots(email, sessionId, retryCount = 0, loadMore = false) {
    try {
      console.log('Loading screenshots from database for session ID:', sessionId, 'retry:', retryCount, 'loadMore:', loadMore);
      
      // For "load more" requests, just fetch more screenshots
      if (loadMore) {
        return await loadMoreScreenshots(email, sessionId);
      }
      
      // Get session details to add date range filtering
      const session = sessionsMap[sessionId];
      if (!session) {
        console.log('Session not found in sessionsMap, falling back to basic query');
        return await loadDatabaseScreenshotsBasic(email, sessionId, retryCount);
      }
      
      const startTime = new Date(session.start_time);
      const endTime = session.end_time ? new Date(session.end_time) : new Date();
      
      // Progressive limit reduction based on retry count
      // Start with smaller limits to avoid timeouts
      const limits = [25, 10, 5];
      const limit = limits[Math.min(retryCount, limits.length - 1)];
      const fetchLimit = limit + 1; // fetch one extra to detect if there are more
      
      console.log(`Attempting query with limit: ${limit}, date range: ${startTime.toISOString()} to ${endTime.toISOString()}`);
      
      // Skip date filtering to avoid timeout issues - just query without date filter
      console.log(`Query params: session_id=${sessionId} (parsed: ${parseInt(sessionId)}), user_email=${email}`);
      
      const { data: screenshots, error } = await window.supabase
        .from('screenshots')
        .select('*')
        .eq('session_id', parseInt(sessionId))
        .eq('user_email', email)
        .order('captured_at', { ascending: true })
        .limit(fetchLimit);
      
      console.log(`Found ${screenshots?.length || 0} screenshots`);
      
      const finalScreenshots = screenshots;
      const finalError = error;

      if (finalError) {
        console.error('Error loading screenshots from database:', finalError);
        
        // Check if it's a timeout error and retry with smaller limit
        if (finalError.code === '57014' && retryCount < limits.length - 1) {
          console.log(`Timeout error detected (retry ${retryCount + 1}), retrying with smaller limit...`);
          return await loadDatabaseScreenshots(email, sessionId, retryCount + 1);
        }
        
        // If still timing out after all retries, try basic query without date filtering
        if (finalError.code === '57014' && retryCount === limits.length - 1) {
          console.log('All retries exhausted, trying basic query...');
          console.warn('Database query timeout suggests missing indexes. Please run the database migration: database-migration-screenshot-indexes.sql');
          return await loadDatabaseScreenshotsBasic(email, sessionId, 0);
        }
        
        displayScreenshots([]);
        return false; // Return false to indicate no screenshots found
      }

      
      if (finalScreenshots && finalScreenshots.length > 0) {
        // Convert database screenshots to display format
        const formattedAll = finalScreenshots.map(screenshot => ({
          screenshot_data: screenshot.screenshot_data,
          captured_at: screenshot.captured_at,
          session_id: screenshot.session_id,
          isLocal: false
        }));
        // Determine if there are more results than we display
        const hasMoreScreenshots = formattedAll.length > limit;
        const formattedScreenshots = hasMoreScreenshots ? formattedAll.slice(0, limit) : formattedAll;

        // Update offset for pagination
        if (!loadMore) {
          screenshotOffset[sessionId] = 0; // Reset on initial load
        }
        
        displayScreenshots(formattedScreenshots, hasMoreScreenshots, limit, null, loadMore);
        
        // Update offset
        screenshotOffset[sessionId] = (screenshotOffset[sessionId] || 0) + formattedScreenshots.length;
        
        return true; // Return true to indicate screenshots were found
      } else {
        console.log('No screenshots found for this session in database');
        if (!loadMore) {
          displayScreenshots([]);
        }
        return false; // Return false to indicate no screenshots found
      }
      
    } catch (error) {
      console.error('Error loading database screenshots:', error);
      displayScreenshots([]);
      return false; // Return false to indicate no screenshots found
    }
  }

  async function loadMoreScreenshots(email, sessionId) {
    try {
      // Load next page of screenshots
      const limit = 25; // Page size for 'load more'
      const currentOffset = screenshotOffset[sessionId] || 0;
      
      console.log(`Loading next page starting from offset ${currentOffset}`);
      
      // Fetch one extra to detect if there are more
      const end = currentOffset + limit; // inclusive end to get limit+1
      const { data: screenshots, error } = await window.supabase
        .from('screenshots')
        .select('*')
        .eq('session_id', parseInt(sessionId))
        .eq('user_email', email)
        .order('captured_at', { ascending: true })
        .range(currentOffset, end);
      
      if (error) {
        console.error('Error loading more screenshots:', error);
        return false;
      }
      
      if (screenshots && screenshots.length > 0) {
        const formattedAll = screenshots.map(screenshot => ({
          screenshot_data: screenshot.screenshot_data,
          captured_at: screenshot.captured_at,
          session_id: screenshot.session_id,
          isLocal: false
        }));
        // If we fetched more than limit, there are more items
        const hasMoreScreenshots = formattedAll.length > limit;
        const formattedScreenshots = hasMoreScreenshots ? formattedAll.slice(0, limit) : formattedAll;
        displayScreenshots(formattedScreenshots, hasMoreScreenshots, limit, null, true);
        
        // Update offset
        screenshotOffset[sessionId] = currentOffset + formattedScreenshots.length;
        
        return true;
      } else {
        console.log('No more screenshots found');
        return false;
      }
      
    } catch (error) {
      console.error('Error in loadMoreScreenshots:', error);
      return false;
    }
  }

  async function loadDatabaseScreenshotsBasic(email, sessionId, retryCount = 0) {
    try {
      console.log('Loading screenshots with basic query (no date filtering) for session ID:', sessionId);
      
      // Very small limits for basic query
      const limits = [10, 5];
      const limit = limits[Math.min(retryCount, limits.length - 1)];
      const fetchLimit = limit + 1;
      
      const { data: screenshots, error } = await window.supabase
        .from('screenshots')
        .select('*')
        .eq('session_id', parseInt(sessionId))
        .eq('user_email', email)
        .order('captured_at', { ascending: true })
        .limit(fetchLimit);

      if (error) {
        console.error('Error loading screenshots with basic query:', error);
        
        // If still timing out, try even smaller limit
        if (error.code === '57014' && retryCount < limits.length - 1) {
          console.log(`Basic query timeout, retrying with limit ${limits[retryCount + 1]}...`);
          return await loadDatabaseScreenshotsBasic(email, sessionId, retryCount + 1);
        }
        
        // Show user-friendly error message for persistent timeouts
        if (error.code === '57014') {
          displayScreenshots([], false, 0, 'Database query timeout. This may be due to a large number of screenshots or missing database indexes. Please run the database migration file: database-migration-screenshot-indexes.sql');
        } else {
          displayScreenshots([]);
        }
        return false;
      }

      if (screenshots && screenshots.length > 0) {
        const formattedAll = screenshots.map(screenshot => ({
          screenshot_data: screenshot.screenshot_data,
          captured_at: screenshot.captured_at,
          session_id: screenshot.session_id,
          isLocal: false
        }));
        const hasMoreScreenshots = formattedAll.length > limit;
        const formattedScreenshots = hasMoreScreenshots ? formattedAll.slice(0, limit) : formattedAll;
        displayScreenshots(formattedScreenshots, hasMoreScreenshots, limit);
        return true;
      } else {
        console.log('No screenshots found with basic query');
        displayScreenshots([]);
        return false;
      }
      
    } catch (error) {
      console.error('Error in basic screenshot query:', error);
      displayScreenshots([]);
      return false;
    }
  }

  async function loadLocalScreenshots(email, sessionId) {
    try {
      console.log('Loading screenshots from local filesystem...');
      
      // Get session details for time range
      const sess = sessionsMap[sessionId];
      if (!sess) {
        console.log('No session found in sessionsMap');
        displayScreenshots([]);
        return;
      }
      
      const startTime = new Date(sess.start_time);
      const endTime = sess.end_time ? new Date(sess.end_time) : new Date();
      console.log('Session time range:', startTime.toISOString(), 'to', endTime.toISOString());
      
      // Use Electron IPC to get local screenshot files
      const screenshotFiles = await window.electronAPI.getLocalScreenshots(email, startTime.toISOString(), endTime.toISOString());
      
      console.log('Found local screenshot files:', screenshotFiles);
      
      if (screenshotFiles && screenshotFiles.length > 0) {
        // Convert file paths to display format
        const screenshots = screenshotFiles.map(filePath => ({
          filePath: filePath,
          captured_at: extractTimestampFromFilename(filePath),
          session_id: sessionId,
          isLocal: true
        }));
        
        displayScreenshots(screenshots);
      } else {
        console.log('No local screenshots found for this session');
        displayScreenshots([]);
      }
      
    } catch (error) {
      console.error('Error loading local screenshots:', error);
      displayScreenshots([]);
    }
  }

  function extractTimestampFromFilename(filePath) {
    // Extract timestamp from filename like: screenshot_email_uuid_2025-10-22T04-47-50-821Z.png
    const filename = filePath.split('/').pop() || filePath.split('\\').pop();
    const timestampMatch = filename.match(/(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)/);
    if (timestampMatch) {
      // Convert back to ISO format: 2025-10-22T04-47-50-821Z -> 2025-10-22T04:47:50.821Z
      const timestamp = timestampMatch[1];
      const isoFormat = timestamp.replace(/(\d{4}-\d{2}-\d{2}T\d{2})-(\d{2})-(\d{2})-(\d{3}Z)/, '$1:$2:$3.$4');
      return isoFormat;
    }
    return new Date().toISOString();
  }

  function displayScreenshots(screenshots, hasMoreScreenshots = false, limit = 100, errorMessage = null, append = false) {
    console.log('Displaying screenshots:', screenshots, 'append:', append);
    
    // Clear container only if not appending
    if (!append) {
      screenshotsContainer.innerHTML = '';
    } else {
      // Remove the old Load More button if appending
      const existingLoadMoreBtn = document.getElementById('loadMoreScreenshotsBtn');
      if (existingLoadMoreBtn) {
        existingLoadMoreBtn.closest('.load-more-container').remove();
      }
    }

    if (screenshots.length === 0) {
      let messageHtml = '';
      
      if (errorMessage) {
        messageHtml = `
          <div class="error-message">
            <p><strong>Error:</strong> ${errorMessage}</p>
          </div>
        `;
      } else {
        messageHtml = `
          <div class="no-screenshots">
            <p>No screenshots found for this session.</p>
            <p class="help-text">This could be because:</p>
            <ul>
              <li>The session was too short to capture screenshots</li>
              <li>Screenshots are being saved locally but not in the database</li>
              <li>There was a network issue during screenshot capture</li>
            </ul>
            <p class="help-text">Screenshots are captured every 20 seconds during active work time.</p>
          </div>
        `;
      }
      
      screenshotsContainer.innerHTML = messageHtml;
      return;
    }

    // Remove existing load more button if it exists
    const existingLoadMoreBtn = document.getElementById('loadMoreScreenshotsBtn');
    if (existingLoadMoreBtn) {
      existingLoadMoreBtn.remove();
    }

    // Note: Load More button will be added at the bottom after all screenshots are displayed

    screenshots.forEach(screenshot => {
      console.log('Processing screenshot:', screenshot);
      const screenshotItem = document.createElement('div');
      screenshotItem.className = 'screenshot-item';
      
      // Ensure UTC parsing - add 'Z' if not present to force UTC interpretation
      const ensureUTCForScreenshot = (dateStr) => {
        if (!dateStr) return null;
        if (dateStr.endsWith('Z') || dateStr.includes('+') || /-\d{2}:\d{2}$/.test(dateStr)) {
          return dateStr;
        }
        return dateStr + 'Z';
      };
      
      const capturedTime = new Date(ensureUTCForScreenshot(screenshot.captured_at));
      
      const img = document.createElement('img');
      
      if (screenshot.isLocal) {
        // For local files, use file:// protocol
        img.src = `file://${screenshot.filePath}`;
        img.alt = 'Local Screenshot';
      } else {
        // For database screenshots, use base64 data
        img.src = screenshot.screenshot_data;
        img.alt = 'Screenshot';
      }
      
      img.className = 'screenshot-image';
      img.addEventListener('click', () => {
        handleScreenshotClick(screenshot);
      });
      
      const info = document.createElement('div');
      info.className = 'screenshot-info';
      
      // Format date and time according to system locale and timezone
      // This will display in the user's local timezone (e.g., IST)
      const formatScreenshotTime = (date) => {
        if (!date || isNaN(date.getTime())) return 'Invalid Date';
        
        const year = date.getFullYear();
        const month = date.toLocaleString('en-US', { month: 'short' });
        const day = date.getDate();
        const hours = date.getHours() % 12 || 12;
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        const ampm = date.getHours() >= 12 ? 'PM' : 'AM';
        
        return `${month} ${day}, ${year}, ${hours}:${minutes}:${seconds} ${ampm}`;
      };
      
      const formattedTime = formatScreenshotTime(capturedTime);
      
      info.innerHTML = `
        <div class="screenshot-time">${formattedTime}</div>
        <div class="screenshot-session">Session ID: ${screenshot.session_id}</div>
        <div class="screenshot-source">${screenshot.isLocal ? 'Local File' : 'Database'}</div>
      `;
      
      screenshotItem.appendChild(img);
      screenshotItem.appendChild(info);
      screenshotsContainer.appendChild(screenshotItem);
    });
    
    // Add Load More button outside the grid container if there are more screenshots
    if (hasMoreScreenshots) {
      // Remove any existing Load More button
      const existingBtn = document.getElementById('loadMoreScreenshotsBtn');
      if (existingBtn) {
        existingBtn.remove();
      }
      
      // Add the button after the screenshots container
      const loadMoreContainer = document.createElement('div');
      loadMoreContainer.className = 'load-more-container';
      
      const loadMoreBtn = document.createElement('button');
      loadMoreBtn.id = 'loadMoreScreenshotsBtn';
      loadMoreBtn.className = 'btn-primary load-more-btn';
      loadMoreBtn.textContent = 'Load More Screenshots';
      
      loadMoreBtn.addEventListener('click', async () => {
        const sessionId = sessionSelect.value;
        if (!sessionId || !userEmail) return;
        
        // Load more screenshots
        await loadDatabaseScreenshots(userEmail, sessionId, 0, true);
      });
      
      loadMoreContainer.appendChild(loadMoreBtn);
      
      // Insert after screenshots container's parent
      const screenshotsSection = screenshotsContainer.closest('.screenshots-section');
      screenshotsSection.appendChild(loadMoreContainer);
    }
  }

  async function handleScreenshotClick(screenshot) {
    try {
      const imageSrc = resolveScreenshotSource(screenshot);
      if (!imageSrc) {
        console.warn('Unable to determine image source for screenshot:', screenshot);
        NotificationService?.showError?.('Unable to load screenshot preview.');
        return;
      }

      openFloatingScreenshot(imageSrc, {
        title: screenshot?.session_id ? `Session ${screenshot.session_id}` : 'Screenshot Preview',
        timestamp: screenshot?.captured_at || null
      });
    } catch (error) {
      console.error('Error handling screenshot click:', error);
      const fallbackSrc = resolveScreenshotSource(screenshot);
      if (fallbackSrc) {
        console.log('Falling back to alternate source:', fallbackSrc);
        openFloatingScreenshot(fallbackSrc, {
          title: screenshot?.session_id ? `Session ${screenshot.session_id}` : 'Screenshot Preview',
          timestamp: screenshot?.captured_at || null
        });
      }
    }
  }

  function resolveScreenshotSource(screenshot) {
    if (!screenshot) return null;
    if (screenshot.isLocal && screenshot.filePath) {
      const normalizedPath = screenshot.filePath.replace(/\\/g, '/');
      if (/^file:/.test(normalizedPath)) {
        return normalizedPath;
      }
      if (/^\//.test(normalizedPath)) {
        return `file://${normalizedPath}`;
      }
      return `file:///${normalizedPath}`;
    }
    if (screenshot.screenshot_data && /^http/.test(screenshot.screenshot_data)) {
      return screenshot.screenshot_data;
    }
    return screenshot.screenshot_data || null;
  }

  function openFloatingScreenshot(imageSrc, { title = 'Screenshot Preview', timestamp = null } = {}) {
    console.log('openFloatingScreenshot called with:', { imageSrc, title, timestamp });
    try {
      const existing = document.getElementById('pip-screenshot-viewer');
      if (existing) {
        console.log('Existing PiP viewer detected, removing');
        existing.remove();
      }

      const container = document.createElement('div');
      container.id = 'pip-screenshot-viewer';
      container.className = 'pip-viewer';

      container.innerHTML = `
        <div class="pip-viewer-titlebar">
          <div class="pip-title">
            <span class="pip-title-text">${title}</span>
            ${timestamp ? `<span class="pip-subtitle">${new Date(timestamp).toLocaleString()}</span>` : ''}
          </div>
          <div class="pip-controls">
            <button type="button" class="pip-control" data-action="reset" title="Reset Position">⤢</button>
            <button type="button" class="pip-control" data-action="close" title="Close Viewer">✕</button>
          </div>
        </div>
        <div class="pip-content">
          <img class="pip-image" src="${imageSrc}" alt="Screenshot Preview" draggable="false" />
        </div>
      `;

      document.body.appendChild(container);
      const titlebar = container.querySelector('.pip-viewer-titlebar');
      const content = container.querySelector('.pip-content');
      const closeButton = container.querySelector('[data-action="close"]');
      const resetButton = container.querySelector('[data-action="reset"]');
      const imageElement = container.querySelector('.pip-image');

      const state = {
        isDragging: false,
        offsetX: 0,
        offsetY: 0,
        lastX: 0,
        lastY: 0,
        isImageLoaded: false
      };

      const resetPosition = () => {
        const { innerWidth, innerHeight } = window;
        const rect = container.getBoundingClientRect();
        const defaultX = Math.max(16, innerWidth - rect.width - 24);
        const defaultY = Math.max(16, innerHeight - rect.height - 24);
        container.style.left = `${defaultX}px`;
        container.style.top = `${defaultY}px`;
        state.lastX = defaultX;
        state.lastY = defaultY;
      };

      const handleMouseDown = (event) => {
        console.log('PiP handleMouseDown event');
        if (event.button !== undefined && event.button !== 0) {
          return;
        }
        state.isDragging = true;
        const point = event.touches ? event.touches[0] : event;
        if (!point) return;
        const { clientX, clientY } = point;
        const rect = container.getBoundingClientRect();
        state.offsetX = clientX - rect.left;
        state.offsetY = clientY - rect.top;
        document.body.classList.add('pip-dragging');
      };

      const handleMouseMove = (event) => {
        if (!state.isDragging) return;
        const point = event.touches ? event.touches[0] : event;
        if (!point) return;
        const { clientX, clientY } = point;
        const newX = clientX - state.offsetX;
        const newY = clientY - state.offsetY;
        const maxX = window.innerWidth - container.offsetWidth - 8;
        const maxY = window.innerHeight - container.offsetHeight - 8;
        state.lastX = Math.max(8, Math.min(newX, maxX));
        state.lastY = Math.max(8, Math.min(newY, maxY));
        container.style.left = `${state.lastX}px`;
        container.style.top = `${state.lastY}px`;
      };

      const handleMouseUp = () => {
        if (!state.isDragging) return;
        state.isDragging = false;
        document.body.classList.remove('pip-dragging');
      };

      titlebar.addEventListener('mousedown', handleMouseDown);
      titlebar.addEventListener('touchstart', handleMouseDown, { passive: false });
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('touchmove', handleMouseMove, { passive: false });
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('touchend', handleMouseUp);

      container.addEventListener('click', (event) => {
        const button = event.target.closest('button');
        if (!button) return;
        const action = button.dataset.action;
        if (action === 'close') {
          console.log('Closing PiP viewer via control');
          cleanup();
        } else if (action === 'reset') {
          console.log('Resetting PiP viewer position');
          resetPosition();
        }
      });

      const cleanup = () => {
        titlebar.removeEventListener('mousedown', handleMouseDown);
        titlebar.removeEventListener('touchstart', handleMouseDown);
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('touchmove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
        window.removeEventListener('touchend', handleMouseUp);
        document.body.classList.remove('pip-dragging');
        if (container.parentElement) {
          container.parentElement.removeChild(container);
        }
      };

      content.addEventListener('dblclick', cleanup);
      const handleKeydown = (event) => {
        if (event.key === 'Escape') {
          cleanup();
        }
      };
      window.addEventListener('keydown', handleKeydown);

      if (imageElement) {
        imageElement.addEventListener('load', () => {
          console.log('PiP image loaded successfully');
          state.isImageLoaded = true;
          resetPosition();
        });
        imageElement.addEventListener('error', () => {
          console.error('PiP image failed to load');
          state.isImageLoaded = true;
          resetPosition();
        });
        if (imageElement.complete) {
          state.isImageLoaded = true;
          console.log('PiP image already complete');
          resetPosition();
        }
      } else {
        console.warn('PiP image element not found');
        resetPosition();
      }

    } catch (error) {
      console.error('Error opening floating screenshot viewer:', error);
      openScreenshotModalFallback(imageSrc);
    }
  }

  function openScreenshotModalFallback(imageSrc) {
    const modal = document.createElement('div');
    modal.className = 'screenshot-modal';
    modal.innerHTML = `<img src="${imageSrc}" alt="Screenshot">`;

    modal.addEventListener('click', () => {
      document.body.removeChild(modal);
    });

    document.body.appendChild(modal);
  }

  function formatTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  function formatHoursMinutes(totalHours) {
    // Ensure we have a valid number
    if (!totalHours || isNaN(totalHours) || totalHours < 0) {
      return '0h 0m';
    }
    
    const hours = Math.floor(totalHours);
    const minutes = Math.round((totalHours - hours) * 60); // Use Math.round for better accuracy
    
    // Handle edge case where rounding minutes gives 60
    if (minutes >= 60) {
      return `${hours + 1}h 0m`;
    }
    
    if (hours === 0 && minutes === 0) {
      return '0h 0m';
    } else if (hours === 0) {
      return `${minutes}m`;
    } else if (minutes === 0) {
      return `${hours}h`;
    } else {
      return `${hours}h ${minutes}m`;
    }
  }

  function processMonthlyData(data) {
    console.log('Processing monthly data:', data);
    console.log('Number of sessions:', data ? data.length : 0);
    
    // Group data by date
    const dailyData = {};
    
    // Initialize all 30 days with 0 hours
    for (let i = 29; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      // Format as "MMM DD" for better readability
      const dayName = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      dailyData[dateStr] = { day: dayName, hours: 0, idleHours: 0 };
    }

    console.log('Initialized daily data:', dailyData);

    // Sum up ACTIVE hours for each day (excluding break time)
    if (data && data.length > 0) {
      data.forEach(session => {
        const dateStr = session.session_date;
        if (dailyData[dateStr]) {
          // Only count active_duration, not total session time
          // Ensure we're using the correct field and converting properly
          const activeDurationSeconds = parseInt(session.active_duration) || 0;
          const idleDurationSeconds = parseInt(session.idle_duration) || 0;
          
          const activeHours = activeDurationSeconds / 3600; // Convert seconds to hours
          const idleHours = idleDurationSeconds / 3600; // Convert seconds to hours
          
          dailyData[dateStr].hours += activeHours;
          dailyData[dateStr].idleHours += idleHours;
          
          console.log(`Session ${session.id} on ${dateStr}: ${activeDurationSeconds}s active (${activeHours.toFixed(2)}h), ${idleDurationSeconds}s idle (${idleHours.toFixed(2)}h)`);
        } else {
          console.warn(`Session date ${dateStr} not in date range`);
        }
      });
    } else {
      console.log('No session data provided to processMonthlyData');
    }

    // Create chart data
    const chartData = Object.values(dailyData);
    const labels = chartData.map(d => d.day);
    const hours = chartData.map(d => d.hours);
    const idleHours = chartData.map(d => d.idleHours);

    // Calculate summary stats
    const totalHours = hours.reduce((sum, h) => sum + h, 0);
    const totalIdleHours = idleHours.reduce((sum, h) => sum + h, 0);
    
    console.log('Calculated totals:', {
      totalHours: totalHours,
      totalIdleHours: totalIdleHours,
      hoursArray: hours,
      idleHoursArray: idleHours
    });
    
    // Count days with actual work (hours > 0)
    const daysWithWork = hours.filter(h => h > 0).length;
    
    // Calculate average hours per day
    // If no days with work, average across all 30 days (including zeros)
    const avgHours = daysWithWork > 0 ? totalHours / daysWithWork : totalHours / 30;
    
    // Calculate average idle percentage
    const totalWorkTime = totalHours + totalIdleHours;
    const avgIdlePercent = totalWorkTime > 0 ? Math.round((totalIdleHours / totalWorkTime) * 100) : 0;
    
    // Find most productive day (only if there's actual work)
    let mostProductiveDayText = '';
    if (totalHours > 0) {
      const maxHours = Math.max(...hours);
      const mostProductiveIndex = hours.indexOf(maxHours);
      mostProductiveDayText = labels[mostProductiveIndex];
    }

    console.log('Monthly Summary:', {
      totalHours: formatHoursMinutes(totalHours),
      totalIdleHours: formatHoursMinutes(totalIdleHours),
      avgIdlePercent: avgIdlePercent + '%',
      daysWithWork,
      avgHours: formatHoursMinutes(avgHours),
      mostProductiveDay: mostProductiveDayText,
      dailyHours: hours.map((h, i) => `${labels[i]}: ${formatHoursMinutes(h)} (${formatHoursMinutes(idleHours[i])} idle)`)
    });

    // Update summary stats with hours and minutes format
    totalHoursMonth.textContent = formatHoursMinutes(totalHours);
    avgDailyHours.textContent = formatHoursMinutes(avgHours);
    mostProductiveDay.textContent = mostProductiveDayText;
    totalIdleTimeMonth.textContent = formatHoursMinutes(totalIdleHours);
    avgIdlePercentage.textContent = avgIdlePercent + '%';

    console.log('Creating chart with labels:', labels, 'and hours:', hours);
    // Create chart
    createMonthlyChart(labels, hours, idleHours);
  }

  function createMonthlyChart(labels, hours, idleHours = []) {
    console.log('Creating monthly chart with data:', { labels, hours, idleHours });
    const ctx = monthlyChart.getContext('2d');
    
    // Destroy existing chart if it exists
    if (window.monthlyChartInstance) {
      window.monthlyChartInstance.destroy();
    }
    
    // Create datasets for active and idle time
    const datasets = [{
      label: 'Active Hours',
      data: hours,
      backgroundColor: 'rgba(16, 185, 129, 0.8)',
      borderColor: 'rgba(16, 185, 129, 1)',
      borderWidth: 2,
      borderRadius: 4,
      borderSkipped: false,
    }];
    
    // Add idle time dataset if we have idle data
    if (idleHours && idleHours.length > 0) {
      datasets.push({
        label: 'Idle Hours',
        data: idleHours,
        backgroundColor: 'rgba(239, 68, 68, 0.8)',
        borderColor: 'rgba(239, 68, 68, 1)',
        borderWidth: 2,
        borderRadius: 4,
        borderSkipped: false,
      });
    }
    
    window.monthlyChartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: 'Hours'
            }
          },
          x: {
            title: {
              display: true,
              text: 'Days'
            },
            ticks: {
              maxRotation: 45,
              minRotation: 45,
              autoSkip: true,
              maxTicksLimit: 15 // Show approximately every other day for better readability
            }
          }
        },
        plugins: {
          legend: {
            display: true,
            position: 'top'
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                return formatHoursMinutes(context.parsed.y);
              }
            }
          }
        }
      }
    });
  }

  // Event listeners
  homeBtn.addEventListener('click', () => window.location.href = 'home.html');
  //trackerBtn.addEventListener('click', () => window.location.href = 'tracker.html');
  loadScreenshotsBtn.addEventListener('click', loadScreenshots);
});