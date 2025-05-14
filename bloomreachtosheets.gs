/**
 * Simple function that replaces all content in the bloomreach_report sheet
 * with the latest data from the Bloomreach API
 */
function updateBloomreachReport() {
  var url = "https://api.eu1.exponea.com/data/v2/projects/b9f7648e-b449-11ed-9af1-72d440a9cf25/analyses/report";
  var payload = {
    "analysis_id": "6814bdbb89ce7cb036eb74b4",
    "timezone": "Europe/Amsterdam",
    "format": "table_json"
  };

  // API credentials
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
    // Fetch data from API
    var response = UrlFetchApp.fetch(url, options);
    var data = JSON.parse(response.getContentText());

    if (!data || !data.rows || data.rows.length === 0) {
      throw new Error("No data received from the API.");
    }

    var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = spreadsheet.getSheetByName("bloomreach_report");
    
    // If sheet exists, clear it completely
    if (sheet) {
      var lastRow = sheet.getLastRow();
      var lastCol = sheet.getLastColumn();
      
      if (lastRow > 0 && lastCol > 0) {
      }
    } else {
      // Create new sheet if needed
      sheet = spreadsheet.insertSheet("bloomreach_report");
    }
    
    // Add headers first
    if (data.header) {
      sheet.appendRow(data.header);
    }
    
    // Sort rows by voucher code (column H, index 7)
    var columnIndexForVoucher = 7;
    data.rows.sort(function(a, b) {
      var codeA = a[columnIndexForVoucher];
      var codeB = b[columnIndexForVoucher];
      
      // Try numerical sort first
      var numA = parseInt(codeA.replace(/\D/g, ''), 10);
      var numB = parseInt(codeB.replace(/\D/g, ''), 10);
      
      if (!isNaN(numA) && !isNaN(numB)) {
        return numA - numB;
      } else {
        return String(codeA).localeCompare(String(codeB));
      }
    });
    
    // Add all rows to the sheet
    var rowCount = data.rows.length;
    if (rowCount > 0) {
      // Get existing voucher codes from column I
      var existingVoucherCodes = {};
      if (sheet.getLastRow() > 1) {  // Check if there's data beyond headers
        var existingCodes = sheet.getRange(2, 9, sheet.getLastRow()-1, 1).getValues(); // Column I = 9
        for (var j = 0; j < existingCodes.length; j++) {
          if (existingCodes[j][0]) {
            existingVoucherCodes[existingCodes[j][0]] = true;
          }
        }
      }
      
      // For better performance with large datasets
      var batchSize = 100;
      var addedCount = 0;
      var skippedCount = 0;
      
      for (var i = 0; i < rowCount; i += batchSize) {
        var batch = data.rows.slice(i, Math.min(i + batchSize, rowCount));
        batch.forEach(function(row) {
          // Check if voucher code (column I, index 8) already exists
          var voucherCode = row[8]; // Index 8 corresponds to column I
          if (!voucherCode || !existingVoucherCodes[voucherCode]) {
            sheet.appendRow(row);
            // Add to our tracking to prevent duplicates within the current batch too
            if (voucherCode) {
              existingVoucherCodes[voucherCode] = true;
            }
            addedCount++;
          } else {
            skippedCount++;
          }
        });
      }
      
      var message = "Sheet updated with " + addedCount + " new rows from Bloomreach.";
      if (skippedCount > 0) {
        message += " " + skippedCount + " duplicate rows were skipped.";
      }
      SpreadsheetApp.getActiveSpreadsheet().toast(message, "Complete", 5);
    } else {
      SpreadsheetApp.getActiveSpreadsheet().toast("No data to add from Bloomreach.", "Info", 3);
    }

  } catch (error) {
    Logger.log("Error: " + error.message);
    SpreadsheetApp.getActiveSpreadsheet().toast("Error: " + error.message, "Error", 5);
  }
}

