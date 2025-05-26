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
            // If admin access is set, don't redirect
            if (sessionStorage.getItem('admin_access') === 'true') {
                console.log("Admin access flag found in auth.js, skipping IP check");
                return;
            }
            
            // If access is already verified in this session, don't check again
            const accessVerified = sessionStorage.getItem('access_verified');
            if (accessVerified === 'true') {
                console.log("Access verified flag found in auth.js, skipping IP check");
                return; // Access already verified
            }
            
            console.log("Checking IP whitelist in auth.js:", ipAddress);
            
            // Check if IP is whitelisted
            if (!isIPWhitelisted(ipAddress)) {
                console.log("IP not whitelisted in auth.js, redirecting");
                // Redirect to access request page if not whitelisted
                window.location.href = 'request-access.html';
            } else {
                console.log("IP is whitelisted in auth.js, marking verified");
                // If IP is whitelisted, mark access as verified
                sessionStorage.setItem('access_verified', 'true');
                sessionStorage.setItem('access_timestamp', new Date().getTime());
            }
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

// Google Sign-In callback handler
function handleCredentialResponse(response) {
    // Decode the JWT token from Google
    const responsePayload = decodeJwtResponse(response.credential);
    
    // Check if the user belongs to fixami.com domain using hd parameter
    if (responsePayload.hd === 'fixami.com') {
        // Save admin session
        const adminData = {
            name: responsePayload.name,
            email: responsePayload.email,
            picture: responsePayload.picture,
            hd: responsePayload.hd
        };
        
        localStorage.setItem('qrscan_current_admin', JSON.stringify(adminData));
        
        // Redirect to admin panel
        window.location.href = 'admin.html';
    } else {
        // Show unauthorized message with domain requirement
        showMessage('login-message', 'Only users with a Fixami.com Google Workspace account can access the admin panel.', 'error');
    }
}

// Helper function to decode JWT token
function decodeJwtResponse(token) {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
    
    return JSON.parse(jsonPayload);
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
    // Check if IP whitelist array exists
    if (!localStorage.getItem('qrscan_ip_whitelist')) {
        localStorage.setItem('qrscan_ip_whitelist', JSON.stringify([]));
    }
    
    // Check if access requests array exists
    if (!localStorage.getItem('qrscan_access_requests')) {
        localStorage.setItem('qrscan_access_requests', JSON.stringify([]));
    }
    
    // Generate CSRF token if not exists
    if (!sessionStorage.getItem('csrf_token')) {
        const token = generateCSRFToken();
        sessionStorage.setItem('csrf_token', token);
    }
}

// Generate CSRF token for form submissions
function generateCSRFToken() {
    const array = new Uint8Array(16);
    window.crypto.getRandomValues(array);
    return Array.from(array, byte => ('0' + (byte & 0xFF).toString(16)).slice(-2)).join('');
}

// Check if a user is admin and currently logged in
function isAdminLoggedIn() {
    const currentAdmin = JSON.parse(localStorage.getItem('qrscan_current_admin'));
    
    if (!currentAdmin) {
        return false;
    }
    
    // Check if the user belongs to fixami.com domain using hd property
    const isAdmin = currentAdmin.hd === 'fixami.com';
    
    // Set the admin access flag if they are an admin
    if (isAdmin) {
        console.log("Admin detected in isAdminLoggedIn:", currentAdmin.email);
        sessionStorage.setItem('admin_access', 'true');
        sessionStorage.setItem('access_verified', 'true');
    }
    
    return isAdmin;
}

// Check if IP is in the whitelist - added sanitization
function isIPWhitelisted(ipAddress) {
    // Sanitize IP input
    if (!isValidIPAddress(ipAddress)) {
        return false;
    }
    
    const whitelist = JSON.parse(localStorage.getItem('qrscan_ip_whitelist')) || [];
    return whitelist.some(entry => entry.ip === ipAddress && entry.approved);
}

// Validate IP address format
function isValidIPAddress(ip) {
    if (!ip || typeof ip !== 'string') return false;
    
    // IPv4 regex pattern
    const ipv4Pattern = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    return ipv4Pattern.test(ip);
}

// Sanitize input to prevent XSS
function sanitizeInput(input) {
    if (typeof input !== 'string') return '';
    return input.replace(/[<>&"']/g, function(c) {
        return {
            '<': '&lt;',
            '>': '&gt;',
            '&': '&amp;',
            '"': '&quot;',
            "'": '&#39;'
        }[c];
    });
}

