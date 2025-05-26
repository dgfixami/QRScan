/**
 * Security Utilities
 * This file contains shared functions for input/output security
 */

// Secure input sanitization with HTML entity encoding
function sanitizeString(input) {
    if (!input || typeof input !== 'string') return '';
    
    // First strip any HTML/script tags
    let sanitized = input.replace(/<[^>]*>/g, '');
    
    // Replace special characters with HTML entities
    sanitized = sanitized.replace(/[<>&"'`=]/g, function(c) {
        return {
            '<': '&lt;',
            '>': '&gt;',
            '&': '&amp;',
            '"': '&quot;',
            "'": '&#39;',
            '`': '&#96;',
            '=': '&#61;'
        }[c];
    });
    
    // Limit string length to prevent excessive data
    return sanitized.substring(0, 250);
}

// Enhanced IP validation with strict format checking
function validateIPAddress(ip) {
    if (!ip || typeof ip !== 'string') return false;
    
    try {
        // Strict IPv4 pattern check
        const ipv4Pattern = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
        if (!ipv4Pattern.test(ip)) return false;
        
        // Additional integrity check - make sure it's correctly formatted without excess data
        const parts = ip.split('.');
        if (parts.length !== 4) return false;
        
        // Check for leading zeros which can be used for octal interpretation
        for (const part of parts) {
            if (part.length > 1 && part.startsWith('0')) return false;
            const num = parseInt(part, 10);
            if (isNaN(num) || num < 0 || num > 255) return false;
        }
        
        return true;
    } catch (error) {
        console.error("IP validation error:", error);
        return false;
    }
}

// Function to check if an object has been modified/tampered with
function validateObject(obj, schema) {
    if (!obj || typeof obj !== 'object') return false;
    
    try {
        // Check required properties
        for (const prop of schema.required || []) {
            if (obj[prop] === undefined) return false;
        }
        
        // Check property types
        for (const [key, type] of Object.entries(schema.types || {})) {
            if (obj[key] !== undefined) {
                if (typeof obj[key] !== type) return false;
                
                // String length validations
                if (type === 'string' && schema.maxLengths && schema.maxLengths[key]) {
                    if (obj[key].length > schema.maxLengths[key]) return false;
                }
            }
        }
        
        // Check if object has unexpected properties
        if (schema.strict) {
            const allowedProps = [...(schema.required || []), ...Object.keys(schema.types || {})];
            for (const key in obj) {
                if (!allowedProps.includes(key)) return false;
            }
        }
        
        return true;
    } catch (error) {
        console.error("Object validation error:", error);
        return false;
    }
}

// Create a safe DOM element with sanitized content and attributes
function createSafeElement(tag, text, attributes) {
    try {
        const element = document.createElement(tag);
        
        // Sanitize and set text content if provided
        if (text !== undefined) {
            element.textContent = sanitizeString(text);
        }
        
        // Add sanitized attributes if provided
        if (attributes && typeof attributes === 'object') {
            for (const [key, value] of Object.entries(attributes)) {
                // Validate attribute name - only allow standard attributes, no on* events
                if (key.startsWith('on') || key.includes('script') || !key.match(/^[a-zA-Z0-9_\-:]+$/)) {
                    continue;
                }
                
                // Set attribute with sanitized value
                element.setAttribute(key, sanitizeString(value));
            }
        }
        
        return element;
    } catch (error) {
        console.error("Error creating safe element:", error);
        return document.createTextNode("Error creating element");
    }
}

// Function to detect devtools and potential tampering
function setupSecurityMonitoring() {
    // Detect devtools opening
    const devToolsListener = () => {
        // Log potential tampering attempt
        const tamperingLog = JSON.parse(localStorage.getItem('security_log') || '[]');
        tamperingLog.push({
            event: 'devtools_open',
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent
        });
        
        // Keep log size reasonable
        while (tamperingLog.length > 50) tamperingLog.shift();
        
        localStorage.setItem('security_log', JSON.stringify(tamperingLog));
    };
    
    // Detect resize which might indicate devtools opening
    window.addEventListener('resize', () => {
        if (window.outerWidth - window.innerWidth > 160) {
            devToolsListener();
        }
    });
    
    // Monitor for DOM modifications to critical elements
    const observer = new MutationObserver(mutations => {
        for (const mutation of mutations) {
            if (mutation.type === 'attributes' || 
                (mutation.type === 'childList' && mutation.target.id === 'request-form')) {
                
                // Log potential DOM tampering
                const tamperingLog = JSON.parse(localStorage.getItem('security_log') || '[]');
                tamperingLog.push({
                    event: 'dom_modified',
                    target: mutation.target.id || mutation.target.className || 'unknown',
                    type: mutation.type,
                    timestamp: new Date().toISOString()
                });
                
                while (tamperingLog.length > 50) tamperingLog.shift();
                localStorage.setItem('security_log', JSON.stringify(tamperingLog));
            }
        }
    });
    
    // Start observing once the DOM is loaded
    document.addEventListener('DOMContentLoaded', () => {
        // Watch critical elements for modifications
        const criticalForms = document.querySelectorAll('form');
        criticalForms.forEach(form => {
            observer.observe(form, { 
                attributes: true, 
                childList: true, 
                subtree: true, 
                attributeFilter: ['pattern', 'required', 'action'] 
            });
        });
    });
}

// Check CSRF token validity
function verifyCSRFToken(formToken) {
    const sessionToken = sessionStorage.getItem('csrf_token');
    return sessionToken && formToken && sessionToken === formToken;
}

// Initialize security measures
setupSecurityMonitoring();
