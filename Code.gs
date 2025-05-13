// Google Apps Script to handle QR code scan data
// This file should be created in the Google Apps Script editor at:
// https://script.google.com/macros/s/AKfycbxLj2Yh4GAhePBdGhAC53n3KOJF9gNs5BGvlvTsFvYEz6KGjZFjQ7avEJvkRcYz8kSF/exec

// Define the doGet function to handle GET requests from testing
function doGet(e) {
  // Handle OPTIONS request for CORS preflight
  if (e.method === 'OPTIONS') {
    return handleOptions();
  }
  
  // Check if this is a lookup request
  if (e && e.parameter && e.parameter.code) {
    return addCorsHeaders(handleLookup(e.parameter.code));
  }
  
  // Default response for simple testing
  return addCorsHeaders(ContentService.createTextOutput("QR Code API is running"));
}

// Update handleLookup function for new column structure
function handleLookup(code) {
  try {
    // Get the active spreadsheet
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = spreadsheet.getSheetByName("Sheet1");
    
    if (!sheet) {
      return createResponse(false, "Sheet1 not found in the spreadsheet");
    }
    
    // Find the row with the matching code in column A (was column G)
    const dataRange = sheet.getRange("A:A").getValues();
    let foundRow = -1;
    
    for (let i = 0; i < dataRange.length; i++) {
      if (dataRange[i][0] === code) {
        foundRow = i + 1; // Convert to 1-based index
        break;
      }
    }
    
    if (foundRow === -1) {
      return createResponse(false, "Code not found in spreadsheet");
    }
    
    // Get the row data (adjust column range as needed for your sheet)
    // Expand the range to include name (column F), email (column G) and timestamp (column H)
    const rowData = sheet.getRange(foundRow, 1, 1, 8).getValues()[0];
    
    // Format dates for consistent display
    const timezone = spreadsheet.getSpreadsheetTimeZone();
    let checkInTime = rowData[2] || ""; // Column C (was column J)
    let goodieBagTime = rowData[4] || ""; // Column E (was column L)
    let timestamp = rowData[7] || ""; // Column H (timestamp)
    
    // Enhanced date formatting with day of week
    if (checkInTime instanceof Date && !isNaN(checkInTime.getTime())) {
      checkInTime = Utilities.formatDate(checkInTime, timezone, "dd/MM/yyyy HH:mm:ss");
    }
    
    if (goodieBagTime instanceof Date && !isNaN(goodieBagTime.getTime())) {
      goodieBagTime = Utilities.formatDate(goodieBagTime, timezone, "dd/MM/yyyy HH:mm:ss");
    }
    
    if (timestamp instanceof Date && !isNaN(timestamp.getTime())) {
      // Get day of the week
      const dayOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][timestamp.getDay()];
      const formattedDate = Utilities.formatDate(timestamp, timezone, "dd/MM/yyyy");
      timestamp = dayOfWeek + " " + formattedDate; // Format with day name
    }
    
    // Format the data for response with new column structure
    const attendeeData = {
      code: rowData[0] || "", // Column A (QR Code)
      isCheckedIn: rowData[1] || false, // Column B (Check-in)
      checkInTime: checkInTime, // Column C (Check-in time)
      hasGoodieBag: rowData[3] || false, // Column D (Goodie bag)
      goodieBagTime: goodieBagTime, // Column E (Goodie bag time)
      name: rowData[5] || "", // Column F (Name)
      email: rowData[6] || "", // Column G (Email)
      timestamp: timestamp // Column H (Timestamp)
    };
    
    // Return the data
    return createResponse(true, "Attendee data retrieved", attendeeData);
    
  } catch (error) {
    Logger.log("Lookup error: " + error.toString());
    return createResponse(false, "Error processing lookup: " + error.toString());
  }
}

