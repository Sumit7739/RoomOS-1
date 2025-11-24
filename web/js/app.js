import { renderLogin } from './ui/login.js';
import { apiCall } from './api.js';
// import { renderForgotPassword } from './ui/forgot_password.js';
import { renderGroupSetup } from './ui/group_setup.js';
import { renderDashboard, stopDashboardUpdates } from './ui/dashboard.js';
import { renderRoster } from './ui/roster.js';
import { renderCrew } from './ui/crew.js';
import { renderRules } from './ui/rules.js';
import { renderProfile } from './ui/profile.js';
import { renderTransactions } from './ui/transactions.js';
import { renderExpenseAnalytics } from './ui/expense-analytics.js';
import { renderChat, stopChatPolling } from './ui/chat.js';
import { getState, updateState } from './state.js';
import { showToast } from './ui/toast.js';
import { startUpdateChecker, checkForUpdates } from './ui/updates.js';
import './sync.js'; // Start sync listener

// Expose app to window for global access (e.g. onclick in HTML)
window.app = {
    navigate: navigate,
    toggleTheme: toggleTheme,
    showToast: showToast,
    toggleChat: toggleChat,
    checkForUpdates: checkForUpdates // For manual testing
};

// Toggle Chat Function
function toggleChat() {
    const currentView = localStorage.getItem('last_view');

    if (currentView === 'chat') {
        // If we're in chat, go back to the previous view
        const previousView = localStorage.getItem('view_before_chat') || 'dashboard';
        navigate(previousView);
    } else {
        // If we're not in chat, go to chat
        navigate('chat');
    }
}

// Router
export function navigate(view) {
    const container = document.getElementById('view-container');
    const state = getState();
    const bottomNav = document.querySelector('.bottom-nav');

    // Clear current view
    container.innerHTML = '';

    // Handle Auth Guard
    if (!localStorage.getItem('token') && !['login', 'forgot-password'].includes(view)) {
        view = 'login';
    }

    console.log('Navigating to:', view);
    console.log('Current State:', state);

    // Auth Guard
    if (!state.token && !['login', 'forgot-password'].includes(view)) {
        console.log('Auth Guard Blocked');
        renderLogin();
        return;
    }

    // Group Guard
    if (state.token && !state.group && view !== 'group_setup' && view !== 'login') {
        console.log('Group Guard Blocked. Token exists but no Group.');
        renderGroupSetup();
        return;
    }

    // Save current view
    if (view !== 'login' && view !== 'group_setup') {
        // Store previous view before entering chat
        const currentView = localStorage.getItem('last_view');
        if (view === 'chat' && currentView && currentView !== 'chat') {
            localStorage.setItem('view_before_chat', currentView);
        }
        localStorage.setItem('last_view', view);
    }

    // Update header title based on view
    const headerTitle = document.querySelector('.app-header h1');
    if (headerTitle) {
        const viewTitles = {
            dashboard: 'RoomOS',
            roster: 'Weekly Plan',
            transactions: 'Money',
            crew: 'Crew',
            rules: 'Rules',
            profile: 'Profile',
            'expense-analytics': 'Analytics',
            chat: 'Chat',
            login: 'RoomOS',
            group_setup: 'Setup',
            'forgot-password': 'Reset Password'
        };
        headerTitle.textContent = viewTitles[view] || 'RoomOS';
    }

    // Hide/Show bottom nav and chat button based on view
    const chatBtn = document.getElementById('chat-btn');
    const shouldHideNav = ['chat', 'login', 'group_setup', 'forgot-password'].includes(view);
    const shouldHideChat = ['login', 'group_setup', 'forgot-password'].includes(view);

    if (bottomNav) {
        bottomNav.style.display = shouldHideNav ? 'none' : 'flex';
    }

    if (chatBtn) {
        chatBtn.style.display = shouldHideChat ? 'none' : 'flex';
    }

    // Update Nav Active State
    document.querySelectorAll('.nav-item').forEach(el => {
        el.classList.toggle('active', el.dataset.target === view);
    });

    // Stop polling/intervals when leaving views
    if (view !== 'chat') {
        stopChatPolling();
    }
    if (view !== 'dashboard') {
        stopDashboardUpdates();
    }

    // Clear current view
    container.innerHTML = '';

    // Render the page content immediately
    switch (view) {
        case 'login':
            renderLogin();
            break;
        case 'forgot-password':
            // renderForgotPassword(); // Uncomment when implemented
            break;
        case 'group_setup':
            renderGroupSetup();
            break;
        case 'dashboard':
            renderDashboard();
            break;
        case 'roster':
            renderRoster();
            break;
        case 'crew':
            renderCrew();
            break;
        case 'rules':
            renderRules();
            break;
        case 'profile':
            renderProfile();
            break;
        case 'transactions':
            renderTransactions();
            break;
        case 'expense-analytics':
            renderExpenseAnalytics();
            break;
        case 'chat':
            renderChat();
            break;
        default:
            renderDashboard();
    }
}

// Theme Logic
function toggleTheme() {
    const body = document.body;
    const current = body.getAttribute('data-theme') || 'dark';
    const next = current === 'light' ? 'dark' : 'light';
    body.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);

    // Update Icon
    const icon = document.querySelector('#theme-toggle i');
    if (icon) {
        icon.className = next === 'light' ? 'ph ph-sun' : 'ph ph-moon';
    }
}

// Init
document.addEventListener('DOMContentLoaded', () => {
    // Nav Click Handlers
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            navigate(item.dataset.target);
        });
    });

    // Init Theme
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.body.setAttribute('data-theme', savedTheme);
    if (document.querySelector('#theme-toggle i')) {
        document.querySelector('#theme-toggle i').className = savedTheme === 'dark' ? 'ph ph-moon' : 'ph ph-sun';
    }

    const state = getState();

    // Initial Route
    if (state.token) {
        // Verify token is valid before proceeding. If not, force login.
        // A simple way is to try to fetch something that requires auth, like the user's schedule.
        // If it fails with a 401, we know the token is bad.
        apiCall('/schedule/get', 'GET', null, state.token)
            .then(() => {
                const lastView = localStorage.getItem('last_view');
                if (lastView && lastView !== 'login' && lastView !== 'group_setup') {
                    navigate(lastView);
                } else {
                    navigate('dashboard');
                }
            })
            .catch((err) => {
                console.warn('Initial token check failed:', err);
                // If offline, allow access assuming token is valid
                if (!navigator.onLine || err.message.includes('offline') || err.message.includes('NetworkError')) {
                    console.log('Offline detected, proceeding to app...');
                    const lastView = localStorage.getItem('last_view');
                    if (lastView && lastView !== 'login' && lastView !== 'group_setup') {
                        navigate(lastView);
                    } else {
                        navigate('dashboard');
                    }
                } else {
                    navigate('login');
                }
            });
    } else {
        navigate('login');
    }

    // Register Service Worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js')
            .then(() => console.log('SW Registered'))
            .catch(err => console.error('SW Fail', err));
    }

    // Network Status Handler
    function updateOnlineStatus() {
        const banner = document.getElementById('offline-banner');
        if (banner) {
            if (navigator.onLine) {
                banner.style.display = 'none';
            } else {
                banner.style.display = 'flex';
            }
        }
    }

    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    updateOnlineStatus(); // Initial check

    // Start Update Checker (only for logged-in users)
    if (state.token) {
        startUpdateChecker();
    }
});
