document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded in script.js...');
    
    // Listen for authentication event
    document.addEventListener('userAuthenticated', function(event) {
        console.log('Received userAuthenticated event with profile:', event.detail);
        initializeQrScanner(event.detail); // Pass the user profile to initialize
    });
    
    // Listen for sign-out event to clean up resources
    document.addEventListener('userSignOut', function() {
        console.log('Received userSignOut event, cleaning up resources...');
        cleanupResources();
    });
    
    // Check if already authenticated (for page refreshes)
    if (typeof userProfile !== 'undefined' && userProfile !== null) {
        console.log('User already authenticated, initializing QR scanner...');
        initializeQrScanner(userProfile);
    } else {
        console.log('Waiting for user authentication...');
    }
});

// Global reference to allow proper cleanup
let globalHtml5QrCode = null;

// Function to clean up resources when signing out
function cleanupResources() {
    // Stop QR scanner if it's running
    if (globalHtml5QrCode && globalHtml5QrCode.isScanning) {
        console.log("Stopping QR scanner due to sign-out");
        globalHtml5QrCode.stop().catch(err => 
            console.error("Error stopping camera on sign-out:", err)
        );
    }
    
    // Release camera access
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices.getUserMedia({ video: true })
            .then(stream => {
                // Stop each track to fully release camera
                stream.getTracks().forEach(track => {
                    track.stop();
                });
                console.log("Camera access revoked due to sign-out");
            })
            .catch(() => {
                // Ignore errors here, as we're just trying to ensure camera is released
            });
    }
    
    // Reset global reference
    globalHtml5QrCode = null;
}

