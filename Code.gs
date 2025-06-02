// Google Apps Script to handle QR code scan data
// This file should be created in the Google Apps Script editor at:
// https://script.google.com/macros/s/AKfycbxLj2Yh4GAhePBdGhAC53n3KOJF9gNs5BGvlvTsFvYEz6KGjZFjQ7avEJvkRcYz8kSF/exec

// Define the doGet function to handle GET requests from testing
function doGet(e) {
  // Check if this is a lookup request
  if (e && e.parameter && e.parameter.code) {
    return handleLookup(e.parameter.code);
  }
  
  // Default response for simple testing
  return ContentService.createTextOutput("QR Code API is running");
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

// New functions to handle access requests
function doPost(e) {
  try {
    // Check what type of request this is
    if (e.postData && e.postData.contents) {
      const data = JSON.parse(e.postData.contents);
      
      // Handle different types of requests
      if (data.action === "scan") {
        // Original scan functionality
        return handleScanPost(data);
      } else if (data.action === "accessRequest") {
        return handleAccessRequest(data);
      } else if (data.action === "fetchRequests") {
        return fetchAccessRequests();
      } else if (data.action === "approveRequest") {
        return approveAccessRequest(data);
      } else if (data.action === "rejectRequest") {
        return rejectAccessRequest(data);
      } else if (data.action === "clearAllRequests") {
        return clearAllRequests(data);
      }
    }
    
    return createResponse(false, "Invalid request format");
  } catch (error) {
    Logger.log("Error in doPost: " + error.toString());
    return createResponse(false, "Error processing request: " + error.toString());
  }
}

// Handle the original scan post functionality
function handleScanPost(data) {
  try {
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

// Handle new access request
function handleAccessRequest(data) {
  try {
    // Validate the request data
    if (!data.name || !data.ip) {
      return createResponse(false, "Missing required fields");
    }
    
    // Get or create the access requests sheet
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    let requestsSheet = spreadsheet.getSheetByName("AccessRequests");
    
    if (!requestsSheet) {
      requestsSheet = spreadsheet.insertSheet("AccessRequests");
      requestsSheet.appendRow(["Timestamp", "Name", "IP Address", "Status", "Device"]);
    }
    
    // Check if there's already a pending request for this IP
    const ipColumn = 3;  // Column C contains IP addresses
    const dataRange = requestsSheet.getDataRange();
    const values = dataRange.getValues();
    
    for (let i = 1; i < values.length; i++) {  // Skip header row
      if (values[i][ipColumn-1] === data.ip && values[i][3] === "Pending") {
        // Request already exists for this IP, update timestamp and name
        const row = i + 1; // Convert to 1-based index
        requestsSheet.getRange(row, 1).setValue(new Date()); // Update timestamp
        requestsSheet.getRange(row, 2).setValue(data.name); // Update name
        
        Logger.log("Updated existing request for IP: " + data.ip);
        return createResponse(true, "Access request updated successfully");
      }
    }
    
    // Current timestamp
    const now = new Date();
    const timestamp = Utilities.formatDate(now, spreadsheet.getSpreadsheetTimeZone(), "dd/MM/yyyy HH:mm:ss");
    
    // Get user agent or device info if available
    let deviceInfo = "Unknown device";
    if (data.userAgent) {
      deviceInfo = data.userAgent.substring(0, 100); // Limit to 100 chars
    }
    
    // Add the new request
    requestsSheet.appendRow([timestamp, data.name, data.ip, "Pending", deviceInfo]);
    
    return createResponse(true, "Access request submitted successfully");
  } catch (error) {
    Logger.log("Error handling access request: " + error.toString());
    return createResponse(false, "Error processing access request: " + error.toString());
  }
}

// Fetch all pending access requests
function fetchAccessRequests() {
  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    let requestsSheet = spreadsheet.getSheetByName("AccessRequests");
    
    if (!requestsSheet) {
      // No requests sheet means no requests
      return createResponse(true, "No access requests found", []);
    }
    
    // Get all the data from the sheet
    const dataRange = requestsSheet.getDataRange();
    const values = dataRange.getValues();
    
    // Skip header row and convert to objects
    const requests = [];
    for (let i = 1; i < values.length; i++) {
      if (values[i][3] === "Pending") {  // Only include pending requests
        // Format timestamp if it's a date
        let timestamp = values[i][0];
        if (timestamp instanceof Date) {
          const timezone = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
          timestamp = Utilities.formatDate(timestamp, timezone, "dd/MM/yyyy HH:mm:ss");
        }
        
        requests.push({
          timestamp: timestamp,
          name: values[i][1],
          ip: values[i][2],
          status: values[i][3],
          device: values[i][4] || 'Unknown device',
          row: i + 1  // +1 because arrays are 0-indexed but sheet rows are 1-indexed
        });
      }
    }
    
    return createResponse(true, "Access requests retrieved", requests);
  } catch (error) {
    Logger.log("Error fetching access requests: " + error.toString());
    return createResponse(false, "Error retrieving access requests: " + error.toString());
  }
}

// Approve an access request
function approveAccessRequest(data) {
  try {
    if (!data.ip || !data.name || !data.row) {
      return createResponse(false, "Missing required fields");
    }
    
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    let requestsSheet = spreadsheet.getSheetByName("AccessRequests");
    
    if (!requestsSheet) {
      return createResponse(false, "Requests sheet not found");
    }
    
    // Update the status to "Approved"
    requestsSheet.getRange(data.row, 4).setValue("Approved"); // Column D is Status
    
    // Get current timestamp for the log
    const now = new Date();
    const timestamp = Utilities.formatDate(now, spreadsheet.getSpreadsheetTimeZone(), "dd/MM/yyyy HH:mm:ss");
    
    // Add to IP whitelist sheet or create it if it doesn't exist
    let whitelistSheet = spreadsheet.getSheetByName("IPWhitelist");
    if (!whitelistSheet) {
      whitelistSheet = spreadsheet.insertSheet("IPWhitelist");
      whitelistSheet.appendRow(["Timestamp", "Name", "IP Address", "Added By", "Status"]);
    }
    
    // Add the approved IP to the whitelist
    whitelistSheet.appendRow([timestamp, data.name, data.ip, data.admin || "Admin", "Active"]);
    
    return createResponse(true, "Access request approved successfully");
  } catch (error) {
    Logger.log("Error approving access request: " + error.toString());
    return createResponse(false, "Error approving request: " + error.toString());
  }
}

// Reject an access request
function rejectAccessRequest(data) {
  try {
    if (!data.row) {
      return createResponse(false, "Missing required fields");
    }
    
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    let requestsSheet = spreadsheet.getSheetByName("AccessRequests");
    
    if (!requestsSheet) {
      return createResponse(false, "Requests sheet not found");
    }
    
    // Update the status to "Rejected"
    requestsSheet.getRange(data.row, 4).setValue("Rejected"); // Column D is Status
    
    return createResponse(true, "Access request rejected successfully");
  } catch (error) {
    Logger.log("Error rejecting access request: " + error.toString());
    return createResponse(false, "Error rejecting request: " + error.toString());
  }
}

// New function to clear all pending requests - enhanced with forceCleanup option
function clearAllRequests(data) {
  try {
    // Verify required admin data 
    const adminName = data.admin || "Admin";
    const forceCleanup = data.forceCleanup === true;
    
    // Get the requests sheet
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    let requestsSheet = spreadsheet.getSheetByName("AccessRequests");
    
    if (!requestsSheet) {
      // No sheet exists, nothing to clear
      return createResponse(true, forceCleanup ? "No requests sheet found, but forced cleanup recorded" : "No requests to clear");
    }
    
    // Get all the data and identify which rows have pending requests
    const dataRange = requestsSheet.getDataRange();
    const values = dataRange.getValues();
    const pendingRows = [];
    let pendingCount = 0;
    
    // Find all rows with "Pending" status, skipping header row
    for (let i = 1; i < values.length; i++) {
      if (values[i][3] === "Pending") {  // Column D is Status
        pendingRows.push(i + 1);  // +1 for 1-based indexing
        pendingCount++;
      }
    }
    
    // Check if we should proceed when no pending requests are found
    if (pendingCount === 0 && !forceCleanup) {
      return createResponse(true, "No pending requests found to clear");
    }
    
    // Create archive for cleared requests if it doesn't exist
    let archivedSheet = spreadsheet.getSheetByName("ArchivedRequests");
    if (!archivedSheet) {
      archivedSheet = spreadsheet.insertSheet("ArchivedRequests");
      archivedSheet.appendRow(["Timestamp", "Name", "IP Address", "Status", "Cleared By", "Cleared At"]);
    }
    
    // Archive each pending request before clearing
    const now = new Date();
    const timestamp = Utilities.formatDate(now, spreadsheet.getSpreadsheetTimeZone(), "dd/MM/yyyy HH:mm:ss");
    
    // If we have actual pending requests to process
    if (pendingCount > 0) {
      pendingRows.forEach(rowIndex => {
        // Get the row data to archive
        const rowData = requestsSheet.getRange(rowIndex, 1, 1, 4).getValues()[0];
        
        // Add to archive with admin name and timestamp
        archivedSheet.appendRow([
          rowData[0],        // Timestamp
          rowData[1],        // Name
          rowData[2],        // IP Address
          "Cleared",         // New status
          adminName,         // Admin who cleared
          timestamp          // When cleared
        ]);
        
        // Update the status in the original sheet to "Cleared"
        requestsSheet.getRange(rowIndex, 4).setValue("Cleared");
      });
    } else if (forceCleanup) {
      // If forceCleanup is true but no pending requests found, still log the cleanup attempt
      archivedSheet.appendRow([
        timestamp,           // Current timestamp
        "N/A",               // No name
        "N/A",               // No IP
        "Force Cleaned",     // Special status
        adminName,           // Admin who initiated cleanup
        timestamp            // When cleanup was initiated
      ]);
    }
    
    // Log this action
    const logSheet = spreadsheet.getSheetByName("ActivityLog") || spreadsheet.insertSheet("ActivityLog");
    if (logSheet.getLastRow() === 0) {
      logSheet.appendRow(["Timestamp", "Action", "Admin"]);
    }
    
    // Create appropriate log message based on whether we found requests or forced cleanup
    let actionMessage;
    if (pendingCount > 0) {
      actionMessage = `Cleared all pending access requests (${pendingCount} requests)`;
    } else if (forceCleanup) {
      actionMessage = `Force-cleared all pending access requests (no requests found, but cleanup recorded)`;
    } else {
      actionMessage = `Attempted to clear pending requests, but none were found`;
    }
    
    logSheet.appendRow([
      timestamp,
      actionMessage,
      adminName
    ]);
    
    if (pendingCount > 0) {
      return createResponse(true, `Successfully cleared ${pendingCount} pending requests`);
    } else if (forceCleanup) {
      return createResponse(true, "Force cleanup completed - no pending requests were found, but action was recorded");
    } else {
      return createResponse(true, "No pending requests found to clear");
    }
  } catch (error) {
    Logger.log("Error clearing requests: " + error.toString());
    return createResponse(false, "Error clearing requests: " + error.toString());
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
