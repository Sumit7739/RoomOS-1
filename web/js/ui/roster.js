import { apiCall } from '../api.js';
import { getState } from '../state.js';
import { showToast } from './toast.js';

export async function renderRoster() {
    const container = document.getElementById('view-container');
    container.innerHTML = '<div class="flex-center p-4"><div class="loader">Loading...</div></div>';

    try {
        const token = localStorage.getItem('token');
        const res = await apiCall('/roster/week', 'GET', null, token);
        const roster = res.roster;
        const isAdmin = res.role === 'admin'; // Or allow everyone to edit if desired

        const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
        const localDateStr = new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
        const todayInKolkata = new Date(localDateStr);
        const todayIndex = (todayInKolkata.getDay() + 6) % 7; // Mon=0

        let html = `
            <div class="fade-in" style="padding-bottom: 80px;">
                <div style="display: flex; justify-content: flex-end; align-items: center; margin-bottom: var(--space-lg);">

                </div>
                <div id="roster-list" class="roster-grid">
        `;

        roster.forEach(day => {
            let morning = JSON.parse(day.morning || '[]');
            let night = JSON.parse(day.night || '[]');

            morning = morning.map(x => typeof x === 'string' ? { n: x, t: '' } : x);
            night = night.map(x => typeof x === 'string' ? { n: x, t: '' } : x);

            const dayName = days[day.day_index];
            const isToday = day.day_index === todayIndex ? 'today-glow' : '';
            const todayBadge = day.day_index === todayIndex ? '<span class="today-tag">TODAY</span>' : '';

            const schedules = day.schedules || [];
            let earliestLeaveTimestamp = null;
            let earliestLeaverName = '';
            schedules.forEach(s => {
                if (!s.isOff && s.leaveAt) {
                    const currentTimestamp = new Date(`1970-01-01T${s.leaveAt}`).getTime();
                    if (!earliestLeaveTimestamp || currentTimestamp < earliestLeaveTimestamp) {
                        earliestLeaveTimestamp = currentTimestamp;
                        earliestLeaverName = s.name;
                    }
                }
            });

            html += `
                <div class="roster-card-v2 ${isToday}" data-day="${day.day_index}">
                    <div class="roster-card-v2__header">
                        <span class="day-name">${dayName}</span>
                        ${todayBadge}
                    </div>

                    <div class="roster-card-v2__main-shifts">
                        <div class="shift-assignment">
                            <div class="shift-assignment__title">
                                <i class="ph ph-sun"></i> Morning
                            </div>
                            <div class="shift-assignment__workers">
                                ${morning.length ? morning.map(p => `<div class="worker-pill">${p.n}</div>`).join('') : '<span class="no-one">None</span>'}
                            </div>
                        </div>
                        <div class="shift-assignment">
                            <div class="shift-assignment__title">
                                <i class="ph ph-moon"></i> Night
                            </div>
                            <div class="shift-assignment__workers">
                                ${night.length ? night.map(p => `<div class="worker-pill">${p.n}</div>`).join('') : '<span class="no-one">None</span>'}
                            </div>
                        </div>
                    </div>

                    <div class="roster-card-v2__details">
                        <details>
                            <summary class="details-summary">
                                <span>Details</span>
                                <i class="ph ph-caret-down"></i>
                            </summary>
                            <div class="details-content">
                                <div class="details-section">
                                    <div class="details-section__title">Schedule Breakdown</div>
                                    ${earliestLeaveTimestamp ? `<div class="details-highlight">Alarm Clock: <b>${new Date(earliestLeaveTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}</b> (${earliestLeaverName})</div>` : `<div class="details-highlight">Everyone has the day off!</div>`}
                                    ${schedules.map(s => {
                let bufferText = '';
                if (s.isOff) {
                    bufferText = '<span style="color:var(--success)">Day Off</span>';
                } else if (s.leaveAt && earliestLeaveTimestamp) {
                    const myTimestamp = new Date(`1970-01-01T${s.leaveAt}`).getTime();
                    const bufferMinutes = (myTimestamp - earliestLeaveTimestamp) / (1000 * 60);
                    const bufferHours = (bufferMinutes / 60).toFixed(1);
                    const bufferColor = bufferMinutes >= 120 ? 'var(--success)' : 'var(--warning)';
                    bufferText = `Buffer: <b style="color:${bufferColor}">${bufferHours} hr</b>`;
                } else {
                    bufferText = 'No time set';
                }
                const leaveTimeStr = s.leaveAt ? new Date(`1970-01-01T${s.leaveAt}`).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }) : 'N/A';
                return `<div class="details-person-row"><span>${s.name} <small>(Leaves at ${leaveTimeStr})</small></span> <span>${bufferText}</span></div>`;
            }).join('')}
                                </div>
                                <div class="details-section">
                                    <div class="details-section__title">Passengers (Off-Duty)</div>
                                    <div class="passenger-list">
                                        <div class="passenger-item">
                                            <i class="ph ph-sun"></i>
                                            <span>${day.passenger_m || 'None'}</span>
                                        </div>
                                        <div class="passenger-item">
                                            <i class="ph ph-moon"></i>
                                            <span>${day.passenger_n || 'None'}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </details>
                    </div>
                </div>
            `;
        });

        html += '</div></div>';
        container.innerHTML = html;

        // Make entire cards clickable to toggle details
        document.querySelectorAll('.roster-card-v2').forEach(card => {
            const details = card.querySelector('details');
            if (details) {
                // Add cursor pointer to indicate clickability
                card.style.cursor = 'pointer';

                card.addEventListener('click', (e) => {
                    // Don't toggle if clicking on the summary itself (to avoid double-toggle)
                    if (e.target.closest('.details-summary')) {
                        return;
                    }

                    // Toggle the details
                    details.open = !details.open;
                });
            }
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


