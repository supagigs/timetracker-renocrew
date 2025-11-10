document.addEventListener('DOMContentLoaded', () => {
  const displayNameInput = document.getElementById('displayName');
  const saveBtn = document.getElementById('saveBtn');
  const email = StorageService.getItem('userEmail');

  if (!email) {
    NotificationService.showError('No user email found. Please login again.');
    setTimeout(() => {
      window.location.href = 'login.html';
    }, 2000);
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

  saveBtn.addEventListener('click', async () => {
    const displayName = displayNameInput.value.trim();
    
    // Validate display name
    const validation = ValidationService.validateDisplayName(displayName);
    if (!validation.valid) {
      NotificationService.showError(validation.error);
      displayNameInput.focus();
      return;
    }

    // Show loading state
    const originalText = saveBtn.textContent;
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span class="loading"></span> Saving...';

    try {
      // Check if Supabase client is available
      if (!window.supabase) {
        throw new Error('Database connection not configured. Please check your environment variables.');
      }

      // Update user with display name using proper error handling
      console.log('Updating display name for email:', email, 'with name:', displayName);
      const { data, error } = await SupabaseService.handleRequest(() =>
        supabase
          .from('users')
          .update({ display_name: displayName })
          .eq('email', email)
          .select()
      );

      if (error) {
        console.error('Error updating display name:', error);
        throw error;
      }

      console.log('Display name updated successfully:', data);
      
      // Store display name locally using StorageService
      StorageService.setItem('displayName', displayName);
      
      NotificationService.showDisplayNameSaved();
      
      // Go to home page
      setTimeout(() => {
        window.location.href = 'home.html';
      }, 1000);
    } catch (error) {
      console.error('Error saving display name:', error);
      NotificationService.showError('Failed to save display name. Please try again.');
    } finally {
      // Reset button state
      saveBtn.disabled = false;
      saveBtn.textContent = originalText;
    }
  });

  // Allow Enter key to trigger save
  displayNameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      saveBtn.click();
    }
  });

  // Auto-focus the input field
  setTimeout(() => {
    displayNameInput.focus();
  }, 100);
});