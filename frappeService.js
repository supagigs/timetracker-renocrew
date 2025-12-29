const { createFrappeClient } = require('./frappeClient');
const { getCurrentUser } = require('./frappeAuth');

// Logging functions will be passed from main.js
let logInfo, logError;

function setLoggers(loggers) {
  logInfo = loggers.logInfo;
  logError = loggers.logError;
}

/**
 * Get employee ID for a user email
 * Tries multiple methods to find the employee (exact match, case-insensitive, like operator)
 * Returns employee name/ID or null if not found
 */
async function getEmployeeForUser(userEmail) {
  if (!userEmail) {
    return null;
  }

  const frappe = createFrappeClient();
  
  try {
    // Method 1: Exact match on user_id
    if (logInfo) {
      logInfo('Frappe', `Looking up employee for user: ${userEmail}`);
    }
    
    let employeeRes = await frappe.get('/api/resource/Employee', {
      params: {
        fields: JSON.stringify(['name', 'user_id', 'employee_name']),
        filters: JSON.stringify([
          ['user_id', '=', userEmail],
        ]),
        limit_page_length: 100,
      },
    });

    let employees = employeeRes?.data?.data || [];
    
    // Method 1b: If no match on user_id, try email_id as query parameter (not in filters)
    // IMPORTANT: email_id as query parameter may return multiple results, so we need to filter
    if (employees.length === 0) {
      if (logInfo) {
        logInfo('Frappe', `No match on user_id, trying email_id as query parameter`);
      }
      try {
        employeeRes = await frappe.get('/api/resource/Employee', {
          params: {
            email_id: userEmail, // Query parameter, not in filters
            fields: JSON.stringify(['name', 'user_id', 'employee_name', 'email_id']),
            limit_page_length: 100,
          },
        });
        let allEmployees = employeeRes?.data?.data || [];
        
        // CRITICAL: Filter results to find employees whose user_id or email_id matches
        employees = allEmployees.filter(emp => {
          const empUserId = String(emp.user_id || '').trim().toLowerCase();
          const empEmailId = String(emp.email_id || '').trim().toLowerCase();
          const searchEmail = String(userEmail || '').trim().toLowerCase();
          
          return empUserId === searchEmail || empEmailId === searchEmail;
        });
        
        if (logInfo) {
          logInfo('Frappe', `email_id query returned ${allEmployees.length} employee(s), filtered to ${employees.length} matching user ${userEmail}`);
        }
      } catch (emailIdErr) {
        if (logInfo) {
          logInfo('Frappe', `email_id query parameter failed: ${emailIdErr.message}`);
        }
      }
    }
    
    if (logInfo) {
      logInfo('Frappe', `Exact match query returned ${employees.length} employee(s)`);
      if (employees.length > 0) {
        employees.forEach((emp, idx) => {
          logInfo('Frappe', `  Employee ${idx + 1}: name=${emp.name}, user_id=${emp.user_id || 'EMPTY'}, employee_name=${emp.employee_name || 'N/A'}`);
        });
      }
    }
    
    // Method 2: If no exact match, try case-insensitive search (filter in code)
    if (employees.length === 0) {
      if (logInfo) {
        logInfo('Frappe', `No exact match found, trying case-insensitive search (fetching all employees)`);
      }
      
      // Get all employees and filter in code
      // Note: We can't query email_id in filters or fields, so we fetch all and filter
      // IMPORTANT: email_id cannot be in fields array - Frappe doesn't permit it
      employeeRes = await frappe.get('/api/resource/Employee', {
        params: {
          fields: JSON.stringify(['name', 'user_id', 'employee_name']),
          limit_page_length: 1000,
        },
      });
      
      const allEmployees = employeeRes?.data?.data || [];
      if (logInfo) {
        logInfo('Frappe', `Fetched ${allEmployees.length} total employee(s) from Frappe`);
      }
      
      // First filter by user_id (we have this field)
      employees = allEmployees.filter(emp => {
        const empUserId = String(emp.user_id || '').trim().toLowerCase();
        const searchEmail = String(userEmail || '').trim().toLowerCase();
        return empUserId === searchEmail;
      });
      
      // If no match on user_id, we need to fetch email_id individually for each employee
      // This is slower but necessary since email_id can't be queried
      if (employees.length === 0) {
        if (logInfo) {
          logInfo('Frappe', `No match on user_id, fetching email_id for each employee to check`);
        }
        
        // Fetch email_id for employees that might match (limit to reasonable number)
        const candidates = allEmployees.slice(0, 50); // Limit to first 50 to avoid too many requests
        for (const emp of candidates) {
          try {
            const empDetailRes = await frappe.get(`/api/resource/Employee/${emp.name}`, {
              params: {
                fields: JSON.stringify(['name', 'user_id', 'email_id']),
              },
            });
            const empDetail = empDetailRes?.data?.data;
            if (empDetail) {
              const empUserId = String(empDetail.user_id || '').trim().toLowerCase();
              const empEmailId = String(empDetail.email_id || '').trim().toLowerCase();
              const searchEmail = String(userEmail || '').trim().toLowerCase();
              
              if (empUserId === searchEmail || empEmailId === searchEmail) {
                employees.push(empDetail);
                if (logInfo) {
                  logInfo('Frappe', `Found matching employee ${empDetail.name} via email_id check`);
                }
                break; // Found a match, stop searching
              }
            }
          } catch (detailErr) {
            // Skip this employee if we can't fetch details
            if (logInfo) {
              logInfo('Frappe', `Could not fetch details for employee ${emp.name}: ${detailErr.message}`);
            }
          }
        }
      }
      
      if (logInfo && employees.length > 0) {
        logInfo('Frappe', `Filtered ${allEmployees.length} employees to ${employees.length} matching user ${userEmail}`);
      }
      
      // If no match on user_id, try fetching employees with email_id query parameter
      // CRITICAL: email_id query parameter returns ALL employees, so we MUST filter
      if (employees.length === 0) {
        try {
          const emailIdRes = await frappe.get('/api/resource/Employee', {
            params: {
              email_id: userEmail, // Query parameter
              fields: JSON.stringify(['name', 'user_id', 'employee_name', 'email_id']),
              limit_page_length: 100,
            },
          });
          const emailIdEmployees = emailIdRes?.data?.data || [];
          
          // CRITICAL: Filter to only employees whose user_id or email_id matches
          const filteredEmployees = emailIdEmployees.filter(emp => {
            const empUserId = String(emp.user_id || '').trim().toLowerCase();
            const empEmailId = String(emp.email_id || '').trim().toLowerCase();
            const searchEmail = String(userEmail || '').trim().toLowerCase();
            
            return empUserId === searchEmail || empEmailId === searchEmail;
          });
          
          if (filteredEmployees.length > 0) {
            employees = filteredEmployees;
            if (logInfo) {
              logInfo('Frappe', `email_id query returned ${emailIdEmployees.length} employee(s), filtered to ${employees.length} matching user ${userEmail}`);
            }
          } else if (emailIdEmployees.length > 0 && logInfo) {
            logInfo('Frappe', `email_id query returned ${emailIdEmployees.length} employee(s) but none matched user ${userEmail} after filtering`);
          }
        } catch (emailIdErr) {
          if (logInfo) {
            logInfo('Frappe', `email_id query parameter failed in case-insensitive search: ${emailIdErr.message}`);
          }
        }
      }
      
      if (logInfo) {
        if (employees.length > 0) {
          logInfo('Frappe', `Found ${employees.length} employee(s) via case-insensitive match`);
          employees.forEach((emp, idx) => {
            logInfo('Frappe', `  Employee ${idx + 1}: name=${emp.name}, user_id=${emp.user_id || 'EMPTY'}, employee_name=${emp.employee_name || 'N/A'}`);
          });
        } else {
          logInfo('Frappe', `No case-insensitive match found. Checking all ${allEmployees.length} employees...`);
          // Log ALL employees to help debug
          allEmployees.forEach((emp, idx) => {
            const matches = (emp.user_id || '').toLowerCase().trim() === userEmail.toLowerCase().trim();
            logInfo('Frappe', `  Employee ${idx + 1}/${allEmployees.length}: name=${emp.name}, user_id=${emp.user_id || 'EMPTY'}, employee_name=${emp.employee_name || 'N/A'} ${matches ? '<<< MATCH!' : ''}`);
          });
        }
      }
    }
    
    // Method 3: Try get_list method endpoint first (more reliable than get_value)
    if (employees.length === 0) {
      if (logInfo) {
        logInfo('Frappe', `No match found via resource API, trying get_list method endpoint`);
      }
      
      try {
        // Try user_id first
        let methodListRes = await frappe.get('/api/method/frappe.client.get_list', {
          params: {
            doctype: 'Employee',
            filters: JSON.stringify({ user_id: userEmail }),
            fields: JSON.stringify(['name', 'user_id', 'employee_name']),
            limit_page_length: 1,
          },
        });
        
        // If no match, try email_id as query parameter (method endpoint might support it differently)
        if (!methodListRes?.data?.message || !Array.isArray(methodListRes.data.message) || methodListRes.data.message.length === 0) {
          if (logInfo) {
            logInfo('Frappe', `get_list with user_id returned no results, trying email_id via resource API`);
          }
          try {
            // Try resource API with email_id as query parameter
            // CRITICAL: email_id query parameter returns ALL employees, so we MUST filter
            const emailIdRes = await frappe.get('/api/resource/Employee', {
              params: {
                email_id: userEmail, // Query parameter
                fields: JSON.stringify(['name', 'user_id', 'employee_name', 'email_id']),
                limit_page_length: 100,
              },
            });
            const emailIdEmployees = emailIdRes?.data?.data || [];
            
            // CRITICAL: Filter to only employees whose user_id or email_id matches
            const filteredEmployees = emailIdEmployees.filter(emp => {
              const empUserId = String(emp.user_id || '').trim().toLowerCase();
              const empEmailId = String(emp.email_id || '').trim().toLowerCase();
              const searchEmail = String(userEmail || '').trim().toLowerCase();
              
              return empUserId === searchEmail || empEmailId === searchEmail;
            });
            
            if (filteredEmployees.length > 0) {
              // Convert to same format as get_list
              methodListRes = { data: { message: filteredEmployees } };
              if (logInfo) {
                logInfo('Frappe', `email_id query returned ${emailIdEmployees.length} employee(s), filtered to ${filteredEmployees.length} matching user ${userEmail} in get_list fallback`);
              }
            } else if (emailIdEmployees.length > 0 && logInfo) {
              logInfo('Frappe', `email_id query returned ${emailIdEmployees.length} employee(s) but none matched user ${userEmail} after filtering in get_list fallback`);
            }
          } catch (emailIdErr) {
            if (logInfo) {
              logInfo('Frappe', `email_id query parameter failed in get_list fallback: ${emailIdErr.message}`);
            }
          }
        }
        
        if (logInfo) {
          logInfo('Frappe', `get_list response: ${JSON.stringify(methodListRes?.data?.message || 'no message')}`);
        }
        
        if (methodListRes?.data?.message) {
          if (Array.isArray(methodListRes.data.message)) {
            if (methodListRes.data.message.length > 0) {
              // CRITICAL: Verify the employee actually belongs to the user before returning
              const emp = methodListRes.data.message[0];
              if (logInfo) {
                logInfo('Frappe', `get_list returned employee: ${JSON.stringify(emp)}`);
              }
              
              // Verify employee belongs to the user
              const empUserId = String(emp.user_id || '').trim().toLowerCase();
              const empEmailId = String(emp.email_id || '').trim().toLowerCase();
              const searchEmail = String(userEmail || '').trim().toLowerCase();
              
              const matches = empUserId === searchEmail || empEmailId === searchEmail;
              
              if (!matches) {
                if (logError) {
                  logError('Frappe', `get_list returned employee ${emp.name} with user_id="${empUserId}", email_id="${empEmailId}" but searching for "${searchEmail}" - REJECTING`);
                }
                // Don't return this employee - it doesn't match
              } else if (emp && emp.name && typeof emp.name === 'string') {
                const employeeId = String(emp.name).trim();
                if (employeeId) {
                  if (logInfo) {
                    logInfo('Frappe', `✓ Found employee ${employeeId} via get_list method for user ${userEmail} (verified match)`);
                  }
                  return employeeId;
                }
              }
            } else {
              if (logInfo) {
                logInfo('Frappe', `get_list returned empty array for user ${userEmail}`);
              }
            }
          } else {
            if (logInfo) {
              logInfo('Frappe', `get_list response is not an array: ${typeof methodListRes.data.message}`);
            }
          }
        } else {
          if (logInfo) {
            logInfo('Frappe', `get_list response has no message field`);
          }
        }
      } catch (methodListErr) {
        if (logInfo) {
          logInfo('Frappe', `get_list method endpoint failed: ${methodListErr.message}`);
          if (methodListErr.response) {
            logInfo('Frappe', `get_list error response: ${JSON.stringify(methodListErr.response.data)}`);
          }
        }
      }
      
      // Fallback: Try get_value method endpoint
      try {
        const methodRes = await frappe.get('/api/method/frappe.client.get_value', {
          params: {
            doctype: 'Employee',
            filters: JSON.stringify({ user_id: userEmail }),
            fieldname: 'name',
          },
        });
        
        if (methodRes?.data?.message) {
          let employeeId = methodRes.data.message;
          
          if (logInfo) {
            logInfo('Frappe', `get_value response type: ${typeof employeeId}, value: ${JSON.stringify(employeeId)}`);
          }
          
          // Handle different response formats:
          // - If it's a string, use it directly
          // - If it's an object, try to extract the 'name' field
          if (typeof employeeId === 'string') {
            employeeId = employeeId.trim();
            if (employeeId) {
              if (logInfo) {
                logInfo('Frappe', `✓ Found employee ${employeeId} via get_value method for user ${userEmail}`);
              }
              return employeeId;
            }
          } else if (typeof employeeId === 'object' && employeeId !== null) {
            // Try to extract name from object
            const extractedName = employeeId.name || employeeId.value;
            if (extractedName && typeof extractedName === 'string') {
              const employeeIdStr = String(extractedName).trim();
              if (employeeIdStr) {
                if (logInfo) {
                  logInfo('Frappe', `✓ Found employee ${employeeIdStr} via get_value method (extracted from object) for user ${userEmail}`);
                }
                return employeeIdStr;
              }
            } else {
              if (logInfo) {
                logInfo('Frappe', `get_value returned object but couldn't extract valid name field`);
              }
            }
          }
        }
      } catch (methodErr) {
        if (logInfo) {
          logInfo('Frappe', `get_value method endpoint failed: ${methodErr.message}`);
        }
      }
      
      // Method 3b: Try querying User doctype to see if there's an employee field
      try {
        if (logInfo) {
          logInfo('Frappe', `Trying to find employee via User doctype`);
        }
        const userRes = await frappe.get('/api/resource/User', {
          params: {
            fields: JSON.stringify(['name', 'email', 'full_name']),
            filters: JSON.stringify([
              ['email', '=', userEmail],
            ]),
            limit_page_length: 1,
          },
        });
        
        const users = userRes?.data?.data || [];
        if (users.length > 0 && logInfo) {
          logInfo('Frappe', `Found user record: name=${users[0].name}, email=${users[0].email || 'EMPTY'}, full_name=${users[0].full_name || 'N/A'}`);
          // Note: User doctype typically doesn't have employee field, but checking for completeness
        }
      } catch (userErr) {
        if (logInfo) {
          logInfo('Frappe', `Could not query User doctype: ${userErr.message}`);
        }
      }
    }
    
    // Method 4: Try 'like' operator as final fallback
    if (employees.length === 0) {
      if (logInfo) {
        logInfo('Frappe', `No match found, trying 'like' operator`);
      }
      
      // Try 'like' on user_id
      employeeRes = await frappe.get('/api/resource/Employee', {
        params: {
          fields: JSON.stringify(['name', 'user_id', 'employee_name']),
          filters: JSON.stringify([
            ['user_id', 'like', `%${userEmail}%`],
          ]),
          limit_page_length: 100,
        },
      });
      
      employees = employeeRes?.data?.data || [];
      
      // Also try email_id as query parameter (can't use in filters)
      if (employees.length === 0) {
        try {
          employeeRes = await frappe.get('/api/resource/Employee', {
            params: {
              email_id: userEmail, // Query parameter
              fields: JSON.stringify(['name', 'user_id', 'employee_name']),
              limit_page_length: 100,
            },
          });
          employees = employeeRes?.data?.data || [];
        } catch (emailIdErr) {
          if (logInfo) {
            logInfo('Frappe', `email_id query parameter failed in 'like' search: ${emailIdErr.message}`);
          }
        }
      }
      
      if (logInfo) {
        logInfo('Frappe', `'Like' query returned ${employees.length} employee(s)`);
      }
      
      // Filter to ensure it's actually the right user (in case of partial matches)
      employees = employees.filter(emp => {
        const empUserId = (emp.user_id || '').toLowerCase().trim();
        const searchEmail = userEmail.toLowerCase().trim();
        return empUserId === searchEmail;
      });
      
      if (logInfo && employees.length > 0) {
        logInfo('Frappe', `Found ${employees.length} employee(s) after filtering 'like' results`);
      }
    }

    if (employees.length > 0) {
      const employeeId = employees[0].name; // Employee name/ID
      if (logInfo) {
        logInfo('Frappe', `✓ Found employee ${employeeId} (${employees[0].employee_name || employees[0].name}) for user ${userEmail}`);
        logInfo('Frappe', `  Employee user_id: ${employees[0].user_id || 'EMPTY'}`);
      }
      return employeeId;
    }
    
    if (logError) {
      logError('Frappe', `✗ No employee found for user ${userEmail} after trying all methods`);
      // Log ALL employees for debugging (we already fetched them in Method 2)
      try {
        const allEmployeesRes = await frappe.get('/api/resource/Employee', {
          params: {
            fields: JSON.stringify(['name', 'user_id', 'employee_name']),
            limit_page_length: 1000,
          },
        });
        const allEmployees = allEmployeesRes?.data?.data || [];
        if (allEmployees.length > 0) {
          logError('Frappe', `All ${allEmployees.length} employees in system:`);
          allEmployees.forEach((emp, idx) => {
            const userMatch = (emp.user_id || '').toLowerCase().trim() === userEmail.toLowerCase().trim();
            logError('Frappe', `  ${idx + 1}. name=${emp.name}, user_id=${emp.user_id || 'EMPTY'}, employee_name=${emp.employee_name || 'N/A'} ${userMatch ? '<<< SHOULD MATCH!' : ''}`);
          });
        }
      } catch (sampleErr) {
        // Ignore sample fetch errors
        if (logError) {
          logError('Frappe', `Could not fetch all employees for debugging: ${sampleErr.message}`);
        }
      }
    }
    
    return null;
  } catch (err) {
    if (logError) {
      logError('Frappe', `Error fetching employee for user ${userEmail}: ${err.message}`);
      if (err.response) {
        logError('Frappe', `Response status: ${err.response.status}`);
        logError('Frappe', `Response data: ${JSON.stringify(err.response.data, null, 2)}`);
      }
    }
    return null;
  }
}

