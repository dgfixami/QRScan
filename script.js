document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded in script.js...');
    
    // Debug and setup event listeners
    try {
        // Listen for authentication event
        document.addEventListener('userAuthenticated', function(event) {
            console.log('Received userAuthenticated event with profile:', event.detail);
            try {
                // Make sure app container is visible immediately before initializing
                const appContainer = document.getElementById('app-container');
                if (appContainer) {
                    console.log('Setting app container to visible...');
                    appContainer.style.display = 'block';
                    appContainer.removeAttribute('data-auth-required');
                    appContainer.classList.add('authenticated');
                }
                
                // Initialize after ensuring container is visible
                initializeQrScanner(event.detail); // Pass the user profile to initialize
            } catch (err) {
                console.error('Error during QR scanner initialization:', err);
                alert('Failed to initialize scanner. Please reload the page and try again.');
            }
        });
        
        // Listen for sign-out event to clean up resources
        document.addEventListener('userSignOut', function() {
            console.log('Received userSignOut event, cleaning up resources...');
            cleanupResources();
        });
        
        // Check if already authenticated (for page refreshes)
        if (typeof userProfile !== 'undefined' && userProfile !== null) {
            console.log('User already authenticated, initializing QR scanner...');
            // Ensure container is visible
            const appContainer = document.getElementById('app-container');
            if (appContainer) {
                console.log('Setting app container to visible...');
                appContainer.style.display = 'block';
                appContainer.removeAttribute('data-auth-required');
                appContainer.classList.add('authenticated');
            }
            
            // Initialize after ensuring container is visible
            initializeQrScanner(userProfile);
        } else {
            console.log('Waiting for user authentication...');
        }
    } catch (err) {
        console.error('Error during script initialization:', err);
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
    
    try {
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
        
        // Verify reader exists
        if (!reader) {
            console.error("Reader element not found!");
            return;
        }
        
        // Check if reader is actually visible
        const readerRect = reader.getBoundingClientRect();
        console.log('Reader dimensions:', readerRect.width, 'x', readerRect.height);
        if (readerRect.width === 0 || readerRect.height === 0) {
            console.warn('Reader has zero dimensions! Check CSS and visibility.');
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
        
        // Start camera initialization with a slight delay to ensure DOM is ready
        setTimeout(() => {
            console.log('Starting camera initialization...');
            initializeCameras();
        }, 800);
        
        logToPage('QR Scanner initialized and ready', 'info');
    } catch (err) {
        console.error('Error in QR scanner initialization:', err);
        alert('There was an error initializing the QR scanner. Please reload the page.');
    }
}

// ...rest of existing code...
