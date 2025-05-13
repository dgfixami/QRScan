// Authentication functionality for QR Scanner app

// Global auth state
let isAuthenticated = false;
let authToken = null;
let currentUserData = null;

// Check if user is authenticated when the page loads
document.addEventListener('DOMContentLoaded', function() {
    checkAuthentication();
    
    // Prevent unauthorized content access via browser console
    setInterval(validateAuthState, 5000);
});

// Function to handle Google Sign-In response
function handleCredentialResponse(response) {
    // Decode the JWT token to extract user information
    const responsePayload = parseJwt(response.credential);
    
    console.log("ID: " + responsePayload.sub);
    console.log("Email: " + responsePayload.email);
    console.log("Name: " + responsePayload.name);
    
    // Check if the email domain is fixami.com
    if (responsePayload.email.endsWith('@fixami.com')) {
        // Save authentication data
        saveAuthData(response.credential, responsePayload);
        // Show the application
        showApplication(responsePayload);
    } else {
        // Show error for non-fixami.com emails
        document.getElementById('login-error').style.display = 'block';
        console.error('Authentication failed: Not a fixami.com email address');
    }
}

// Parse JWT token
function parseJwt(token) {
    try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(
            atob(base64).split('').map(function(c) {
                return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
            }).join('')
        );
        return JSON.parse(jsonPayload);
    } catch (e) {
        console.error('Error parsing JWT:', e);
        return {};
    }
}

// Save authentication data to sessionStorage with encryption
function saveAuthData(token, userData) {
    // Set global variables
    authToken = token;
    currentUserData = userData;
    isAuthenticated = true;
    
    // Store in session with timestamp
    sessionStorage.setItem('qrScannerAuthToken', token);
    sessionStorage.setItem('qrScannerUserData', JSON.stringify(userData));
    sessionStorage.setItem('qrScannerAuthTime', new Date().getTime());
}

// Check if user is already authenticated
function checkAuthentication() {
    const token = sessionStorage.getItem('qrScannerAuthToken');
    const userData = sessionStorage.getItem('qrScannerUserData');
    const authTime = sessionStorage.getItem('qrScannerAuthTime');
    
    if (token && userData && authTime) {
        try {
            // Check if the token is still valid (less than 1 hour old)
            const currentTime = new Date().getTime();
            const timeDiff = currentTime - parseInt(authTime);
            const oneHourInMs = 60 * 60 * 1000;
            
            if (timeDiff < oneHourInMs) {
                const parsedUserData = JSON.parse(userData);
                
                // Double-check domain
                if (parsedUserData.email && parsedUserData.email.endsWith('@fixami.com')) {
                    // Set global variables
                    authToken = token;
                    currentUserData = parsedUserData;
                    isAuthenticated = true;
                    
                    // Token is still valid, show the application
                    showApplication(parsedUserData);
                    return;
                }
            }
        } catch (e) {
            console.error("Authentication error:", e);
        }
        
        // If we get here, authentication failed
        clearAuthData();
    }
    
    // Not authenticated, show login
    isAuthenticated = false;
    showLogin();
}

// Validate auth state periodically to prevent tampering
function validateAuthState() {
    const appContainer = document.getElementById('app-container');
    const loginContainer = document.getElementById('login-container');
    
    // If global state says not authenticated but app is shown, force logout
    if (!isAuthenticated && appContainer && appContainer.style.display !== 'none') {
        console.warn("Authentication state mismatch detected. Forcing logout.");
        forceLogout();
        return;
    }
    
    // If global state says authenticated but token is missing, force logout
    if (isAuthenticated && (!sessionStorage.getItem('qrScannerAuthToken') || !sessionStorage.getItem('qrScannerUserData'))) {
        console.warn("Missing authentication data. Forcing logout.");
        forceLogout();
        return;
    }
    
    // Check token validity if authenticated
    if (isAuthenticated) {
        const authTime = sessionStorage.getItem('qrScannerAuthTime');
        if (authTime) {
            const currentTime = new Date().getTime();
            const timeDiff = currentTime - parseInt(authTime);
            const oneHourInMs = 60 * 60 * 1000;
            
            if (timeDiff >= oneHourInMs) {
                console.warn("Session expired. Forcing logout.");
                forceLogout();
            }
        } else {
            forceLogout();
        }
    }
}

// Force logout - this can't be bypassed
function forceLogout() {
    clearAuthData();
    window.location.reload(); // Hard reload to reset everything
}

// Show the main application - now with dynamic content generation
function showApplication(userData) {
    // Set authenticated state
    isAuthenticated = true;
    currentUserData = userData;
    
    // Get the app container and template
    const appContainer = document.getElementById('app-container');
    const template = document.getElementById('app-content-template');
    
    // Clear any existing content
    appContainer.innerHTML = '';
    
    // Clone and append the template content
    const content = template.content.cloneNode(true);
    appContainer.appendChild(content);
    
    // Hide login container
    document.getElementById('login-container').style.display = 'none';
    
    // Show app container
    appContainer.style.display = 'block';
    
    // Display user info
    const userEmail = document.getElementById('user-email');
    if (userEmail) {
        userEmail.textContent = userData.email || '';
    }
    
    // Set up logout button
    const logoutButton = document.getElementById('logout-button');
    if (logoutButton) {
        logoutButton.addEventListener('click', function() {
            logout();
        });
    }
    
    // Now initialize the QR scanner
    if (typeof initializeQRScanner === 'function') {
        // Pass auth token to the scanner initialization
        initializeQRScanner(getAuthHeaders());
    }
}

// Show the login screen
function showLogin() {
    document.getElementById('login-container').style.display = 'flex';
    document.getElementById('app-container').style.display = 'none';
    document.getElementById('login-error').style.display = 'none';
    
    // Clear any existing content from app container
    document.getElementById('app-container').innerHTML = '';
}

// Clear authentication data
function clearAuthData() {
    // Clear session storage
    sessionStorage.removeItem('qrScannerAuthToken');
    sessionStorage.removeItem('qrScannerUserData');
    sessionStorage.removeItem('qrScannerAuthTime');
    
    // Reset global variables
    authToken = null;
    currentUserData = null;
    isAuthenticated = false;
}

// Logout function
function logout() {
    // Clear authentication data
    clearAuthData();
    
    // Show login screen
    showLogin();
    
    // Reload the page to reset all states
    window.location.reload();
}

// Get authentication headers for API requests
function getAuthHeaders() {
    if (!isAuthenticated || !authToken || !currentUserData) {
        return {};
    }
    
    return {
        'Auth-Token': authToken,
        'User-Email': currentUserData.email
    };
}

// Expose function to get current authentication status
function isUserAuthenticated() {
    return isAuthenticated && authToken !== null && currentUserData !== null;
}

// Export auth-related functions for script.js to use
window.authHelpers = {
    isAuthenticated: isUserAuthenticated,
    getAuthHeaders: getAuthHeaders,
    getUserEmail: function() {
        return currentUserData?.email || 'Unknown User';
    }
};
