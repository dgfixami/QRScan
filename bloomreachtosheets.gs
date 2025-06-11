/**
 * Simple function that replaces all content in the bloomreach_report sheet
 * with the latest data from the Bloomreach API
 */
function updateBloomreachReport() {
  var url = PropertiesService.getScriptProperties().getProperty("Bloomreach_reporturl");
  var payload = {
    "analysis_id": "6814bdbb89ce7cb036eb74b4",
    "timezone": "Europe/Amsterdam",
    "format": "table_json"
  };

  // API credentials
 var apiKeyId = PropertiesService.getScriptProperties().getProperty("Bloomreach_apiKeyId");
 var apiSecret = PropertiesService.getScriptProperties().getProperty("Bloomreach_apiSecret");
  var credentials = apiKeyId + ":" + apiSecret;
  var encodedCredentials = Utilities.base64Encode(credentials);

  var options = {
    "method": "post",
    "headers": {
      "accept": "application/json",
      "authorization": "Basic " + encodedCredentials,
      "content-type": "application/json"
    },
    "payload": JSON.stringify(payload)
  };

  try {
    var response = UrlFetchApp.fetch(url, options);
    var data = JSON.parse(response.getContentText());

    Logger.log("Retrieved data from API: " + data.rows.length + " rows");

    if (!data || !data.rows || data.rows.length === 0) {
      throw new Error("No data received from the API.");
    }

    var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = spreadsheet.getSheetByName("bloomreach_report");

    if (!sheet) {
      sheet = spreadsheet.insertSheet("bloomreach_report");
      // Add headers on the first run
      if (data.header) {
        sheet.appendRow(data.header);
      }
    }
    
    // Get existing data and create lookup for voucher codes
    var existingData = sheet.getDataRange().getValues();
    var existingVoucherCodes = new Map(); // Using Map instead of Set to store row index too
    var columnIndexForVoucher = 8; // Column I (0-based index) - CHANGED FROM 7 to 8
    var hasHeaderRow = true; // Assume first row is header
    
    // Check if first row is actually a header
    if (existingData.length > 0 && 
        existingData[0].length > columnIndexForVoucher && 
        existingData[0][columnIndexForVoucher] &&
        typeof existingData[0][columnIndexForVoucher] === 'string' &&
        !existingData[0][columnIndexForVoucher].toString().toLowerCase().includes("voucher") &&
        !existingData[0][columnIndexForVoucher].toString().toLowerCase().includes("code")) {
      // First row has data, not a header
      hasHeaderRow = false;
    }

    // Collect all existing voucher codes with their row indices
    for (var i = hasHeaderRow ? 1 : 0; i < existingData.length; i++) {
      if (existingData[i] && 
          existingData[i].length > columnIndexForVoucher && 
          existingData[i][columnIndexForVoucher]) {
        var code = existingData[i][columnIndexForVoucher].toString().trim();
        if (code) {
          existingVoucherCodes.set(code, i);
        }
      }
    }
    
    // Log the first 5 voucher codes for debugging
    var voucherCodeSample = Array.from(existingVoucherCodes.keys()).slice(0, 5).join(", ");
    Logger.log("Found " + existingVoucherCodes.size + " existing voucher codes in sheet. Sample: " + voucherCodeSample);
    
    // Create a list of voucher codes from the API response for comparison
    var apiVoucherCodes = new Set();
    data.rows.forEach(function(row) {
      if (row && row.length > columnIndexForVoucher && row[columnIndexForVoucher]) {
        var code = row[columnIndexForVoucher].toString().trim();
        if (code) {
          apiVoucherCodes.add(code);
        }
      }
    });
    
    // Log sample of API voucher codes too
    var apiCodeSample = Array.from(apiVoucherCodes).slice(0, 5).join(", ");
    Logger.log("API returned " + apiVoucherCodes.size + " voucher codes. Sample: " + apiCodeSample);

    // Process all API data rows
    var newRows = [];
    var updatedCount = 0;
    var reAddedRows = 0;
    
    data.rows.forEach(function(row) {
      if (row && row.length > columnIndexForVoucher && row[columnIndexForVoucher]) {
        var voucherCode = row[columnIndexForVoucher].toString().trim();
        
        // Check if this voucher code already exists in the sheet
        if (existingVoucherCodes.has(voucherCode)) {
          // It exists, so we don't need to add it again
          // Mark it as seen so we know it's still valid
          updatedCount++;
        } else {
          // New voucher code, add to the list of rows to append
          newRows.push(row);
          
          // Check if this was a previously seen code that was deleted from sheet
          if (apiVoucherCodes.has(voucherCode)) {
            reAddedRows++;
            Logger.log("Re-adding previously deleted voucher code: " + voucherCode);
          }
        }
      } else {
        // If row doesn't have a valid voucher code but has useful data, still add it
        newRows.push(row);
      }
    });

    // Log the counts for debugging
    Logger.log("Found " + newRows.length + " new rows to add");
    Logger.log("Found " + updatedCount + " existing rows that match");
    Logger.log("Re-adding " + reAddedRows + " previously deleted rows");

    // Sort new rows by voucher code (ascending)
    newRows.sort(function(a, b) {
      if (!a[columnIndexForVoucher] || !b[columnIndexForVoucher]) {
        return 0; // Handle null/undefined values
      }
      
      var codeA = a[columnIndexForVoucher].toString();
      var codeB = b[columnIndexForVoucher].toString();
      
      // Try to convert to numbers for numerical sorting
      var numA = parseInt(codeA.replace(/\D/g, ''), 10);
      var numB = parseInt(codeB.replace(/\D/g, ''), 10);
      
      if (!isNaN(numA) && !isNaN(numB)) {
        return numA - numB; // numerical sort
      } else {
        return String(codeA).localeCompare(String(codeB)); // alphabetical sort
      }
    });

    // Add the sorted new rows
    var newRowCount = 0;
    if (newRows.length > 0) {
      // Use batch append for better performance with many rows
      var valuesToAppend = newRows.map(function(row) {
        return row; // Each row is already an array of values
      });
      
      if (valuesToAppend.length > 0) {
        var startRow = existingData.length + 1; // +1 because sheet is 1-indexed
        var startCol = 1; // Start at column A
        var numRows = valuesToAppend.length;
        var numCols = valuesToAppend[0].length;
        
        sheet.getRange(startRow, startCol, numRows, numCols).setValues(valuesToAppend);
        newRowCount = valuesToAppend.length;
      }
    }

    // Show results
    var resultMessage = "Added " + newRowCount + " new rows (" + reAddedRows + " were re-added). " + 
                        updatedCount + " existing rows match API data.";
    Logger.log(resultMessage);
    SpreadsheetApp.getActiveSpreadsheet().toast(resultMessage, "Bloomreach Update", 5);

  } catch (error) {
    Logger.log("Error: " + error.message);
    SpreadsheetApp.getActiveSpreadsheet().toast("Error: " + error.message, "Error", 5);
  }
}

