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
  
  // Force reset email field immediately
  forceResetEmailField();
  
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
    
    // Hide category dropdown initially
    const categoryGroup = document.getElementById('categoryGroup');
    const categorySelect = document.getElementById('category');
    const projectsGroup = document.getElementById('projectsGroup');
    if (categoryGroup) {
      categoryGroup.style.display = 'none';
    }
    if (categorySelect) {
      categorySelect.value = '';
      // Add event listener for category change
      categorySelect.addEventListener('change', handleCategoryChange);
    }
    if (projectsGroup) {
      projectsGroup.style.display = 'none';
    }
    
    // Initialize projects array
    window.userProjects = [];
    updateProjectsDisplay();
    
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
  const categoryGroup = document.getElementById('categoryGroup');
  const categorySelect = document.getElementById('category');
  const projectsGroup = document.getElementById('projectsGroup');
  
  if (!categoryGroup || !categorySelect) {
    return;
  }
  
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
      return;
    }
    
    // Show category dropdown only for new users
    if (!existingUser) {
      categoryGroup.style.display = 'block';
      categorySelect.required = true;
      console.log('New user detected, showing category dropdown');
    } else {
      categoryGroup.style.display = 'none';
      categorySelect.value = '';
      categorySelect.required = false;
      // Hide projects group for existing users
      if (projectsGroup) {
        projectsGroup.style.display = 'none';
      }
      // Clear projects array
      window.userProjects = [];
      updateProjectsDisplay();
      console.log('Existing user detected, hiding category dropdown');
    }
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
  const categorySelect = document.getElementById('category');
  const categoryGroup = document.getElementById('categoryGroup');
  
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

    if (error && error.code !== 'PGRST116') throw error;

    if (!existingUser) {
      // New user - validate category
      const category = categorySelect ? categorySelect.value.trim() : '';
      if (!category) {
        NotificationService.showError('Please select a category (Client or Freelancer)', 5000, true, true);
        loginBtn.disabled = false;
        loginBtn.textContent = originalText;
        categoryGroup.style.display = 'block';
        categorySelect.focus();
        return;
      }
      
      // Validate projects for Clients
      if (category === 'Client') {
        const projects = window.userProjects || [];
        if (projects.length === 0) {
          NotificationService.showError('Please add at least one project');
          loginBtn.disabled = false;
          loginBtn.textContent = originalText;
          const projectsGroup = document.getElementById('projectsGroup');
          if (projectsGroup) {
            projectsGroup.style.display = 'block';
          }
          const newProjectInput = document.getElementById('newProjectInput');
          if (newProjectInput) {
            newProjectInput.focus();
          }
          return;
        }
      }
      
      // Create new user with category
      console.log('Creating new user with email:', email, 'and category:', category);
      const { error: insertError } = await SupabaseService.handleRequest(() =>
        window.supabase.from('users').insert([{ 
          email,
          display_name: null, // Explicitly set to null, will be updated when user sets display name
          category: category // Add category
        }])
      );
      
      if (insertError) {
        console.error('Error creating user:', insertError);
        throw insertError;
      }
      
      console.log('User created successfully');
      
      // Save projects if user is a Client
      console.log('Category:', category);
      console.log('userProjects:', window.userProjects);
      console.log('userProjects length:', window.userProjects?.length);
      
      if (category === 'Client' && window.userProjects && window.userProjects.length > 0) {
        console.log('✅ Saving projects for Client:', window.userProjects);
        // Normalize and deduplicate project names (case-insensitive, trimmed)
        const uniqueProjects = Array.from(
          new Map(
            window.userProjects.map(p => [p.trim().toLowerCase(), p.trim()])
          ).values()
        );
        const projects = uniqueProjects.map(projectName => ({
          user_email: email,
          project_name: projectName
        }));
        
        console.log('Projects data to insert:', JSON.stringify(projects, null, 2));
        console.log('Supabase client available:', !!window.supabase);
        console.log('Projects table exists check...');
        
        // Try direct insert without wrapper first to see raw error
        try {
          const { data: projectsData, error: projectsError } = await window.supabase
            .from('projects')
            .upsert(projects, { onConflict: 'user_email,project_name', ignoreDuplicates: true })
            .select();
          
          if (projectsError) {
            console.error('❌ Error saving projects:', projectsError);
            console.error('Error code:', projectsError.code);
            console.error('Error message:', projectsError.message);
            console.error('Error details:', JSON.stringify(projectsError, null, 2));
            console.error('Error hint:', projectsError.hint);
            
            // Show detailed error message
            const errorMsg = projectsError.message || 'Failed to save projects';
            const errorCode = projectsError.code || 'UNKNOWN';
            NotificationService.showError(`User created but failed to save projects: ${errorMsg} (Code: ${errorCode}). Check console for details.`);
            
            // If it's an RLS error, provide specific guidance
            if (projectsError.code === '42501' || projectsError.message?.includes('permission') || projectsError.message?.includes('policy')) {
              console.error('⚠️ RLS Policy Error - Run the fix migration: database-migration-projects-fix-rls.sql');
              NotificationService.showError('RLS policy error. Please run database-migration-projects-fix-rls.sql in Supabase SQL Editor.');
            }
          } else {
            console.log('✅ Projects saved successfully:', projectsData);
            console.log('Number of projects saved:', projectsData?.length || 0);
            
            // Verify projects were saved
            const { data: verifyData, error: verifyError } = await window.supabase
              .from('projects')
              .select('*')
              .eq('user_email', email);
            
            if (verifyError) {
              console.error('Error verifying projects:', verifyError);
            } else {
              console.log('✅ Verified projects in database:', verifyData);
              if (verifyData && verifyData.length > 0) {
                NotificationService.showSuccess(`Successfully saved ${verifyData.length} project(s)!`);
              }
            }
          }
        } catch (err) {
          console.error('❌ Exception saving projects:', err);
          console.error('Exception stack:', err.stack);
          NotificationService.showError(`Exception saving projects: ${err.message}`);
        }
      }
      
      NotificationService.showNewUserCreated(email);
      
      // Store user email and category
      StorageService.setItem('userEmail', email);
      StorageService.setItem('userCategory', category);
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
      
      // Store user email and category
      StorageService.setItem('userEmail', email);
      if (existingUser.category) {
        StorageService.setItem('userCategory', existingUser.category);
      }
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
