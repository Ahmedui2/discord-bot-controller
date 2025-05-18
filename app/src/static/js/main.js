// Main JavaScript for Discord Bot Controller

// Socket.io connection
let socket;
let currentServerId = null;

// DOM Elements
const loginContainer = document.getElementById('loginContainer');
const serverSelection = document.getElementById('serverSelection');
const dashboard = document.getElementById('dashboard');
const nukeSections = document.getElementById('nukeSections');
const loginForm = document.getElementById('loginForm');
const tokenInput = document.getElementById('tokenInput');
const serversContainer = document.getElementById('serversContainer');
const serverNameDisplay = document.getElementById('serverName');
const serverMembersDisplay = document.getElementById('serverMembers');
const serverAvatar = document.getElementById('serverAvatar');
const alertContainer = document.getElementById('alertContainer');
const progressContainer = document.getElementById('progressContainer');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');
const roomsList = document.getElementById('roomsList');
const rolesList = document.getElementById('rolesList');
const nukeButton = document.getElementById('nukeButton');
const tabs = document.querySelectorAll('.tab');
const tabContents = document.querySelectorAll('.tab-content');

// Initialize Socket.io
function initializeSocket() {
    socket = io();

    // Connection events
    socket.on('connect', () => {
        console.log('Connected to server');
    });

    socket.on('disconnect', () => {
        console.log('Disconnected from server');
        showAlert('تم قطع الاتصال بالخادم. يرجى تحديث الصفحة والمحاولة مرة أخرى.', 'danger');
    });

    // Authentication events
    socket.on('auth_success', (data) => {
        hideSpinner();
        showServerSelection(data.servers);
    });

    socket.on('auth_error', (data) => {
        hideSpinner();
        showAlert(data.message || 'فشل في المصادقة. يرجى التحقق من التوكن والمحاولة مرة أخرى.', 'danger');
    });

    // Server events
    socket.on('server_selected', (data) => {
        serverNameDisplay.textContent = data.server_name;
        hideElement(serverSelection);
        showElement(dashboard);
        showElement(nukeButton);
    });

    socket.on('server_info', (data) => {
        serverNameDisplay.textContent = data.name;
        serverMembersDisplay.textContent = `${data.memberCount} عضو`;
        if (data.icon) {
            serverAvatar.src = data.icon;
        } else {
            serverAvatar.src = 'static/img/default-avatar.png';
        }
    });

    // Rooms and roles events
    socket.on('rooms_list', (data) => {
        updateRoomsList(data.rooms);
    });

    socket.on('roles_list', (data) => {
        updateRolesList(data.roles);
    });

    // Operation events
    socket.on('operation_progress', (data) => {
        updateProgress(data.progress, data.message);
    });

    socket.on('operation_complete', (data) => {
        hideProgress();
        showAlert(data.message, 'success');
    });

    socket.on('operation_error', (data) => {
        hideProgress();
        showAlert(data.message, 'danger');
    });
}

// Authentication
function authenticate(token) {
    showSpinner();
    socket.emit('authenticate', { token });
}

// Server Selection
function selectServer(serverId) {
    showSpinner();
    currentServerId = serverId;
    socket.emit('select_server', { server_id: serverId });
    
    // Request server info
    socket.emit('get_server_info');
    
    // Request rooms and roles
    socket.emit('get_rooms');
    socket.emit('get_roles');
}

// Show server selection screen
function showServerSelection(servers) {
    hideElement(loginContainer);
    showElement(serverSelection);
    
    // Clear previous servers
    serversContainer.innerHTML = '';
    
    // Add servers
    servers.forEach(server => {
        const serverCard = document.createElement('div');
        serverCard.className = 'server-card animated fadeInUp';
        serverCard.innerHTML = `
            <img src="${server.icon || 'static/img/default-avatar.png'}" alt="${server.name}">
            <h3>${server.name}</h3>
            <p>${server.memberCount} عضو</p>
        `;
        serverCard.addEventListener('click', () => selectServer(server.id));
        serversContainer.appendChild(serverCard);
    });
}

