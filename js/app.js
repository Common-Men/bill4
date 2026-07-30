/**
 * Blade Master - Core Application Controller
 * Handles SPA navigation, authentication state flow, PWA service worker registration, and modal/toast helpers.
 */

class AppRouter {
    constructor() {
        this.currentView = 'viewDashboard';
        this.bindNavigation();
    }

    bindNavigation() {
        const navItems = document.querySelectorAll('.nav-item');
        navItems.forEach(item => {
            item.addEventListener('click', (e) => {
                if (item.dataset.action === 'modalPayment') {
                    window.openModal('modalPayment');
                    return;
                }
                const target = item.dataset.target;
                if (target) {
                    this.navigateTo(target);
                }
            });
        });
    }

    navigateTo(viewId) {
        // Alias legacy routes to unified Contacts view
        if (viewId === 'viewCustomers') {
            viewId = 'viewContacts';
            if (window.switchContactsTab) window.switchContactsTab('customers');
        } else if (viewId === 'viewVendors') {
            viewId = 'viewContacts';
            if (window.switchContactsTab) window.switchContactsTab('vendors');
        }

        document.querySelectorAll('.app-view').forEach(view => {
            view.classList.remove('active');
        });

        const targetView = document.getElementById(viewId);
        if (targetView) {
            targetView.classList.add('active');
            this.currentView = viewId;
        }

        const isMoreChild = ['viewLedger', 'viewExpenses', 'viewProfitLoss', 'viewReports'].includes(viewId);
        document.querySelectorAll('.nav-item').forEach(item => {
            const target = item.dataset.target;
            if (target === viewId || (isMoreChild && target === 'viewMore')) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });

        this.reloadCurrentView();
    }

    async reloadCurrentView() {
        switch (this.currentView) {
            case 'viewDashboard':
                if (window.dashboardModule) await window.dashboardModule.init();
                break;
            case 'viewContacts':
                if (window.contactsActiveTab === 'vendors') {
                    if (window.vendorsModule) await window.vendorsModule.loadVendors();
                } else {
                    if (window.customerModule) await window.customerModule.loadCustomers();
                }
                break;
            case 'viewMore':
                // Menu grid view
                break;
            case 'viewProfitLoss':
                if (window.profitLossModule) await window.profitLossModule.init();
                break;
            case 'viewExpenses':
                if (window.expensesModule) await window.expensesModule.init();
                break;
            case 'viewBilling':
                if (window.billingModule) window.billingModule.init();
                break;
            case 'viewLedger':
                if (window.ledgerModule) await window.ledgerModule.loadLedger();
                break;
            case 'viewReports':
                if (window.reportsModule) {
                    await window.reportsModule.init();
                }
                break;
        }
    }
}

// Contacts Tab Switcher Helper
window.contactsActiveTab = 'customers';
window.switchContactsTab = function(tab) {
    window.contactsActiveTab = tab;
    const btnCust = document.getElementById('tabContactsCust');
    const btnVend = document.getElementById('tabContactsVend');
    const panelCust = document.getElementById('contactsCustomersPanel');
    const panelVend = document.getElementById('contactsVendorsPanel');

    if (tab === 'customers') {
        if (btnCust) btnCust.classList.add('active');
        if (btnVend) btnVend.classList.remove('active');
        if (panelCust) panelCust.classList.remove('hidden');
        if (panelVend) panelVend.classList.add('hidden');
        if (window.customerModule) window.customerModule.loadCustomers();
    } else {
        if (btnVend) btnVend.classList.add('active');
        if (btnCust) btnCust.classList.remove('active');
        if (panelVend) panelVend.classList.remove('hidden');
        if (panelCust) panelCust.classList.add('hidden');
        if (window.vendorsModule) window.vendorsModule.loadVendors();
    }
};

// Global UI Helper Functions
window.openModal = function(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('hidden');
};

window.closeModal = function(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add('hidden');
};

