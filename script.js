document.addEventListener('DOMContentLoaded', function() {
    // Make logToPage globally available for auth.js
    window.logToPage = function(message, type = 'info') {
        if (message === undefined) {
            message = "Unknown error occurred (undefined message)";
            type = 'warning';
        } else if (message === '') {
            message = "Empty message received";
            type = 'warning';
        }
        
        const logMessages = document.getElementById('log-messages');
        if (!logMessages) return;
        
        const logEntry = document.createElement('div');
        logEntry.className = `log-entry ${type}`;
        
        const timestamp = new Date().toLocaleTimeString();
        logEntry.textContent = `${timestamp}: ${message}`;
        
        logMessages.prepend(logEntry);
        console.log(`[${type.toUpperCase()}] ${message}`);
    };
    
    // Check if the user is authenticated before initializing the app
    function checkAuthentication() {
        // If GAPI is not loaded yet, wait a bit and try again
        if (typeof gapi === 'undefined' || typeof gapi.auth2 === 'undefined') {
            setTimeout(checkAuthentication, 100);
            return;
        }
        
        try {
            // Try to get auth instance
            const authInstance = gapi.auth2.getAuthInstance();
            
            // If user is signed in, initialize the app
            if (authInstance.isSignedIn.get()) {
                initializeApp();
            }
        } catch (error) {
            console.error('Error checking authentication:', error);
            // Wait and try again if there was an error initializing auth
            setTimeout(checkAuthentication, 500);
        }
    }
    
    // Initialize app only after authentication is confirmed
    function initializeApp() {
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
        
        // Add qrCodeSuccessCallback definition with auth check
        function qrCodeSuccessCallback(decodedText) {
            // First check if user is still authenticated
            if (typeof gapi !== 'undefined' && gapi.auth2) {
                try {
                    const authInstance = gapi.auth2.getAuthInstance();
                    if (!authInstance.isSignedIn.get()) {
                        // If no longer signed in, force page reload to show login screen
                        window.location.reload();
                        return;
                    }
                } catch (error) {
                    console.error('Auth check error:', error);
                }
            }
            
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
                    timestamp: new Date().toISOString()
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
        
        // ... existing lookupAttendee function ...
        
        // ... existing formatting and scan processing functions ...
        
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
        
        // ... existing camera initialization code ...
        
        // Fallback protection to ensure toggle is always re-enabled
        function ensureUIUnlocked() {
            // Check if the toggle is in disabled state and unlock it if needed
            if (modeToggle && modeToggle.disabled) {
                modeToggle.disabled = false;
                document.querySelector('.toggle').classList.remove('disabled');
                logToPage('Toggle re-enabled by safety check', 'info');
            }
        }
        
        // Add auth-specific cleanup on page unload
        window.addEventListener('beforeunload', () => {
            if (html5QrCode && html5QrCode.isScanning) {
                html5QrCode.stop().catch(err => logToPage(`Error stopping camera: ${err.message}`, 'error'));
            }
        });
        
        // Add auth check to visibility change listener
        document.addEventListener('visibilitychange', () => {
            // First check authentication before restarting camera
            if (document.visibilityState === 'visible') {
                // Check if user is still authenticated
                if (typeof gapi !== 'undefined' && gapi.auth2) {
                    try {
                        const authInstance = gapi.auth2.getAuthInstance();
                        if (!authInstance.isSignedIn.get()) {
                            // If no longer signed in, force page reload to show login screen
                            window.location.reload();
                            return;
                        }
                    } catch (error) {
                        console.error('Auth check error on visibility change:', error);
                    }
                }
                
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
    
    // Start the authentication check process
    setTimeout(checkAuthentication, 1000); // Give time for auth.js to initialize
});

// ...existing helper functions like formatDateTime, lockScanner, etc...
