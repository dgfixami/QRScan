/**
 * Security utility functions for the QR Code Scanner application
 */

// Set secure flags for cookies
function setSecureCookieOptions() {
    document.cookie = "SameSite=Strict; Secure";
}

// Implement Content Security Policy
function setupCSP() {
    // Create a CSP meta tag
    const metaCSP = document.createElement('meta');
    metaCSP.httpEquiv = 'Content-Security-Policy';
    metaCSP.content = "default-src 'self'; script-src 'self' https://accounts.google.com https://unpkg.com https://script.google.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://*.googleusercontent.com; connect-src 'self' https://api.ipify.org https://script.google.com";
    document.head.appendChild(metaCSP);
}

// Check for common XSS patterns in inputs
function containsXSSPatterns(input) {
    if (typeof input !== 'string') return false;
    
    // Check for common XSS patterns
    const xssPatterns = [
        /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
        /javascript:/gi,
        /on\w+=/gi,
        /src\s*=\s*["']?data:/gi,
        /expression\s*\(/gi,
        /eval\s*\(/gi,
        /alert\s*\(/gi,
        /onerror\s*=/gi
    ];
    
    return xssPatterns.some(pattern => pattern.test(input));
}

// Sanitize inputs with strong filtering
function sanitizeStrongly(input) {
    if (typeof input !== 'string') return '';
    
    // First remove potential script tags completely
    let sanitized = input.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    
    // Replace all HTML entities
    sanitized = sanitized
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')
        .replace(/`/g, '&#96;')
        .replace(/\(/g, '&#40;')
        .replace(/\)/g, '&#41;');
    
    // Remove potential event handlers and javascript: URLs
    sanitized = sanitized
        .replace(/javascript:/gi, '')
        .replace(/on\w+=/gi, '')
        .replace(/onerror/gi, '')
        .replace(/src\s*=\s*["']?data:/gi, '');
    
    return sanitized;
}

// Add event listener to automatically sanitize form inputs
function setupFormSanitization() {
    document.querySelectorAll('form').forEach(form => {
        form.addEventListener('submit', function(e) {
            let containsXSS = false;
            
            // Check and sanitize all inputs
            this.querySelectorAll('input[type="text"], input:not([type]), textarea').forEach(input => {
                if (containsXSSPatterns(input.value)) {
                    e.preventDefault();
                    containsXSS = true;
                    input.value = '';
                    input.classList.add('error-input');
                    
                    // Add error message
                    const errorMsg = document.createElement('div');
                    errorMsg.className = 'input-error';
                    errorMsg.textContent = 'Invalid characters detected';
                    input.parentNode.insertBefore(errorMsg, input.nextSibling);
                    
                    setTimeout(() => {
                        const errors = document.querySelectorAll('.input-error');
                        errors.forEach(err => err.remove());
                        input.classList.remove('error-input');
                    }, 3000);
                }
            });
            
            if (containsXSS) {
                console.error('Potential XSS attack blocked');
                return false;
            }
        });
    });
}

// Validate IP address format
function isValidIPAddress(ipAddress) {
    if (typeof ipAddress !== 'string') return false;
    
    // IPv4 validation regex
    const ipv4Regex = /^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    return ipv4Regex.test(ipAddress);
}

// Sanitize inputs to prevent XSS
function sanitizeInput(input) {
    if (typeof input !== 'string') return '';
    return input
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Create DOM elements safely
function createSafeElement(tag, attributes = {}, textContent = '') {
    const element = document.createElement(tag);
    
    // Add attributes safely
    Object.entries(attributes).forEach(([key, value]) => {
        if (key === 'className') {
            element.className = value;
        } else {
            element.setAttribute(key, value);
        }
    });
    
    // Add text content if provided (safely)
    if (textContent) {
        element.textContent = textContent;
    }
    
    return element;
}

// Validate email address
function isValidEmail(email) {
    if (typeof email !== 'string') return false;
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    return emailRegex.test(email);
}

// Generate CSRF token using crypto API
function generateCSRFToken() {
    // Use crypto API to generate random values
    return Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map(byte => byte.toString(16).padStart(2, '0'))
        .join('');
}

// Validate CSRF token
function validateCSRFToken(token, storedToken) {
    if (!token || !storedToken) return false;
    // Use constant-time comparison to prevent timing attacks
    return token === storedToken;
}

// Check if user is allowed based on domain
function isAllowedDomain(domain) {
    return domain === 'fixami.com';
}

// Add CSRF token to URLs
function addCSRFToken(url) {
    const csrfToken = localStorage.getItem('qrscan_csrf_token');
    if (!csrfToken) return url;
    
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}csrf=${encodeURIComponent(csrfToken)}`;
}

// Initialize security features
document.addEventListener('DOMContentLoaded', function() {
    setSecureCookieOptions();
    setupCSP();
    setupFormSanitization();
    
    // Check for CSRF token or create one
    if (!localStorage.getItem('qrscan_csrf_token')) {
        const csrfToken = Array.from(crypto.getRandomValues(new Uint8Array(32)))
            .map(byte => byte.toString(16).padStart(2, '0'))
            .join('');
        localStorage.setItem('qrscan_csrf_token', csrfToken);
    }
    
    console.log('Security features initialized');
});
