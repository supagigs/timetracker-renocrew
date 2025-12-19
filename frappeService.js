const { createFrappeClient } = require('./frappeClient');
const { getCurrentUser } = require('./frappeAuth');

// Logging functions will be passed from main.js
let logInfo, logError;

function setLoggers(loggers) {
  logInfo = loggers.logInfo;
  logError = loggers.logError;
}

/**
 * Get tasks assigned to the current user in Frappe
 * Returns an array of tasks
 */
async function getMyTasks() {
  try {
    const userEmail = await getCurrentUser();
    if (!userEmail) {
      if (logError) logError('Frappe', 'Cannot fetch tasks: User not logged in');
      return [];
    }

    if (logInfo) logInfo('Frappe', `Fetching tasks for user: ${userEmail}`);

    // Create frappe client with current FRAPPE_URL
    const frappe = createFrappeClient();

    // Fetch tasks assigned to the user
    // _assign is a JSON field that stores assigned users
    const res = await frappe.get('/api/resource/Task', {
      params: {
        fields: JSON.stringify(['name', 'subject', 'project']),
        filters: JSON.stringify([
          ['_assign', 'like', `%${userEmail}%`],
        ]),
        limit_page_length: 1000,
      },
    });

    const tasks = res.data.data || [];
    if (logInfo) logInfo('Frappe', `Found ${tasks.length} task(s) for user ${userEmail}`);
    return tasks;
  } catch (err) {
    const errorMessage = err.response?.data?.message || err.message || 'Failed to fetch tasks';
    if (logError) logError('Frappe', `Error fetching tasks: ${errorMessage}`, err);
    return [];
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
    if (!userEmail) {
      if (logError) logError('Frappe', 'Cannot fetch projects: User not logged in');
      return [];
    }

    if (logInfo) logInfo('Frappe', `Fetching projects for user: ${userEmail}`);

    // Step 1: Get tasks assigned to the user
    const tasks = await getMyTasks();
    
    if (!tasks || tasks.length === 0) {
      if (logInfo) logInfo('Frappe', `No tasks found for user ${userEmail}, returning empty projects list`);
      return [];
    }

    // Step 2: Extract unique project names from tasks
    const projectNames = [
      ...new Set(tasks.map(t => t.project).filter(Boolean))
    ];

    if (!projectNames.length) {
      if (logInfo) logInfo('Frappe', `No projects found in tasks for user ${userEmail}`);
      return [];
    }

    if (logInfo) logInfo('Frappe', `Found ${projectNames.length} unique project(s) from tasks: ${projectNames.join(', ')}`);

    // Step 3: Fetch the actual Project records
    const frappe = createFrappeClient();
    const res = await frappe.get('/api/resource/Project', {
      params: {
        fields: JSON.stringify(['name', 'project_name', 'status']),
        filters: JSON.stringify([
          ['name', 'in', projectNames],
        ]),
        limit_page_length: 1000,
      },
    });

    const projects = (res.data.data || []).map((p) => ({
      id: p.name,                        // project ID
      name: p.project_name || p.name,    // project name
    }));

    if (logInfo) logInfo('Frappe', `Returning ${projects.length} project(s) for user ${userEmail}`);
    return projects;
  } catch (err) {
    const errorMessage = err.response?.data?.message || err.message || 'Failed to fetch projects';
    if (logError) logError('Frappe', `Error fetching projects: ${errorMessage}`, err);
    if (logError && err.response?.data) {
      logError('Frappe', `Response data: ${JSON.stringify(err.response.data)}`);
    }
    return [];
  }
}

/**
 * Alternative: Fetch projects directly if you have a Project doctype
 */
async function getUserProjectsDirect() {
  try {
    const userEmail = await getCurrentUser();
    if (!userEmail) {
      if (logError) logError('Frappe', 'Cannot fetch projects: User not logged in');
      return [];
    }

    if (logInfo) logInfo('Frappe', `Fetching projects directly for user: ${userEmail}`);

    // Create frappe client with current FRAPPE_URL
    const frappe = createFrappeClient();

    // If you have a Project doctype and can filter by assigned users
    const res = await frappe.get('/api/resource/Project', {
      params: {
        fields: JSON.stringify(['name', 'project_name']),
        limit_page_length: 1000,
      },
    });

    const projects = (res.data.data || []).map(project => ({
      id: project.name,
      name: project.project_name || project.name,
    }));

    if (logInfo) logInfo('Frappe', `Found ${projects.length} project(s)`);
    return projects;
  } catch (err) {
    const errorMessage = err.response?.data?.message || err.message || 'Failed to fetch projects';
    if (logError) logError('Frappe', `Error fetching projects: ${errorMessage}`, err);
    return [];
  }
}

module.exports = { getUserProjects, getUserProjectsDirect, getMyTasks, setLoggers };

