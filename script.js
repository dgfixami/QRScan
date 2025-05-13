// Global initialization function that will be called by auth.js after successful authentication
function initializeQRScanner(authHeaders) {
    // If not properly authenticated, do not initialize
    if (!window.authHelpers || !window.authHelpers.isAuthenticated()) {
        console.error("Authentication required to access QR scanner functionality");
        return;
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
    
    // Google Apps Script web app URLs
    const scriptUrl = 'https://script.google.com/macros/s/AKfycbxLj2Yh4GAhePBdGhAC53n3KOJF9gNs5BGvlvTsFvYEz6KGjZFjQ7avEJvkRcYz8kSF/exec';
    const attendeeApiUrl = 'https://script.google.com/macros/s/AKfycbwq4-bWqzLPeV7bOaXllswGmjir-U9tmQr7eq6EUUq5-xSpVVgvAfxWtQNEIwMKVSI0/exec';
    
    // Add user's email to log messages for auditing
    const userEmail = window.authHelpers.getUserEmail();
    
    // Log the authenticated user
    logToPage(`Authenticated as: ${userEmail}`, 'info');
    
    // Setup lookup button click handler
    if(lookupButton) {
        lookupButton.addEventListener('click', function() {
            // Check authentication before performing lookup
            if (!window.authHelpers.isAuthenticated()) {
                logToPage('Authentication required. Please log in again.', 'error');
                window.location.reload(); // Force reload if not authenticated
                return;
            }
            lookupAttendee();
        });
    }
    
    // Setup lookup input enter key handler
    if(lookupCode) {
        lookupCode.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                // Check authentication before performing lookup
                if (!window.authHelpers.isAuthenticated()) {
                    logToPage('Authentication required. Please log in again.', 'error');
                    window.location.reload(); // Force reload if not authenticated
                    return;
                }
                lookupAttendee();
            }
        });
    }

    // Modified function to fetch attendee details with authentication
    function fetchAttendeeDetails(code) {
        // Verify authentication before proceeding
        if (!window.authHelpers.isAuthenticated()) {
            logToPage('Authentication required. Please log in again.', 'error');
            window.location.reload();
            return Promise.reject(new Error('Authentication required'));
        }
        
        logToPage(`Fetching attendee details for code: ${code}`, 'info');
        
        // Get current auth headers
        const headers = window.authHelpers.getAuthHeaders();
        const url = `${attendeeApiUrl}?code=${encodeURIComponent(code)}&authToken=${encodeURIComponent(headers['Auth-Token'] || '')}&userEmail=${encodeURIComponent(headers['User-Email'] || '')}`;
        
        return fetch(url)
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
    
    // Modified function to send data to Google Sheets with authentication
    function sendToGoogleSheets(scanData, callback) {
        // Verify authentication before proceeding
        if (!window.authHelpers.isAuthenticated()) {
            logToPage('Authentication required. Please log in again.', 'error');
            window.location.reload();
            return;
        }
        
        // Show sending status
        logToPage('Sending data to Google Sheets...', 'info');
        
        // Get current auth headers and add to scan data
        const headers = window.authHelpers.getAuthHeaders();
        const dataWithAuth = {
            ...scanData,
            authToken: headers['Auth-Token'] || '',
            userEmail: headers['User-Email'] || ''
        };
        
        fetch(scriptUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(dataWithAuth),
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
    
    // Modified function to fetch attendee data with authentication
    function fetchAttendeeData(code) {
        // Verify authentication before proceeding
        if (!window.authHelpers.isAuthenticated()) {
            logToPage('Authentication required. Please log in again.', 'error');
            window.location.reload();
            return;
        }
        
        // Show that we're loading
        lookupResult.innerHTML = '<div class="loading">Loading...</div>';
        lookupResult.classList.remove('hidden');
        
        // Get current auth headers
        const headers = window.authHelpers.getAuthHeaders();
        const url = `${scriptUrl}?code=${encodeURIComponent(code)}&authToken=${encodeURIComponent(headers['Auth-Token'] || '')}&userEmail=${encodeURIComponent(headers['User-Email'] || '')}`;
        
        // First get check-in/goodie bag status from first API
        fetch(url)
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

    // Modified function to fetch and display attendee data for scan with authentication
    function fetchAttendeeDataForScan(code, scanData) {
        // Verify authentication before proceeding
        if (!window.authHelpers.isAuthenticated()) {
            logToPage('Authentication required. Please log in again.', 'error');
            window.location.reload();
            return;
        }
        
        // Show loading state
        scanName.textContent = "Loading...";
        scanCompany.textContent = "Loading...";
        scanTimestamp.textContent = "Loading...";
        
        // Reset and hide both status elements during loading
        checkinStatus.classList.add('hidden');
        goodiebagStatus.classList.add('hidden');
        
        // Get current auth headers
        const headers = window.authHelpers.getAuthHeaders();
        const url = `${scriptUrl}?code=${encodeURIComponent(code)}&authToken=${encodeURIComponent(headers['Auth-Token'] || '')}&userEmail=${encodeURIComponent(headers['User-Email'] || '')}`;
        
        // First get check-in/goodie bag status from first API
        fetch(url)
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
                    if (scanData) {
                        sendToGoogleSheets(scanData, () => {
                            // Unlock scanner after operation, even on partial failure
                            unlockScanner();
                        });
                    } else {
                        unlockScanner();
                    }
                    
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
                if (scanData) {
                    sendToGoogleSheets(scanData, () => {
                        unlockScanner();
                    });
                } else {
                    unlockScanner();
                }
                
                logToPage(`Error fetching attendee data: ${error.message}`, 'error');
            });
    }
    
    // Rest of your existing functions (formatDateTime, lockScanner, unlockScanner, etc.)
    // ...existing code...
    
    // Initialize camera with small delay
    setTimeout(() => {
        // Check authentication again before initializing cameras
        if (window.authHelpers.isAuthenticated()) {
            initializeCameras();
        } else {
            logToPage('Authentication required. Please log in again.', 'error');
            window.location.reload();
        }
    }, 500);
    
    // ...existing code...
}

// Set up event listener for DOM ready
document.addEventListener('DOMContentLoaded', function() {
    // Do not initialize scanner here - auth.js will call initializeQRScanner when authenticated
    console.log("DOM Content loaded - waiting for authentication");
});
