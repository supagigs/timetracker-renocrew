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
      // Prefer saving to Supabase users table when available so display name
      // is persisted across machines. Fall back to local-only storage if Supabase
      // is not configured.
      let savedToDatabase = false;

      if (window.supabase) {
        try {
          console.log('Updating Supabase display name for email:', email, 'name:', displayName);
          const { data, error } = await SupabaseService.handleRequest(() =>
            window.supabase
              .from('users')
              .upsert(
                {
                  email,
                  display_name: displayName,
                  category: 'Freelancer',
                },
                { onConflict: 'email' }
              )
              .select('email, display_name')
              .maybeSingle()
          );

          if (error) {
            console.error('Error updating display name in Supabase:', error);
          } else {
            console.log('Display name updated in Supabase:', data);
            savedToDatabase = true;
          }
        } catch (dbError) {
          console.error('Exception while updating display name in Supabase:', dbError);
        }
      } else {
        console.warn('Supabase client not available; saving display name locally only.');
      }

      // Always cache locally so subsequent logins on this device skip this screen
      StorageService.setItem('displayName', displayName);

      if (!savedToDatabase) {
        console.warn('Display name may not be saved in the remote database; using local storage.');
      }

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