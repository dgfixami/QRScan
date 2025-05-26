document.addEventListener('DOMContentLoaded', function() {
    // Initialize auth system
    initializeAuthSystem();
    
    // Get user's IP address
    getUserIP().then(ipAddress => {
        // Store IP in session storage for use throughout the app
        sessionStorage.setItem('user_ip', ipAddress);
        
        // Check if this is login page and handle admin login
        const loginForm = document.getElementById('login-form');
        if (loginForm) {
            loginForm.addEventListener('submit', function(e) {
                e.preventDefault();
                const email = document.getElementById('login-email').value;
                const password = document.getElementById('login-password').value;
                
                // Only authenticate admin users with email/password
                if (authenticateAdmin(email, password)) {
                    window.location.href = 'admin.html';
                } else {
                    showMessage('login-message', 'Invalid admin credentials', 'error');
                }
            });
        }

        // Check if we need to validate IP for non-admin pages
        if (window.location.pathname.endsWith('index.html') && !isAdminLoggedIn()) {
            // Check if IP is whitelisted using secure server-side check
            checkIPWhitelistedSecurely(ipAddress).then(isWhitelisted => {
                if (!isWhitelisted) {
                    // Redirect to access request page if not whitelisted
                    window.location.href = 'request-access.html';
                }
            }).catch(error => {
                console.error("IP whitelist check failed:", error);
                // Default to request access if the check fails for security
                window.location.href = 'request-access.html';
            });
        }
        
        // Request access form handler - simplified for name only
        const requestForm = document.getElementById('request-form');
        if (requestForm) {
            // Show user's IP address in the form
            const ipDisplay = document.getElementById('user-ip');
            if (ipDisplay) {
                ipDisplay.textContent = ipAddress;
            }
            
            // Check for pending request when request-form page loads
            checkForPendingRequests(ipAddress);
            
            requestForm.addEventListener('submit', function(e) {
                e.preventDefault();
                const name = document.getElementById('request-name').value;
                
                // Submit access request with name and IP address
                submitAccessRequest(name, ipAddress);
                
                // Clear form
                requestForm.reset();
                showMessage('request-message', 'Your access request has been submitted. Please wait for admin approval.', 'success');
            });
        }
        
        // Admin logout button
        const adminLogout = document.getElementById('admin-logout');
        if (adminLogout) {
            adminLogout.addEventListener('click', function() {
                localStorage.removeItem('qrscan_current_admin');
                window.location.href = 'login.html';
            });
        }
        
        // Scanner link button
        const scannerLink = document.getElementById('scanner-link');
        if (scannerLink) {
            scannerLink.addEventListener('click', function() {
                window.location.href = 'index.html';
            });
        }
        
        // Admin panel tab switching
        const adminTabs = document.querySelectorAll('.admin-tab');
        if (adminTabs.length) {
            adminTabs.forEach(tab => {
                tab.addEventListener('click', function() {
                    const tabId = this.getAttribute('data-tab');
                    
                    // Update active tab
                    document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
                    this.classList.add('active');
                    
                    // Show corresponding section
                    document.querySelectorAll('.admin-panel-section').forEach(s => s.classList.remove('active'));
                    document.getElementById(tabId).classList.add('active');
                });
            });
        }
        
        // Add IP whitelist button
        const addIPBtn = document.getElementById('add-ip-btn');
        const addIPModal = document.getElementById('add-ip-modal');
        if (addIPBtn && addIPModal) {
            addIPBtn.addEventListener('click', function() {
                addIPModal.showModal();
            });
            
            // Cancel button in modal
            const cancelAddIP = document.getElementById('cancel-add-ip');
            if (cancelAddIP) {
                cancelAddIP.addEventListener('click', function() {
                    addIPModal.close();
                });
            }
            
            // Add IP form
            const addIPForm = document.getElementById('add-ip-form');
            if (addIPForm) {
                addIPForm.addEventListener('submit', function(e) {
                    e.preventDefault();
                    
                    const name = document.getElementById('new-ip-name').value;
                    const ipAddress = document.getElementById('new-ip-address').value;
                    
                    // Add new IP to whitelist
                    addIPToWhitelist({
                        name: name,
                        ip: ipAddress,
                        approved: true,
                        addedBy: 'admin',
                        addedDate: new Date().toISOString()
                    });
                    
                    // Close modal and refresh lists
                    addIPModal.close();
                    addIPForm.reset();
                    loadWhitelistedIPs();
                });
            }
        }
        
        // Load access requests and whitelisted IPs in admin panel
        if (document.getElementById('request-list')) {
            loadAccessRequests();
        }
        
        if (document.getElementById('ip-list')) {
            loadWhitelistedIPs();
        }
    }).catch(error => {
        console.error("Error getting IP address:", error);
        showMessage('login-message', 'Error identifying your device. Please try again later.', 'error');
    });
});

