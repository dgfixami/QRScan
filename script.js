document.addEventListener('DOMContentLoaded', function() {
    // Replace mode toggle with mode buttons
    const modeButtons = document.querySelectorAll('.mode-button');
    const modeValue = document.getElementById('mode-value');
    const codeValue = document.getElementById('code-value');
    const reader = document.getElementById('reader');
    const logMessages = document.getElementById('log-messages');
    
    // Scan result elements
    const scanName = document.getElementById('scan-name');
    const scanCompany = document.getElementById('scan-company');
    const scanTimestamp = document.getElementById('scan-timestamp');
    const scanEmail = document.getElementById('scan-email'); // Will be unused but keep reference to avoid errors
    const checkinStatus = document.getElementById('checkin-status');
    const checkinStatusValue = document.getElementById('checkin-status-value');
    const goodiebagStatus = document.getElementById('goodiebag-status');
    const goodiebagStatusValue = document.getElementById('goodiebag-status-value');
    const contestStatus = document.getElementById('contest-status');
    const contestStatusValue = document.getElementById('contest-status-value');
    
    // Lookup elements
    const lookupCode = document.getElementById('lookup-code');
    const lookupButton = document.getElementById('lookup-button');
    const lookupResult = document.getElementById('lookup-result');
    const attendeeName = document.getElementById('attendee-name');
    const attendeeCompany = document.getElementById('attendee-company');
    const attendeeEmail = document.getElementById('attendee-email'); // Will be unused but keep reference to avoid errors
    const attendeeCheckin = document.getElementById('attendee-checkin');
    const attendeeGoodiebag = document.getElementById('attendee-goodiebag');
    
    let html5QrCode;
    let currentMode = 'Check-in'; // Default mode
    let currentCameraIndex = 0;
    let cameras = [];
    let cameraInitAttempts = 0;
    const MAX_INIT_ATTEMPTS = 3;
    
    // New variable to track if a scan is in process
    let isScanning = false;
    
    // New variable to store messages for processing indicator
    let processingMessages = [];
    const MAX_PROCESSING_MESSAGES = 5;
    
    // Google Apps Script web app URLs - one for check-in/goodie bag/contest, one for attendee details
    const scriptUrl = 'https://script.google.com/macros/s/AKfycbxLj2Yh4GAhePBdGhAC53n3KOJF9gNs5BGvlvTsFvYEz6KGjZFjQ7avEJvkRcYz8kSF/exec';
    const attendeeApiUrl = 'https://script.google.com/macros/s/AKfycbwq4-bWqzLPeV7bOaXllswGmjir-U9tmQr7eq6EUUq5-xSpVVgvAfxWtQNEIwMKVSI0/exec';
    
    // Set up mode button listeners
    modeButtons.forEach(button => {
        button.addEventListener('click', function() {
            if (isScanning) return; // Don't allow mode change during scanning
            
            // Remove active class from all buttons
            modeButtons.forEach(btn => btn.classList.remove('active'));
            
            // Add active class to clicked button
            this.classList.add('active');
            
            // Update current mode
            currentMode = this.getAttribute('data-mode');
            modeValue.textContent = currentMode;
            logToPage(`Mode switched to: ${currentMode}`);
            
            // Reset scan result fields when mode is toggled
            resetScanResultFields();
            
            // Also reset the code value to make it clear it's ready for a new scan
            codeValue.textContent = "-";
            codeValue.style.color = "";
        });
    });
    
    // Setup lookup button click handler
    if(lookupButton) {
        lookupButton.addEventListener('click', function() {
            lookupAttendee();
        });
    }
    
    // Setup lookup input enter key handler
    if(lookupCode) {
        lookupCode.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                lookupAttendee();
            }
        });
    }
    
    // Updated helper function to format dates with day of the week
    function formatDateTime(dateString, dateOnly = false) {
        // If empty/null, return empty string
        if (!dateString) return '';
        
        try {
            // Array of day names
            const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
            
            // Function to add day of week to date string
            const addDayOfWeek = (date, dateStr) => {
                if (!date || isNaN(date.getTime())) return dateStr;
                const dayName = dayNames[date.getDay()];
                return `${dayName} ${dateStr}`;
            };
            
            // For ISO date strings that come from API responses like "2025-05-06T12:59:53.125Z"
            if (typeof dateString === 'string' && dateString.includes('T') && dateString.includes('Z')) {
                const date = new Date(dateString);
                if (!isNaN(date.getTime())) {
                    // Format as DD/MM/YYYY only if dateOnly is true
                    const day = String(date.getDate()).padStart(2, '0');
                    const month = String(date.getMonth() + 1).padStart(2, '0'); // Month is 0-based
                    const year = date.getFullYear();
                    
                    if (dateOnly) {
                        const dateStr = `${day}/${month}/${year}`;
                        return addDayOfWeek(date, dateStr);
                    }
                    
                    // Otherwise include time
                    const hours = String(date.getHours()).padStart(2, '0');
                    const minutes = String(date.getMinutes()).padStart(2, '0');
                    const seconds = String(date.getSeconds()).padStart(2, '0');
                    
                    return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
                }
            }
            
            // Handle Excel/Sheets date format with optional time removal
            if (typeof dateString === 'string') {
                // For strings that already include date and time with slashes (DD/MM/YYYY HH:MM:SS)
                if (dateString.includes('/') && dateString.includes(':')) {
                    if (dateOnly) {
                        // Try to parse the date to get day of week
                        const parts = dateString.split(' ')[0].split('/');
                        if (parts.length === 3) {
                            const date = new Date(parts[2], parts[1] - 1, parts[0]);
                            if (!isNaN(date.getTime())) {
                                return addDayOfWeek(date, dateString.split(' ')[0]);
                            }
                        }
                        return dateString.split(' ')[0];
                    }
                    return dateString;
                }
                
                // For strings with hyphens
                if (dateString.includes('-')) {
                    const converted = dateString.replace(/-/g, '/');
                    // If it has time part, split it off for dateOnly
                    if (converted.includes(':') && dateOnly) {
                        const datePart = converted.split(' ')[0];
                        const parts = datePart.split('/');
                        if (parts.length === 3) {
                            const date = new Date(parts[2], parts[1] - 1, parts[0]);
                            if (!isNaN(date.getTime())) {
                                return addDayOfWeek(date, datePart);
                            }
                        }
                        return datePart;
                    }
                    return converted;
                }
                
                // For strings that already include day of week
                if (dateString.split(' ').length > 1) {
                    const firstWord = dateString.split(' ')[0].toLowerCase();
                    if (dayNames.some(day => firstWord === day.toLowerCase())) {
                        return dateString; // Already has day of week
                    }
                }
            }
            
            // Last resort: try to parse as Date object
            const date = new Date(dateString);
            if (!isNaN(date.getTime())) {
                // Format as DD/MM/YYYY
                const day = String(date.getDate()).padStart(2, '0');
                const month = String(date.getMonth() + 1).padStart(2, '0'); // Month is 0-based
                const year = date.getFullYear();
                
                if (dateOnly) {
                    const dateStr = `${day}/${month}/${year}`;
                    return addDayOfWeek(date, dateStr);
                }
                
                // Include time if not dateOnly
                const hours = String(date.getHours()).padStart(2, '0');
                const minutes = String(date.getMinutes()).padStart(2, '0');
                const seconds = String(date.getSeconds()).padStart(2, '0');
                
                return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
            }
            
            // If we couldn't parse it, just return the original string
            return dateString;
        } catch (error) {
            console.error("Date formatting error:", error);
            return dateString; // Return original on error
        }
    }
    
    // New function to lock scanner - updated to disable mode buttons and show visual indicator
    function lockScanner() {
        isScanning = true;
        logToPage('Scanner locked - processing current scan', 'info');
        
        // Clear any existing processing messages
        processingMessages = [];
        addProcessingMessage('Scanner locked - processing current scan', 'info');
        
        // Disable mode buttons during scanning
        modeButtons.forEach(btn => {
            btn.disabled = true;
            btn.classList.add('disabled');
        });
        
        // Add visual processing indicator
        const processingIndicator = document.createElement('div');
        processingIndicator.id = 'processing-indicator';
        
        // Create spinner
        const spinner = document.createElement('div');
        spinner.className = 'spinner';
        processingIndicator.appendChild(spinner);
        
        // Create message container
        const messageContainer = document.createElement('div');
        messageContainer.className = 'message-container';
        messageContainer.id = 'processing-messages';
        processingIndicator.appendChild(messageContainer);
        
        // Remove any existing indicator first
        const existingIndicator = document.getElementById('processing-indicator');
        if (existingIndicator) {
            existingIndicator.remove();
        }
        
        // Add the indicator to the reader container
        const readerContainer = document.querySelector('#reader');
        if (readerContainer) {
            readerContainer.appendChild(processingIndicator);
        }
    }
    
    // Function to add a message to the processing indicator
    function addProcessingMessage(message, type = 'info') {
        // Add message to our array
        processingMessages.unshift({ message, type }); // Add to beginning
        
        // Keep only the most recent messages
        if (processingMessages.length > MAX_PROCESSING_MESSAGES) {
            processingMessages.pop(); // Remove oldest
        }
        
        // Update the UI if the processing indicator exists
        const messageContainer = document.getElementById('processing-messages');
        if (messageContainer) {
            // Clear current messages
            messageContainer.innerHTML = '';
            
            // Add all messages
            processingMessages.forEach(msg => {
                const messageElement = document.createElement('div');
                messageElement.className = `message ${msg.type}`;
                messageElement.textContent = msg.message;
                messageContainer.appendChild(messageElement);
            });
        }
    }
    
    // Updated function to log messages to the page - also add to processing indicator if scanning
    function logToPage(message, type = 'info') {
        if (message === undefined) {
            message = "Unknown error occurred (undefined message)";
            type = 'warning';
        } else if (message === '') {
            message = "Empty message received";
            type = 'warning';
        }
        
        const logEntry = document.createElement('div');
        logEntry.className = `log-entry ${type}`;
        
        const timestamp = new Date().toLocaleTimeString();
        logEntry.textContent = `${timestamp}: ${message}`;
        
        logMessages.prepend(logEntry);
        console.log(`[${type.toUpperCase()}] ${message}`);
        
        // If we're currently scanning, add this message to the processing indicator too
        if (isScanning) {
            addProcessingMessage(message, type);
        }
    }
    
    // Updated function to unlock scanner - updated to remove processing indicator
    function unlockScanner() {
        if (!isScanning) return; // Already unlocked, do nothing
        
        isScanning = false;
        logToPage('Scanner unlocked - ready for next scan', 'info');
        
        // Re-enable mode buttons after scanning completes
        modeButtons.forEach(btn => {
            btn.disabled = false;
            btn.classList.remove('disabled');
        });
        
        // Remove processing indicator if it exists
        const processingIndicator = document.getElementById('processing-indicator');
        if (processingIndicator) {
            processingIndicator.remove();
        }
        
        // Clear processing messages
        processingMessages = [];
    }
    
    // Modified sendToGoogleSheets to update the processing indicator during API calls
    function sendToGoogleSheets(scanData, callback) {
        // Show sending status
        logToPage('Sending data to Google Sheets...', 'info');
        
        fetch(scriptUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(scanData),
            mode: 'no-cors' // This is required for Google Apps Script web apps
        })
        .then(() => {
            // Due to no-cors mode, we won't get a proper response to parse
            logToPage(`Data sent to Google Sheets. ${scanData.mode} status updated.`, 'success');
            
            // Execute callback if provided
            if (typeof callback === 'function') {
                setTimeout(() => callback(), 500); // Short delay to ensure UI updates
            }
        })
        .catch(error => {
            logToPage(`Error sending to Google Sheets: ${error.message}`, 'error');
            // Keep error alert to notify user of failures
            alert(`⚠️ Error processing ${scanData.mode} for code: ${scanData.code}`);
            
            // Ensure callback happens even on error
            if (typeof callback === 'function') {
                setTimeout(() => callback(), 500); // Short delay to ensure UI updates
            }
        });
    }
    
    // Modified fetchAttendeeDetails to update the processing indicator
    function fetchAttendeeDetails(code) {
        logToPage(`Fetching attendee details for code: ${code}`, 'info');
        
        return fetch(`${attendeeApiUrl}?code=${encodeURIComponent(code)}`)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! Status: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                if (!data.success) {
                    throw new Error(data.message || "Failed to retrieve attendee details");
                }
                
                // Log the actual response for debugging
                console.log("Attendee API response:", data);
                
                // Format name from firstname and lastname fields
                const firstname = data.data.firstname || "";
                const lastname = data.data.lastname || "";
                const fullName = [firstname, lastname].filter(Boolean).join(' ');
                
                // Get the timestamp from column A
                const timestamp = data.data.timestamp || "";
                
                // Log the extracted details
                logToPage(`Found attendee: ${fullName}`, 'success');
                
                return {
                    name: fullName,
                    email: data.data.email || "",
                    code: code,
                    timestamp: timestamp // Include the timestamp from column A
                };
            })
            .catch(error => {
                logToPage(`Error fetching attendee details: ${error.message}`, 'error');
                throw error; // Re-throw to be handled by the caller
            });
    }
    
    // Function to fetch attendee data from Google Sheets for manual lookup only
    function fetchAttendeeData(code) {
        // Show that we're loading
        lookupResult.innerHTML = '<div class="loading">Loading...</div>';
        lookupResult.classList.remove('hidden');
        
        // First get check-in/goodie bag status from first API
        fetch(`${scriptUrl}?code=${encodeURIComponent(code)}`)
            .then(response => response.json())
            .then(data => {
                if (!data.success) {
                    showLookupError(data.message || 'Failed to find check-in status');
                    logToPage(`Lookup failed: ${data.message}`, 'error');
                    return null;
                }
                
                const checkInData = data.data;
                
                // Then get attendee details from second API
                return fetchAttendeeDetails(code)
                    .then(attendeeDetails => {
                        // Combine data from both APIs
                        const combinedData = {
                            ...checkInData,
                            name: attendeeDetails.name,
                            email: attendeeDetails.email,
                            timestamp: attendeeDetails.timestamp // Use timestamp from attendeeDetails
                        };
                        
                        // Display the combined data
                        displayAttendeeData(combinedData);
                        logToPage(`Successfully retrieved data for code: ${code}`, 'success');
                    })
                    .catch(error => {
                        // If we can't get attendee details, still show check-in data
                        displayAttendeeData({
                            ...checkInData,
                            name: "Unknown",
                            email: "Unknown",
                            timestamp: "Unknown" // Use "Unknown" instead of current timestamp
                        });
                        logToPage(`Retrieved partial data. Attendee details error: ${error.message}`, 'warning');
                    });
            })
            .catch(error => {
                showLookupError('Error connecting to database');
                logToPage(`Lookup error: ${error.message}`, 'error');
            });
    }
    
    // Modified function to display attendee data - updated to show eligibility warning
    function displayAttendeeData(data) {
        // Clear any previous content
        lookupResult.innerHTML = '';
        
        // Re-create the attendee info container
        const infoDiv = document.createElement('div');
        infoDiv.className = 'attendee-info';
        
        // Add name and email if available
        if (data.name) {
            const nameP = document.createElement('p');
            nameP.innerHTML = `<strong>Name:</strong> <span id="attendee-name">${data.name || '-'}</span>`;
            infoDiv.appendChild(nameP);
        }
        
        if (data.email) {
            const emailP = document.createElement('p');
            emailP.innerHTML = `<strong>Email:</strong> <span id="attendee-email">${data.email || '-'}</span>`;
            infoDiv.appendChild(emailP);
        }
        
        // Add timestamp if available - show date only without time
        if (data.timestamp) {
            const timestampP = document.createElement('p');
            const formattedDate = formatDateTime(data.timestamp, true); // true = date only
            timestampP.innerHTML = `<strong>Registered at:</strong> <span>${formattedDate || '-'}</span>`;
            infoDiv.appendChild(timestampP);
        }
          
        // Add check-in status
        const checkinP = document.createElement('p');
        if (data.isCheckedIn) {
            checkinP.innerHTML = `<strong>Check-in:</strong> <span class="warning-text">Already checked in at ${formatDateTime(data.checkInTime)}</span>`;
        } else {
            checkinP.innerHTML = `<strong>Check-in:</strong> <span class="success-text">Not checked in yet</span>`;
        }
        infoDiv.appendChild(checkinP);
        
        // Add goodie bag status
        const goodieP = document.createElement('p');
        if (!isGoodieBagEligible(data.code)) {
            goodieP.innerHTML = `<strong>Goodie Bag:</strong> <span class="error-text">Not eligible (missing GB code)</span>`;
        } else if (data.hasGoodieBag) {
            goodieP.innerHTML = `<strong>Goodie Bag:</strong> <span class="warning-text">Already received at ${formatDateTime(data.goodieBagTime)}</span>`;
        } else {
            goodieP.innerHTML = `<strong>Goodie Bag:</strong> <span class="success-text">Not received yet</span>`;
        }
        infoDiv.appendChild(goodieP);

        // Add contest status
        const contestP = document.createElement('p');
        if (data.inContest) {
            contestP.innerHTML = `<strong>Contest:</strong> <span class="warning-text">Already entered at ${formatDateTime(data.contestTime)}</span>`;
        } else {
            contestP.innerHTML = `<strong>Contest:</strong> <span class="success-text">Not entered yet</span>`;
        }
        infoDiv.appendChild(contestP);
        
        // Add goodie bag eligibility warning if needed
        if (!isGoodieBagEligible(data.code)) {
            const warningP = document.createElement('p');
            warningP.className = 'error-text';
            warningP.innerHTML = `<strong>⚠️ Warning:</strong> This code is not eligible for a goodie bag (missing GB code)`;
            infoDiv.appendChild(warningP);
        }
        
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'lookup-actions';
        
        // Only show check-in button if not already checked in
        if (!data.isCheckedIn) {
            const checkinBtn = document.createElement('button');
            checkinBtn.textContent = 'Check In Now';
            checkinBtn.className = 'action-button checkin-button';
            checkinBtn.addEventListener('click', () => {
                performAction(data.code, 'Check-in');
            });
            actionsDiv.appendChild(checkinBtn);
        }
        
        // Only show goodie bag button if not already received AND code is eligible
        if (!data.hasGoodieBag && isGoodieBagEligible(data.code)) {
            const goodiebagBtn = document.createElement('button');
            goodiebagBtn.textContent = 'Mark Goodie Bag Received';
            goodiebagBtn.className = 'action-button goodiebag-button';
            goodiebagBtn.addEventListener('click', () => {
                performAction(data.code, 'Goodie Bag');
            });
            actionsDiv.appendChild(goodiebagBtn);
        }
        
        // Show contest button if not already entered
        if (!data.inContest) {
            const contestBtn = document.createElement('button');
            contestBtn.textContent = 'Enter Contest';
            contestBtn.className = 'action-button contest-button';
            contestBtn.addEventListener('click', () => {
                performAction(data.code, 'Contest');
            });
            actionsDiv.appendChild(contestBtn);
        }
        
        // Add the info div and actions to the result container
        lookupResult.appendChild(infoDiv);
        if (actionsDiv.children.length > 0) {
            lookupResult.appendChild(actionsDiv);
        }
        
        // Show the result container
        lookupResult.classList.remove('hidden');
    }
    
    // Function to perform an action directly from lookup
    function performAction(code, actionMode) {
        // If a scan is in progress, don't allow action
        if (isScanning) {
            logToPage('Please wait for current scan to complete', 'warning');
            return;
        }
        
        // Check eligibility for goodie bag
        if (actionMode === 'Goodie Bag' && !isGoodieBagEligible(code)) {
            logToPage(`Cannot mark goodie bag - code ${code} is not eligible (missing GB code)`, 'error');
            alert(`⚠️ This code is not eligible for a goodie bag. Only codes containing "GB" are eligible.`);
            return;
        }
        
        // Lock the scanner
        lockScanner();
        
        // Prepare data for Google Sheets integration
        const scanData = {
            code: code,
            mode: actionMode,
            timestamp: new Date().toISOString()
        };
        
        // Update UI to show the current action
        modeValue.textContent = actionMode;
        if (modeButtons) {
            modeButtons.forEach(btn => btn.classList.remove('active'));
            const activeButton = Array.from(modeButtons).find(btn => btn.getAttribute('data-mode') === actionMode);
            if (activeButton) {
                activeButton.classList.add('active');
            }
        }
        
        // Log locally first
        logToPage(`Performing ${actionMode} for code: ${code}`, 'info');
        
        // Send data to Google Sheets
        sendToGoogleSheets(scanData, () => {
            // After successful action, refresh the lookup data
            fetchAttendeeData(code, () => {
                // Ensure unlocking happens after data refresh
                unlockScanner();
            });
        });
    }
    
    // Modified fetchAttendeeData to accept an optional callback
    function fetchAttendeeData(code, callback) {
        // Show that we're loading
        lookupResult.innerHTML = '<div class="loading">Loading...</div>';
        lookupResult.classList.remove('hidden');
        
        // First get check-in/goodie bag status from first API
        fetch(`${scriptUrl}?code=${encodeURIComponent(code)}`)
            .then(response => response.json())
            .then(data => {
                if (!data.success) {
                    showLookupError(data.message || 'Failed to find check-in status');
                    logToPage(`Lookup failed: ${data.message}`, 'error');
                    
                    // Call callback if provided
                    if (typeof callback === 'function') callback();
                    return null;
                }
                
                const checkInData = data.data;
                
                // Then get attendee details from second API
                return fetchAttendeeDetails(code)
                    .then(attendeeDetails => {
                        // Combine data from both APIs
                        const combinedData = {
                            ...checkInData,
                            name: attendeeDetails.name,
                            email: attendeeDetails.email,
                            timestamp: attendeeDetails.timestamp // Use timestamp from attendeeDetails
                        };
                        
                        // Display the combined data
                        displayAttendeeData(combinedData);
                        logToPage(`Successfully retrieved data for code: ${code}`, 'success');
                        
                        // Call callback if provided
                        if (typeof callback === 'function') callback();
                    })
                    .catch(error => {
                        // If we can't get attendee details, still show check-in data
                        displayAttendeeData({
                            ...checkInData,
                            name: "Unknown",
                            email: "Unknown",
                            timestamp: "Unknown" // Use "Unknown" instead of current timestamp
                        });
                        logToPage(`Retrieved partial data. Attendee details error: ${error.message}`, 'warning');
                        
                        // Call callback if provided
                        if (typeof callback === 'function') callback();
                    });
            })
            .catch(error => {
                showLookupError('Error connecting to database');
                logToPage(`Lookup error: ${error.message}`, 'error');
                
                // Call callback if provided
                if (typeof callback === 'function') callback();
            });
    }
    
    // Function to check if a code is eligible for a goodie bag
    function isGoodieBagEligible(code) {
        // Only codes containing "GB" are eligible for goodie bags
        return code && typeof code === 'string' && code.includes("GB");
    }
    
    // Function to show lookup error
    function showLookupError(message) {
        lookupResult.innerHTML = `<div class="lookup-error">${message}</div>`;
        lookupResult.classList.remove('hidden');
    }
    
    // Function to lookup attendee
    function lookupAttendee() {
        const code = lookupCode.value.trim();
        if (!code) {
            showLookupError('Please enter a code');
            return;
        }
        
        // Clear the input field for convenience
        lookupCode.value = '';
        
        // Fetch the attendee data
        fetchAttendeeData(code);
    }
    
    // Function to reset scan result fields
    function resetScanResultFields() {
        scanName.textContent = "-";
        scanCompany.textContent = "-";
        scanTimestamp.textContent = "-";
        
        // Reset status visibility
        checkinStatus.classList.add('hidden');
        goodiebagStatus.classList.add('hidden');
        contestStatus.classList.add('hidden');
        
        // Reset status values
        checkinStatusValue.textContent = "-";
        goodiebagStatusValue.textContent = "-";
        contestStatusValue.textContent = "-";
        
        // Remove current-mode class from all
        checkinStatus.classList.remove('current-mode');
        goodiebagStatus.classList.remove('current-mode');
        contestStatus.classList.remove('current-mode');
        
        // Add current-mode class based on current mode
        if (currentMode === 'Check-in') {
            checkinStatus.classList.add('current-mode');
            checkinStatus.classList.remove('hidden');
        } else if (currentMode === 'Goodie Bag') {
            goodiebagStatus.classList.add('current-mode');
            goodiebagStatus.classList.remove('hidden');
        } else if (currentMode === 'Contest') {
            contestStatus.classList.add('current-mode');
            contestStatus.classList.remove('hidden');
        }
    }
    
    // Function to handle successful scan
    function processQrCode(code) {
        if (isScanning) {
            logToPage('Already processing a scan, please wait', 'warning');
            return;
        }
        
        // Lock scanner during processing
        lockScanner();
        
        // Update UI with scanned code
        codeValue.textContent = code;
        codeValue.style.color = '';
        
        // Check eligibility for goodie bag if in goodie bag mode
        if (currentMode === 'Goodie Bag' && !isGoodieBagEligible(code)) {
            logToPage(`Warning: This code (${code}) is not eligible for a goodie bag.`, 'warning');
            codeValue.style.color = 'red';
            
            // Show a popup alert for better visibility
            alert("⚠️ This code is not eligible for a goodie bag.\nOnly codes containing 'GB' are eligible.");
            
            // Unlock scanner after short delay
            setTimeout(() => {
                unlockScanner();
            }, 1000);
            return;
        }
        
        logToPage(`Processing code: ${code} for ${currentMode}...`, 'info');
        
        // Get current timestamp (browser's local time)
        const timestamp = new Date().toISOString();
        
        // Prepare data for Google Sheets integration
        const scanData = {
            code: code,
            mode: currentMode,
            timestamp: timestamp
        };
        
        // First, try to fetch attendee details to show in the UI
        fetch(`${attendeeApiUrl}?code=${encodeURIComponent(code)}`)
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    // Format name from firstname and lastname fields
                    const firstname = data.data.firstname || "";
                    const lastname = data.data.lastname || "";
                    const fullName = [firstname, lastname].filter(Boolean).join(' ');
                    
                    // Update UI with attendee details
                    scanName.textContent = fullName || "Unknown";
                    scanCompany.textContent = data.data.email || "Unknown";
                    
                    // Format timestamp with day of week
                    const regTimestamp = data.data.timestamp || "Unknown";
                    scanTimestamp.textContent = formatDateTime(regTimestamp, true) || "Unknown";
                    
                    logToPage(`Found attendee: ${fullName}`, 'success');
                } else {
                    scanName.textContent = "Unknown";
                    scanCompany.textContent = "Unknown";
                    scanTimestamp.textContent = "Unknown";
                    logToPage(`Could not find attendee details: ${data.message}`, 'warning');
                }
            })
            .catch(error => {
                scanName.textContent = "Unknown";
                scanCompany.textContent = "Unknown";
                scanTimestamp.textContent = "Unknown";
                logToPage(`Error fetching attendee details: ${error.message}`, 'error');
            })
            .finally(() => {
                // Now we send the scan data to update the attendee's status
                sendToGoogleSheets(scanData, () => {
                    // After processing and sending data, fetch the updated status
                    updateAttendeeStatus(code);
                });
            });
    }
    
    // Function to update the attendee status display after scan processing
    function updateAttendeeStatus(code) {
        // Find the row with the matching code
        fetch(`${scriptUrl}?code=${encodeURIComponent(code)}`)
            .then(response => response.json())
            .then(data => {
                if (!data.success) {
                    throw new Error(data.message || 'Failed to find attendee status');
                }
                
                // Show all status fields
                checkinStatus.classList.remove('hidden');
                goodiebagStatus.classList.remove('hidden');
                contestStatus.classList.remove('hidden');
                
                // Update statuses based on data
                const checkInStatus = data.data.isCheckedIn ? 
                    `Checked in at ${formatDateTime(data.data.checkInTime)}` : 'Not checked in';
                checkinStatusValue.textContent = checkInStatus;
                
                const goodieBagStatus = !isGoodieBagEligible(code) ?
                    'Not eligible (missing GB code)' :
                    (data.data.hasGoodieBag ? 
                        `Received at ${formatDateTime(data.data.goodieBagTime)}` : 'Not received');
                goodiebagStatusValue.textContent = goodieBagStatus;
                
                const contestStatus = data.data.inContest ?
                    `Entered at ${formatDateTime(data.data.contestTime)}` : 'Not entered';
                contestStatusValue.textContent = contestStatus;
                
                // Set appropriate styling
                if (data.data.isCheckedIn) {
                    checkinStatusValue.className = 'warning-text';
                } else {
                    checkinStatusValue.className = 'success-text';
                }
                
                if (!isGoodieBagEligible(code)) {
                    goodiebagStatusValue.className = 'error-text';
                } else if (data.data.hasGoodieBag) {
                    goodiebagStatusValue.className = 'warning-text';
                } else {
                    goodiebagStatusValue.className = 'success-text';
                }
                
                if (data.data.inContest) {
                    contestStatusValue.className = 'warning-text';
                } else {
                    contestStatusValue.className = 'success-text';
                }
                
                // Make sure the appropriate status is highlighted based on mode
                checkinStatus.classList.toggle('current-mode', currentMode === 'Check-in');
                goodiebagStatus.classList.toggle('current-mode', currentMode === 'Goodie Bag');
                contestStatus.classList.toggle('current-mode', currentMode === 'Contest');
                
                // Unlock the scanner when everything is complete
                unlockScanner();
                
            })
            .catch(error => {
                // Handle errors
                logToPage(`Error updating status: ${error.message}`, 'error');
                unlockScanner();
            });
    }
    
    // Initialize HTML5 QR Scanner
    function initializeScanner() {
        // Re-initialize logging and UI first
        logToPage("Initializing QR scanner...", 'info');
        resetScanResultFields();
        
        // Check for existing instance and dispose if needed
        if (html5QrCode) {
            try {
                html5QrCode.stop();
            } catch (err) {
                console.error("Error stopping existing scanner:", err);
            }
        }
        
        // Create a new instance
        html5QrCode = new Html5Qrcode("reader");
        
        // Getting available cameras
        Html5Qrcode.getCameras()
            .then(devices => {
                if (devices && devices.length) {
                    // Save cameras list
                    cameras = devices;
                    if (currentCameraIndex >= cameras.length) {
                        currentCameraIndex = 0;
                    }
                    
                    // Log which cameras are available
                    logToPage(`Found ${devices.length} camera(s). Using: ${devices[currentCameraIndex].label}`, 'info');
                    
                    // Start scanner with the selected camera
                    startScanner(cameras[currentCameraIndex].id);
                } else {
                    logToPage("No cameras found. Try connecting a camera.", 'error');
                }
            })
            .catch(err => {
                logToPage(`Error getting cameras: ${err.message}`, 'error');
            });
    }
    
    // Function to start QR scanner with given camera ID
    function startScanner(cameraId) {
        const config = {
            fps: 10,           // Frame per second for QR scanning
            qrbox: 250,        // Size of the scan box
            formatsToSupport: [ // Only support QR codes
                Html5QrcodeSupportedFormats.QR_CODE
            ],
            disableFlip: false,  // Don't flip the camera image
            aspectRatio: 1.0     // Use a square aspect ratio for the view
        };
        
        // Increase attempt counter
        cameraInitAttempts++;
        
        html5QrCode.start(
            cameraId, 
            config,
            (decodedText) => {
                // Success callback
                // Play camera shutter sound or flash screen for feedback
                playShutterEffect();
                
                // Process the code
                processQrCode(decodedText);
            },
            (errorMessage) => {
                // Error callback - we don't need to log every single frame error
                if (errorMessage.includes("Failed to setup") || errorMessage.includes("Unable to start scanning")) {
                    logToPage(`Camera error: ${errorMessage}`, 'error');
                    
                    // If we've had too many failed attempts
                    if (cameraInitAttempts >= MAX_INIT_ATTEMPTS) {
                        logToPage("Failed to initialize camera after multiple attempts.", 'error');
                        cameraInitAttempts = 0;
                    }
                }
            }
        ).catch((err) => {
            logToPage(`Failed to start scanner: ${err.message}`, 'error');
        });
    }
    
    // Function to play a camera shutter effect for visual feedback
    function playShutterEffect() {
        // Create a flash element if it doesn't exist
        let flash = document.querySelector('.camera-flash');
        if (!flash) {
            flash = document.createElement('div');
            flash.className = 'camera-flash';
            document.querySelector('.scanner-container').appendChild(flash);
        }
        
        // Reset any ongoing animation
        flash.classList.remove('flash-animation');
        
        // Trigger reflow to restart the animation
        void flash.offsetWidth;
        
        // Start the flash animation
        flash.classList.add('flash-animation');
    }
    
    // Initialize on page load
    initializeScanner();
});