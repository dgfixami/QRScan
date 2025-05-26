document.addEventListener('DOMContentLoaded', function() {
    // Initialize auth system
    initializeAuthSystem();
    
    // Get user's IP address
    getUserIP().then(ipAddress => {
        // Validate IP address format before storing
        if (!isValidIPAddress(ipAddress)) {
            console.error("Invalid IP address format:", ipAddress);
            ipAddress = "unknown";
        }
        
        // Store IP in session storage for use throughout the app
        sessionStorage.setItem('user_ip', ipAddress);
        
        // Handle admin login if on login page
        const loginForm = document.getElementById('login-form');
        if (loginForm) {
            // No longer need this as we're using Google login exclusively
            // Remove hardcoded admin credentials
        }

        // Check if we need to validate IP for non-admin pages
        if (window.location.pathname.endsWith('index.html') && !isAdminLoggedIn()) {
            // Check if IP is whitelisted
            if (!isIPWhitelisted(ipAddress)) {
                // Redirect to access request page if not whitelisted
                window.location.href = 'request-access.html';
            }
        }
        
        // Request access form handler - with input validation
        const requestForm = document.getElementById('request-form');
        if (requestForm) {
            // Show user's IP address in the form
            const ipDisplay = document.getElementById('user-ip');
            if (ipDisplay) {
                ipDisplay.textContent = sanitizeInput(ipAddress);
            }
            
            // Check for pending request when request-form page loads
            checkForPendingRequests(ipAddress);
            
            requestForm.addEventListener('submit', function(e) {
                e.preventDefault();
                const nameInput = document.getElementById('request-name');
                const name = nameInput.value.trim();
                
                // Frontend validation using pattern attribute
                if (!nameInput.checkValidity()) {
                    showMessage('request-message', 'Please enter a valid name (3-50 characters, letters, numbers, spaces, and ._- only)', 'error');
                    return;
                }
                
                // Submit access request with sanitized name and IP address
                submitAccessRequest(sanitizeInput(name), ipAddress);
                
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
            
            // Add IP form with validation
            const addIPForm = document.getElementById('add-ip-form');
            if (addIPForm) {
                addIPForm.addEventListener('submit', function(e) {
                    e.preventDefault();
                    
                    const nameInput = document.getElementById('new-ip-name');
                    const ipInput = document.getElementById('new-ip-address');
                    
                    // Use HTML5 validation API
                    if (!nameInput.checkValidity()) {
                        alert('Please enter a valid name');
                        return;
                    }
                    
                    if (!ipInput.checkValidity()) {
                        alert('Please enter a valid IP address');
                        return;
                    }
                    
                    const name = sanitizeInput(nameInput.value.trim());
                    const ipAddress = sanitizeInput(ipInput.value.trim());
                    
                    // Double-check IP format with our function
                    if (!isValidIPAddress(ipAddress)) {
                        alert('Please enter a valid IPv4 address');
                        return;
                    }
                    
                    // Get current admin info for logging
                    const currentAdmin = JSON.parse(localStorage.getItem('qrscan_current_admin'));
                    const adminName = currentAdmin ? sanitizeInput(currentAdmin.name) : 'Admin';
                    
                    // Add new IP to whitelist
                    addIPToWhitelist({
                        name: name,
                        ip: ipAddress,
                        approved: true,
                        addedBy: adminName,
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
    if (responsePayload.hd === 'fixami.com' && 
        responsePayload.email && 
        responsePayload.email.endsWith('@fixami.com')) {
        
        // Sanitize admin data
        const adminData = {
            name: sanitizeInput(responsePayload.name),
            email: sanitizeInput(responsePayload.email),
            picture: sanitizeInput(responsePayload.picture),
            hd: sanitizeInput(responsePayload.hd)
        };
        
        localStorage.setItem('qrscan_current_admin', JSON.stringify(adminData));
        
        // Generate new CSRF token on login
        const csrfToken = generateCSRFToken();
        localStorage.setItem('qrscan_csrf_token', csrfToken);
        
        // Redirect to admin panel
        window.location.href = 'admin.html';
    } else {
        // Show unauthorized message with domain requirement
        showMessage('login-message', 'Only users with a Fixami.com Google Workspace account can access the admin panel.', 'error');
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

// Initialize the authentication system - remove hardcoded admin credentials
function initializeAuthSystem() {
    // Check if admin exists in localStorage (don't create default admin)
    let admins = JSON.parse(localStorage.getItem('qrscan_admins'));
    
    // If no admins array exists, create an empty one
    if (!admins) {
        admins = [];
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
    
    // Generate CSRF token if one doesn't exist
    if (!localStorage.getItem('qrscan_csrf_token')) {
        const csrfToken = generateCSRFToken();
        localStorage.setItem('qrscan_csrf_token', csrfToken);
    }
}

// Check if a user is admin and currently logged in - add email domain check
function isAdminLoggedIn() {
    const currentAdmin = JSON.parse(localStorage.getItem('qrscan_current_admin'));
    
    if (!currentAdmin) {
        return false;
    }
    
    // Check if the user belongs to fixami.com domain using hd property
    // Also check if email exists and matches allowed patterns
    return currentAdmin.hd === 'fixami.com' &&
           currentAdmin.email && 
           currentAdmin.email.endsWith('@fixami.com');
}

// Check for pending access requests
function checkForPendingRequests(ipAddress) {
    const requests = JSON.parse(localStorage.getItem('qrscan_access_requests')) || [];
    const existingRequest = requests.find(r => r.ip === ipAddress);
    
    if (existingRequest) {
        // Show "check status" message with timestamp
        const requestDate = new Date(existingRequest.requestDate);
        const formattedDate = requestDate.toLocaleDateString() + ' ' + requestDate.toLocaleTimeString();
        
        const statusElement = document.getElementById('request-status');
        if (statusElement) {
            // Use DOM methods instead of innerHTML
            statusElement.innerHTML = ''; // Clear existing content
            
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
            
            // Disable the input fields
            const inputs = requestForm.querySelectorAll('input');
            inputs.forEach(input => {
                input.disabled = true;
            });
        }
    }
}

// Check if an IP is whitelisted
function isIPWhitelisted(ipAddress) {
    const whitelist = JSON.parse(localStorage.getItem('qrscan_ip_whitelist')) || [];
    return whitelist.some(entry => entry.ip === ipAddress && entry.approved);
}

// Submit access request with name and IP - add input validation
function submitAccessRequest(name, ipAddress) {
    // Sanitize inputs
    const sanitizedName = sanitizeInput(name);
    
    // Validate IP
    if (!isValidIPAddress(ipAddress)) {
        showMessage('request-message', 'Invalid IP address format', 'error');
        return false;
    }
    
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
            // Use DOM methods instead of innerHTML
            statusElement.innerHTML = ''; // Clear existing content
            
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
            
            // Disable the input fields
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
    
    // Add new request with sanitized name
    requests.push({
        name: sanitizedName,
        ip: ipAddress,
        requestDate: new Date().toISOString()
    });
    
    localStorage.setItem('qrscan_access_requests', JSON.stringify(requests));
    
    // Update UI to show pending state using DOM methods
    const statusElement = document.getElementById('request-status');
    if (statusElement) {
        const requestDate = new Date();
        const formattedDate = requestDate.toLocaleDateString() + ' ' + requestDate.toLocaleTimeString();
        
        // Use DOM methods instead of innerHTML
        statusElement.innerHTML = ''; // Clear existing content
        
        const pendingDiv = document.createElement('div');
        pendingDiv.className = 'pending-request';
        
        const submittedPara = document.createElement('p');
        submittedPara.textContent = `Your request was submitted on ${formattedDate}`;
        
        const waitPara = document.createElement('p');
        waitPara.textContent = 'Please wait for an administrator to review your request.';
        
        pendingDiv.appendChild(submittedPara);
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

// Load access requests for admin panel - use DOM methods to prevent XSS
function loadAccessRequests() {
    const requestList = document.getElementById('request-list');
    const requests = JSON.parse(localStorage.getItem('qrscan_access_requests')) || [];
    
    // Clear current list
    requestList.innerHTML = '';
    
    if (requests.length === 0) {
        const noItemsMessage = document.createElement('p');
        noItemsMessage.className = 'no-items-message';
        noItemsMessage.textContent = 'No pending access requests.';
        requestList.appendChild(noItemsMessage);
        return;
    }
    
    // Add each request to the list using DOM methods
    requests.forEach(request => {
        // Create elements using DOM methods to prevent XSS
        const requestItem = document.createElement('div');
        requestItem.className = 'request-item';
        
        // Format date for display
        const requestDate = new Date(request.requestDate);
        const formattedDate = requestDate.toLocaleDateString() + ' ' + requestDate.toLocaleTimeString();
        
        // Create info div with DOM methods
        const infoDiv = document.createElement('div');
        infoDiv.className = 'request-info';
        
        const namePara = document.createElement('p');
        const nameStrong = document.createElement('strong');
        nameStrong.textContent = sanitizeInput(request.name);
        namePara.appendChild(nameStrong);
        
        const ipPara = document.createElement('p');
        ipPara.textContent = 'IP Address: ' + sanitizeInput(request.ip);
        
        const datePara = document.createElement('p');
        datePara.textContent = 'Requested: ' + formattedDate;
        
        infoDiv.appendChild(namePara);
        infoDiv.appendChild(ipPara);
        infoDiv.appendChild(datePara);
        
        // Create actions div with DOM methods
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'request-actions';
        
        const approveBtn = document.createElement('button');
        approveBtn.className = 'admin-btn approve';
        approveBtn.dataset.ip = request.ip;
        approveBtn.dataset.name = request.name;
        approveBtn.textContent = 'Approve';
        
        const rejectBtn = document.createElement('button');
        rejectBtn.className = 'admin-btn reject';
        rejectBtn.dataset.ip = request.ip;
        rejectBtn.textContent = 'Reject';
        
        actionsDiv.appendChild(approveBtn);
        actionsDiv.appendChild(rejectBtn);
        
        // Assemble the full item
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

// Update loadWhitelistedIPs to use DOM methods to prevent XSS
function loadWhitelistedIPs() {
    const ipList = document.getElementById('ip-list');
    const whitelist = JSON.parse(localStorage.getItem('qrscan_ip_whitelist')) || [];
    
    // Clear current list
    ipList.innerHTML = '';
    
    if (whitelist.length === 0) {
        const noItemsMessage = document.createElement('p');
        noItemsMessage.className = 'no-items-message';
        noItemsMessage.textContent = 'No whitelisted IP addresses.';
        ipList.appendChild(noItemsMessage);
        return;
    }
    
    // Add each IP to the list with DOM methods to prevent XSS
    whitelist.forEach(entry => {
        // Create elements using DOM methods
        const ipItem = document.createElement('div');
        ipItem.className = 'user-item';
        
        // Format date for display
        const addedDate = new Date(entry.addedDate);
        const formattedDate = addedDate.toLocaleDateString() + ' ' + addedDate.toLocaleTimeString();
        
        // Create info div with DOM methods
        const infoDiv = document.createElement('div');
        infoDiv.className = 'user-info';
        
        const namePara = document.createElement('p');
        const nameStrong = document.createElement('strong');
        nameStrong.textContent = sanitizeInput(entry.name);
        namePara.appendChild(nameStrong);
        
        const ipPara = document.createElement('p');
        ipPara.textContent = 'IP Address: ' + sanitizeInput(entry.ip);
        
        const datePara = document.createElement('p');
        datePara.textContent = 'Added: ' + formattedDate;
        
        const addedByPara = document.createElement('p');
        addedByPara.textContent = 'Added by: ' + sanitizeInput(entry.addedBy);
        
        infoDiv.appendChild(namePara);
        infoDiv.appendChild(ipPara);
        infoDiv.appendChild(datePara);
        infoDiv.appendChild(addedByPara);
        
        // Create actions div with DOM methods
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'user-actions';
        
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'admin-btn delete';
        deleteBtn.dataset.ip = entry.ip;
        deleteBtn.textContent = 'Remove';
        
        actionsDiv.appendChild(deleteBtn);
        
        // Assemble the full item
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
    // Validate IP
    if (!isValidIPAddress(ip)) {
        alert('Invalid IP address format');
        return false;
    }
    
    // Sanitize input
    const safeName = sanitizeInput(name);
    const safeIP = sanitizeInput(ip);
    
    const requests = JSON.parse(localStorage.getItem('qrscan_access_requests')) || [];
    const whitelist = JSON.parse(localStorage.getItem('qrscan_ip_whitelist')) || [];
    
    // Find the request
    const requestIndex = requests.findIndex(r => r.ip === safeIP);
    if (requestIndex === -1) return false;
    
    // Get admin info
    const currentAdmin = JSON.parse(localStorage.getItem('qrscan_current_admin'));
    const adminName = currentAdmin ? sanitizeInput(currentAdmin.name) : 'Admin';
    
    // Create new whitelist entry
    const newEntry = {
        name: safeName,
        ip: safeIP,
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
    // Validate and sanitize IP
    if (!isValidIPAddress(ip)) {
        alert('Invalid IP address format');
        return false;
    }
    
    const safeIP = sanitizeInput(ip);
    const requests = JSON.parse(localStorage.getItem('qrscan_access_requests')) || [];
    
    // Find and remove the request
    const requestIndex = requests.findIndex(r => r.ip === safeIP);
    if (requestIndex === -1) return false;
    
    requests.splice(requestIndex, 1);
    
    // Save changes
    localStorage.setItem('qrscan_access_requests', JSON.stringify(requests));
    
    // Refresh list
    loadAccessRequests();
    
    return true;
}

// Add IP directly to whitelist - add input validation
function addIPToWhitelist(entry) {
    // Validate IP format
    if (!isValidIPAddress(entry.ip)) {
        alert('Invalid IP address format');
        return false;
    }
    
    // Sanitize name and addedBy
    entry.name = sanitizeInput(entry.name);
    entry.addedBy = sanitizeInput(entry.addedBy);
    entry.ip = sanitizeInput(entry.ip);
    
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
    // Validate IP
    if (!isValidIPAddress(ip)) {
        alert('Invalid IP address format');
        return false;
    }
    
    const safeIP = sanitizeInput(ip);
    const whitelist = JSON.parse(localStorage.getItem('qrscan_ip_whitelist')) || [];
    
    // Find and remove the IP
    const ipIndex = whitelist.findIndex(e => e.ip === safeIP);
    if (ipIndex === -1) return false;
    
    whitelist.splice(ipIndex, 1);
    
    // Save changes
    localStorage.setItem('qrscan_ip_whitelist', JSON.stringify(whitelist));
    
    // Refresh list
    loadWhitelistedIPs();
    
    return true;
}

// Helper to show messages - update to prevent XSS
function showMessage(elementId, message, type) {
    const element = document.getElementById(elementId);
    if (element) {
        // Sanitize message before setting content
        element.textContent = sanitizeInput(message);
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

// Helper function to decode JWT token
function decodeJwtResponse(token) {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
    
    return JSON.parse(jsonPayload);
}
