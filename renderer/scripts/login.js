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
    
    // Hide category dropdown and projects section (no longer used with Frappe auth)
    const categoryGroup = document.getElementById('categoryGroup');
    const projectsGroup = document.getElementById('projectsGroup');
    if (categoryGroup) {
      categoryGroup.style.display = 'none';
    }
    if (projectsGroup) {
      projectsGroup.style.display = 'none';
    }
    
    // Add Enter key support - move to password field when Enter is pressed in email
    emailInput.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        const passwordInput = document.getElementById('password');
        if (passwordInput) {
          passwordInput.focus();
        }
      }
    });
    
    // Handle Enter key in password field to trigger login
    const passwordInput = document.getElementById('password');
    if (passwordInput) {
      passwordInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleLogin();
        }
      });
    }
    
    // Remove any existing event listeners to prevent duplicates
    emailInput.removeEventListener('click', handleEmailClick);
    emailInput.removeEventListener('mousedown', handleEmailMouseDown);
    
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

// checkUserExists function removed - no longer needed with Frappe authentication

async function handleLogin() {
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const errorMessageEl = document.getElementById('errorMessage');
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  
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

  // Validate password
  if (!password) {
    NotificationService.showError('Please enter your password');
    passwordInput.focus();
    return;
  }

  // Hide error message
  if (errorMessageEl) {
    errorMessageEl.style.display = 'none';
    errorMessageEl.textContent = '';
  }

  // Show loading state
  const loginBtn = document.getElementById('loginBtn');
  const originalText = loginBtn.textContent;
  loginBtn.disabled = true;
  loginBtn.innerHTML = '<span class="loading"></span> Logging in...';

  try {
    // Check if auth API is available
    if (!window.auth || !window.auth.login) {
      throw new Error('Authentication service not available. Please restart the application.');
    }

    // Attempt Frappe login
    console.log('Attempting Frappe login for:', email);
    const result = await window.auth.login(email, password);

    if (!result.success) {
      const errorMsg = result.error || 'Invalid credentials. Please check your email and password.';
      console.error('Frappe login failed:', errorMsg);
      
      // Show error message
      if (errorMessageEl) {
        errorMessageEl.textContent = errorMsg;
        errorMessageEl.style.display = 'block';
      } else {
        NotificationService.showError(errorMsg);
      }
      
      passwordInput.value = '';
      passwordInput.focus();
      return;
    }

    console.log('Frappe login successful for:', email);
    NotificationService.showLoginSuccess(email);
    
    // Store user email (always treat as Freelancer since we removed client concept)
    StorageService.setItem('userEmail', email);
    StorageService.setItem('userCategory', 'Freelancer');
    
    if (window.electronAPI?.setUserLoggedIn) {
      window.electronAPI.setUserLoggedIn(true).catch(err => console.error('Failed to update logged-in state:', err));
    }
    
    if (window.SessionSync) {
      window.SessionSync.setEmail(email);
      window.SessionSync.updateAppState(true);
    }
    
    // Check for display name:
    // 1) Try to load from Supabase users table
    // 2) Fallback to localStorage
    let displayName = StorageService.getItem('displayName');

    try {
      if (window.supabase) {
        // Look up existing user by email
        const { data: existingUser, error } = await SupabaseService.handleRequest(() =>
          window.supabase
            .from('users')
            .select('id, email, display_name, category')
            .eq('email', email)
            .maybeSingle()
        );

        if (error && error.code !== 'PGRST116') {
          console.error('Error loading user profile from Supabase:', error);
        }

        let userRow = existingUser || null;

        // If user does not exist yet in Supabase, create a basic record
        if (!userRow) {
          console.log('No Supabase user found for email, creating profile row:', email);
          const { data: inserted, error: insertError } = await SupabaseService.handleRequest(() =>
            window.supabase
              .from('users')
              .insert([{
                email,
                display_name: null,
                category: 'Freelancer'
              }])
              .select('id, email, display_name, category')
              .maybeSingle()
          );

          if (insertError) {
            console.error('Error creating user profile in Supabase:', insertError);
          } else {
            userRow = inserted || null;
          }
        }

        // If Supabase has a display_name, use it and cache locally
        if (userRow && userRow.display_name && userRow.display_name.trim() !== '') {
          displayName = userRow.display_name.trim();
          StorageService.setItem('displayName', displayName);
        }
      }
    } catch (profileError) {
      console.error('Error syncing display name with Supabase:', profileError);
      // Non-fatal – we still fallback to local storage check below
    }

    // Final decision: if we have a display name now, go to home; otherwise ask for it once
    if (displayName && displayName.trim() !== '') {
      setTimeout(() => {
        window.location.href = './home.html';
      }, 1000);
    } else {
      setTimeout(() => {
        window.location.href = './displayName.html';
      }, 1000);
    }

  } catch (err) {
    console.error('Login error:', err);
    const errorMsg = err.message || 'Login failed. Please try again.';
    
    if (errorMessageEl) {
      errorMessageEl.textContent = errorMsg;
      errorMessageEl.style.display = 'block';
    } else {
      NotificationService.showError(errorMsg);
    }
    
    passwordInput.value = '';
    passwordInput.focus();
  } finally {
    // Reset button state
    loginBtn.disabled = false;
    loginBtn.textContent = originalText;
  }
}
