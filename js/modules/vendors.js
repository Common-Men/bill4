/**
 * Blade Master - Vendor Management Module (Welding Partners & Blade Suppliers)
 * Manages vendor categories, records purchase transactions, vendor costs, payments, and balances.
 */

class VendorsModule {
    constructor() {
        this.vendors = [];
        this.vendorTransactions = [];
        this.activeCategoryFilter = 'ALL';
        this.isSaving = false;
        this.lastEditedPrimaryField = 'RATE';
    }

    async init() {
        await this.loadVendors();
        this.bindEvents();
    }

    // Load Vendors & Vendor Transactions from IndexedDB
    async loadVendors() {
        try {
            this.vendors = await window.db.getAll('vendors');
            this.vendorTransactions = await window.db.getAll('vendor_transactions');
            this.filterAndRenderVendors();
            this.populateVendorDropdowns();
        } catch (e) {
            console.error('[VendorsModule] Error loading vendors data:', e);
        }
    }

    bindEvents() {
        // Category Filter Tabs
        const categoryTabs = document.getElementById('vendorCategoryTabs');
        if (categoryTabs) {
            categoryTabs.addEventListener('click', (e) => {
                const btn = e.target.closest('.report-tab');
                if (!btn) return;
                
                categoryTabs.querySelectorAll('.report-tab').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                this.activeCategoryFilter = btn.dataset.category || 'ALL';
                this.filterAndRenderVendors();
            });
        }

        // Search Input
        const searchInput = document.getElementById('vendorSearchInput');
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                this.filterAndRenderVendors();
            });
        }

        // Open Add Vendor Modal
        const btnAddVendor = document.getElementById('btnOpenAddVendorModal');
        if (btnAddVendor) {
            btnAddVendor.addEventListener('click', () => {
                const form = document.getElementById('vendorForm');
                if (form) form.reset();
                const idInput = document.getElementById('vndFormId');
                if (idInput) idInput.value = '';
                const typeSelect = document.getElementById('vndFormType');
                if (typeSelect) {
                    typeSelect.value = (this.activeCategoryFilter && this.activeCategoryFilter !== 'ALL') ? 
                        this.activeCategoryFilter : 'WELDING';
                }
                const title = document.getElementById('modalVendorTitle');
                if (title) title.textContent = 'Add Vendor';
                window.openModal('modalVendor');
            });
        }

        // Open Record Vendor Txn / Purchase Modal
        const btnVendorTxn = document.getElementById('btnOpenVendorTxnModal');
        if (btnVendorTxn) {
            btnVendorTxn.addEventListener('click', () => {
                this.openVendorPayModal('');
            });
        }

        // Handle Vendor selection change in Txn modal
        const vTxnVendorSelect = document.getElementById('vTxnVendorSelect');
        if (vTxnVendorSelect) {
            vTxnVendorSelect.addEventListener('change', (e) => {
                this.handleVendorSelectChange(e.target.value);
            });
        }

        // Handle Txn Type selection change
        const vTxnTypeSelect = document.getElementById('vTxnType');
        if (vTxnTypeSelect) {
            vTxnTypeSelect.addEventListener('change', () => {
                this.updateTxnCalcDisplay();
            });
        }

        // 2-Way / 3-Way Auto Calculation Listeners (Quantity, Rate & Total Amount)
        const bladesInput = document.getElementById('vTxnBlades');
        const rateInput = document.getElementById('vTxnRate');
        const totalAmountInput = document.getElementById('vTxnTotalAmount');

        if (bladesInput) bladesInput.addEventListener('input', () => this.handleCalcInputChange('blades'));
        if (rateInput) rateInput.addEventListener('input', () => this.handleCalcInputChange('rate'));
        if (totalAmountInput) totalAmountInput.addEventListener('input', () => this.handleCalcInputChange('total'));

        // Add/Edit Vendor Form Submission
        const vendorForm = document.getElementById('vendorForm');
        if (vendorForm) {
            vendorForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.handleSaveVendor();
            });
        }

        // Record Vendor Txn / Purchase Form Submission
        const vTxnForm = document.getElementById('vendorTxnForm');
        if (vTxnForm) {
            vTxnForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.handleSaveVendorTxn();
            });
        }
    }

    filterAndRenderVendors() {
        const query = (document.getElementById('vendorSearchInput')?.value || '').toLowerCase().trim();
        
        let filtered = this.vendors.filter(v => {
            const vType = v.type || 'WELDING';
            const matchesCategory = this.activeCategoryFilter === 'ALL' || vType === this.activeCategoryFilter;
            
            const matchesSearch = !query || 
                v.name.toLowerCase().includes(query) || 
                v.mobile.includes(query) ||
                (v.address && v.address.toLowerCase().includes(query)) ||
                (vType === 'BLADE_SUPPLIER' ? 'blade supplier' : 'welding vendor').includes(query);

            return matchesCategory && matchesSearch;
        });

        this.renderVendorList(filtered);
    }

    // Calculate metrics per vendor
    getVendorStats(vendorId) {
        const txns = this.vendorTransactions.filter(t => t.vendorId === vendorId);
        let totalBlades = 0;
        let totalCost = 0;
        let totalPaid = 0;

        txns.forEach(t => {
            totalBlades += Number(t.bladeQuantity || 0);
            totalCost += Number(t.totalCost || 0);
            totalPaid += Number(t.amountPaid || 0);
        });

        const pendingBalance = totalCost - totalPaid;
        return {
            totalBlades,
            totalCost,
            totalPaid,
            pendingBalance,
            txns
        };
    }

    // Render Vendor Cards Grid
    renderVendorList(list) {
        const container = document.getElementById('vendorList');
        if (!container) return;

        if (!list || list.length === 0) {
            container.innerHTML = `<div class="empty-state">No vendors found for the selected category. Click "Add Vendor" to create one.</div>`;
            return;
        }

        container.innerHTML = list.map(v => {
            const vendorType = v.type || 'WELDING';
            const isBladeSupplier = vendorType === 'BLADE_SUPPLIER';
            const stats = this.getVendorStats(v.id);
            const pendBal = stats.pendingBalance;
            const balClass = pendBal > 0 ? 'text-warning' : (pendBal < 0 ? 'text-success' : 'text-accent');
            const balLabel = pendBal > 0 ? 'Pending Payment (You Owe)' : (pendBal < 0 ? 'Advance Paid' : 'Clear');

            const typeBadge = isBladeSupplier ? 
                `<span class="badge new-blade" style="font-size:0.75rem; margin-left:0.5rem; background: rgba(168, 85, 247, 0.2); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.4); padding: 2px 8px; border-radius: 12px;">Blade Supplier</span>` :
                `<span class="badge welding" style="font-size:0.75rem; margin-left:0.5rem; background: rgba(59, 130, 246, 0.2); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.4); padding: 2px 8px; border-radius: 12px;">Welding Vendor</span>`;

            const bladeCountLabel = isBladeSupplier ? 'Blades Purchased' : 'Blades Welded';
            const costLabel = isBladeSupplier ? 'Total Purchase Cost' : 'Total Service Cost';

            return `
                <div class="cust-card">
                    <div class="cust-card-header">
                        <div>
                            <div class="cust-name" style="display:flex; align-items:center; flex-wrap:wrap;">
                                <span>${this.escapeHtml(v.name)}</span>
                                ${typeBadge}
                            </div>
                            <div class="cust-id">${v.id}</div>
                        </div>
                        <span class="sync-badge ${v.syncStatus === 'SYNCED' ? 'synced' : 'pending'}">
                            ${v.syncStatus === 'SYNCED' ? 'Synced ✅' : 'Pending Sync ⏳'}
                        </span>
                    </div>

                    <div class="cust-mobile">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                        <span>${v.mobile}</span>
                    </div>

                    ${v.address ? `<div class="cust-mobile" style="font-size:0.8rem; color:var(--text-dim);">${this.escapeHtml(v.address)}</div>` : ''}

                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.5rem; margin-top:0.5rem; font-size:0.85rem;">
                        <div>${bladeCountLabel}: <strong>${stats.totalBlades}</strong></div>
                        <div>${costLabel}: <strong>₹${stats.totalCost.toLocaleString('en-IN')}</strong></div>
                    </div>

                    <div class="cust-bal-box" style="margin-top:0.5rem;">
                        <span>Balance (${balLabel}):</span>
                        <span class="cust-bal-amount ${balClass}">₹${Math.abs(pendBal).toLocaleString('en-IN')}</span>
                    </div>

                    <div class="cust-card-actions">
                        <button class="btn btn-secondary btn-vnd-history" data-id="${v.id}">
                            History
                        </button>
                        <button class="btn btn-primary btn-vnd-pay" data-id="${v.id}">
                            + ${isBladeSupplier ? 'Purchase / Settle' : 'Work / Pay'}
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        // Attach event handlers
        container.querySelectorAll('.btn-vnd-history').forEach(btn => {
            btn.addEventListener('click', () => this.showVendorHistoryModal(btn.dataset.id));
        });

        container.querySelectorAll('.btn-vnd-pay').forEach(btn => {
            btn.addEventListener('click', () => this.openVendorPayModal(btn.dataset.id));
        });
    }

    // Save Vendor Form Handler
    async handleSaveVendor() {
        if (this.isSaving) return;
        this.isSaving = true;

        const form = document.getElementById('vendorForm');
        const submitBtn = form ? form.querySelector('button[type="submit"]') : null;

        try {
            if (submitBtn) submitBtn.disabled = true;

            const idInput = document.getElementById('vndFormId');
            const typeSelect = document.getElementById('vndFormType');
            const nameInput = document.getElementById('vndFormName');
            const mobileInput = document.getElementById('vndFormMobile');
            const addressInput = document.getElementById('vndFormAddress');
            const notesInput = document.getElementById('vndFormNotes');

            const isEdit = Boolean(idInput.value);
            const vndId = isEdit ? idInput.value : window.apiService.generateVendorId();

            const selectedType = typeSelect ? typeSelect.value : 'WELDING';
            const vendorRecord = {
                id: vndId,
                type: selectedType,
                vendorType: selectedType,
                name: nameInput.value.trim(),
                mobile: mobileInput.value.trim(),
                address: addressInput.value.trim(),
                notes: notesInput.value.trim(),
                status: 'ACTIVE',
                createdDate: new Date().toISOString(),
                syncStatus: 'PENDING_SYNC'
            };

            // 1. Save to local DB
            await window.db.put('vendors', vendorRecord);

            // 2. Add to Sync Queue
            await window.db.addToSyncQueue('vendor', isEdit ? 'UPDATE' : 'CREATE', vendorRecord);

            if (form) form.reset();
            window.closeModal('modalVendor');
            const typeTitle = vendorRecord.type === 'BLADE_SUPPLIER' ? 'Blade Supplier' : 'Welding Vendor';
            window.showToast(`${typeTitle} "${vendorRecord.name}" saved successfully!`, 'success');

            await this.loadVendors();
            if (window.dashboardModule) await window.dashboardModule.loadStats();
            window.apiService.syncPendingData();
        } catch (err) {
            console.error('[VendorsModule] Error saving vendor:', err);
            window.showToast('Failed to save vendor. Please try again.', 'error');
        } finally {
            this.isSaving = false;
            if (submitBtn) submitBtn.disabled = false;
        }
    }

    // Open Payment / Purchase Log Modal
    openVendorPayModal(vendorId) {
        const form = document.getElementById('vendorTxnForm');
        if (form) form.reset();
        this.lastEditedPrimaryField = 'RATE';

        const vendorSelect = document.getElementById('vTxnVendorSelect');
        if (vendorSelect && vendorId) {
            vendorSelect.value = vendorId;
        }

        this.handleVendorSelectChange(vendorId || (vendorSelect ? vendorSelect.value : ''));
        window.openModal('modalVendorTxn');
    }

    handleVendorSelectChange(vendorId) {
        const infoBox = document.getElementById('vTxnBalInfo');
        const balDisplay = document.getElementById('vTxnCurrentBal');
        const optWork = document.getElementById('optTxnWork');
        const optPayment = document.getElementById('optTxnPayment');
        const lblBlades = document.getElementById('lblVTxnBlades');
        const lblRate = document.getElementById('lblVTxnRate');
        const lblTotalAmount = document.getElementById('lblVTxnTotalAmount');

        if (!vendorId) {
            if (infoBox) infoBox.classList.add('hidden');
            if (lblBlades) lblBlades.textContent = 'Blade Quantity';
            if (lblRate) lblRate.textContent = 'Rate / Price Per Blade (₹)';
            if (lblTotalAmount) lblTotalAmount.textContent = 'Total Amount (₹)';
            this.updateTxnCalcDisplay();
            return;
        }

        const vendor = this.vendors.find(v => v.id === vendorId);
        const vendorType = vendor ? (vendor.type || 'WELDING') : 'WELDING';
        const isBladeSupplier = vendorType === 'BLADE_SUPPLIER';

        if (optWork) {
            optWork.textContent = isBladeSupplier ? 
                'Pay Cash / to Blade Supplier' : 
                'Pay Cash / to Welding Vendor';
        }

        if (optPayment) {
            optPayment.textContent = isBladeSupplier ? 
                'Blade Purchase (Purchase Entry)' : 
                'Welding Job (Cost Entry)';
        }

        if (lblBlades) {
            lblBlades.textContent = isBladeSupplier ? 'Quantity Purchased (Blades)' : 'Blades Quantity (Welded)';
        }

        if (lblRate) {
            lblRate.textContent = isBladeSupplier ? 'Purchase Price / Blade (₹)' : 'Rate / Blade (₹)';
        }

        if (lblTotalAmount) {
            lblTotalAmount.textContent = isBladeSupplier ? 'Total Purchase Amount (₹)' : 'Total Service Cost (₹)';
        }

        const stats = this.getVendorStats(vendorId);
        if (balDisplay) balDisplay.textContent = `₹${stats.pendingBalance.toLocaleString('en-IN')}`;
        if (infoBox) infoBox.classList.remove('hidden');

        this.updateTxnCalcDisplay();
    }

    // 3-Way Auto Calculation between Quantity, Rate, and Total Amount
    handleCalcInputChange(source) {
        const bladesInput = document.getElementById('vTxnBlades');
        const rateInput = document.getElementById('vTxnRate');
        const totalAmountInput = document.getElementById('vTxnTotalAmount');

        const qty = parseFloat(bladesInput?.value) || 0;
        const rate = parseFloat(rateInput?.value) || 0;
        const total = parseFloat(totalAmountInput?.value) || 0;

        if (source === 'rate') {
            this.lastEditedPrimaryField = 'RATE';
            if (total > 0 && rate > 0 && qty === 0) {
                // If Rate and Total Amt are typed -> calculate Quantity (e.g. Total 200 / Rate 50 = Qty 4)
                const calcQty = total / rate;
                if (bladesInput) {
                    bladesInput.value = Number.isInteger(calcQty) ? calcQty : Math.round(calcQty * 100) / 100;
                }
            } else if (qty > 0 && rate > 0) {
                // If Quantity and Rate are typed -> calculate Total Amt (e.g. Qty 4 * Rate 50 = Total 200)
                const calcTotal = qty * rate;
                if (totalAmountInput) {
                    totalAmountInput.value = Number.isInteger(calcTotal) ? calcTotal : Math.round(calcTotal * 100) / 100;
                }
            } else if (rate === 0 && totalAmountInput && this.lastEditedPrimaryField === 'RATE') {
                totalAmountInput.value = '';
            }
        } else if (source === 'total') {
            this.lastEditedPrimaryField = 'TOTAL';
            if (rate > 0 && total > 0 && qty === 0) {
                // If Rate and Total Amt are typed -> calculate Quantity (e.g. Total 200 / Rate 50 = Qty 4)
                const calcQty = total / rate;
                if (bladesInput) {
                    bladesInput.value = Number.isInteger(calcQty) ? calcQty : Math.round(calcQty * 100) / 100;
                }
            } else if (qty > 0 && total > 0) {
                // If Quantity and Total Amt are typed -> calculate Rate (e.g. Total 200 / Qty 4 = Rate 50)
                const calcRate = total / qty;
                if (rateInput) {
                    rateInput.value = Number.isInteger(calcRate) ? calcRate : Math.round(calcRate * 100) / 100;
                }
            } else if (total === 0 && rateInput && this.lastEditedPrimaryField === 'TOTAL') {
                rateInput.value = '';
            }
        } else if (source === 'blades') {
            if (this.lastEditedPrimaryField === 'TOTAL' && total > 0 && qty > 0) {
                const calcRate = total / qty;
                if (rateInput) {
                    rateInput.value = Number.isInteger(calcRate) ? calcRate : Math.round(calcRate * 100) / 100;
                }
            } else if (rate > 0 && qty > 0) {
                const calcTotal = qty * rate;
                if (totalAmountInput) {
                    totalAmountInput.value = Number.isInteger(calcTotal) ? calcTotal : Math.round(calcTotal * 100) / 100;
                }
            } else if (total > 0 && qty > 0) {
                const calcRate = total / qty;
                if (rateInput) {
                    rateInput.value = Number.isInteger(calcRate) ? calcRate : Math.round(calcRate * 100) / 100;
                }
            }
        }

        this.updateTxnCalcDisplay();
    }

    updateTxnCalcDisplay() {
        const vendorSelect = document.getElementById('vTxnVendorSelect');
        const typeSelect = document.getElementById('vTxnType');
        const bladesInput = document.getElementById('vTxnBlades');
        const rateInput = document.getElementById('vTxnRate');
        const totalAmountInput = document.getElementById('vTxnTotalAmount');
        const valCalc = document.getElementById('valVTxnTotalCalc');
        const lblCalc = document.getElementById('lblVTxnTotalCalc');

        const vendorId = vendorSelect ? vendorSelect.value : '';
        const vendor = this.vendors.find(v => v.id === vendorId);
        const isBladeSupplier = vendor && vendor.type === 'BLADE_SUPPLIER';
        const txnType = typeSelect ? typeSelect.value : 'WORK';

        if (lblCalc) {
            lblCalc.textContent = isBladeSupplier ? 'Total Purchase Amount:' : 'Total Service Cost:';
        }

        if (txnType === 'PAYMENT') {
            if (valCalc) valCalc.textContent = '₹0 (Settlement Entry)';
            return;
        }

        const qty = parseFloat(bladesInput ? bladesInput.value : 0) || 0;
        const rate = parseFloat(rateInput ? rateInput.value : 0) || 0;
        const totalEntered = parseFloat(totalAmountInput ? totalAmountInput.value : 0) || 0;

        const total = totalEntered > 0 ? totalEntered : (qty * rate);

        if (valCalc) {
            valCalc.textContent = `₹${total.toLocaleString('en-IN')}`;
        }
    }

    // Handle Vendor Payment / Purchase Txn Submission
    async handleSaveVendorTxn() {
        if (this.isSaving) return;
        this.isSaving = true;

        const form = document.getElementById('vendorTxnForm');
        const vendorSelect = document.getElementById('vTxnVendorSelect');
        const typeSelect = document.getElementById('vTxnType');
        const bladesInput = document.getElementById('vTxnBlades');
        const rateInput = document.getElementById('vTxnRate');
        const totalAmountInput = document.getElementById('vTxnTotalAmount');
        const amountPaidInput = document.getElementById('vTxnAmountPaid');
        const notesInput = document.getElementById('vTxnNotes');
        const submitBtn = form ? form.querySelector('button[type="submit"]') : null;

        try {
            const vendorId = vendorSelect ? vendorSelect.value : '';
            const txnType = typeSelect ? typeSelect.value : 'WORK';
            const blades = Number(bladesInput ? bladesInput.value : 0);
            const rate = Number(rateInput ? rateInput.value : 0);
            const totalAmtEntered = Number(totalAmountInput ? totalAmountInput.value : 0);
            const amountPaid = Number(amountPaidInput ? amountPaidInput.value : 0);
            const notes = notesInput ? notesInput.value.trim() : '';

            if (!vendorId) {
                window.showToast('Please select a vendor.', 'warning');
                return;
            }

            const vendor = this.vendors.find(v => v.id === vendorId);
            if (!vendor) {
                window.showToast('Vendor record not found.', 'error');
                return;
            }

            const vendorType = vendor.type || 'WELDING';
            const isBladeSupplier = vendorType === 'BLADE_SUPPLIER';

            if (submitBtn) submitBtn.disabled = true;

            const vTxnId = window.apiService.generateVendorTxnId();
            const nowIso = new Date().toISOString();

            let totalCost = 0;
            let finalPaid = 0;

            if (txnType === 'WORK') {
                totalCost = totalAmtEntered > 0 ? totalAmtEntered : (blades * rate);
                finalPaid = amountPaid;
            } else {
                // Standalone Vendor Payment Settlement
                totalCost = 0;
                finalPaid = amountPaid;
            }

            const status = finalPaid >= totalCost && totalCost > 0 ? 'PAID' : (finalPaid > 0 ? 'PARTIAL' : 'PENDING');

            let defaultNote = '';
            if (txnType === 'WORK') {
                defaultNote = isBladeSupplier ? 
                    `Blade Purchase (${blades} blades @ ₹${rate}/blade)` : 
                    `Outsourced Welding (${blades} blades @ ₹${rate})`;
            } else {
                defaultNote = isBladeSupplier ? `Payment to Blade Supplier` : `Payment to Welding Vendor`;
            }

            const vTxnRecord = {
                id: vTxnId,
                date: nowIso,
                vendorId: vendorId,
                vendorName: vendor.name,
                vendorType: vendorType,
                bladeQuantity: blades,
                ratePerBlade: rate,
                totalCost: totalCost,
                amountPaid: finalPaid,
                paymentStatus: status,
                notes: notes || defaultNote,
                billId: '',
                syncStatus: 'PENDING_SYNC'
            };

            await window.db.put('vendor_transactions', vTxnRecord);
            await window.db.addToSyncQueue('vendor_transaction', 'CREATE', vTxnRecord);

            if (form) form.reset();
            window.closeModal('modalVendorTxn');
            window.showToast(`Transaction saved for ${vendor.name}!`, 'success');

            await this.loadVendors();
            if (window.dashboardModule) await window.dashboardModule.loadStats();
            if (window.reportsModule) await window.reportsModule.renderActiveReport();
            window.apiService.syncPendingData();
        } catch (err) {
            console.error('[VendorsModule] Error saving vendor transaction:', err);
            window.showToast('Failed to record transaction. Please try again.', 'error');
        } finally {
            this.isSaving = false;
            if (submitBtn) submitBtn.disabled = false;
        }
    }

    // Populate Vendor Dropdowns in Billing Form and Reports Filter
    populateVendorDropdowns() {
        const billVendorSelect = document.getElementById('billWeldingVendorSelect');
        const reportVendorSelect = document.getElementById('reportVendorSelect');
        const txnVendorSelect = document.getElementById('vTxnVendorSelect');

        const activeVendors = this.vendors.filter(v => v.status !== 'INACTIVE');
        
        // 1. Bill Form: Only Welding Vendors are applicable for outsourced welding on bills
        const weldingVendors = activeVendors.filter(v => (v.type || 'WELDING') === 'WELDING');
        const billOptionsHtml = `<option value="">-- Select Welding Partner --</option>` + 
            weldingVendors.map(v => `<option value="${v.id}">${this.escapeHtml(v.name)} (${v.mobile})</option>`).join('');
        if (billVendorSelect) billVendorSelect.innerHTML = billOptionsHtml;

        // 2. Vendor Txn Modal: All vendors with category label
        const txnOptionsHtml = `<option value="">-- Select Vendor --</option>` + 
            activeVendors.map(v => {
                const labelType = v.type === 'BLADE_SUPPLIER' ? 'Blade Supplier' : 'Welding Vendor';
                return `<option value="${v.id}">${this.escapeHtml(v.name)} (${labelType})</option>`;
            }).join('');
        if (txnVendorSelect) txnVendorSelect.innerHTML = txnOptionsHtml;

        // 3. Reports Filter: All vendors
        if (reportVendorSelect) {
            const reportCategoryFilter = document.getElementById('reportVendorCategorySelect')?.value || '';
            const filteredForReport = reportCategoryFilter ? 
                this.vendors.filter(v => (v.type || 'WELDING') === reportCategoryFilter) : 
                this.vendors;

            reportVendorSelect.innerHTML = `<option value="">All Vendors</option>` + 
                filteredForReport.map(v => {
                    const labelType = v.type === 'BLADE_SUPPLIER' ? 'Blade Supplier' : 'Welding Vendor';
                    return `<option value="${v.id}">${this.escapeHtml(v.name)} (${labelType})</option>`;
                }).join('');
        }
    }

    // Show Vendor Ledger History Modal
    showVendorHistoryModal(vendorId) {
        const vendor = this.vendors.find(v => v.id === vendorId);
        if (!vendor) return;

        const vendorType = vendor.type || 'WELDING';
        const isBladeSupplier = vendorType === 'BLADE_SUPPLIER';
        const stats = this.getVendorStats(vendorId);

        document.getElementById('vHistoryTitle').textContent = `${vendor.name} (${isBladeSupplier ? 'Blade Supplier' : 'Welding Vendor'}) - Ledger & History`;
        document.getElementById('vHistoryMobile').textContent = `Mobile: ${vendor.mobile}`;
        document.getElementById('vHistoryBalance').textContent = `Pending Payable Balance: ₹${stats.pendingBalance.toLocaleString('en-IN')}`;

        const txns = stats.txns.sort((a, b) => new Date(b.date) - new Date(a.date));

        const tbody = document.getElementById('vHistoryTableBody');
        if (!txns || txns.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="empty-state">No transaction history found for this vendor.</td></tr>`;
        } else {
            tbody.innerHTML = txns.map(t => `
                <tr>
                    <td>${new Date(t.date).toLocaleDateString()}</td>
                    <td><strong>${this.escapeHtml(t.notes || (isBladeSupplier ? 'Blade Purchase' : 'Welding Job'))}</strong><br><small style="color:var(--text-dim);">${t.id}</small></td>
                    <td>${t.bladeQuantity ? t.bladeQuantity + ' @ ₹' + t.ratePerBlade : '-'}</td>
                    <td class="text-warning">${t.totalCost > 0 ? '₹' + t.totalCost.toLocaleString('en-IN') : '-'}</td>
                    <td class="text-success">${t.amountPaid > 0 ? '₹' + t.amountPaid.toLocaleString('en-IN') : '-'}</td>
                    <td><span class="badge ${t.paymentStatus === 'PAID' ? 'grinding' : 'welding'}">${t.paymentStatus}</span></td>
                </tr>
            `).join('');
        }

        window.openModal('modalVendorHistory');
    }

    escapeHtml(str) {
        return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
}

window.vendorsModule = new VendorsModule();