/**
 * Get tasks assigned to the current user in Frappe
 * Returns an array of tasks
 * IMPORTANT:
 * - Returns [] ONLY when there are genuinely no tasks
 * - THROWS on real errors so UI can show correct message
 */
async function getMyTasks() {
  const userEmail = await getCurrentUser();

  if (!userEmail) {
    const err = new Error('User not logged in');
    err.code = 'NOT_AUTHENTICATED';
    throw err;
  }

  if (logInfo) {
    logInfo('Frappe', `Fetching tasks for user: ${userEmail}`);
  }

  try {
    const frappe = createFrappeClient();

    const res = await frappe.get('/api/resource/Task', {
      params: {
        fields: JSON.stringify(['name', 'subject', 'project', 'status']),
        filters: JSON.stringify([
          ['_assign', 'like', `%${userEmail}%`],
        ]),
        limit_page_length: 1000,
      },
    });

    const tasks = res?.data?.data;

    // Safety: Frappe should always return an array
    if (!Array.isArray(tasks)) {
      const err = new Error('Invalid response from Frappe while fetching tasks');
      err.code = 'INVALID_FRAPPE_RESPONSE';
      throw err;
    }

    if (logInfo) {
      logInfo('Frappe', `Found ${tasks.length} task(s) for user ${userEmail}`);
    }

    return tasks; // ✅ [] is valid when user has no tasks
  } catch (err) {
    const errorMessage =
      err.response?.data?.message ||
      err.message ||
      'Failed to fetch tasks from Frappe';

    if (logError) {
      logError('Frappe', `Error fetching tasks: ${errorMessage}`, {
        status: err.response?.status,
        data: err.response?.data,
      });
    }

    // 🔥 IMPORTANT: let UI decide how to show the error
    throw err;
  }
}


