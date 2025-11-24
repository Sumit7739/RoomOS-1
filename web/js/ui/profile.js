import { apiCall } from '../api.js';
import { showToast } from './toast.js';
import { getState } from '../state.js';

export async function renderProfile() {
  const container = document.getElementById('view-container');
  container.innerHTML = '<div class="flex-center p-4"><div class="loader">Loading...</div></div>';

  try {
    const token = localStorage.getItem('token');
    const state = getState();
    const user = state.user;

    // Fetch schedule
    const scheduleRes = await apiCall('/schedule/get', 'GET', null, token);
    const schedule = scheduleRes.schedule || {};

    // Check join request status if user has no group
    let joinRequestStatus = null;
    if (!user.group_id) {
      try {
        const statusRes = await apiCall('/group/my-request-status', 'GET', null, token);
        joinRequestStatus = statusRes;
      } catch (e) {
        console.error('Failed to check join status:', e);
        joinRequestStatus = { has_request: false };
      }
    }

    // Fetch pending requests (admin only)
    let pendingRequests = [];
    if (user.role === 'admin') {
      try {
        const reqRes = await apiCall('/group/pending-requests', 'GET', null, token);
        pendingRequests = reqRes.requests || [];
      } catch (e) {
        console.error('Failed to fetch pending requests:', e);
      }
    }

    const html = `
      <div class="fade-in" style="padding-bottom: 100px;">


        <!-- User Info Card -->
        <div class="card">
          <h2>Account Information</h2>
          <div style="display: flex; align-items: center; gap: var(--space-lg); margin-bottom: var(--space-lg);">
            <div style="width: 64px; height: 64px; display: flex; align-items: center; justify-content: center; background: var(--accent-gradient); border-radius: var(--radius-lg); font-size: 2rem; font-weight: 800; color: white;">
              ${user.name.charAt(0).toUpperCase()}
            </div>
            <div style="flex: 1;">
              <h3 style="margin: 0 0 4px 0; font-size: 1.25rem;">${user.name}</h3>
              <p style="margin: 0; color: var(--text-secondary); font-size: 0.9rem;">${user.email}</p>
            </div>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-md);">
            <div style="padding: var(--space-md); background: var(--bg-elevated); border-radius: var(--radius-md);">
              <span style="display: block; color: var(--text-tertiary); font-size: 0.75rem; margin-bottom: 4px;">Role</span>
              <span style="font-weight: 700; color: var(--accent-primary);">${user.role || 'Member'}</span>
            </div>
            <div style="padding: var(--space-md); background: var(--bg-elevated); border-radius: var(--radius-md);">
              <span style="display: block; color: var(--text-tertiary); font-size: 0.75rem; margin-bottom: 4px;">Group ID</span>
              <span style="font-weight: 700; color: var(--text-primary);">
                ${user.group_id ? user.group_id : (joinRequestStatus?.status === 'pending' ? `Pending (Group #${joinRequestStatus.group_id})` : 'Not in group')}
              </span>
            </div>
          </div>
        </div>

        ${user.role === 'admin' && pendingRequests.length > 0 ? renderPendingRequests(pendingRequests) : ''}

        <!-- Weekly Schedule Card -->
        <div class="card card-collapsible" style="padding: 16px;">
          <details>
            <summary class="details-summary-profile">
              <h2>Weekly Class Schedule</h2>
              <i class="ph ph-caret-down"></i>
            </summary>
            <div class="details-content-profile">
              <p style="margin: 0 0 var(--space-lg) 0; color: var(--text-secondary); font-size: 0.85rem;">
                Set your class times. Check "Off" for days without classes.
              </p>
              <div id="schedule-container">
                ${renderScheduleForm(schedule)}
              </div>
              <button id="save-schedule-btn" class="btn btn-primary" style="margin-top: var(--space-lg);">
                Save Schedule
              </button>
              ${user.role === 'admin' ? `
              <button id="generate-plan-btn" class="btn" style="margin-top: var(--space-sm); background: var(--success); color: white;">
                Generate Weekly Plan
              </button>` : ''}
              <p style="margin-top: var(--space-sm); font-size: 0.75rem; color: var(--text-tertiary); text-align: center;">
                Plan will be auto-generated when all members complete their schedules
              </p>
            </div>
          </details>
        </div>

        <!-- Settings -->
        <div class="card">
          <h2>Settings</h2>
          <button class="btn" style="background: var(--danger); color: white;" id="logout-btn">
            Logout
          </button>
        </div>

        <!-- Password Reset Card -->
        <div class="card">
            <h2>Reset Password</h2>
            <div class="input-group">
                <label for="current-password" class="input-label">Current Password</label>
                <input type="password" id="current-password" class="input-field" placeholder="Enter your current password">
            </div>
            <div class="input-group">
                <label for="new-password" class="input-label">New Password</label>
                <input type="password" id="new-password" class="input-field" placeholder="Enter a strong new password">
            </div>
            <div class="input-group">
                <label for="confirm-password" class="input-label">Confirm New Password</label>
                <input type="password" id="confirm-password" class="input-field" placeholder="Confirm your new password">
            </div>
            <button id="reset-password-btn" class="btn btn-primary" style="margin-top: var(--space-md);">
                Update Password
            </button>
        </div>

        <!-- Logout Confirmation Modal -->
        <div id="logout-modal" style="display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.9); z-index: 9999; align-items: center; justify-content: center;">
          <div style="background: var(--bg-card); border-radius: var(--radius-lg); padding: var(--space-xl); max-width: 400px; width: 90%; box-shadow: 0 20px 60px rgba(0,0,0,0.5);">
            <h3 style="margin: 0 0 var(--space-md) 0; font-size: 1.25rem; color: var(--text-primary);">Confirm Logout</h3>
            <p style="margin: 0 0 var(--space-lg) 0; color: var(--text-secondary); font-size: 0.95rem;">
              Are you sure you want to logout? You'll need to sign in again to access your account.
            </p>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-md);">
              <button id="cancel-logout-btn" class="btn" style="background: var(--bg-elevated); color: var(--text-primary);">
                Cancel
              </button>
              <button id="confirm-logout-btn" class="btn" style="background: var(--danger); color: white;">
                Logout
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    container.innerHTML = html;

    // === EVENT LISTENERS ===

    document.getElementById('save-schedule-btn')?.addEventListener('click', saveSchedule);
    document.getElementById('generate-plan-btn')?.addEventListener('click', generatePlan);
    document.getElementById('logout-btn')?.addEventListener('click', logout);
    document.getElementById('reset-password-btn')?.addEventListener('click', handlePasswordReset);

    // Off-day checkboxes
    document.querySelectorAll('.off-checkbox').forEach(checkbox => {
      checkbox.addEventListener('change', (e) => {
        const day = e.target.dataset.day;
        const timeInputs = document.querySelectorAll(`[data-day="${day}"].time-input`);
        timeInputs.forEach(input => {
          input.disabled = e.target.checked;
          if (e.target.checked) input.value = '';
        });
      });
    });

    // Pending requests buttons (THE FIX IS HERE)
    document.querySelectorAll('.approve-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const card = btn.closest('.pending-request-item');
        const requestId = card?.dataset?.requestId;
        if (requestId) await approveRequest(requestId);
      });
    });

    document.querySelectorAll('.reject-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const card = btn.closest('.pending-request-item');
        const requestId = card?.dataset?.requestId;
        if (requestId && confirm('Are you sure you want to reject this request?')) {
          await rejectRequest(requestId);
        }
      });
    });

    // Logout Modal Handlers
    const logoutModal = document.getElementById('logout-modal');
    const cancelLogoutBtn = document.getElementById('cancel-logout-btn');
    const confirmLogoutBtn = document.getElementById('confirm-logout-btn');

    // Close modal when clicking outside
    logoutModal.addEventListener('click', (e) => {
      if (e.target === logoutModal) {
        logoutModal.style.display = 'none';
      }
    });

    // Cancel button
    cancelLogoutBtn.addEventListener('click', () => {
      logoutModal.style.display = 'none';
    });

    // Confirm logout button
    confirmLogoutBtn.addEventListener('click', () => {
      localStorage.clear();
      window.location.reload();
    });


  } catch (error) {
    container.innerHTML = `
                <div class="card" style="border-left: 4px solid var(--danger); animation: fadeIn 0.3s ease-out;">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <i class="ph ph-warning-circle" style="font-size: 2rem; color: var(--danger);"></i>
                        <div style="flex: 1;">
                            <h3 style="margin: 0; font-weight: 600; color: var(--text-primary);">An Error Occurred</h3>
                            <p style="margin: 4px 0 0 0; color: var(--text-secondary); font-size: 0.9rem;">${error.message}</p>
                        </div>
                    </div>
                </div>
            `;
  }
}

