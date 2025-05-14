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
