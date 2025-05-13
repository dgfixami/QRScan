document.addEventListener('DOMContentLoaded', function() {
    // Add authentication variables
    let currentUser = null;
    const organizationDomain = 'fixami.com'; // Replace with your actual domain
    
    // Google OAuth client ID (get this from Google Cloud Console)
    const CLIENT_ID = '681607833593-08kg1qc54mq4vn9vghd5rktuktovv5uu.apps.googleusercontent.com'; // You'll need to add your actual client ID here
    
    // Elements for authentication
    const authContainer = document.getElementById('auth-container');
    const userInfoElement = document.getElementById('user-info');
    const userNameElement = document.getElementById('user-name');
    const userImageElement = document.getElementById('user-image');
    const signOutButton = document.getElementById('signout-button');
    const appContent = document.getElementById('app-content');
    
    // Add sign-out functionality
    if (signOutButton) {
        signOutButton.addEventListener('click', signOut);
    }
    
    // Existing elements
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
    
    // Initialize Google Sign-In
    function initializeGoogleAuth() {
        // Load the Google Identity Services SDK
        google.accounts.id.initialize({
            client_id: CLIENT_ID,
            callback: handleCredentialResponse,
            auto_select: false,
            cancel_on_tap_outside: true
        });
        
        // Display the Sign In With Google button
        google.accounts.id.renderButton(
            document.getElementById('signin-button'),
            { 
                theme: 'outline', 
                size: 'large',
                width: 280,
                text: 'signin_with',
                logo_alignment: 'center'
            }
        );
        
        // Also display the One Tap UI if not on mobile
        if (!isMobileDevice()) {
            google.accounts.id.prompt();
        }
    }
    
    // Handle the Sign-In response
    function handleCredentialResponse(response) {
        if (!response.credential) {
            logToPage('Sign-in failed - no credential received', 'error');
            return;
        }
        
        // Decode the JWT token from Google
        const decodedToken = parseJwt(response.credential);
        
        // Check if user has organization domain email
        const userEmail = decodedToken.email;
        const isOrgUser = userEmail.endsWith('@' + organizationDomain);
        
        if (!isOrgUser) {
            logToPage(`Sign-in failed - must use ${organizationDomain} email address`, 'error');
            // Show a more visible error
            showAuthError(`Please use your ${organizationDomain} email address to access this application.`);
            signOut();
            return;
        }
        
        // Store user information
        currentUser = {
            id: decodedToken.sub,
            name: decodedToken.name,
            email: decodedToken.email,
            picture: decodedToken.picture,
            token: response.credential
        };
        
        // Update UI to show signed-in state
        userNameElement.textContent = currentUser.name;
        userImageElement.src = currentUser.picture;
        userInfoElement.classList.remove('hidden');
        document.getElementById('signin-button').classList.add('hidden');
        
        // Show main app content now that user is authenticated
        appContent.classList.remove('hidden');
        
        logToPage(`Signed in as ${currentUser.name} (${currentUser.email})`, 'success');
        
        // Initialize camera after authentication
        setTimeout(() => {
            initializeCameras();
        }, 500);
    }
    
    // Helper function to parse JWT token
    function parseJwt(token) {
        try {
            const base64Url = token.split('.')[1];
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
                return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
            }).join(''));
            return JSON.parse(jsonPayload);
        } catch (error) {
            logToPage('Error parsing authentication token', 'error');
            return {};
        }
    }
    
    // Sign out function
    function signOut() {
        currentUser = null;
        userNameElement.textContent = '';
        userImageElement.src = '';
        userInfoElement.classList.add('hidden');
        document.getElementById('signin-button').classList.remove('hidden');
        appContent.classList.add('hidden');
        
        // If there's an active QR scanner, stop it
        if (html5QrCode && html5QrCode.isScanning) {
            html5QrCode.stop().catch(err => {
                console.error("Error stopping scanner during sign-out:", err);
            });
        }
        
        logToPage('Signed out', 'info');
        
        // Re-initialize the sign-in button
        google.accounts.id.renderButton(
            document.getElementById('signin-button'),
            { 
                theme: 'outline', 
                size: 'large',
                width: 280,
                text: 'signin_with',
                logo_alignment: 'center'
            }
        );
    }
    
    // Helper to check if user is on mobile device
    function isMobileDevice() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }
    
    // Show authentication error to the user
    function showAuthError(message) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'auth-error';
        errorDiv.innerHTML = `<p>⚠️ ${message}</p>`;
        authContainer.appendChild(errorDiv);
        
        // Remove after 10 seconds
        setTimeout(() => {
            if (errorDiv.parentNode === authContainer) {
                authContainer.removeChild(errorDiv);
            }
        }, 10000);
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
    
    // Modified function to send data to Google Sheets with user information
    function sendToGoogleSheets(scanData, callback) {
        // Check if user is authenticated
        if (!currentUser) {
            logToPage('Authentication required - please sign in', 'error');
            if (typeof callback === 'function') {
                callback(false);
            } else {
                unlockScanner();
            }
            return;
        }
        
        // Show sending status
        logToPage('Sending data to Google Sheets...', 'info');
        
        // Add user information to the data
        const dataWithUser = {
            ...scanData,
            user: {
                name: currentUser.name,
                email: currentUser.email
            }
        };
        
        fetch(scriptUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentUser.token}` // Send token for auth
            },
            body: JSON.stringify(dataWithUser)
        })
        .then(response => {
            if (!response.ok) {
                if (response.status === 401 || response.status === 403) {
                    throw new Error("Authentication failed. Please sign in again.");
                }
                throw new Error(`Server error: ${response.status}`);
            }
            return response.text();
        })
        .then(text => {
            let data;
            try {
                // Try to parse the response as JSON
                data = JSON.parse(text);
            } catch (e) {
                // If not JSON, just use the text
                data = { success: true, message: text };
            }
            
            logToPage(`Data sent to Google Sheets. ${scanData.mode} status updated.`, 'success');
            
            // Execute callback if provided
            if (typeof callback === 'function') {
                callback(true);
            } else {
                // Ensure unlock happens even if callback is not provided
                unlockScanner();
            }
        })
        .catch(error => {
            logToPage(`Error sending to Google Sheets: ${error.message}`, 'error');
            
            // Check if this was an auth error
            if (error.message.includes('Authentication failed')) {
                signOut(); // Force sign out on auth errors
                showAuthError('Your session has expired. Please sign in again.');
            } else {
                // Keep error alert to notify user of other failures
                alert(`⚠️ Error processing ${scanData.mode} for code: ${scanData.code}`);
            }
            
            // Unlock the scanner even on error
            if (typeof callback === 'function') {
                callback(false);
            } else {
                unlockScanner();
            }
        });
    }
    
    // Modified function to fetch attendee details with authentication
    function fetchAttendeeDetails(code) {
        logToPage(`Fetching attendee details for code: ${code}`, 'info');
        
        // Check if user is authenticated
        if (!currentUser) {
            return Promise.reject(new Error('Authentication required - please sign in'));
        }
        
        return fetch(`${attendeeApiUrl}?code=${encodeURIComponent(code)}`, {
            headers: {
                'Authorization': `Bearer ${currentUser.token}` // Send token for auth
            }
        })
        .then(response => {
            if (!response.ok) {
                if (response.status === 401 || response.status === 403) {
                    signOut();
                    throw new Error("Authentication failed. Please sign in again.");
                }
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
    
    // Update function to fetch attendee data with authentication
    function fetchAttendeeData(code) {
        // Show that we're loading
        lookupResult.innerHTML = '<div class="loading">Loading...</div>';
        lookupResult.classList.remove('hidden');
        
        // Check if user is authenticated
        if (!currentUser) {
            showLookupError('Authentication required - please sign in');
            logToPage('Authentication required - please sign in', 'error');
            return;
        }
        
        // First get check-in/goodie bag status from first API
        fetch(`${scriptUrl}?code=${encodeURIComponent(code)}`, {
            headers: {
                'Authorization': `Bearer ${currentUser.token}` // Send token for auth
            }
        })
        .then(response => {
            if (!response.ok) {
                if (response.status === 401 || response.status === 403) {
                    signOut();
                    throw new Error("Authentication failed. Please sign in again.");
                }
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            return response.json();
        })
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
            // Check if this was an auth error
            if (error.message.includes('Authentication failed')) {
                showAuthError('Your session has expired. Please sign in again.');
            } else {
                showLookupError('Error connecting to database');
            }
            logToPage(`Lookup error: ${error.message}`, 'error');
        });
    }
    
    // Update the fetchAttendeeDataForScan function with authentication
    function fetchAttendeeDataForScan(code, scanData) {
        // Check if user is authenticated
        if (!currentUser) {
            resetScanResultFields();
            logToPage('Authentication required - please sign in', 'error');
            unlockScanner();
            return;
        }
        
        // Show loading state
        scanName.textContent = "Loading...";
        scanCompany.textContent = "Loading...";
        scanTimestamp.textContent = "Loading...";
        
        // Reset and hide both status elements during loading
        checkinStatus.classList.add('hidden');
        goodiebagStatus.classList.add('hidden');
        
        // First get check-in/goodie bag status from first API with auth
        fetch(`${scriptUrl}?code=${encodeURIComponent(code)}`, {
            headers: {
                'Authorization': `Bearer ${currentUser.token}` // Send token for auth
            }
        })
        .then(response => {
            if (!response.ok) {
                if (response.status === 401 || response.status === 403) {
                    signOut();
                    throw new Error("Authentication failed. Please sign in again.");
                }
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            return response.json();
        })
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
            // Check if this was an auth error
            if (error.message.includes('Authentication failed')) {
                showAuthError('Your session has expired. Please sign in again.');
            }
            
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
    
    // Initialize the app - now we start with authentication instead of camera
    initializeGoogleAuth();
    
    // Initial log message
    logToPage('QR Scanner ready - please sign in to continue', 'info');
});
