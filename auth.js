// Authentication functionality for QR Scanner app

// Check if user is authenticated when the page loads
document.addEventListener('DOMContentLoaded', function() {
    checkAuthentication();
});

// Function to handle Google Sign-In response
function handleCredentialResponse(response) {
    try {
        console.log("Google Sign-In response received");
        
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
    } catch (error) {
        console.error('Error in handleCredentialResponse:', error);
        document.getElementById('login-error').textContent = 'Authentication error: ' + error.message;
        document.getElementById('login-error').style.display = 'block';
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

// Save authentication data to sessionStorage
function saveAuthData(token, userData) {
    sessionStorage.setItem('qrScannerAuthToken', token);
    sessionStorage.setItem('qrScannerUserData', JSON.stringify(userData));
    sessionStorage.setItem('qrScannerAuthTime', new Date().getTime());
    
    // Dispatch an event that authentication was successful
    document.dispatchEvent(new CustomEvent('authSuccess', {
        detail: { userData: userData }
    }));
}

// Check if user is already authenticated
function checkAuthentication() {
    console.log("Checking authentication...");
    
    const token = sessionStorage.getItem('qrScannerAuthToken');
    const userData = sessionStorage.getItem('qrScannerUserData');
    const authTime = sessionStorage.getItem('qrScannerAuthTime');
    
    if (token && userData && authTime) {
        // Check if the token is still valid (less than 1 hour old)
        const currentTime = new Date().getTime();
        const timeDiff = currentTime - parseInt(authTime);
        const oneHourInMs = 60 * 60 * 1000;
        
        if (timeDiff < oneHourInMs) {
            console.log("Valid token found, showing application");
            // Token is still valid, show the application
            showApplication(JSON.parse(userData));
            return;
        } else {
            console.log("Token expired, clearing session");
            // Token expired, clear session
            clearAuthData();
        }
    } else {
        console.log("No authentication data found");
    }
    
    // Not authenticated, show login
    showLogin();
}

// Show the main application 
function showApplication(userData) {
    console.log('Showing application UI...');
    
    // Force the correct display states
    document.getElementById('login-container').style.display = 'none';
    document.getElementById('app-container').style.display = 'block';
    
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
    
    console.log('Application UI should be visible now');
    
    // Trigger camera initialization after showing the application UI
    // Wait a short delay to ensure DOM is fully rendered
    setTimeout(() => {
        // Dispatch a custom event to signal that the app is ready for camera initialization
        document.dispatchEvent(new CustomEvent('appReady'));
        console.log('App ready event dispatched for camera initialization');
    }, 500);
}

// Show the login screen
function showLogin() {
    document.getElementById('login-container').style.display = 'flex';
    document.getElementById('app-container').style.display = 'none';
    document.getElementById('login-error').style.display = 'none';
}

// Clear authentication data
function clearAuthData() {
    sessionStorage.removeItem('qrScannerAuthToken');
    sessionStorage.removeItem('qrScannerUserData');
    sessionStorage.removeItem('qrScannerAuthTime');
}

// Logout function
function logout() {
    // Clear authentication data







}    // Reload the page to reset all states        showLogin();    // Show login screen        clearAuthData();    window.location.reload();

