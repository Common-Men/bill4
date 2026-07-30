/**
 * Blade Master - Google Apps Script Web App Backend
 * Serves as the REST API engine for authentication, data persistence, ID generation,
 * sheet sync management, OTP mailer, and automated Google Drive backups.
 * 
 * Deployment Note: Deploy as Web App -> Execute as: Me -> Who has access: Anyone
 */

// Optional: Enter your Google Spreadsheet ID here ONLY if Apps Script is Standalone (created at script.google.com).
// Leave empty if the script is bound to a Google Sheet (created inside Google Sheet -> Extensions -> Apps Script).
const SPREADSHEET_ID = '';

/**
 * Helper: Retrieve target Spreadsheet (handles container-bound & standalone scripts)
 */
function getSpreadsheet() {
  let ss = null;
  try {
    ss = SpreadsheetApp.getActiveSpreadsheet();
  } catch (e) {}

  if (!ss && SPREADSHEET_ID && SPREADSHEET_ID.trim() !== '') {
    ss = SpreadsheetApp.openById(SPREADSHEET_ID.trim());
  }

  if (ss) {
    try {
      if (ss.getSpreadsheetTimeZone() !== 'Asia/Kolkata') {
        ss.setSpreadsheetTimeZone('Asia/Kolkata');
      }
    } catch (e) {}
    return ss;
  }

  throw new Error('No active Google Spreadsheet found. If using standalone Apps Script, please set SPREADSHEET_ID at the top of Code.gs or attach this script to a Google Sheet (Extensions > Apps Script).');
}

/**
 * Helper: Retrieve current timestamp formatted in Indian Local Time (IST / Asia/Kolkata)
 */
function getIndianTimestamp(date) {
  if (!date) return Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd HH:mm:ss');
  
  if (date instanceof Date) {
    return Utilities.formatDate(date, 'Asia/Kolkata', 'yyyy-MM-dd HH:mm:ss');
  }

  const str = String(date).trim();
  if (!str) return Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd HH:mm:ss');

  // If already formatted like "yyyy-MM-dd HH:mm:ss" without offset
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(str)) {
    return str;
  }

  // If date-only string "yyyy-MM-dd"
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }

  const d = new Date(str);
  if (isNaN(d.getTime())) {
    return str;
  }

  return Utilities.formatDate(d, 'Asia/Kolkata', 'yyyy-MM-dd HH:mm:ss');
}

/**
 * Manual Setup Trigger: Run this function directly inside Apps Script editor or from Sheet Menu
 */
function setupDatabase() {
  initDatabaseSheets();
  const count = convertAllSheetsToIndianTime();
  SpreadsheetApp.getUi().alert(`Blade Master Database Initialized! ${count} timestamp(s) updated to Indian Kolkata Time (IST).`);
}

/**
 * Custom UI Menu in Google Sheets
 */
function onOpen() {
  try {
    const ui = SpreadsheetApp.getUi();
    ui.createMenu('Blade Master')
      .addItem('Initialize / Repair Database Sheets', 'setupDatabase')
      .addItem('Convert All UTC Times to Indian Time (IST)', 'menuConvertTimezones')
      .addItem('Create Drive Backup', 'handleCreateBackup')
      .addToUi();
  } catch (e) {}
}

function menuConvertTimezones() {
  const count = convertAllSheetsToIndianTime();
  SpreadsheetApp.getUi().alert(`Timezone conversion complete! ${count} timestamp(s) updated to Indian Kolkata Time (IST).`);
}

/**
 * Convert all existing timestamps and dates across all Google Sheets to Indian Local Time (Asia/Kolkata)
 */
function convertAllSheetsToIndianTime() {
  const ss = getSpreadsheet();
  
  try {
    ss.setSpreadsheetTimeZone('Asia/Kolkata');
  } catch (e) {}

  const sheetDefinitions = [
    { name: SHEETS.USERS, dateCols: [7, 9, 11] },           // Created Date, OTP Expiry, Sync Date
    { name: SHEETS.CUSTOMERS, dateCols: [8, 9] },            // Created Date, Sync Date
    { name: SHEETS.BILLS, dateCols: [4, 8] },                // Date, Sync Date
    { name: SHEETS.TRANSACTIONS, dateCols: [4, 9] },          // Date, Sync Date
    { name: SHEETS.PAYMENTS, dateCols: [4, 8] },              // Payment Date, Sync Date
    { name: SHEETS.VENDORS, dateCols: [7, 8] },               // Created Date, Sync Date
    { name: SHEETS.VENDOR_TRANSACTIONS, dateCols: [2, 12] },  // Date, Sync Date
    { name: SHEETS.BUSINESS_EXPENSES, dateCols: [2, 6, 7] },   // Expense Date, Created Date, Sync Date
    { name: SHEETS.SYNC_LOGS, dateCols: [3] }                // Sync Date
  ];

  let totalUpdated = 0;

  sheetDefinitions.forEach(def => {
    const sheet = getSheet(ss, def.name);
    if (!sheet) return;

    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return;

    const range = sheet.getDataRange();
    const values = range.getValues();

    let sheetUpdated = false;

    for (let r = 1; r < values.length; r++) {
      def.dateCols.forEach(colIdx => {
        const c = colIdx - 1;
        if (c < values[r].length) {
          const val = values[r][c];
          if (val !== undefined && val !== null && String(val).trim() !== '') {
            const formatted = getIndianTimestamp(val);
            if (formatted !== val) {
              values[r][c] = formatted;
              sheetUpdated = true;
              totalUpdated++;
            }
          }
        }
      });
    }

    if (sheetUpdated) {
      range.setValues(values);
    }
  });

  return totalUpdated;
}

