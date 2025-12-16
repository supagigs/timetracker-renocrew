// Force reset email input field immediately
function forceResetEmailField() {
  const emailInput = document.getElementById('email');
  if (emailInput) {
    console.log('Force resetting email input field');
    
    // Remove all attributes that could disable the field
    emailInput.removeAttribute('disabled');
    emailInput.removeAttribute('readonly');
    emailInput.removeAttribute('readOnly');
    
    // Reset all properties
    emailInput.disabled = false;
    emailInput.readOnly = false;
    emailInput.value = '';
    
    // Reset all styles
    emailInput.style.pointerEvents = 'auto';
    emailInput.style.cursor = 'text';
    emailInput.style.userSelect = 'text';
    emailInput.style.opacity = '1';
    emailInput.style.backgroundColor = '';
    emailInput.style.color = '';
    emailInput.style.border = '';
    
    // Force focus
    emailInput.focus();
    
    console.log('Email field reset complete. Disabled:', emailInput.disabled, 'ReadOnly:', emailInput.readOnly);
  }
}

// Initialize login page
function initializeLoginPage() {
  console.log('Initializing login page');
  if (window.electronAPI?.setUserLoggedIn) {
    window.electronAPI.setUserLoggedIn(false).catch(err => console.error('Failed to update logged-in state:', err));
  }
  
  // Clear any stored email to ensure fresh login
  StorageService.removeItem('userEmail');
  
  // Ensure email field is editable
  const emailInput = document.getElementById('email');
  const loginBtn = document.getElementById('loginBtn');
  
  console.log('Email input found:', emailInput);
  console.log('Login button found:', loginBtn);
  
  if (emailInput) {
    // Reset all input properties to ensure it's interactive
    emailInput.readOnly = false;
    emailInput.disabled = false;
    emailInput.value = ''; // Clear any existing value
    emailInput.style.pointerEvents = 'auto';
    emailInput.style.cursor = 'text';
    emailInput.style.userSelect = 'text';
    emailInput.style.opacity = '1';
    emailInput.style.backgroundColor = '';
    emailInput.removeAttribute('readonly');
    emailInput.removeAttribute('disabled');
    
    // Hide category dropdown and projects section – we no longer ask for user type
    const categoryGroup = document.getElementById('categoryGroup');
    const projectsGroup = document.getElementById('projectsGroup');
    if (categoryGroup) {
      categoryGroup.style.display = 'none';
    }
    if (projectsGroup) {
      projectsGroup.style.display = 'none';
    }
    
    // Add event listener to check if user exists when email is entered
    emailInput.addEventListener('blur', async function() {
      const email = emailInput.value.trim();
      if (email && ValidationService.validateEmail(email)) {
        await checkUserExists(email);
      } else {
        // Hide category dropdown if email is invalid or empty
        if (categoryGroup) {
          categoryGroup.style.display = 'none';
        }
      }
    });
    
    // Remove any existing event listeners to prevent duplicates
    emailInput.removeEventListener('keypress', handleEnterKey);
    emailInput.removeEventListener('click', handleEmailClick);
    emailInput.removeEventListener('mousedown', handleEmailMouseDown);
    
    // Add Enter key support
    emailInput.addEventListener('keypress', handleEnterKey);
    
    // Add click event to ensure field is clickable
    emailInput.addEventListener('click', handleEmailClick);
    
    // Add mousedown event to ensure field responds to clicks
    emailInput.addEventListener('mousedown', handleEmailMouseDown);
    
    // Force focus to ensure the field is interactive
    setTimeout(() => {
      emailInput.focus();
      console.log('Email input focused and ready for input');
    }, 100);
    
    // Additional check to ensure field is truly interactive
    setTimeout(() => {
      if (emailInput.disabled || emailInput.readOnly) {
        console.warn('Email input is still disabled/readonly, forcing reset');
        emailInput.disabled = false;
        emailInput.readOnly = false;
        emailInput.focus();
      }
    }, 200);
    
    // Final verification
    setTimeout(() => {
      console.log('Final email field state - Disabled:', emailInput.disabled, 'ReadOnly:', emailInput.readOnly, 'Value:', emailInput.value);
    }, 500);
    
  } else {
    console.error('Email input field not found!');
  }
  
  if (loginBtn) {
    // Remove any existing event listeners to prevent duplicates
    loginBtn.removeEventListener('click', handleLogin);
    loginBtn.addEventListener('click', handleLogin);
  } else {
    console.error('Login button not found!');
  }
}

// Separate event handler functions to prevent duplicate listeners
function handleEnterKey(e) {
  if (e.key === 'Enter') {
    handleLogin();
  }
}

function handleEmailClick() {
  console.log('Email input clicked');
  const emailInput = document.getElementById('email');
  emailInput.focus();
}

function handleEmailMouseDown(e) {
  console.log('Email input mousedown');
  e.preventDefault();
  const emailInput = document.getElementById('email');
  emailInput.focus();
}

// Force reset immediately when script loads
forceResetEmailField();

// Wait for DOM to be ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeLoginPage);
} else {
  // DOM is already ready
  initializeLoginPage();
}