/**
 * Verify that a timesheet belongs to the current user by checking employee's email_id/user_id
 * Returns true if the timesheet belongs to the user, false otherwise
 */
async function verifyTimesheetBelongsToUser(timesheet, userEmail) {
  if (!timesheet || !timesheet.employee) {
    return false;
  }
  
  const frappe = createFrappeClient();
  
  try {
    // Fetch the employee record from the timesheet
    const employeeRes = await frappe.get(`/api/resource/Employee/${timesheet.employee}`, {
      params: {
        fields: JSON.stringify(['name', 'user_id', 'email_id']),
      },
    });
    
    const employee = employeeRes?.data?.data;
    if (!employee) {
      if (logError) {
        logError('Frappe', `Could not fetch employee ${timesheet.employee} for timesheet ${timesheet.name}`);
      }
      return false;
    }
    
    // Compare user_id or email_id with the current user's email
    const employeeUserId = String(employee.user_id || '').trim().toLowerCase();
    const employeeEmailId = String(employee.email_id || '').trim().toLowerCase();
    const currentUserEmail = String(userEmail || '').trim().toLowerCase();
    
    const matches = employeeUserId === currentUserEmail || employeeEmailId === currentUserEmail;
    
    if (logInfo) {
      logInfo('Frappe', `Verifying timesheet ${timesheet.name} employee ${timesheet.employee}: user_id="${employeeUserId}", email_id="${employeeEmailId}", current user="${currentUserEmail}", matches=${matches}`);
    }
    
    if (!matches && logError) {
      logError('Frappe', `✗ Timesheet ${timesheet.name} does NOT belong to user ${userEmail}. Employee ${timesheet.employee} has user_id="${employeeUserId}", email_id="${employeeEmailId}"`);
    }
    
    return matches;
  } catch (err) {
    if (logError) {
      logError('Frappe', `Error verifying timesheet employee: ${err.message}`);
    }
    return false;
  }
}

/**
 * Find existing timesheet for a project
 * Returns the timesheet if found, null if not found
 */
