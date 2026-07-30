/**
 * Blade Master - API & Sync Manager
 * Bridges Frontend PWA with Google Apps Script Web App backend and handles offline queue sync.
 */

class ApiService {
    constructor() {
        // Read stored Google Apps Script Web App URL or default placeholder
        this.apiUrl = localStorage.getItem('blademaster_api_url') || '';
        this.isOnline = navigator.onLine;

        this.initListeners();
    }

    setApiUrl(url) {
        this.apiUrl = (url || '').trim();
        localStorage.setItem('blademaster_api_url', this.apiUrl);
    }

    initListeners() {
        window.addEventListener('online', () => {
            this.isOnline = true;
            this.updateSyncUI();
            this.syncPendingData();
        });

        window.addEventListener('offline', () => {
            this.isOnline = false;
            this.updateSyncUI();
        });
    }

    updateSyncUI() {
        const indicator = document.getElementById('syncIndicator');
        const text = document.getElementById('syncText');
        
        if (indicator && text) {
            if (this.isOnline) {
                indicator.className = 'sync-indicator online';
                text.textContent = 'Online';
            } else {
                indicator.className = 'sync-indicator offline';
                text.textContent = 'Offline';
            }
        }
        this.refreshPendingBadgeCount();
    }

    async refreshPendingBadgeCount() {
        const badge = document.getElementById('pendingSyncCount');
        if (!badge) return;
        try {
            const pendingItems = await window.db.getPendingSyncItems();
            if (pendingItems && pendingItems.length > 0) {
                badge.textContent = pendingItems.length;
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
        } catch (e) {
            console.error('Failed to get pending items count:', e);
        }
    }

    // Generic HTTP POST request to Apps Script API
    async request(action, payload = {}) {
        const requestData = {
            action: action,
            ...payload
        };

        if (!this.isOnline) {
            console.warn('[API] App is offline. Action queued/simulated locally:', action);
            return { success: false, offline: true, error: 'App is running in offline mode.', message: 'App is running in offline mode.' };
        }

        if (!this.apiUrl) {
            console.warn('[API] Google Apps Script URL not configured in settings. Action queued/simulated locally:', action);
            return { success: false, offline: true, error: 'Google Apps Script Web App URL is not configured.', message: 'Google Apps Script Web App URL is not configured in Admin Settings.' };
        }

        try {
            const response = await fetch(this.apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // Apps Script CORS friendly
                body: JSON.stringify(requestData)
            });

            if (!response.ok) {
                throw new Error(`HTTP Error ${response.status}: ${response.statusText}`);
            }

            const rawText = await response.text();
            let data;
            try {
                data = JSON.parse(rawText);
            } catch (jsonErr) {
                console.error('[API] Non-JSON response from Google Apps Script:', rawText);
                throw new Error('Google Apps Script returned an invalid response (HTML page). Please verify Web App deployment settings ("Execute as: Me", "Who has access: Anyone").');
            }
            return data;
        } catch (error) {
            console.error(`[API] Error executing ${action}:`, error);
            return { success: false, offline: true, error: error.message, message: error.message };
        }
    }

    // Sync all pending records in IndexedDB with Google Sheets Backend
    async syncPendingData() {
        if (this.isSyncing) {
            console.log('[Sync] Sync process already running, skipping concurrent call.');
            return;
        }

        if (!this.isOnline) {
            window.showToast('App is offline. Sync postponed.', 'warning');
            return;
        }

        if (!this.apiUrl) {
            console.log('[Sync] Apps Script URL not configured yet. Records stored locally.');
            return;
        }

        const pendingItems = await window.db.getPendingSyncItems();
        if (!pendingItems || pendingItems.length === 0) {
            this.refreshPendingBadgeCount();
            return;
        }

        this.isSyncing = true;
        window.showToast(`Syncing ${pendingItems.length} pending record(s)...`, 'info');

        let syncedCount = 0;
        try {
            for (const item of pendingItems) {
                try {
                    const res = await this.request('SYNC_RECORD', {
                        entityType: item.entityType,
                        actionType: item.action,
                        recordData: item.payload
                    });

                    if (res && res.success) {
                        // Remove from queue and mark local record as SYNCED
                        await window.db.removeSyncQueueItem(item.queueId);
                        
                        if (item.entityType === 'customer') {
                            item.payload.syncStatus = 'SYNCED';
                            await window.db.put('customers', item.payload);
                        } else if (item.entityType === 'bill') {
                            item.payload.syncStatus = 'SYNCED';
                            await window.db.put('bills', item.payload);
                        } else if (item.entityType === 'payment') {
                            item.payload.syncStatus = 'SYNCED';
                            await window.db.put('payments', item.payload);
                        } else if (item.entityType === 'transaction') {
                            item.payload.syncStatus = 'SYNCED';
                            await window.db.put('transactions', item.payload);
                        } else if (item.entityType === 'vendor') {
                            item.payload.syncStatus = 'SYNCED';
                            await window.db.put('vendors', item.payload);
                        } else if (item.entityType === 'vendor_transaction') {
                            item.payload.syncStatus = 'SYNCED';
                            await window.db.put('vendor_transactions', item.payload);
                        } else if (item.entityType === 'business_expense' || item.entityType === 'expense') {
                            item.payload.syncStatus = 'SYNCED';
                            await window.db.put('business_expenses', item.payload);
                        }

                        syncedCount++;
                    }
                } catch (err) {
                    console.error('[Sync] Item sync failed:', item, err);
                }
            }
        } finally {
            this.isSyncing = false;
        }

        this.refreshPendingBadgeCount();
        if (syncedCount > 0) {
            window.showToast(`Successfully synced ${syncedCount} record(s) to Google Sheets!`, 'success');
            // Reload active view data
            if (window.appRouter) window.appRouter.reloadCurrentView();
        }
    }