// Google Sign-In callback handler needs proper verification
function handleCredentialResponse(response) {
    if (!response || !response.credential) {
        showMessage('login-message', 'Invalid response from Google authentication', 'error');
        return;
    }
    
    try {
        // Decode the JWT token from Google
        const responsePayload = decodeJwtResponse(response.credential);
        
        // Add proper validation of token integrity
        if (!validateGoogleToken(responsePayload)) {
            showMessage('login-message', 'Invalid Google authentication token', 'error');
            return;
        }
        
        // Check if the user belongs to fixami.com domain using hd parameter
        if (responsePayload.hd === 'fixami.com') {
            // Save admin session with proper sanitization
            const adminData = {
                name: sanitizeInput(responsePayload.name),
                email: sanitizeInput(responsePayload.email),
                picture: sanitizeInput(responsePayload.picture),
                hd: sanitizeInput(responsePayload.hd)
            };
            
            // Use sessionStorage instead of localStorage for security-sensitive session
            sessionStorage.setItem('qrscan_current_admin', JSON.stringify(adminData));
            
            // Redirect to admin panel
            window.location.href = 'admin.html';
        } else {
            // Show unauthorized message with domain requirement
            showMessage('login-message', 'Only users with a Fixami.com Google Workspace account can access the admin panel.', 'error');
        }
    } catch (error) {
        console.error("Google auth error:", error);
        showMessage('login-message', 'Authentication error. Please try again.', 'error');
    }
}

// Add proper Google token validation
function validateGoogleToken(payload) {
    // Minimal validation requirements
    if (!payload.iss || !payload.iss.includes('accounts.google.com')) {
        return false;
    }
    
    if (!payload.email || !payload.email_verified) {
        return false;
    }
    
    // Check token expiration
    const currentTime = Math.floor(Date.now() / 1000);
    if (!payload.exp || payload.exp < currentTime) {
        return false;
    }
    
    return true;
}

// Add a critical security function to validate input
function sanitizeInput(input) {
    if (!input) return '';
    
    // Convert to string if not already
    const str = String(input);
    
    // Basic XSS protection by replacing HTML special chars
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Replace client-side IP whitelist check with server call
async function checkIPWhitelistedSecurely(ipAddress) {
    try {
        // This is where you would make a call to your backend service
        // For now, we'll simulate with the existing localStorage check
        // but in production, this should be a server API call
        const whitelist = JSON.parse(localStorage.getItem('qrscan_ip_whitelist')) || [];
        return whitelist.some(entry => entry.ip === ipAddress && entry.approved);
        
        // Proper implementation would be:
        /*
        const response = await fetch('https://your-server.com/api/check-ip-whitelist', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ ip: ipAddress })
        });
        const data = await response.json();
        return data.isWhitelisted;
        */
    } catch (error) {
        console.error("IP whitelist check error:", error);
        return false; // Fail closed for security
    }
}

// Helper to show messages with sanitized content
function showMessage(elementId, message, type) {
    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = message; // Using textContent instead of innerHTML for security
        element.className = `auth-message ${type}`;
        element.style.display = 'block';
        
        // Hide message after 5 seconds for success/info messages
        if (type === 'success' || type === 'info') {
            setTimeout(() => {
                element.style.display = 'none';
            }, 5000);
        }
    }
}

// Get the user's IP address using ipify API
async function getUserIP() {
    try {
        const response = await fetch('https://api.ipify.org?format=json');
        const data = await response.json();
        return data.ip;
    } catch (error) {
        console.error("Error fetching IP:", error);
        return "unknown";
    }
}

