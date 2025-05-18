// Main JavaScript for Discord Bot Controller

// Socket.io connection
let socket;
let currentServerId = null;

// DOM Elements
document.addEventListener('DOMContentLoaded', () => {
    initializeElements();
    initializeSocket();
    createParticles();
    setupEventListeners();
});

// Initialize DOM Elements
function initializeElements() {
    window.loginContainer = document.getElementById('loginContainer');
    window.serverSelection = document.getElementById('serverSelection');
    window.dashboard = document.getElementById('dashboard');
    window.nukeSections = document.getElementById('nukeSections');
    window.loginForm = document.getElementById('loginForm');
    window.tokenInput = document.getElementById('tokenInput');
    window.serversContainer = document.getElementById('serversContainer');
    window.serverNameDisplay = document.getElementById('serverName');
    window.serverMembersDisplay = document.getElementById('serverMembers');
    window.serverAvatar = document.getElementById('serverAvatar');
    window.alertContainer = document.getElementById('alertContainer');
    window.progressContainer = document.getElementById('progressContainer');
    window.progressBar = document.getElementById('progressBar');
    window.progressText = document.getElementById('progressText');
    window.roomsList = document.getElementById('roomsList');
    window.rolesList = document.getElementById('rolesList');
    window.nukeButton = document.getElementById('nukeButton');
    window.tabs = document.querySelectorAll('.tab');
    window.tabContents = document.querySelectorAll('.tab-content');
    window.fullNukeOptions = document.getElementById('fullNukeOptions');
}

// Create animated particles
function createParticles() {
    const particlesContainer = document.createElement('div');
    particlesContainer.className = 'particles';
    document.body.appendChild(particlesContainer);
    
    for (let i = 0; i < 30; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        particle.style.left = `${Math.random() * 100}%`;
        particle.style.top = `${Math.random() * 100}%`;
        particle.style.animationDuration = `${15 + Math.random() * 10}s`;
        particle.style.animationDelay = `${Math.random() * 5}s`;
        particlesContainer.appendChild(particle);
    }
}

