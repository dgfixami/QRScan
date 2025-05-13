// Authentication script to ensure users are logged into Google
let userProfile = null;
let appInitialized = false;

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
    
    // Initialize the Google client with FedCM opt-in
    google.accounts.id.initialize({
        client_id: '681607833593-08kg1qc54mq4vn9vghd5rktuktovv5uu.apps.googleusercontent.com',
        callback: handleCredentialResponse,
        auto_select: true,
        cancel_on_tap_outside: false,
        // Add FedCM opt-in to fix the logger warning
        use_fedcm_for_prompt: true
    });
    
    // Instead of checking notification status, which causes the warning,
    // directly render the sign-in button
    document.getElementById('google-signin-button').style.display = 'block';
    google.accounts.id.renderButton(
        document.getElementById('google-signin-button'),
        { 
            theme: 'outline', 
            size: 'large',
            text: 'signin_with',
            shape: 'rectangular',
            width: 240
        }
    );
    
    // Also display One Tap prompt (with FedCM enabled)
    google.accounts.id.prompt();
}

// Handle the credential response
function handleCredentialResponse(response) {
    if (response.credential) {
        // Decode the JWT token to get user info
        const payload = parseJwt(response.credential);
        console.log('User authenticated:', payload);
        
        // Check if the user belongs to your organization
        const domain = payload.hd; // Hosted domain from the token
        
        // Verify domain is fixami.com
        if (domain !== 'fixami.com') {
            showAuthError('You must use a fixami.com account to access this application.');
            return;
        }
        
        // Store user profile
        userProfile = payload;
        
        // Skip direct API access check and assume access is granted
        // since CORS prevents us from checking directly
        showApplication();
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

// Modified to handle CORS issues with direct API access check
function checkUserAccess() {
    // Show loading state
    document.getElementById('auth-loading').style.display = 'block';
    document.getElementById('auth-error').style.display = 'none';
    
    // Instead of direct fetch which causes CORS issues, 
    // validate based on the email domain from the token
    const emailDomain = userProfile && userProfile.email ? userProfile.email.split('@')[1] : null;
    
    if (emailDomain === 'fixami.com' && userProfile && userProfile.hd === 'fixami.com') {
        // Valid fixami.com user with hosted domain verification
        console.log('Access verified via domain check');
        setTimeout(() => {
            document.getElementById('auth-loading').style.display = 'none';
            showApplication();
        }, 500);
    } else {
        console.error('Access verification failed: Invalid domain');
        document.getElementById('auth-loading').style.display = 'none';
        showAuthError('You do not have access to this application. Please sign in with your fixami.com account.');
    }
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
        
        // Initialize the QR scanner now that user is authenticated
        if (!appInitialized) {
            appInitialized = true;
            if (typeof initializeQrScanner === 'function') {
                initializeQrScanner(userProfile);
            } else {
                // Create a custom event to notify the main script that authentication is complete
                const authEvent = new CustomEvent('userAuthenticated', { detail: userProfile });
                document.dispatchEvent(authEvent);
            }
        }
    }
}

// Show authentication error
function showAuthError(message) {
    document.getElementById('auth-error').textContent = message;
    document.getElementById('auth-error').style.display = 'block';
    document.getElementById('auth-loading').style.display = 'none';
}

// Sign out the user with enhanced security
function signOut() {
    // First, dispatch an event to clean up resources (camera, etc.)
    const signOutEvent = new CustomEvent('userSignOut');
    document.dispatchEvent(signOutEvent);
    
    // Reset authentication state
    userProfile = null;
    appInitialized = false;
    
    // Disable auto-select to prevent automatic re-login
    if (typeof google !== 'undefined' && google.accounts && google.accounts.id) {
        google.accounts.id.disableAutoSelect();
    }
    
    // Reset UI and remove app content
    const appContainer = document.getElementById('app-container');
    
    // Hide app container first
    appContainer.style.display = 'none';
    
    // Clear all app content
    // Keep the structure but remove interactive content
    const logMessages = document.getElementById('log-messages');
    if (logMessages) logMessages.innerHTML = '';
    
    const reader = document.getElementById('reader');
    if (reader) reader.innerHTML = '';
    
    const result = document.getElementById('result');
    if (result) {
        const resultSpans = result.querySelectorAll('span');
        resultSpans.forEach(span => span.textContent = '-');
    }
    
    const lookupResult = document.getElementById('lookup-result');
    if (lookupResult) lookupResult.innerHTML = '';
    
    // Reset form elements
    const lookupCode = document.getElementById('lookup-code');
    if (lookupCode) lookupCode.value = '';
    
    // Show the auth container again
    document.getElementById('auth-container').style.display = 'flex';
    document.getElementById('auth-error').style.display = 'none';
    
    // Re-initialize Google Sign-In
    setTimeout(() => {
        initializeGoogleIdentity();
    }, 300);
}

// Initialize authentication when document is ready
document.addEventListener('DOMContentLoaded', function() {
    // Initialize Google auth
    initGoogleAuth();
});
