/**
 * Blade Master - Business Profit / Loss Analysis Module
 * Provides a comprehensive financial breakdown of Customer Business Profitability
 * and Net Operating Profit / Loss.
 */

class ProfitLossModule {
    async init() {
        await this.loadFinancialData();
    }

    async loadFinancialData() {
        const bills = await window.db.getAll('bills') || [];
        const vendorTxns = await window.db.getAll('vendor_transactions') || [];
        const businessExpenses = await window.db.getAll('business_expenses') || [];
        const vendors = await window.db.getAll('vendors') || [];

        const vendorTypeMap = {};
        vendors.forEach(v => {
            if (v.id) vendorTypeMap[v.id] = v.type || 'WELDING';
        });

        const billsWithVendorTxn = new Set();
        vendorTxns.forEach(vt => {
            if (vt.billId) billsWithVendorTxn.add(String(vt.billId));
        });

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

        const weldingExp = weldingTxnCost + unlinkedBillWeldCost;
        const bladeExp = bladePurchaseCost;
        const totalVendorExpenses = weldingExp + bladeExp;

        const customerBusinessProfit = totalRevenue - totalVendorExpenses;

        let shopRent = 0;
        let electricity = 0;
        let toolPurchase = 0;
        let otherExp = 0;

        businessExpenses.forEach(e => {
            const amt = Number(e.amount || 0);
            if (e.category === 'Shop Rent') shopRent += amt;
            else if (e.category === 'Electricity Bill') electricity += amt;
            else if (e.category === 'Tool Purchase') toolPurchase += amt;
            else otherExp += amt;
        });

        const totalOperatingExpenses = shopRent + electricity + toolPurchase + otherExp;
        const finalProfitLoss = customerBusinessProfit - totalOperatingExpenses;

        // Render values on Profit/Loss Page
        this.setElText('plCustomerRevenue', `+ ₹${totalRevenue.toLocaleString('en-IN')}`);
        this.setElText('plGrindingRev', `₹${grindRev.toLocaleString('en-IN')}`);
        this.setElText('plWeldingRev', `₹${weldRev.toLocaleString('en-IN')}`);
        this.setElText('plBladeRev', `₹${newBladeRev.toLocaleString('en-IN')}`);

        this.setElText('plVendorExpenses', `- ₹${totalVendorExpenses.toLocaleString('en-IN')}`);
        this.setElText('plWeldingExp', `₹${weldingExp.toLocaleString('en-IN')}`);
        this.setElText('plBladeExp', `₹${bladeExp.toLocaleString('en-IN')}`);

        this.setElText('plCustomerProfit', `₹${customerBusinessProfit.toLocaleString('en-IN')}`);

        this.setElText('plExpRent', `- ₹${shopRent.toLocaleString('en-IN')}`);
        this.setElText('plExpElectricity', `- ₹${electricity.toLocaleString('en-IN')}`);
        this.setElText('plExpTools', `- ₹${toolPurchase.toLocaleString('en-IN')}`);
        this.setElText('plExpOther', `- ₹${otherExp.toLocaleString('en-IN')}`);

        this.setElText('plTotalOperatingExp', `- ₹${totalOperatingExpenses.toLocaleString('en-IN')}`);

        const elFinalNet = document.getElementById('plFinalNetProfit');
        const elBanner = document.getElementById('plBannerCard');
        const elChip = document.getElementById('plStatusChip');

        if (elFinalNet) {
            if (finalProfitLoss >= 0) {
                elFinalNet.textContent = `+ ₹${finalProfitLoss.toLocaleString('en-IN')}`;
                elFinalNet.style.color = 'var(--success)';
                if (elBanner) elBanner.style.borderLeftColor = 'var(--success)';
                if (elChip) {
                    elChip.textContent = 'Net Profit ✅';
                    elChip.className = 'badge sync-badge synced';
                }
            } else {
                elFinalNet.textContent = `- ₹${Math.abs(finalProfitLoss).toLocaleString('en-IN')}`;
                elFinalNet.style.color = 'var(--danger)';
                if (elBanner) elBanner.style.borderLeftColor = 'var(--danger)';
                if (elChip) {
                    elChip.textContent = 'Net Loss ⚠️';
                    elChip.className = 'badge sync-badge pending';
                    elChip.style.background = 'rgba(239, 68, 68, 0.2)';
                    elChip.style.color = 'var(--danger)';
                }
            }
        }
    }

    setElText(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    }
}

window.profitLossModule = new ProfitLossModule();