    // Fetch all records (Customers, Bills, Payments, Transactions, Vendors, Business Expenses) from Google Sheets into local IndexedDB
    async fetchAllDataFromCloud() {
        if (!this.isOnline) {
            console.log('[API] Cannot fetch from cloud: offline.');
            window.showToast('App is offline. Local database is active.', 'warning');
            return { success: false, message: 'App is offline.' };
        }

        if (!this.apiUrl) {
            console.log('[API] Cannot fetch from cloud: API URL not set.');
            window.showToast('Google Apps Script URL is not configured. Please set it in Admin Settings.', 'warning');
            return { success: false, message: 'API URL not configured.' };
        }

        try {
            window.showToast('Connecting to Google Sheets & restoring database records...', 'info');
            const res = await this.request('FETCH_ALL_DATA');
            
            if (res && res.success && res.data) {
                const { customers, bills, payments, transactions, vendors, vendorTransactions, businessExpenses, adminProfile } = res.data;
                let restoredCount = 0;

                // Update Admin Profile / Full Name from Google Sheet if provided
                if (adminProfile && window.authManager) {
                    const currentLocal = JSON.parse(localStorage.getItem('blademaster_admin_profile') || '{}');
                    const updated = {
                        ...currentLocal,
                        id: adminProfile.id || currentLocal.id || 'USR-00001',
                        username: adminProfile.username || currentLocal.username || 'owner',
                        fullName: adminProfile.fullName || currentLocal.fullName || adminProfile.username || 'Owner Name',
                        email: adminProfile.email || currentLocal.email || 'business@gmail.com',
                        role: adminProfile.role || currentLocal.role || 'Owner'
                    };
                    window.authManager.currentUser = updated;
                    localStorage.setItem('blademaster_admin_profile', JSON.stringify(updated));
                    localStorage.setItem('blademaster_session', JSON.stringify(updated));
                }

                const custMap = {};

                // 1. Restore Customers
                if (customers && Array.isArray(customers)) {
                    for (const cust of customers) {
                        if (!cust.id) continue;
                        if (cust.name) custMap[cust.id] = cust.name;

                        const existing = await window.db.get('customers', cust.id);
                        if (!existing || existing.syncStatus !== 'PENDING_SYNC') {
                            cust.syncStatus = 'SYNCED';
                            await window.db.put('customers', cust);
                            restoredCount++;
                        }
                    }
                }

                // 2. Restore Bills
                if (bills && Array.isArray(bills)) {
                    for (const bill of bills) {
                        if (!bill.id) continue;
                        if ((!bill.customerName || bill.customerName.trim() === '') && bill.customerId && custMap[bill.customerId]) {
                            bill.customerName = custMap[bill.customerId];
                        }
                        const existing = await window.db.get('bills', bill.id);
                        if (!existing || existing.syncStatus !== 'PENDING_SYNC') {
                            bill.syncStatus = 'SYNCED';
                            await window.db.put('bills', bill);
                            restoredCount++;
                        }
                    }
                }

                // 3. Restore Payments
                if (payments && Array.isArray(payments)) {
                    for (const pay of payments) {
                        if (!pay.id) continue;
                        if ((!pay.customerName || pay.customerName.trim() === '') && pay.customerId && custMap[pay.customerId]) {
                            pay.customerName = custMap[pay.customerId];
                        }
                        const existing = await window.db.get('payments', pay.id);
                        if (!existing || existing.syncStatus !== 'PENDING_SYNC') {
                            pay.syncStatus = 'SYNCED';
                            await window.db.put('payments', pay);
                            restoredCount++;
                        }
                    }
                }

                // 4. Restore Transactions
                if (transactions && Array.isArray(transactions)) {
                    for (const txn of transactions) {
                        if (!txn.id) continue;
                        if ((!txn.customerName || txn.customerName.trim() === '') && txn.customerId && custMap[txn.customerId]) {
                            txn.customerName = custMap[txn.customerId];
                        }
                        const existing = await window.db.get('transactions', txn.id);
                        if (!existing || existing.syncStatus !== 'PENDING_SYNC') {
                            txn.syncStatus = 'SYNCED';
                            await window.db.put('transactions', txn);
                            restoredCount++;
                        }
                    }
                }

                // 5. Restore Vendors
                if (vendors && Array.isArray(vendors)) {
                    for (const vnd of vendors) {
                        if (!vnd.id) continue;
                        const existing = await window.db.get('vendors', vnd.id);
                        
                        // Preserve type if existing locally or if cloud returned a valid vendorType
                        const vType = vnd.type || vnd.vendorType || (existing ? (existing.type || existing.vendorType) : 'WELDING');
                        vnd.type = vType;
                        vnd.vendorType = vType;

                        if (!existing || existing.syncStatus !== 'PENDING_SYNC') {
                            vnd.syncStatus = 'SYNCED';
                            await window.db.put('vendors', vnd);
                            restoredCount++;
                        }
                    }
                }

                // 6. Restore Vendor Transactions
                if (vendorTransactions && Array.isArray(vendorTransactions)) {
                    for (const vTxn of vendorTransactions) {
                        if (!vTxn.id) continue;
                        const existing = await window.db.get('vendor_transactions', vTxn.id);
                        const vtType = vTxn.vendorType || vTxn.type || (existing ? (existing.vendorType || existing.type) : '');
                        if (vtType) {
                            vTxn.vendorType = vtType;
                            vTxn.type = vtType;
                        }

                        if (!existing || existing.syncStatus !== 'PENDING_SYNC') {
                            vTxn.syncStatus = 'SYNCED';
                            await window.db.put('vendor_transactions', vTxn);
                            restoredCount++;
                        }
                    }
                }

                // 7. Restore Business Expenses
                if (businessExpenses && Array.isArray(businessExpenses)) {
                    for (const exp of businessExpenses) {
                        if (!exp.id) continue;
                        const existing = await window.db.get('business_expenses', exp.id);
                        if (!existing || existing.syncStatus !== 'PENDING_SYNC') {
                            exp.syncStatus = 'SYNCED';
                            await window.db.put('business_expenses', exp);
                            restoredCount++;
                        }
                    }
                }

                // Refresh UI views across all modules
                if (window.vendorsModule) await window.vendorsModule.loadVendors();
                if (window.expensesModule) await window.expensesModule.loadExpenses();
                if (window.customerModule) await window.customerModule.loadCustomers();
                if (window.ledgerModule) await window.ledgerModule.loadLedger();
                if (window.reportsModule) {
                    window.reportsModule.init();
                    await window.reportsModule.renderActiveReport();
                }
                if (window.dashboardModule) await window.dashboardModule.init();

                const totalInCloud = (customers?.length || 0) + (bills?.length || 0) + (payments?.length || 0) + (transactions?.length || 0) + (vendors?.length || 0) + (vendorTransactions?.length || 0) + (businessExpenses?.length || 0);
                if (restoredCount > 0) {
                    window.showToast(`Fetched ${totalInCloud} record(s) from Google Sheets (${restoredCount} updated locally)!`, 'success');
                } else {
                    window.showToast(`Fetched ${totalInCloud} record(s) from Google Sheets. Local database is up to date.`, 'info');
                }

                return { success: true, count: restoredCount };
            } else {
                const errorMsg = res?.message || res?.error || 'Failed to fetch data from Google Sheets.';
                window.showToast(errorMsg, 'warning');
                return { success: false, message: errorMsg };
            }
        } catch (err) {
            console.error('[API] Error restoring data from cloud:', err);
            window.showToast(`Error connecting to Google Sheets: ${err.message}`, 'error');
            return { success: false, error: err.message };
        }
    }

