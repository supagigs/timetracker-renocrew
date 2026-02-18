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
    
    // Force focus
    emailInput.focus();
    
    console.log('Email field reset complete. Disabled:', emailInput.disabled, 'ReadOnly:', emailInput.readOnly);
  }
}

const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const emailIcon = document.getElementById("emailIcon");
const passwordIcon = document.getElementById("passwordIcon");
const errorMessage = document.getElementById("errorMessage");

function resetStates() {
  emailInput.classList.remove("input-error", "input-success");
  passwordInput.classList.remove("input-error", "input-success");

  emailIcon.src = "../../assets/mail_original.svg";
  passwordIcon.src = "../../assets/lock_original.svg";

  errorMessage.style.display = "none";
}

function setErrorState({ email = false, password = false }, message) {
  // Remove success state completely
  emailInput.classList.remove("input-success");
  passwordInput.classList.remove("input-success");

  // Remove existing error state
  emailInput.classList.remove("input-error");
  passwordInput.classList.remove("input-error");

  emailIcon.src = "../../assets/mail_original.svg";
  passwordIcon.src = "../../assets/lock_original.svg";

  if (email) {
    emailInput.classList.add("input-error");
    emailIcon.src = "../../assets/mail_incorrect.svg";
  }

  if (password) {
    passwordInput.classList.add("input-error");
    passwordIcon.src = "../../assets/lock_incorrect.svg";
  }

  errorMessage.textContent = message;
  errorMessage.style.display = "block";
}

function setSuccessState() {
  emailInput.classList.add("input-success");
  passwordInput.classList.add("input-success");

  emailInput.classList.add("input-success");
  passwordInput.classList.add("input-success");

  emailIcon.src = "../../assets/mail_success.svg";
  passwordIcon.src = "../../assets/lock_success.svg";
}


