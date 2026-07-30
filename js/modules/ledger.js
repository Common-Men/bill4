/**
 * Blade Master - Ledger & Payment Module
 * Manages full transaction history, credit/debit records, and standalone customer payment entries.
 */

class LedgerModule {
    constructor() {
        this.transactions = [];
        this.isSaving = false;
    }

    async init() {
        await this.loadLedger();
        this.bindEvents();
    }

    async loadLedger() {
        try {
            this.transactions = await window.db.getAll('transactions');
            this.transactions.sort((a, b) => new Date(b.date) - new Date(a.date));
            this.renderLedgerTable(this.transactions);
        } catch (e) {
            console.error('[LedgerModule] Error loading transactions:', e);
        }
    }

    bindEvents() {
        // Customer Filter
        const filterSelect = document.getElementById('ledgerCustomerFilter');
        if (filterSelect) {
            filterSelect.addEventListener('change', (e) => {
                const custId = e.target.value;
                if (!custId) {
                    this.renderLedgerTable(this.transactions);
                } else {
                    const filtered = this.transactions.filter(t => t.customerId === custId);
                    this.renderLedgerTable(filtered);
                }
            });
        }

        // Open Payment Modal button
        const openPayBtn = document.getElementById('btnOpenPaymentModal');
        if (openPayBtn) {
            openPayBtn.addEventListener('click', () => {
                const payForm = document.getElementById('paymentForm');
                if (payForm) payForm.reset();
                const infoBox = document.getElementById('payCustBalInfo');
                if (infoBox) infoBox.classList.add('hidden');
                window.openModal('modalPayment');
            });
        }

        // Payment Customer Select Change
        const payCustSelect = document.getElementById('payCustomerSelect');
        if (payCustSelect) {
            payCustSelect.addEventListener('change', (e) => {
                const custId = e.target.value;
                const infoBox = document.getElementById('payCustBalInfo');
                const balDisplay = document.getElementById('payCustCurrentBal');

                if (!custId) {
                    if (infoBox) infoBox.classList.add('hidden');
                    return;
                }

                const cust = window.customerModule.customers.find(c => c.id === custId);
                if (cust) {
                    if (balDisplay) balDisplay.textContent = `₹${cust.currentBalance || 0}`;
                    if (infoBox) infoBox.classList.remove('hidden');
                }
            });
        }

        // Payment Form Submit
        const payForm = document.getElementById('paymentForm');
        if (payForm) {
            payForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.handleSavePayment();
            });
        }
    }

    renderLedgerTable(list) {
        const tbody = document.getElementById('ledgerTableBody');
        if (!tbody) return;

        if (!list || list.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" class="empty-state">No transaction records found.</td></tr>`;
            return;
        }

        tbody.innerHTML = list.map(t => `
            <tr>
                <td>${new Date(t.date).toLocaleDateString()}</td>
                <td><strong>${window.customerModule.escapeHtml(t.customerName || t.customerId)}</strong></td>
                <td>${window.customerModule.escapeHtml(t.description)}<br><small style="color:var(--text-dim);">${t.id}</small></td>
                <td class="text-warning">${t.debit > 0 ? '+ ₹' + t.debit : '-'}</td>
                <td class="text-success">${t.credit > 0 ? '- ₹' + t.credit : '-'}</td>
                <td><strong>₹${t.balance}</strong></td>
                <td>
                    <span class="sync-badge ${t.syncStatus === 'SYNCED' ? 'synced' : 'pending'}">
                        ${t.syncStatus === 'SYNCED' ? 'Synced ✅' : 'Pending ⏳'}
                    </span>
                </td>
            </tr>
        `).join('');
    }

    // Record Customer Standalone Payment
    async handleSavePayment() {
        if (this.isSaving) return;
        this.isSaving = true;

        const payForm = document.getElementById('paymentForm');
        const custSelect = document.getElementById('payCustomerSelect');
        const amountInput = document.getElementById('payAmount');
        const modeSelect = document.getElementById('payMode');
        const notesInput = document.getElementById('payNotes');
        const submitBtn = payForm ? payForm.querySelector('button[type="submit"]') : null;

        try {
            const custId = custSelect ? custSelect.value : '';
            const amount = Number(amountInput ? amountInput.value : 0);
            const mode = modeSelect ? modeSelect.value : 'Cash';
            const notes = notesInput ? notesInput.value.trim() : '';

            if (!custId || amount <= 0) {
                window.showToast('Please select a customer and enter a valid payment amount.', 'warning');
                return;
            }

            if (submitBtn) submitBtn.disabled = true;

            const customer = window.customerModule ? window.customerModule.customers.find(c => c.id === custId) : null;
            if (!customer) {
                window.showToast('Customer record not found.', 'error');
                return;
            }

            const currentBal = Number(customer.currentBalance || 0);
            const newBal = currentBal - amount;
            const nowIso = new Date().toISOString();
            const payId = window.apiService.generatePaymentId();
            const txnId = window.apiService.generateTxnId();

            // 1. Payment Record
            const payRecord = {
                id: payId,
                customerId: custId,
                customerName: customer.name,
                paymentDate: nowIso,
                amount: amount,
                paymentMode: mode,
                notes: notes || `Direct Payment (${mode})`,
                syncStatus: 'PENDING_SYNC'
            };

            // 2. Transaction Record
            const txnRecord = {
                id: txnId,
                customerId: custId,
                customerName: customer.name,
                date: nowIso,
                description: `Payment Received (${mode}) ${notes ? '- ' + notes : ''}`,
                debit: 0,
                credit: amount,
                balance: newBal,
                syncStatus: 'PENDING_SYNC'
            };

            // 3. Save Records to Local DB & Queue
            await window.db.put('payments', payRecord);
            await window.db.put('transactions', txnRecord);
            await window.db.addToSyncQueue('payment', 'CREATE', payRecord);
            await window.db.addToSyncQueue('transaction', 'CREATE', txnRecord);

            // 4. Update Customer Balance
            customer.currentBalance = newBal;
            customer.syncStatus = 'PENDING_SYNC';
            await window.db.put('customers', customer);
            await window.db.addToSyncQueue('customer', 'UPDATE', customer);

            // Reset & Close
            if (payForm) payForm.reset();
            const infoBox = document.getElementById('payCustBalInfo');
            if (infoBox) infoBox.classList.add('hidden');

            window.closeModal('modalPayment');
            window.showToast(`Payment of ₹${amount} recorded for ${customer.name}!`, 'success');

            // Show Payment WhatsApp Share Modal
            this.showPaymentWhatsAppModal(payRecord, customer, currentBal, newBal);

            await this.loadLedger();
            if (window.customerModule) await window.customerModule.loadCustomers();
            if (window.dashboardModule) await window.dashboardModule.loadStats();
            window.apiService.syncPendingData();
        } catch (err) {
            console.error('[LedgerModule] Error saving payment:', err);
            window.showToast('Failed to record payment. Please try again.', 'error');
        } finally {
            this.isSaving = false;
            if (submitBtn) submitBtn.disabled = false;
        }
    }

    showPaymentWhatsAppModal(payRecord, customer, prevBal, newBal) {
        const titleEl = document.getElementById('successModalTitle');
        if (titleEl) titleEl.textContent = 'Payment Recorded Successfully!';

        const numEl = document.getElementById('successBillNumber');
        if (numEl) numEl.textContent = payRecord.id;

        const shareBtnText = document.getElementById('btnShareWhatsappText');
        if (shareBtnText) shareBtnText.textContent = 'Share Receipt via WhatsApp';

        const copyBtnText = document.getElementById('btnCopyWhatsappText');
        if (copyBtnText) copyBtnText.textContent = 'Copy Receipt Message';

        const notesText = payRecord.notes ? `\n*Notes:* ${payRecord.notes}` : '';

        const messageText = 
`*"SHREE HARI" BLADE SERVICE PAYMENT RECEIPT*
------------------------------
*Customer:* ${customer ? customer.name : 'Customer'}
*Receipt No:* ${payRecord.id}
*Date:* ${new Date(payRecord.paymentDate).toLocaleDateString()}

*Payment Details:*
• Payment Received: ₹${payRecord.amount}
• Payment Mode: ${payRecord.paymentMode}${notesText}

*Previous Balance:* ₹${prevBal}
*Payment Received:* ₹${payRecord.amount}
------------------------------
*Remaining Udhar Balance:* ₹${newBal}

Thank you for your payment!
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
}

window.ledgerModule = new LedgerModule();