async function getTimesheetForProject(project) {
  const userEmail = await getCurrentUser();
  if (!userEmail) {
    throw new Error('User not logged in');
  }

  if (!project) {
    throw new Error('Project is required');
  }

  const frappe = createFrappeClient();

  try {
    // Note: Employee lookup is now handled by Frappe method endpoints
    // This function is kept for backward compatibility but may not be needed
    // if all timesheet operations use method endpoints
    
    // Normalize employee ID for consistent use throughout this function
    let normalizedEmployeeId = null;
    if (employeeId) {
      normalizedEmployeeId = String(employeeId).trim();
      if (!normalizedEmployeeId || normalizedEmployeeId === 'null' || normalizedEmployeeId === 'undefined') {
        normalizedEmployeeId = null;
      }
    }
    
    if (!normalizedEmployeeId) {
      if (logInfo) {
        logInfo('Frappe', `No employee record found for user ${userEmail}, will search timesheets without employee filter`);
      }
    } else {
      if (logInfo) {
        logInfo('Frappe', `Looking for timesheets for employee: "${normalizedEmployeeId}" (original type: ${typeof employeeId})`);
      }
    }

    // Query for timesheets
    // IMPORTANT: We'll filter by employee in code rather than relying on Frappe filters
    // This ensures we have full control and can verify each timesheet
    // Note: time_logs might not be included in list response, so we'll fetch full details for each
    // Limit to last 200 timesheets to avoid performance issues (increased to catch more)
    const res = await frappe.get('/api/resource/Timesheet', {
      params: {
        fields: JSON.stringify(['name', 'employee', 'company', 'status', 'modified']),
        // Don't filter by employee in query - we'll do it in code to ensure accuracy
        order_by: 'modified desc',
        limit_page_length: 200, // Increased to catch more timesheets
      },
    });

    let allTimesheets = res?.data?.data || [];
    
    // CRITICAL: Filter by employee in code (don't trust Frappe's filter)
    if (normalizedEmployeeId && allTimesheets.length > 0) {
      const beforeCount = allTimesheets.length;
      allTimesheets = allTimesheets.filter(ts => {
        const tsEmployee = String(ts.employee || '').trim();
        const matches = tsEmployee === normalizedEmployeeId;
        if (!matches && logInfo) {
          logInfo('Frappe', `Filtering out timesheet ${ts.name} - employee "${tsEmployee}" doesn't match "${normalizedEmployeeId}"`);
        }
        return matches;
      });
      if (logInfo) {
        logInfo('Frappe', `Filtered ${beforeCount} timesheets down to ${allTimesheets.length} matching employee "${normalizedEmployeeId}"`);
      }
    }

    if (logInfo) {
      logInfo('Frappe', `Query returned ${allTimesheets.length} timesheet(s) for project ${project}${normalizedEmployeeId ? ` and employee ${normalizedEmployeeId}` : ''}`);
      if (allTimesheets.length > 0) {
        logInfo('Frappe', `Timesheets found (first 5): ${JSON.stringify(allTimesheets.slice(0, 5).map(ts => ({ name: ts.name, employee: String(ts.employee || 'EMPTY'), employeeType: typeof ts.employee })))}`);
        // Check if any timesheets have mismatched employees
        if (normalizedEmployeeId) {
          allTimesheets.forEach((ts, idx) => {
            const tsEmployee = String(ts.employee || '').trim();
            if (tsEmployee !== normalizedEmployeeId) {
              logError('Frappe', `⚠️ WARNING: Timesheet ${ts.name} (index ${idx}) has employee "${tsEmployee}" but we filtered for "${normalizedEmployeeId}" - Frappe filter may not be working!`);
            }
          });
        }
      }
    }

    // CRITICAL: If we don't have an employee ID, we cannot safely identify user-specific timesheets
    // In this case, we should NOT return any existing timesheet to avoid cross-user contamination
    if (!normalizedEmployeeId) {
      if (logInfo) {
        logInfo('Frappe', `No employee found for user ${userEmail}. Cannot safely identify user-specific timesheet. Will create new one.`);
      }
      return null;
    }
    
    if (logInfo) {
      logInfo('Frappe', `Using normalized employee ID: "${normalizedEmployeeId}" for timesheet lookup and verification`);
    }

    // First, try to check time_logs if they're included in the list response
    for (const ts of allTimesheets) {
      // CRITICAL: Only consider timesheets that match the current user's employee
      // Normalize employee IDs for comparison
      const tsEmployee = String(ts.employee || '').trim();
      
      if (logInfo) {
        logInfo('Frappe', `Checking timesheet ${ts.name}: employee="${tsEmployee}" (expected: "${normalizedEmployeeId}")`);
      }
      
      if (tsEmployee !== normalizedEmployeeId) {
        if (logError) {
          logError('Frappe', `REJECTING timesheet ${ts.name} - employee mismatch! Timesheet has "${tsEmployee}" but we need "${normalizedEmployeeId}"`);
        }
        continue;
      }

      if (ts.time_logs && Array.isArray(ts.time_logs) && ts.time_logs.length > 0) {
        const hasProject = ts.time_logs.some(tl => {
          if (!tl) return false;
          const tlProject = tl.project;
          return tlProject === project;
        });

        if (hasProject) {
          if (logInfo) {
            logInfo('Frappe', `Found timesheet ${ts.name} with project ${project} and matching employee ${normalizedEmployeeId} (from list)`);
          }
          // Fetch full details to return complete timesheet
          try {
            const detailRes = await frappe.get(`/api/resource/Timesheet/${ts.name}`);
            const fullTimesheet = detailRes?.data?.data || ts;
            // Double-check employee matches (in case list response was incomplete)
            const fullTsEmployee = String(fullTimesheet.employee || '').trim();
            
            if (logInfo) {
              logInfo('Frappe', `Fetched full timesheet ${fullTimesheet.name}: employee="${fullTsEmployee}" (expected: "${normalizedEmployeeId}")`);
            }
            
            if (fullTsEmployee === normalizedEmployeeId) {
              // CRITICAL: Verify by email_id/user_id as well (more reliable than just employee ID)
              const belongsToUser = await verifyTimesheetBelongsToUser(fullTimesheet, userEmail);
              if (belongsToUser) {
                if (logInfo) {
                  logInfo('Frappe', `✓ CONFIRMED: Timesheet ${fullTimesheet.name} belongs to employee ${fullTsEmployee} and user ${userEmail} - returning it`);
                }
                return fullTimesheet;
              } else {
                if (logError) {
                  logError('Frappe', `✗ REJECTING: Timesheet ${ts.name} employee ID matches but email_id/user_id verification failed - SECURITY REJECT!`);
                }
              }
            } else {
              if (logError) {
                logError('Frappe', `✗ REJECTING: Timesheet ${ts.name} employee changed after fetch! Timesheet has "${fullTsEmployee}" but we need "${normalizedEmployeeId}" - this is a security issue!`);
              }
            }
          } catch (err) {
            if (logError) {
              logError('Frappe', `Error fetching timesheet details: ${err.message}`);
            }
            // Don't return list version - we need full details to verify employee
          }
        }
      }
    }

    // If time_logs not in list response, fetch full details for each timesheet
    // But only check timesheets that already match the employee (from list)
    for (const ts of allTimesheets) {
      // CRITICAL: Only check timesheets that match the current user's employee
      // Normalize employee IDs for comparison
      const tsEmployee = String(ts.employee || '').trim();
      
      if (logInfo) {
        logInfo('Frappe', `Fetching details for timesheet ${ts.name}: employee="${tsEmployee}" (expected: "${normalizedEmployeeId}")`);
      }
      
      if (tsEmployee !== normalizedEmployeeId) {
        if (logError) {
          logError('Frappe', `✗ REJECTING timesheet ${ts.name} in detail fetch - employee mismatch! Timesheet has "${tsEmployee}" but we need "${normalizedEmployeeId}"`);
        }
        continue; // Already filtered in query, but double-check
      }

      try {
        // Fetch full timesheet details
        const detailRes = await frappe.get(`/api/resource/Timesheet/${ts.name}`);
        const fullTimesheet = detailRes?.data?.data;

        // CRITICAL: Verify employee matches in full details
        const fullTsEmployee = String(fullTimesheet.employee || '').trim();
        
        if (logInfo) {
          logInfo('Frappe', `Verifying timesheet ${fullTimesheet.name} employee: "${fullTsEmployee}" (expected: "${normalizedEmployeeId}")`);
        }
        
        if (fullTsEmployee !== normalizedEmployeeId) {
          if (logError) {
            logError('Frappe', `✗ REJECTING timesheet ${fullTimesheet.name} - employee mismatch in details! Timesheet has "${fullTsEmployee}" but we need "${normalizedEmployeeId}" - SECURITY ISSUE!`);
          }
          continue;
        }

        if (fullTimesheet && fullTimesheet.time_logs) {
          const timeLogs = Array.isArray(fullTimesheet.time_logs) ? fullTimesheet.time_logs : [];
          
          if (logInfo && timeLogs.length > 0) {
            logInfo('Frappe', `Checking timesheet ${fullTimesheet.name} (employee: ${fullTimesheet.employee}) with ${timeLogs.length} time log(s)`);
          }
          
          // Check if any time_log has this project
          const hasProject = timeLogs.some(tl => {
            if (!tl) return false;
            
            // Handle different time_log formats
            const tlProject = tl.project;
            
            // Compare project IDs
            if (tlProject === project) {
              return true;
            }
            
            // Also check if project is a link field that might be stored as object
            if (typeof tlProject === 'object' && tlProject && tlProject.name === project) {
              return true;
            }
            
            return false;
          });

          if (hasProject) {
            // FINAL VERIFICATION: Make absolutely sure the employee matches before returning
            const finalCheckEmployee = String(fullTimesheet.employee || '').trim();
            if (finalCheckEmployee === normalizedEmployeeId) {
              // CRITICAL: Verify by email_id/user_id as well (more reliable than just employee ID)
              const belongsToUser = await verifyTimesheetBelongsToUser(fullTimesheet, userEmail);
              if (belongsToUser) {
                if (logInfo) {
                  logInfo('Frappe', `✓ FINAL CONFIRMATION: Found existing timesheet ${fullTimesheet.name} for project ${project} and employee ${normalizedEmployeeId} (verified by email_id/user_id) with ${timeLogs.length} time log(s)`);
                }
                return fullTimesheet;
              } else {
                if (logError) {
                  logError('Frappe', `✗ FINAL REJECTION: Timesheet ${fullTimesheet.name} has project ${project} and employee ID matches, but email_id/user_id verification failed - SECURITY REJECT!`);
                }
                // Don't return - continue to next timesheet or create new one
              }
            } else {
              if (logError) {
                logError('Frappe', `✗ FINAL REJECTION: Timesheet ${fullTimesheet.name} has project ${project} but employee "${finalCheckEmployee}" doesn't match "${normalizedEmployeeId}" - SECURITY REJECT!`);
              }
              // Don't return - continue to next timesheet or create new one
            }
          }
        }
      } catch (detailErr) {
        // Skip this timesheet if we can't fetch details
        if (logError) {
          logError('Frappe', `Error fetching timesheet ${ts.name} details: ${detailErr.message}`);
        }
        continue;
      }
    }

    if (logInfo) {
      logInfo('Frappe', `No existing timesheet found for project ${project} and employee ${normalizedEmployeeId} after checking all ${allTimesheets.length} timesheet(s)`);
    }

    return null;
  } catch (err) {
    const errorMessage =
      err.response?.data?.message ||
      err.message ||
      'Failed to fetch timesheet from Frappe';

    if (logError) {
      logError('Frappe', `Error fetching timesheet: ${errorMessage}`, {
        status: err.response?.status,
        data: err.response?.data,
      });
    }

    // If it's a 404 or no results, return null (timesheet doesn't exist)
    if (err.response?.status === 404) {
      return null;
    }

    throw err;
  }
}

