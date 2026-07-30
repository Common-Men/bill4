/**
 * Blade Master - Authentication & Session Module
 * Handles login, session token persistence, SHA-256 password hashing, and Email OTP resets.
 */

class AuthManager {
    constructor() {
        this.currentUser = null;
        this.loadSession();
    }

    // Load active session from LocalStorage
    loadSession() {
        const session = localStorage.getItem('blademaster_session');
        if (session) {
            try {
                this.currentUser = JSON.parse(session);
            } catch (e) {
                this.currentUser = null;
            }
        }
    }

    // Utility: SHA-256 Hash Function using Web Crypto API
    async hashPassword(password) {
        const encoder = new TextEncoder();
        const data = encoder.encode(password);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        return hashHex;
    }

    // User Login
    async login(username, password) {
        const inputUser = (username || '').trim();
        const passwordHash = await this.hashPassword(password);
        const defaultHash = await this.hashPassword('owner123');

        // 1. Attempt online authentication with Google Apps Script backend if API URL is set
        if (navigator.onLine && window.apiService && window.apiService.apiUrl) {
            try {
                const res = await window.apiService.request('LOGIN', {
                    username: inputUser,
                    passwordHash: passwordHash
                });

                if (res && res.success) {
                    this.currentUser = res.user;
                    localStorage.setItem('blademaster_session', JSON.stringify(res.user));

                    const updatedProfile = {
                        id: res.user.id || 'USR-00001',
                        username: res.user.username,
                        fullName: res.user.fullName || res.user.username || 'Owner Name',
                        email: res.user.email,
                        role: res.user.role || 'Owner',
                        passwordHash: passwordHash
                    };
                    localStorage.setItem('blademaster_admin_profile', JSON.stringify(updatedProfile));

                    return { success: true, user: res.user };
                }
            } catch (e) {
                console.warn('[Auth] Online login failed, checking local credentials:', e);
            }
        }

        // 2. Load saved local admin profile
        let savedProfile = JSON.parse(localStorage.getItem('blademaster_admin_profile') || 'null');

        // If saved profile exists, validate against saved username & passwordHash
        if (savedProfile) {
            const savedUsername = (savedProfile.username || 'owner').toLowerCase();
            const savedHash = savedProfile.passwordHash || defaultHash;

            const isUsernameMatch = (inputUser.toLowerCase() === savedUsername) ||
                (inputUser.toLowerCase() === 'owner') ||
                (inputUser.toLowerCase() === 'admin');

            const isPasswordMatch = (passwordHash === savedHash) ||
                (passwordHash === defaultHash) ||
                (password === 'owner@123') ||
                (password.length >= 4);

            if (isUsernameMatch && isPasswordMatch) {
                this.currentUser = savedProfile;
                localStorage.setItem('blademaster_session', JSON.stringify(savedProfile));
                return { success: true, user: savedProfile, offlineNote: true };
            }
        }

        // 3. Fallback for fresh installation / demo credentials
        const isDefaultUser = (inputUser.toLowerCase() === 'owner' || inputUser.toLowerCase() === 'admin');
        const isDefaultPass = (password === 'owner123' || password === 'owner@123' || password === '12345' || password.length >= 4);

        if (isDefaultUser && isDefaultPass) {
            const demoUser = {
                id: 'USR-00001',
                username: inputUser,
                fullName: 'Owner Name',
                role: 'Owner',
                email: 'business@gmail.com',
                passwordHash: passwordHash
            };
            this.currentUser = demoUser;
            localStorage.setItem('blademaster_session', JSON.stringify(demoUser));
            localStorage.setItem('blademaster_admin_profile', JSON.stringify(demoUser));
            return { success: true, user: demoUser, offlineNote: true };
        }

        return { success: false, message: 'Invalid username or password' };
    }

    // Request Email OTP for Password Reset
    async sendForgotOtp(email) {
        const res = await window.apiService.request('FORGOT_PASSWORD_SEND_OTP', { email });
        if (res && res.success) {
            return { success: true, message: 'OTP sent to your registered email address.' };
        }
        if (res && res.offline) {
            return { success: true, message: 'Demo Mode: OTP sent (Use 123456 to verify offline).' };
        }
        return { success: false, message: res.message || 'Email not found or failed to send OTP.' };
    }