// Global Sheet Names
const SHEETS = {
  USERS: 'Users',
  CUSTOMERS: 'Customers',
  BILLS: 'Bills',
  TRANSACTIONS: 'Transactions',
  PAYMENTS: 'Payments',
  VENDORS: 'Vendors',
  VENDOR_TRANSACTIONS: 'Vendor Transactions',
  BUSINESS_EXPENSES: 'Business Expenses',
  SYNC_LOGS: 'Sync Logs'
};

/**
 * Main Web App HTTP POST Endpoint
 */
function doPost(e) {
  try {
    const contents = JSON.parse(e.postData.contents);
    const action = contents.action;
    let responseData = { success: false, message: 'Invalid Action' };

    // Initialize sheets if missing
    initDatabaseSheets();

    switch (action) {
      case 'LOGIN':
        responseData = handleLogin(contents.username, contents.passwordHash);
        break;
      case 'FORGOT_PASSWORD_SEND_OTP':
        responseData = handleSendOtp(contents.email);
        break;
      case 'FORGOT_PASSWORD_VERIFY':
        responseData = handleVerifyOtpAndReset(contents.email, contents.otp, contents.newPasswordHash);
        break;
      case 'UPDATE_ADMIN_PROFILE':
        responseData = handleUpdateAdminProfile(contents.userId, contents.newUsername, contents.newEmail, contents.newPasswordHash, contents.newFullName);
        break;
      case 'SYNC_RECORD':
        responseData = handleSyncRecord(contents.entityType, contents.actionType, contents.recordData);
        break;
      case 'FETCH_ALL_DATA':
        responseData = handleFetchAllData();
        break;
      case 'TRIGGER_BACKUP':
        responseData = handleCreateBackup();
        break;
      case 'CONVERT_TIMEZONES':
        const updatedCount = convertAllSheetsToIndianTime();
        responseData = { success: true, message: `Converted ${updatedCount} timestamp(s) to Indian Kolkata Time (IST).`, updatedCount: updatedCount };
        break;
      default:
        responseData = { success: false, message: 'Action not supported: ' + action };
    }

    return ContentService
      .createTextOutput(JSON.stringify(responseData))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    const errorMsg = error.toString();
    logSync('GLOBAL', 'POST', 'ERROR', errorMsg);
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: errorMsg, message: errorMsg }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Main Web App HTTP GET Endpoint (Healthcheck / Simple Fetch)
 */
function doGet(e) {
  initDatabaseSheets();
  return ContentService
    .createTextOutput(JSON.stringify({ status: 'ACTIVE', system: 'Blade Master API Server', time: getIndianTimestamp() }))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Database Auto-Initialization: Setup Sheet headers if newly created or missing columns
 */
function initDatabaseSheets() {
  const ss = getSpreadsheet();
  const now = getIndianTimestamp();

  // 1. Users Sheet
  let userSheet = getSheet(ss, SHEETS.USERS);
  if (!userSheet) {
    userSheet = ss.insertSheet(SHEETS.USERS);
    userSheet.appendRow(['User ID', 'Username', 'Password Hash', 'Email', 'Role', 'Status', 'Created Date', 'OTP', 'OTP Expiry', 'Full Name', 'Sync Date']);
    userSheet.getRange(1, 1, 1, 11).setFontWeight('bold').setBackground('#1e293b').setFontColor('#ffffff');
    
    // Create default Owner user (Password: owner123 hashed SHA-256)
    userSheet.appendRow([
      'USR-00001',
      'owner',
      '4f8841a052cf07d8f58c73499df5e3a39e8bb43876e5d26a27e742880c58e2bf',
      'business@gmail.com',
      'Owner',
      'ACTIVE',
      now,
      '',
      '',
      'Owner Name',
      now
    ]);
  } else {
    // Ensure header column exists
    const headers = userSheet.getRange(1, 1, 1, Math.max(11, userSheet.getLastColumn())).getValues()[0];
    if (headers.length < 10 || headers[9] !== 'Full Name') {
      userSheet.getRange(1, 10).setValue('Full Name').setFontWeight('bold').setBackground('#1e293b').setFontColor('#ffffff');
    }
    if (headers.length < 11 || headers[10] !== 'Sync Date') {
      userSheet.getRange(1, 11).setValue('Sync Date').setFontWeight('bold').setBackground('#1e293b').setFontColor('#ffffff');
    }

    const data = userSheet.getDataRange().getValues();
    if (data.length <= 1) {
      userSheet.appendRow([
        'USR-00001',
        'owner',
        '4f8841a052cf07d8f58c73499df5e3a39e8bb43876e5d26a27e742880c58e2bf',
        'business@gmail.com',
        'Owner',
        'ACTIVE',
        now,
        '',
        '',
        'Owner Name',
        now
      ]);
    }
  }

  // 2. Customers Sheet
  let custSheet = getSheet(ss, SHEETS.CUSTOMERS);
  if (!custSheet) {
    custSheet = ss.insertSheet(SHEETS.CUSTOMERS);
    custSheet.appendRow(['Customer ID', 'Name', 'Mobile Number', 'Address', 'Opening Balance', 'Current Balance', 'Status', 'Created Date', 'Sync Date']);
    custSheet.getRange(1, 1, 1, 9).setFontWeight('bold').setBackground('#1e293b').setFontColor('#ffffff');
  } else {
    const headers = custSheet.getRange(1, 1, 1, Math.max(9, custSheet.getLastColumn())).getValues()[0];
    if (headers.length < 9 || headers[8] !== 'Sync Date') {
      custSheet.getRange(1, 9).setValue('Sync Date').setFontWeight('bold').setBackground('#1e293b').setFontColor('#ffffff');
    }
  }

  // 3. Bills Sheet
  let billsSheet = getSheet(ss, SHEETS.BILLS);
  if (!billsSheet) {
    billsSheet = ss.insertSheet(SHEETS.BILLS);
    billsSheet.appendRow(['Bill ID', 'Customer ID', 'Customer Name', 'Date', 'Service Details JSON', 'Total Amount', 'Payment Status', 'Sync Date']);
    billsSheet.getRange(1, 1, 1, 8).setFontWeight('bold').setBackground('#1e293b').setFontColor('#ffffff');
  } else {
    const headers = billsSheet.getRange(1, 1, 1, Math.max(8, billsSheet.getLastColumn())).getValues()[0];
    if (headers.length < 8 || headers[7] !== 'Sync Date') {
      billsSheet.getRange(1, 8).setValue('Sync Date').setFontWeight('bold').setBackground('#1e293b').setFontColor('#ffffff');
    }
  }

  // 4. Transactions Sheet
  let txnSheet = getSheet(ss, SHEETS.TRANSACTIONS);
  if (!txnSheet) {
    txnSheet = ss.insertSheet(SHEETS.TRANSACTIONS);
    txnSheet.appendRow(['Transaction ID', 'Customer ID', 'Customer Name', 'Date', 'Description', 'Debit (+)', 'Credit (-)', 'Balance', 'Sync Date']);
    txnSheet.getRange(1, 1, 1, 9).setFontWeight('bold').setBackground('#1e293b').setFontColor('#ffffff');
  } else {
    const headers = txnSheet.getRange(1, 1, 1, Math.max(9, txnSheet.getLastColumn())).getValues()[0];
    if (headers.length < 9 || headers[8] !== 'Sync Date') {
      txnSheet.getRange(1, 9).setValue('Sync Date').setFontWeight('bold').setBackground('#1e293b').setFontColor('#ffffff');
    }
  }

  // 5. Payments Sheet
  let paySheet = getSheet(ss, SHEETS.PAYMENTS);
  if (!paySheet) {
    paySheet = ss.insertSheet(SHEETS.PAYMENTS);
    paySheet.appendRow(['Payment ID', 'Customer ID', 'Customer Name', 'Payment Date', 'Amount', 'Payment Mode', 'Notes', 'Sync Date']);
    paySheet.getRange(1, 1, 1, 8).setFontWeight('bold').setBackground('#1e293b').setFontColor('#ffffff');
  } else {
    const headers = paySheet.getRange(1, 1, 1, Math.max(8, paySheet.getLastColumn())).getValues()[0];
    if (headers.length < 8 || headers[7] !== 'Sync Date') {
      paySheet.getRange(1, 8).setValue('Sync Date').setFontWeight('bold').setBackground('#1e293b').setFontColor('#ffffff');
    }
  }

  // 6. Vendors Sheet
  let vndSheet = getSheet(ss, SHEETS.VENDORS);
  if (!vndSheet) {
    vndSheet = ss.insertSheet(SHEETS.VENDORS);
    vndSheet.appendRow(['Vendor ID', 'Name', 'Mobile Number', 'Address', 'Notes', 'Status', 'Created Date', 'Sync Date', 'Vendor Type']);
    vndSheet.getRange(1, 1, 1, 9).setFontWeight('bold').setBackground('#1e293b').setFontColor('#ffffff');
  } else {
    const headers = vndSheet.getRange(1, 1, 1, Math.max(9, vndSheet.getLastColumn())).getValues()[0];
    if (headers.length < 8 || headers[7] !== 'Sync Date') {
      vndSheet.getRange(1, 8).setValue('Sync Date').setFontWeight('bold').setBackground('#1e293b').setFontColor('#ffffff');
    }
    if (headers.length < 9 || headers[8] !== 'Vendor Type') {
      vndSheet.getRange(1, 9).setValue('Vendor Type').setFontWeight('bold').setBackground('#1e293b').setFontColor('#ffffff');
    }

    // Ensure existing rows without Vendor Type are defaulted to WELDING
    const lastRow = vndSheet.getLastRow();
    if (lastRow > 1) {
      const typeRange = vndSheet.getRange(2, 9, lastRow - 1, 1);
      const typeValues = typeRange.getValues();
      let updated = false;
      for (let r = 0; r < typeValues.length; r++) {
        if (!typeValues[r][0] || String(typeValues[r][0]).trim() === '') {
          typeValues[r][0] = 'WELDING';
          updated = true;
        }
      }
      if (updated) {
        typeRange.setValues(typeValues);
      }
    }
  }

  // 7. Vendor Transactions Sheet
  let vTxnSheet = getSheet(ss, SHEETS.VENDOR_TRANSACTIONS);
  if (!vTxnSheet) {
    vTxnSheet = ss.insertSheet(SHEETS.VENDOR_TRANSACTIONS);
    vTxnSheet.appendRow(['Transaction ID', 'Date', 'Vendor ID', 'Vendor Name', 'Blade Quantity', 'Rate Per Blade', 'Total Cost', 'Amount Paid', 'Payment Status', 'Notes', 'Bill ID', 'Sync Date', 'Vendor Type']);
    vTxnSheet.getRange(1, 1, 1, 13).setFontWeight('bold').setBackground('#1e293b').setFontColor('#ffffff');
  } else {
    const headers = vTxnSheet.getRange(1, 1, 1, Math.max(13, vTxnSheet.getLastColumn())).getValues()[0];
    if (headers.length < 12 || headers[11] !== 'Sync Date') {
      vTxnSheet.getRange(1, 12).setValue('Sync Date').setFontWeight('bold').setBackground('#1e293b').setFontColor('#ffffff');
    }
    if (headers.length < 13 || headers[12] !== 'Vendor Type') {
      vTxnSheet.getRange(1, 13).setValue('Vendor Type').setFontWeight('bold').setBackground('#1e293b').setFontColor('#ffffff');
    }
  }

  // 8. Business Expenses Sheet
  let expSheet = getSheet(ss, SHEETS.BUSINESS_EXPENSES);
  if (!expSheet) {
    expSheet = ss.insertSheet(SHEETS.BUSINESS_EXPENSES);
    expSheet.appendRow(['Expense ID', 'Expense Date', 'Category', 'Amount', 'Description', 'Created Date', 'Sync Date']);
    expSheet.getRange(1, 1, 1, 7).setFontWeight('bold').setBackground('#1e293b').setFontColor('#ffffff');
  } else {
    const headers = expSheet.getRange(1, 1, 1, Math.max(7, expSheet.getLastColumn())).getValues()[0];
    if (headers.length < 7 || headers[6] !== 'Sync Date') {
      expSheet.getRange(1, 7).setValue('Sync Date').setFontWeight('bold').setBackground('#1e293b').setFontColor('#ffffff');
    }
  }

  // 9. Sync Logs Sheet
  let syncSheet = getSheet(ss, SHEETS.SYNC_LOGS);
  if (!syncSheet) {
    syncSheet = ss.insertSheet(SHEETS.SYNC_LOGS);
    syncSheet.appendRow(['Record ID', 'Entity Type', 'Sync Date', 'Status', 'Error Message']);
    syncSheet.getRange(1, 1, 1, 5).setFontWeight('bold').setBackground('#1e293b').setFontColor('#ffffff');
  }
}

/**
 * Helper: Find row index (1-based) by Primary Key ID in Column A
 */
function findRowById(sheet, targetId) {
  if (!sheet || !targetId) return -1;
  const data = sheet.getDataRange().getValues();
  const searchId = String(targetId).trim().toLowerCase();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] !== undefined && String(data[i][0]).trim().toLowerCase() === searchId) {
      return i + 1; // 1-based sheet row index
    }
  }
  return -1;
}

