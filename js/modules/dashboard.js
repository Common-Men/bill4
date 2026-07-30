/**
 * Blade Master - Dashboard Module
 * Renders executive KPI metrics, daily stats, quick action routes, and recent transaction feeds.
 */

class DashboardModule {
    async init() {
        this.renderDate();
        await this.loadStats();
        await this.loadRecentActivity();
        this.bindEvents();
    }

    renderDate() {
        const dateEl = document.getElementById('todayDateDisplay');
        if (dateEl) {
            const options = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' };
            dateEl.textContent = new Date().toLocaleDateString('en-IN', options);
        }

        const userHeading = document.getElementById('welcomeHeading');
        if (userHeading && window.authManager && window.authManager.getUser()) {
            const user = window.authManager.getUser();
            const displayName = user.fullName || user.username || 'Owner';
            userHeading.textContent = `Welcome, ${displayName}`;
        }
    }

    async loadStats() {
        const dNow = new Date();
        const y = dNow.getFullYear();
        const m = String(dNow.getMonth() + 1).padStart(2, '0');
        const d = String(dNow.getDate()).padStart(2, '0');
        const todayStr = `${y}-${m}-${d}`;
        
        const bills = await window.db.getAll('bills');
        const payments = await window.db.getAll('payments');
        const customers = await window.db.getAll('customers');
        const vendorTxns = await window.db.getAll('vendor_transactions');

        // Today's Sales (Billed Today in local time)
        const todaySales = bills
            .filter(b => {
                if (!b.date) return false;
                const bd = new Date(b.date);
                const bStr = `${bd.getFullYear()}-${String(bd.getMonth() + 1).padStart(2, '0')}-${String(bd.getDate()).padStart(2, '0')}`;
                return bStr === todayStr;
            })
            .reduce((sum, b) => sum + Number(b.totalAmount || 0), 0);

        // Today's Collection (in local time)
        const todayCollection = payments
            .filter(p => {
                if (!p.paymentDate) return false;
                const pd = new Date(p.paymentDate);
                const pStr = `${pd.getFullYear()}-${String(pd.getMonth() + 1).padStart(2, '0')}-${String(pd.getDate()).padStart(2, '0')}`;
                return pStr === todayStr;
            })
            .reduce((sum, p) => sum + Number(p.amount || 0), 0);

        // Total Pending Udhar
        const totalPending = customers.reduce((sum, c) => sum + Math.max(0, Number(c.currentBalance || 0)), 0);

        // Build set of bill IDs that are linked to vendor_transactions
        const billsWithVendorTxn = new Set();
        vendorTxns.forEach(vt => {
            if (vt.billId) {
                billsWithVendorTxn.add(String(vt.billId));
            }
        });

        // Calculate Financials & Service Performance Breakdown
        let totalRevenue = 0;
        let grindRev = 0;
        let weldRev = 0;
        let newBladeRev = 0;
        let unlinkedBillWeldCost = 0;

        bills.forEach(b => {
            totalRevenue += Number(b.totalAmount || 0);
            if (Array.isArray(b.services)) {
                b.services.forEach(s => {
                    const name = (s.name || '').toLowerCase();
                    const total = Number(s.total || 0);
                    const vCost = Number(s.vendorTotalCost || 0);

                    if (name.includes('grind')) {
                        grindRev += total;
                    } else if (name.includes('weld')) {
                        weldRev += total;
                        if (!billsWithVendorTxn.has(String(b.id))) {
                            unlinkedBillWeldCost += vCost;
                        }
                    } else {
                        newBladeRev += total;
                    }
                });
            }
        });

        const vendors = await window.db.getAll('vendors');
        const vendorTypeMap = {};
        vendors.forEach(v => {
            if (v.id) vendorTypeMap[v.id] = v.type || 'WELDING';
        });

        // Sum vendor transaction costs separated by vendor type
        let weldingTxnCost = 0;
        let bladePurchaseCost = 0;

        vendorTxns.forEach(vt => {
            const vType = vt.vendorType || vendorTypeMap[vt.vendorId] || 'WELDING';
            const cost = Number(vt.totalCost || 0);
            if (vType === 'BLADE_SUPPLIER') {
                bladePurchaseCost += cost;
            } else {
                weldingTxnCost += cost;
            }
        });

        const weldExp = weldingTxnCost + unlinkedBillWeldCost;
        const bladePurchaseExp = bladePurchaseCost;
        // Dashboard expenses are ONLY Vendor Expenses (Welding Expenses + Blade Purchase Expenses)
        const totalExpenses = weldExp + bladePurchaseExp;
        // Customer Business Profit = Total Revenue - Vendor Expenses
        const netProfit = totalRevenue - totalExpenses;

        const weldProfit = weldRev - weldExp;
        const bladeProfit = newBladeRev - bladePurchaseExp;

        // Update Executive KPI Cards
        const elTodaySales = document.getElementById('statTodaySales');
        const elTodayCollection = document.getElementById('statTodayCollection');
        const elPendingAmount = document.getElementById('statPendingAmount');
        const elTotalCustomers = document.getElementById('statTotalCustomers');
        const elTotalRevenue = document.getElementById('statTotalRevenue');
        const elTotalExpenses = document.getElementById('statTotalExpenses');
        const elNetProfit = document.getElementById('statNetProfit');

        if (elTodaySales) elTodaySales.textContent = `₹${todaySales.toLocaleString('en-IN')}`;
        if (elTodayCollection) elTodayCollection.textContent = `₹${todayCollection.toLocaleString('en-IN')}`;
        if (elPendingAmount) elPendingAmount.textContent = `₹${totalPending.toLocaleString('en-IN')}`;
        if (elTotalCustomers) elTotalCustomers.textContent = customers.length;
        if (elTotalRevenue) elTotalRevenue.textContent = `₹${totalRevenue.toLocaleString('en-IN')}`;
        if (elTotalExpenses) elTotalExpenses.textContent = `₹${totalExpenses.toLocaleString('en-IN')}`;
        if (elNetProfit) elNetProfit.textContent = `₹${netProfit.toLocaleString('en-IN')}`;

        // Update Service Performance Breakdown
        const elDashGrindRev = document.getElementById('dashGrindRev');
        const elDashGrindProfit = document.getElementById('dashGrindProfit');
        const elDashWeldRev = document.getElementById('dashWeldRev');
        const elDashWeldExp = document.getElementById('dashWeldExp');
        const elDashWeldProfit = document.getElementById('dashWeldProfit');
        const elDashBladeRev = document.getElementById('dashBladeRev');
        const elDashBladeExp = document.getElementById('dashBladeExp');
        const elDashBladeProfit = document.getElementById('dashBladeProfit');

        if (elDashGrindRev) elDashGrindRev.textContent = `₹${grindRev.toLocaleString('en-IN')}`;
        if (elDashGrindProfit) elDashGrindProfit.textContent = `₹${grindRev.toLocaleString('en-IN')}`;
        if (elDashWeldRev) elDashWeldRev.textContent = `₹${weldRev.toLocaleString('en-IN')}`;
        if (elDashWeldExp) elDashWeldExp.textContent = `₹${weldExp.toLocaleString('en-IN')}`;
        if (elDashWeldProfit) elDashWeldProfit.textContent = `₹${weldProfit.toLocaleString('en-IN')}`;
        if (elDashBladeRev) elDashBladeRev.textContent = `₹${newBladeRev.toLocaleString('en-IN')}`;
        if (elDashBladeExp) elDashBladeExp.textContent = `₹${bladePurchaseExp.toLocaleString('en-IN')}`;
        if (elDashBladeProfit) elDashBladeProfit.textContent = `₹${bladeProfit.toLocaleString('en-IN')}`;
    }

