// Google Authentication variables
let currentUser = null;
let userToken = null;
const ALLOWED_DOMAIN = 'fixami.com';

// Function to handle Google Sign-In response
function handleCredentialResponse(response) {
    // Decode the credential to get user info
    const credential = parseJwt(response.credential);
    console.log("Google user info:", credential);
    
    // Check if user's email domain is fixami.com
    if (credential.email && credential.email.endsWith('@' + ALLOWED_DOMAIN)) {
        // Store user info
        currentUser = {
            name: credential.name,
            email: credential.email,
            picture: credential.picture
        };
        userToken = response.credential;
        
        // Update UI to show logged in state
        document.getElementById('user-name').textContent = currentUser.name;
        document.getElementById('user-email').textContent = currentUser.email;
        document.getElementById('not-logged-in').classList.add('hidden');
        document.getElementById('logged-in').classList.remove('hidden');
        document.getElementById('app-content').classList.remove('hidden');
        
        // Log the successful login
        logToPage(`Authenticated as ${currentUser.name} (${currentUser.email})`, 'success');
        
        // Initialize app functionality now that user is logged in
        initApp();
    } else {
        // Show an error for non-fixami.com email
        alert('Please use a Fixami email address to access this application');
        // Log failed attempt
        if (credential.email) {
            console.warn(`Unauthorized access attempt by: ${credential.email}`);
            logToPage(`Authentication failed: ${credential.email} is not a Fixami email`, 'error');
        } else {
            console.warn('Invalid credentials provided');
            logToPage('Authentication failed: Invalid credentials', 'error');
        }
        // Sign out the user
        signOut();
    }
}

// Helper function to parse JWT token
function parseJwt(token) {
    try {
        // Get the base64 encoded token payload
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        // Decode and parse as JSON
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        return JSON.parse(jsonPayload);
    } catch (e) {
        console.error('Error parsing token', e);
        return {};
    }
}

// Function to sign out user
function signOut() {
    // Clear user data
    currentUser = null;
    userToken = null;
    
    // Update UI
    document.getElementById('user-name').textContent = '-';
    document.getElementById('user-email').textContent = '-';
    document.getElementById('logged-in').classList.add('hidden');
    document.getElementById('not-logged-in').classList.remove('hidden');
    document.getElementById('app-content').classList.add('hidden');
    
    // Log the sign out
    logToPage('Signed out', 'info');
}