// Initialize the authentication system
function initializeAuthSystem() {
    // Check if admin exists in localStorage
    let admins = JSON.parse(localStorage.getItem('qrscan_admins'));
    
    // If no admins, create default admin
    if (!admins || admins.length === 0) {
        admins = [{
            name: 'Admin',
            email: 'admin@example.com',
            password: 'admin123'
        }];
        localStorage.setItem('qrscan_admins', JSON.stringify(admins));
    }
    
    // Check if IP whitelist array exists
    if (!localStorage.getItem('qrscan_ip_whitelist')) {
        localStorage.setItem('qrscan_ip_whitelist', JSON.stringify([]));
    }
    
    // Check if access requests array exists
    if (!localStorage.getItem('qrscan_access_requests')) {
        localStorage.setItem('qrscan_access_requests', JSON.stringify([]));
    }
}

// Check if a user is admin and currently logged in
function isAdminLoggedIn() {
    const currentAdmin = JSON.parse(localStorage.getItem('qrscan_current_admin'));
    
    if (!currentAdmin) {
        return false;
    }
    
    // Check if the user belongs to fixami.com domain using hd property
    return currentAdmin.hd === 'fixami.com';
}

// Check if IP is in the whitelist
function isIPWhitelisted(ipAddress) {
    const whitelist = JSON.parse(localStorage.getItem('qrscan_ip_whitelist')) || [];
    return whitelist.some(entry => entry.ip === ipAddress && entry.approved);
}

// Check for pending requests for this IP
function checkForPendingRequests(ipAddress) {
    const requests = JSON.parse(localStorage.getItem('qrscan_access_requests')) || [];
    const existingRequest = requests.find(r => r.ip === ipAddress);
    
    if (existingRequest) {
        // Show pending request message
        showMessage('request-message', `You already have a pending access request as ${existingRequest.name}`, 'warning');
        
        // Format the date for display
        const requestDate = new Date(existingRequest.requestDate);
        const formattedDate = requestDate.toLocaleDateString() + ' ' + requestDate.toLocaleTimeString();
        
        // Show status info
        const statusElement = document.getElementById('request-status');
        if (statusElement) {
            statusElement.innerHTML = `
                <div class="pending-request">
                    <p>Your request was submitted on ${formattedDate}</p>
                    <p>Please wait for an administrator to review your request.</p>
                </div>
            `;
            statusElement.style.display = 'block';
        }
        
        // Disable the form
        const requestForm = document.getElementById('request-form');
        if (requestForm) {
            const submitButton = requestForm.querySelector('button[type="submit"]');
            if (submitButton) {
                submitButton.disabled = true;
                submitButton.textContent = 'Request Pending';
                submitButton.classList.add('disabled-button');
            }
            
            // Prefill and disable name field
            const nameInput = document.getElementById('request-name');
            if (nameInput) {
                nameInput.value = existingRequest.name;
                nameInput.disabled = true;
            }
        }
        
        return true;
    }
    
    return false;
}

