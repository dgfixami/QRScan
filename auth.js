// Google authentication handling for QR Scanner app

const CLIENT_ID = '681607833593-08kg1qc54mq4vn9vghd5rktuktovv5uu.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile';

// Initialize Google authentication when the auth script loads
function initGoogleAuth() {
    gapi.load('client:auth2', async () => {
        try {
            await gapi.client.init({
                clientId: CLIENT_ID,
                scope: SCOPES,
                plugin_name: "QR Scanner App"
            });
            
            // Get auth instance
            const auth = gapi.auth2.getAuthInstance();
            
            // Update UI based on sign-in state
            updateSigninStatus(auth.isSignedIn.get());
            
            // Listen for sign-in state changes
            auth.isSignedIn.listen(updateSigninStatus);
            
            // Set up sign-in/sign-out buttons
            const signInBtn = document.getElementById('signin-button');
            const signOutBtn = document.getElementById('signout-button');
            
            if (signInBtn) {
                signInBtn.addEventListener('click', signIn);
            }
            
            if (signOutBtn) {
                signOutBtn.addEventListener('click', signOut);
            }
            
            console.log('Google Auth initialized');
        } catch (error) {
            console.error('Error initializing Google Auth:', error);
            showAuthError('Failed to initialize Google authentication: ' + error.message);
        }
    });
}

// Update UI based on sign-in state
function updateSigninStatus(isSignedIn) {
    const authContainer = document.getElementById('auth-container');
    const contentContainer = document.getElementById('content-container');
    const userInfoElement = document.getElementById('user-info');
    
    if (isSignedIn) {
        // User is signed in, show the content
        if (authContainer) authContainer.classList.add('hidden');
        if (contentContainer) contentContainer.classList.remove('hidden');
        
        // Display user info
        const user = gapi.auth2.getAuthInstance().currentUser.get();
        const profile = user.getBasicProfile();
        
        if (userInfoElement && profile) {
            const userName = profile.getName();
            const userEmail = profile.getEmail();
            const userImage = profile.getImageUrl();
            
            let userHtml = `
                <div class="user-profile">
                    ${userImage ? `<img src="${userImage}" alt="Profile" class="profile-image">` : ''}
                    <div class="user-details">
                        <p class="user-name">${userName || 'User'}</p>
                        <p class="user-email">${userEmail || ''}</p>
                    </div>
                </div>
            `;
            
            userInfoElement.innerHTML = userHtml;
        }
        
        // Store auth state in local storage
        localStorage.setItem('qrScannerAppSignedIn', 'true');
        
        // Log the successful sign in
        logAuthActivity('Signed in successfully');
    } else {
        // User is not signed in, show auth screen
        if (authContainer) authContainer.classList.remove('hidden');
        if (contentContainer) contentContainer.classList.add('hidden');
        
        // Clear user info
        if (userInfoElement) {
            userInfoElement.innerHTML = '';
        }
        
        // Remove auth state from local storage
        localStorage.removeItem('qrScannerAppSignedIn');
        
        // Log the sign out
        logAuthActivity('Signed out');
    }
}

// Sign in the user
function signIn() {
    try {
        const authInstance = gapi.auth2.getAuthInstance();
        authInstance.signIn().catch(error => {
            console.error('Sign in error:', error);
            
            // Show different messages based on error type
            if (error.error === 'popup_closed_by_user') {
                showAuthError('Sign-in cancelled. Please try again.');
            } else {
                showAuthError('Sign-in failed: ' + error.error);
            }
        });
    } catch (error) {
        console.error('Error during sign in:', error);
        showAuthError('Error during sign in: ' + error.message);
    }
}

// Sign out the user
function signOut() {
    try {
        const authInstance = gapi.auth2.getAuthInstance();
        authInstance.signOut().catch(error => {
            console.error('Sign out error:', error);
        });
    } catch (error) {
        console.error('Error during sign out:', error);
    }
}

// Check if user is signed in
function isUserSignedIn() {
    try {
        const authInstance = gapi.auth2.getAuthInstance();
        return authInstance.isSignedIn.get();
    } catch (error) {
        console.error('Error checking sign-in status:', error);
        return false;
    }
}

// Show authentication error
function showAuthError(message) {
    const authError = document.getElementById('auth-error');
    if (authError) {
        authError.textContent = message;
        authError.classList.remove('hidden');
        
        // Hide error after 5 seconds
        setTimeout(() => {
            authError.classList.add('hidden');
        }, 5000);
    }
}

// Log authentication activity to app log if available
function logAuthActivity(message) {
    // Check if app's logging function is available
    if (typeof window.logToPage === 'function') {
        window.logToPage(message, 'auth');
    } else {
        console.log('[AUTH] ' + message);
    }
}

// Make functions available globally for HTML elements
window.signIn = signIn;
window.signOut = signOut;