// Update rooms list
function updateRoomsList(rooms) {
    roomsList.innerHTML = '';
    
    if (rooms.length === 0) {
        roomsList.innerHTML = '<p>لا توجد رومات</p>';
        return;
    }
    
    rooms.forEach(room => {
        const roomItem = document.createElement('div');
        roomItem.className = 'list-item';
        roomItem.innerHTML = `
            <span class="list-item-name">${room.name}</span>
            <div class="list-item-actions">
                <button class="btn btn-danger btn-sm" onclick="deleteRoom('${room.id}')">حذف</button>
            </div>
        `;
        roomsList.appendChild(roomItem);
    });
}

// Update roles list
function updateRolesList(roles) {
    rolesList.innerHTML = '';
    
    if (roles.length === 0) {
        rolesList.innerHTML = '<p>لا توجد رولات</p>';
        return;
    }
    
    roles.forEach(role => {
        const roleItem = document.createElement('div');
        roleItem.className = 'list-item';
        roleItem.innerHTML = `
            <span class="list-item-name" style="color: ${role.color}">${role.name}</span>
            <div class="list-item-actions">
                <button class="btn btn-danger btn-sm" onclick="deleteRole('${role.id}')">حذف</button>
            </div>
        `;
        rolesList.appendChild(roleItem);
    });
}

// Create rooms
function createRooms() {
    const count = document.getElementById('roomCount').value;
    const name = document.getElementById('roomName').value;
    const deleteOld = document.getElementById('deleteOldRooms').checked;
    
    if (!count || !name) {
        showAlert('يرجى ملء جميع الحقول', 'warning');
        return;
    }
    
    showProgress();
    socket.emit('create_rooms', { count, name, delete_old: deleteOld });
}

// Delete room
function deleteRoom(roomId) {
    showProgress();
    socket.emit('delete_room', { room_id: roomId });
}

// Create roles
function createRoles() {
    const count = document.getElementById('roleCount').value;
    const name = document.getElementById('roleName').value;
    const deleteOld = document.getElementById('deleteOldRoles').checked;
    
    if (!count || !name) {
        showAlert('يرجى ملء جميع الحقول', 'warning');
        return;
    }
    
    showProgress();
    socket.emit('create_roles', { count, name, delete_old: deleteOld });
}

// Delete role
function deleteRole(roleId) {
    showProgress();
    socket.emit('delete_role', { role_id: roleId });
}

// Spam channels
function spamChannels() {
    const message = document.getElementById('channelSpamMessage').value;
    const count = document.getElementById('messageCount').value;
    
    if (!message || !count) {
        showAlert('يرجى ملء جميع الحقول', 'warning');
        return;
    }
    
    showProgress();
    socket.emit('spam_channels', { message, count });
}

// Spam DMs
function spamDMs() {
    const message = document.getElementById('dmSpamMessage').value;
    
    if (!message) {
        showAlert('يرجى إدخال رسالة', 'warning');
        return;
    }
    
    showProgress();
    socket.emit('spam_dms', { message });
}

// Update server
function updateServer() {
    const name = document.getElementById('serverNameInput').value;
    
    if (!name) {
        showAlert('يرجى إدخال اسم السيرفر', 'warning');
        return;
    }
    
    showProgress();
    socket.emit('update_server', { name });
}

// Kick all members
function kickAllMembers() {
    if (confirm('هل أنت متأكد من طرد جميع الأعضاء؟')) {
        showProgress();
        socket.emit('kick_all_members');
    }
}

// Upload avatar
function uploadAvatar() {
    const fileInput = document.getElementById('avatarFile');
    const file = fileInput.files[0];
    
    if (!file) {
        showAlert('يرجى اختيار صورة', 'warning');
        return;
    }
    
    const formData = new FormData();
    formData.append('avatar', file);
    
    showProgress();
    
    fetch('/upload_avatar', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        hideProgress();
        if (data.success) {
            showAlert('تم رفع الصورة بنجاح', 'success');
            socket.emit('get_server_info');
        } else {
            showAlert(data.message || 'فشل في رفع الصورة', 'danger');
        }
    })
    .catch(error => {
        hideProgress();
        showAlert('حدث خطأ أثناء رفع الصورة', 'danger');
        console.error('Error:', error);
    });
}