/**
 * Authentication: Validate Username & Password Hash
 */
function handleLogin(username, passwordHash) {
  const ss = getSpreadsheet();
  initDatabaseSheets();
  const sheet = getSheet(ss, SHEETS.USERS);
  if (!sheet) return { success: false, message: 'Users database sheet not found.' };

  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const uName = String(row[1] || '').trim();
    const uHash = String(row[2] || '').trim();
    const uStatus = String(row[5] || '').trim().toUpperCase();

    if (uName.toLowerCase() === username.toString().trim().toLowerCase() && uStatus === 'ACTIVE') {
      if (uHash === passwordHash.toString().trim()) {
        return {
          success: true,
          user: {
            id: row[0],
            username: row[1],
            email: row[3],
            role: row[4],
            fullName: row[9] || row[1]
          }
        };
      }
    }
  }
  return { success: false, message: 'Invalid credentials or inactive account.' };
}

/**
 * Forgot Password: Send 6-Digit Email OTP
 */
function handleSendOtp(email) {
  const ss = getSpreadsheet();
  initDatabaseSheets();
  const sheet = getSheet(ss, SHEETS.USERS);
  if (!sheet) return { success: false, message: 'Users database sheet not found.' };

  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][3] || '').trim().toLowerCase() === String(email).trim().toLowerCase()) {
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const expiry = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 mins expiry

      sheet.getRange(i + 1, 8).setValue(otp);
      sheet.getRange(i + 1, 9).setValue(expiry);

      // Send Email via Google MailApp
      MailApp.sendEmail({
        to: email,
        subject: 'Blade Master - Password Reset OTP Verification',
        htmlBody: `
          <div style="font-family: Arial, sans-serif; padding: 20px; color: #1e293b;">
            <h2>Blade Master Service Management</h2>
            <p>You requested a password reset for your account. Your verification code is:</p>
            <h1 style="color: #3b82f6; letter-spacing: 4px;">${otp}</h1>
            <p>This code will expire in 10 minutes. If you did not request this reset, please ignore this email.</p>
          </div>
        `
      });

      return { success: true, message: 'OTP sent successfully.' };
    }
  }
  return { success: false, message: 'Email address not found in database.' };
}

