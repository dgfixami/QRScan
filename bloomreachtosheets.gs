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
    var sheet = spreadsheet.getSheetByName("bloomreach_report"); //Sheet1

    if (!sheet) {
      sheet = spreadsheet.insertSheet("bloomreach_report");
      // Add headers on the first run
      if (data.header) {
        sheet.appendRow(data.header);
      }
    }

    var existingData = sheet.getDataRange().getValues();
    var existingEmails = new Set();
    var columnIndexForEmail = 2; // Column C (0-based index)

    // Start from the second row to skip headers, if they exist
    for (var i = 1; i < existingData.length; i++) {
      if (existingData[i] && existingData[i].length > columnIndexForEmail) {
        existingEmails.add(existingData[i][columnIndexForEmail]);
      }
    }

    var newRowCount = 0;
    data.rows.forEach(function(newRow) {
      if (newRow && newRow.length > columnIndexForEmail) {
        var newEmail = newRow[columnIndexForEmail];
        if (!existingEmails.has(newEmail)) {
          sheet.appendRow(newRow);
          existingEmails.add(newEmail);
          newRowCount++;
        }
      }
    });

    if (newRowCount > 0) {
      Logger.log("Added " + newRowCount + " new rows.");
      SpreadsheetApp.getActiveSpreadsheet().toast("Added " + newRowCount + " new rows.", "New Data", 3);
    } else {
      Logger.log("No new data to add.");
    }

  } catch (error) {
    Logger.log("Error: " + error.message);
    SpreadsheetApp.getActiveSpreadsheet().toast("Error: " + error.message, "Error", 5);
  }

}