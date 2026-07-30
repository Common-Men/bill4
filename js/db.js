/**
 * Blade Master - IndexedDB Local Database Engine
 * Handles offline persistence for Customers, Bills, Transactions, Payments, and Sync Queue.
 */

const DB_NAME = 'BladeMasterDB';
const DB_VERSION = 5;

class IndexedDBStorage {
    constructor() {
        this.db = null;
    }

    // Initialize IndexedDB Database and Object Stores
    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = (event) => {
                console.error('[IndexedDB] Database error:', event.target.error);
                reject(event.target.error);
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                console.log('[IndexedDB] Database connected successfully.');
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // 1. Customers Store
                if (!db.objectStoreNames.contains('customers')) {
                    const custStore = db.createObjectStore('customers', { keyPath: 'id' });
                    custStore.createIndex('mobile', 'mobile', { unique: false });
                    custStore.createIndex('name', 'name', { unique: false });
                    custStore.createIndex('syncStatus', 'syncStatus', { unique: false });
                }

                // 2. Bills Store
                if (!db.objectStoreNames.contains('bills')) {
                    const billStore = db.createObjectStore('bills', { keyPath: 'id' });
                    billStore.createIndex('customerId', 'customerId', { unique: false });
                    billStore.createIndex('date', 'date', { unique: false });
                    billStore.createIndex('syncStatus', 'syncStatus', { unique: false });
                }

                // 3. Transactions Store
                if (!db.objectStoreNames.contains('transactions')) {
                    const txnStore = db.createObjectStore('transactions', { keyPath: 'id' });
                    txnStore.createIndex('customerId', 'customerId', { unique: false });
                    txnStore.createIndex('date', 'date', { unique: false });
                    txnStore.createIndex('syncStatus', 'syncStatus', { unique: false });
                }

                // 4. Payments Store
                if (!db.objectStoreNames.contains('payments')) {
                    const payStore = db.createObjectStore('payments', { keyPath: 'id' });
                    payStore.createIndex('customerId', 'customerId', { unique: false });
                    payStore.createIndex('date', 'date', { unique: false });
                    payStore.createIndex('syncStatus', 'syncStatus', { unique: false });
                }

                // 5. Vendors Store (Welding Partners / Blade Suppliers)
                let vndStore;
                if (!db.objectStoreNames.contains('vendors')) {
                    vndStore = db.createObjectStore('vendors', { keyPath: 'id' });
                    vndStore.createIndex('name', 'name', { unique: false });
                    vndStore.createIndex('mobile', 'mobile', { unique: false });
                    vndStore.createIndex('syncStatus', 'syncStatus', { unique: false });
                    vndStore.createIndex('type', 'type', { unique: false });
                } else {
                    vndStore = event.target.transaction.objectStore('vendors');
                    if (!vndStore.indexNames.contains('type')) {
                        vndStore.createIndex('type', 'type', { unique: false });
                    }
                }

                // 6. Vendor Transactions Store (Outsourced Welding Jobs / Blade Purchases / Vendor Settlement)
                if (!db.objectStoreNames.contains('vendor_transactions')) {
                    const vTxnStore = db.createObjectStore('vendor_transactions', { keyPath: 'id' });
                    vTxnStore.createIndex('vendorId', 'vendorId', { unique: false });
                    vTxnStore.createIndex('date', 'date', { unique: false });
                    vTxnStore.createIndex('syncStatus', 'syncStatus', { unique: false });
                }

                // 7. Business Expenses Store (Shop Rent, Electricity, Tool Purchase, Other)
                if (!db.objectStoreNames.contains('business_expenses')) {
                    const bExpStore = db.createObjectStore('business_expenses', { keyPath: 'id' });
                    bExpStore.createIndex('date', 'date', { unique: false });
                    bExpStore.createIndex('category', 'category', { unique: false });
                    bExpStore.createIndex('syncStatus', 'syncStatus', { unique: false });
                }

                // 8. Offline Sync Queue Store
                if (!db.objectStoreNames.contains('sync_queue')) {
                    const syncStore = db.createObjectStore('sync_queue', { keyPath: 'queueId', autoIncrement: true });
                    syncStore.createIndex('status', 'status', { unique: false });
                    syncStore.createIndex('timestamp', 'timestamp', { unique: false });
                }
            };
        });
    }

    // Generic helper for transaction execution
    async _getStore(storeName, mode = 'readonly') {
        if (!this.db) await this.init();
        const tx = this.db.transaction(storeName, mode);
        return tx.objectStore(storeName);
    }

    // Save or Update Record
    async put(storeName, data) {
        const store = await this._getStore(storeName, 'readwrite');
        return new Promise((resolve, reject) => {
            const req = store.put(data);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    // Bulk Save Records
    async putAll(storeName, items) {
        const store = await this._getStore(storeName, 'readwrite');
        return Promise.all(items.map(item => {
            return new Promise((resolve, reject) => {
                const req = store.put(item);
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            });
        }));
    }

    // Get Single Record by Key
    async get(storeName, key) {
        const store = await this._getStore(storeName, 'readonly');
        return new Promise((resolve, reject) => {
            const req = store.get(key);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    // Get All Records from Store
    async getAll(storeName) {
        const store = await this._getStore(storeName, 'readonly');
        return new Promise((resolve, reject) => {
            const req = store.getAll();
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    // Delete Record by Key
    async delete(storeName, key) {
        const store = await this._getStore(storeName, 'readwrite');
        return new Promise((resolve, reject) => {
            const req = store.delete(key);
            req.onsuccess = () => resolve(true);
            req.onerror = () => reject(req.error);
        });
    }

    // Clear Store
    async clear(storeName) {
        const store = await this._getStore(storeName, 'readwrite');
        return new Promise((resolve, reject) => {
            const req = store.clear();
            req.onsuccess = () => resolve(true);
            req.onerror = () => reject(req.error);
        });
    }

    // Add Action to Sync Queue (with deduplication by record ID)
    async addToSyncQueue(entityType, action, payload) {
        const store = await this._getStore('sync_queue', 'readwrite');
        return new Promise((resolve, reject) => {
            const getAllReq = store.getAll();
            getAllReq.onsuccess = () => {
                const items = getAllReq.result || [];
                const existing = items.find(i => i.entityType === entityType && i.payload && i.payload.id === payload.id);
                if (existing) {
                    existing.action = action;
                    existing.payload = payload;
                    existing.timestamp = new Date().toISOString();
                    const putReq = store.put(existing);
                    putReq.onsuccess = () => resolve(putReq.result);
                    putReq.onerror = () => reject(putReq.error);
                } else {
                    const queueItem = {
                        entityType: entityType, // 'customer', 'bill', 'payment', 'transaction'
                        action: action,         // 'CREATE', 'UPDATE'
                        payload: payload,
                        timestamp: new Date().toISOString(),
                        status: 'PENDING_SYNC',
                        attempts: 0
                    };
                    const addReq = store.add(queueItem);
                    addReq.onsuccess = () => resolve(addReq.result);
                    addReq.onerror = () => reject(addReq.error);
                }
            };
            getAllReq.onerror = () => reject(getAllReq.error);
        });
    }

    // Get Pending Items in Sync Queue
    async getPendingSyncItems() {
        const store = await this._getStore('sync_queue', 'readonly');
        return new Promise((resolve, reject) => {
            const req = store.getAll();
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    // Remove Item from Sync Queue
    async removeSyncQueueItem(queueId) {
        return this.delete('sync_queue', queueId);
    }
}

// Global Singleton Instance
window.db = new IndexedDBStorage();