// Modify existing app initialization to only happen after authentication
function initApp() {
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

    // Setup mode toggle
    if(modeToggle) {
        modeToggle.addEventListener('change', function() {
            currentMode = this.checked ? 'Goodie Bag' : 'Check-in';
            modeValue.textContent = currentMode;
            logToPage(`Mode changed to: ${currentMode}`, 'info');
        });
    }

    // Initialize the QR Code scanner
    function initQRScanner() {
        if (html5QrCode) {
            html5QrCode.stop().then(() => {
                html5QrCode.clear();
                html5QrCode = null;
                startScanner();
            }).catch(err => {
                console.error("Failed to stop camera:", err);
                html5QrCode = null;
                startScanner();
            });
        } else {
            startScanner();
        }
    }

    // Function to start the scanner with the current camera
    function startScanner() {
        if (!cameras || cameras.length === 0) {
            logToPage("No cameras detected. Please ensure camera permissions are granted.", "error");
            return;
        }

        html5QrCode = new Html5Qrcode("reader");
        
        // Add camera switch button if multiple cameras available
        if (cameras.length > 1) {
            const switchButton = document.createElement("button");
            switchButton.id = "switch-camera";
            switchButton.textContent = "Switch Camera";
            switchButton.addEventListener("click", function() {
                switchCamera();
            });
            
            const scannerContainer = document.querySelector(".scanner-container");
            scannerContainer.insertBefore(switchButton, scannerContainer.firstChild);
        }
        
        // Use the currentCameraIndex to get the camera ID
        const cameraId = cameras[currentCameraIndex].id;
        
        html5QrCode.start(
            cameraId,
            {
                fps: 10,
                qrbox: 250
            },
            onScanSuccess,
            onScanFailure
        ).catch(err => {
            logToPage(`Error starting scanner: ${err.message}`, "error");
            // Try another camera if available
            if (cameras.length > 1) {
                currentCameraIndex = (currentCameraIndex + 1) % cameras.length;
                startScanner();
            }
        });
    }

    // Function to switch camera
    function switchCamera() {
        if (cameras.length <= 1) return;
        
        if (html5QrCode && html5QrCode.getState() === Html5QrcodeScannerState.SCANNING) {
            html5QrCode.stop().then(() => {
                currentCameraIndex = (currentCameraIndex + 1) % cameras.length;
                logToPage(`Switching to camera ${currentCameraIndex + 1}`, "info");
                startScanner();
            }).catch(err => {
                logToPage(`Error switching camera: ${err}`, "error");
            });
        }
    }

    // Function to handle successful QR code scans
    function onScanSuccess(decodedText, decodedResult) {
        // Prevent multiple scans while processing
        if (isScanning) {
            return;
        }
        
        isScanning = true;
        
        // Add camera flash effect
        const flash = document.createElement('div');
        flash.className = 'camera-flash';
        reader.appendChild(flash);
        
        // Trigger the flash animation
        setTimeout(() => {
            flash.classList.add('flash-animation');
        }, 10);
        
        // Remove flash element after animation
        setTimeout(() => {
            if (reader.contains(flash)) {
                reader.removeChild(flash);
            }
        }, 700);
        
        // Update UI with code
        codeValue.textContent = decodedText;
        logToPage(`QR Code scanned: ${decodedText}`, "info");
        
        // Process the scan
        processCode(decodedText);
    }

    // Function to handle scan failures (mostly for debugging)
    function onScanFailure(error) {
        // Don't log errors to UI during normal operation to avoid spamming logs
        console.debug(`QR Code scan error: ${error}`);
    }

    // Function to process the scanned QR code
    function processCode(code) {
        // Reset UI
        resetScanResult();
        
        // Show loading state
        scanName.textContent = "Loading...";
        scanCompany.textContent = "Loading...";
        
        // Disable mode toggle during processing
        if (modeToggle) {
            modeToggle.disabled = true;
            modeToggle.parentElement.classList.add('disabled');
        }
        
        // Prepare the request URL
        let url = new URL(scriptUrl);
        url.searchParams.append('code', code);
        
        // Fetch attendee data
        fetch(url.toString())
            .then(response => {
                // For no-cors mode, we need to handle the case where we don't get a valid JSON response
                try {
                    return response.json();
                } catch (e) {
                    throw new Error("Invalid response from server");
                }
            })
            .then(data => {
                if (!data || !data.success) {
                    throw new Error(data?.message || "Failed to fetch attendee data");
                }
                
                // Update UI with attendee details
                updateScanResult(data.data, code);
                
                // Send to Google Sheets for processing
                const scanData = {
                    code: code,
                    mode: currentMode,
                    timestamp: new Date().toISOString()
                };
                
                sendToGoogleSheets(scanData, unlockScanner);
            })
            .catch(error => {
                logToPage(`Error processing code: ${error.message}`, "error");
                scanName.textContent = "Error";
                scanCompany.textContent = error.message;
                scanTimestamp.textContent = "-";
                
                // Unlock scanner after error
                unlockScanner();
            });
    }

    // Function to update the scan result UI with attendee data
    function updateScanResult(data, code) {
        // Format the name
        scanName.textContent = data.name || "Unknown";
        
        // Use email/company field
        scanCompany.textContent = data.email || "Unknown";
        
        // Format timestamp if available
        scanTimestamp.textContent = data.timestamp || "-";
        
        // Show check-in/goodie bag status
        if (data.isCheckedIn) {
            checkinStatus.classList.remove('hidden');
            checkinStatusValue.textContent = "Yes - " + (data.checkInTime || "Time unknown");
            checkinStatusValue.classList.add('success-text');
        } else {
            checkinStatus.classList.remove('hidden');
            checkinStatusValue.textContent = "No";
            checkinStatusValue.classList.add('warning-text');
        }
        
        if (data.hasGoodieBag) {
            goodiebagStatus.classList.remove('hidden');
            goodiebagStatusValue.textContent = "Yes - " + (data.goodieBagTime || "Time unknown");
            goodiebagStatusValue.classList.add('success-text');
        } else {
            goodiebagStatus.classList.remove('hidden');
            goodiebagStatusValue.textContent = "No";
            goodiebagStatusValue.classList.add('warning-text');
        }
        
        // Highlight current mode
        highlightCurrentMode();
    }

    // Function to reset scan result UI
    function resetScanResult() {
        scanName.textContent = "-";
        scanCompany.textContent = "-";
        scanTimestamp.textContent = "-";
        checkinStatus.classList.add('hidden');
        goodiebagStatus.classList.add('hidden');
        checkinStatusValue.textContent = "-";
        goodiebagStatusValue.textContent = "-";
        checkinStatusValue.className = '';
        goodiebagStatusValue.className = '';
        
        // Remove any previous highlights
        checkinStatus.classList.remove('current-mode');
        goodiebagStatus.classList.remove('current-mode');
    }

    // Function to highlight the current mode in the scan result
    function highlightCurrentMode() {
        // Remove existing highlights
        checkinStatus.classList.remove('current-mode');
        goodiebagStatus.classList.remove('current-mode');
        
        // Add highlight to current mode
        if (currentMode === 'Check-in') {
            checkinStatus.classList.add('current-mode');
        } else if (currentMode === 'Goodie Bag') {
            goodiebagStatus.classList.add('current-mode');
        }
    }

    // Function to unlock scanner after processing
    function unlockScanner() {
        isScanning = false;
        
        // Re-enable mode toggle
        if (modeToggle) {
            modeToggle.disabled = false;
            modeToggle.parentElement.classList.remove('disabled');
        }
    }

    // Function to lookup attendee by code
    function lookupAttendee() {
        const code = lookupCode.value.trim();
        
        if (!code) {
            lookupResult.innerHTML = '<div class="lookup-error">Please enter a QR code.</div>';
            lookupResult.classList.remove('hidden');
            return;
        }
        
        // Show loading state
        lookupResult.innerHTML = '<div class="loading">Looking up attendee...</div>';
        lookupResult.classList.remove('hidden');
        
        // Prepare the request URL
        let url = new URL(scriptUrl);
        url.searchParams.append('code', code);
        
        // Fetch attendee data
        fetch(url.toString())
            .then(response => {
                try {
                    return response.json();
                } catch (e) {
                    throw new Error("Invalid response from server");
                }
            })
            .then(data => {
                if (!data || !data.success) {
                    throw new Error(data?.message || "Failed to fetch attendee data");
                }
                
                // Update UI with attendee details
                displayAttendeeInfo(data.data, code);
            })
            .catch(error => {
                logToPage(`Lookup error: ${error.message}`, "error");
                lookupResult.innerHTML = `<div class="lookup-error">Error: ${error.message}</div>`;
            });
    }

    // Function to display attendee info in lookup result
    function displayAttendeeInfo(data, code) {
        // Create the attendee info display
        let html = '<div class="attendee-info">';
        
        // Add attendee details
        html += `<p><strong>Code:</strong> ${code}</p>`;
        html += `<p><strong>Name:</strong> ${data.name || "Unknown"}</p>`;
        html += `<p><strong>Email/Company:</strong> ${data.email || "Unknown"}</p>`;
        
        // Add check-in status
        if (data.isCheckedIn) {
            html += `<p><strong>Check-in:</strong> <span class="success-text">Yes - ${data.checkInTime || "Time unknown"}</span></p>`;
        } else {
            html += `<p><strong>Check-in:</strong> <span class="warning-text">No</span></p>`;
        }
        
        // Add goodie bag status
        if (data.hasGoodieBag) {
            html += `<p><strong>Goodie Bag:</strong> <span class="success-text">Yes - ${data.goodieBagTime || "Time unknown"}</span></p>`;
        } else {
            html += `<p><strong>Goodie Bag:</strong> <span class="warning-text">No</span></p>`;
        }
        
        // Add actions if not already processed
        html += '<div class="lookup-actions">';
        
        if (!data.isCheckedIn) {
            html += `<button class="action-button checkin-button" onclick="manualCheckin('${code}')">Check In</button>`;
        }
        
        if (!data.hasGoodieBag) {
            html += `<button class="action-button goodiebag-button" onclick="manualGoodieBag('${code}')">Give Goodie Bag</button>`;
        }
        
        html += '</div></div>';
        
        // Update the lookup result
        lookupResult.innerHTML = html;
    }

    // Initialize cameras
    function initializeCameras() {
        // Create a wrapper for the enumerateDevices function to handle older browsers
        const getVideoDevices = () => {
            return new Promise((resolve, reject) => {
                if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
                    logToPage("Browser doesn't support media devices API", "error");
                    reject(new Error("Browser doesn't support media devices API"));
                    return;
                }
                
                navigator.mediaDevices.enumerateDevices()
                    .then(devices => {
                        // Filter for video input devices (cameras)
                        const videoDevices = devices.filter(device => device.kind === 'videoinput');
                        resolve(videoDevices);
                    })
                    .catch(err => {
                        logToPage(`Error accessing cameras: ${err.message}`, "error");
                        reject(err);
                    });
            });
        };
        
        // Start the initialization process
        getVideoDevices()
            .then(videoDevices => {
                if (videoDevices.length === 0) {
                    throw new Error("No cameras found on this device");
                }
                
                cameras = videoDevices;
                logToPage(`Found ${cameras.length} camera(s)`, "info");
                
                // Start QR scanner with the first camera
                currentCameraIndex = 0;
                initQRScanner();
            })
            .catch(err => {
                cameraInitAttempts++;
                logToPage(`Camera initialization error: ${err.message}`, "error");
                
                if (cameraInitAttempts < MAX_INIT_ATTEMPTS) {
                    logToPage(`Retrying camera initialization (${cameraInitAttempts}/${MAX_INIT_ATTEMPTS})...`, "info");
                    setTimeout(initializeCameras, 1000);
                } else {
                    logToPage("Failed to initialize camera after multiple attempts. Please reload the page.", "error");
                }
            });
    }

    // Add global functions for manual check-in and goodie bag actions
    window.manualCheckin = function(code) {
        handleManualAction(code, 'Check-in');
    };
    
    window.manualGoodieBag = function(code) {
        handleManualAction(code, 'Goodie Bag');
    };

    // Function to handle manual check-in/goodie bag actions
    function handleManualAction(code, mode) {
        logToPage(`Processing manual ${mode} for code: ${code}`, "info");
        
        // Prepare data for Google Sheets
        const scanData = {
            code: code,
            mode: mode,
            timestamp: new Date().toISOString()
        };
        
        // Update lookup result to show processing
        lookupResult.innerHTML = `<div class="loading">Processing ${mode}...</div>`;
        
        // Send to Google Sheets
        sendToGoogleSheets(scanData, function() {
            // After processing, look up the code again to refresh data
            lookupAttendee();
        });
    }

    // Modify sendToGoogleSheets to include user info
    function sendToGoogleSheets(scanData, callback) {
        // Add user information to scan data
        if (currentUser) {
            scanData.operatedBy = currentUser.name;
            scanData.operatorEmail = currentUser.email;
        }
        
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
    
    // Initialize cameras
    setTimeout(() => {
        initializeCameras();
    }, 500);
}

// Event listener for DOM loaded - now just sets up auth-related functionality
document.addEventListener('DOMContentLoaded', function() {
    // Setup sign out button
    document.getElementById('sign-out-button').addEventListener('click', function() {
        signOut();
    });
    
    // Initialize log messages div for early auth logging
    window.logToPage = function(message, type = 'info') {
        const logMessages = document.getElementById('log-messages');
        if (!logMessages) return;
        
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
    };
    
    // Log that page has loaded
    logToPage('Page loaded. Waiting for authentication...', 'info');
});