// Initialize login page
async function initializeLoginPage() {
  console.log('Initializing login page');
  if (window.electronAPI?.setUserLoggedIn) {
    window.electronAPI.setUserLoggedIn(false).catch(err => console.error('Failed to update logged-in state:', err));
  }

  // Show app version from package.json (via main process)
  const versionEl = document.getElementById('appVersion');
  if (versionEl && window.electronAPI?.getAppVersion) {
    try {
      const version = await window.electronAPI.getAppVersion();
      versionEl.textContent = version ? `Version ${version}` : '';
    } catch (err) {
      console.warn('Could not load app version:', err);
      versionEl.textContent = '';
    }
  }
  
  // Clear any stored email to ensure fresh login
  StorageService.removeItem('userEmail');
  
  // Ensure email field is editable
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const loginBtn = document.getElementById('loginBtn');
  
  console.log('Email input found:', emailInput);
  console.log('Login button found:', loginBtn);
  
  if (emailInput) {
    // Reset all input properties to ensure it's interactive
    emailInput.readOnly = false;
    emailInput.disabled = false;
    
    // Load saved email from localStorage and auto-populate
    const savedEmail = StorageService.getItem('savedEmail');
    if (savedEmail && savedEmail.trim() !== '') {
      emailInput.value = savedEmail.trim();
      console.log('Auto-populated email from saved value');
    } else {
      emailInput.value = ''; // Clear if no saved email
    }
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
    // NotificationService.showError('Please enter a project name');
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



/**
 * Sync projects to database after login
 * Fetches projects assigned to the logged-in user from Frappe,
 * then for each project, finds all users assigned to it,
 * and stores each user-project combination in the projects table
 */
async function syncProjectsToDatabase(userEmail) {
  if (!userEmail || !window.frappe || !window.supabase) {
    console.warn('Cannot sync projects: missing userEmail, frappe, or supabase');
    return;
  }

  try {
    console.log('Starting project sync for user:', userEmail);

    // Step 1: Get projects assigned to the logged-in user from Frappe
    const projects = await window.frappe.getUserProjects();
    
    if (!projects || projects.length === 0) {
      console.log('No projects found for user:', userEmail);
      return;
    }

    console.log(`Found ${projects.length} project(s) for user ${userEmail}`);

    // Step 2: For each project, get all users assigned to it and store in database
    const projectEntries = [];

    for (const project of projects) {
      const projectId = project.id;
      const projectName = project.name;

      if (!projectId) {
        console.warn('Skipping project with no ID:', project);
        continue;
      }

      try {
        // Get all users assigned to this project
        const result = await window.frappe.getUsersAssignedToProject(projectId);
        
        if (!result || !result.success) {
          console.warn(`Failed to get users for project ${projectId}:`, result?.error);
          // Still create entry for the logged-in user
          projectEntries.push({
            user_email: userEmail.toLowerCase().trim(),
            frappe_project_id: projectId,
            project_name: projectName || projectId
          });
          continue;
        }

        const assignedUsers = result.users || [];
        const normalizedLoggedInEmail = userEmail.toLowerCase().trim();

        // Always ensure the logged-in user is included in the assigned users list
        // This is critical because the logged-in user should always have an entry for their projects
        const allUsersSet = new Set();
        
        // Add logged-in user first (guaranteed entry)
        allUsersSet.add(normalizedLoggedInEmail);
        
        // Add all other assigned users
        assignedUsers.forEach(userEmailFromProject => {
          if (userEmailFromProject && typeof userEmailFromProject === 'string') {
            allUsersSet.add(userEmailFromProject.toLowerCase().trim());
          }
        });

        const allUsers = Array.from(allUsersSet);
        
        if (allUsers.length === 0) {
          // Fallback: if somehow no users, still create entry for logged-in user
          console.log(`No users found for project ${projectId}, creating entry for logged-in user only`);
          projectEntries.push({
            user_email: normalizedLoggedInEmail,
            frappe_project_id: projectId,
            project_name: projectName || projectId
          });
        } else {
          // Create entries for all users (including logged-in user)
          console.log(`Creating entries for ${allUsers.length} user(s) for project ${projectId}:`, allUsers);
          
          allUsers.forEach(userEmailFromProject => {
            projectEntries.push({
              user_email: userEmailFromProject,
              frappe_project_id: projectId,
              project_name: projectName || projectId
            });
          });
        }
      } catch (projectError) {
        console.error(`Error processing project ${projectId}:`, projectError);
        // Still create entry for the logged-in user as fallback
        projectEntries.push({
          user_email: userEmail.toLowerCase().trim(),
          frappe_project_id: projectId,
          project_name: projectName || projectId
        });
      }
    }

    if (projectEntries.length === 0) {
      console.log('No project entries to sync');
      return;
    }

    // Step 3: Deduplicate entries before processing
    // Use a Map to track unique (user_email, frappe_project_id) combinations
    const uniqueEntriesMap = new Map();
    let duplicateCount = 0;

    for (const entry of projectEntries) {
      const key = `${entry.user_email}|${entry.frappe_project_id}`;
      
      if (uniqueEntriesMap.has(key)) {
        duplicateCount++;
        console.log(`Skipping duplicate entry: ${entry.user_email} - ${entry.frappe_project_id}`);
        // Keep the entry with the most recent project_name (if different)
        const existing = uniqueEntriesMap.get(key);
        if (entry.project_name && entry.project_name !== existing.project_name) {
          uniqueEntriesMap.set(key, entry);
        }
      } else {
        uniqueEntriesMap.set(key, entry);
      }
    }

    const uniqueEntries = Array.from(uniqueEntriesMap.values());
    
    if (duplicateCount > 0) {
      console.log(`Deduplicated ${duplicateCount} duplicate entry/entries. Processing ${uniqueEntries.length} unique entries.`);
    } else {
      console.log(`Syncing ${uniqueEntries.length} unique project entry/entries to database`);
    }

    // Step 4: Use atomic upsert operations to insert/update projects
    // Process entries individually to ensure proper error handling and avoid batch conflicts
    // IMPORTANT: We call Supabase directly here (no SupabaseService) so that expected
    // duplicate-key conflicts don't trigger user-visible error popups.
    let processedCount = 0;
    let errorCount = 0;
    let skippedCount = 0;

    for (const entry of uniqueEntries) {
      try {
        const { error } = await window.supabase
          .from('projects')
          .upsert(entry, {
            onConflict: 'user_email,frappe_project_id',
            ignoreDuplicates: false
          });

        if (error) {
          // Handle unique constraint violation gracefully
          if (error.code === '23505' ||
              error.message?.includes('duplicate key') || 
              error.message?.includes('unique constraint') || 
              error.message?.includes('idx_projects_user_email_frappe_project_id') ||
              error.message?.includes('user_email')) {
            // Entry already exists - this is okay, treat as success
            skippedCount++;
            console.log(`Entry already exists (skipped): ${entry.user_email} - ${entry.frappe_project_id}`);
          } else {
            console.error(`Error upserting project entry:`, error);
            console.error(`Entry details:`, entry);
            errorCount++;
          }
        } else {
          processedCount++;
        }
      } catch (entryError) {
        // Handle any other errors (network, etc.)
        if (entryError?.code === '23505' ||
            entryError?.message?.includes('duplicate key') ||
            entryError?.message?.includes('unique constraint') ||
            entryError?.message?.includes('user_email')) {
          skippedCount++;
          console.log(`Entry already exists (skipped): ${entry.user_email} - ${entry.frappe_project_id}`);
        } else {
          console.error(`Error processing project entry:`, entryError);
          console.error(`Entry details:`, entry);
          errorCount++;
        }
      }
    }

    console.log(`Project sync completed: ${processedCount} processed, ${skippedCount} skipped (already exist), ${errorCount} errors`);
  } catch (error) {
    console.error('Error in syncProjectsToDatabase:', error);
    throw error;
  }
}

async function checkEmailExists(email) {
  try {
    const { data, error } = await window.supabase
      .from('users')
      .select('id')
      .eq('email', email.toLowerCase())
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Email existence check error:', error);
      return false;
    }

    return !!data;
  } catch (err) {
    console.error('Email existence check failed:', err);
    return false;
  }
}

async function handleLogin() {
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const errorMessageEl = document.getElementById('errorMessage');
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  const normalizedEmail = email.toLowerCase().trim();
  
  /* ---------------- EMAIL VALIDATION ---------------- */
  
// Empty email
if (!email) {
  setErrorState(
    { email: true, password: false },
    'Please enter your email address'
  );
  emailInput.focus();
  return;
}

// Invalid email format (typo like gmial.con)
if (!ValidationService.validateEmail(email)) {
  setErrorState(
    { email: true, password: false },
    'Please enter a valid email address'
  );
  emailInput.focus();
  return;
}

  // Validate password
  if (!password) {
    // NotificationService.showError('Please enter your password');
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

  // Normalize email for all internal usage (database, storage, etc.)
  // const normalizedEmail = email.toLowerCase().trim();

  try {
    // Check if auth API is available
    if (!window.auth || !window.auth.login) {
      throw new Error('Authentication service not available. Please restart the application.');
    }

    // Attempt Frappe login
    console.log('Attempting Frappe login for:', email);
    // Frappe auth is typically case-insensitive, but we keep the original
    // value here in case the backend preserves/display casing.
    const result = await window.auth.login(email, password);

    if (!result.success) {
      const errorText = (result.error || '').toLowerCase();
    
      // Email-related backend errors
      if (
        errorText.includes('password') ||
        errorText.includes('credentials')
      ) {
        setErrorState(
          { email: false, password: true },
          'Incorrect password'
        );
        passwordInput.value = '';
        passwordInput.focus();
        return;
      }     
    
      // Password-related backend errors
      if (
        errorText.includes('password')
      ) {
        setErrorState(
          { email: false, password: true },
          'Incorrect password'
        );
        passwordInput.value = '';
        passwordInput.focus();
        return;
      }
    
      // Credentials mismatch (email exists but password wrong)
      if (errorText.includes('credentials')) {
        setErrorState(
          { email: false, password: true },
          'Incorrect password'
        );
        passwordInput.value = '';
        passwordInput.focus();
        return;
      }
    
      // Absolute fallback
      setErrorState(
        { email: true, password: true },
        'Invalid login credentials'
      );
      passwordInput.value = '';
      passwordInput.focus();
      return;
    }

    console.log('Frappe login successful for:', email);
    setSuccessState();
    // Save email for auto-population on next login (password is never stored)
    // Store normalized email so all future logic uses a consistent key
    StorageService.setItem('savedEmail', normalizedEmail);
    
    // Store user email (always treat as Freelancer since we removed client concept)
    StorageService.setItem('userEmail', normalizedEmail);
    StorageService.setItem('userCategory', 'Freelancer');
    
    if (window.electronAPI?.setUserLoggedIn) {
      window.electronAPI.setUserLoggedIn(true).catch(err => console.error('Failed to update logged-in state:', err));
    }
    
    if (window.SessionSync) {
      window.SessionSync.setEmail(normalizedEmail);
      window.SessionSync.updateAppState(true);
    }

    // 🛡️ Crash recovery: Check for and close any ghost running timers left from crashes
    // This prevents overlap errors and cleans up orphaned time logs
    if (window.frappe && window.frappe.recoverRunningTimers) {
      try {
        // Get employee ID first
        const employeeResult = await window.frappe.getEmployeeId(normalizedEmail);
        if (employeeResult && employeeResult.success && employeeResult.employeeId) {
          console.log('Running crash recovery for employee:', employeeResult.employeeId);
          const recoveryResult = await window.frappe.recoverRunningTimers(employeeResult.employeeId);
          if (recoveryResult && recoveryResult.success && recoveryResult.recovered > 0) {
            console.log(`Crash recovery completed: ${recoveryResult.message}`);
            NotificationService.showInfo(`Recovered ${recoveryResult.recovered} timer(s) from previous session`);
          }
        }
      } catch (recoveryError) {
        console.error('Error during crash recovery:', recoveryError);
        // Don't block login if recovery fails
      }
    }
    
    // Check for display name:
    // 1) Try to load from Frappe User (full_name / first_name + last_name)
    // 2) Sync into Supabase users.display_name
    // 3) Fallback to existing Supabase value or localStorage
    let displayName = StorageService.getItem('displayName');
    let displayNameFromFrappe = null;

    try {
      // Fetch display name, company and role profile from Frappe
      let company = null;
      let roleProfile = null;
      let fullName = null;
      
      if (window.auth && window.auth.getUserCompany) {
        try {
          const companyResult = await window.auth.getUserCompany(normalizedEmail);
          if (companyResult && companyResult.success) {
            // Handle case where company might be an object (e.g., {name: "Company Name"})
            const companyValue = companyResult.company;
            if (typeof companyValue === 'string') {
              company = companyValue;
            } else if (companyValue && typeof companyValue === 'object' && companyValue.name) {
              company = companyValue.name;
            } else if (companyValue && typeof companyValue === 'object') {
              // Try to extract string value from object
              company = Object.values(companyValue).find(v => typeof v === 'string') || null;
            }
            console.log('Fetched company from Frappe:', company);
          }
        } catch (companyError) {
          console.error('Error fetching company from Frappe:', companyError);
          // Non-fatal - continue without company
        }
      }

      if (window.auth && window.auth.getUserRoleProfile) {
        try {
          const roleProfileResult = await window.auth.getUserRoleProfile(normalizedEmail);
          if (roleProfileResult && roleProfileResult.success) {
            roleProfile = roleProfileResult.roleProfile || null;
            console.log('Fetched role profile from Frappe:', roleProfile);
          }
        } catch (roleProfileError) {
          console.error('Error fetching role profile from Frappe:', roleProfileError);
          // Non-fatal - continue without role profile
        }
      }

      if (window.auth && window.auth.getUserFullName) {
        try {
          const fullNameResult = await window.auth.getUserFullName(normalizedEmail);
          if (fullNameResult && fullNameResult.success && fullNameResult.fullName) {
            fullName = String(fullNameResult.fullName).trim();
            if (fullName) {
              displayNameFromFrappe = fullName;
              displayName = fullName;
              StorageService.setItem('displayName', fullName);
              console.log('Fetched full name from Frappe:', fullName);
            }
          }
        } catch (fullNameError) {
          console.error('Error fetching full name from Frappe:', fullNameError);
          // Non-fatal - continue without full name
        }
      }

      // Store role_profile_name directly from Frappe (not converted)
      // The role_profile_name from Frappe will be stored as-is in the database

      if (window.supabase) {
        // Look up existing user by email
        const { data: existingUser, error } = await SupabaseService.handleRequest(() =>
          window.supabase
            .from('users')
            .select('id, email, display_name, role, company')
            .eq('email', normalizedEmail)
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
                email: normalizedEmail,
                display_name: displayNameFromFrappe || null,
                role: roleProfile, // Store role_profile_name directly from Frappe
                company: company
              }])
              .select('id, email, display_name, role, company')
              .maybeSingle()
          );

          if (insertError) {
            console.error('Error creating user profile in Supabase:', insertError);
          } else {
            userRow = inserted || null;
          }
        } else {
          // Update role and/or company if they have changed
          const updateData = {};
          if (userRow.role !== roleProfile) {
            updateData.role = roleProfile; // Store role_profile_name directly
            console.log('Updating role for user:', email, 'from', userRow.role, 'to', roleProfile);
          }
          // Update company if it's different (handle null/undefined cases)
          const currentCompany = userRow.company || null;
          const newCompany = company || null;
          if (newCompany && currentCompany !== newCompany) {
            updateData.company = newCompany;
            console.log('Updating company for user:', email, 'from', currentCompany, 'to', newCompany);
          } else if (!currentCompany && newCompany) {
            // Also update if current is null/empty and we have a new value
            updateData.company = newCompany;
            console.log('Setting company for user:', email, 'to', newCompany);
          }

          // Update display_name from Frappe if we have it and it's different
          const currentDisplayName = (userRow.display_name || '').trim();
          if (displayNameFromFrappe && displayNameFromFrappe !== currentDisplayName) {
            updateData.display_name = displayNameFromFrappe;
            console.log('Updating display name for user from Supabase to match Frappe:', currentDisplayName, '->', displayNameFromFrappe);
          }

          if (Object.keys(updateData).length > 0) {
            const { error: updateError } = await SupabaseService.handleRequest(() =>
              window.supabase
                .from('users')
                .update(updateData)
                .eq('id', userRow.id)
            );

            if (updateError) {
              console.error('Error updating user profile in Supabase:', updateError);
            } else {
              // Update local userRow with new values
              if (updateData.role) userRow.role = updateData.role;
              if (updateData.company) userRow.company = updateData.company;
              if (updateData.display_name) userRow.display_name = updateData.display_name;
            }
          }
        }

        // If we didn't get a display name from Frappe, but Supabase has one, use it and cache locally
        if (!displayNameFromFrappe && userRow && userRow.display_name && userRow.display_name.trim() !== '') {
          displayName = userRow.display_name.trim();
          StorageService.setItem('displayName', displayName);
        }

        // Sync projects to database after successful login
        try {
          await syncProjectsToDatabase(email);
        } catch (syncError) {
          console.error('Error syncing projects to database:', syncError);
          // Non-fatal - don't block login if project sync fails
        }
      }
    } catch (profileError) {
      console.error('Error syncing display name with Supabase:', profileError);
      // Non-fatal – we still fallback to local storage check below
    }

    // After login, always redirect to projects screen
    // Projects screen will display all assigned projects from Frappe
    setTimeout(() => {
      window.location.href = './projects.html';
    }, 1000);

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

function handleUserTyping(e) {
  const target = e.target;

  // Remove success/error ONLY from the field being edited
  target.classList.remove("input-error", "input-success");

  // Reset corresponding icon only
  if (target === emailInput) {
    emailIcon.src = "../../assets/mail_original.svg";
  }

  if (target === passwordInput) {
    passwordIcon.src = "../../assets/lock_original.svg";
  }

  // Hide global error message when user starts correcting input
  errorMessage.style.display = "none";
}