// Check for pending requests for this IP
function checkForPendingRequests(ipAddress) {
    // Validate IP
    if (!isValidIPAddress(ipAddress)) {
        showMessage('request-message', 'Invalid IP address format', 'error');
        return false;
    }
    
    const requests = JSON.parse(localStorage.getItem('qrscan_access_requests')) || [];
    const existingRequest = requests.find(r => r.ip === ipAddress);
    
    if (existingRequest) {
        // Show pending request message
        showMessage('request-message', `You already have a pending access request as ${sanitizeInput(existingRequest.name)}`, 'warning');
        
        // Format the date for display
        const requestDate = new Date(existingRequest.requestDate);
        const formattedDate = requestDate.toLocaleDateString() + ' ' + requestDate.toLocaleTimeString();
        
        // Show status info
        const statusElement = document.getElementById('request-status');
        if (statusElement) {
            // Use DOM methods instead of innerHTML
            statusElement.textContent = '';
            
            const pendingDiv = document.createElement('div');
            pendingDiv.className = 'pending-request';
            
            const datePara = document.createElement('p');
            datePara.textContent = `Your request was submitted on ${formattedDate}`;
            
            const waitPara = document.createElement('p');
            waitPara.textContent = 'Please wait for an administrator to review your request.';
            
            pendingDiv.appendChild(datePara);
            pendingDiv.appendChild(waitPara);
            statusElement.appendChild(pendingDiv);
            
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
    // Input validation
    if (!name || typeof name !== 'string' || name.trim() === '') {
        showMessage('request-message', 'Please enter a valid name', 'error');
        return false;
    }
    
    if (!isValidIPAddress(ipAddress)) {
        showMessage('request-message', 'Invalid IP address format', 'error');
        return false;
    }
    
    // CSRF protection
    const csrfToken = sessionStorage.getItem('csrf_token');
    const formToken = document.getElementById('csrf_token')?.value;
    
    if (!csrfToken || csrfToken !== formToken) {
        showMessage('request-message', 'Security verification failed. Please refresh the page and try again.', 'error');
        return false;
    }
    
    const requests = JSON.parse(localStorage.getItem('qrscan_access_requests')) || [];
    
    // Check if request already exists for this IP
    const existingRequest = requests.find(r => r.ip === ipAddress);
    if (existingRequest) {
        showMessage('request-message', `An access request is already pending for this device under the name: ${sanitizeInput(existingRequest.name)}`, 'error');
        
        // Show a "check status" message with timestamp
        const requestDate = new Date(existingRequest.requestDate);
        const formattedDate = requestDate.toLocaleDateString() + ' ' + requestDate.toLocaleTimeString();
        
        const statusElement = document.getElementById('request-status');
        if (statusElement) {
            // Use DOM methods instead of innerHTML
            statusElement.textContent = '';
            
            const pendingDiv = document.createElement('div');
            pendingDiv.className = 'pending-request';
            
            const datePara = document.createElement('p');
            datePara.textContent = `You already have a pending request submitted on ${formattedDate}`;
            
            const waitPara = document.createElement('p');
            waitPara.textContent = 'Please wait for an administrator to review your request.';
            
            pendingDiv.appendChild(datePara);
            pendingDiv.appendChild(waitPara);
            statusElement.appendChild(pendingDiv);
            
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
    
    // Add new request - sanitize name input
    requests.push({
        name: sanitizeInput(name),
        ip: ipAddress,
        requestDate: new Date().toISOString()
    });
    
    localStorage.setItem('qrscan_access_requests', JSON.stringify(requests));
    
    // Update UI to show pending state
    const statusElement = document.getElementById('request-status');
    if (statusElement) {
        const requestDate = new Date();
        const formattedDate = requestDate.toLocaleDateString() + ' ' + requestDate.toLocaleTimeString();
        
        // Use DOM methods instead of innerHTML
        statusElement.textContent = '';
        
        const pendingDiv = document.createElement('div');
        pendingDiv.className = 'pending-request';
        
        const datePara = document.createElement('p');
        datePara.textContent = `Your request was submitted on ${formattedDate}`;
        
        const waitPara = document.createElement('p');
        waitPara.textContent = 'Please wait for an administrator to review your request.';
        
        pendingDiv.appendChild(datePara);
        pendingDiv.appendChild(waitPara);
        statusElement.appendChild(pendingDiv);
        
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
    requestList.textContent = '';
    
    if (requests.length === 0) {
        const noItemsMsg = document.createElement('p');
        noItemsMsg.className = 'no-items-message';
        noItemsMsg.textContent = 'No pending access requests.';
        requestList.appendChild(noItemsMsg);
        return;
    }
    
    // Add each request to the list
    requests.forEach(request => {
        // Validate the request data
        if (!request.ip || !isValidIPAddress(request.ip)) {
            return; // Skip invalid entries
        }
        
        const requestItem = document.createElement('div');
        requestItem.className = 'request-item';
        
        // Format date for display
        const requestDate = new Date(request.requestDate);
        const formattedDate = requestDate.toLocaleDateString() + ' ' + requestDate.toLocaleTimeString();
        
        // Create request info section
        const infoDiv = document.createElement('div');
        infoDiv.className = 'request-info';
        
        const nameP = document.createElement('p');
        const nameStrong = document.createElement('strong');
        nameStrong.textContent = sanitizeInput(request.name);
        nameP.appendChild(nameStrong);
        
        const ipP = document.createElement('p');
        ipP.textContent = `IP Address: ${sanitizeInput(request.ip)}`;
        
        const dateP = document.createElement('p');
        dateP.textContent = `Requested: ${formattedDate}`;
        
        infoDiv.appendChild(nameP);
        infoDiv.appendChild(ipP);
        infoDiv.appendChild(dateP);
        
        // Create actions section
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'request-actions';
        
        const approveBtn = document.createElement('button');
        approveBtn.className = 'admin-btn approve';
        approveBtn.textContent = 'Approve';
        approveBtn.dataset.ip = request.ip;
        approveBtn.dataset.name = request.name;
        
        const rejectBtn = document.createElement('button');
        rejectBtn.className = 'admin-btn reject';
        rejectBtn.textContent = 'Reject';
        rejectBtn.dataset.ip = request.ip;
        
        actionsDiv.appendChild(approveBtn);
        actionsDiv.appendChild(rejectBtn);
        
        // Add to request item
        requestItem.appendChild(infoDiv);
        requestItem.appendChild(actionsDiv);
        
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
    ipList.textContent = '';
    
    if (whitelist.length === 0) {
        const noItemsMsg = document.createElement('p');
        noItemsMsg.className = 'no-items-message';
        noItemsMsg.textContent = 'No whitelisted IP addresses.';
        ipList.appendChild(noItemsMsg);
        return;
    }
    
    // Add each IP to the list
    whitelist.forEach(entry => {
        // Validate the IP
        if (!entry.ip || !isValidIPAddress(entry.ip)) {
            return; // Skip invalid entries
        }
        
        const ipItem = document.createElement('div');
        ipItem.className = 'user-item';
        
        // Format date for display
        const addedDate = new Date(entry.addedDate);
        const formattedDate = addedDate.toLocaleDateString() + ' ' + addedDate.toLocaleTimeString();
        
        // Create user info section
        const infoDiv = document.createElement('div');
        infoDiv.className = 'user-info';
        
        const nameP = document.createElement('p');
        const nameStrong = document.createElement('strong');
        nameStrong.textContent = sanitizeInput(entry.name);
        nameP.appendChild(nameStrong);
        
        const ipP = document.createElement('p');
        ipP.textContent = `IP Address: ${sanitizeInput(entry.ip)}`;
        
        const dateP = document.createElement('p');
        dateP.textContent = `Added: ${formattedDate}`;
        
        const addedByP = document.createElement('p');
        addedByP.textContent = `Added by: ${sanitizeInput(entry.addedBy)}`;
        
        infoDiv.appendChild(nameP);
        infoDiv.appendChild(ipP);
        infoDiv.appendChild(dateP);
        infoDiv.appendChild(addedByP);
        
        // Create actions section
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'user-actions';
        
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'admin-btn delete';
        deleteBtn.textContent = 'Remove';
        deleteBtn.dataset.ip = entry.ip;
        
        actionsDiv.appendChild(deleteBtn);
        
        // Add to IP item
        ipItem.appendChild(infoDiv);
        ipItem.appendChild(actionsDiv);
        
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
        name: sanitizeInput(name),
        ip: ip,
        approved: true,
        addedBy: sanitizeInput(adminName),
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
        element.textContent = sanitizeInput(message);
        element.className = `auth-message ${sanitizeInput(type)}`;
        element.style.display = 'block';
        
        // Hide message after 5 seconds for success/info messages
        if (type === 'success' || type === 'info') {
            setTimeout(() => {
                element.style.display = 'none';
            }, 5000);
        }
    }
}