/**
 * Removes duplicate rows based on voucher codes in column I
 * Note: This function is kept for reference but no longer called automatically
 * @param {Sheet} sheet - The Google Sheet to clean
 */
function cleanupDuplicateVoucherCodes(sheet) {
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return; // Nothing to clean if only headers or empty
  
  var columnIndexForVoucher = 8; // Column I (0-based index) - CHANGED FROM 7 to 8
  var seenVoucherCodes = new Map(); // Maps voucher code to row index
  var rowsToDelete = []; // Rows to delete (in reverse order)
  var startRow = 0;
  
  // Check if first row is a header (doesn't have a valid voucher code or has "voucher" text)
  var isFirstRowHeader = false;
  if (data[0].length > columnIndexForVoucher) {
    var firstRowValue = data[0][columnIndexForVoucher];
    if (!firstRowValue || 
        firstRowValue.toString().trim() === "" || 
        firstRowValue.toString().toLowerCase().includes("voucher") ||
        firstRowValue.toString().toLowerCase().includes("code")) {
      isFirstRowHeader = true;
      startRow = 1; // Skip header row
    }
  }
  
  // Process all rows (including first row if it's not a header)
  for (var i = startRow; i < data.length; i++) {
    if (data[i] && data[i].length > columnIndexForVoucher) {
      var voucherCode = data[i][columnIndexForVoucher];
      if (voucherCode) {
        if (seenVoucherCodes.has(voucherCode)) {
          // Found duplicate, mark for deletion
          rowsToDelete.push(i + 1); // +1 because sheet is 1-indexed
        } else {
          seenVoucherCodes.set(voucherCode, i);
        }
      }
    }
  }
  
  // Delete rows from bottom to top to avoid shifting issues
  if (rowsToDelete.length > 0) {
    rowsToDelete.sort((a, b) => b - a); // Sort in descending order
    rowsToDelete.forEach(function(rowIndex) {
      sheet.deleteRow(rowIndex);
    });
    Logger.log("Cleaned up " + rowsToDelete.length + " duplicate rows.");
  }
}