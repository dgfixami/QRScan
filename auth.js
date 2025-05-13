// Google Authentication Handler

// Authentication state
let userAuthenticated = false;
let userProfile = null;

// Elements
let loginContainer;
let appContainer;
let userName;
let signOutButton;

// Error display for auth errors
function showAuthError(message) {
    // Remove any existing error messages
    const existingError = document.querySelector('.auth-error');
    if (existingError) {
        existingError.remove();
    }

    // Create and show new error
    const errorDiv = document.createElement('div');
    errorDiv.className = 'auth-error';
    errorDiv.textContent = message;
    
    const authCard = document.querySelector('.auth-card');
    if (authCard) {
        authCard.appendChild(errorDiv);
    }
}

// Check if logged in on page load
document.addEventListener('DOMContentLoaded', function() {
    loginContainer = document.getElementById('login-container');
    appContainer = document.getElementById('app-container');
    userName = document.getElementById('user-name');
    signOutButton = document.getElementById('sign-out');
    
    // Check for stored authentication
    const storedToken = localStorage.getItem('gauth_token');
    const storedUser = localStorage.getItem('gauth_user');
    
    if (storedToken && storedUser) {
        try {
            userProfile = JSON.parse(storedUser);
            // Validate token by checking if it's within expiration time
            const tokenData = parseJwt(storedToken);
            const currentTime = Math.floor(Date.now() / 1000);
            
            if (tokenData && tokenData.exp && tokenData.exp > currentTime) {
                // Token still valid
                userAuthenticated = true;
                showApp();
                return;
            } else {
                // Token expired
                localStorage.removeItem('gauth_token');
                localStorage.removeItem('gauth_user');
            }
        } catch (e) {
            console.error("Error parsing stored authentication:", e);
            localStorage.removeItem('gauth_token');
            localStorage.removeItem('gauth_user');
        }
    }
    
    // If we get here, show the login screen
    showLogin();
    
    // Setup sign out button
    if (signOutButton) {
        signOutButton.addEventListener('click', function() {
            signOut();
        });
    }
});

// Handle credential response from Google Sign-In
function handleCredentialResponse(response) {
    // Decode the credential to get basic profile info
    if (response && response.credential) {
        const token = response.credential;
        localStorage.setItem('gauth_token', token);
        
        // Parse token to get user data
        const decodedToken = parseJwt(token);
        
        if (!decodedToken || !decodedToken.email) {
            showAuthError("Could not retrieve user information from login.");
            return;
        }
        
        // Check for organization domain
        if (decodedToken.hd === undefined) {
            showAuthError("You must use an organizational account to login.");
            signOut();
            return;
        }
        
        // Create user profile object
        userProfile = {
            name: decodedToken.name || 'User',
            email: decodedToken.email,
            picture: decodedToken.picture,
            domain: decodedToken.hd
        };
        
        // Store user data
        localStorage.setItem('gauth_user', JSON.stringify(userProfile));
        
        // Set authentication state
        userAuthenticated = true;
        
        // Show the app
        showApp();
    }
}

// Parse JWT token
function parseJwt(token) {
    try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        
        return JSON.parse(jsonPayload);
    } catch (e) {
        console.error("Error parsing JWT token:", e);
        return null;
    }
}

// Sign out function
function signOut() {
    // Clear stored authentication
    localStorage.removeItem('gauth_token');
    localStorage.removeItem('gauth_user');
    
    // Reset state
    userAuthenticated = false;
    userProfile = null;
    
    // Show login screen
    showLogin();
    
    // Google sign-out
    if (google && google.accounts && google.accounts.id) {
        google.accounts.id.disableAutoSelect();
    }
}

// Show login screen
function showLogin() {
    if (loginContainer && appContainer) {
        loginContainer.classList.remove('hidden');
        appContainer.classList.add('hidden');
    }
}

// Show app and hide login
function showApp() {
    if (loginContainer && appContainer) {
        loginContainer.classList.add('hidden');
        appContainer.classList.remove('hidden');
        
        // Update user name display
        if (userName && userProfile) {
            userName.textContent = userProfile.name;
        }
    }
}

// Check if user is authenticated
function isAuthenticated() {
    return userAuthenticated;
}

// Get current user profile
function getCurrentUser() {
    return userProfile;
}