    // ID Generators for Offline & Local Records
    generateCustomerId() {
        const randomHex = Math.floor(Math.random() * 90000 + 10000);
        return `CUS-${randomHex}`;
    }

    generateBillId() {
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const randomNum = Math.floor(Math.random() * 900 + 100);
        return `BILL-${dateStr}-${randomNum}`;
    }

    generateTxnId() {
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const randomNum = Math.floor(Math.random() * 900 + 100);
        return `TXN-${dateStr}-${randomNum}`;
    }

    generatePaymentId() {
        const now = new Date();
        const dd = String(now.getDate()).padStart(2, '0');
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const yyyy = now.getFullYear();
        const randomNum = Math.floor(Math.random() * 900 + 100);
        return `PAY-${dd}${mm}${yyyy}-${randomNum}`;
    }

    generateVendorId() {
        const randomHex = Math.floor(Math.random() * 90000 + 10000);
        return `VND-${randomHex}`;
    }

    generateVendorTxnId() {
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const randomNum = Math.floor(Math.random() * 900 + 100);
        return `VTXN-${dateStr}-${randomNum}`;
    }

    generateExpenseId() {
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const randomNum = Math.floor(Math.random() * 900 + 100);
        return `EXP-${dateStr}-${randomNum}`;
    }
}

window.apiService = new ApiService();