/**
 * Update a timesheet row with hours
 * Uses Frappe method endpoint: POST /api/method/update_timesheet_row
 */
async function addTimeLogToTimesheet(timesheetId, { project, task, hours = 0, row_id = null }) {
  const userEmail = await getCurrentUser();
  if (!userEmail) {
    throw new Error('User not logged in');
  }

  if (!timesheetId) {
    throw new Error('Timesheet ID is required');
  }

  if (!project) {
    throw new Error('Project is required');
  }

  const frappe = createFrappeClient();

  try {
    // Prepare payload for the method endpoint
    const payload = {
      timesheet_id: timesheetId,
      project,
      hours: hours,
    };

    // Include row_id if provided (for updating specific row)
    if (row_id) {
      payload.row_id = row_id;
    }

    // Only include task if provided
    if (task) {
      payload.task = task;
    }

    if (logInfo) {
      logInfo('Frappe', `Calling update_timesheet_row method for timesheet ${timesheetId}, project ${project}, hours=${hours}, row_id=${row_id || 'not provided'}`);
    }

    // Call Frappe method endpoint
    const res = await frappe.post('/api/method/update_timesheet_row', payload);

    if (!res?.data?.message) {
      throw new Error('Invalid response from update_timesheet_row method');
    }

    const timesheet = res.data.message;

    if (!timesheet?.name) {
      throw new Error('Invalid timesheet response from update_timesheet_row method');
    }

    if (logInfo) {
      logInfo('Frappe', `Updated timesheet row in timesheet ${timesheetId} via update_timesheet_row method`);
    }

    return timesheet;
  } catch (err) {
    const errorMessage =
      err.response?.data?.message ||
      err.response?.data?.exc ||
      err.message ||
      'Failed to update timesheet row';

    if (logError) {
      logError('Frappe', `Error in update_timesheet_row: ${errorMessage}`, {
        status: err.response?.status,
        data: err.response?.data,
      });
    }

    throw err;
  }
}

/**
 * Get or create timesheet for a project
 * Uses Frappe method endpoint: POST /api/method/get_or_create_timesheet
 * Returns { timesheet, row } where row is the timesheet row that was created or found
 */
async function getOrCreateTimesheet({ project, task }) {
  const userEmail = await getCurrentUser();
  if (!userEmail) {
    throw new Error('User not logged in');
  }

  if (!project) {
    throw new Error('Project is required');
  }

  const frappe = createFrappeClient();

  try {
    const payload = { project };
    if (task) payload.task = task;

    if (logInfo) {
      logInfo(
        'Frappe',
        `Calling get_or_create_timesheet for project ${project}, user ${userEmail}`
      );
    }

    const res = await frappe.post(
      '/api/method/get_or_create_timesheet',
      payload
    );

    const message = res?.data?.message;

    if (!message) {
      throw new Error('Invalid response from get_or_create_timesheet method');
    }

    const { timesheet, row } = message;

    // ✅ Validate STRINGS, not objects
    if (typeof timesheet !== 'string' || !timesheet) {
      throw new Error('Invalid timesheet id from get_or_create_timesheet method');
    }

    if (typeof row !== 'string' || !row) {
      throw new Error('Invalid timesheet row id from get_or_create_timesheet method');
    }

    if (logInfo) {
      logInfo(
        'Frappe',
        `get_or_create_timesheet OK → timesheet=${timesheet}, row=${row}`
      );
    }

    // ✅ Return IDs only
    return {
      timesheet,
      row,
    };
  } catch (err) {
    const errorMessage =
      err.response?.data?.message ||
      err.response?.data?.exc ||
      err.message ||
      'Failed to get or create timesheet';

    if (logError) {
      logError('Frappe', `Error in get_or_create_timesheet: ${errorMessage}`, {
        status: err.response?.status,
        data: err.response?.data,
      });
    }

    throw err;
  }
}
/**
 * Start a timesheet session
 * Uses Frappe method endpoint: POST /api/method/start_timesheet_session
 */
