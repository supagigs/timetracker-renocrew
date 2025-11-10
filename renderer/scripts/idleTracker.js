// Idle Time Tracker
// Tracks user activity (mouse movements, clicks, keyboard activity) to calculate idle time
class IdleTracker {
  constructor(options = {}) {
    this.idleThreshold = options.idleThreshold || 30; // seconds of inactivity before considered idle
    this.checkInterval = options.checkInterval || 1000; // check every second
    this.confirmIdleMs = options.confirmIdleMs || 1500; // additional debounce before declaring idle
    this.isTracking = false;
    this.isIdle = false;
    this.lastActivityTime = Date.now();
    this.idleStartTime = null;
    this.totalIdleTime = 0;
    this.idlePeriods = []; // Array to store idle periods
    this.callbacks = {
      onIdleStart: options.onIdleStart || (() => {}),
      onIdleEnd: options.onIdleEnd || (() => {}),
      onIdleTimeUpdate: options.onIdleTimeUpdate || (() => {})
    };
    
    this.checkIntervalId = null;
    this.systemIdlePollIntervalId = null;
    this.idleConfirmTimeoutId = null; // debounce timer handle
    this.useSystemIdle = options.useSystemIdle !== false; // default true
    this.boundHandleActivity = this.handleActivity.bind(this); // Bind once for better performance and cleanup
    this.setupEventListeners();
  }