// Also reinitialize when page becomes visible (e.g., after logout)
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    console.log('Page became visible, reinitializing login form');
    setTimeout(initializeLoginPage, 100);
  }
});

// Reinitialize on window focus (additional safety)
window.addEventListener('focus', () => {
  console.log('Window focused, ensuring login form is ready');
  setTimeout(initializeLoginPage, 100);
 });

// Handle category change - show/hide projects section
function handleCategoryChange() {
  const categorySelect = document.getElementById('category');
  const projectsGroup = document.getElementById('projectsGroup');
  
  if (!categorySelect || !projectsGroup) {
    return;
  }
  
  const category = categorySelect.value.trim();
  
  if (category === 'Client') {
    projectsGroup.style.display = 'block';
    console.log('Client selected, showing projects section');
  } else {
    projectsGroup.style.display = 'none';
    // Clear projects when switching away from Client
    window.userProjects = [];
    updateProjectsDisplay();
    console.log('Not Client, hiding projects section');
  }
}

// Add project to the list
window.addProject = function() {
  const newProjectInput = document.getElementById('newProjectInput');
  if (!newProjectInput) return;
  
  const projectName = newProjectInput.value.trim();
  
  if (!projectName) {
    NotificationService.showError('Please enter a project name');
    newProjectInput.focus();
    return;
  }
  
  // Initialize projects array if it doesn't exist
  if (!window.userProjects) {
    window.userProjects = [];
  }
  
  // Check if project already exists (case-insensitive, trimmed)
  if (window.userProjects.some(p => p.trim().toLowerCase() === projectName.trim().toLowerCase())) {
    NotificationService.showError('This project is already added');
    newProjectInput.focus();
    return;
  }
  
  // Add project
  window.userProjects.push(projectName.trim());
  newProjectInput.value = '';
  updateProjectsDisplay();
  
  console.log('Project added:', projectName, 'Total projects:', window.userProjects.length);
};

// Remove project from the list
window.removeProject = function(projectName) {
  if (!window.userProjects) {
    window.userProjects = [];
    return;
  }
  
  const index = window.userProjects.indexOf(projectName);
  if (index > -1) {
    window.userProjects.splice(index, 1);
    updateProjectsDisplay();
    console.log('Project removed:', projectName);
  }
};

// Update the projects display
function updateProjectsDisplay() {
  const projectsList = document.getElementById('projectsList');
  if (!projectsList) return;
  
  if (!window.userProjects || window.userProjects.length === 0) {
    projectsList.innerHTML = '<p class="auth-empty-text">No projects added yet</p>';
    return;
  }
  
  // Clear existing content
  projectsList.innerHTML = '';

  const container = document.createElement('div');
  container.className = 'project-chip-list';

  window.userProjects.forEach((project, index) => {
    const projectDiv = document.createElement('div');
    projectDiv.className = 'project-chip';

    const projectSpan = document.createElement('span');
    projectSpan.className = 'project-chip__label';
    projectSpan.textContent = project;

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.textContent = '×';
    removeBtn.className = 'project-chip__remove';
    removeBtn.title = 'Remove project';
    removeBtn.setAttribute('aria-label', `Remove project ${project}`);
    removeBtn.onclick = function() {
      removeProject(project);
    };
    
    projectDiv.appendChild(projectSpan);
    projectDiv.appendChild(removeBtn);
    container.appendChild(projectDiv);
  });
  
  projectsList.appendChild(container);
}

// Check if user exists to show/hide category dropdown
async function checkUserExists(email) {
  // We no longer show or require categories or projects during login/signup,
  // but we keep this function minimal to avoid breaking existing wiring.
  try {
    if (!window.supabase) {
      return;
    }
    
    const { data: existingUser, error } = await SupabaseService.handleRequest(() =>
      window.supabase
        .from('users')
        .select('email')
        .eq('email', email)
        .maybeSingle()
    );
    
    if (error && error.code !== 'PGRST116') {
      console.error('Error checking user:', error);
      console.error('Error details:', {
        message: error.message,
        code: error.code,
        hint: error.hint,
        details: error.details,
        status: error.status,
        statusCode: error.statusCode
      });
      console.error('Full error object:', JSON.stringify(error, null, 2));
      
      // Check if it's an RLS policy error
      if (error.code === '42501' || error.message?.includes('permission') || error.message?.includes('policy') || error.statusCode === 556) {
        console.error('⚠️ RLS Policy Error - The users table RLS policies need to be fixed.');
        console.error('⚠️ Please run database-migration-users-fix-rls.sql in Supabase SQL Editor.');
        NotificationService.showError('Database permission error. Please check console for details.');
      }
      return;
    }
    
    // Previously we showed a category dropdown for new users.
    // Now every user is treated as a Freelancer, so no extra UI is needed here.
  } catch (err) {
    console.error('Error checking user existence:', err);
    // On error, hide the dropdown to be safe
    if (categoryGroup) {
      categoryGroup.style.display = 'none';
    }
    if (projectsGroup) {
      projectsGroup.style.display = 'none';
    }
  }
}

