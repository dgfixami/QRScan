document.addEventListener('DOMContentLoaded', function() {
    const modeToggle = document.getElementById('mode-toggle');
    const modeValue = document.getElementById('mode-value');
    const codeValue = document.getElementById('code-value');
    const reader = document.getElementById('reader');
    const logMessages = document.getElementById('log-messages');
    const logoutBtn = document.getElementById('logout-btn');
    
    // Update logout button to just clear session storage (not localStorage)
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function() {
            // Just redirect to login page, keep IP in whitelist
            window.location.href = 'login.html';
        });
    }
    
    // Display user name from session storage if available
    const userDisplayName = document.getElementById('user-display-name');
    if (userDisplayName) {
        const userName = sessionStorage.getItem('user_name') || 'User';
        userDisplayName.textContent = userName;
    }
    
    // Scan result elements
    const scanName = document.getElementById('scan-name');
    const scanCompany = document.getElementById('scan-company');
    const scanTimestamp = document.getElementById('scan-timestamp');
    const scanEmail = document.getElementById('scan-email'); // Will be unused but keep reference to avoid errors
    const checkinStatus = document.getElementById('checkin-status');
    const checkinStatusValue = document.getElementById('checkin-status-value');
    const goodiebagStatus = document.getElementById('goodiebag-status');
    const goodiebagStatusValue = document.getElementById('goodiebag-status-value');
    
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
    let currentMode = 'Check-in';
    let currentCameraIndex = 0;
    let cameras = [];
    let cameraInitAttempts = 0;
    const MAX_INIT_ATTEMPTS = 3;
    
    // New variable to track if a scan is in process
    let isScanning = false;
    
    // Google Apps Script web app URLs - one for check-in/goodie bag, one for attendee details
    const scriptUrl = 'https://script.google.com/macros/s/AKfycbxLj2Yh4GAhePBdGhAC53n3KOJF9gNs5BGvlvTsFvYEz6KGjZFjQ7avEJvkRcYz8kSF/exec';
    const attendeeApiUrl = 'https://script.google.com/macros/s/AKfycbwq4-bWqzLPeV7bOaXllswGmjir-U9tmQr7eq6EUUq5-xSpVVgvAfxWtQNEIwMKVSI0/exec';
    
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
    
    // New function to lock scanner - updated to disable mode toggle
    function lockScanner() {
        isScanning = true;
        logToPage('Scanner locked - processing current scan', 'info');
        
        // Disable mode toggle during scanning
        if (modeToggle) {
            modeToggle.disabled = true;
            document.querySelector('.toggle').classList.add('disabled');
        }
    }
    
    // New function to unlock scanner - updated to re-enable mode toggle
    function unlockScanner() {
        isScanning = false;
        logToPage('Scanner unlocked - ready for next scan', 'info');
        
        // Re-enable mode toggle after scanning completes
        if (modeToggle) {
            modeToggle.disabled = false;
            document.querySelector('.toggle').classList.remove('disabled');
        }
    }
    
    // New function to lookup attendee data
    function lookupAttendee() {
        const code = lookupCode.value.trim();
        if (!code) {
            logToPage('Please enter a code to lookup', 'warning');
            return;
        }
        
        logToPage(`Looking up code: ${code}...`, 'info');
        
        // Make the code fill the scan result area too
        codeValue.textContent = code;
        
        // Hide previous results while loading
        lookupResult.classList.add('hidden');
        
        // Show loading indicator
        lookupResult.innerHTML = '<div class="loading">Loading...</div>';
        lookupResult.classList.remove('hidden');
        
        // Fetch data from Google Sheets
        fetchAttendeeData(code);
    }
    
    // New function to fetch attendee details from the second API
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
                logToPage(`Found attendee: ${fullName}`, 'info');
                
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
    
    // Add a function to check if a code is eligible for a goodie bag
    function isGoodieBagEligible(code) {
        // Check if code contains "GB" (case insensitive)
        return code.toUpperCase().includes('GB');
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
            timestamp: new Date().toISOString(),
            userName: sessionStorage.getItem('user_name') || 'Unknown User' // Add user name
        };
        
        // Update UI to show the current action
        modeValue.textContent = actionMode;
        if (modeToggle) {
            modeToggle.checked = (actionMode === 'Goodie Bag');
        }
        
        // Log locally first
        logToPage(`Performing ${actionMode} for code: ${code}`, 'info');
        
        // Send data to Google Sheets
        sendToGoogleSheets(scanData, () => {
            // After successful action, refresh the lookup data
            fetchAttendeeData(code);
            
            // Unlock the scanner
            unlockScanner();
        });
    }
    
    // Modified function to send data to Google Sheets with callback
    function sendToGoogleSheets(scanData, callback) {
        // Show sending status
        logToPage('Sending data to Google Sheets...', 'info');
        
        // Make sure the user name is included in the data
        if (!scanData.userName) {
            scanData.userName = sessionStorage.getItem('user_name') || 'Unknown User';
        }
        
        fetch(scriptUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(scanData),
            mode: 'no-cors' // This is required for Google Apps Script web apps
        })
        .then(response => {
            // Due to no-cors mode, we won't get a proper response to parse
            logToPage(`Data sent to Google Sheets. ${scanData.mode} status updated.`, 'success');
            
            // Remove success alerts but keep in logs
            // No more alerts for successful operations
            
            // Execute callback if provided
            if (typeof callback === 'function') {
                callback();
            } else {
                // Ensure unlock happens even if callback is not provided
                unlockScanner();
            }
        })
        .catch(error => {
            logToPage(`Error sending to Google Sheets: ${error.message}`, 'error');
            // Keep error alert to notify user of failures
            alert(`⚠️ Error processing ${scanData.mode} for code: ${scanData.code}`);
            
            // Unlock the scanner even on error
            if (typeof callback === 'function') {
                callback();
            } else {
                unlockScanner();
            }
        });
    }
    
    // Show lookup error
    function showLookupError(message) {
        lookupResult.innerHTML = `
            <div class="lookup-error">
                <p>⚠️ ${message}</p>
            </div>
        `;
        lookupResult.classList.remove('hidden');
    }
    
    // Function to log messages to the page
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
    }
    
    // Success callback when QR code is scanned - updated to check goodie bag eligibility before processing
    function qrCodeSuccessCallback(decodedText) {
        // If scanner is locked, silently ignore this scan (no logging)
        if (isScanning) {
            return; // Silent return without logging
        }
        
        try {
            // Lock the scanner immediately
            lockScanner();
            
            // Add safety timeout to ensure unlock happens no matter what
            setTimeout(ensureUIUnlocked, 15000); // 15 seconds safety timeout
            
            const flash = document.querySelector('.camera-flash');
            if (flash) {
                flash.classList.add('flash-animation');
                setTimeout(() => flash.classList.remove('flash-animation'), 500);
            }
            
            // Update the UI
            codeValue.textContent = decodedText;
            codeValue.style.color = "";
            
            // Check eligibility for goodie bag mode first
            if (currentMode === 'Goodie Bag' && !isGoodieBagEligible(decodedText)) {
                logToPage(`Cannot process goodie bag - code ${decodedText} is not eligible (missing GB code)`, 'error');
                
              
                // We still want to fetch the attendee data to show the user details
                // But we won't mark it as received in the system
                fetchAttendeeDataForScan(decodedText, null); // Pass null for scanData to skip marking
                
                return;
            }
            
            // Prepare data for Google Sheets integration
            const scanData = {
                code: decodedText,
                mode: currentMode,
                timestamp: new Date().toISOString(),
                userName: sessionStorage.getItem('user_name') || 'Unknown User' // Add user name
            };
            
            // Log locally first
            logToPage(`Successfully scanned: ${decodedText} (${currentMode})`, 'success');
            
            // Fetch attendee data once and use it for both display areas
            fetchAttendeeDataForScan(decodedText, scanData);
            
        } catch (error) {
            logToPage(`Error processing scan: ${error.message}`, 'error');
            resetScanResultFields();
            // Make sure to unlock the scanner on error
            unlockScanner();
        }
    }
    
    // Updated function to fetch and display attendee data for the scan result section
    function fetchAttendeeDataForScan(code, scanData) {
        // Show loading state
        scanName.textContent = "Loading...";
        scanCompany.textContent = "Loading...";
        scanTimestamp.textContent = "Loading...";
        
        // Reset and hide both status elements during loading
        checkinStatus.classList.add('hidden');
        goodiebagStatus.classList.add('hidden');
        
        // First get check-in/goodie bag status from first API
        fetch(`${scriptUrl}?code=${encodeURIComponent(code)}`)
            .then(response => response.json())
            .then(data => {
                if (!data.success) {
                    // Reset scan result fields if there was an error
                    resetScanResultFields();
                    
                    // Show error for both statuses
                    checkinStatus.classList.remove('hidden');
                    checkinStatusValue.textContent = "Error: " + (data.message || "Attendee not found");
                    checkinStatusValue.className = "error-text";
                    
                    goodiebagStatus.classList.remove('hidden');
                    goodiebagStatusValue.textContent = "Error: " + (data.message || "Attendee not found");
                    goodiebagStatusValue.className = "error-text";
                    
                    // Still try to process the scan
                    sendToGoogleSheets(scanData, () => {
                        // Unlock scanner after operation, even on partial failure
                        unlockScanner();
                    });
                    
                    logToPage(`Lookup failed for scan: ${data.message}`, 'error');
                    return;
                }
                
                const checkInData = data.data;
                
                // Then get attendee details from second API
                fetchAttendeeDetails(code)
                    .then(attendeeDetails => {
                        // Combine data from both APIs
                        const combinedData = {
                            ...checkInData,
                            name: attendeeDetails.name,
                            email: attendeeDetails.email,
                            timestamp: attendeeDetails.timestamp, // Use timestamp from attendeeDetails
                            code: code // Add code to combined data for eligibility check
                        };
                        
                        // Display the combined data
                        updateScanResultWithAttendeeData(combinedData);
                        
                        // Now perform the actual scan operation (check-in or goodie bag)
                        // Only if scanData is not null (null means ineligible for goodie bag)
                        if (scanData) {
                            sendToGoogleSheets(scanData, () => {
                                // Unlock scanner after successful operation and response
                                unlockScanner();
                            });
                        } else {
                            // Just unlock the scanner without sending data
                            unlockScanner();
                        }
                        
                        // Log success
                        logToPage(`Retrieved attendee info for: ${code}`, 'success');
                    })
                    .catch(error => {
                        // If we can't get attendee details, still show check-in data with unknown name/email
                        updateScanResultWithAttendeeData({
                            ...checkInData,
                            name: "Unknown",
                            email: "Unknown",
                            timestamp: "Unknown" // Use "Unknown" instead of current timestamp
                        });
                        
                        // Now perform the actual scan operation (check-in or goodie bag)
                        sendToGoogleSheets(scanData, () => {
                            // Unlock scanner after operation
                            unlockScanner();
                        });
                        
                        logToPage(`Retrieved partial data. Attendee details error: ${error.message}`, 'warning');
                    });
            })
            .catch(error => {
                resetScanResultFields();
                
                // Show connection error for both statuses
                checkinStatus.classList.remove('hidden');
                checkinStatusValue.textContent = "Error connecting to database";
                checkinStatusValue.className = "error-text";
                
                goodiebagStatus.classList.remove('hidden');
                goodiebagStatusValue.textContent = "Error connecting to database";
                goodiebagStatusValue.className = "error-text";
                
                // Make sure to unlock scanner even on connection error
                sendToGoogleSheets(scanData, () => {
                    unlockScanner();
                });
                
                logToPage(`Error fetching attendee data: ${error.message}`, 'error');
            });
    }
    
    // Helper function to update scan result with attendee data - updated for date-only timestamp and eligibility warning
    function updateScanResultWithAttendeeData(data) {
        // Show name and email if available, otherwise show placeholder
        scanName.textContent = data.name || "-";
        scanCompany.textContent = data.email || "-"; // Repurpose company field for email
        
        // Display timestamp with date only format
        if (data.timestamp) {
            scanTimestamp.textContent = formatDateTime(data.timestamp, true); // true = date only
        } else {
            scanTimestamp.textContent = "-";
        }
        
        // Show both status elements regardless of current mode
        checkinStatus.classList.remove('hidden');
        goodiebagStatus.classList.remove('hidden');
        
        // Update check-in status
        if (data.isCheckedIn) {
            checkinStatusValue.textContent = `Already checked in at ${formatDateTime(data.checkInTime)}`;
            checkinStatusValue.className = "warning-text";
        } else {
            checkinStatusValue.textContent = "Not checked in yet";
            checkinStatusValue.className = "success-text";
        }
        
        // Update goodie bag status - add eligibility warning
        if (!isGoodieBagEligible(data.code) && currentMode === 'Goodie Bag') {
            goodiebagStatusValue.textContent = "⚠️ Not eligible (missing GB code)";
            goodiebagStatusValue.className = "error-text";
        } else if (data.hasGoodieBag) {
            goodiebagStatusValue.textContent = `Already received at ${formatDateTime(data.goodieBagTime)}`;
            goodiebagStatusValue.className = "warning-text";
        } else {
            goodiebagStatusValue.textContent = "Not received yet";
            goodiebagStatusValue.className = "success-text";
        }
        
        // Highlight the current mode status
        if (currentMode === 'Check-in') {
            checkinStatus.classList.add('current-mode');
            goodiebagStatus.classList.remove('current-mode');
        } else { // Goodie Bag mode
            checkinStatus.classList.remove('current-mode');
            goodiebagStatus.classList.add('current-mode');
        }
    }
    
    // Helper function to reset scan result fields - updated for name, email and timestamp
    function resetScanResultFields() {
        scanName.textContent = "-";
        scanCompany.textContent = "-";
        scanTimestamp.textContent = "-";
        
        // Reset and hide both statuses
        checkinStatus.classList.add('hidden');
        checkinStatusValue.textContent = "-";
        checkinStatusValue.className = "";
        
        goodiebagStatus.classList.add('hidden');
        goodiebagStatusValue.textContent = "-";
        goodiebagStatusValue.className = "";
    }
    
    // Add a fallback protection to ensure toggle is always re-enabled
    function ensureUIUnlocked() {
        // Check if the toggle is in disabled state and unlock it if needed
        if (modeToggle && modeToggle.disabled) {
            modeToggle.disabled = false;
            document.querySelector('.toggle').classList.remove('disabled');
            logToPage('Toggle re-enabled by safety check', 'info');
        }
    }
    
    modeToggle.addEventListener('change', function() {
        currentMode = this.checked ? 'Goodie Bag' : 'Check-in';
        modeValue.textContent = currentMode;
        logToPage(`Mode switched to: ${currentMode}`);
        
        // Reset scan result fields when mode is toggled
        resetScanResultFields();
        
        // Also reset the code value to make it clear it's ready for a new scan
        codeValue.textContent = "-";
        codeValue.style.color = "";
    });
    
    setTimeout(() => {
        initializeCameras();
    }, 500);
    
    async function initializeCameras() {
        try {
            logToPage('Getting available cameras...');
            
            Html5Qrcode.getCameras().then(devices => {
                cameras = devices;
                logToPage(`Found ${devices.length} camera(s)`);
                console.log("Available cameras:", devices);
                
                if (devices && devices.length > 0) {
                    const backCamera = devices.find(camera => 
                        /(back|rear|environment)/i.test(camera.label));
                    
                    if (backCamera) {
                        currentCameraIndex = devices.indexOf(backCamera);
                        logToPage('Back camera found, using it by default');
                    }
                    
                    if (devices[currentCameraIndex] && 
                        typeof devices[currentCameraIndex].id === 'string' && 
                        devices[currentCameraIndex].id.length > 0) {
                        
                        startScanner(devices[currentCameraIndex].id);
                    } else {
                        logToPage('Using environment facing camera as fallback');
                        startFallbackScanner();
                    }
                    
                    if (devices.length > 1 && !document.getElementById('switch-camera')) {
                        addCameraSwitchButton();
                    }
                } else {
                    logToPage('No cameras detected, trying alternative method', 'warning');
                    startFallbackScanner();
                }
            }).catch(err => {
                logToPage(`Error getting cameras: ${err.message}`, 'error');
                startFallbackScanner();
            });
        } catch (error) {
            logToPage(`Camera initialization error: ${error.message}`, 'error');
            startFallbackScanner();
        }
    }
    
    function addCameraSwitchButton() {
        const switchBtn = document.createElement('button');
        switchBtn.id = 'switch-camera';
        switchBtn.className = 'retry-button';
        switchBtn.textContent = 'Switch Camera';
        switchBtn.addEventListener('click', () => {
            currentCameraIndex = (currentCameraIndex + 1) % cameras.length;
            logToPage(`Switching to camera: ${cameras[currentCameraIndex].label || `Camera ${currentCameraIndex + 1}`}`);
            startScanner(cameras[currentCameraIndex].id);
        });
        
        reader.parentNode.insertBefore(switchBtn, reader.nextSibling);
    }
    
    function startScanner(cameraId) {
        if (html5QrCode && html5QrCode.isScanning) {
            html5QrCode.stop().then(() => {
                initScanner(cameraId);
            }).catch(err => {
                logToPage(`Error stopping current scanner: ${err.message}`, 'error');
                html5QrCode = null;
                initScanner(cameraId);
            });
        } else {
            initScanner(cameraId);
        }
    }
    
    function initScanner(cameraId) {
        try {
            logToPage(`Initializing scanner with camera ID: ${cameraId}`);
            
            html5QrCode = new Html5Qrcode("reader");
            
            const config = {
                fps: 10,
                qrbox: { width: 250, height: 250 },
                aspectRatio: 1.0
            };
            
            html5QrCode.start(
                cameraId, 
                config,
                qrCodeSuccessCallback,
                qrCodeErrorCallback
            ).then(() => {
                logToPage('Camera started successfully', 'success');
                cameraInitAttempts = 0;
                
                let flash = document.querySelector('.camera-flash');
                if (!flash) {
                    flash = document.createElement('div');
                    flash.className = 'camera-flash';
                    reader.appendChild(flash);
                }
                
                const existingRetryBtn = document.getElementById('retry-camera-btn');
                if (existingRetryBtn) {
                    existingRetryBtn.remove();
                }
                
            }).catch(err => {
                logToPage(`Failed to start camera: ${err.message}`, 'error');
                
                if (cameraInitAttempts < MAX_INIT_ATTEMPTS) {
                    cameraInitAttempts++;
                    logToPage('Trying alternative camera method...', 'info');
                    startFallbackScanner();
                } else {
                    showError(`Camera start failed after ${MAX_INIT_ATTEMPTS} attempts`);
                    addRetryButton();
                }
            });
        } catch (error) {
            logToPage(`Scanner initialization error: ${error.message}`, 'error');
            addRetryButton();
        }
    }
    
    function startFallbackScanner() {
        try {
            logToPage('Using fallback camera method');
            
            if (html5QrCode && html5QrCode.isScanning) {
                html5QrCode.stop().catch(err => 
                    logToPage(`Error stopping previous scanner: ${err.message}`, 'warning')
                );
            }
            
            html5QrCode = new Html5Qrcode("reader");
            
            html5QrCode.start(
                { facingMode: "environment" },
                {
                    fps: 10,
                    qrbox: { width: 250, height: 250 },
                    aspectRatio: 1.0
                },
                qrCodeSuccessCallback,
                qrCodeErrorCallback
            ).then(() => {
                logToPage('Fallback camera method succeeded', 'success');
                cameraInitAttempts = 0;
                
                let flash = document.querySelector('.camera-flash');
                if (!flash) {
                    flash = document.createElement('div');
                    flash.className = 'camera-flash';
                    reader.appendChild(flash);
                }
                
            }).catch(err => {
                logToPage(`Fallback camera method failed: ${err.message}`, 'error');
                showError("Could not access camera. Please ensure camera permissions are granted.");
                addRetryButton();
            });
        } catch (error) {
            logToPage(`Fallback scanner error: ${error.message}`, 'error');
            showError("Camera initialization failed completely. Please try refreshing the page.");
            addRetryButton();
        }
    }
    
    function addRetryButton() {
        const existingRetryBtn = document.getElementById('retry-camera-btn');
        if (existingRetryBtn) {
            existingRetryBtn.remove();
        }
        
        const retryBtn = document.createElement('button');
        retryBtn.id = 'retry-camera-btn';
        retryBtn.className = 'retry-button';
        retryBtn.textContent = 'Retry Camera';
        retryBtn.addEventListener('click', () => {
            logToPage('Manual camera retry requested', 'info');
            cameraInitAttempts = 0;
            initializeCameras();
        });
        
        reader.parentNode.insertBefore(retryBtn, reader);
    }
    
    function qrCodeErrorCallback(errorMessage) {
        if (!errorMessage) return;
        
        if (errorMessage.includes("No QR code found") || 
            errorMessage.includes("No MultiFormat Readers") ||
            errorMessage.includes("QR code parse error") ||
            errorMessage.includes("no MultiFormat") ||
            errorMessage.toLowerCase().includes("parse error")) {
            return;
        }
        
        if (errorMessage.includes("Unable to start scanning") || 
            errorMessage.includes("stream ended unexpectedly")) {
            logToPage(`Camera stream error detected, attempting recovery...`, 'error');
            setTimeout(() => {
                if (cameras.length > 0) {
                    startScanner(cameras[currentCameraIndex].id);
                } else {
                    startFallbackScanner();
                }
            }, 2000);
        } else {
            logToPage(`QR scan error: ${errorMessage}`, 'error');
        }
    }
    
    function showError(message) {
        codeValue.textContent = "Camera error - check permissions";
        codeValue.style.color = "red";
        logToPage(message, 'error');
    }
    
    window.addEventListener('beforeunload', () => {
        if (html5QrCode && html5QrCode.isScanning) {
            html5QrCode.stop().catch(err => logToPage(`Error stopping camera: ${err.message}`, 'error'));
        }
    });
    
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            if (html5QrCode && !html5QrCode.isScanning) {
                logToPage('Page visibility restored, checking camera...', 'info');
                if (cameras.length > 0) {
                    startScanner(cameras[currentCameraIndex].id);
                } else {
                    startFallbackScanner();
                }
            }
        }
    });
    
    logToPage('QR Scanner initialized and ready', 'info');
});
