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


async function createTimesheet({ project, task }) {
  const userEmail = await getCurrentUser();
  if (!userEmail) {
    throw new Error('User not logged in');
  }

  if (!project || !task) {
    throw new Error('Project and Task are required');
  }

  const frappe = createFrappeClient();

  // 1️⃣ Fetch project to get company
  const projectRes = await frappe.get(`/api/resource/Project/${project}`);
  const projectDoc = projectRes?.data?.data;

  if (!projectDoc?.company) {
    throw new Error(`Company not found for project ${project}`);
  }

  // 2️⃣ Create Timesheet with ZERO hours
  const payload = {
    company: projectDoc.company,
    time_logs: [
      {
        activity_type: 'Execution',
        project,
        task,
        hours: 0,   // ✅ VALID, no datetime issues
      },
    ],
  };

  const res = await frappe.post('/api/resource/Timesheet', payload);

  if (!res?.data?.data?.name) {
    throw new Error('Invalid response while creating timesheet');
  }

  return res.data.data;
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
        fields: JSON.stringify(['project']),
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

    if (!tasks.length) return [];

    const projectIds = [...new Set(tasks.map(t => t.project))];

    // 2️⃣ Fetch project names ONLY for those projects
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
      id: p.name,                         // internal ID
      name: p.project_name || p.name,     // display name
    }));

    return projects;
  } catch (err) {
    if (logError) {
      logError(
        'Frappe',
        `Error fetching user projects: ${err.message}`,
        err
      );
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

module.exports = { getUserProjects, getUserProjectsDirect, getMyTasksForProject, setLoggers, createTimesheet };

