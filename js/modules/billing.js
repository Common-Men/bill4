/**
 * Blade Master - Billing & Service Module
 * Handles billing calculations for Grinding, Welding, and New Blade sales, ledger generation, and WhatsApp formatting.
 */

class BillingModule {
    constructor() {
        this.selectedCustomer = null;
        this.todayTotal = 0;
        this.prevBalance = 0;
        this.finalBalance = 0;
        this.isGenerating = false;
    }

    init() {
        this.bindEvents();
    }

    bindEvents() {
        // Customer Select Change
        const custSelect = document.getElementById('billCustomerSelect');
        if (custSelect) {
            custSelect.addEventListener('change', async (e) => {
                const custId = e.target.value;
                await this.onCustomerChange(custId);
            });
        }

        // Live calculation inputs
        const inputs = [
            'grindQty', 'grindRate',
            'weldQty', 'weldRate',
            'newBladeQty', 'newBladeRate',
            'billPaymentReceived'
        ];

        inputs.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('input', () => this.calculateBillSummary());
            }
        });

        // Bill Form Submit
        const form = document.getElementById('billForm');
        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.handleGenerateBill();
            });
        }

        // Copy WhatsApp button
        const copyBtn = document.getElementById('btnCopyWhatsapp');
        if (copyBtn) {
            copyBtn.addEventListener('click', () => {
                const preview = document.getElementById('whatsappPreviewText');
                if (preview) {
                    navigator.clipboard.writeText(preview.textContent);
                    window.showToast('WhatsApp bill message copied to clipboard!', 'success');
                }
            });
        }
    }

    selectCustomer(customerId) {
        const custSelect = document.getElementById('billCustomerSelect');
        if (custSelect) {
            custSelect.value = customerId;
            this.onCustomerChange(customerId);
        }
    }

    async onCustomerChange(customerId) {
        const balBox = document.getElementById('customerBalanceBox');
        const balDisplay = document.getElementById('billPrevBalanceDisplay');

        if (!customerId) {
            this.selectedCustomer = null;
            this.prevBalance = 0;
            if (balBox) balBox.classList.add('hidden');
            this.calculateBillSummary();
            return;
        }

        this.selectedCustomer = window.customerModule.customers.find(c => c.id === customerId);
        this.prevBalance = Number(this.selectedCustomer?.currentBalance || 0);

        if (balDisplay) balDisplay.textContent = `₹${this.prevBalance}`;
        if (balBox) balBox.classList.remove('hidden');

        this.calculateBillSummary();
    }

    calculateBillSummary() {
        // 1. Grinding
        const grindQty = Number(document.getElementById('grindQty')?.value || 0);
        const grindRate = Number(document.getElementById('grindRate')?.value || 0);
        const grindTotal = grindQty * grindRate;
        document.getElementById('grindTotal').value = grindTotal;

        // 2. Welding
        const weldQty = Number(document.getElementById('weldQty')?.value || 0);
        const weldRate = Number(document.getElementById('weldRate')?.value || 0);
        const weldTotal = weldQty * weldRate;
        document.getElementById('weldTotal').value = weldTotal;

        // 3. New Blade
        const newQty = Number(document.getElementById('newBladeQty')?.value || 0);
        const newRate = Number(document.getElementById('newBladeRate')?.value || 0);
        const newTotal = newQty * newRate;
        document.getElementById('newBladeTotal').value = newTotal;

        // Today's Services Total
        this.todayTotal = grindTotal + weldTotal + newTotal;
        const paymentRec = Number(document.getElementById('billPaymentReceived')?.value || 0);

        this.finalBalance = this.prevBalance + this.todayTotal - paymentRec;

        // Update UI summary
        document.getElementById('calcPrevBal').textContent = `₹${this.prevBalance}`;
        document.getElementById('calcTodayBill').textContent = `+ ₹${this.todayTotal}`;
        document.getElementById('calcPaymentRec').textContent = `- ₹${paymentRec}`;
        document.getElementById('calcFinalBal').textContent = `₹${this.finalBalance}`;
    }

    async handleGenerateBill() {
        if (this.isGenerating) return;
        this.isGenerating = true;

        const form = document.getElementById('billForm');
        const submitBtn = document.getElementById('btnSaveBill');

        try {
            if (!this.selectedCustomer) {
                window.showToast('Please select a customer first.', 'warning');
                return;
            }

            if (this.todayTotal <= 0) {
                window.showToast('Please add at least one service item to the bill.', 'warning');
                return;
            }

            if (submitBtn) submitBtn.disabled = true;

            const grindQty = Number(document.getElementById('grindQty')?.value || 0);
            const grindRate = Number(document.getElementById('grindRate')?.value || 0);
            const weldQty = Number(document.getElementById('weldQty')?.value || 0);
            const weldRate = Number(document.getElementById('weldRate')?.value || 0);
            const newType = document.getElementById('newBladeType')?.value.trim() || 'Standard';
            const newQty = Number(document.getElementById('newBladeQty')?.value || 0);
            const newRate = Number(document.getElementById('newBladeRate')?.value || 0);
            const paymentRec = Number(document.getElementById('billPaymentReceived')?.value || 0);
            const payMode = document.getElementById('billPaymentMode')?.value || 'Cash';

            const billId = window.apiService.generateBillId();
            const txnId = window.apiService.generateTxnId();
            const nowIso = new Date().toISOString();

            // Save customer and previous balance before form reset
            const customerObj = { ...this.selectedCustomer };
            const initialPrevBal = Number(this.prevBalance || 0);

            // 1. Service Details Breakdown
            const services = [];
            if (grindQty > 0) services.push({ name: 'Grinding Blade', qty: grindQty, rate: grindRate, total: grindQty * grindRate });
            if (weldQty > 0) {
                const vendorId = document.getElementById('billWeldingVendorSelect')?.value || '';
                const vendorCostRate = Number(document.getElementById('billWeldingCostRate')?.value || 40);
                const vendorObj = window.vendorsModule?.vendors?.find(v => v.id === vendorId);
                const vendorName = vendorObj ? vendorObj.name : '';
                const vendorTotalCost = weldQty * vendorCostRate;

                services.push({
                    name: 'Welding Blade',
                    qty: weldQty,
                    rate: weldRate,
                    total: weldQty * weldRate,
                    vendorId: vendorId,
                    vendorName: vendorName,
                    vendorCostRate: vendorCostRate,
                    vendorTotalCost: vendorTotalCost
                });

                // Auto-create Vendor Transaction Record for outsourced welding work
                if (vendorId) {
                    const vTxnId = window.apiService.generateVendorTxnId();
                    const vTxnRecord = {
                        id: vTxnId,
                        date: nowIso,
                        vendorId: vendorId,
                        vendorName: vendorName,
                        bladeQuantity: weldQty,
                        ratePerBlade: vendorCostRate,
                        totalCost: vendorTotalCost,
                        amountPaid: 0,
                        paymentStatus: 'PENDING',
                        notes: `Outsourced Welding for Bill #${billId} (${customerObj.name})`,
                        billId: billId,
                        syncStatus: 'PENDING_SYNC'
                    };
                    await window.db.put('vendor_transactions', vTxnRecord);
                    await window.db.addToSyncQueue('vendor_transaction', 'CREATE', vTxnRecord);
                }
            }
            if (newQty > 0) services.push({ name: 'New Blade (' + newType + ')', qty: newQty, rate: newRate, total: newQty * newRate });

            let newCustBalance = initialPrevBal + this.todayTotal - paymentRec;

            // 2. Build Bill Record
            const billRecord = {
                id: billId,
                customerId: customerObj.id,
                customerName: customerObj.name,
                date: nowIso,
                services: services,
                totalAmount: this.todayTotal,
                previousBalance: initialPrevBal,
                finalBalance: newCustBalance,
                paymentReceived: paymentRec,
                paymentStatus: paymentRec >= this.todayTotal ? 'PAID' : (paymentRec > 0 ? 'PARTIAL' : 'UNPAID'),
                syncStatus: 'PENDING_SYNC'
            };

            // 3. Build Transaction Record (Debit for service total)
            const txnRecord = {
                id: txnId,
                customerId: customerObj.id,
                customerName: customerObj.name,
                date: nowIso,
                description: `Bill #${billId} (${services.map(s => s.name).join(', ')})`,
                debit: this.todayTotal,
                credit: 0,
                balance: initialPrevBal + this.todayTotal,
                syncStatus: 'PENDING_SYNC'
            };

            // Save Bill and Transaction to Local DB & Queue
            await window.db.put('bills', billRecord);
            await window.db.put('transactions', txnRecord);
            await window.db.addToSyncQueue('bill', 'CREATE', billRecord);
            await window.db.addToSyncQueue('transaction', 'CREATE', txnRecord);

            // 4. Handle Payment Record if payment received
            if (paymentRec > 0) {
                const payId = window.apiService.generatePaymentId();
                const payRecord = {
                    id: payId,
                    customerId: customerObj.id,
                    customerName: customerObj.name,
                    paymentDate: nowIso,
                    amount: paymentRec,
                    paymentMode: payMode,
                    notes: `Paid with Bill #${billId}`,
                    syncStatus: 'PENDING_SYNC'
                };

                const payTxnRecord = {
                    id: window.apiService.generateTxnId(),
                    customerId: customerObj.id,
                    customerName: customerObj.name,
                    date: nowIso,
                    description: `Payment Received (${payMode}) for Bill #${billId}`,
                    debit: 0,
                    credit: paymentRec,
                    balance: newCustBalance,
                    syncStatus: 'PENDING_SYNC'
                };

                await window.db.put('payments', payRecord);
                await window.db.put('transactions', payTxnRecord);
                await window.db.addToSyncQueue('payment', 'CREATE', payRecord);
                await window.db.addToSyncQueue('transaction', 'CREATE', payTxnRecord);
            }

            // 5. Update Customer Current Balance in Local DB
            const updatedCustomer = {
                ...customerObj,
                currentBalance: newCustBalance,
                syncStatus: 'PENDING_SYNC'
            };
            await window.db.put('customers', updatedCustomer);
            await window.db.addToSyncQueue('customer', 'UPDATE', updatedCustomer);

            // 6. Show WhatsApp Sharing Modal BEFORE resetting form
            this.showWhatsAppModal(billRecord, customerObj, initialPrevBal, newCustBalance, paymentRec);

            // 7. Reset Form
            this.resetForm();

            // Trigger Sync
            window.apiService.syncPendingData();
            if (window.customerModule) await window.customerModule.loadCustomers();
            if (window.vendorsModule) await window.vendorsModule.loadVendors();
            if (window.dashboardModule) await window.dashboardModule.loadStats();
        } catch (err) {
            console.error('[BillingModule] Error generating bill:', err);
            window.showToast('Failed to generate bill. Please try again.', 'error');
        } finally {
            this.isGenerating = false;
            if (submitBtn) submitBtn.disabled = false;
        }
    }

    showWhatsAppModal(bill, customer, prevBal, finalBal, paymentRec) {
        const titleEl = document.getElementById('successModalTitle');
        if (titleEl) titleEl.textContent = 'Bill Generated Successfully!';

        document.getElementById('successBillNumber').textContent = bill.id;

        const shareBtnText = document.getElementById('btnShareWhatsappText');
        if (shareBtnText) shareBtnText.textContent = 'Share Bill via WhatsApp';

        const copyBtnText = document.getElementById('btnCopyWhatsappText');
        if (copyBtnText) copyBtnText.textContent = 'Copy Bill Message';

        // Build formatted WhatsApp message string
        let serviceLines = bill.services.map(s => `• ${s.name}: ${s.qty} x ₹${s.rate} = ₹${s.total}`).join('\n');


// INVOICE MASSAGETEXT        
        const messageText = 
`*"SHREE HARI" BLADE SERVICE INVOICE*
------------------------------
*Customer:* ${customer ? customer.name : 'Customer'}
*Bill No:* ${bill.id}
*Date:* ${new Date(bill.date).toLocaleDateString()}

*Services Rendered:*
${serviceLines}

*Previous Balance:* ₹${prevBal}
*Today's Bill:* ₹${bill.totalAmount}
*Payment Received:* ₹${paymentRec}
------------------------------
*Remaining Udhar Balance:* ₹${finalBal}

Thank you for your business!
_Shree Hari Blade Service_`;

        const previewBox = document.getElementById('whatsappPreviewText');
        if (previewBox) previewBox.textContent = messageText;

        const whatsappBtn = document.getElementById('btnShareWhatsapp');
        if (whatsappBtn && customer) {
            const cleanMobile = (customer.mobile || '').replace(/\D/g, '');
            const encodedMsg = encodeURIComponent(messageText);
            whatsappBtn.href = `https://wa.me/91${cleanMobile}?text=${encodedMsg}`;
        }

        window.openModal('modalBillSuccess');
    }

    resetForm() {
        const grindQty = document.getElementById('grindQty');
        if (grindQty) grindQty.value = 0;
        const grindTotal = document.getElementById('grindTotal');
        if (grindTotal) grindTotal.value = 0;
        const weldQty = document.getElementById('weldQty');
        if (weldQty) weldQty.value = 0;
        const weldTotal = document.getElementById('weldTotal');
        if (weldTotal) weldTotal.value = 0;
        const newBladeQty = document.getElementById('newBladeQty');
        if (newBladeQty) newBladeQty.value = 0;
        const newBladeTotal = document.getElementById('newBladeTotal');
        if (newBladeTotal) newBladeTotal.value = 0;
        const newBladeType = document.getElementById('newBladeType');
        if (newBladeType) newBladeType.value = '';
        const billPaymentReceived = document.getElementById('billPaymentReceived');
        if (billPaymentReceived) billPaymentReceived.value = '';
        const billCustomerSelect = document.getElementById('billCustomerSelect');
        if (billCustomerSelect) billCustomerSelect.value = '';
        
        const balBox = document.getElementById('customerBalanceBox');
        if (balBox) balBox.classList.add('hidden');

        this.selectedCustomer = null;
        this.todayTotal = 0;
        this.prevBalance = 0;
        this.finalBalance = 0;
        this.calculateBillSummary();
    }
}

window.billingModule = new BillingModule();