async function startTimesheetSession({ timesheet, row }) {
  if (!timesheet || !row) {
    throw new Error('Timesheet and row are required');
  }

  const frappe = createFrappeClient();

  const res = await frappe.post(
    '/api/method/start_timesheet_session',
    { timesheet, row }
  );

  if (!res?.data?.message) {
    throw new Error('Invalid response from start_timesheet_session');
  }

  return res.data.message;
}

/**
 * Update a timesheet row with hours
 * Uses Frappe method endpoint: POST /api/method/update_timesheet_row
 */
async function updateTimesheetRow({ timesheetId, timesheetRowId, hours }) {
  const userEmail = await getCurrentUser();
  if (!userEmail) {
    throw new Error('User not logged in');
  }

  if (!timesheetId || typeof timesheetId !== 'string') {
    throw new Error('Timesheet ID is required');
  }

  if (!timesheetRowId || typeof timesheetRowId !== 'string') {
    throw new Error('Timesheet row ID is required');
  }

  if (hours === undefined || hours === null) {
    throw new Error('Hours is required');
  }

  const frappe = createFrappeClient();

  try {
    const payload = {
      timesheet: timesheetId,
      row: timesheetRowId,
      hours: hours,
    };

    if (logInfo) {
      logInfo('Frappe', `Calling update_timesheet_row method for timesheet ${payload.timesheet}, row ${payload.row}, hours=${hours}`);
    }

    const res = await frappe.post('/api/method/update_timesheet_row', payload);

    if (!res?.data?.message) {
      throw new Error('Invalid response from update_timesheet_row method');
    }

    const result = res.data.message;

    if (logInfo) {
      logInfo('Frappe', `update_timesheet_row completed successfully`);
    }

    return result;
  } catch (err) {
    const errorMessage =
      err.response?.data?.message ||
      err.response?.data?.exc ||
      err.message ||
      'Failed to update timesheet row';

    if (logError) {
      logError('Frappe', `Error in update_timesheet_row: ${errorMessage}`, {
        status: err.response?.status,
        data: err.response?.data,
      });
    }

    throw err;
  }
}

async function createTimesheet({ project, task }) {
  const userEmail = await getCurrentUser();
  if (!userEmail) {
    throw new Error('User not logged in');
  }

  if (!project) {
    throw new Error('Project is required');
  }

  const frappe = createFrappeClient();

  // 1️⃣ Get employee for the current user (timesheets are associated with employees)
  let employeeId = await getEmployeeForUser(userEmail);
  
  if (!employeeId) {
    // Employee is REQUIRED for proper user separation
    // Don't create timesheet without employee - it will cause cross-user contamination
    const errorMsg = `No employee record found for user ${userEmail}. Employee record is required to create timesheets. Please ensure the user has an Employee record linked to their user account in Frappe (check that Employee.user_id matches the user email exactly).`;
    if (logError) {
      logError('Frappe', errorMsg);
      // Try to get sample employees to help debug
      try {
        const frappe = createFrappeClient();
        const debugRes = await frappe.get('/api/resource/Employee', {
          params: {
            fields: JSON.stringify(['name', 'user_id', 'employee_name']),
            limit_page_length: 10,
          },
        });
        const sampleEmployees = debugRes?.data?.data || [];
        if (sampleEmployees.length > 0) {
          logError('Frappe', `Sample employees found (first 10): ${JSON.stringify(sampleEmployees.map(e => ({ name: e.name, user_id: e.user_id, employee_name: e.employee_name })), null, 2)}`);
        }
      } catch (debugErr) {
        // Ignore debug errors
      }
    }
    throw new Error(errorMsg);
  }
  
  // Ensure employeeId is a string (not an object)
  if (typeof employeeId !== 'string') {
    if (typeof employeeId === 'object' && employeeId !== null) {
      // Try to extract the name field if it's an object
      employeeId = employeeId.name || String(employeeId);
    } else {
      employeeId = String(employeeId || '');
    }
  }
  employeeId = employeeId.trim();
  
  if (!employeeId || employeeId === 'null' || employeeId === 'undefined' || employeeId === '[object Object]') {
    throw new Error(`Invalid employee ID: ${JSON.stringify(employeeId)}. Employee record is required to create timesheets.`);
  }

  // CRITICAL: Verify the employee record belongs to the current user before using it
  try {
    const employeeRes = await frappe.get(`/api/resource/Employee/${employeeId}`, {
      params: {
        fields: JSON.stringify(['name', 'user_id', 'email_id', 'employee_name']),
      },
    });
    
    const employee = employeeRes?.data?.data;
    if (employee) {
      const employeeUserId = String(employee.user_id || '').trim().toLowerCase();
      const employeeEmailId = String(employee.email_id || '').trim().toLowerCase();
      const currentUserEmail = String(userEmail || '').trim().toLowerCase();
      
      if (logInfo) {
        logInfo('Frappe', `Verifying employee ${employeeId} before timesheet creation:`);
        logInfo('Frappe', `  Employee name: ${employee.employee_name || employee.name}`);
        logInfo('Frappe', `  Employee user_id: "${employeeUserId}"`);
        logInfo('Frappe', `  Employee email_id: "${employeeEmailId}"`);
        logInfo('Frappe', `  Current user email: "${currentUserEmail}"`);
      }
      
      const matches = employeeUserId === currentUserEmail || employeeEmailId === currentUserEmail;
      
      if (!matches) {
        const errorMsg = `CRITICAL: Employee ${employeeId} (${employee.employee_name || employee.name}) does NOT belong to user ${userEmail}. Employee has user_id="${employeeUserId}", email_id="${employeeEmailId}". Cannot create timesheet with wrong employee.`;
        if (logError) {
          logError('Frappe', errorMsg);
        }
        throw new Error(errorMsg);
      }
      
      if (logInfo) {
        logInfo('Frappe', `✓ Verified employee ${employeeId} (${employee.employee_name || employee.name}) belongs to user ${userEmail}`);
      }
    } else {
      if (logError) {
        logError('Frappe', `Could not fetch employee ${employeeId} to verify it belongs to user ${userEmail}`);
      }
    }
  } catch (verifyErr) {
    if (verifyErr.message && verifyErr.message.includes('CRITICAL')) {
      throw verifyErr; // Re-throw our critical errors
    }
    if (logError) {
      logError('Frappe', `Error verifying employee before timesheet creation: ${verifyErr.message}`);
    }
    // Continue anyway, but log the warning
  }

  if (logInfo) {
    logInfo('Frappe', `Using employee ${employeeId} for timesheet creation`);
  }

  // 2️⃣ Fetch project to get company
  const projectRes = await frappe.get(`/api/resource/Project/${project}`);
  const projectDoc = projectRes?.data?.data;

  if (!projectDoc?.company) {
    throw new Error(`Company not found for project ${project}`);
  }

  // 3️⃣ Create Timesheet with ZERO hours
  // Task is optional - timesheet can be created without a task
  const timeLog = {
    activity_type: 'Execution',
    project,
    hours: 0,   // ✅ VALID, no datetime issues
  };
  
  // Only include task if provided
  if (task) {
    timeLog.task = task;
  }

  // Employee is now required (we throw error if not found above)
  // Always include it in the payload as a string
  const payload = {
    company: projectDoc.company,
    employee: employeeId, // REQUIRED - validated as string above
    time_logs: [timeLog],
  };

  if (logInfo) {
    logInfo('Frappe', `Creating timesheet with employee ${employeeId} for user ${userEmail}`);
    logInfo('Frappe', `Employee ID being used: "${employeeId}" (type: ${typeof employeeId})`);
  }

  if (logInfo) {
    logInfo('Frappe', `Creating timesheet with payload:`, JSON.stringify(payload, null, 2));
  }

  const res = await frappe.post('/api/resource/Timesheet', payload);

  if (!res?.data?.data?.name) {
    throw new Error('Invalid response while creating timesheet');
  }

  const createdTimesheet = res.data.data;
  
  // CRITICAL: Verify employee was set correctly after creation
  if (logInfo) {
    logInfo('Frappe', `Timesheet created: ${createdTimesheet.name}`);
    logInfo('Frappe', `Created timesheet employee field: "${createdTimesheet.employee || 'NOT SET'}" (expected: "${employeeId}")`);
  }
  
  // If employee doesn't match, fetch full details and check
  if (String(createdTimesheet.employee || '').trim() !== String(employeeId).trim()) {
    if (logError) {
      logError('Frappe', `⚠️ WARNING: Created timesheet ${createdTimesheet.name} has employee "${createdTimesheet.employee}" but we set "${employeeId}" - fetching full details to verify`);
    }
    
    // Fetch full timesheet details to verify
    try {
      const verifyRes = await frappe.get(`/api/resource/Timesheet/${createdTimesheet.name}`);
      const fullTimesheet = verifyRes?.data?.data;
      
      if (logInfo) {
        logInfo('Frappe', `Full timesheet details - employee: "${fullTimesheet.employee || 'NOT SET'}", name: "${fullTimesheet.name}"`);
      }
      
      // Verify by email_id/user_id
      const belongsToUser = await verifyTimesheetBelongsToUser(fullTimesheet, userEmail);
      if (!belongsToUser) {
        const errorMsg = `CRITICAL: Created timesheet ${createdTimesheet.name} does NOT belong to user ${userEmail} (verified by employee email_id/user_id). Employee field shows "${fullTimesheet.employee}" but it should be for user ${userEmail}.`;
        if (logError) {
          logError('Frappe', errorMsg);
        }
        throw new Error(errorMsg);
      }
      
      return fullTimesheet;
    } catch (verifyErr) {
      if (logError) {
        logError('Frappe', `Error verifying created timesheet: ${verifyErr.message}`);
      }
      // Still return the created timesheet, but log the warning
    }
  }
  
  // Verify employee was set correctly
  if (employeeId && createdTimesheet.employee !== employeeId) {
    if (logError) {
      logError('Frappe', `WARNING: Timesheet created but employee mismatch! Expected: ${employeeId}, Got: ${createdTimesheet.employee || 'null'}`);
    }
    // Try to update the employee field
    try {
      if (logInfo) {
        logInfo('Frappe', `Attempting to update employee field on timesheet ${createdTimesheet.name}`);
      }
      const updateRes = await frappe.put(`/api/resource/Timesheet/${createdTimesheet.name}`, {
        employee: employeeId
      });
      if (updateRes?.data?.data) {
        createdTimesheet.employee = updateRes.data.data.employee;
        if (logInfo) {
          logInfo('Frappe', `Successfully updated employee field to ${employeeId}`);
        }
      }
    } catch (updateErr) {
      if (logError) {
        logError('Frappe', `Failed to update employee field: ${updateErr.message}`);
      }
    }
  }

  if (logInfo) {
    logInfo('Frappe', `Created new timesheet ${createdTimesheet.name} for project ${project} (employee: ${createdTimesheet.employee || 'not set'})`);
  }

  return createdTimesheet;
}


