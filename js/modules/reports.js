/**
 * Blade Master - Business Reports & Analytics Module
 * Supports 6 distinct report views:
 * 1. Daily Report (Selected Date's Revenue, Expense, Profit & Activity)
 * 2. Monthly Report (Selected Month's Revenue, Expense, Profit & Breakdown)
 * 3. Yearly Report (Yearly Income/Expense Breakdown + 12-Month Performance Table)
 * 4. Custom Date Range Report (Revenue, Expense, Profit & Statement)
 * 5. Customer Report (Customer Billed Sales, Payments & Service Breakdown)
 * 6. Vendor Report (Vendor-wise Blades Welded, Costs, Payments & Pending Balances)
 */

class ReportsModule {
    constructor() {
        this.activeTab = 'daily';
    }

    async init() {
        this.initDefaultDates();
        await this.populateDropdowns();
        this.bindEvents();
        await this.renderActiveReport();
    }

    initDefaultDates() {
        const todayStr = new Date().toISOString().slice(0, 10);
        const monthStr = new Date().toISOString().slice(0, 7);
        const currentYear = new Date().getFullYear().toString();
        const firstDayOfMonth = `${monthStr}-01`;

        // Daily Date Picker
        const dailyDatePicker = document.getElementById('reportDailyDate');
        if (dailyDatePicker && !dailyDatePicker.value) dailyDatePicker.value = todayStr;

        // Monthly Picker
        const monthlyPicker = document.getElementById('reportMonthlyMonth');
        if (monthlyPicker && !monthlyPicker.value) monthlyPicker.value = monthStr;

        // Yearly Picker
        const yearlyPicker = document.getElementById('reportYearlyYear');
        if (yearlyPicker && !yearlyPicker.value) yearlyPicker.value = currentYear;

        // Custom Range Pickers
        const customStart = document.getElementById('reportCustomStartDate');
        const customEnd = document.getElementById('reportCustomEndDate');
        if (customStart && !customStart.value) customStart.value = firstDayOfMonth;
        if (customEnd && !customEnd.value) customEnd.value = todayStr;

        // Customer Report Pickers
        const custStart = document.getElementById('reportCustStartDate');
        const custEnd = document.getElementById('reportCustEndDate');
        if (custStart && !custStart.value) custStart.value = firstDayOfMonth;
        if (custEnd && !custEnd.value) custEnd.value = todayStr;

        // Vendor Report Pickers
        const vndStart = document.getElementById('reportVendorStartDate');
        const vndEnd = document.getElementById('reportVendorEndDate');
        if (vndStart && !vndStart.value) vndStart.value = firstDayOfMonth;
        if (vndEnd && !vndEnd.value) vndEnd.value = todayStr;
    }

    async populateDropdowns() {
        // 1. Customer Dropdown
        const custSelect = document.getElementById('reportCustomerSelect');
        if (custSelect) {
            const currentVal = custSelect.value;
            const customers = await window.db.getAll('customers');
            let html = '<option value="">All Customers</option>';
            customers.sort((a, b) => (a.name || '').localeCompare(b.name || '')).forEach(c => {
                html += `<option value="${c.id}">${this.escapeHtml(c.name)} (${c.mobile || ''})</option>`;
            });
            custSelect.innerHTML = html;
            if (currentVal) custSelect.value = currentVal;
        }

        // 2. Vendor Dropdown
        const vndSelect = document.getElementById('reportVendorSelect');
        const vndCategorySelect = document.getElementById('reportVendorCategorySelect');
        if (vndSelect) {
            const currentVal = vndSelect.value;
            const catFilter = vndCategorySelect?.value || '';
            let vendors = await window.db.getAll('vendors');

            if (catFilter) {
                vendors = vendors.filter(v => (v.type || 'WELDING') === catFilter);
            }

            let html = '<option value="">All Vendors</option>';
            vendors.sort((a, b) => (a.name || '').localeCompare(b.name || '')).forEach(v => {
                const labelType = v.type === 'BLADE_SUPPLIER' ? 'Blade Supplier' : 'Welding Vendor';
                html += `<option value="${v.id}">${this.escapeHtml(v.name)} (${labelType})</option>`;
            });
            vndSelect.innerHTML = html;
            if (currentVal) vndSelect.value = currentVal;
        }
    }