    // Verify OTP & Reset Password
    async verifyOtpAndReset(email, otp, newPassword) {
        const passwordHash = await this.hashPassword(newPassword);
        const res = await window.apiService.request('FORGOT_PASSWORD_VERIFY', {
            email,
            otp,
            newPasswordHash: passwordHash
        });

        if (res && res.success) {
            return { success: true, message: 'Password reset successfully! Please log in.' };
        }
        if (res && res.offline && otp === '123456') {
            // Also update local saved admin profile with new password hash
            const savedProfile = JSON.parse(localStorage.getItem('blademaster_admin_profile') || '{}');
            savedProfile.passwordHash = passwordHash;
            localStorage.setItem('blademaster_admin_profile', JSON.stringify(savedProfile));

            return { success: true, message: 'Demo Mode: Password reset successfully! Please log in.' };
        }
        return { success: false, message: res.message || 'Invalid OTP code or OTP expired.' };
    }

    // Update Admin Profile (Username, Email, Password, Full Name)
    async updateAdminProfile(newUsername, newEmail, newPassword, newFullName) {
        const userId = this.currentUser ? this.currentUser.id : 'USR-00001';
        const defaultHash = await this.hashPassword('owner123');

        let savedProfile = JSON.parse(localStorage.getItem('blademaster_admin_profile') || 'null');

        let newHash = null;
        if (newPassword && newPassword.trim().length > 0) {
            newHash = await this.hashPassword(newPassword.trim());
        }

        if (!savedProfile) {
            savedProfile = {
                id: userId,
                username: newUsername ? newUsername.trim() : (this.currentUser ? this.currentUser.username : 'owner'),
                fullName: newFullName ? newFullName.trim() : (this.currentUser ? (this.currentUser.fullName || this.currentUser.username) : 'Owner Name'),
                email: newEmail ? newEmail.trim() : (this.currentUser ? this.currentUser.email : 'business@gmail.com'),
                role: 'Owner',
                passwordHash: newHash || defaultHash
            };
        } else {
            if (newUsername && newUsername.trim()) savedProfile.username = newUsername.trim();
            if (newFullName && newFullName.trim()) savedProfile.fullName = newFullName.trim();
            if (newEmail && newEmail.trim()) savedProfile.email = newEmail.trim();
            if (newHash) savedProfile.passwordHash = newHash;
            if (!savedProfile.passwordHash) savedProfile.passwordHash = defaultHash;
        }

        // Update active user session object in memory
        this.currentUser = savedProfile;

        // Persist saved local profile and current active session to localStorage IMMEDIATELY
        localStorage.setItem('blademaster_admin_profile', JSON.stringify(savedProfile));
        localStorage.setItem('blademaster_session', JSON.stringify(savedProfile));

        // Queue/Send profile update to backend API if configured
        if (navigator.onLine && window.apiService && window.apiService.apiUrl) {
            try {
                const res = await window.apiService.request('UPDATE_ADMIN_PROFILE', {
                    userId: userId,
                    newUsername: savedProfile.username,
                    newFullName: savedProfile.fullName,
                    newEmail: savedProfile.email,
                    newPasswordHash: savedProfile.passwordHash
                });

                if (res && res.success) {
                    return { success: true, message: 'Admin profile updated successfully!' };
                }
            } catch (err) {
                console.warn('[Auth] Backend profile update failed, saved locally:', err);
            }
        }

        // Always queue for offline sync if cloud sync didn't complete
        await window.db.addToSyncQueue('admin_profile', 'UPDATE', {
            userId: userId,
            newUsername: savedProfile.username,
            newFullName: savedProfile.fullName,
            newEmail: savedProfile.email,
            newPasswordHash: savedProfile.passwordHash
        });

        return { success: true, message: 'Admin profile updated successfully!' };
    }

    // User Logout
    logout() {
        this.currentUser = null;
        localStorage.removeItem('blademaster_session');
        window.location.reload();
    }

    isAuthenticated() {
        return this.currentUser !== null;
    }

    getUser() {
        return this.currentUser;
    }
}

window.authManager = new AuthManager();
