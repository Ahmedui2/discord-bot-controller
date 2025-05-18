// Main JavaScript for Discord Bot Controller

// Socket.io setup for real-time communication
let socket;

// DOM Elements
document.addEventListener('DOMContentLoaded', function() {
    // Initialize Socket.io connection
    initializeSocket();
    
    // Setup event listeners
    setupEventListeners();
    
    // Setup animations
    setupAnimations();
});

// Initialize Socket.io
function initializeSocket() {
    socket = io();
    
    // Connection events
    socket.on('connect', () => {
        console.log('Connected to server');
    });
    
    socket.on('disconnect', () => {
        console.log('Disconnected from server');
        showStatusMessage('Connection lost. Trying to reconnect...', 'error');
    });
    
    // Authentication events
    socket.on('auth_success', (data) => {
        hideElement('.login-container');
        showElement('.dashboard');
        showStatusMessage('Successfully connected to Discord Bot', 'success');
        
        // Populate servers
        if (data.servers && data.servers.length > 0) {
            populateServers(data.servers);
        }
    });
    
    socket.on('auth_error', (data) => {
        hideElement('.loading');
        showStatusMessage(data.message || 'Authentication failed. Please check your token.', 'error');
    });
    
    // Server events
    socket.on('server_selected', (data) => {
        showElement('.nuke-panel');
        showStatusMessage(`Server "${data.server_name}" selected`, 'info');
    });
    
    // Operation events
    socket.on('operation_progress', (data) => {
        updateProgressBar(data.progress, data.message);
    });
    
    socket.on('operation_complete', (data) => {
        completeProgressBar();
        showStatusMessage(data.message, 'success');
    });
    
    socket.on('operation_error', (data) => {
        showStatusMessage(data.message, 'error');
    });
    
    // Rooms events
    socket.on('rooms_list', (data) => {
        populateRooms(data.rooms);
    });
    
    // Roles events
    socket.on('roles_list', (data) => {
        populateRoles(data.roles);
    });
    
    // Server settings events
    socket.on('server_info', (data) => {
        updateServerInfo(data);
    });
}