  setupEventListeners() {
    // Mouse events
    const mouseEvents = ['mousedown', 'mousemove', 'mouseup', 'click', 'dblclick', 'contextmenu', 'wheel'];
    mouseEvents.forEach(event => {
      document.addEventListener(event, this.boundHandleActivity, true);
    });

    // Keyboard events
    const keyboardEvents = ['keydown', 'keyup', 'keypress'];
    keyboardEvents.forEach(event => {
      document.addEventListener(event, this.boundHandleActivity, true);
    });

    // Touch events (for mobile/touch devices)
    const touchEvents = ['touchstart', 'touchmove', 'touchend'];
    touchEvents.forEach(event => {
      document.addEventListener(event, this.boundHandleActivity, true);
    });

    // Pointer events (covers pen/mouse/touch)
    const pointerEvents = ['pointermove', 'pointerdown', 'pointerup'];
    pointerEvents.forEach(event => {
      document.addEventListener(event, this.boundHandleActivity, true);
    });

    // Scroll events
    document.addEventListener('scroll', this.boundHandleActivity, true);

    // Window focus/blur events
    window.addEventListener('focus', this.boundHandleActivity);
    window.addEventListener('blur', this.boundHandleActivity);

    // Visibility change (treat returning to the tab as activity)
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        this.handleActivity({ type: 'visibilitychange', isTrusted: true });
      }
    }, true);
  }

  removeEventListeners() {
    // Mouse events
    const mouseEvents = ['mousedown', 'mousemove', 'mouseup', 'click', 'dblclick', 'contextmenu'];
    mouseEvents.forEach(event => {
      document.removeEventListener(event, this.boundHandleActivity, true);
    });

    // Keyboard events
    const keyboardEvents = ['keydown', 'keyup', 'keypress'];
    keyboardEvents.forEach(event => {
      document.removeEventListener(event, this.boundHandleActivity, true);
    });

    // Touch events
    const touchEvents = ['touchstart', 'touchmove', 'touchend'];
    touchEvents.forEach(event => {
      document.removeEventListener(event, this.boundHandleActivity, true);
    });

    // Scroll events
    document.removeEventListener('scroll', this.boundHandleActivity, true);

    // Window focus/blur events
    window.removeEventListener('focus', this.boundHandleActivity);
    window.removeEventListener('blur', this.boundHandleActivity);
  }

  handleActivity(event) {
    // Ignore certain events that might be too frequent or not user-initiated
    if (this.shouldIgnoreEvent(event)) {
      return;
    }

    this.lastActivityTime = Date.now();
    // Any real activity cancels pending idle confirmation
    if (this.idleConfirmTimeoutId) {
      clearTimeout(this.idleConfirmTimeoutId);
      this.idleConfirmTimeoutId = null;
    }
    
    // If we were idle, end the idle period
    if (this.isIdle) {
      this.endIdlePeriod();
    }
  }

  shouldIgnoreEvent(event) {
    // Ignore programmatic events or events that don't represent user activity
    if (event.isTrusted === false) {
      return true;
    }

    // Do not ignore zero-delta mouse moves (some environments report 0 movement despite activity)

    // Ignore certain key combinations that might be system shortcuts
    if (event.type.startsWith('key') && event.ctrlKey && event.key === 'Tab') {
      return true;
    }

    return false;
  }

  startTracking() {
    if (this.isTracking) {
      return;
    }

    this.isTracking = true;
    this.lastActivityTime = Date.now();
    this.isIdle = false;
    this.idleStartTime = null;
    
    // Start checking for idle state (DOM-based)
    this.checkIntervalId = setInterval(() => {
      this.checkIdleState();
    }, this.checkInterval);

    // Start polling system-wide idle time if available
    if (this.useSystemIdle && window.electronAPI && window.electronAPI.getSystemIdleTime) {
      this.systemIdlePollIntervalId = setInterval(async () => {
        try {
          const idleSeconds = await window.electronAPI.getSystemIdleTime();
          if (typeof idleSeconds === 'number' && idleSeconds >= 0) {
            if (idleSeconds >= this.idleThreshold) {
              if (!this.isIdle) {
                this.scheduleIdleConfirmation();
              }
            } else {
              // System reports recent activity. Treat as user interaction even if our window is unfocused.
              this.lastActivityTime = Date.now();

              if (this.idleConfirmTimeoutId) {
                clearTimeout(this.idleConfirmTimeoutId);
                this.idleConfirmTimeoutId = null;
              }

              if (this.isIdle) {
                this.endIdlePeriod();
              }
            }
          }
        } catch (_) {}
      }, this.checkInterval);
    }

    console.log('IdleTracker: Started tracking user activity');
  }

  stopTracking() {
    if (!this.isTracking) {
      return;
    }

    this.isTracking = false;
    
    // End current idle period if active
    if (this.isIdle) {
      this.endIdlePeriod();
    }

    // Clear the check interval
    if (this.checkIntervalId) {
      clearInterval(this.checkIntervalId);
      this.checkIntervalId = null;
    }
    if (this.systemIdlePollIntervalId) {
      clearInterval(this.systemIdlePollIntervalId);
      this.systemIdlePollIntervalId = null;
    }

    console.log('IdleTracker: Stopped tracking user activity');
  }

  checkIdleState() {
    if (!this.isTracking) {
      return;
    }

    const now = Date.now();
    const timeSinceLastActivity = (now - this.lastActivityTime) / 1000; // Convert to seconds

    if (timeSinceLastActivity >= this.idleThreshold && !this.isIdle) {
      this.scheduleIdleConfirmation();
    }
  }

  scheduleIdleConfirmation() {
    // Prevent multiple timers
    if (this.idleConfirmTimeoutId || this.isIdle) {
      return;
    }
    this.idleConfirmTimeoutId = setTimeout(() => {
      this.idleConfirmTimeoutId = null;
      // Re-check before declaring idle
      const now = Date.now();
      const timeSinceLastActivity = (now - this.lastActivityTime) / 1000;
      if (timeSinceLastActivity >= this.idleThreshold && !this.isIdle) {
        this.startIdlePeriod();
      }
    }, this.confirmIdleMs);
  }

  startIdlePeriod() {
    this.isIdle = true;
    this.idleStartTime = Date.now();
    
    console.log('IdleTracker: User became idle');
    this.callbacks.onIdleStart();
  }

  endIdlePeriod() {
    if (!this.isIdle || !this.idleStartTime) {
      return;
    }

    const idleDuration = (Date.now() - this.idleStartTime) / 1000; // Convert to seconds
    this.totalIdleTime += idleDuration;
    
    // Store the idle period for detailed reporting
    this.idlePeriods.push({
      startTime: this.idleStartTime,
      endTime: Date.now(),
      duration: idleDuration
    });

    this.isIdle = false;
    this.idleStartTime = null;

    console.log(`IdleTracker: User became active after ${idleDuration.toFixed(1)}s idle time`);
    this.callbacks.onIdleEnd(idleDuration);
    this.callbacks.onIdleTimeUpdate(this.getTotalIdleTime());
  }

  getTotalIdleTime() {
    let total = this.totalIdleTime;
    
    // Add current idle time if currently idle
    if (this.isIdle && this.idleStartTime) {
      total += (Date.now() - this.idleStartTime) / 1000;
    }
    
    return Math.floor(total); // Return in seconds
  }

  getCurrentIdleTime() {
    if (this.isIdle && this.idleStartTime) {
      return Math.floor((Date.now() - this.idleStartTime) / 1000);
    }
    return 0;
  }

  getIdlePeriods() {
    return [...this.idlePeriods]; // Return a copy
  }

  reset() {
    this.stopTracking();
    this.removeEventListeners(); // Clean up event listeners to prevent memory leaks
    this.totalIdleTime = 0;
    this.idlePeriods = [];
    this.isIdle = false;
    this.idleStartTime = null;
    this.lastActivityTime = Date.now();
    
    console.log('IdleTracker: Reset all idle time data');
  }

  // Cleanup method to be called when the tracker is no longer needed
  destroy() {
    this.reset();
    this.callbacks = {
      onIdleStart: () => {},
      onIdleEnd: () => {},
      onIdleTimeUpdate: () => {}
    };
    console.log('IdleTracker: Destroyed and cleaned up all resources');
  }

  // Method to get idle time for a specific time range
  getIdleTimeInRange(startTime, endTime) {
    let idleTimeInRange = 0;
    
    this.idlePeriods.forEach(period => {
      const periodStart = period.startTime;
      const periodEnd = period.endTime;
      
      // Check if period overlaps with the given range
      if (periodStart < endTime && periodEnd > startTime) {
        const overlapStart = Math.max(periodStart, startTime);
        const overlapEnd = Math.min(periodEnd, endTime);
        const overlapDuration = (overlapEnd - overlapStart) / 1000;
        
        idleTimeInRange += overlapDuration;
      }
    });
    
    return Math.floor(idleTimeInRange);
  }

  // Method to get active time (total time minus idle time) for a specific time range
  getActiveTimeInRange(startTime, endTime) {
    const totalTimeInRange = (endTime - startTime) / 1000;
    const idleTimeInRange = this.getIdleTimeInRange(startTime, endTime);
    return Math.floor(totalTimeInRange - idleTimeInRange);
  }

  // Method to format idle time for display
  formatIdleTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  }

  // Method to get idle percentage for a time range
  getIdlePercentage(startTime, endTime) {
    const totalTime = (endTime - startTime) / 1000;
    const idleTime = this.getIdleTimeInRange(startTime, endTime);
    
    if (totalTime === 0) return 0;
    
    return Math.round((idleTime / totalTime) * 100);
  }

  // Method to check if user is currently idle
  isCurrentlyIdle() {
    return this.isIdle;
  }

  // Method to get time since last activity
  getTimeSinceLastActivity() {
    return Math.floor((Date.now() - this.lastActivityTime) / 1000);
  }
}

// Export for use in other modules
window.IdleTracker = IdleTracker;