async function handleLogin() {
  const emailInput = document.getElementById('email');
  const email = emailInput.value.trim();
  
  // Validate email
  if (!email) {
    NotificationService.showError('Please enter an email address');
    emailInput.focus();
    return;
  }
  
  if (!ValidationService.validateEmail(email)) {
    NotificationService.showEmailValidationError();
    emailInput.focus();
    return;
  }

  // Show loading state
  const loginBtn = document.getElementById('loginBtn');
  const originalText = loginBtn.textContent;
  loginBtn.disabled = true;
  loginBtn.innerHTML = '<span class="loading"></span> Logging in...';

  try {
    // Check if Supabase client is available
    if (!window.supabase) {
      throw new Error('Database connection not configured. Please check your environment variables.');
    }

    // Check if user exists
    const { data: existingUser, error } = await SupabaseService.handleRequest(() =>
      window.supabase
        .from('users')
        .select('*')
        .eq('email', email)
        .maybeSingle() // Use maybeSingle instead of single to avoid error when no rows found
    );

    if (error && error.code !== 'PGRST116') {
      console.error('Login error details:', {
        message: error.message,
        code: error.code,
        hint: error.hint,
        details: error.details,
        status: error.status,
        statusCode: error.statusCode
      });
      console.error('Full error object:', JSON.stringify(error, null, 2));
      
      // Check if it's an RLS policy error
      if (error.code === '42501' || error.message?.includes('permission') || error.message?.includes('policy') || error.statusCode === 556) {
        console.error('⚠️ RLS Policy Error - The users table RLS policies need to be fixed.');
        console.error('⚠️ Please run database-migration-users-fix-rls.sql in Supabase SQL Editor.');
        NotificationService.showError('Database permission error. Please check console for details.');
      }
      throw error;
    }

    if (!existingUser) {
      // New user – we no longer distinguish between Client and Freelancer.
      // Every account is treated as a Freelancer.
      const category = 'Freelancer';
      console.log('Creating new user with email:', email, 'as single role:', category);
      const { error: insertError } = await SupabaseService.handleRequest(() =>
        window.supabase.from('users').insert([{ 
          email,
          display_name: null, // Explicitly set to null, will be updated when user sets display name
          category: category // Always store as 'Freelancer'
        }])
      );
      
      if (insertError) {
        console.error('Error creating user:', insertError);
        throw insertError;
      }
      
      console.log('User created successfully');
      
      NotificationService.showNewUserCreated(email);
      
      // Store user email and single user type
      StorageService.setItem('userEmail', email);
      StorageService.setItem('userCategory', 'Freelancer');
      if (window.electronAPI?.setUserLoggedIn) {
        window.electronAPI.setUserLoggedIn(true).catch(err => console.error('Failed to update logged-in state:', err));
      }
      if (window.SessionSync) {
        window.SessionSync.setEmail(email);
        window.SessionSync.updateAppState(true);
      }
      
      // Navigate to display name screen for new users
      setTimeout(() => {
        window.location.href = './displayName.html';
      }, 1000);
    } else {
      NotificationService.showLoginSuccess(email);
      
      // Store user email and treat all users as the single Freelancer role
      StorageService.setItem('userEmail', email);
      StorageService.setItem('userCategory', 'Freelancer');
      if (window.electronAPI?.setUserLoggedIn) {
        window.electronAPI.setUserLoggedIn(true).catch(err => console.error('Failed to update logged-in state:', err));
      }
      
      // Check if user has display name
      if (existingUser.display_name && existingUser.display_name.trim() !== '') {
        // Store display name and go directly to home
        StorageService.setItem('displayName', existingUser.display_name);
        setTimeout(() => {
          window.location.href = './home.html';
        }, 1000);
      } else {
        // User exists but no display name in database
        console.log('User exists but no display name found in database');
        
        // Check if we have a local display name that we can sync
        const localName = StorageService.getItem('displayName');
        if (localName && localName.trim() !== '') {
          console.log('Found local display name, attempting to sync:', localName);
          try {
            const { data, error } = await SupabaseService.handleRequest(() =>
              supabase
                .from('users')
                .update({ display_name: localName })
                .eq('email', email)
                .select()
            );
            
            if (error) {
              console.error('Error syncing local display name:', error);
              throw error;
            }
            
            console.log('Local display name synced successfully:', data);
            StorageService.setItem('displayName', localName);
            setTimeout(() => {
              window.location.href = './home.html';
            }, 500);
          } catch (error) {
            console.error('Failed to sync local display name:', error);
            // If sync fails, go to display name screen to re-enter
            setTimeout(() => {
              window.location.href = './displayName.html';
            }, 500);
          }
        } else {
          // No display name anywhere, go to display name screen
          console.log('No display name found locally or in database, redirecting to display name screen');
          setTimeout(() => {
            window.location.href = './displayName.html';
          }, 1000);
        }
      }

      if (window.SessionSync) {
        window.SessionSync.setEmail(email);
        window.SessionSync.updateAppState(true);
      }
    }

  } catch (err) {
    console.error('Login error:', err);
    NotificationService.showError('Login failed. Please try again.');
  } finally {
    // Reset button state
    loginBtn.disabled = false;
    loginBtn.textContent = originalText;
  }
}