// Submit access request with name and IP
function submitAccessRequest(name, ipAddress) {
    const requests = JSON.parse(localStorage.getItem('qrscan_access_requests')) || [];
    
    // Check if request already exists for this IP
    const existingRequest = requests.find(r => r.ip === ipAddress);
    if (existingRequest) {
        showMessage('request-message', `An access request is already pending for this device under the name: ${existingRequest.name}`, 'error');
        
        // Show a "check status" message with timestamp
        const requestDate = new Date(existingRequest.requestDate);
        const formattedDate = requestDate.toLocaleDateString() + ' ' + requestDate.toLocaleTimeString();
        
        const statusElement = document.getElementById('request-status');
        if (statusElement) {
            statusElement.innerHTML = `
                <div class="pending-request">
                    <p>You already have a pending request submitted on ${formattedDate}</p>
                    <p>Please wait for an administrator to review your request.</p>
                </div>
            `;
            statusElement.style.display = 'block';
        }
        
        // Disable the form to prevent further submissions
        const requestForm = document.getElementById('request-form');
        if (requestForm) {
            const submitButton = requestForm.querySelector('button[type="submit"]');
            if (submitButton) {
                submitButton.disabled = true;
                submitButton.textContent = 'Request Pending';
                submitButton.classList.add('disabled-button');
            }
            
            // Optionally disable the input fields
            const inputs = requestForm.querySelectorAll('input');
            inputs.forEach(input => {
                input.disabled = true;
            });
        }
        
        return false;
    }
    
    // Check if IP is already whitelisted
    if (isIPWhitelisted(ipAddress)) {
        showMessage('request-message', 'Your device is already approved for access', 'success');
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 2000);
        return true;
    }
    
    // Add new request
    requests.push({
        name: name,
        ip: ipAddress,
        requestDate: new Date().toISOString()
    });
    
    localStorage.setItem('qrscan_access_requests', JSON.stringify(requests));
    
    // Update UI to show pending state
    const statusElement = document.getElementById('request-status');
    if (statusElement) {
        const requestDate = new Date();
        const formattedDate = requestDate.toLocaleDateString() + ' ' + requestDate.toLocaleTimeString();
        
        statusElement.innerHTML = `
            <div class="pending-request">
                <p>Your request was submitted on ${formattedDate}</p>
                <p>Please wait for an administrator to review your request.</p>
            </div>
        `;
        statusElement.style.display = 'block';
    }
    
    // Disable the form to prevent further submissions
    const requestForm = document.getElementById('request-form');
    if (requestForm) {
        const submitButton = requestForm.querySelector('button[type="submit"]');
        if (submitButton) {
            submitButton.disabled = true;
            submitButton.textContent = 'Request Pending';
            submitButton.classList.add('disabled-button');
        }
        
        // Disable the input fields
        const inputs = requestForm.querySelectorAll('input');
        inputs.forEach(input => {
            input.disabled = true;
        });
    }
    
    return true;
}

// Load access requests for admin panel
function loadAccessRequests() {
    const requestList = document.getElementById('request-list');
    const requests = JSON.parse(localStorage.getItem('qrscan_access_requests')) || [];
    
    // Clear current list
    requestList.innerHTML = '';
    
    if (requests.length === 0) {
        requestList.innerHTML = '<p class="no-items-message">No pending access requests.</p>';
        return;
    }
    
    // Add each request to the list
    requests.forEach(request => {
        const requestItem = document.createElement('div');
        requestItem.className = 'request-item';
        
        // Format date for display
        const requestDate = new Date(request.requestDate);
        const formattedDate = requestDate.toLocaleDateString() + ' ' + requestDate.toLocaleTimeString();
        
        requestItem.innerHTML = `
            <div class="request-info">
                <p><strong>${request.name}</strong></p>
                <p>IP Address: ${request.ip}</p>
                <p>Requested: ${formattedDate}</p>
            </div>
            <div class="request-actions">
                <button class="admin-btn approve" data-ip="${request.ip}" data-name="${request.name}">Approve</button>
                <button class="admin-btn reject" data-ip="${request.ip}">Reject</button>
            </div>
        `;
        
        requestList.appendChild(requestItem);
    });
    
    // Add event listeners for approve/reject buttons
    document.querySelectorAll('#request-list .admin-btn.approve').forEach(btn => {
        btn.addEventListener('click', function() {
            const ip = this.getAttribute('data-ip');
            const name = this.getAttribute('data-name');
            approveAccessRequest(ip, name);
        });
    });
    
    document.querySelectorAll('#request-list .admin-btn.reject').forEach(btn => {
        btn.addEventListener('click', function() {
            const ip = this.getAttribute('data-ip');
            rejectAccessRequest(ip);
        });
    });
}

