function getBloomreachReport() {
  var url = "https://api.eu1.exponea.com/data/v2/projects/b9f7648e-b449-11ed-9af1-72d440a9cf25/analyses/report";
  var payload = {
    "analysis_id": "6814bdbb89ce7cb036eb74b4",
    "timezone": "Europe/Amsterdam",
    "format": "table_json"
  };

  // Replace with your actual API Key ID and Secret
  var apiKeyId = "qgxmkbkmg5vb1k5uf7kmahoiu6kvu94w35fr3xxplvvsmixex24ghbxqahofoabs";
  var apiSecret = "9fajdz823o77jonn292fhrijufma95mx3193l8h9d7c2hhc8hhk2d9ayrx5zz4cw";
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

    Logger.log(data);

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

    // Clean up existing duplicates first
    cleanupDuplicateVoucherCodes(sheet);
    
    // After cleanup, get fresh data
    var existingData = sheet.getDataRange().getValues();
    var existingVoucherCodes = new Set();
    var columnIndexForVoucher = 7; // Column H (0-based index)
    var hasHeaderRow = true; // Assume first row is header
    
    // Check if first row is actually a header (doesn't have a valid voucher code)
    if (existingData.length > 0 && 
        existingData[0].length > columnIndexForVoucher && 
        existingData[0][columnIndexForVoucher] &&
        existingData[0][columnIndexForVoucher].toString().trim() !== "") {
      // First row has data, not header
      hasHeaderRow = false;
      // Include first row in voucher code check
      existingVoucherCodes.add(existingData[0][columnIndexForVoucher]);
    }

    // Check all remaining rows
    for (var i = hasHeaderRow ? 1 : 0; i < existingData.length; i++) {
      if (existingData[i] && existingData[i].length > columnIndexForVoucher) {
        existingVoucherCodes.add(existingData[i][columnIndexForVoucher]);
      }
    }

    // Filter out rows with existing voucher codes
    var newRows = [];
    data.rows.forEach(function(row) {
      if (row && row.length > columnIndexForVoucher) {
        var voucherCode = row[columnIndexForVoucher];
        // Only add if voucher code is not already in the sheet
        if (!existingVoucherCodes.has(voucherCode)) {
          newRows.push(row);
          existingVoucherCodes.add(voucherCode); // Add to set to prevent duplicates in the batch
        }
      }
    });

    // Sort new rows by voucher code (ascending)
    newRows.sort(function(a, b) {
      var codeA = a[columnIndexForVoucher];
      var codeB = b[columnIndexForVoucher];
      
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
    newRows.forEach(function(newRow) {
      sheet.appendRow(newRow);
      newRowCount++;
    });

    if (newRowCount > 0) {
      Logger.log("Added " + newRowCount + " new rows with unique voucher codes.");
      SpreadsheetApp.getActiveSpreadsheet().toast("Added " + newRowCount + " new rows with unique voucher codes.", "New Data", 3);
    } else {
      Logger.log("No new voucher codes to add.");
    }

  } catch (error) {
    Logger.log("Error: " + error.message);
    SpreadsheetApp.getActiveSpreadsheet().toast("Error: " + error.message, "Error", 5);
  }
}

/**
 * Removes duplicate rows based on voucher codes in column H
 * @param {Sheet} sheet - The Google Sheet to clean
 */
function cleanupDuplicateVoucherCodes(sheet) {
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return; // Nothing to clean if only headers or empty
  
  var columnIndexForVoucher = 7; // Column H (0-based index)
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