/**
 * Forgot Password: Verify OTP & Update Password Hash
 */
function handleVerifyOtpAndReset(email, otp, newPasswordHash) {
  const ss = getSpreadsheet();
  initDatabaseSheets();
  const sheet = getSheet(ss, SHEETS.USERS);
  if (!sheet) return { success: false, message: 'Users database sheet not found.' };

  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][3] || '').trim().toLowerCase() === String(email).trim().toLowerCase()) {
      const storedOtp = String(data[i][7] || '').trim();
      const storedExpiry = String(data[i][8] || '').trim();

      if (storedOtp === String(otp).trim() && new Date(storedExpiry) > new Date()) {
        sheet.getRange(i + 1, 3).setValue(newPasswordHash);
        sheet.getRange(i + 1, 8).setValue(''); // Clear OTP
        sheet.getRange(i + 1, 9).setValue('');
        sheet.getRange(i + 1, 11).setValue(getIndianTimestamp()); // Sync Date
        return { success: true, message: 'Password updated successfully.' };
      }
    }
  }
  return { success: false, message: 'Invalid or expired OTP.' };
}

/**
 * Update Admin / Owner User Profile Credentials
 */
function handleUpdateAdminProfile(userId, newUsername, newEmail, newPasswordHash, newFullName) {
  const ss = getSpreadsheet();
  initDatabaseSheets();
  const sheet = getSheet(ss, SHEETS.USERS);
  if (!sheet) return { success: false, message: 'Users database sheet not found.' };

  const data = sheet.getDataRange().getValues();
  const now = getIndianTimestamp();

  for (let i = 1; i < data.length; i++) {
    const isTarget = String(data[i][0]) === String(userId) || 
                     String(data[i][0]) === 'USR-00001' || 
                     String(data[i][0]) === 'USR-001' || 
                     String(data[i][4]).toLowerCase() === 'owner' || 
                     String(data[i][1]).toLowerCase() === String(newUsername || '').toLowerCase();

    if (isTarget) {
      if (newUsername) sheet.getRange(i + 1, 2).setValue(newUsername);
      if (newPasswordHash) sheet.getRange(i + 1, 3).setValue(newPasswordHash);
      if (newEmail) sheet.getRange(i + 1, 4).setValue(newEmail);
      if (newFullName !== undefined && newFullName !== null) sheet.getRange(i + 1, 10).setValue(newFullName);
      sheet.getRange(i + 1, 11).setValue(now); // Sync Date
      return { success: true, message: 'Admin profile updated successfully in Google Sheet.' };
    }
  }

  // If user row wasn't found, append default owner record
  const newRowId = userId || 'USR-00001';
  sheet.appendRow([
    newRowId,
    newUsername || 'owner',
    newPasswordHash || '4f8841a052cf07d8f58c73499df5e3a39e8bb43876e5d26a27e742880c58e2bf',
    newEmail || 'business@gmail.com',
    'Owner',
    'ACTIVE',
    now,
    '',
    '',
    newFullName || newUsername || 'Owner Name',
    now
  ]);

  return { success: true, message: 'Admin profile updated successfully in Google Sheet.' };
}