    bindEvents() {
        // Tab switching
        const tabs = document.querySelectorAll('.report-tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                const tabBtn = e.target.closest('.report-tab');
                if (!tabBtn) return;
                const target = tabBtn.dataset.report;
                
                tabs.forEach(t => t.classList.remove('active'));
                tabBtn.classList.add('active');

                document.querySelectorAll('.report-panel').forEach(p => p.classList.remove('active'));
                const panelId = `report${target.charAt(0).toUpperCase() + target.slice(1)}`;
                const panel = document.getElementById(panelId);
                if (panel) panel.classList.add('active');

                this.activeTab = target;
                this.renderActiveReport();
            });
        });

        // Daily Filters
        document.getElementById('reportDailyDate')?.addEventListener('change', () => this.generateDailyReport());

        // Monthly Filters
        document.getElementById('reportMonthlyMonth')?.addEventListener('change', () => this.generateMonthlyReport());

        // Yearly Filters
        document.getElementById('reportYearlyYear')?.addEventListener('change', () => this.generateYearlyReport());

        // Toggle Yearly 12-Month Summary Table
        document.getElementById('btnToggleYearlySummary')?.addEventListener('click', () => {
            const tableContainer = document.getElementById('yearlySummaryTableContainer');
            if (tableContainer) {
                tableContainer.classList.toggle('hidden');
            }
        });

        // Custom Statement Filters
        document.getElementById('btnApplyCustomReport')?.addEventListener('click', () => this.generateCustomReport());

        // Customer Report Controls
        document.getElementById('reportCustomerSelect')?.addEventListener('change', () => this.generateCustomerReport());
        document.getElementById('reportCustStartDate')?.addEventListener('change', () => this.generateCustomerReport());
        document.getElementById('reportCustEndDate')?.addEventListener('change', () => this.generateCustomerReport());
        document.getElementById('btnApplyCustomerReport')?.addEventListener('click', () => this.generateCustomerReport());

        // Vendor Report Controls
        document.getElementById('reportVendorCategorySelect')?.addEventListener('change', async () => {
            await this.populateDropdowns();
            await this.generateVendorReport();
        });
        document.getElementById('reportVendorSelect')?.addEventListener('change', () => this.generateVendorReport());
        document.getElementById('reportVendorStartDate')?.addEventListener('change', () => this.generateVendorReport());
        document.getElementById('reportVendorEndDate')?.addEventListener('change', () => this.generateVendorReport());
        document.getElementById('btnApplyVendorReport')?.addEventListener('click', () => this.generateVendorReport());

        // Print Button
        document.getElementById('btnPrintReport')?.addEventListener('click', () => window.print());
    }

    async renderActiveReport() {
        switch (this.activeTab) {
            case 'daily':
                await this.generateDailyReport();
                break;
            case 'monthly':
                await this.generateMonthlyReport();
                break;
            case 'yearly':
                await this.generateYearlyReport();
                break;
            case 'custom':
                await this.generateCustomReport();
                break;
            case 'customer':
                await this.populateDropdowns();
                await this.generateCustomerReport();
                break;
            case 'vendor':
                await this.populateDropdowns();
                await this.generateVendorReport();
                break;
        }
    }

    setElText(id, text) {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    }

    calculateFinancialMetrics(billsList = [], vendorTxnsList = [], bizExpensesList = []) {
        let totalRevenue = 0;
        let grindingRev = 0;
        let weldingRev = 0;
        let newBladeRev = 0;

        const billsWithVendorTxn = new Set();
        vendorTxnsList.forEach(vt => {
            if (vt.billId) {
                billsWithVendorTxn.add(String(vt.billId));
            }
        });

        let unlinkedBillWeldCost = 0;

        billsList.forEach(b => {
            totalRevenue += Number(b.totalAmount || 0);
            if (Array.isArray(b.services)) {
                b.services.forEach(s => {
                    const name = (s.name || '').toLowerCase();
                    const tot = Number(s.total || 0);
                    const vCost = Number(s.vendorTotalCost || 0);

                    if (name.includes('grind')) {
                        grindingRev += tot;
                    } else if (name.includes('weld')) {
                        weldingRev += tot;
                        if (!billsWithVendorTxn.has(String(b.id))) {
                            unlinkedBillWeldCost += vCost;
                        }
                    } else {
                        newBladeRev += tot;
                    }
                });
            }
        });

        const totalVendorTxnCosts = vendorTxnsList.reduce((sum, vt) => sum + Number(vt.totalCost || 0), 0);
        
        let shopRent = 0, electricity = 0, toolsOther = 0;
        bizExpensesList.forEach(e => {
            const amt = Number(e.amount || 0);
            if (e.category === 'Shop Rent') shopRent += amt;
            else if (e.category === 'Electricity Bill') electricity += amt;
            else toolsOther += amt;
        });
        const totalBizExpenses = shopRent + electricity + toolsOther;

        const vendorExpenses = totalVendorTxnCosts + unlinkedBillWeldCost;
        const totalExpenses = vendorExpenses + totalBizExpenses;
        const netProfit = totalRevenue - totalExpenses;

        return {
            totalRevenue,
            totalExpenses,
            vendorExpenses,
            bizExpenses: totalBizExpenses,
            shopRent,
            electricity,
            toolsOther,
            netProfit,
            grindingRev,
            weldingRev,
            weldingExp: vendorExpenses,
            weldingProfit: weldingRev - vendorExpenses,
            newBladeRev
        };
    }

    // ==========================================
    // 1. DAILY REPORT
    // ==========================================
    async generateDailyReport() {
        const selectedDateStr = document.getElementById('reportDailyDate')?.value || new Date().toISOString().slice(0, 10);

        const bills = await window.db.getAll('bills');
        const payments = await window.db.getAll('payments');
        const vTxns = await window.db.getAll('vendor_transactions');
        const bizExpenses = await window.db.getAll('business_expenses');

        const dailyBills = bills.filter(b => {
            if (!b.date) return false;
            const bd = new Date(b.date);
            const bStr = `${bd.getFullYear()}-${String(bd.getMonth() + 1).padStart(2, '0')}-${String(bd.getDate()).padStart(2, '0')}`;
            return bStr === selectedDateStr;
        });

        const dailyPayments = payments.filter(p => {
            if (!p.paymentDate) return false;
            const pd = new Date(p.paymentDate);
            const pStr = `${pd.getFullYear()}-${String(pd.getMonth() + 1).padStart(2, '0')}-${String(pd.getDate()).padStart(2, '0')}`;
            return pStr === selectedDateStr;
        });

        const dailyVTxns = vTxns.filter(v => {
            if (!v.date) return false;
            const vd = new Date(v.date);
            const vStr = `${vd.getFullYear()}-${String(vd.getMonth() + 1).padStart(2, '0')}-${String(vd.getDate()).padStart(2, '0')}`;
            return vStr === selectedDateStr;
        });

        const dailyBizExpenses = bizExpenses.filter(e => {
            if (!e.date) return false;
            const ed = new Date(e.date);
            const eStr = `${ed.getFullYear()}-${String(ed.getMonth() + 1).padStart(2, '0')}-${String(ed.getDate()).padStart(2, '0')}`;
            return eStr === selectedDateStr;
        });

        const fin = this.calculateFinancialMetrics(dailyBills, dailyVTxns, dailyBizExpenses);
        const totalCollection = dailyPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
        const totalPending = Math.max(0, fin.totalRevenue - totalCollection);

        // UI Updates
        this.setElText('repDailySales', `₹${fin.totalRevenue.toLocaleString('en-IN')}`);
        this.setElText('repDailyCollection', `₹${totalCollection.toLocaleString('en-IN')}`);
        this.setElText('repDailyExpense', `₹${fin.totalExpenses.toLocaleString('en-IN')}`);
        this.setElText('repDailyProfit', `₹${fin.netProfit.toLocaleString('en-IN')}`);
        this.setElText('repDailyPending', `₹${totalPending.toLocaleString('en-IN')}`);
        this.setElText('repDailyBillCount', dailyBills.length);

        this.setElText('repDailyGrinding', `₹${fin.grindingRev.toLocaleString('en-IN')}`);
        this.setElText('repDailyWelding', `₹${fin.weldingRev.toLocaleString('en-IN')}`);
        this.setElText('repDailyNewBlade', `₹${fin.newBladeRev.toLocaleString('en-IN')}`);

        this.setElText('repDailyRent', `₹${fin.shopRent.toLocaleString('en-IN')}`);
        this.setElText('repDailyElectricity', `₹${fin.electricity.toLocaleString('en-IN')}`);
        this.setElText('repDailyToolsOther', `₹${fin.toolsOther.toLocaleString('en-IN')}`);

        // Render Today's Activity Log
        const tbody = document.getElementById('reportDailyTableBody');
        if (tbody) {
            const logItems = [
                ...dailyBills.map(b => ({
                    date: new Date(b.date),
                    type: 'Bill',
                    customer: b.customerName || 'Customer',
                    details: `Bill #${b.id} (${b.services ? b.services.length : 0} items)`,
                    amount: `+₹${Number(b.totalAmount || 0).toLocaleString('en-IN')}`,
                    isDebit: true
                })),
                ...dailyPayments.map(p => ({
                    date: new Date(p.paymentDate),
                    type: 'Payment',
                    customer: p.customerName || 'Customer',
                    details: `Mode: ${p.paymentMode || 'Cash'}`,
                    amount: `-₹${Number(p.amount || 0).toLocaleString('en-IN')}`,
                    isDebit: false
                }))
            ].sort((a, b) => b.date - a.date);

            if (logItems.length === 0) {
                tbody.innerHTML = `<tr><td colspan="5" class="empty-state">No transactions recorded for this date.</td></tr>`;
            } else {
                tbody.innerHTML = logItems.map(item => `
                    <tr>
                        <td>${item.date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</td>
                        <td><span class="badge ${item.isDebit ? 'welding' : 'newblade'}">${item.type}</span></td>
                        <td><strong>${this.escapeHtml(item.customer)}</strong></td>
                        <td>${this.escapeHtml(item.details)}</td>
                        <td class="${item.isDebit ? 'text-accent' : 'text-success'}"><strong>${item.amount}</strong></td>
                    </tr>
                `).join('');
            }
        }
    }

    // ==========================================
    // 2. MONTHLY REPORT
    // ==========================================
    async generateMonthlyReport() {
        const monthStr = document.getElementById('reportMonthlyMonth')?.value || new Date().toISOString().slice(0, 7);

        const bills = await window.db.getAll('bills');
        const payments = await window.db.getAll('payments');
        const vTxns = await window.db.getAll('vendor_transactions');
        const bizExpenses = await window.db.getAll('business_expenses');

        const monthlyBills = bills.filter(b => {
            if (!b.date) return false;
            const bd = new Date(b.date);
            const bStr = `${bd.getFullYear()}-${String(bd.getMonth() + 1).padStart(2, '0')}`;
            return bStr === monthStr;
        });

        const monthlyPayments = payments.filter(p => {
            if (!p.paymentDate) return false;
            const pd = new Date(p.paymentDate);
            const pStr = `${pd.getFullYear()}-${String(pd.getMonth() + 1).padStart(2, '0')}`;
            return pStr === monthStr;
        });

        const monthlyVTxns = vTxns.filter(v => {
            if (!v.date) return false;
            const vd = new Date(v.date);
            const vStr = `${vd.getFullYear()}-${String(vd.getMonth() + 1).padStart(2, '0')}`;
            return vStr === monthStr;
        });

        const monthlyBizExpenses = bizExpenses.filter(e => {
            if (!e.date) return false;
            const ed = new Date(e.date);
            const eStr = `${ed.getFullYear()}-${String(ed.getMonth() + 1).padStart(2, '0')}`;
            return eStr === monthStr;
        });

        const fin = this.calculateFinancialMetrics(monthlyBills, monthlyVTxns, monthlyBizExpenses);

        let cashColl = 0;
        let onlineColl = 0;
        monthlyPayments.forEach(p => {
            const amt = Number(p.amount || 0);
            if ((p.paymentMode || '').toLowerCase() === 'cash') cashColl += amt;
            else onlineColl += amt;
        });

        // UI Updates
        this.setElText('repMonthlyRevenue', `₹${fin.totalRevenue.toLocaleString('en-IN')}`);
        this.setElText('repMonthlyExpense', `₹${fin.totalExpenses.toLocaleString('en-IN')}`);
        this.setElText('repMonthlyProfit', `₹${fin.netProfit.toLocaleString('en-IN')}`);
        this.setElText('repMonthlyCash', `₹${cashColl.toLocaleString('en-IN')}`);
        this.setElText('repMonthlyOnline', `₹${onlineColl.toLocaleString('en-IN')}`);
        this.setElText('repMonthlyBillCount', monthlyBills.length);

        this.setElText('repMonthlyGrinding', `₹${fin.grindingRev.toLocaleString('en-IN')}`);
        this.setElText('repMonthlyWelding', `₹${fin.weldingRev.toLocaleString('en-IN')}`);
        this.setElText('repMonthlyNewBlade', `₹${fin.newBladeRev.toLocaleString('en-IN')}`);

        // Render Monthly Table Log
        const tbody = document.getElementById('reportMonthlyTableBody');
        if (tbody) {
            const logItems = [
                ...monthlyBills.map(b => ({
                    date: new Date(b.date),
                    type: 'Bill',
                    customer: b.customerName || 'Customer',
                    details: `Bill #${b.id}`,
                    amount: `+₹${Number(b.totalAmount || 0).toLocaleString('en-IN')}`,
                    isDebit: true
                })),
                ...monthlyPayments.map(p => ({
                    date: new Date(p.paymentDate),
                    type: 'Payment',
                    customer: p.customerName || 'Customer',
                    details: `Mode: ${p.paymentMode || 'Cash'}`,
                    amount: `-₹${Number(p.amount || 0).toLocaleString('en-IN')}`,
                    isDebit: false
                }))
            ].sort((a, b) => b.date - a.date);

            if (logItems.length === 0) {
                tbody.innerHTML = `<tr><td colspan="5" class="empty-state">No transactions recorded for this month.</td></tr>`;
            } else {
                tbody.innerHTML = logItems.map(item => `
                    <tr>
                        <td>${item.date.toLocaleDateString('en-IN')}</td>
                        <td><span class="badge ${item.isDebit ? 'welding' : 'newblade'}">${item.type}</span></td>
                        <td><strong>${this.escapeHtml(item.customer)}</strong></td>
                        <td>${this.escapeHtml(item.details)}</td>
                        <td class="${item.isDebit ? 'text-accent' : 'text-success'}"><strong>${item.amount}</strong></td>
                    </tr>
                `).join('');
            }
        }
    }

    // ==========================================
    // 3. YEARLY REPORT
    // ==========================================
    async generateYearlyReport() {
        const selectedYear = document.getElementById('reportYearlyYear')?.value || new Date().getFullYear().toString();

        const bills = await window.db.getAll('bills');
        const payments = await window.db.getAll('payments');
        const vTxns = await window.db.getAll('vendor_transactions');
        const bizExpenses = await window.db.getAll('business_expenses');

        const yearlyBills = bills.filter(b => b.date && new Date(b.date).getFullYear().toString() === selectedYear);
        const yearlyPayments = payments.filter(p => p.paymentDate && new Date(p.paymentDate).getFullYear().toString() === selectedYear);
        const yearlyVTxns = vTxns.filter(v => v.date && new Date(v.date).getFullYear().toString() === selectedYear);
        const yearlyBizExpenses = bizExpenses.filter(e => e.date && new Date(e.date).getFullYear().toString() === selectedYear);

        const fin = this.calculateFinancialMetrics(yearlyBills, yearlyVTxns, yearlyBizExpenses);
        const totalCollection = yearlyPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);

        this.setElText('repYearlyRevenue', `₹${fin.totalRevenue.toLocaleString('en-IN')}`);
        this.setElText('repYearlyExpense', `₹${fin.totalExpenses.toLocaleString('en-IN')}`);
        this.setElText('repYearlyProfit', `₹${fin.netProfit.toLocaleString('en-IN')}`);
        this.setElText('repYearlyCollection', `₹${totalCollection.toLocaleString('en-IN')}`);
        this.setElText('repYearlyBillCount', yearlyBills.length);
        this.setElText('repYearlyPaymentCount', yearlyPayments.length);

        this.setElText('repYearlyGrinding', `₹${fin.grindingRev.toLocaleString('en-IN')}`);
        this.setElText('repYearlyWelding', `₹${fin.weldingRev.toLocaleString('en-IN')}`);
        this.setElText('repYearlyNewBlade', `₹${fin.newBladeRev.toLocaleString('en-IN')}`);

        // 12-Month Performance Table Generator
        const tbody = document.getElementById('reportYearlyTableBody');
        if (tbody) {
            const monthNames = [
                'January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'
            ];

            const rows = monthNames.map((monthName, idx) => {
                const mBills = yearlyBills.filter(b => new Date(b.date).getMonth() === idx);
                const mPayments = yearlyPayments.filter(p => new Date(p.paymentDate).getMonth() === idx);
                const mVTxns = yearlyVTxns.filter(v => new Date(v.date).getMonth() === idx);
                const mBizExp = yearlyBizExpenses.filter(e => new Date(e.date).getMonth() === idx);

                const mFin = this.calculateFinancialMetrics(mBills, mVTxns, mBizExp);
                const mCollected = mPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);

                return `
                    <tr>
                        <td><strong>${monthName} ${selectedYear}</strong></td>
                        <td>₹${mFin.totalRevenue.toLocaleString('en-IN')}</td>
                        <td class="text-warning">₹${mFin.totalExpenses.toLocaleString('en-IN')}</td>
                        <td class="text-success">₹${mFin.netProfit.toLocaleString('en-IN')}</td>
                        <td>₹${mCollected.toLocaleString('en-IN')}</td>
                        <td>${mBills.length} bills</td>
                    </tr>
                `;
            });

            tbody.innerHTML = rows.join('');
        }
    }

    // ==========================================
    // 4. CUSTOM DATE RANGE REPORT
    // ==========================================
    async generateCustomReport() {
        const startVal = document.getElementById('reportCustomStartDate')?.value;
        const endVal = document.getElementById('reportCustomEndDate')?.value;

        if (!startVal || !endVal) {
            window.showToast('Please select both From Date and To Date.', 'warning');
            return;
        }

        const startDate = new Date(startVal);
        startDate.setHours(0, 0, 0, 0);

        const endDate = new Date(endVal);
        endDate.setHours(23, 59, 59, 999);

        if (startDate > endDate) {
            window.showToast('From Date cannot be after To Date.', 'error');
            return;
        }

        const bills = await window.db.getAll('bills');
        const payments = await window.db.getAll('payments');
        const vTxns = await window.db.getAll('vendor_transactions');
        const bizExpenses = await window.db.getAll('business_expenses');

        const customBills = bills.filter(b => {
            if (!b.date) return false;
            const d = new Date(b.date);
            return d >= startDate && d <= endDate;
        });

        const customPayments = payments.filter(p => {
            if (!p.paymentDate) return false;
            const d = new Date(p.paymentDate);
            return d >= startDate && d <= endDate;
        });

        const customVTxns = vTxns.filter(v => {
            if (!v.date) return false;
            const d = new Date(v.date);
            return d >= startDate && d <= endDate;
        });

        const customBizExpenses = bizExpenses.filter(e => {
            if (!e.date) return false;
            const d = new Date(e.date);
            return d >= startDate && d <= endDate;
        });

        const fin = this.calculateFinancialMetrics(customBills, customVTxns, customBizExpenses);
        const totalCollection = customPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);

        let cashColl = 0;
        let onlineColl = 0;
        customPayments.forEach(p => {
            const amt = Number(p.amount || 0);
            if ((p.paymentMode || '').toLowerCase() === 'cash') cashColl += amt;
            else onlineColl += amt;
        });

        this.setElText('repCustomSales', `₹${fin.totalRevenue.toLocaleString('en-IN')}`);
        this.setElText('repCustomCollection', `₹${totalCollection.toLocaleString('en-IN')}`);
        this.setElText('repCustomExpense', `₹${fin.totalExpenses.toLocaleString('en-IN')}`);
        this.setElText('repCustomProfit', `₹${fin.netProfit.toLocaleString('en-IN')}`);
        this.setElText('repCustomCash', `₹${cashColl.toLocaleString('en-IN')}`);
        this.setElText('repCustomOnline', `₹${onlineColl.toLocaleString('en-IN')}`);

        // Render Custom Log Table
        const tbody = document.getElementById('reportCustomTableBody');
        if (tbody) {
            const statementItems = [
                ...customBills.map(b => ({
                    date: new Date(b.date),
                    type: 'Bill',
                    customer: b.customerName || 'Customer',
                    details: `Bill #${b.id}`,
                    amount: `+₹${Number(b.totalAmount || 0).toLocaleString('en-IN')}`,
                    isDebit: true
                })),
                ...customPayments.map(p => ({
                    date: new Date(p.paymentDate),
                    type: 'Payment',
                    customer: p.customerName || 'Customer',
                    details: `Mode: ${p.paymentMode || 'Cash'}`,
                    amount: `-₹${Number(p.amount || 0).toLocaleString('en-IN')}`,
                    isDebit: false
                }))
            ].sort((a, b) => b.date - a.date);

            if (statementItems.length === 0) {
                tbody.innerHTML = `<tr><td colspan="5" class="empty-state">No bills or payments match your selected date range.</td></tr>`;
            } else {
                tbody.innerHTML = statementItems.map(item => `
                    <tr>
                        <td>${item.date.toLocaleDateString('en-IN')}</td>
                        <td><span class="badge ${item.isDebit ? 'welding' : 'newblade'}">${item.type}</span></td>
                        <td><strong>${this.escapeHtml(item.customer)}</strong></td>
                        <td>${this.escapeHtml(item.details)}</td>
                        <td class="${item.isDebit ? 'text-accent' : 'text-success'}"><strong>${item.amount}</strong></td>
                    </tr>
                `).join('');
            }
        }
    }

    // ==========================================
    // 5. DEDICATED CUSTOMER REPORT
    // ==========================================
    async generateCustomerReport() {
        const custSelect = document.getElementById('reportCustomerSelect');
        const selectedCustomerId = custSelect?.value;
        let selectedCustName = '';
        if (custSelect && custSelect.selectedIndex > 0) {
            const text = custSelect.options[custSelect.selectedIndex].text;
            selectedCustName = text.split(' (')[0].trim();
        }

        const startVal = document.getElementById('reportCustStartDate')?.value;
        const endVal = document.getElementById('reportCustEndDate')?.value;

        if (!startVal || !endVal) {
            window.showToast('Please select both From Date and To Date.', 'warning');
            return;
        }

        const startDate = new Date(startVal);
        startDate.setHours(0, 0, 0, 0);

        const endDate = new Date(endVal);
        endDate.setHours(23, 59, 59, 999);

        const bills = await window.db.getAll('bills');
        const payments = await window.db.getAll('payments');

        // Filter by Customer (by ID or Name) and Date Range
        const custBills = bills.filter(b => {
            if (!b.date) return false;
            const d = new Date(b.date);
            if (d < startDate || d > endDate) return false;

            if (selectedCustomerId) {
                const matchesId = b.customerId && String(b.customerId) === String(selectedCustomerId);
                const matchesName = b.customerName && selectedCustName && b.customerName.toLowerCase().trim() === selectedCustName.toLowerCase().trim();
                if (!matchesId && !matchesName) return false;
            }
            return true;
        });

        const custPayments = payments.filter(p => {
            if (!p.paymentDate) return false;
            const d = new Date(p.paymentDate);
            if (d < startDate || d > endDate) return false;

            if (selectedCustomerId) {
                const matchesId = p.customerId && String(p.customerId) === String(selectedCustomerId);
                const matchesName = p.customerName && selectedCustName && p.customerName.toLowerCase().trim() === selectedCustName.toLowerCase().trim();
                if (!matchesId && !matchesName) return false;
            }
            return true;
        });

        const totalBilled = custBills.reduce((sum, b) => sum + Number(b.totalAmount || 0), 0);
        const totalPaid = custPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
        const pendingBalance = Math.max(0, totalBilled - totalPaid);

        // Customer Service Income Breakdown
        let grinding = 0, welding = 0, newBlade = 0;
        custBills.forEach(b => {
            if (b.services && Array.isArray(b.services)) {
                b.services.forEach(s => {
                    const name = (s.name || '').toLowerCase();
                    const tot = Number(s.total || 0);
                    if (name.includes('grind')) grinding += tot;
                    else if (name.includes('weld')) welding += tot;
                    else newBlade += tot;
                });
            }
        });

        document.getElementById('repCustSales').textContent = `₹${totalBilled.toLocaleString('en-IN')}`;
        document.getElementById('repCustPaid').textContent = `₹${totalPaid.toLocaleString('en-IN')}`;
        document.getElementById('repCustBalance').textContent = `₹${pendingBalance.toLocaleString('en-IN')}`;

        document.getElementById('repCustGrinding').textContent = `₹${grinding.toLocaleString('en-IN')}`;
        document.getElementById('repCustWelding').textContent = `₹${welding.toLocaleString('en-IN')}`;
        document.getElementById('repCustNewBlade').textContent = `₹${newBlade.toLocaleString('en-IN')}`;

        // Render Customer Statement Table
        const tbody = document.getElementById('reportCustomerTableBody');
        if (tbody) {
            const statementItems = [
                ...custBills.map(b => ({
                    date: new Date(b.date),
                    type: 'Bill',
                    details: `Bill #${b.id || ''} (${b.customerName || 'Customer'})`,
                    amount: `+₹${Number(b.totalAmount || 0).toLocaleString('en-IN')}`,
                    isDebit: true
                })),
                ...custPayments.map(p => ({
                    date: new Date(p.paymentDate),
                    type: 'Payment',
                    details: `Mode: ${p.paymentMode || 'Cash'} (${p.customerName || 'Customer'})`,
                    amount: `-₹${Number(p.amount || 0).toLocaleString('en-IN')}`,
                    isDebit: false
                }))
            ].sort((a, b) => b.date - a.date);

            if (statementItems.length === 0) {
                tbody.innerHTML = `<tr><td colspan="4" class="empty-state">No bills or payments found for this customer within selected dates.</td></tr>`;
            } else {
                tbody.innerHTML = statementItems.map(item => `
                    <tr>
                        <td>${item.date.toLocaleDateString('en-IN')}</td>
                        <td><span class="badge ${item.isDebit ? 'welding' : 'newblade'}">${item.type}</span></td>
                        <td>${this.escapeHtml(item.details)}</td>
                        <td class="${item.isDebit ? 'text-accent' : 'text-success'}"><strong>${item.amount}</strong></td>
                    </tr>
                `).join('');
            }
        }
    }

    // ==========================================
    // 6. DEDICATED VENDOR REPORT (WELDING PARTNER / BLADE SUPPLIER)
    // ==========================================
    async generateVendorReport() {
        const catSelect = document.getElementById('reportVendorCategorySelect');
        const selectedCategory = catSelect?.value;

        const vndSelect = document.getElementById('reportVendorSelect');
        const selectedVendorId = vndSelect?.value;

        const startVal = document.getElementById('reportVendorStartDate')?.value;
        const endVal = document.getElementById('reportVendorEndDate')?.value;

        if (!startVal || !endVal) {
            window.showToast('Please select both From Date and To Date.', 'warning');
            return;
        }

        const startDate = new Date(startVal);
        startDate.setHours(0, 0, 0, 0);

        const endDate = new Date(endVal);
        endDate.setHours(23, 59, 59, 999);

        const vendors = await window.db.getAll('vendors');
        const vendorTypeMap = {};
        vendors.forEach(v => {
            if (v.id) vendorTypeMap[v.id] = v.type || 'WELDING';
        });

        const vTxns = await window.db.getAll('vendor_transactions');

        // Filter vendor transactions by Category, Vendor ID, and Date Range
        const filteredTxns = vTxns.filter(v => {
            if (!v.date) return false;
            const d = new Date(v.date);
            if (d < startDate || d > endDate) return false;

            const vType = v.vendorType || vendorTypeMap[v.vendorId] || 'WELDING';
            if (selectedCategory && vType !== selectedCategory) {
                return false;
            }

            if (selectedVendorId && String(v.vendorId) !== String(selectedVendorId)) {
                return false;
            }
            return true;
        });

        let totalBlades = 0;
        let totalCost = 0;
        let totalPaid = 0;

        filteredTxns.forEach(t => {
            totalBlades += Number(t.bladeQuantity || 0);
            totalCost += Number(t.totalCost || 0);
            totalPaid += Number(t.amountPaid || 0);
        });

        const pendingPayable = totalCost - totalPaid;

        document.getElementById('repVndBlades').textContent = totalBlades.toLocaleString('en-IN');
        document.getElementById('repVndTotalCost').textContent = `₹${totalCost.toLocaleString('en-IN')}`;
        document.getElementById('repVndTotalPaid').textContent = `₹${totalPaid.toLocaleString('en-IN')}`;
        document.getElementById('repVndPending').textContent = `₹${pendingPayable.toLocaleString('en-IN')}`;

        // Render Vendor Transaction History Table
        const tbody = document.getElementById('reportVendorTableBody');
        if (tbody) {
            filteredTxns.sort((a, b) => new Date(b.date) - new Date(a.date));

            if (filteredTxns.length === 0) {
                tbody.innerHTML = `<tr><td colspan="8" class="empty-state">No vendor transactions or purchase records match your selected filter.</td></tr>`;
            } else {
                tbody.innerHTML = filteredTxns.map(t => {
                    const vType = t.vendorType || vendorTypeMap[t.vendorId] || 'WELDING';
                    const isBladeSupplier = vType === 'BLADE_SUPPLIER';
                    const catLabel = isBladeSupplier ? 'Blade Supplier' : 'Welding Vendor';
                    const catBadgeClass = isBladeSupplier ? 'newblade' : 'welding';

                    const qtyRateStr = t.bladeQuantity ? `${t.bladeQuantity} blades @ ₹${t.ratePerBlade || 0}` : '-';

                    return `
                        <tr>
                            <td>${new Date(t.date).toLocaleDateString('en-IN')}</td>
                            <td><strong>${this.escapeHtml(t.vendorName)}</strong></td>
                            <td><span class="badge ${catBadgeClass}">${catLabel}</span></td>
                            <td>${this.escapeHtml(t.notes || (isBladeSupplier ? 'Blade Purchase' : 'Outsourced Welding'))}</td>
                            <td>${qtyRateStr}</td>
                            <td class="text-warning">${t.totalCost > 0 ? '₹' + t.totalCost.toLocaleString('en-IN') : '-'}</td>
                            <td class="text-success">${t.amountPaid > 0 ? '₹' + t.amountPaid.toLocaleString('en-IN') : '-'}</td>
                            <td><span class="badge ${t.paymentStatus === 'PAID' ? 'grinding' : 'welding'}">${t.paymentStatus}</span></td>
                        </tr>
                    `;
                }).join('');
            }
        }
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

window.reportsModule = new ReportsModule();