// Setup event listeners
function setupEventListeners() {
    // Login form
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', function(e) {
            e.preventDefault();
            const tokenInput = document.getElementById('token-input');
            if (tokenInput && tokenInput.value.trim() !== '') {
                authenticateToken(tokenInput.value.trim());
            } else {
                showStatusMessage('Please enter a valid token', 'error');
            }
        });
    }
    
    // Server selection
    document.addEventListener('click', function(e) {
        if (e.target.closest('.server-card')) {
            const serverId = e.target.closest('.server-card').dataset.serverId;
            selectServer(serverId);
        }
    });
    
    // Nuke button
    const nukeBtn = document.getElementById('nuke-btn');
    if (nukeBtn) {
        nukeBtn.addEventListener('click', function() {
            toggleElement('.nuke-options');
        });
    }
    
    // Tab switching
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', function() {
            const tabId = this.dataset.tab;
            switchTab(tabId);
        });
    });
    
    // Rooms actions
    const createRoomsBtn = document.getElementById('create-rooms-btn');
    if (createRoomsBtn) {
        createRoomsBtn.addEventListener('click', function() {
            const count = document.getElementById('rooms-count').value;
            const name = document.getElementById('rooms-name').value;
            const deleteOld = document.getElementById('delete-old-rooms').checked;
            
            if (count && name) {
                createRooms(count, name, deleteOld);
            } else {
                showStatusMessage('Please fill in all fields', 'warning');
            }
        });
    }
    
    // Roles actions
    const createRolesBtn = document.getElementById('create-roles-btn');
    if (createRolesBtn) {
        createRolesBtn.addEventListener('click', function() {
            const count = document.getElementById('roles-count').value;
            const name = document.getElementById('roles-name').value;
            const deleteOld = document.getElementById('delete-old-roles').checked;
            
            if (count && name) {
                createRoles(count, name, deleteOld);
            } else {
                showStatusMessage('Please fill in all fields', 'warning');
            }
        });
    }
    
    // Spam actions
    const spamChannelsBtn = document.getElementById('spam-channels-btn');
    if (spamChannelsBtn) {
        spamChannelsBtn.addEventListener('click', function() {
            const message = document.getElementById('channel-message').value;
            const count = document.getElementById('channel-count').value;
            
            if (message && count) {
                spamChannels(message, count);
            } else {
                showStatusMessage('Please fill in all fields', 'warning');
            }
        });
    }
    
    const spamDMsBtn = document.getElementById('spam-dms-btn');
    if (spamDMsBtn) {
        spamDMsBtn.addEventListener('click', function() {
            const message = document.getElementById('dm-message').value;
            
            if (message) {
                spamDMs(message);
            } else {
                showStatusMessage('Please enter a message', 'warning');
            }
        });
    }
    
    // Server settings actions
    const updateServerBtn = document.getElementById('update-server-btn');
    if (updateServerBtn) {
        updateServerBtn.addEventListener('click', function() {
            const name = document.getElementById('server-name').value;
            updateServerSettings(name);
        });
    }
    
    const kickAllBtn = document.getElementById('kick-all-btn');
    if (kickAllBtn) {
        kickAllBtn.addEventListener('click', function() {
            if (confirm('Are you sure you want to kick all members?')) {
                kickAllMembers();
            }
        });
    }
    
    // Avatar upload
    const avatarInput = document.getElementById('avatar-input');
    const serverAvatar = document.querySelector('.server-avatar');
    
    if (serverAvatar) {
        serverAvatar.addEventListener('click', function() {
            if (avatarInput) {
                avatarInput.click();
            }
        });
    }
    
    if (avatarInput) {
        avatarInput.addEventListener('change', function() {
            if (this.files && this.files[0]) {
                uploadAvatar(this.files[0]);
            }
        });
    }
    
    // Logout button
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function() {
            logout();
        });
    }
}

// Setup animations
function setupAnimations() {
    // Add animation classes to elements
    document.querySelectorAll('.animate-on-load').forEach(el => {
        el.classList.add('animate-fadeIn');
    });
    
    // Nuke button pulse animation
    const nukeBtn = document.getElementById('nuke-btn');
    if (nukeBtn) {
        nukeBtn.addEventListener('mouseenter', function() {
            this.classList.add('animate-pulse');
        });
        
        nukeBtn.addEventListener('mouseleave', function() {
            this.classList.remove('animate-pulse');
        });
    }
    
    // Server cards hover effect
    document.querySelectorAll('.server-card').forEach(card => {
        card.addEventListener('mouseenter', function() {
            this.classList.add('animate-glow');
        });
        
        card.addEventListener('mouseleave', function() {
            this.classList.remove('animate-glow');
        });
    });
}

// Authentication functions
function authenticateToken(token) {
    showElement('.loading');
    hideStatusMessage();
    
    // Emit authentication event
    socket.emit('authenticate', { token: token });
}

function logout() {
    socket.emit('logout');
    showElement('.login-container');
    hideElement('.dashboard');
    hideElement('.nuke-panel');
    hideElement('.nuke-options');
    document.getElementById('token-input').value = '';
    showStatusMessage('Logged out successfully', 'info');
}

// Server functions
function populateServers(servers) {
    const serverGrid = document.querySelector('.server-grid');
    if (!serverGrid) return;
    
    serverGrid.innerHTML = '';
    
    servers.forEach(server => {
        const serverCard = document.createElement('div');
        serverCard.className = 'server-card animate-fadeIn';
        serverCard.dataset.serverId = server.id;
        
        let iconHtml = '';
        if (server.icon) {
            iconHtml = `<img src="${server.icon}" alt="${server.name}">`;
        } else {
            // Create initials for server without icon
            const initials = server.name.split(' ')
                .map(word => word[0])
                .join('')
                .substring(0, 2)
                .toUpperCase();
            iconHtml = initials;
        }
        
        serverCard.innerHTML = `
            <div class="server-icon">${iconHtml}</div>
            <div class="server-name">${server.name}</div>
            <div class="server-members">${server.memberCount} members</div>
        `;
        
        serverGrid.appendChild(serverCard);
    });
}

