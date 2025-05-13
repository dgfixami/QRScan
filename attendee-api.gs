// Google Apps Script to handle attendee data lookups
// This file should be created in the Google Apps Script editor at:
// https://script.google.com/macros/s/AKfycbwq4-bWqzLPeV7bOaXllswGmjir-U9tmQr7eq6EUUq5-xSpVVgvAfxWtQNEIwMKVSI0/exec

// Define the doGet function to handle GET requests for attendee details
function doGet(e) {
  // For JSONP support
  const callback = e.parameter.callback;
  
  // Check if this is a lookup request
  if (e && e.parameter && e.parameter.code) {
    const responseData = handleAttendeeSearch(e.parameter.code);
    
    // If JSONP was requested
    if (callback) {
      return ContentService.createTextOutput(callback + '(' + JSON.stringify(responseData.getContent()) + ')')
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    
    // Otherwise add CORS headers
    return addCorsHeaders(responseData);
  }
  
  // Default response for simple testing
  const output = ContentService.createTextOutput("Attendee Search API is running");
  
  // If JSONP was requested
  if (callback) {
    return ContentService.createTextOutput(callback + '("Attendee Search API is running")')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  
  // Otherwise add CORS headers
  return addCorsHeaders(output);
}

// Function to handle attendee lookups by QR code
function handleAttendeeSearch(code) {
  try {
    // Get the active spreadsheet
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = spreadsheet.getSheetByName("Sheet1"); // Adjust sheet name as needed
    
    if (!sheet) {
      return createResponse(false, "Sheet not found in the spreadsheet");
    }
    
    // Find the row with the matching code in column A (not column H as previously written)
    const dataRange = sheet.getRange("A:A").getValues();
    let foundRow = -1;
    
    for (let i = 0; i < dataRange.length; i++) {
      if (dataRange[i][0] === code) {
        foundRow = i + 1; // Convert to 1-based index
        break;
      }
    }
    
    if (foundRow === -1) {
      return createResponse(false, "QR code not found in spreadsheet");
    }
    
    // Get the attendee data from columns F, G for name and email
    // Get the timestamp from column H
    const rowData = sheet.getRange(foundRow, 1, 1, 8).getValues()[0];
    
    // Format timestamp if it's a date
    let timestamp = rowData[7] || ""; // Column H (timestamp)
    if (timestamp instanceof Date && !isNaN(timestamp.getTime())) {
      const timezone = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
      // Get day of the week
      const dayOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][timestamp.getDay()];
      const formattedDate = Utilities.formatDate(timestamp, timezone, "dd/MM/yyyy");
      timestamp = dayOfWeek + " " + formattedDate; // Format with day name
    }
    
    // Format the data for response
    const attendeeData = {
      timestamp: timestamp,          // Column H (timestamp)
      firstname: rowData[5] || "",   // Column F (name) - using as firstname
      lastname: "",                  // No separate lastname in your data structure
      email: rowData[6] || ""        // Column G (email)
    };
    
    // Return the data
    return createResponse(true, "Attendee data retrieved", attendeeData);
    
  } catch (error) {
    Logger.log("Lookup error: " + error.toString());
    return createResponse(false, "Error processing lookup: " + error.toString());
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
  
  return addCorsHeaders(ContentService
    .createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON));
}

// Enhanced CORS headers to allow requests from dgfixami.github.io
function addCorsHeaders(output) {
  return output
    .setHeader('Access-Control-Allow-Origin', '*')
    .setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    .setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    .setHeader('Access-Control-Max-Age', '3600')
    // Important: Set Cache-Control to prevent caching that can interfere with CORS
    .setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
}

function handleOptions() {
  return ContentService.createTextOutput('')
    .setMimeType(ContentService.MimeType.TEXT)
    .setHeader('Access-Control-Allow-Origin', '*')
    .setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    .setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    .setHeader('Access-Control-Max-Age', '3600')
    .setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
}