/**
 * Handle Sync Records from PWA Offline Queue into Sheets with Primary Key Deduplication (Upsert)
 */
function handleSyncRecord(entityType, actionType, record) {
  const ss = getSpreadsheet();
  const now = getIndianTimestamp();

  try {
    if (entityType === 'customer') {
      const sheet = getSheet(ss, SHEETS.CUSTOMERS);
      const rowIdx = findRowById(sheet, record.id);
      const createdDate = getIndianTimestamp(record.createdDate || now);

      if (rowIdx > 0) {
        // Update existing customer record (Primary Key Match)
        sheet.getRange(rowIdx, 2).setValue(record.name);
        sheet.getRange(rowIdx, 3).setValue(record.mobile);
        sheet.getRange(rowIdx, 4).setValue(record.address);
        if (record.openingBalance !== undefined) sheet.getRange(rowIdx, 5).setValue(record.openingBalance);
        sheet.getRange(rowIdx, 6).setValue(record.currentBalance);
        if (record.status) sheet.getRange(rowIdx, 7).setValue(record.status);
        sheet.getRange(rowIdx, 9).setValue(now); // Sync Date
      } else {
        // Append new customer record
        sheet.appendRow([
          record.id,
          record.name,
          record.mobile,
          record.address,
          record.openingBalance || 0,
          record.currentBalance || 0,
          record.status || 'ACTIVE',
          createdDate,
          now // Sync Date
        ]);
      }
    } else if (entityType === 'bill') {
      const sheet = getSheet(ss, SHEETS.BILLS);
      const rowIdx = findRowById(sheet, record.id);
      const servicesJson = typeof record.services === 'string' ? record.services : JSON.stringify(record.services || []);
      const billDate = getIndianTimestamp(record.date || now);

      if (rowIdx > 0) {
        // Update existing bill record (Primary Key Match)
        sheet.getRange(rowIdx, 2).setValue(record.customerId);
        sheet.getRange(rowIdx, 3).setValue(record.customerName);
        sheet.getRange(rowIdx, 4).setValue(billDate);
        sheet.getRange(rowIdx, 5).setValue(servicesJson);
        sheet.getRange(rowIdx, 6).setValue(record.totalAmount);
        sheet.getRange(rowIdx, 7).setValue(record.paymentStatus);
        sheet.getRange(rowIdx, 8).setValue(now); // Sync Date
      } else {
        // Append new bill record
        sheet.appendRow([
          record.id,
          record.customerId,
          record.customerName,
          billDate,
          servicesJson,
          record.totalAmount,
          record.paymentStatus,
          now // Sync Date
        ]);
      }
    } else if (entityType === 'payment') {
      const sheet = getSheet(ss, SHEETS.PAYMENTS);
      const rowIdx = findRowById(sheet, record.id);
      const paymentDate = getIndianTimestamp(record.paymentDate || record.date || now);

      if (rowIdx > 0) {
        // Update existing payment record (Primary Key Match)
        sheet.getRange(rowIdx, 2).setValue(record.customerId);
        sheet.getRange(rowIdx, 3).setValue(record.customerName);
        sheet.getRange(rowIdx, 4).setValue(paymentDate);
        sheet.getRange(rowIdx, 5).setValue(record.amount);
        sheet.getRange(rowIdx, 6).setValue(record.paymentMode);
        sheet.getRange(rowIdx, 7).setValue(record.notes);
        sheet.getRange(rowIdx, 8).setValue(now); // Sync Date
      } else {
        // Append new payment record
        sheet.appendRow([
          record.id,
          record.customerId,
          record.customerName,
          paymentDate,
          record.amount,
          record.paymentMode,
          record.notes,
          now // Sync Date
        ]);
      }
    } else if (entityType === 'transaction') {
      const sheet = getSheet(ss, SHEETS.TRANSACTIONS);
      const rowIdx = findRowById(sheet, record.id);
      const txnDate = getIndianTimestamp(record.date || now);

      if (rowIdx > 0) {
        // Update existing transaction record (Primary Key Match)
        sheet.getRange(rowIdx, 2).setValue(record.customerId);
        sheet.getRange(rowIdx, 3).setValue(record.customerName);
        sheet.getRange(rowIdx, 4).setValue(txnDate);
        sheet.getRange(rowIdx, 5).setValue(record.description);
        sheet.getRange(rowIdx, 6).setValue(record.debit || 0);
        sheet.getRange(rowIdx, 7).setValue(record.credit || 0);
        sheet.getRange(rowIdx, 8).setValue(record.balance || 0);
        sheet.getRange(rowIdx, 9).setValue(now); // Sync Date
      } else {
        // Append new transaction record
        sheet.appendRow([
          record.id,
          record.customerId,
          record.customerName,
          txnDate,
          record.description,
          record.debit || 0,
          record.credit || 0,
          record.balance || 0,
          now // Sync Date
        ]);
      }
    } else if (entityType === 'vendor') {
      const sheet = getSheet(ss, SHEETS.VENDORS);
      const rowIdx = findRowById(sheet, record.id);
      const vendorType = record.type || record.vendorType || 'WELDING';
      const createdDate = getIndianTimestamp(record.createdDate || now);

      if (rowIdx > 0) {
        sheet.getRange(rowIdx, 2).setValue(record.name);
        sheet.getRange(rowIdx, 3).setValue(record.mobile);
        sheet.getRange(rowIdx, 4).setValue(record.address || '');
        sheet.getRange(rowIdx, 5).setValue(record.notes || '');
        if (record.status) sheet.getRange(rowIdx, 6).setValue(record.status);
        sheet.getRange(rowIdx, 8).setValue(now);
        sheet.getRange(rowIdx, 9).setValue(vendorType);
      } else {
        sheet.appendRow([
          record.id,
          record.name,
          record.mobile,
          record.address || '',
          record.notes || '',
          record.status || 'ACTIVE',
          createdDate,
          now,
          vendorType
        ]);
      }
    } else if (entityType === 'vendor_transaction') {
      const sheet = getSheet(ss, SHEETS.VENDOR_TRANSACTIONS);
      const rowIdx = findRowById(sheet, record.id);
      const vendorType = record.vendorType || record.type || '';
      const vTxnDate = getIndianTimestamp(record.date || now);

      if (rowIdx > 0) {
        sheet.getRange(rowIdx, 2).setValue(vTxnDate);
        sheet.getRange(rowIdx, 3).setValue(record.vendorId);
        sheet.getRange(rowIdx, 4).setValue(record.vendorName);
        sheet.getRange(rowIdx, 5).setValue(record.bladeQuantity || 0);
        sheet.getRange(rowIdx, 6).setValue(record.ratePerBlade || 0);
        sheet.getRange(rowIdx, 7).setValue(record.totalCost || 0);
        sheet.getRange(rowIdx, 8).setValue(record.amountPaid || 0);
        sheet.getRange(rowIdx, 9).setValue(record.paymentStatus || 'PENDING');
        sheet.getRange(rowIdx, 10).setValue(record.notes || '');
        sheet.getRange(rowIdx, 11).setValue(record.billId || '');
        sheet.getRange(rowIdx, 12).setValue(now);
        sheet.getRange(rowIdx, 13).setValue(vendorType);
      } else {
        sheet.appendRow([
          record.id,
          vTxnDate,
          record.vendorId,
          record.vendorName,
          record.bladeQuantity || 0,
          record.ratePerBlade || 0,
          record.totalCost || 0,
          record.amountPaid || 0,
          record.paymentStatus || 'PENDING',
          record.notes || '',
          record.billId || '',
          now,
          vendorType
        ]);
      }
    } else if (entityType === 'business_expense' || entityType === 'expense') {
      const sheet = getSheet(ss, SHEETS.BUSINESS_EXPENSES);
      const rowIdx = findRowById(sheet, record.id);
      const expDate = getIndianTimestamp(record.date || now);
      const createdDate = getIndianTimestamp(record.createdDate || now);

      if (rowIdx > 0) {
        sheet.getRange(rowIdx, 2).setValue(expDate);
        sheet.getRange(rowIdx, 3).setValue(record.category || 'Other');
        sheet.getRange(rowIdx, 4).setValue(record.amount || 0);
        sheet.getRange(rowIdx, 5).setValue(record.description || '');
        sheet.getRange(rowIdx, 7).setValue(now);
      } else {
        sheet.appendRow([
          record.id,
          expDate,
          record.category || 'Other',
          record.amount || 0,
          record.description || '',
          createdDate,
          now
        ]);
      }
    } else if (entityType === 'admin_profile' || entityType === 'user') {
      return handleUpdateAdminProfile(
        record.userId || record.id || 'USR-00001',
        record.newUsername || record.username,
        record.newEmail || record.email,
        record.newPasswordHash || record.passwordHash,
        record.newFullName || record.fullName
      );
    }

    logSync(record.id || 'ADMIN', entityType, 'SUCCESS', '');
    return { success: true, recordId: record.id || 'ADMIN' };

  } catch (err) {
    logSync(record.id || 'ADMIN', entityType, 'ERROR', err.toString());
    return { success: false, error: err.toString() };
  }
}