// Execute full nuke (all operations in parallel)
function executeFullNuke() {
    if (!confirm('هل أنت متأكد من تنفيذ النيوك الشامل؟ هذا سيقوم بتنفيذ جميع العمليات دفعة واحدة!')) {
        return;
    }
    
    showElement(nukeSections);
    showProgress();
    
    // Get all parameters
    const roomCount = document.getElementById('roomCount').value || 10;
    const roomName = document.getElementById('roomName').value || 'nuked';
    const deleteOldRooms = true;
    
    const roleCount = document.getElementById('roleCount').value || 10;
    const roleName = document.getElementById('roleName').value || 'nuked';
    const deleteOldRoles = true;
    
    const channelSpamMessage = document.getElementById('channelSpamMessage').value || 'SERVER NUKED!';
    const messageCount = document.getElementById('messageCount').value || 5;
    
    const dmSpamMessage = document.getElementById('dmSpamMessage').value || 'SERVER NUKED!';
    
    const serverName = document.getElementById('serverNameInput').value || 'NUKED SERVER';
    
    // Emit all operations at once
    socket.emit('execute_full_nuke', {
        room_count: roomCount,
        room_name: roomName,
        delete_old_rooms: deleteOldRooms,
        role_count: roleCount,
        role_name: roleName,
        delete_old_roles: deleteOldRoles,
        channel_spam_message: channelSpamMessage,
        message_count: messageCount,
        dm_spam_message: dmSpamMessage,
        server_name: serverName,
        kick_all: true
    });
    
    // Listen for full nuke progress
    socket.on('full_nuke_progress', (data) => {
        updateProgress(data.overall_progress, data.message);
    });
    
    // Listen for full nuke completion
    socket.on('full_nuke_complete', () => {
        hideProgress();
        showAlert('تم تنفيذ النيوك الشامل بنجاح!', 'success');
        
        // Refresh data
        socket.emit('get_server_info');
        socket.emit('get_rooms');
        socket.emit('get_roles');
    });
}

// Show alert
function showAlert(message, type) {
    const alert = document.createElement('div');
    alert.className = `alert alert-${type}`;
    alert.textContent = message;
    
    alertContainer.innerHTML = '';
    alertContainer.appendChild(alert);
    
    // Auto hide after 5 seconds
    setTimeout(() => {
        alert.remove();
    }, 5000);
}

// Show/hide spinner
function showSpinner() {
    const spinner = document.createElement('div');
    spinner.className = 'spinner';
    document.body.appendChild(spinner);
}

function hideSpinner() {
    const spinner = document.querySelector('.spinner');
    if (spinner) {
        spinner.remove();
    }
}

// Show/hide progress
function showProgress() {
    progressContainer.style.display = 'block';
    progressBar.style.width = '0%';
    progressText.textContent = 'جاري التنفيذ...';
}

function hideProgress() {
    progressContainer.style.display = 'none';
}

function updateProgress(percent, message) {
    progressBar.style.width = `${percent}%`;
    progressText.textContent = message || `${percent}%`;
}

// Show/hide elements
function showElement(element) {
    if (element) {
        element.style.display = 'block';
    }
}

function hideElement(element) {
    if (element) {
        element.style.display = 'none';
    }
}

// Tab switching
function switchTab(tabId) {
    tabs.forEach(tab => {
        tab.classList.remove('active');
    });
    
    tabContents.forEach(content => {
        content.classList.remove('active');
    });
    
    document.getElementById(tabId).classList.add('active');
    document.getElementById(`${tabId}Content`).classList.add('active');
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    // Initialize Socket.io
    initializeSocket();
    
    // Login form submission
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const token = tokenInput.value.trim();
        
        if (!token) {
            showAlert('يرجى إدخال التوكن', 'warning');
            return;
        }
        
        authenticate(token);
    });
    
    // Nuke button click
    nukeButton.addEventListener('click', () => {
        if (nukeSections.style.display === 'block') {
            hideElement(nukeSections);
        } else {
            showElement(nukeSections);
            // Set default active tab
            switchTab('roomsTab');
        }
    });
    
    // Tab switching
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            switchTab(tab.id);
        });
    });
    
    // Avatar file input change
    document.getElementById('avatarFile').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                document.getElementById('currentAvatar').src = e.target.result;
            };
            reader.readAsDataURL(file);
        }
    });
});

// Logout
function logout() {
    socket.emit('logout');
    hideElement(dashboard);
    hideElement(serverSelection);
    hideElement(nukeSections);
    showElement(loginContainer);
    tokenInput.value = '';
}