window.showToast = function(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;

    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(50px)';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
};

// Main App Initialization
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Initialize IndexedDB Storage
    try {
        await window.db.init();
    } catch (e) {
        console.error('IndexedDB initialization failed:', e);
    }

    // 2. Register PWA Service Worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('[SW] ServiceWorker registered:', reg.scope))
            .catch(err => console.error('[SW] Registration failed:', err));
    }

    // 3. Initialize Router
    window.appRouter = new AppRouter();

    // 4. Bind Authentication Views
    bindAuthEvents();

    // 5. Bind Global Modal Close Triggers
    document.querySelectorAll('[data-close]').forEach(btn => {
        btn.addEventListener('click', () => {
            window.closeModal(btn.dataset.close);
        });
    });

    // 6. Manual Sync Button
    const btnSync = document.getElementById('btnManualSync');
    if (btnSync) {
        btnSync.addEventListener('click', async () => {
            await window.apiService.syncPendingData();
            await window.apiService.fetchAllDataFromCloud();
        });
    }

    // 7. Add Customer Button from Header/View
    const btnAddCustModal = document.getElementById('btnAddCustomerModal');
    if (btnAddCustModal) {
        btnAddCustModal.addEventListener('click', () => {
            document.getElementById('customerForm')?.reset();
            document.getElementById('custFormId').value = '';
            document.getElementById('modalCustomerTitle').textContent = 'Add New Customer';
            window.openModal('modalCustomer');
        });
    }

    // 8. Admin Settings & Account Profile Modal
    const btnAdminSettings = document.getElementById('btnAdminSettings');
    if (btnAdminSettings) {
        btnAdminSettings.addEventListener('click', () => {
            const user = window.authManager.getUser();
            if (user) {
                const fullNameInput = document.getElementById('adminFullName');
                if (fullNameInput) fullNameInput.value = user.fullName || user.username || '';
                document.getElementById('adminUsername').value = user.username || '';
                document.getElementById('adminEmail').value = user.email || '';
            }
            document.getElementById('adminNewPassword').value = '';
            document.getElementById('settingApiUrl').value = localStorage.getItem('blademaster_api_url') || '';
            window.openModal('modalSettings');
        });
    }

    const adminProfileForm = document.getElementById('adminProfileForm');
    if (adminProfileForm) {
        adminProfileForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = document.getElementById('btnSaveAdminProfile');
            if (submitBtn) submitBtn.disabled = true;

            try {
                const fullName = document.getElementById('adminFullName')?.value.trim() || '';
                const username = document.getElementById('adminUsername').value.trim();
                const email = document.getElementById('adminEmail').value.trim();
                const newPassword = document.getElementById('adminNewPassword').value;

                const res = await window.authManager.updateAdminProfile(username, email, newPassword, fullName);
                if (res.success) {
                    window.showToast(res.message || 'Admin profile saved successfully!', 'success');
                    window.closeModal('modalSettings');
                    
                    const userBadge = document.getElementById('currentUserBadge');
                    const currentUser = window.authManager.getUser();
                    if (userBadge && currentUser) {
                        userBadge.textContent = currentUser.username || 'Owner';
                    }

                    // Reload dashboard view to update Welcome message with Full Name
                    if (window.dashboardModule) {
                        await window.dashboardModule.init();
                    }
                } else {
                    window.showToast(res.message || 'Failed to update admin profile.', 'error');
                }
            } catch (err) {
                console.error('[App] Error saving admin profile:', err);
                window.showToast(`Error updating admin profile: ${err.message}`, 'error');
            } finally {
                if (submitBtn) submitBtn.disabled = false;
            }
        });
    }

    const apiConfigForm = document.getElementById('apiConfigForm');
    if (apiConfigForm) {
        apiConfigForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const url = document.getElementById('settingApiUrl').value.trim();
            window.apiService.setApiUrl(url);
            window.showToast('Google Apps Script API URL saved successfully!', 'success');
            window.closeModal('modalSettings');
            window.apiService.updateSyncUI();

            if (url && navigator.onLine) {
                await window.apiService.syncPendingData();
                await window.apiService.fetchAllDataFromCloud();
            }
        });
    }

    // 9. Register Service Worker for PWA Mobile Installation & Offline Caching
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js')
                .then(reg => console.log('[PWA] Service Worker registered:', reg.scope))
                .catch(err => console.warn('[PWA] Service Worker registration failed:', err));
        });
    }

    // 10. Check Auth Session
    checkAuthSession();
});