/**
 * Get tasks for a specific project assigned to the current user
 * Only returns active tasks
 *
 * IMPORTANT:
 * - Returns [] ONLY when there are genuinely no tasks
 * - THROWS on real errors so UI can show correct message
 */
async function getMyTasksForProject(project) {
  const userEmail = await getCurrentUser();

  if (!userEmail) {
    const err = new Error('User not logged in');
    err.code = 'NOT_AUTHENTICATED';
    throw err;
  }

  if (!project) {
    const err = new Error('Project is required to fetch tasks');
    err.code = 'PROJECT_REQUIRED';
    throw err;
  }

  if (logInfo) {
    logInfo(
      'Frappe',
      `Fetching tasks for project ${project}, user ${userEmail}`
    );
  }

  try {
    const frappe = createFrappeClient();

    const res = await frappe.get('/api/resource/Task', {
      params: {
        fields: JSON.stringify([
          'name',
          'subject',
          'status',
          'project'
        ]),
        filters: JSON.stringify([
          ['project', '=', project],
          ['_assign', 'like', `%${userEmail}%`],
          ['status', 'in', ['Open', 'Working', 'Overdue']],
        ]),
        order_by: 'modified desc',
        limit_page_length: 1000,
      },
    });

    const tasks = res?.data?.data;

    // Safety check – Frappe should always return an array
    if (!Array.isArray(tasks)) {
      const err = new Error(
        'Invalid response from Frappe while fetching project tasks'
      );
      err.code = 'INVALID_FRAPPE_RESPONSE';
      throw err;
    }

    if (logInfo) {
      logInfo(
        'Frappe',
        `Found ${tasks.length} task(s) for project ${project}`
      );
    }

    return tasks; // ✅ [] is valid if no tasks exist
  } catch (err) {
    const errorMessage =
      err.response?.data?.message ||
      err.message ||
      'Failed to fetch project tasks from Frappe';

    if (logError) {
      logError(
        'Frappe',
        `Error fetching tasks for project ${project}: ${errorMessage}`,
        {
          status: err.response?.status,
          data: err.response?.data,
        }
      );
    }

    // 🔥 IMPORTANT: bubble error to UI
    throw err;
  }
}

/**
 * Get projects assigned to the current user in Frappe
 * In ERPNext, Projects are not directly assigned to Users.
 * Instead: Users are assigned to Tasks, and Tasks belong to Projects.
 * So the logic is: User → Tasks → Projects
 * Returns an array of projects with id and name
 */
