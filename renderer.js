const { createClient } = require('@supabase/supabase-js');

// Supabase configuration - in production, use environment variables
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://yrnihgsmwmlzizcqjvyf.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlybmloZ3Ntd21seml6Y3FqdnlmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDIwNjMyMzQsImV4cCI6MjA1NzYzOTIzNH0.o-ygn-MwnFyxwbldJLzkI9tcTmtaPqDJX2WkQK2Nyi0';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let startTime = null;
let timerInterval = null;

// Initialize the app
document.addEventListener('DOMContentLoaded', () => {
  updateStatus('Ready to start tracking time');
  loadRecentLogs();
});

window.startTimer = () => {
  if (startTime) {
    alert('Timer is already running! Stop it first.');
    return;
  }

  const taskName = document.getElementById('taskName').value.trim();
  if (!taskName) {
    alert('Please enter a task name before starting the timer.');
    return;
  }

  startTime = new Date();
  updateStatus(`⏱️ Timer started for: "${taskName}"`);
  
  // Update the timer display every second
  timerInterval = setInterval(updateTimerDisplay, 1000);
  
  // Disable start button, enable stop button
  document.getElementById('startBtn').disabled = true;
  document.getElementById('stopBtn').disabled = false;
  document.getElementById('taskName').disabled = true;
};

window.stopTimer = async () => {
  if (!startTime) {
    alert('No timer is running!');
    return;
  }

  const endTime = new Date();
  const taskName = document.getElementById('taskName').value.trim() || 'Unnamed Task';
  const duration = Math.round((endTime - startTime) / 1000); // Duration in seconds

  updateStatus('💾 Saving time log...');

  try {
    const { data, error } = await supabase
      .from('time_logs')
      .insert([{ 
        task_name: taskName, 
        start_time: startTime.toISOString(), 
        end_time: endTime.toISOString(),
        duration_seconds: duration
      }]);

    if (error) {
      console.error('Error saving log:', error);
      updateStatus('❌ Failed to save log: ' + error.message);
    } else {
      updateStatus(`✅ Logged ${formatDuration(duration)} for "${taskName}"`);
      document.getElementById('taskName').value = '';
      loadRecentLogs(); // Refresh the recent logs
    }
  } catch (err) {
    console.error('Exception saving log:', err);
    updateStatus('❌ Failed to save log: ' + err.message);
  }

  // Reset timer
  clearInterval(timerInterval);
  startTime = null;
  timerInterval = null;
  
  // Reset UI
  document.getElementById('startBtn').disabled = false;
  document.getElementById('stopBtn').disabled = true;
  document.getElementById('taskName').disabled = false;
  document.getElementById('timerDisplay').textContent = '';
};

function updateTimerDisplay() {
  if (startTime) {
    const elapsed = Math.round((new Date() - startTime) / 1000);
    document.getElementById('timerDisplay').textContent = `⏱️ ${formatDuration(elapsed)}`;
  }
}

function formatDuration(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
}

function updateStatus(message) {
  document.getElementById('status').innerText = message;
}

async function loadRecentLogs() {
  try {
    const { data, error } = await supabase
      .from('time_logs')
      .select('*')
      .order('start_time', { ascending: false })
      .limit(5);

    if (error) {
      console.error('Error loading logs:', error);
      return;
    }

    const logsContainer = document.getElementById('recentLogs');
    if (data && data.length > 0) {
      logsContainer.innerHTML = '<h3>Recent Logs:</h3>';
      data.forEach(log => {
        const startDate = new Date(log.start_time);
        const endDate = new Date(log.end_time);
        const duration = Math.round((endDate - startDate) / 1000);
        
        logsContainer.innerHTML += `
          <div class="log-entry">
            <strong>${log.task_name}</strong><br>
            <small>${startDate.toLocaleString()} - ${formatDuration(duration)}</small>
          </div>
        `;
      });
    } else {
      logsContainer.innerHTML = '<p>No recent logs found.</p>';
    }
  } catch (err) {
    console.error('Exception loading logs:', err);
  }
}
