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
    
    // New function to lock scanner - updated to disable mode buttons
    function lockScanner() {
        isScanning = true;
        const logMsg = 'Scanner locked - processing current scan';
        logToPage(logMsg, 'info');
        
        // Show loading overlay with latest log message
        showLoadingOverlay('Processing scan...', logMsg);
        
        // Disable mode buttons during scanning
        modeButtons.forEach(btn => {
            btn.disabled = true;
            btn.classList.add('disabled');
        });
    }
    
    // Enhanced unlockScanner function that incorporates ensureUIUnlocked functionality
    function unlockScanner() {
        // Set scanning state to false
        isScanning = false;
        const logMsg = 'Scanner unlocked - ready for next scan';
        logToPage(logMsg, 'info');
        
        // Hide loading overlay
        hideLoadingOverlay();
        
        // Check if any buttons are in disabled state and unlock them
        let anyLocked = false;
        modeButtons.forEach(btn => {
            if (btn.disabled) {
                btn.disabled = false;
                btn.classList.remove('disabled');
                anyLocked = true;
            }
        });
        
        if (anyLocked) {
            logToPage('Buttons re-enabled by safety check', 'info');
        }
    }
    
    // New variables for the loading overlay
    let loadingOverlay;
    let loadingMessage;
    let loadingProgress;
    
    // Create loading overlay function - will be called after HTML5QrCode is initialized
    function createLoadingOverlay() {
        if (document.querySelector('.camera-loading-overlay')) return;
        
        // Create the overlay elements
        loadingOverlay = document.createElement('div');
        loadingOverlay.className = 'camera-loading-overlay';
        
        const spinner = document.createElement('div');
        spinner.className = 'camera-loading-spinner';
        
        loadingMessage = document.createElement('div');
        loadingMessage.className = 'camera-loading-message';
        loadingMessage.textContent = 'Processing scan...';
        
        loadingProgress = document.createElement('div');
        loadingProgress.className = 'camera-loading-progress';
        loadingProgress.textContent = 'Please wait';
        
        // Append elements to overlay
        loadingOverlay.appendChild(spinner);
        loadingOverlay.appendChild(loadingMessage);
        loadingOverlay.appendChild(loadingProgress);
        
        // Append overlay to reader container
        if (reader) {
            reader.appendChild(loadingOverlay);
            logToPage('Loading overlay created', 'info');
        }
    }
    
    // Enhanced function to show loading overlay
    function showLoadingOverlay(message, progressText) {
        if (!loadingOverlay && reader) {
            createLoadingOverlay();
        }
        
        if (loadingOverlay) {
            if (message) loadingMessage.textContent = message;
            if (progressText) loadingProgress.textContent = progressText;
            loadingOverlay.classList.add('active');
        }
    }
    
    // Function to hide loading overlay
    function hideLoadingOverlay() {
        if (loadingOverlay) {
            loadingOverlay.classList.remove('active');
        }
    }
    
    // Enhanced logToPage function to update loading overlay with latest message
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
        
        // Update loading progress message if overlay is active
        if (loadingOverlay && loadingOverlay.classList.contains('active')) {
            loadingProgress.textContent = message;
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
            fetchAttendeeData(code);
            
            // Unlock the scanner
            unlockScanner();
        });
    }
    
    // Modified function to send data to Google Sheets with callback
    function sendToGoogleSheets(scanData, callback) {
        // Show sending status
        const logMsg = 'Sending data to Google Sheets...';
        logToPage(logMsg, 'info');
        
        // Update loading overlay
        showLoadingOverlay(`Processing ${scanData.mode} for code: ${scanData.code}`, logMsg);
        
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
            const successMsg = `Data sent to Google Sheets. ${scanData.mode} status updated.`;
            logToPage(successMsg, 'success');
            
            // Update loading overlay
            showLoadingOverlay(`${scanData.mode} Complete`, successMsg);
            
            // Execute callback if provided
            if (typeof callback === 'function') {
                callback();
            } else {
                // Ensure unlock happens even if callback is not provided
                unlockScanner();
            }
        })
        .catch(error => {
            const errorMsg = `Error sending to Google Sheets: ${error.message}`;
            logToPage(errorMsg, 'error');
            
            // Update loading overlay
            showLoadingOverlay(`Error with ${scanData.mode}`, errorMsg);
            
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
    
    // Success callback when QR code is scanned - updated to show loading overlay
    function qrCodeSuccessCallback(decodedText) {
        // If scanner is locked, silently ignore this scan (no logging)
        if (isScanning) {
            return; // Silent return without logging
        }
        
        try {
            // Lock the scanner immediately
            lockScanner();
            
            const flash = document.querySelector('.camera-flash');
            if (flash) {
                flash.classList.add('flash-animation');
                setTimeout(() => flash.classList.remove('flash-animation'), 500);
            }
            
            // Update the UI
            codeValue.textContent = decodedText;
            codeValue.style.color = "";
            
            // Update loading overlay with initial scan info
            showLoadingOverlay(`Successfully scanned code`, `Processing ${currentMode} for code: ${decodedText}`);
            
            // Check eligibility for goodie bag mode first - only relevant for Goodie Bag mode
            if (currentMode === 'Goodie Bag' && !isGoodieBagEligible(decodedText)) {
                logToPage(`Cannot process goodie bag - code ${decodedText} is not eligible (missing GB code)`, 'error');
                
                // Update loading overlay with error
                showLoadingOverlay(`Goodie Bag Error`, `Code ${decodedText} is not eligible (missing GB code)`);
                
                // We still want to fetch the attendee data to show the user details
                // But we won't mark it as received in the system
                fetchAttendeeDataForScan(decodedText, null); // Pass null for scanData to skip marking
                
                return;
            }
            
            // For Contest mode, all codes are eligible, so continue normally
            
            // Prepare data for Google Sheets integration
            const scanData = {
                code: decodedText,
                mode: currentMode,
                timestamp: new Date().toISOString()
            };
            
            // Log locally first
            logToPage(`Successfully scanned: ${decodedText} (${currentMode})`, 'success');
            
            // Fetch attendee data once and use it for both display areas
            fetchAttendeeDataForScan(decodedText, scanData);
            
        } catch (error) {
            logToPage(`Error processing scan: ${error.message}`, 'error');
            
            // Update loading overlay with error
            showLoadingOverlay(`Scan Error`, `Error processing scan: ${error.message}`);
            
            resetScanResultFields();
            // Make sure to unlock the scanner on error
            unlockScanner();
        }
    }
    
    // Modified function to initialize cameras - add loading overlay creation
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
                
                // Create the loading overlay after camera is successfully started
                createLoadingOverlay();
                
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
                
                // Create the loading overlay after camera is successfully started
                createLoadingOverlay();
                
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
