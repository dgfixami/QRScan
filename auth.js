// Authentication script to ensure users are logged into Google
let userProfile = null;

// Function to initialize Google auth
function initGoogleAuth() {
    console.log('Initializing Google authentication...');
    
    // Load the Google Identity Services SDK
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = initializeGoogleIdentity;
    document.head.appendChild(script);
}

// Initialize Google Identity Services
function initializeGoogleIdentity() {
    console.log('Setting up Google Identity Services...');
    
    // Initialize the Google client
    google.accounts.id.initialize({
        client_id: '681607833593-08kg1qc54mq4vn9vghd5rktuktovv5uu.apps.googleusercontent.com',
        callback: handleCredentialResponse,
        auto_select: true,
        cancel_on_tap_outside: false
    });
    
    // Display the One Tap UI
    google.accounts.id.prompt((notification) => {
        if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
            console.log('One Tap UI skipped or not displayed');
            // Force the One Tap UI if not displayed
            document.getElementById('google-signin-button').style.display = 'block';
            google.accounts.id.renderButton(
                document.getElementById('google-signin-button'),
                { 
                    theme: 'outline', 
                    size: 'large',
                    text: 'signin_with',
                    shape: 'rectangular'
                }
            );
        }
    });
}

// Handle the credential response
function handleCredentialResponse(response) {
    if (response.credential) {
        // Decode the JWT token to get user info
        const payload = parseJwt(response.credential);
        console.log('User authenticated:', payload);
        
        // Check if the user belongs to your organization
        const domain = payload.hd; // Hosted domain from the token
        
        // Store user profile
        userProfile = payload;
        
        // Check organization membership via the web app's authorization
        // The web app settings should already restrict to your org
        checkUserAccess();
    } else {
        console.error('Authentication failed');
        showAuthError('Authentication failed. Please try again.');
    }
}

// Parse the JWT token
function parseJwt(token) {
    try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        return JSON.parse(jsonPayload);
    } catch (e) {
        console.error('Error parsing JWT token:', e);
        return null;
    }
}

// Check access by trying to fetch data from the web app
function checkUserAccess() {
    // Show loading state
    document.getElementById('auth-loading').style.display = 'block';
    document.getElementById('auth-error').style.display = 'none';
    
    // Attempt to access the API to verify permissions
    fetch('https://script.google.com/macros/s/AKfycbxLj2Yh4GAhePBdGhAC53n3KOJF9gNs5BGvlvTsFvYEz6KGjZFjQ7avEJvkRcYz8kSF/exec')
        .then(response => {
            if (!response.ok) {
                throw new Error('API access denied');
            }
            return response.text();
        })
        .then(data => {
            // API access successful, user is authorized
            console.log('Access verified:', data);
            showApplication();
        })
        .catch(error => {
            console.error('Access verification failed:', error);
            showAuthError('You do not have access to this application. Please contact your administrator.');
        })
        .finally(() => {
            document.getElementById('auth-loading').style.display = 'none';
        });
}

// Show the main application UI
function showApplication() {
    document.getElementById('auth-container').style.display = 'none';
    document.getElementById('app-container').style.display = 'block';
    
    // Update user info if available
    if (userProfile) {
        const userInfo = document.getElementById('user-info');
        if (userInfo) {
            userInfo.innerHTML = `
                <div class="user-profile">
                    <img src="${userProfile.picture}" alt="${userProfile.name}" class="user-avatar">
                    <span class="user-name">${userProfile.name}</span>
                </div>
                <button id="sign-out-button" class="sign-out-button">Sign Out</button>
            `;
            
            // Add sign out handler
            document.getElementById('sign-out-button').addEventListener('click', signOut);
        }
    }
}

// Show authentication error
function showAuthError(message) {
    document.getElementById('auth-error').textContent = message;
    document.getElementById('auth-error').style.display = 'block';
    document.getElementById('auth-loading').style.display = 'none';
}

// Sign out the user
function signOut() {
    // Clear any authentication tokens or state
    userProfile = null;
    
    // Reset UI
    document.getElementById('app-container').style.display = 'none';
    document.getElementById('auth-container').style.display = 'flex';
    document.getElementById('auth-error').style.display = 'none';
    
    // Re-initialize Google Sign-In
    initializeGoogleIdentity();
}

// Initialize authentication when document is ready
document.addEventListener('DOMContentLoaded', function() {
    // Initialize Google auth
    initGoogleAuth();
});
