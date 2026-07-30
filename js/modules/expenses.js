/**
 * Blade Master - Business Expenses Management Module
 * Manages operating business expenses (Shop Rent, Electricity Bill, Tool Purchase, Other),
 * handles conditional form fields, offline persistence, and backend sync.
 */

class ExpensesModule {
    constructor() {
        this.expenses = [];
        this.activeCategoryFilter = 'ALL';
        this.isSaving = false;
        this.initialized = false;
    }

    async init() {
        if (!this.initialized) {
            this.bindEvents();
            this.initialized = true;
        }
        this.initDefaultDate();
        await this.loadExpenses();
    }

    initDefaultDate() {
        const dateInput = document.getElementById('expFormDate');
        if (dateInput && !dateInput.value) {
            dateInput.value = new Date().toISOString().slice(0, 10);
        }
    }

    // Load Business Expenses from IndexedDB
    async loadExpenses() {
        try {
            this.expenses = (await window.db.getAll('business_expenses')) || [];
            this.filterAndRenderExpenses();
            this.updateExpensesSummary();
        } catch (e) {
            console.error('[ExpensesModule] Error loading business expenses:', e);
            this.expenses = [];
            this.filterAndRenderExpenses();
        }
    }

    bindEvents() {
        // Category Filter Tabs
        const categoryTabs = document.getElementById('expenseCategoryTabs');
        if (categoryTabs) {
            categoryTabs.addEventListener('click', (e) => {
                const btn = e.target.closest('.report-tab');
                if (!btn) return;

                categoryTabs.querySelectorAll('.report-tab').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                this.activeCategoryFilter = btn.dataset.category || 'ALL';
                this.filterAndRenderExpenses();
            });
        }

        // Search Input
        const searchInput = document.getElementById('expenseSearchInput');
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                this.filterAndRenderExpenses();
            });
        }

        // Open Add Expense Modal
        const btnAddExpense = document.getElementById('btnOpenAddExpenseModal');
        if (btnAddExpense) {
            btnAddExpense.addEventListener('click', () => {
                this.openAddExpenseModal();
            });
        }

        // Category change listener for conditional Description field
        const categorySelect = document.getElementById('expFormCategory');
        if (categorySelect) {
            categorySelect.addEventListener('change', (e) => {
                this.toggleDescriptionField(e.target.value);
            });
        }

        // Add/Edit Expense Form Submission
        const expenseForm = document.getElementById('expenseForm');
        if (expenseForm) {
            expenseForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.handleSaveExpense();
            });
        }
    }

    // Toggle description field based on selected category:
    // Required / visible for 'Tool Purchase' and 'Other'
    toggleDescriptionField(category) {
        const descGroup = document.getElementById('expFormDescriptionGroup');
        const descInput = document.getElementById('expFormDescription');

        if (!descGroup) return;

        if (category === 'Tool Purchase' || category === 'Other') {
            descGroup.classList.remove('hidden');
            if (descInput) {
                descInput.placeholder = category === 'Tool Purchase' ? 'e.g. Angle Grinder, Cutting Disc' : 'e.g. Office Stationery, Miscellaneous';
            }
        } else {
            descGroup.classList.add('hidden');
            if (descInput) descInput.value = '';
        }
    }

    openAddExpenseModal() {
        const form = document.getElementById('expenseForm');
        if (form) form.reset();

        const idInput = document.getElementById('expFormId');
        if (idInput) idInput.value = '';

        const dateInput = document.getElementById('expFormDate');
        if (dateInput) dateInput.value = new Date().toISOString().slice(0, 10);

        const categorySelect = document.getElementById('expFormCategory');
        if (categorySelect) {
            categorySelect.value = (this.activeCategoryFilter && this.activeCategoryFilter !== 'ALL') ? this.activeCategoryFilter : 'Shop Rent';
            this.toggleDescriptionField(categorySelect.value);
        }

        const title = document.getElementById('modalExpenseTitle');
        if (title) title.textContent = 'Record Business Expense';

        window.openModal('modalExpense');
    }

    openEditExpenseModal(expenseId) {
        const expense = this.expenses.find(e => e.id === expenseId);
        if (!expense) return;

        const idInput = document.getElementById('expFormId');
        if (idInput) idInput.value = expense.id;

        const dateInput = document.getElementById('expFormDate');
        if (dateInput) {
            const d = new Date(expense.date);
            dateInput.value = isNaN(d.getTime()) ? expense.date.slice(0, 10) : d.toISOString().slice(0, 10);
        }

        const categorySelect = document.getElementById('expFormCategory');
        if (categorySelect) {
            categorySelect.value = expense.category || 'Other';
            this.toggleDescriptionField(categorySelect.value);
        }

        const amountInput = document.getElementById('expFormAmount');
        if (amountInput) amountInput.value = expense.amount || 0;

        const descInput = document.getElementById('expFormDescription');
        if (descInput) descInput.value = expense.description || '';

        const title = document.getElementById('modalExpenseTitle');
        if (title) title.textContent = 'Edit Business Expense';

        window.openModal('modalExpense');
    }

    // Save Expense (Create / Edit)
    async handleSaveExpense() {
        if (this.isSaving) return;
        this.isSaving = true;

        const form = document.getElementById('expenseForm');
        const submitBtn = form ? form.querySelector('button[type="submit"]') : null;

        try {
            if (submitBtn) submitBtn.disabled = true;

            const idInput = document.getElementById('expFormId');
            const dateInput = document.getElementById('expFormDate');
            const categorySelect = document.getElementById('expFormCategory');
            const amountInput = document.getElementById('expFormAmount');
            const descInput = document.getElementById('expFormDescription');

            const isEdit = Boolean(idInput.value);
            const expenseId = isEdit ? idInput.value : window.apiService.generateExpenseId();

            const dateVal = dateInput.value;
            const categoryVal = categorySelect.value;
            const amountVal = Number(amountInput.value || 0);
            const descVal = descInput ? descInput.value.trim() : '';

            if (amountVal <= 0) {
                window.showToast('Please enter a valid expense amount.', 'warning');
                return;
            }

            const expenseRecord = {
                id: expenseId,
                date: dateVal,
                category: categoryVal,
                amount: amountVal,
                description: descVal,
                createdDate: new Date().toISOString(),
                syncStatus: 'PENDING_SYNC'
            };

            // 1. Save to local IndexedDB
            await window.db.put('business_expenses', expenseRecord);

            // 2. Add to Sync Queue
            await window.db.addToSyncQueue('business_expense', isEdit ? 'UPDATE' : 'CREATE', expenseRecord);

            if (form) form.reset();
            window.closeModal('modalExpense');
            window.showToast(`Business Expense (₹${amountVal.toLocaleString('en-IN')}) saved successfully!`, 'success');

            // 3. Refresh views
            await this.loadExpenses();
            if (window.dashboardModule) await window.dashboardModule.loadStats();
            if (window.reportsModule) await window.reportsModule.renderActiveReport();
            window.apiService.syncPendingData();
        } catch (err) {
            console.error('[ExpensesModule] Error saving business expense:', err);
            window.showToast('Failed to save expense. Please try again.', 'error');
        } finally {
            this.isSaving = false;
            if (submitBtn) submitBtn.disabled = false;
        }
    }

    // Delete Business Expense
    async handleDeleteExpense(expenseId) {
        if (!confirm('Are you sure you want to delete this business expense record?')) return;

        try {
            await window.db.delete('business_expenses', expenseId);
            window.showToast('Expense record deleted successfully.', 'info');

            await this.loadExpenses();
            if (window.dashboardModule) await window.dashboardModule.loadStats();
            if (window.reportsModule) await window.reportsModule.renderActiveReport();
        } catch (err) {
            console.error('[ExpensesModule] Error deleting expense:', err);
            window.showToast('Failed to delete expense record.', 'error');
        }
    }

    // Summary Metric Cards Calculation
    updateExpensesSummary() {
        let total = 0;
        let rent = 0;
        let electricity = 0;
        let tools = 0;
        let other = 0;

        this.expenses.forEach(e => {
            const amt = Number(e.amount || 0);
            total += amt;
            if (e.category === 'Shop Rent') rent += amt;
            else if (e.category === 'Electricity Bill') electricity += amt;
            else if (e.category === 'Tool Purchase') tools += amt;
            else other += amt;
        });

        this.setElText('expSummaryTotal', `₹${total.toLocaleString('en-IN')}`);
        this.setElText('expSummaryRent', `₹${rent.toLocaleString('en-IN')}`);
        this.setElText('expSummaryElectricity', `₹${electricity.toLocaleString('en-IN')}`);
        this.setElText('expSummaryToolsOther', `₹${(tools + other).toLocaleString('en-IN')}`);
    }

    filterAndRenderExpenses() {
        const query = (document.getElementById('expenseSearchInput')?.value || '').toLowerCase().trim();

        let filtered = this.expenses.filter(e => {
            const matchesCategory = this.activeCategoryFilter === 'ALL' || e.category === this.activeCategoryFilter;

            const matchesSearch = !query ||
                e.category.toLowerCase().includes(query) ||
                (e.description && e.description.toLowerCase().includes(query)) ||
                (e.date && e.date.toLowerCase().includes(query)) ||
                String(e.amount).includes(query);

            return matchesCategory && matchesSearch;
        });

        filtered.sort((a, b) => new Date(b.date) - new Date(a.date));
        this.renderExpenseList(filtered);
    }

    renderExpenseList(list) {
        const tbody = document.getElementById('expensesTableBody');
        if (!tbody) return;

        if (!list || list.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="empty-state">No business expenses found. <button type="button" class="btn btn-sm btn-primary" style="margin-left:8px;" onclick="window.expensesModule.openAddExpenseModal()">+ Record Expense</button></td></tr>`;
            return;
        }

        tbody.innerHTML = list.map(exp => {
            const categoryBadgeClass = this.getCategoryBadgeClass(exp.category);
            const formattedDate = new Date(exp.date).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });

            return `
                <tr>
                    <td><strong>${formattedDate}</strong></td>
                    <td><span class="badge ${categoryBadgeClass}">${this.escapeHtml(exp.category)}</span></td>
                    <td class="text-warning"><strong>₹${Number(exp.amount || 0).toLocaleString('en-IN')}</strong></td>
                    <td>${this.escapeHtml(exp.description || '-')}</td>
                    <td>
                        <span class="sync-badge ${exp.syncStatus === 'SYNCED' ? 'synced' : 'pending'}">
                            ${exp.syncStatus === 'SYNCED' ? 'Synced ✅' : 'Pending Sync ⏳'}
                        </span>
                    </td>
                    <td>
                        <div style="display:flex; gap:0.4rem;">
                            <button class="btn btn-secondary btn-sm btn-exp-edit" data-id="${exp.id}">Edit</button>
                            <button class="btn btn-outline btn-sm btn-exp-delete" data-id="${exp.id}" style="color:var(--danger-color); border-color:rgba(239,68,68,0.4);">Delete</button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        // Attach event handlers
        tbody.querySelectorAll('.btn-exp-edit').forEach(btn => {
            btn.addEventListener('click', () => this.openEditExpenseModal(btn.dataset.id));
        });

        tbody.querySelectorAll('.btn-exp-delete').forEach(btn => {
            btn.addEventListener('click', () => this.handleDeleteExpense(btn.dataset.id));
        });
    }

    getCategoryBadgeClass(category) {
        switch (category) {
            case 'Shop Rent':
                return 'welding';
            case 'Electricity Bill':
                return 'grinding';
            case 'Tool Purchase':
                return 'newblade';
            default:
                return 'secondary';
        }
    }

    setElText(id, text) {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    }

    escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
}

window.expensesModule = new ExpensesModule();
window.expenseModule = window.expensesModule; // Singular alias

// Global direct helper functions
window.openAddExpenseModal = function() {
    if (window.expensesModule) {
        window.expensesModule.openAddExpenseModal();
    }
};
window.openExpenseModal = window.openAddExpenseModal;
