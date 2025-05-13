// Google Apps Script to handle QR code scan data
// Added enhanced authentication check to ensure only fixami.com users can access

// Define the doGet function to handle GET requests from testing
function doGet(e) {
  // Check if this is a lookup request
  if (e && e.parameter && e.parameter.code) {
    // Require authentication token
    if (!e.parameter.authToken || !e.parameter.userEmail) {
      return createResponse(false, "Authentication required. Please log in.");
    }
    
    // Verify authentication token
    const isAuthenticated = verifyAuthToken(e.parameter.authToken, e.parameter.userEmail);
    if (!isAuthenticated) {
      return createResponse(false, "Authentication failed. Only fixami.com email addresses are allowed.");
    }
    
    return handleLookup(e.parameter.code);
  }
  
  // Default response
  return ContentService.createTextOutput("QR Code API is running. Authentication required for access.");
}

// Enhanced helper function to verify authentication token
function verifyAuthToken(token, email) {
  if (!token || !email) {
    return false;
  }
  
  // Check email domain
  if (!email.endsWith('@fixami.com')) {
    Logger.log(`Authentication failed: Email ${email} is not from fixami.com domain`);
    return false;
  }
  
  try {
    // Parse and verify JWT token (simplified version - in production, use proper JWT verification)
    // A more secure approach would validate the token signature with Google's public keys
    const tokenParts = token.split('.');
    if (tokenParts.length !== 3) {
      Logger.log('Invalid JWT format');
      return false;
    }
    
    // Get payload
    const payloadBase64 = tokenParts[1];
    const payload = JSON.parse(Utilities.newBlob(
      Utilities.base64Decode(payloadBase64.replace(/-/g, '+').replace(/_/g, '/'))
    ).getDataAsString());
    
    // Verify email matches
    if (payload.email !== email) {
      Logger.log(`Token email mismatch: ${payload.email} vs ${email}`);
      return false;
    }
    
    // Check token expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      Logger.log('Token expired');
      return false;
    }
    
    return true;
  } catch (error) {
    Logger.log(`Token verification error: ${error.toString()}`);
    return false;
  }
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
    
    // Only format if they are date objects
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

// Define the doPost function to handle POST requests with enhanced authentication check
function doPost(e) {
  try {
    // Parse the incoming data
    const data = JSON.parse(e.postData.contents);
    
    // Require authentication data
    if (!data.authToken || !data.userEmail) {
      return createResponse(false, "Authentication required. Please log in.");
    }
    
    // Check authentication token
    const isAuthenticated = verifyAuthToken(data.authToken, data.userEmail);
    if (!isAuthenticated) {
      return createResponse(false, "Authentication failed. Only fixami.com email addresses are allowed.");
    }
    
    // Log the received data for debugging
    Logger.log("Received data: " + JSON.stringify(data));
    
    // Validate required data
    if (!data.code) {
      return createResponse(false, "Missing QR code data");
    }
    
    if (!data.mode) {
      return createResponse(false, "Missing mode data");
    }
    
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
      if (dataRange[i][0] === data.code) {
        foundRow = i + 1; // Convert to 1-based index
        break;
      }
    }
    
    if (foundRow === -1) {
      return createResponse(false, "Code not found in spreadsheet");
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
      return createResponse(false, "Invalid mode: " + data.mode);
    }
    
    // You can also log the scan in a dedicated log sheet
    logScan(data, foundRow, timestamp);
    
    // Return success response
    return createResponse(true, "QR code processed successfully for mode: " + data.mode);
    
  } catch (error) {
    Logger.log("Error: " + error.toString());
    return createResponse(false, "Error processing request: " + error.toString());
  }
}

// Helper function to log scans in a separate sheet with enhanced user info
function logScan(data, rowNumber, timestamp) {
  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    
    // Try to get the log sheet, create it if it doesn't exist
    let logSheet = spreadsheet.getSheetByName("ScanLog");
    if (!logSheet) {
      logSheet = spreadsheet.insertSheet("ScanLog");
      // Add headers with user info column
      logSheet.appendRow(["Timestamp", "QR Code", "Mode", "Row Updated", "Status", "User Email"]);
    }
    
    // Extract user email from auth token
    let userEmail = data.userEmail || "Unknown";
    
    // Append the scan data with user info
    logSheet.appendRow([
      timestamp, 
      data.code, 
      data.mode,
      rowNumber > 0 ? rowNumber : "Not Found",
      rowNumber > 0 ? "Updated" : "Not Found",
      userEmail
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
