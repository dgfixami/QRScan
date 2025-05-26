/**
 * Security utility functions for the QR Scanner application
 * This file provides centralized security functions to be used throughout the app
 */

// CSRF protection token generator
function generateCSRFToken() {
    const array = new Uint8Array(16);
    window.crypto.getRandomValues(array);
    return Array.from(array, byte => ('0' + byte.toString(16)).slice(-2)).join('');
}

// Store CSRF token for API requests
function storeCSRFToken() {
    const token = generateCSRFToken();
    sessionStorage.setItem('csrf_token', token);
    return token;
}

// Get stored CSRF token
function getCSRFToken() {
    return sessionStorage.getItem('csrf_token') || storeCSRFToken();
}

// HTML sanitizer to prevent XSS
function sanitizeHTML(input) {
    if (!input) return '';
    return String(input)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Safely set text content to an element
function setElementTextSafely(elementId, text) {
    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = text;
    }
}

// Safely set HTML content to an element (after sanitizing)
function setElementHTMLSafely(elementId, html) {
    const element = document.getElementById(elementId);
    if (element) {
        element.innerHTML = sanitizeHTML(html);
    }
}

// Input validation for code entries (QR codes, vouchers, etc.)
function validateCodeInput(code) {
    if (!code || typeof code !== 'string') {
        return false;
    }
    
    // Only allow alphanumeric characters, dashes, and periods
    const validCodePattern = /^[A-Za-z0-9\-\.]+$/;
    return validCodePattern.test(code);
}

// Validate email addresses
function validateEmail(email) {
    if (!email || typeof email !== 'string') {
        return false;
    }
    
    const emailPattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return emailPattern.test(email);
}

// Rate limiter for API calls
class RateLimiter {
    constructor(maxCalls, timeWindow) {
        this.maxCalls = maxCalls || 5; // Default: 5 calls
        this.timeWindow = timeWindow || 10000; // Default: 10 seconds
        this.callHistory = [];
    }
    
    canMakeCall() {
        const now = Date.now();
        
        // Remove outdated calls
        this.callHistory = this.callHistory.filter(
            timestamp => now - timestamp < this.timeWindow
        );
        
        // Check if we've exceeded the limit
        if (this.callHistory.length >= this.maxCalls) {
            return false;
        }
        
        // Add current call to history
        this.callHistory.push(now);
        return true;
    }
    
    getRemainingTime() {
        if (this.callHistory.length === 0) {
            return 0;
        }
        
        const now = Date.now();
        const oldestCall = this.callHistory[0];
        const timeSinceOldest = now - oldestCall;
        
        if (timeSinceOldest >= this.timeWindow) {
            return 0;
        }
        
        return this.timeWindow - timeSinceOldest;
    }
}

// Authentication token validator
function validateAuthToken() {
    try {
        const tokenData = sessionStorage.getItem('qrscan_current_admin');
        if (!tokenData) {
            return false;
        }
        
        const admin = JSON.parse(tokenData);
        
        // Check required fields
        if (!admin || !admin.email || !admin.hd || admin.hd !== 'fixami.com') {
            return false;
        }
        
        // Check token expiration if there is one
        if (admin.exp && typeof admin.exp === 'number') {
            const now = Math.floor(Date.now() / 1000);
            if (admin.exp < now) {
                // Token expired
                return false;
            }
        }
        
        return true;
    } catch (error) {
        console.error("Auth validation error:", error);
        return false;
    }
}

// Create API request security headers
function getSecureHeaders() {
    return {
        'Content-Type': 'application/json',
        'X-CSRF-Token': getCSRFToken(),
        'X-Requested-With': 'XMLHttpRequest'
    };
}

// Global error handler
window.addEventListener('error', function(event) {
    console.error('Global error:', event.message);
    // In production, you might want to send this to your error tracking service
});

// Initialize security features
(function() {
    // Generate initial CSRF token
    storeCSRFToken();
    
    // Check for secure context
    if (window.isSecureContext) {
        console.log('Running in secure context');
    } else {
        console.warn('Not running in secure context - some security features may be limited');
    }
})();
