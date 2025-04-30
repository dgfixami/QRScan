document.addEventListener('DOMContentLoaded', function() {
    const modeToggle = document.getElementById('mode-toggle');
    const modeValue = document.getElementById('mode-value');
    const codeValue = document.getElementById('code-value');
    const reader = document.getElementById('reader');
    const logMessages = document.getElementById('log-messages');
    
    // Scan result elements
    const scanName = document.getElementById('scan-name');
    const scanCompany = document.getElementById('scan-company');
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
    
    // Google Apps Script web app URL
    const scriptUrl = 'https://script.google.com/macros/s/AKfycbwq4-bWqzLPeV7bOaXllswGmjir-U9tmQr7eq6EUUq5-xSpVVgvAfxWtQNEIwMKVSI0/exec';
    
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
    
    // New helper function to format dates nicely
    function formatDateTime(dateString) {
        // If empty/null, return empty string
        if (!dateString) return '';
        
        try {
            // Parse the input date string (handles both ISO format and spreadsheet format)
            const date = new Date(dateString);
            
            // Check if date is valid
            if (isNaN(date.getTime())) {
                // If already in DD-MM-YYYY HH:MM:SS format, return as is
                if (typeof dateString === 'string' && 
                    dateString.match(/^\d{2}-\d{2}-\d{4} \d{2}:\d{2}:\d{2}$/)) {
                    return dateString;
                }
                return dateString; // Return original if can't parse
            }
            
            // Format the date as HH:MM:SS DD-MM-YYYY
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            const seconds = String(date.getSeconds()).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const month = String(date.getMonth() + 1).padStart(2, '0'); // Month is 0-based
            const year = date.getFullYear();
            
            return `${hours}:${minutes}:${seconds} ${day}-${month}-${year}`;
        } catch (error) {
            console.error("Date formatting error:", error);
            return dateString; // Return original on error
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
        
        // Construct URL with parameters
        const url = `${scriptUrl}?code=${encodeURIComponent(code)}`;
        
        fetch(url)
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    displayAttendeeData(data.data);
                    logToPage(`Successfully retrieved data for code: ${code}`, 'success');
                } else {
                    showLookupError(data.message || 'Failed to find attendee');
                    logToPage(`Lookup failed: ${data.message}`, 'error');
                }
            })
            .catch(error => {
                showLookupError('Error connecting to database');
                logToPage(`Lookup error: ${error.message}`, 'error');
            });
    }
    
    // Function to display attendee data - updated to combine name fields
    function displayAttendeeData(data) {
        // Clear any previous content
        lookupResult.innerHTML = '';
        
        // Re-create the attendee info container
        const infoDiv = document.createElement('div');
        infoDiv.className = 'attendee-info';
        
        // Combine first name and last name into a single field
        const fullName = data.name + ' ' + data.email;
        const email = data.company || '-';
        
        // Combined name field
        const nameP = document.createElement('p');
        nameP.innerHTML = `<strong>Name:</strong> <span id="attendee-name">${fullName}</span>`;
        
        // Email field (was company)
        const emailP = document.createElement('p');
        emailP.innerHTML = `<strong>Email:</strong> <span id="attendee-company">${email}</span>`;
        
        // Format the timestamps
        const formattedCheckInTime = formatDateTime(data.checkInTime);
        const formattedGoodieBagTime = formatDateTime(data.goodieBagTime);
        
        // Check-in Status with nicely formatted time
        const checkinP = document.createElement('p');
        const checkinStatus = data.isCheckedIn ? `⚠️ Already Checked in at ${formattedCheckInTime}` : '✅ First time check-in';
        checkinP.innerHTML = `<strong>Check-in Status:</strong> <span id="attendee-checkin">${checkinStatus}</span>`;
        
        // Goodie Bag Status with nicely formatted time
        const goodiebagP = document.createElement('p');
        const goodiebagStatus = data.hasGoodieBag ? `⚠️ Already received at ${formattedGoodieBagTime}` : '✅ First time goodie bag';
        goodiebagP.innerHTML = `<strong>Goodie Bag Status:</strong> <span id="attendee-goodiebag">${goodiebagStatus}</span>`;
        
        // Action buttons
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
        
        // Only show goodie bag button if not already received
        if (!data.hasGoodieBag) {
            const goodiebagBtn = document.createElement('button');
            goodiebagBtn.textContent = 'Mark Goodie Bag Received';
            goodiebagBtn.className = 'action-button goodiebag-button';
            goodiebagBtn.addEventListener('click', () => {
                performAction(data.code, 'Goodie Bag');
            });
            actionsDiv.appendChild(goodiebagBtn);
        }
        
        // Add elements to the info div - removed the last name element
        infoDiv.appendChild(nameP);
        infoDiv.appendChild(emailP);
        infoDiv.appendChild(checkinP);
        infoDiv.appendChild(goodiebagP);
        
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
        });
    }
    
    // Modified function to send data to Google Sheets with callback
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
        .then(response => {
            // Due to no-cors mode, we won't get a proper response to parse
            logToPage(`Data sent to Google Sheets. ${scanData.mode} status updated.`, 'success');
            
            // Remove success alerts but keep in logs
            // No more alerts for successful operations
            
            // Execute callback if provided
            if (typeof callback === 'function') {
                callback();
            }
        })
        .catch(error => {
            logToPage(`Error sending to Google Sheets: ${error.message}`, 'error');
            // Keep error alert to notify user of failures
            alert(`⚠️ Error processing ${scanData.mode} for code: ${scanData.code}`);
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
    
    // Success callback when QR code is scanned - updated to avoid duplicate lookups
    function qrCodeSuccessCallback(decodedText) {
        try {
            const flash = document.querySelector('.camera-flash');
            if (flash) {
                flash.classList.add('flash-animation');
                setTimeout(() => flash.classList.remove('flash-animation'), 500);
            }
            
            // Update the UI
            codeValue.textContent = decodedText;
            codeValue.style.color = "";
            
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
            resetScanResultFields();
        }
    }
    
    // Updated function to fetch and display attendee data for the scan result section
    function fetchAttendeeDataForScan(code, scanData) {
        // Show loading state
        scanName.textContent = "Loading...";
        scanCompany.textContent = "Loading...";
        
        // Reset and hide both status elements during loading
        checkinStatus.classList.add('hidden');
        goodiebagStatus.classList.add('hidden');
        
        // Construct URL with parameters
        const url = `${scriptUrl}?code=${encodeURIComponent(code)}`;
        
        fetch(url)
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    // Display the attendee data in the scan result section only
                    updateScanResultWithAttendeeData(data.data);
                    
                    // Now perform the actual scan operation (check-in or goodie bag)
                    sendToGoogleSheets(scanData);
                    
                    // Log success
                    logToPage(`Retrieved attendee info for: ${data.data.name}`, 'success');
                } else {
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
                    sendToGoogleSheets(scanData);
                    
                    logToPage(`Lookup failed for scan: ${data.message}`, 'error');
                }
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
                
                // Still try to process the scan
                sendToGoogleSheets(scanData);
                
                logToPage(`Error fetching attendee data: ${error.message}`, 'error');
            });
    }
    
    // Helper function to update scan result with attendee data - updated to show both statuses
    function updateScanResultWithAttendeeData(data) {
        // Combine first name (name) and last name (email) into a single name field
        const fullName = data.name + ' ' + data.email;
        const email = data.company || "-";
        
        scanName.textContent = fullName;
        scanCompany.textContent = email;  // Company field shows email
        
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
        
        // Update goodie bag status
        if (data.hasGoodieBag) {
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
    
    // Helper function to reset scan result fields - updated for dual status
    function resetScanResultFields() {
        scanName.textContent = "-";
        scanCompany.textContent = "-";
        // Remove reference to scanEmail since we're not using it anymore
        
        // Reset and hide both statuses
        checkinStatus.classList.add('hidden');
        checkinStatusValue.textContent = "-";
        checkinStatusValue.className = "";
        
        goodiebagStatus.classList.add('hidden');
        goodiebagStatusValue.textContent = "-";
        goodiebagStatusValue.className = "";
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