/**
 * Helper: Find sheet by name (case-insensitive, trimmed, and fuzzy match tolerant)
 */
function getSheet(ss, sheetName) {
  if (!ss) return null;
  const exactSheet = ss.getSheetByName(sheetName);
  if (exactSheet) return exactSheet;

  const search = String(sheetName).trim().toLowerCase();
  const sheets = ss.getSheets();
  for (let i = 0; i < sheets.length; i++) {
    if (sheets[i].getName().trim().toLowerCase() === search) {
      return sheets[i];
    }
  }
  return null;
}

/**
 * Fetch All Application Data from Google Sheets
 */
function handleFetchAllData() {
  const ss = getSpreadsheet();

  // 1. Customers Sheet
  let custSheet = getSheet(ss, SHEETS.CUSTOMERS);
  if (!custSheet && ss.getSheets().length > 0) {
    const allSheets = ss.getSheets();
    for (let s = 0; s < allSheets.length; s++) {
      const name = allSheets[s].getName().toLowerCase();
      if (name.includes('cust') || name.includes('user') || name.includes('client')) {
        custSheet = allSheets[s];
        break;
      }
    }
    if (!custSheet) custSheet = allSheets[0]; // Fallback to first sheet
  }

  const custData = custSheet ? custSheet.getDataRange().getValues() : [];
  const customers = [];
  for (let i = 1; i < custData.length; i++) {
    const row = custData[i];
    const col0 = row[0] !== undefined ? String(row[0]).trim() : '';
    const col1 = row[1] !== undefined ? String(row[1]).trim() : '';
    const col2 = row[2] !== undefined ? String(row[2]).trim() : '';

    if (!col0 && !col1 && !col2) continue; // Skip completely empty rows

    let id, name, mobile, address, openingBal, currentBal, status, createdDate;

    // Check if Column A (col0) is a Customer ID (starts with "CUS-", "USR-", "ID-", "C-")
    const isCol0Id = /^CUS-|^USR-|^ID-|^C-/i.test(col0);

    if (isCol0Id) {
      // Standard Column Layout: [ID, Name, Mobile, Address, OpeningBal, CurrentBal, Status, Date]
      id = col0;
      name = col1 || ('Customer ' + id);
      mobile = col2;
      address = String(row[3] || '').trim();
      openingBal = Number(row[4]) || 0;
      currentBal = Number(row[5] !== undefined && row[5] !== '' ? row[5] : (row[4] || 0));
      status = String(row[6] || 'ACTIVE').trim();
      createdDate = row[7] instanceof Date ? getIndianTimestamp(row[7]) : String(row[7] || getIndianTimestamp());
    } else {
      // Manual / Alternate Layout: Column A is Name! [Name, Mobile, Address, OpeningBal, CurrentBal, ...]
      name = col0 || col1 || ('Customer #' + i);
      id = 'CUS-' + Math.floor(Math.random() * 90000 + 10000);
      mobile = col1;
      address = String(row[2] || '').trim();
      openingBal = Number(row[3]) || Number(row[4]) || 0;
      currentBal = Number(row[4] !== undefined && row[4] !== '' ? row[4] : (row[3] || openingBal));
      status = 'ACTIVE';
      createdDate = getIndianTimestamp();
    }

    customers.push({
      id: id,
      name: name,
      mobile: mobile,
      address: address,
      openingBalance: openingBal,
      currentBalance: currentBal,
      status: status,
      createdDate: createdDate
    });
  }

  // Build Customer ID & Name Lookup Map
  const custMap = {};
  customers.forEach(c => {
    if (c.id) custMap[c.id] = c.name;
  });

  // 2. Bills Sheet
  let billsSheet = getSheet(ss, SHEETS.BILLS);
  if (!billsSheet) {
    const allSheets = ss.getSheets();
    for (let s = 0; s < allSheets.length; s++) {
      if (allSheets[s].getName().toLowerCase().includes('bill')) {
        billsSheet = allSheets[s];
        break;
      }
    }
  }

  const billsData = billsSheet ? billsSheet.getDataRange().getValues() : [];
  const bills = [];
  for (let i = 1; i < billsData.length; i++) {
    const row = billsData[i];
    if ((row[0] !== undefined && String(row[0]).trim() !== '') || (row[1] !== undefined && String(row[1]).trim() !== '')) {
      let services = [];
      try { services = typeof row[4] === 'string' ? JSON.parse(row[4]) : (Array.isArray(row[4]) ? row[4] : []); } catch(e) {}
      const billId = String(row[0] || '').trim() || ('BILL-' + i);
      const customerId = String(row[1] || '').trim();
      let customerName = String(row[2] || '').trim();
      if (!customerName && customerId && custMap[customerId]) {
        customerName = custMap[customerId];
      }

      bills.push({
        id: billId,
        customerId: customerId,
        customerName: customerName || 'Customer',
        date: row[3] instanceof Date ? getIndianTimestamp(row[3]) : String(row[3] || getIndianTimestamp()),
        services: services,
        totalAmount: Number(row[5]) || 0,
        paymentStatus: String(row[6] || 'Unpaid').trim()
      });
    }
  }

  // 3. Payments Sheet
  let paySheet = getSheet(ss, SHEETS.PAYMENTS);
  if (!paySheet) {
    const allSheets = ss.getSheets();
    for (let s = 0; s < allSheets.length; s++) {
      if (allSheets[s].getName().toLowerCase().includes('pay')) {
        paySheet = allSheets[s];
        break;
      }
    }
  }

  const payData = paySheet ? paySheet.getDataRange().getValues() : [];
  const payments = [];
  for (let i = 1; i < payData.length; i++) {
    const row = payData[i];
    if ((row[0] !== undefined && String(row[0]).trim() !== '') || (row[1] !== undefined && String(row[1]).trim() !== '')) {
      const payId = String(row[0] || '').trim() || ('PAY-' + i);
      const customerId = String(row[1] || '').trim();
      let customerName = String(row[2] || '').trim();
      if (!customerName && customerId && custMap[customerId]) {
        customerName = custMap[customerId];
      }

      payments.push({
        id: payId,
        customerId: customerId,
        customerName: customerName || 'Customer',
        paymentDate: row[3] instanceof Date ? getIndianTimestamp(row[3]) : String(row[3] || getIndianTimestamp()),
        amount: Number(row[4]) || 0,
        paymentMode: String(row[5] || 'Cash').trim(),
        notes: String(row[6] || '').trim()
      });
    }
  }

  // 4. Transactions Sheet
  let txnSheet = getSheet(ss, SHEETS.TRANSACTIONS);
  if (!txnSheet) {
    const allSheets = ss.getSheets();
    for (let s = 0; s < allSheets.length; s++) {
      const name = allSheets[s].getName().toLowerCase();
      if (name.includes('trans') || name.includes('txn') || name.includes('ledger')) {
        txnSheet = allSheets[s];
        break;
      }
    }
  }

  const txnData = txnSheet ? txnSheet.getDataRange().getValues() : [];
  const transactions = [];
  for (let i = 1; i < txnData.length; i++) {
    const row = txnData[i];
    if ((row[0] !== undefined && String(row[0]).trim() !== '') || (row[1] !== undefined && String(row[1]).trim() !== '')) {
      const txnId = String(row[0] || '').trim() || ('TXN-' + i);
      const customerId = String(row[1] || '').trim();
      let customerName = String(row[2] || '').trim();
      if (!customerName && customerId && custMap[customerId]) {
        customerName = custMap[customerId];
      }

      transactions.push({
        id: txnId,
        customerId: customerId,
        customerName: customerName || 'Customer',
        date: row[3] instanceof Date ? getIndianTimestamp(row[3]) : String(row[3] || getIndianTimestamp()),
        description: String(row[4] || '').trim(),
        debit: Number(row[5]) || 0,
        credit: Number(row[6]) || 0,
        balance: Number(row[7]) || 0
      });
    }
  }

  // 5. Vendors Sheet
  let vndSheet = getSheet(ss, SHEETS.VENDORS);
  const vndData = vndSheet ? vndSheet.getDataRange().getValues() : [];
  const vendors = [];
  for (let i = 1; i < vndData.length; i++) {
    const row = vndData[i];
    if (row[0] !== undefined && String(row[0]).trim() !== '') {
      const rawType = row[8] ? String(row[8]).trim() : '';
      const vType = (rawType === 'BLADE_SUPPLIER' || rawType === 'WELDING') ? rawType : 'WELDING';
      vendors.push({
        id: String(row[0]).trim(),
        name: String(row[1] || '').trim(),
        mobile: String(row[2] || '').trim(),
        address: String(row[3] || '').trim(),
        notes: String(row[4] || '').trim(),
        status: String(row[5] || 'ACTIVE').trim(),
        createdDate: row[6] instanceof Date ? getIndianTimestamp(row[6]) : String(row[6] || getIndianTimestamp()),
        type: vType,
        vendorType: vType
      });
    }
  }

  // 6. Vendor Transactions Sheet
  let vTxnSheet = getSheet(ss, SHEETS.VENDOR_TRANSACTIONS);
  const vTxnData = vTxnSheet ? vTxnSheet.getDataRange().getValues() : [];
  const vendorTransactions = [];
  for (let i = 1; i < vTxnData.length; i++) {
    const row = vTxnData[i];
    if (row[0] !== undefined && String(row[0]).trim() !== '') {
      const rawType = row[12] ? String(row[12]).trim() : '';
      const vtType = (rawType === 'BLADE_SUPPLIER' || rawType === 'WELDING') ? rawType : '';
      vendorTransactions.push({
        id: String(row[0]).trim(),
        date: row[1] instanceof Date ? getIndianTimestamp(row[1]) : String(row[1] || getIndianTimestamp()),
        vendorId: String(row[2] || '').trim(),
        vendorName: String(row[3] || '').trim(),
        bladeQuantity: Number(row[4]) || 0,
        ratePerBlade: Number(row[5]) || 0,
        totalCost: Number(row[6]) || 0,
        amountPaid: Number(row[7]) || 0,
        paymentStatus: String(row[8] || 'PENDING').trim(),
        notes: String(row[9] || '').trim(),
        billId: String(row[10] || '').trim(),
        type: vtType,
        vendorType: vtType
      });
    }
  }

  // 7. Business Expenses Sheet
  let expSheet = getSheet(ss, SHEETS.BUSINESS_EXPENSES);
  const expData = expSheet ? expSheet.getDataRange().getValues() : [];
  const businessExpenses = [];
  for (let i = 1; i < expData.length; i++) {
    const row = expData[i];
    if (row[0] !== undefined && String(row[0]).trim() !== '') {
      businessExpenses.push({
        id: String(row[0]).trim(),
        date: row[1] instanceof Date ? getIndianTimestamp(row[1]) : String(row[1] || getIndianTimestamp()),
        category: String(row[2] || 'Other').trim(),
        amount: Number(row[3]) || 0,
        description: String(row[4] || '').trim(),
        createdDate: row[5] instanceof Date ? getIndianTimestamp(row[5]) : String(row[5] || getIndianTimestamp())
      });
    }
  }

  // 8. Users Sheet (Admin Profile)
  let adminProfile = null;
  let userSheet = getSheet(ss, SHEETS.USERS);
  if (userSheet) {
    const userData = userSheet.getDataRange().getValues();
    if (userData.length > 1) {
      const uRow = userData[1]; // First user record
      adminProfile = {
        id: uRow[0],
        username: uRow[1],
        email: uRow[3],
        role: uRow[4],
        fullName: uRow[9] || uRow[1]
      };
    }
  }

  return {
    success: true,
    data: {
      customers: customers,
      bills: bills,
      payments: payments,
      transactions: transactions,
      vendors: vendors,
      vendorTransactions: vendorTransactions,
      businessExpenses: businessExpenses,
      adminProfile: adminProfile
    }
  };
}

/**
 * Log Sync Execution into Sync Logs Sheet
 */
function logSync(recordId, entityType, status, errorMsg) {
  try {
    const ss = getSpreadsheet();
    const sheet = getSheet(ss, SHEETS.SYNC_LOGS);
    if (sheet) {
      sheet.appendRow([recordId, entityType, getIndianTimestamp(), status, errorMsg]);
    }
  } catch (e) {}
}

/**
 * Automatic Google Drive Database Backup System
 */
function handleCreateBackup() {
  try {
    const ss = getSpreadsheet();
    const file = DriveApp.getFileById(ss.getId());
    
    // Create Backup Folder if not existing
    const folderName = 'BladeMaster_Backups';
    const folders = DriveApp.getFoldersByName(folderName);
    let backupFolder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);

    const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd_HHmmss');
    const backupName = `BladeMaster_Backup_${timestamp}`;
    
    file.makeCopy(backupName, backupFolder);
    return { success: true, backupName: backupName, message: 'Google Drive backup created successfully.' };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}
