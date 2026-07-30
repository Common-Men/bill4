/**
 * Blade Master - Customer Management Module
 * Handles customer CRUD, local IndexedDB persistence, search filtering, and history views.
 */

class CustomerModule {
    constructor() {
        this.customers = [];
        this.isSaving = false;
    }

    async init() {
        await this.loadCustomers();
        this.bindEvents();
    }

    // Load customers from IndexedDB
    async loadCustomers() {
        try {
            this.customers = await window.db.getAll('customers');
            this.renderCustomerList(this.customers);
            this.populateCustomerDropdowns();
        } catch (e) {
            console.error('[CustomerModule] Error loading customers:', e);
        }
    }

    bindEvents() {
        // Search Input
        const searchInput = document.getElementById('customerSearchInput');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                const query = e.target.value.toLowerCase().trim();
                const filtered = this.customers.filter(c => 
                    c.name.toLowerCase().includes(query) || 
                    c.mobile.includes(query) ||
                    (c.address && c.address.toLowerCase().includes(query))
                );
                this.renderCustomerList(filtered);
            });
        }

        // Add/Edit Form Submission
        const form = document.getElementById('customerForm');
        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.handleSaveCustomer();
            });
        }
    }

    // Render Customer Cards List
    renderCustomerList(list) {
        const container = document.getElementById('customerList');
        if (!container) return;

        if (!list || list.length === 0) {
            container.innerHTML = `<div class="empty-state">No customers found. Click "Add Customer" to create one.</div>`;
            return;
        }

        container.innerHTML = list.map(cust => {
            const currentBal = Number(cust.currentBalance || 0);
            const balClass = currentBal > 0 ? 'text-warning' : (currentBal < 0 ? 'text-success' : 'text-accent');
            const balLabel = currentBal > 0 ? 'Udhar (Owes You)' : (currentBal < 0 ? 'Advance Credit' : 'Clear');

            return `
                <div class="cust-card">
                    <div class="cust-card-header">
                        <div>
                            <div class="cust-name">${this.escapeHtml(cust.name)}</div>
                            <div class="cust-id">${cust.id}</div>
                        </div>
                        <span class="sync-badge ${cust.syncStatus === 'SYNCED' ? 'synced' : 'pending'}">
                            ${cust.syncStatus === 'SYNCED' ? 'Synced ✅' : 'Pending Sync ⏳'}
                        </span>
                    </div>

                    <div class="cust-mobile">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                        <span>${cust.mobile}</span>
                    </div>

                    ${cust.address ? `<div class="cust-mobile" style="font-size:0.8rem; color:var(--text-dim);">${this.escapeHtml(cust.address)}</div>` : ''}

                    <div class="cust-bal-box">
                        <span>Balance (${balLabel}):</span>
                        <span class="cust-bal-amount ${balClass}">₹${Math.abs(currentBal)}</span>
                    </div>

                    <div class="cust-card-actions">
                        <button class="btn btn-secondary btn-cust-history" data-id="${cust.id}">
                            History
                        </button>
                        <button class="btn btn-primary btn-cust-newbill" data-id="${cust.id}">
                            + New Bill
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        // Attach action listeners
        container.querySelectorAll('.btn-cust-history').forEach(btn => {
            btn.addEventListener('click', () => this.showCustomerHistoryModal(btn.dataset.id));
        });

        container.querySelectorAll('.btn-cust-newbill').forEach(btn => {
            btn.addEventListener('click', () => {
                if (window.billingModule) {
                    window.billingModule.selectCustomer(btn.dataset.id);
                    window.appRouter.navigateTo('viewBilling');
                }
            });
        });
    }

    // Save Customer Form Submission
    async handleSaveCustomer() {
        if (this.isSaving) return;
        this.isSaving = true;

        const form = document.getElementById('customerForm');
        const submitBtn = form ? form.querySelector('button[type="submit"]') : null;

        try {
            if (submitBtn) submitBtn.disabled = true;

            const idInput = document.getElementById('custFormId');
            const nameInput = document.getElementById('custFormName');
            const mobileInput = document.getElementById('custFormMobile');
            const addressInput = document.getElementById('custFormAddress');
            const openingBalInput = document.getElementById('custFormOpeningBal');

            const isEdit = Boolean(idInput.value);
            const custId = isEdit ? idInput.value : window.apiService.generateCustomerId();
            const openingBal = Number(openingBalInput.value || 0);

            const customerRecord = {
                id: custId,
                name: nameInput.value.trim(),
                mobile: mobileInput.value.trim(),
                address: addressInput.value.trim(),
                openingBalance: openingBal,
                currentBalance: isEdit ? (this.customers.find(c => c.id === custId)?.currentBalance || openingBal) : openingBal,
                status: 'ACTIVE',
                createdDate: new Date().toISOString(),
                syncStatus: 'PENDING_SYNC'
            };

            // 1. Save to local IndexedDB
            await window.db.put('customers', customerRecord);

            // 2. Add to Sync Queue
            await window.db.addToSyncQueue('customer', isEdit ? 'UPDATE' : 'CREATE', customerRecord);

            // If creating a new customer with an opening balance > 0, record an initial ledger transaction
            if (!isEdit && openingBal > 0) {
                const initTxn = {
                    id: window.apiService.generateTxnId(),
                    customerId: custId,
                    customerName: customerRecord.name,
                    date: customerRecord.createdDate,
                    description: 'Opening Udhar Balance',
                    debit: openingBal,
                    credit: 0,
                    balance: openingBal,
                    syncStatus: 'PENDING_SYNC'
                };
                await window.db.put('transactions', initTxn);
                await window.db.addToSyncQueue('transaction', 'CREATE', initTxn);
            }

            // 3. Close modal & reload UI
            if (form) form.reset();
            window.closeModal('modalCustomer');
            window.showToast(`Customer ${customerRecord.name} saved successfully!`, 'success');
            
            await this.loadCustomers();
            if (window.dashboardModule) await window.dashboardModule.loadStats();
            window.apiService.syncPendingData();
        } catch (err) {
            console.error('[CustomerModule] Error saving customer:', err);
            window.showToast('Failed to save customer. Please try again.', 'error');
        } finally {
            this.isSaving = false;
            if (submitBtn) submitBtn.disabled = false;
        }
    }

    // Populate dropdowns across Billing and Payment modals
    populateCustomerDropdowns() {
        const billSelect = document.getElementById('billCustomerSelect');
        const paySelect = document.getElementById('payCustomerSelect');
        const filterSelect = document.getElementById('ledgerCustomerFilter');

        const optionsHtml = `<option value="">-- Select Customer --</option>` + 
            this.customers.map(c => `<option value="${c.id}">${this.escapeHtml(c.name)} (${c.mobile})</option>`).join('');

        if (billSelect) billSelect.innerHTML = optionsHtml;
        if (paySelect) paySelect.innerHTML = optionsHtml;
        if (filterSelect) {
            filterSelect.innerHTML = `<option value="">All Customers</option>` + 
                this.customers.map(c => `<option value="${c.id}">${this.escapeHtml(c.name)}</option>`).join('');
        }
    }

    // Display Customer History Modal
    async showCustomerHistoryModal(customerId) {
        const cust = this.customers.find(c => c.id === customerId);
        if (!cust) return;

        document.getElementById('custHistoryTitle').textContent = `${cust.name} - Ledger History`;
        document.getElementById('custHistoryMobile').textContent = `Mobile: ${cust.mobile}`;
        document.getElementById('custHistoryBalance').textContent = `Current Udhar Balance: ₹${cust.currentBalance || 0}`;

        const transactions = await window.db.getAll('transactions');
        const custTxns = transactions.filter(t => t.customerId === customerId).sort((a, b) => new Date(b.date) - new Date(a.date));

        const tbody = document.getElementById('custHistoryTableBody');
        if (!custTxns || custTxns.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="empty-state">No transaction history found for this customer.</td></tr>`;
        } else {
            tbody.innerHTML = custTxns.map(t => `
                <tr>
                    <td>${new Date(t.date).toLocaleDateString()}</td>
                    <td><strong>${t.description}</strong><br><small style="color:var(--text-dim);">${t.id}</small></td>
                    <td class="text-warning">${t.debit > 0 ? '+ ₹' + t.debit : '-'}</td>
                    <td class="text-success">${t.credit > 0 ? '- ₹' + t.credit : '-'}</td>
                    <td><strong>₹${t.balance}</strong></td>
                </tr>
            `).join('');
        }

        window.openModal('modalCustHistory');
    }

    escapeHtml(str) {
        return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
}

window.customerModule = new CustomerModule();
