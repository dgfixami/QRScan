// Google Apps Script to handle attendee data lookups
// This file should be created in the Google Apps Script editor at:
// https://script.google.com/macros/s/AKfycbwq4-bWqzLPeV7bOaXllswGmjir-U9tmQr7eq6EUUq5-xSpVVgvAfxWtQNEIwMKVSI0/exec

// Define the doGet function to handle GET requests for attendee details
function doGet(e) {
  // Check if this is a lookup request
  if (e && e.parameter && e.parameter.code) {
    return handleAttendeeSearch(e.parameter.code);
  }
  
  // Default response for simple testing
  return ContentService.createTextOutput("Attendee Search API is running");
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
    
    // Find the row with the matching code in column H (was column G)
    const dataRange = sheet.getRange("H:H").getValues();
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
    
    // Get the attendee data from columns A, B, C, D for timestamp, firstname, lastname, and email
    // Make sure to start from column A
    const rowData = sheet.getRange(foundRow, 1, 1, 4).getValues()[0];
    
    // Format timestamp if it's a date
    let timestamp = rowData[0] || "";
    if (timestamp instanceof Date && !isNaN(timestamp.getTime())) {
      const timezone = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
      // Get day of the week
      const dayOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][timestamp.getDay()];
      const formattedDate = Utilities.formatDate(timestamp, timezone, "dd/MM/yyyy");
      timestamp = dayOfWeek + " " + formattedDate; // Format with day name
    }n A (timestamp)
      firstname: rowData[1] || "",   // Column B (firstname)
      lastname: rowData[2] || "",    // Column C (lastname)
      email: rowData[3] || ""        // Column D (em
    
    // Format the data for response
    const attendeeData = {
      timestamp: timestamp,          // Columail)
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
  
  return ContentService
    .createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
}