function selectServer(serverId) {
    // Remove selected class from all server cards
    document.querySelectorAll('.server-card').forEach(card => {
        card.classList.remove('selected');
    });
    
    // Add selected class to clicked server card
    const selectedCard = document.querySelector(`.server-card[data-server-id="${serverId}"]`);
    if (selectedCard) {
        selectedCard.classList.add('selected');
    }
    
    // Emit server selection event
    socket.emit('select_server', { server_id: serverId });
}

// Tab functions
function switchTab(tabId) {
    // Hide all tab contents
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    
    // Remove active class from all tabs
    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Show selected tab content
    const selectedContent = document.getElementById(`${tabId}-content`);
    if (selectedContent) {
        selectedContent.classList.add('active');
    }
    
    // Add active class to selected tab
    const selectedTab = document.querySelector(`.tab[data-tab="${tabId}"]`);
    if (selectedTab) {
        selectedTab.classList.add('active');
    }
    
    // Load tab-specific data
    if (tabId === 'rooms') {
        socket.emit('get_rooms');
    } else if (tabId === 'roles') {
        socket.emit('get_roles');
    } else if (tabId === 'server') {
        socket.emit('get_server_info');
    }
}

// Rooms functions
function populateRooms(rooms) {
    const roomsList = document.getElementById('rooms-list');
    if (!roomsList) return;
    
    roomsList.innerHTML = '';
    
    if (rooms.length === 0) {
        roomsList.innerHTML = '<p>No rooms found</p>';
        return;
    }
    
    rooms.forEach(room => {
        const roomItem = document.createElement('div');
        roomItem.className = 'role-item animate-fadeIn';
        roomItem.innerHTML = `
            <div class="role-name">${room.name}</div>
            <div class="role-actions">
                <button class="role-btn delete" data-room-id="${room.id}" title="Delete Room">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;
        
        roomsList.appendChild(roomItem);
    });
    
    // Add delete event listeners
    document.querySelectorAll('.role-btn.delete[data-room-id]').forEach(btn => {
        btn.addEventListener('click', function() {
            const roomId = this.dataset.roomId;
            deleteRoom(roomId);
        });
    });
}

function createRooms(count, name, deleteOld) {
    showStatusMessage('Creating rooms...', 'info');
    socket.emit('create_rooms', { count, name, delete_old: deleteOld });
}

function deleteRoom(roomId) {
    showStatusMessage('Deleting room...', 'info');
    socket.emit('delete_room', { room_id: roomId });
}

// Roles functions
function populateRoles(roles) {
    const rolesList = document.getElementById('roles-list');
    if (!rolesList) return;
    
    rolesList.innerHTML = '';
    
    if (roles.length === 0) {
        rolesList.innerHTML = '<p>No roles found</p>';
        return;
    }
    
    roles.forEach(role => {
        const roleItem = document.createElement('div');
        roleItem.className = 'role-item animate-fadeIn';
        roleItem.innerHTML = `
            <div class="role-color" style="background-color: ${role.color}"></div>
            <div class="role-name">${role.name}</div>
            <div class="role-actions">
                <button class="role-btn delete" data-role-id="${role.id}" title="Delete Role">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;
        
        rolesList.appendChild(roleItem);
    });
    
    // Add delete event listeners
    document.querySelectorAll('.role-btn.delete[data-role-id]').forEach(btn => {
        btn.addEventListener('click', function() {
            const roleId = this.dataset.roleId;
            deleteRole(roleId);
        });
    });
}

function createRoles(count, name, deleteOld) {
    showStatusMessage('Creating roles...', 'info');
    socket.emit('create_roles', { count, name, delete_old: deleteOld });
}