// ─────────────────────────────────────────────────────────────────────────────

function renderScheduleForm(schedule) {
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  let html = '';

  days.forEach(day => {
    const daySchedule = schedule[day] || { start: '', end: '', off: false };
    const isOff = !!daySchedule.off;

    html += `
      <div style="margin-bottom: var(--space-md); padding: 12px; background: var(--bg-elevated); border-radius: var(--radius-md);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-sm);">
          <div style="font-weight: 600; color: var(--text-primary);">${day}</div>
          <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
            <input type="checkbox" class="off-checkbox" data-day="${day}" ${isOff ? 'checked' : ''} style="width: 18px; height: 18px;">
            <span style="font-size: 0.85rem; color: var(--text-secondary);">Off Day</span>
          </label>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
          <div>
            <label style="display: block; font-size: 0.75rem; color: var(--text-tertiary); margin-bottom: 4px;">Leave at</label>
            <input type="time" class="input-field time-input schedule-input" data-day="${day}" data-type="start"
              value="${isOff ? '' : daySchedule.start}" ${isOff ? 'disabled' : ''}>
          </div>
          <div>
            <label style="display: block; font-size: 0.75rem; color: var(--text-tertiary); margin-bottom: 4px;">End Time</label>
            <input type="time" class="input-field time-input schedule-input" data-day="${day}" data-type="end"
              value="${isOff ? '' : daySchedule.end}" ${isOff ? 'disabled' : ''}>
          </div>
        </div>
      </div>
    `;
  });

  return html;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────

function renderPendingRequests(requests) {
  let html = `
    <div class="card">
      <h2>Pending Join Requests</h2>
      <p style="margin: 0 0 var(--space-md) 0; color: var(--text-secondary); font-size: 0.85rem;">
        ${requests.length} request(s) waiting for approval
      </p>
      <div style="display: flex; flex-direction: column; gap: var(--space-md);">
  `;

  requests.forEach(req => {
    html += `
      <div class="pending-request-item" data-request-id="${req.id}"
           style="padding: var(--space-md); background: var(--bg-elevated); border-radius: var(--radius-md);">
        <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: var(--space-sm);">
          <div>
            <div style="font-weight: 600; color: var(--text-primary);">${req.name}</div>
            <div style="font-size: 0.85rem; color: var(--text-secondary);">${req.email}</div>
            <div style="font-size: 0.75rem; color: var(--text-tertiary); margin-top: 4px;">
              ${new Date(req.created_at).toLocaleDateString([], { timeZone: 'Asia/Kolkata' })}
            </div>
          </div>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-sm); margin-top: var(--space-md);">
          <button class="btn approve-btn" style="background: var(--success); color: white;">Approve</button>
          <button class="btn reject-btn" style="background: var(--danger); color: white;">Reject</button>
        </div>
      </div>
    `;
  });

  html += `</div></div>`;
  return html;
}

// ─────────────────────────────────────────────────────────────────────────────

async function saveSchedule() {
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const schedule = {};

  days.forEach(day => {
    const off = document.querySelector(`.off-checkbox[data-day="${day}"]`).checked;
    if (off) {
      schedule[day] = { start: '', end: '', off: true };
    } else {
      const start = document.querySelector(`.schedule-input[data-day="${day}"][data-type="start"]`).value;
      const end = document.querySelector(`.schedule-input[data-day="${day}"][data-type="end"]`).value;
      schedule[day] = { start, end, off: false };
    }
  });

  try {
    const token = localStorage.getItem('token');
    await apiCall('/schedule/save', 'POST', { schedule }, token);
    showToast('Schedule saved successfully!', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function generatePlan() {
  if (!confirm('Generate weekly plan based on everyone\'s schedules? This will overwrite the current plan.')) return;

  const btn = document.getElementById('generate-plan-btn');
  btn.disabled = true;
  btn.textContent = 'Generating...';

  try {
    const token = localStorage.getItem('token');
    await apiCall('/schedule/generate-plan', 'POST', null, token);
    showToast('Weekly plan generated successfully!', 'success');
    setTimeout(() => window.app.navigate('roster'), 1500);
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Generate Weekly Plan';
  }
}

function logout() {
  const logoutModal = document.getElementById('logout-modal');
  if (logoutModal) {
    logoutModal.style.display = 'flex';
  }
}

async function approveRequest(requestId) {
  try {
    const token = localStorage.getItem('token');
    await apiCall('/group/approve-request', 'POST', { request_id: requestId }, token);
    showToast('Request approved!', 'success');
    renderProfile(); // refresh
  } catch (err) {
    showToast(err.message || 'Failed to approve', 'error');
  }
}

async function rejectRequest(requestId) {
  try {
    const token = localStorage.getItem('token');
    await apiCall('/group/reject-request', 'POST', { request_id: requestId }, token);
    showToast('Request rejected', 'info');
    renderProfile();
  } catch (err) {
    showToast(err.message || 'Failed to reject', 'error');
  }
}

async function handlePasswordReset() {
  const currentPassword = document.getElementById('current-password').value;
  const newPassword = document.getElementById('new-password').value;
  const confirmPassword = document.getElementById('confirm-password').value;

  if (!currentPassword || !newPassword || !confirmPassword) {
    showToast('Please fill in all password fields.', 'error');
    return;
  }

  if (newPassword !== confirmPassword) {
    showToast('New passwords do not match.', 'error');
    return;
  }

  const btn = document.getElementById('reset-password-btn');
  btn.disabled = true;
  btn.innerHTML = '<i class="ph ph-spinner-gap animate-spin"></i> Updating...';

  try {
    const token = localStorage.getItem('token');
    await apiCall('/auth/reset-password', 'POST', { current_password: currentPassword, new_password: newPassword }, token);
    showToast('Password updated successfully!', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Update Password';
    document.getElementById('current-password').value = '';
    document.getElementById('new-password').value = '';
    document.getElementById('confirm-password').value = '';
  }
}