async function getUserProjects() {
  try {
    const userEmail = await getCurrentUser();
    if (!userEmail) return [];

    if (logInfo) {
      logInfo('Frappe', `Fetching projects for user via tasks: ${userEmail}`);
    }

    const frappe = createFrappeClient();

    // 1️⃣ Get tasks assigned to user
    const taskRes = await frappe.get('/api/resource/Task', {
      params: {
        fields: JSON.stringify(['project', 'name', 'subject']),
        filters: JSON.stringify([
          ['_assign', 'like', `%${userEmail}%`],
          ['project', '!=', ''],
        ]),
        limit_page_length: 1000,
      },
    });

    const tasks = Array.isArray(taskRes?.data?.data)
      ? taskRes.data.data
      : [];

    if (logInfo) {
      logInfo('Frappe', `Found ${tasks.length} task(s) assigned to user`);
      // Log each task and its project for debugging
      tasks.forEach((task, idx) => {
        logInfo('Frappe', `  Task ${idx + 1}: ${task.name || task.subject || 'Unknown'} - Project: ${task.project || 'None'}`);
      });
    }

    // Extract unique project IDs from tasks
    const projectIdsFromTasks = [...new Set(tasks.map(t => t.project).filter(p => p))];

    if (logInfo) {
      logInfo('Frappe', `Found ${projectIdsFromTasks.length} unique project(s) from tasks: ${projectIdsFromTasks.join(', ')}`);
    }

    // Also check for directly assigned projects (via Project User or custom fields)
    const directProjects = await getUserProjectsDirect();
    let projectIdsFromDirect = directProjects.map(p => p.id);

    if (logInfo) {
      if (directProjects.length > 0) {
        logInfo('Frappe', `Found ${directProjects.length} project(s) from direct assignments: ${projectIdsFromDirect.join(', ')}`);
      } else {
        logInfo('Frappe', 'No projects found from direct assignments (Project User)');
      }
    }

    // Also try to find projects where user is assigned directly via _assign field
    // Frappe uses _assign field (similar to tasks) for user assignments
    // This is the PRIMARY way projects are assigned to users in Frappe
    try {
      if (logInfo) {
        logInfo('Frappe', `Checking for projects directly assigned to user via _assign field`);
      }
      
      const projectWithAssignRes = await frappe.get('/api/resource/Project', {
        params: {
          fields: JSON.stringify(['name', 'project_name', '_assign']),
          filters: JSON.stringify([
            ['_assign', 'like', `%${userEmail}%`],
          ]),
          limit_page_length: 1000,
        },
      });

      const projectsWithAssign = projectWithAssignRes?.data?.data || [];
      if (projectsWithAssign.length > 0) {
        const projectIdsFromAssign = projectsWithAssign.map(p => p.name);
        if (logInfo) {
          logInfo('Frappe', `Found ${projectsWithAssign.length} project(s) via _assign field: ${projectIdsFromAssign.join(', ')}`);
        }
        // Add these to the list (combine with existing direct assignments)
        projectIdsFromDirect = [...new Set([...projectIdsFromDirect, ...projectIdsFromAssign])];
      } else {
        if (logInfo) {
          logInfo('Frappe', 'No projects found via _assign field');
        }
      }
    } catch (assignFieldErr) {
      // This might fail if _assign field doesn't work the same way for projects
      if (logError) {
        logError('Frappe', `Error checking _assign field for projects: ${assignFieldErr.message}`);
      }
    }

    // Combine project IDs from all sources: tasks, Project User, and _assign field
    const allProjectIds = [...new Set([...projectIdsFromTasks, ...projectIdsFromDirect])];

    if (allProjectIds.length === 0) {
      if (logInfo) {
        logInfo('Frappe', 'No projects found from tasks or direct assignments');
      }
      return [];
    }

    // 2️⃣ Fetch project names for all unique projects
    // Note: Frappe 'in' filter might have limitations, so we'll fetch each project individually if needed
    if (logInfo) {
      logInfo('Frappe', `Fetching details for ${allProjectIds.length} project(s): ${allProjectIds.join(', ')}`);
    }

    let projects = [];
    
    // Try batch fetch first (more efficient)
    try {
      const projectRes = await frappe.get('/api/resource/Project', {
        params: {
          fields: JSON.stringify(['name', 'project_name']),
          filters: JSON.stringify([
            ['name', 'in', allProjectIds],
          ]),
          limit_page_length: 1000,
        },
      });

      projects = (projectRes.data.data || []).map(p => ({
        id: p.name,                         // internal ID
        name: p.project_name || p.name,     // display name
      }));

      if (logInfo) {
        logInfo('Frappe', `Batch fetch returned ${projects.length} project(s)`);
      }
    } catch (batchErr) {
      if (logError) {
        logError('Frappe', `Batch fetch failed, trying individual fetches: ${batchErr.message}`);
      }
      // Fallback: fetch projects individually
      projects = [];
      for (const projectId of allProjectIds) {
        try {
          const projectRes = await frappe.get(`/api/resource/Project/${projectId}`);
          const project = projectRes?.data?.data;
          if (project) {
            projects.push({
              id: project.name,
              name: project.project_name || project.name,
            });
          }
        } catch (indErr) {
          if (logError) {
            logError('Frappe', `Failed to fetch project ${projectId}: ${indErr.message}`);
          }
        }
      }
    }

    // Verify we got all projects
    const foundProjectIds = projects.map(p => p.id);
    const missingProjectIds = allProjectIds.filter(id => !foundProjectIds.includes(id));
    
    if (missingProjectIds.length > 0) {
      if (logError) {
        logError('Frappe', `Warning: Could not fetch details for ${missingProjectIds.length} project(s): ${missingProjectIds.join(', ')}`);
      }
    }

    if (logInfo) {
      logInfo('Frappe', `Returning ${projects.length} project(s) for user (${projectIdsFromTasks.length} from tasks, ${directProjects.length} from direct assignments)`);
      projects.forEach(p => {
        logInfo('Frappe', `  - ${p.name} (${p.id})`);
      });
      if (missingProjectIds.length > 0) {
        logInfo('Frappe', `Missing projects: ${missingProjectIds.join(', ')}`);
      }
    }

    return projects;
  } catch (err) {
    if (logError) {
      logError(
        'Frappe',
        `Error fetching user projects: ${err.message}`,
        err
      );
    }
    // Fallback to direct project fetch on error
    try {
      if (logInfo) {
        logInfo('Frappe', 'Falling back to direct project fetch due to error');
      }
      return await getUserProjectsDirect();
    } catch (fallbackErr) {
      if (logError) {
        logError('Frappe', `Fallback also failed: ${fallbackErr.message}`);
      }
      return [];
    }
  }
}

/**
 * Alternative: Fetch projects directly or via Project User assignments
 * This tries to find projects assigned directly to the user
 */
async function getUserProjectsDirect() {
  try {
    const userEmail = await getCurrentUser();
    if (!userEmail) {
      if (logError) logError('Frappe', 'Cannot fetch projects: User not logged in');
      return [];
    }

    if (logInfo) logInfo('Frappe', `Fetching projects directly for user: ${userEmail}`);

    const frappe = createFrappeClient();

    // Try method 1: Check if Project User doctype exists and has assignments
    try {
      const projectUserRes = await frappe.get('/api/resource/Project User', {
        params: {
          fields: JSON.stringify(['project', 'user']),
          filters: JSON.stringify([
            ['user', '=', userEmail],
          ]),
          limit_page_length: 1000,
        },
      });

      const projectUsers = Array.isArray(projectUserRes?.data?.data) ? projectUserRes.data.data : [];
      
      if (projectUsers.length > 0) {
        if (logInfo) {
          logInfo('Frappe', `Found ${projectUsers.length} project assignment(s) via Project User`);
        }
        
        const projectIds = [...new Set(projectUsers.map(pu => pu.project).filter(p => p))];
        
        // Fetch project details
        const projectRes = await frappe.get('/api/resource/Project', {
          params: {
            fields: JSON.stringify(['name', 'project_name']),
            filters: JSON.stringify([
              ['name', 'in', projectIds],
            ]),
            limit_page_length: 1000,
          },
        });

        const projects = (projectRes.data.data || []).map(p => ({
          id: p.name,
          name: p.project_name || p.name,
        }));

        if (logInfo) {
          logInfo('Frappe', `Returning ${projects.length} project(s) from Project User assignments`);
        }
        return projects;
      }
    } catch (projectUserErr) {
      // Project User doctype might not exist, that's okay
      if (logInfo) {
        logInfo('Frappe', 'Project User doctype not available or no assignments found');
      }
    }

    // Method 2: If no direct assignments, return empty (don't return all projects)
    // This prevents showing projects the user isn't assigned to
    if (logInfo) {
      logInfo('Frappe', 'No direct project assignments found, returning empty list');
    }
    return [];
  } catch (err) {
    const errorMessage = err.response?.data?.message || err.message || 'Failed to fetch projects';
    if (logError) logError('Frappe', `Error fetching projects: ${errorMessage}`, err);
    return [];
  }
}

module.exports = { 
  getUserProjects, 
  getUserProjectsDirect, 
  getMyTasksForProject, 
  setLoggers, 
  createTimesheet,
  getTimesheetForProject,
  addTimeLogToTimesheet,
  getOrCreateTimesheet,
  startTimesheetSession,
  updateTimesheetRow
};