// Initialize Socket.io
function initializeSocket() {
    socket = io();

    // Connection events
    socket.on('connect', () => {
        console.log('Connected to server');
        showAlert('تم الاتصال بالخادم بنجاح', 'success');
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
        
        // Request server info
        socket.emit('get_server_info');
        
        // Request rooms and roles
        socket.emit('get_rooms');
        socket.emit('get_roles');
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
    
    // Full nuke events
    socket.on('full_nuke_progress', (data) => {
        updateProgress(data.overall_progress, data.message);
    });
    
    socket.on('full_nuke_complete', () => {
        hideProgress();
        showAlert('تم تنفيذ النيوك الشامل بنجاح!', 'success');
        
        // Refresh data
        socket.emit('get_server_info');
        socket.emit('get_rooms');
        socket.emit('get_roles');
    });
}

// Setup Event Listeners
function setupEventListeners() {
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
    
    // Option toggles
    document.querySelectorAll('.option-toggle input').forEach(toggle => {
        toggle.addEventListener('change', function() {
            const optionId = this.getAttribute('data-option');
            const optionContent = document.getElementById(`${optionId}Content`);
            
            if (this.checked) {
                optionContent.classList.add('active');
            } else {
                optionContent.classList.remove('active');
            }
        });
    });
    
    // Avatar file input change
    if (document.getElementById('avatarFile')) {
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
    }
}

// Authentication
function authenticate(token) {
    showSpinner();
    socket.emit('authenticate', { token });
}

// Server Selection - Simplified and more robust
function selectServer(serverId) {
    showSpinner();
    currentServerId = serverId;
    
    // Simple, direct server selection
    socket.emit('select_server', { server_id: serverId });
}

// Show server selection screen
function showServerSelection(servers) {
    hideElement(loginContainer);
    showElement(serverSelection);
    
    // Clear previous servers
    serversContainer.innerHTML = '';
    
    // Add servers with animation delay
    servers.forEach((server, index) => {
        const serverCard = document.createElement('div');
        serverCard.className = 'server-card';
        serverCard.style.animationDelay = `${index * 0.1}s`;
        
        // Use default avatar if no icon
        const iconSrc = server.icon || 'static/img/default-avatar.png';
        
        serverCard.innerHTML = `
            <img src="${iconSrc}" alt="${server.name}" onerror="this.src='static/img/default-avatar.png'">
            <h3>${server.name}</h3>
            <p>${server.memberCount} عضو</p>
        `;
        
        // Add click event with visual feedback
        serverCard.addEventListener('click', () => {
            // Add visual selection effect
            document.querySelectorAll('.server-card').forEach(card => {
                card.classList.remove('selected');
            });
            serverCard.classList.add('selected');
            
            // Select server with slight delay for animation
            setTimeout(() => {
                selectServer(server.id);
            }, 300);
        });
        
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
    
    rooms.forEach((room, index) => {
        const roomItem = document.createElement('div');
        roomItem.className = 'list-item';
        roomItem.style.animationDelay = `${index * 0.05}s`;
        roomItem.innerHTML = `
            <span class="list-item-name">${room.name}</span>
            <div class="list-item-actions">
                <button class="btn btn-danger btn-sm btn-effect" onclick="deleteRoom('${room.id}')">حذف</button>
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
    
    roles.forEach((role, index) => {
        const roleItem = document.createElement('div');
        roleItem.className = 'list-item';
        roleItem.style.animationDelay = `${index * 0.05}s`;
        roleItem.innerHTML = `
            <span class="list-item-name" style="color: ${role.color}">${role.name}</span>
            <div class="list-item-actions">
                <button class="btn btn-danger btn-sm btn-effect" onclick="deleteRole('${role.id}')">حذف</button>
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

// Change all nicknames
function changeAllNicknames() {
    const nickname = document.getElementById('massNickname').value;
    
    if (!nickname) {
        showAlert('يرجى إدخال الاسم المستعار', 'warning');
        return;
    }
    
    showProgress();
    socket.emit('change_all_nicknames', { nickname });
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
    
    // Get all parameters from the full nuke options
    const options = {};
    
    // Rooms options
    if (document.getElementById('roomsOption').checked) {
        options.create_rooms = true;
        options.room_count = document.getElementById('fullNukeRoomCount').value || 10;
        options.room_name = document.getElementById('fullNukeRoomName').value || 'nuked';
        options.delete_old_rooms = document.getElementById('fullNukeDeleteOldRooms').checked;
    }
    
    // Roles options
    if (document.getElementById('rolesOption').checked) {
        options.create_roles = true;
        options.role_count = document.getElementById('fullNukeRoleCount').value || 10;
        options.role_name = document.getElementById('fullNukeRoleName').value || 'nuked';
        options.delete_old_roles = document.getElementById('fullNukeDeleteOldRoles').checked;
    }
    
    // Spam options
    if (document.getElementById('spamOption').checked) {
        options.spam_channels = true;
        options.channel_spam_message = document.getElementById('fullNukeChannelSpamMessage').value || 'SERVER NUKED!';
        options.message_count = document.getElementById('fullNukeMessageCount').value || 5;
        
        options.spam_dms = document.getElementById('fullNukeSpamDMs').checked;
        options.dm_spam_message = document.getElementById('fullNukeDMSpamMessage').value || 'SERVER NUKED!';
    }
    
    // Server settings options
    if (document.getElementById('serverOption').checked) {
        options.update_server = true;
        options.server_name = document.getElementById('fullNukeServerName').value || 'NUKED SERVER';
        
        options.kick_all = document.getElementById('fullNukeKickAll').checked;
    }
    
    // Nickname options
    if (document.getElementById('nicknamesOption').checked) {
        options.change_nicknames = true;
        options.nickname = document.getElementById('fullNukeNickname').value || 'nuked';
    }
    
    // Emit all operations at once
    socket.emit('execute_full_nuke', options);
}

// Show alert
function showAlert(message, type) {
    const alert = document.createElement('div');
    alert.className = `alert alert-${type}`;
    alert.textContent = message;
    
    alertContainer.innerHTML = '';
    alertContainer.appendChild(alert);
    
    // Add animation
    alert.style.animation = 'fadeInUp 0.5s';
    
    // Auto hide after 5 seconds
    setTimeout(() => {
        alert.style.animation = 'fadeOutUp 0.5s';
        setTimeout(() => {
            alert.remove();
        }, 500);
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

// Show/hide elements with animation
function showElement(element) {
    if (element) {
        element.style.display = 'block';
        element.classList.add('animated', 'fadeInUp');
        setTimeout(() => {
            element.classList.remove('animated', 'fadeInUp');
        }, 1000);
    }
}

function hideElement(element) {
    if (element) {
        element.classList.add('animated', 'fadeOutDown');
        setTimeout(() => {
            element.style.display = 'none';
            element.classList.remove('animated', 'fadeOutDown');
        }, 500);
    }
}

// Tab switching with animation
function switchTab(tabId) {
    tabs.forEach(tab => {
        tab.classList.remove('active');
    });
    
    tabContents.forEach(content => {
        content.classList.remove('active');
        content.style.animation = 'fadeOut 0.3s';
    });
    
    document.getElementById(tabId).classList.add('active');
    
    const activeContent = document.getElementById(`${tabId}Content`);
    setTimeout(() => {
        tabContents.forEach(content => {
            content.classList.remove('active');
            content.style.animation = '';
        });
        activeContent.classList.add('active');
        activeContent.style.animation = 'fadeIn 0.3s';
    }, 300);
}

// Logout
function logout() {
    socket.emit('logout');
    hideElement(dashboard);
    hideElement(serverSelection);
    hideElement(nukeSections);
    showElement(loginContainer);
    tokenInput.value = '';
}

// Add animation to buttons
document.addEventListener('DOMContentLoaded', () => {
    const buttons = document.querySelectorAll('.btn');
    buttons.forEach(button => {
        button.classList.add('btn-effect');
    });
});

// Add keyframe animations
const keyframeStyle = document.createElement('style');
keyframeStyle.innerHTML = `
@keyframes fadeOutUp {
  from {
    opacity: 1;
    transform: translateY(0);
  }
  to {
    opacity: 0;
    transform: translateY(-20px);
  }
}

@keyframes fadeOutDown {
  from {
    opacity: 1;
    transform: translateY(0);
  }
  to {
    opacity: 0;
    transform: translateY(20px);
  }
}

@keyframes fadeOut {
  from {
    opacity: 1;
  }
  to {
    opacity: 0;
  }
}
`;
document.head.appendChild(keyframeStyle);