function initializeQrScanner(userProfile) {
    console.log('Initializing QR scanner for user:', userProfile.name);
    
    // Make sure app container is visible
    const appContainer = document.getElementById('app-container');
    if (appContainer) {
        appContainer.style.display = 'block';
        appContainer.classList.add('authenticated');
        console.log('App container set to visible');
    }
    
    const modeToggle = document.getElementById('mode-toggle');
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

    // Log a message about authenticated user
    if (userProfile) {
        logToPage(`Authenticated as: ${userProfile.name} (${userProfile.email})`, 'info');
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
    
    // Function to fetch attendee data from Google Sheets for manual lookup only
    function fetchAttendeeData(code) {
        // Show that we're loading
        lookupResult.innerHTML = '<div class="loading">Loading...</div>';
        lookupResult.classList.remove('hidden');
        
        // Generate a unique callback name for JSONP
        const callbackName = 'jsonpCallback_' + Math.round(Math.random() * 1000000);
        
        // Create a script element for JSONP
        const script = document.createElement('script');
        script.src = `${scriptUrl}?code=${encodeURIComponent(code)}&callback=${callbackName}`;
        
        // Setup global callback function
        window[callbackName] = function(data) {
            try {
                // Parse the response if it's a string
                const parsedData = typeof data === 'string' ? JSON.parse(data) : data;
                
                if (!parsedData.success) {
                    showLookupError(parsedData.message || 'Failed to find check-in status');
                    logToPage(`Lookup failed: ${parsedData.message}`, 'error');
                    return null;
                }
                
                const checkInData = parsedData.data;
                
                // Then get attendee details from second API using JSONP
                fetchAttendeeDetailsJsonp(code, function(attendeeDetails) {
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
                }, function(error) {
                    // Error handler for attendee details
                    displayAttendeeData({
                        ...checkInData,
                        name: "Unknown",
                        email: "Unknown",
                        timestamp: "Unknown" // Use "Unknown" instead of current timestamp
                    });
                    logToPage(`Retrieved partial data. Attendee details error: ${error}`, 'warning');
                });
            } catch (error) {
                showLookupError('Error processing response');
                logToPage(`Lookup error: ${error.message}`, 'error');
            } finally {
                // Clean up - remove script tag and delete global callback
                document.body.removeChild(script);
                delete window[callbackName];
            }
        };
        
        // Handle script load errors
        script.onerror = function() {
            showLookupError('Error connecting to database');
            logToPage(`Lookup error: Failed to connect to Google Scripts API`, 'error');
            document.body.removeChild(script);
            delete window[callbackName];
        };
        
        // Add the script to the page to start the request
        document.body.appendChild(script);
    }
    
    // New function to fetch attendee details using JSONP
    function fetchAttendeeDetailsJsonp(code, successCallback, errorCallback) {
        logToPage(`Fetching attendee details for code: ${code}`, 'info');
        
        // Generate a unique callback name for JSONP
        const callbackName = 'jsonpCallback_' + Math.round(Math.random() * 1000000);
        
        // Create a script element for JSONP
        const script = document.createElement('script');
        script.src = `${attendeeApiUrl}?code=${encodeURIComponent(code)}&callback=${callbackName}`;
        
        // Setup global callback function
        window[callbackName] = function(data) {
            try {
                // Parse the response if it's a string
                const parsedData = typeof data === 'string' ? JSON.parse(data) : data;
                
                if (!parsedData.success) {
                    throw new Error(parsedData.message || "Failed to retrieve attendee details");
                }
                
                // Log the actual response for debugging
                console.log("Attendee API response:", parsedData);
                
                // Format name from firstname and lastname fields
                const firstname = parsedData.data.firstname || "";
                const lastname = parsedData.data.lastname || "";
                const fullName = [firstname, lastname].filter(Boolean).join(' ');
                
                // Get the timestamp
                const timestamp = parsedData.data.timestamp || "";
                
                // Log the extracted details
                logToPage(`Found attendee: ${fullName}`, 'info');
                
                const attendeeData = {
                    name: fullName,
                    email: parsedData.data.email || "",
                    code: code,
                    timestamp: timestamp
                };
                
                // Call the success callback with the data
                successCallback(attendeeData);
            } catch (error) {
                logToPage(`Error fetching attendee details: ${error.message}`, 'error');
                errorCallback(error.message);
            } finally {
                // Clean up - remove script tag and delete global callback
                document.body.removeChild(script);
                delete window[callbackName];
            }
        };
        
        // Handle script load errors
        script.onerror = function() {
            logToPage(`Error connecting to attendee API`, 'error');
            errorCallback("Failed to connect to attendee API");
            document.body.removeChild(script);
            delete window[callbackName];
        };
        
        // Add the script to the page to start the request
        document.body.appendChild(script);
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
            timestamp: new Date().toISOString()
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
        
        // Use form-based POST to avoid CORS issues with POST requests
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = scriptUrl;
        form.target = 'hidden-frame';
        form.style.display = 'none';
        
        // Add data as hidden field
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = 'data';
        input.value = JSON.stringify(scanData);
        form.appendChild(input);
        
        // Create hidden iframe for response
        let iframe = document.getElementById('hidden-frame');
        if (!iframe) {
            iframe = document.createElement('iframe');
            iframe.name = 'hidden-frame';
            iframe.id = 'hidden-frame';
            iframe.style.display = 'none';
            document.body.appendChild(iframe);
        }
        
        // Set a timeout to ensure we don't wait forever
        const timeoutId = setTimeout(() => {
            logToPage('Operation timed out, but continuing...', 'warning');
            if (callback) callback();
            else unlockScanner();
        }, 5000);
        
        // Handle iframe load event
        iframe.onload = function() {
            clearTimeout(timeoutId);
            logToPage(`Data sent to Google Sheets. ${scanData.mode} status updated.`, 'success');
            if (callback) callback();
            else unlockScanner();
        };
        
        // Add form to document and submit
        document.body.appendChild(form);
        form.submit();
        
        // Remove form after submission
        setTimeout(() => {
            document.body.removeChild(form);
        }, 100);
    }
    
    // Modified function to fetch attendee data for scan result
    function fetchAttendeeDataForScan(code, scanData) {
        // Show loading state
        scanName.textContent = "Loading...";
        scanCompany.textContent = "Loading...";
        scanTimestamp.textContent = "Loading...";
        
        // Reset and hide both status elements during loading
        checkinStatus.classList.add('hidden');
        goodiebagStatus.classList.add('hidden');
        
        // Generate a unique callback name for JSONP
        const callbackName = 'jsonpCallback_' + Math.round(Math.random() * 1000000);
        
        // Create a script element for JSONP
        const script = document.createElement('script');
        script.src = `${scriptUrl}?code=${encodeURIComponent(code)}&callback=${callbackName}`;
        
        // Setup global callback function
        window[callbackName] = function(data) {
            try {
                // Parse the response if it's a string
                const parsedData = typeof data === 'string' ? JSON.parse(data) : data;
                
                if (!parsedData.success) {
                    // Reset scan result fields if there was an error
                    resetScanResultFields();
                    
                    // Show error for both statuses
                    checkinStatus.classList.remove('hidden');
                    checkinStatusValue.textContent = "Error: " + (parsedData.message || "Attendee not found");
                    checkinStatusValue.className = "error-text";
                    
                    goodiebagStatus.classList.remove('hidden');
                    goodiebagStatusValue.textContent = "Error: " + (parsedData.message || "Attendee not found");
                    goodiebagStatusValue.className = "error-text";
                    
                    // Still try to process the scan
                    if (scanData) {
                        sendToGoogleSheets(scanData, () => {
                            // Unlock scanner after operation, even on partial failure
                            unlockScanner();
                        });
                    } else {
                        unlockScanner();
                    }
                    
                    logToPage(`Lookup failed for scan: ${parsedData.message}`, 'error');
                    return;
                }
                
                const checkInData = parsedData.data;
                
                // Then get attendee details from second API using JSONP
                fetchAttendeeDetailsJsonp(code, function(attendeeDetails) {
                    // Combine data from both APIs
                    const combinedData = {
                        ...checkInData,
                        name: attendeeDetails.name,
                        email: attendeeDetails.email,
                        timestamp: attendeeDetails.timestamp,
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
                }, function(error) {
                    // If we can't get attendee details, still show check-in data with unknown name/email
                    updateScanResultWithAttendeeData({
                        ...checkInData,
                        name: "Unknown",
                        email: "Unknown",
                        timestamp: "Unknown",
                        code: code
                    });
                    
                    // Now perform the actual scan operation (check-in or goodie bag)
                    if (scanData) {
                        sendToGoogleSheets(scanData, () => {
                            // Unlock scanner after operation
                            unlockScanner();
                        });
                    } else {
                        unlockScanner();
                    }
                    
                    logToPage(`Retrieved partial data. Attendee details error: ${error}`, 'warning');
                });
            } catch (error) {
                resetScanResultFields();
                
                // Show connection error for both statuses
                checkinStatus.classList.remove('hidden');
                checkinStatusValue.textContent = "Error processing response";
                checkinStatusValue.className = "error-text";
                
                goodiebagStatus.classList.remove('hidden');
                goodiebagStatusValue.textContent = "Error processing response";
                goodiebagStatusValue.className = "error-text";
                
                // Make sure to unlock scanner even on error
                if (scanData) {
                    sendToGoogleSheets(scanData, () => {
                        unlockScanner();
                    });
                } else {
                    unlockScanner();
                }
                
                logToPage(`Error processing data: ${error.message}`, 'error');
            } finally {
                // Clean up - remove script tag and delete global callback
                document.body.removeChild(script);
                delete window[callbackName];
            }
        };
        
        // Handle script load errors
        script.onerror = function() {
            resetScanResultFields();
            
            // Show connection error for both statuses
            checkinStatus.classList.remove('hidden');
            checkinStatusValue.textContent = "Error connecting to database";
            checkinStatusValue.className = "error-text";
            
            goodiebagStatus.classList.remove('hidden');
            goodiebagStatusValue.textContent = "Error connecting to database";
            goodiebagStatusValue.className = "error-text";
            
            // Make sure to unlock scanner even on connection error
            if (scanData) {
                sendToGoogleSheets(scanData, () => {
                    unlockScanner();
                });
            } else {
                unlockScanner();
            }
            
            logToPage(`Error fetching attendee data: Failed to connect to API`, 'error');
            document.body.removeChild(script);
            delete window[callbackName];
        };
        
        // Add the script to the page to start the request
        document.body.appendChild(script);
    }
    
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
    
    function ensureUIUnlocked() {
        // Check if the toggle is in disabled state and unlock it if needed
        if (modeToggle && modeToggle.disabled) {
            modeToggle.disabled = false;
            document.querySelector('.toggle').classList.remove('disabled');
            logToPage('Toggle re-enabled by safety check', 'info');
        }
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
    
    // Enhanced beforeunload handler
    window.addEventListener('beforeunload', () => {
        cleanupResources();
    });
    
    // Enhanced visibility change handler
    document.addEventListener('visibilitychange', () => {
        // Only restart scanner if user is still logged in
        if (document.visibilityState === 'visible' && userProfile) {
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
}