function checkAuthSession() {
    const authContainer = document.getElementById('authContainer');
    const appContainer = document.getElementById('appContainer');
    const userBadge = document.getElementById('currentUserBadge');

    if (window.authManager.isAuthenticated()) {
        authContainer.classList.add('hidden');
        appContainer.classList.remove('hidden');

        const user = window.authManager.getUser();
        if (userBadge) userBadge.textContent = user.role || 'Owner';

        // Load modules & network sync state
        window.customerModule.init();
        if (window.vendorsModule) window.vendorsModule.init();
        if (window.expensesModule) window.expensesModule.init();
        window.billingModule.init();
        window.ledgerModule.init();
        window.reportsModule.init();
        window.dashboardModule.init();
        window.apiService.updateSyncUI();

        // Run sync & restore check on launch
        if (window.apiService.apiUrl && navigator.onLine) {
            window.apiService.syncPendingData().then(() => {
                window.apiService.fetchAllDataFromCloud();
            });
        }
    } else {
        authContainer.classList.remove('hidden');
        appContainer.classList.add('hidden');
    }
}

function bindAuthEvents() {
    const loginForm = document.getElementById('loginForm');
    const forgotForm = document.getElementById('forgotForm');
    const resetOtpForm = document.getElementById('resetOtpForm');
    const btnShowForgot = document.getElementById('btnShowForgot');
    const backBtns = document.querySelectorAll('.btn-back-login');
    const btnLogout = document.getElementById('btnLogout');

    // Switch to Forgot Password Form
    if (btnShowForgot) {
        btnShowForgot.addEventListener('click', () => {
            loginForm.classList.remove('active');
            forgotForm.classList.add('active');
            resetOtpForm.classList.remove('active');
        });
    }

    // Switch back to Login Form
    backBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            loginForm.classList.add('active');
            forgotForm.classList.remove('active');
            resetOtpForm.classList.remove('active');
        });
    });

    // Login Submission
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('loginUsername').value.trim();
            const password = document.getElementById('loginPassword').value;

            const res = await window.authManager.login(username, password);
            if (res.success) {
                window.showToast(`Welcome back, ${res.user.username}!`, 'success');
                checkAuthSession();
            } else {
                window.showToast(res.message, 'error');
            }
        });
    }

    // Forgot Password Step 1: Send OTP
    if (forgotForm) {
        forgotForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('forgotEmail').value.trim();
            const res = await window.authManager.sendForgotOtp(email);

            if (res.success) {
                window.showToast(res.message, 'success');
                forgotForm.classList.remove('active');
                resetOtpForm.classList.add('active');
            } else {
                window.showToast(res.message, 'error');
            }
        });
    }

    // Forgot Password Step 2: Verify & Reset
    if (resetOtpForm) {
        resetOtpForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('forgotEmail').value.trim();
            const otp = document.getElementById('otpCode').value.trim();
            const newPassword = document.getElementById('newPassword').value;

            const res = await window.authManager.verifyOtpAndReset(email, otp, newPassword);
            if (res.success) {
                window.showToast(res.message, 'success');
                resetOtpForm.classList.remove('active');
                loginForm.classList.add('active');
            } else {
                window.showToast(res.message, 'error');
            }
        });
    }

    // Logout
    if (btnLogout) {
        btnLogout.addEventListener('click', () => {
            window.authManager.logout();
        });
    }
}