// Load whitelisted IPs for admin panel
function loadWhitelistedIPs() {
    const ipList = document.getElementById('ip-list');
    const whitelist = JSON.parse(localStorage.getItem('qrscan_ip_whitelist')) || [];
    
    // Clear current list
    ipList.innerHTML = '';
    
    if (whitelist.length === 0) {
        ipList.innerHTML = '<p class="no-items-message">No whitelisted IP addresses.</p>';
        return;
    }
    
    // Add each IP to the list
    whitelist.forEach(entry => {
        const ipItem = document.createElement('div');
        ipItem.className = 'user-item';
        
        // Format date for display
        const addedDate = new Date(entry.addedDate);
        const formattedDate = addedDate.toLocaleDateString() + ' ' + addedDate.toLocaleTimeString();
        
        ipItem.innerHTML = `
            <div class="user-info">
                <p><strong>${entry.name}</strong></p>
                <p>IP Address: ${entry.ip}</p>
                <p>Added: ${formattedDate}</p>
                <p>Added by: ${entry.addedBy}</p>
            </div>
            <div class="user-actions">
                <button class="admin-btn delete" data-ip="${entry.ip}">Remove</button>
            </div>
        `;
        
        ipList.appendChild(ipItem);
    });
    
    // Add event listeners for delete buttons
    document.querySelectorAll('#ip-list .admin-btn.delete').forEach(btn => {
        btn.addEventListener('click', function() {
            const ip = this.getAttribute('data-ip');
            removeIPFromWhitelist(ip);
        });
    });
}

// Approve access request and add IP to whitelist
function approveAccessRequest(ip, name) {
    const requests = JSON.parse(localStorage.getItem('qrscan_access_requests')) || [];
    const whitelist = JSON.parse(localStorage.getItem('qrscan_ip_whitelist')) || [];
    
    // Find the request
    const requestIndex = requests.findIndex(r => r.ip === ip);
    if (requestIndex === -1) return false;
    
    // Get admin info
    const currentAdmin = JSON.parse(localStorage.getItem('qrscan_current_admin'));
    const adminName = currentAdmin ? currentAdmin.name : 'Admin';
    
    // Create new whitelist entry
    const newEntry = {
        name: name,
        ip: ip,
        approved: true,
        addedBy: adminName,
        addedDate: new Date().toISOString()
    };
    
    // Add to whitelist and remove request
    whitelist.push(newEntry);
    requests.splice(requestIndex, 1);
    
    // Save changes
    localStorage.setItem('qrscan_ip_whitelist', JSON.stringify(whitelist));
    localStorage.setItem('qrscan_access_requests', JSON.stringify(requests));
    
    // Refresh lists
    loadAccessRequests();
    loadWhitelistedIPs();
    
    return true;
}

// Reject access request
function rejectAccessRequest(ip) {
    const requests = JSON.parse(localStorage.getItem('qrscan_access_requests')) || [];
    
    // Find and remove the request
    const requestIndex = requests.findIndex(r => r.ip === ip);
    if (requestIndex === -1) return false;
    
    requests.splice(requestIndex, 1);
    
    // Save changes
    localStorage.setItem('qrscan_access_requests', JSON.stringify(requests));
    
    // Refresh list
    loadAccessRequests();
    
    return true;
}

// Add IP directly to whitelist (for manual entry)
function addIPToWhitelist(entry) {
    const whitelist = JSON.parse(localStorage.getItem('qrscan_ip_whitelist')) || [];
    
    // Check if IP already exists
    if (whitelist.some(e => e.ip === entry.ip)) {
        alert('This IP address is already in the whitelist!');
        return false;
    }
    
    // Add new entry
    whitelist.push(entry);
    
    // Save changes
    localStorage.setItem('qrscan_ip_whitelist', JSON.stringify(whitelist));
    
    return true;
}

// Remove IP from whitelist
function removeIPFromWhitelist(ip) {
    const whitelist = JSON.parse(localStorage.getItem('qrscan_ip_whitelist')) || [];
    
    // Find and remove the entry
    const entryIndex = whitelist.findIndex(e => e.ip === ip);
    if (entryIndex === -1) return false;
    
    if (confirm(`Are you sure you want to remove this IP address from the whitelist?`)) {
        whitelist.splice(entryIndex, 1);
        
        // Save changes
        localStorage.setItem('qrscan_ip_whitelist', JSON.stringify(whitelist));
        
        // Refresh list
        loadWhitelistedIPs();
    }
    
    return true;
}

// Helper to show messages
function showMessage(elementId, message, type) {
    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = message;
        element.className = `auth-message ${type}`;
        element.style.display = 'block';
        
        // Hide message after 5 seconds for success/info messages
        if (type === 'success' || type === 'info') {
            setTimeout(() => {
                element.style.display = 'none';
            }, 5000);
        }
    }
}
