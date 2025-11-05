// Error handling and notification utilities
class NotificationService {
  static showMessage(message, type = 'info', duration = 5000, showCloseButton = true) {
    // Remove any existing notifications of the same type to avoid clutter
    this.removeExistingNotifications(type);
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type} fade-in`;
    messageDiv.innerHTML = `<span class="message-content">${message}</span>`;
    
    // Add close button only if showCloseButton is true
    if (showCloseButton) {
      const closeBtn = document.createElement('button');
      closeBtn.innerHTML = '×';
      closeBtn.setAttribute('aria-label', 'Close notification');
      closeBtn.onclick = () => this.removeNotification(messageDiv);
      
      messageDiv.appendChild(closeBtn);
    }
    document.body.insertBefore(messageDiv, document.body.firstChild);
    
    // Add hover effects
    messageDiv.addEventListener('mouseenter', () => {
      if (duration > 0) {
        clearTimeout(messageDiv.autoRemoveTimeout);
      }
    });
    
    messageDiv.addEventListener('mouseleave', () => {
      if (duration > 0) {
        messageDiv.autoRemoveTimeout = setTimeout(() => {
          this.removeNotification(messageDiv);
        }, duration);
      }
    });
    
    // Auto-remove after duration
    if (duration > 0) {
      messageDiv.autoRemoveTimeout = setTimeout(() => {
        this.removeNotification(messageDiv);
      }, duration);
    }
    
    return messageDiv;
  }
  
  static removeNotification(messageDiv) {
    if (messageDiv && messageDiv.parentNode) {
      messageDiv.classList.add('fade-out');
      setTimeout(() => {
        if (messageDiv.parentNode) {
          messageDiv.remove();
        }
      }, 300);
    }
  }
  
  static removeExistingNotifications(type = null) {
    const existingMessages = document.querySelectorAll('.message');
    existingMessages.forEach(msg => {
      if (!type || msg.classList.contains(type)) {
        this.removeNotification(msg);
      }
    });
  }
  
  static showSuccess(message, duration = 4000) {
    return this.showMessage(message, 'success', duration);
  }
  
  static showError(message, duration = 0, showCloseButton = true, hideIcon = false) {
    const messageDiv = this.showMessage(message, 'error', duration, showCloseButton); // Don't auto-remove errors by default
    if (hideIcon) {
      messageDiv.classList.add('no-icon');
    }
    return messageDiv;
  }
  
  static showWarning(message, duration = 5000) {
    return this.showMessage(message, 'warning', duration);
  }
  
  static showInfo(message, duration = 4000) {
    return this.showMessage(message, 'info', duration);
  }
  
  // Specialized methods for common app messages
  static showLoginSuccess(userEmail) {
    return this.showSuccess(`Welcome back, ${userEmail}!`, 3000);
  }
  
  static showNewUserCreated(userEmail) {
    return this.showSuccess(`New account created for ${userEmail}!`, 3000);
  }
  
  static showEmailValidationError() {
    return this.showError('Please enter a valid email address (format: user@domain.com)', 0);
  }
  
  static showDisplayNameSaved() {
    return this.showSuccess('Display name saved successfully!', 3000);
  }
  
  static showSessionStarted() {
    return this.showSuccess('Work session started! Time tracking is now active.', 3000);
  }
  
  static showSessionEnded() {
    return this.showSuccess('Work session ended. Great job!', 3000);
  }
}

// Data validation utilities
class ValidationService {
  static validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
  
  static validateTaskName(name) {
    if (!name || typeof name !== 'string') {
      return { valid: false, error: 'Task name is required' };
    }
    
    const trimmed = name.trim();
    if (trimmed.length < 1) {
      return { valid: false, error: 'Task name cannot be empty' };
    }
    
    if (trimmed.length > 100) {
      return { valid: false, error: 'Task name is too long (max 100 characters)' };
    }
    
    return { valid: true, value: trimmed };
  }
  
  static validateDisplayName(name) {
    if (!name || typeof name !== 'string') {
      return { valid: false, error: 'Display name is required' };
    }
    
    const trimmed = name.trim();
    if (trimmed.length < 1) {
      return { valid: false, error: 'Display name cannot be empty' };
    }
    
    if (trimmed.length > 50) {
      return { valid: false, error: 'Display name is too long (max 50 characters)' };
    }
    
    return { valid: true, value: trimmed };
  }
}

// Time formatting utilities
class TimeUtils {
  static formatTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  
  static formatDuration(seconds) {
    if (seconds < 60) {
      return `${seconds}s`;
    } else if (seconds < 3600) {
      return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    } else {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      return `${hours}h ${minutes}m`;
    }
  }
  
  static parseTimeString(timeString) {
    // Parse "HH:MM:SS" format
    const parts = timeString.split(':').map(Number);
    if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    return 0;
  }
}

// Local storage utilities with error handling
class StorageService {
  static setItem(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error('Failed to save to localStorage:', error);
      NotificationService.showError('Failed to save data locally');
      return false;
    }
  }
  
  static getItem(key, defaultValue = null) {
    try {
      const item = localStorage.getItem(key);
      if (!item) return defaultValue;
      
      // Try to parse as JSON first
      try {
        return JSON.parse(item);
      } catch (parseError) {
        // If JSON parsing fails, return the raw string (for backward compatibility)
        console.log(`StorageService: ${key} is not JSON, returning raw string:`, item);
        return item;
      }
    } catch (error) {
      console.error('Failed to read from localStorage:', error);
      return defaultValue;
    }
  }
  
  static removeItem(key) {
    try {
      localStorage.removeItem(key);
      return true;
    } catch (error) {
      console.error('Failed to remove from localStorage:', error);
      return false;
    }
  }
}

// Supabase error handling wrapper
class SupabaseService {
  static async handleRequest(requestFn) {
    // Retry transient network errors (e.g., net::ERR_CONNECTION_CLOSED)
    const maxAttempts = 3;
    let attempt = 0;
    let lastError = null;
    while (attempt < maxAttempts) {
      try {
        const result = await requestFn();
        if (result.error) {
          console.error('Supabase error:', result.error);
          NotificationService.showError(`Database error: ${result.error.message}`);
          return { data: null, error: result.error };
        }
        return { data: result.data, error: null };
      } catch (error) {
        lastError = error;
        // Only retry for network-type failures
        const isNetworkError = /Failed to fetch|NetworkError|ERR_CONNECTION|ERR_QUIC|TypeError/i.test(String(error?.message || error));
        attempt++;
        if (!isNetworkError || attempt >= maxAttempts) {
          console.error('Request failed:', error);
          NotificationService.showError(`Request failed: ${error.message}`);
          return { data: null, error };
        }
        // Exponential backoff
        await new Promise(r => setTimeout(r, attempt * 1000));
      }
    }
    return { data: null, error: lastError };
  }
}

// Export for use in other modules
window.NotificationService = NotificationService;
window.ValidationService = ValidationService;
window.TimeUtils = TimeUtils;
window.StorageService = StorageService;
window.SupabaseService = SupabaseService;







