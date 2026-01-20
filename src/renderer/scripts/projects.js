document.addEventListener('DOMContentLoaded', async () => {
  const projectsList = document.getElementById('projectsList');
  const loadingMessage = document.getElementById('loadingMessage');
  const noProjectsMessage = document.getElementById('noProjectsMessage');

  try {
    const projects = await window.frappe.getUserProjects();

    if (!projects || projects.length === 0) {
      noProjectsMessage.classList.add('show');
      return;
    }

    projects.forEach(project => {
      const li = document.createElement('li');
      li.textContent = project.name;
      li.className = 'project-item';

      li.addEventListener('click', () => {
        StorageService.setItem('selectedProjectId', project.id);
        StorageService.setItem('selectedProjectName', project.name);
        window.location.href = `selectTask.html?projectId=${project.id}`;
      });

      projectsList.appendChild(li);
    });

  } catch (err) {
    console.error('Failed to load projects:', err);
    NotificationService.showError(
      err.message || 'Failed to load projects'
    );
  } finally {
    loadingMessage.style.display = 'none';
  }
});