// Define the doPost function to handle POST requests with new column structure
function doPost(e) {
  // Handle OPTIONS request for CORS preflight
  if (e.method === 'OPTIONS') {
    return handleOptions();
  }
  
  try {
    // Handle CORS preflight requests
    if (e.postData === undefined) {
      return addCorsHeaders(ContentService.createTextOutput('{"success":false,"message":"No data received"}')
        .setMimeType(ContentService.MimeType.JSON));
    }
    
    // Parse the incoming data
    const data = JSON.parse(e.postData.contents);
    
    // Log the received data for debugging
    Logger.log("Received data: " + JSON.stringify(data));
    
    // Validate required data
    if (!data.code) {
      return addCorsHeaders(createResponse(false, "Missing QR code data"));
    }
    
    if (!data.mode) {
      return addCorsHeaders(createResponse(false, "Missing mode data"));
    }
    
    // Get the active spreadsheet
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = spreadsheet.getSheetByName("Sheet1");
    
    if (!sheet) {
      return addCorsHeaders(createResponse(false, "Sheet1 not found in the spreadsheet"));
    }
    
    // Find the row with the matching code in column A (was column G)
    const dataRange = sheet.getRange("A:A").getValues();
    let foundRow = -1;
    
    for (let i = 0; i < dataRange.length; i++) {
      if (dataRange[i][0] === data.code) {
        foundRow = i + 1; // Convert to 1-based index
        break;
      }
    }
    
    if (foundRow === -1) {
      return addCorsHeaders(createResponse(false, "Code not found in spreadsheet"));
    }
    
    // Get current timestamp in local timezone
    const now = new Date();
    const timestamp = Utilities.formatDate(now, SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone(), "dd/MM/yyyy HH:mm:ss");
    
    // Update the appropriate columns based on mode, but only if they're empty
    if (data.mode === "Check-in") {
      // Check if checkbox in column B (was column I) is already set
      const currentCheckInValue = sheet.getRange(foundRow, 2).getValue();
      if (!currentCheckInValue) {
        // Only set checkbox if it's not already checked
        sheet.getRange(foundRow, 2).setValue(true);
        
        // Check if timestamp in column C (was column J) is empty
        const currentCheckInTime = sheet.getRange(foundRow, 3).getValue();
        if (!currentCheckInTime) {
          // Only set timestamp if it's empty
          sheet.getRange(foundRow, 3).setValue(timestamp);
        }
        
        Logger.log("Updated Check-in status and timestamp for code: " + data.code + " in row " + foundRow);
      } else {
        Logger.log("Check-in already recorded for code: " + data.code + " in row " + foundRow + ", not overwriting data");
      }
    } else if (data.mode === "Goodie Bag") {
      // Check if checkbox in column D (was column K) is already set
      const currentGoodieBagValue = sheet.getRange(foundRow, 4).getValue();
      if (!currentGoodieBagValue) {
        // Only set checkbox if it's not already checked
        sheet.getRange(foundRow, 4).setValue(true);
        
        // Check if timestamp in column E (was column L) is empty
        const currentGoodieBagTime = sheet.getRange(foundRow, 5).getValue();
        if (!currentGoodieBagTime) {
          // Only set timestamp if it's empty
          sheet.getRange(foundRow, 5).setValue(timestamp);
        }
        
        Logger.log("Updated Goodie Bag status and timestamp for code: " + data.code + " in row " + foundRow);
      } else {
        Logger.log("Goodie Bag already recorded for code: " + data.code + " in row " + foundRow + ", not overwriting data");
      }
    } else {
      return addCorsHeaders(createResponse(false, "Invalid mode: " + data.mode));
    }
    
    // You can also log the scan in a dedicated log sheet
    logScan(data, foundRow, timestamp);
    
    // Return success response with CORS headers
    return addCorsHeaders(createResponse(true, "QR code processed successfully for mode: " + data.mode));
    
  } catch (error) {
    Logger.log("Error: " + error.toString());
    return addCorsHeaders(createResponse(false, "Error processing request: " + error.toString()));
  }
}

// Helper function to log scans in a separate sheet for historical records
function logScan(data, rowNumber, timestamp) {
  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    
    // Try to get the log sheet, create it if it doesn't exist
    let logSheet = spreadsheet.getSheetByName("ScanLog");
    if (!logSheet) {
      logSheet = spreadsheet.insertSheet("ScanLog");
      // Add headers
      logSheet.appendRow(["Timestamp", "QR Code", "Mode", "Row Updated", "Status"]);
    }
    
    // Append the scan data
    logSheet.appendRow([
      timestamp, 
      data.code, 
      data.mode,
      rowNumber > 0 ? rowNumber : "Not Found",
      rowNumber > 0 ? "Updated" : "Not Found"
    ]);
  } catch (error) {
    Logger.log("Error logging scan: " + error.toString());
  }
}

// Helper function to create a standardized response
function createResponse(success, message, data = null) {
  const response = {
    success: success,
    message: message
  };
  
  if (data) {
    response.data = data;
  }
  
  return ContentService
    .createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
}

// Add CORS headers handler functions
function addCorsHeaders(output) {
  // If output is already a TextOutput object
  if (output.getContentType && output.getContentType() === ContentService.MimeType.JSON) {
    return output
      .setHeader('Access-Control-Allow-Origin', '*')
      .setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      .setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
      .setHeader('Access-Control-Max-Age', '3600');
  }
  
  // If output is not a TextOutput object, convert it
  const text = (typeof output === 'object') ? JSON.stringify(output) : String(output);
  return ContentService.createTextOutput(text)
    .setMimeType(ContentService.MimeType.JSON)
    .setHeader('Access-Control-Allow-Origin', '*')
    .setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    .setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    .setHeader('Access-Control-Max-Age', '3600');
}

function handleOptions() {
  return ContentService.createTextOutput('')
    .setMimeType(ContentService.MimeType.TEXT)
    .setHeader('Access-Control-Allow-Origin', '*')
    .setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    .setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    .setHeader('Access-Control-Max-Age', '3600');
}