function deleteRole(roleId) {
    showStatusMessage('Deleting role...', 'info');
    socket.emit('delete_role', { role_id: roleId });
}

// Spam functions
function spamChannels(message, count) {
    showStatusMessage('Sending messages to channels...', 'info');
    socket.emit('spam_channels', { message, count });
}

function spamDMs(message) {
    showStatusMessage('Sending DMs to members...', 'info');
    socket.emit('spam_dms', { message });
}

// Server settings functions
function updateServerInfo(data) {
    const serverNameInput = document.getElementById('server-name');
    const serverAvatar = document.querySelector('.server-avatar img');
    
    if (serverNameInput) {
        serverNameInput.value = data.name || '';
    }
    
    if (serverAvatar && data.icon) {
        serverAvatar.src = data.icon;
    }
}

function updateServerSettings(name) {
    showStatusMessage('Updating server settings...', 'info');
    socket.emit('update_server', { name });
}

function uploadAvatar(file) {
    const formData = new FormData();
    formData.append('avatar', file);
    
    // Create a FileReader to preview the image
    const reader = new FileReader();
    reader.onload = function(e) {
        const serverAvatar = document.querySelector('.server-avatar img');
        if (serverAvatar) {
            serverAvatar.src = e.target.result;
        }
    };
    reader.readAsDataURL(file);
    
    // Send the file to the server
    showStatusMessage('Uploading avatar...', 'info');
    
    // Use fetch API to upload the file
    fetch('/upload_avatar', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showStatusMessage('Avatar uploaded successfully', 'success');
        } else {
            showStatusMessage(data.message || 'Failed to upload avatar', 'error');
        }
    })
    .catch(error => {
        showStatusMessage('Error uploading avatar', 'error');
        console.error('Error:', error);
    });
}

function kickAllMembers() {
    showStatusMessage('Kicking all members...', 'info');
    socket.emit('kick_all_members');
}

// UI Helper functions
function showElement(selector) {
    const element = document.querySelector(selector);
    if (element) {
        element.style.display = 'block';
    }
}

function hideElement(selector) {
    const element = document.querySelector(selector);
    if (element) {
        element.style.display = 'none';
    }
}

function toggleElement(selector) {
    const element = document.querySelector(selector);
    if (element) {
        if (element.style.display === 'none' || getComputedStyle(element).display === 'none') {
            element.style.display = 'block';
        } else {
            element.style.display = 'none';
        }
    }
}

function showStatusMessage(message, type) {
    const statusContainer = document.createElement('div');
    statusContainer.className = `status-message status-${type} animate-fadeIn`;
    statusContainer.textContent = message;
    
    // Remove any existing status messages
    document.querySelectorAll('.status-message').forEach(el => {
        el.remove();
    });
    
    // Add the new status message
    document.body.appendChild(statusContainer);
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
        statusContainer.classList.add('animate-fadeOut');
        setTimeout(() => {
            statusContainer.remove();
        }, 500);
    }, 5000);
}

function hideStatusMessage() {
    document.querySelectorAll('.status-message').forEach(el => {
        el.remove();
    });
}

function updateProgressBar(progress, message) {
    const progressBar = document.querySelector('.progress-bar');
    const progressText = document.querySelector('.progress-text');
    
    if (progressBar) {
        progressBar.style.width = `${progress}%`;
    }
    
    if (progressText && message) {
        progressText.textContent = message;
    }
}

function completeProgressBar() {
    const progressBar = document.querySelector('.progress-bar');
    const progressText = document.querySelector('.progress-text');
    
    if (progressBar) {
        progressBar.style.width = '100%';
    }
    
    if (progressText) {
        progressText.textContent = 'Operation completed';
    }
    
    // Reset after 3 seconds
    setTimeout(() => {
        if (progressBar) {
            progressBar.style.width = '0%';
        }
        
        if (progressText) {
            progressText.textContent = '';
        }
    }, 3000);
}