    async loadRecentActivity() {
        const transactions = await window.db.getAll('transactions');
        transactions.sort((a, b) => new Date(b.date) - new Date(a.date));
        
        const recent = transactions.slice(0, 5);
        const container = document.getElementById('recentActivityList');
        if (!container) return;

        if (!recent || recent.length === 0) {
            container.innerHTML = `<div class="empty-state">No recent activity.</div>`;
            return;
        }

        container.innerHTML = recent.map(t => {
            const isPayment = t.credit > 0;
            return `
                <div class="activity-item ${isPayment ? 'type-payment' : ''}">
                    <div class="activity-details">
                        <h5>${window.customerModule.escapeHtml(t.customerName || 'Customer')}</h5>
                        <p>${window.customerModule.escapeHtml(t.description)} • ${new Date(t.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                    <div class="activity-amount ${isPayment ? 'text-success' : 'text-warning'}">
                        ${isPayment ? '- ₹' + t.credit : '+ ₹' + t.debit}
                    </div>
                </div>
            `;
        }).join('');
    }

    bindEvents() {
        // Quick Action: Create New Bill
        const btnBill = document.getElementById('btnQuickNewBill');
        if (btnBill) {
            btnBill.addEventListener('click', () => window.appRouter.navigateTo('viewBilling'));
        }

        // Quick Action: Record Payment
        const btnPay = document.getElementById('btnQuickPayment');
        if (btnPay) {
            btnPay.addEventListener('click', () => window.openModal('modalPayment'));
        }

        // Quick Action: Add Customer
        const btnCust = document.getElementById('btnQuickAddCustomer');
        if (btnCust) {
            btnCust.addEventListener('click', () => window.openModal('modalCustomer'));
        }

        // Quick Action: Reports
        const btnRep = document.getElementById('btnQuickReports');
        if (btnRep) {
            btnRep.addEventListener('click', () => window.appRouter.navigateTo('viewReports'));
        }

        // View All Ledger Link
        const btnViewLedger = document.getElementById('btnViewAllLedger');
        if (btnViewLedger) {
            btnViewLedger.addEventListener('click', () => window.appRouter.navigateTo('viewLedger'));
        }
    }
}

window.dashboardModule = new DashboardModule();
