// WhatsApp Blast Dashboard - Main JavaScript
// ==========================================

const API_BASE = '/api';
let token = localStorage.getItem('token');
let socket = null;

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();
    initEventListeners();
    checkAuth();
});

// Check authentication
function checkAuth() {
    if (token) {
        showDashboard();
        initSocket();
        loadDashboard();
    } else {
        showLogin();
    }
}

// Show login page
function showLogin() {
    document.getElementById('loginPage').classList.remove('hidden');
    document.getElementById('dashboardPage').classList.add('hidden');
}

// Show dashboard
function showDashboard() {
    document.getElementById('loginPage').classList.add('hidden');
    document.getElementById('dashboardPage').classList.remove('hidden');
}

// Initialize Socket.io
function initSocket() {
    socket = io();
    
    socket.on('connect', () => {
        console.log('Socket connected');
    });
    
    socket.on('whatsapp:status', (data) => {
        updateWhatsAppStatus(data);
    });
    
    socket.on('wa-error', (data) => {
        // Handle WhatsApp specific errors like conflict
        showToast(data.message, 'error', 10000);
        if (data.type === 'conflict') {
            // Show special UI for conflict
            document.getElementById('waStatusBadge').className = 'px-3 py-1 rounded-full text-sm font-semibold bg-red-100 text-red-800';
            document.getElementById('waStatusBadge').textContent = 'Conflict - Tunggu 30 detik';
        }
    });
    
    socket.on('contact:validated', (data) => {
        showToast(`Kontak ${data.contactId} divalidasi: ${data.registered ? 'Terdaftar' : 'Tidak Terdaftar'}`, data.registered ? 'success' : 'warning');
        if (currentPage === 'contacts') loadContacts();
    });
    
    socket.on('blast:log', (data) => {
        if (currentPage === 'blast') loadCampaigns();
        if (currentPage === 'dashboard') {
            loadDashboard();
        }
    });
    
    socket.on('blast:campaign', (data) => {
        if (currentPage === 'blast') loadCampaigns();
        if (currentPage === 'dashboard') {
            loadDashboard();
        }
    });
}

// Initialize event listeners
function initEventListeners() {
    // Login form
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    
    // Logout button
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);
    
    // Sidebar navigation
    document.querySelectorAll('.sidebar-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const page = link.dataset.page;
            navigateTo(page);
        });
    });
    
    // WhatsApp buttons
    document.getElementById('btnScanQR').addEventListener('click', handleScanQR);
    document.getElementById('btnDisconnect').addEventListener('click', handleDisconnect);
    document.getElementById('btnRefresh').addEventListener('click', handleRefreshWA);
    
    // Contact buttons
    document.getElementById('btnAddContact').addEventListener('click', () => openContactModal());
    document.getElementById('btnImportContacts').addEventListener('click', () => openModal('importModal'));
    document.getElementById('btnValidateAll').addEventListener('click', handleValidateAll);
    document.getElementById('searchContacts').addEventListener('input', debounce(loadContacts, 500));
    document.getElementById('filterGroup').addEventListener('change', loadContacts);
    document.getElementById('filterWaStatus').addEventListener('change', loadContacts);
    
    // Group buttons
    document.getElementById('btnAddGroup').addEventListener('click', () => openGroupModal());
    
    // Template buttons
    document.getElementById('btnAddTemplate').addEventListener('click', () => openTemplateModal());
    
    // Forms
    document.getElementById('contactForm').addEventListener('submit', handleContactSubmit);
    document.getElementById('importForm').addEventListener('submit', handleImport);
    document.getElementById('groupForm').addEventListener('submit', handleGroupSubmit);
    document.getElementById('templateForm').addEventListener('submit', handleTemplateSubmit);
    document.getElementById('blastForm').addEventListener('submit', handleBlastSubmit);
}

// ===== API HELPERS =====
async function apiCall(endpoint, options = {}) {
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };
    
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    
    try {
        const response = await fetch(`${API_BASE}${endpoint}`, {
            ...options,
            headers
        });
        
        const data = await response.json();
        
        // Only logout on 401 if not a login request
        if (response.status === 401 && !endpoint.includes('/auth/login')) {
            handleLogout();
            throw new Error('Session expired');
        }
        
        if (!response.ok) {
            throw new Error(data.message || 'API Error');
        }
        
        return data;
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
}

async function apiUpload(endpoint, formData) {
    try {
        const response = await fetch(`${API_BASE}${endpoint}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.message || 'Upload Error');
        }
        
        return data;
    } catch (error) {
        console.error('Upload Error:', error);
        throw error;
    }
}

// ===== AUTH =====
async function handleLogin(e) {
    e.preventDefault();
    
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const errorEl = document.getElementById('loginError');
    
    try {
        const data = await apiCall('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });
        
        token = data.data.token;
        localStorage.setItem('token', token);
        
        document.getElementById('userNameDisplay').textContent = data.data.user.name;
        
        showDashboard();
        initSocket();
        loadDashboard();
        
    } catch (error) {
        errorEl.textContent = error.message;
        errorEl.classList.remove('hidden');
    }
}

function handleLogout() {
    token = null;
    localStorage.removeItem('token');
    stopCountdownTimer();
    if (socket) socket.disconnect();
    showLogin();
}

// ===== NAVIGATION =====
let currentPage = 'dashboard';

function navigateTo(page) {
    currentPage = page;
    
    // Update sidebar
    document.querySelectorAll('.sidebar-link').forEach(link => {
        link.classList.remove('active');
        if (link.dataset.page === page) {
            link.classList.add('active');
        }
    });
    
    // Update title
    const titles = {
        dashboard: 'Dashboard',
        whatsapp: 'WhatsApp Connection',
        contacts: 'Manajemen Kontak',
        groups: 'Grup Kontak',
        templates: 'Template Pesan',
        blast: 'Blast Message'
    };
    document.getElementById('pageTitle').textContent = titles[page] || page;
    
    // Show page
    document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
    document.getElementById(`page-${page}`).classList.remove('hidden');
    
    // Load page data
    switch (page) {
        case 'dashboard':
            loadDashboard();
            break;
        case 'whatsapp':
            loadWhatsAppStatus();
            break;
        case 'contacts':
            loadContacts();
            loadGroupsForFilter();
            break;
        case 'groups':
            loadGroups();
            break;
        case 'templates':
            loadTemplates();
            break;
        case 'blast':
            loadBlastData();
            break;
    }
    
    lucide.createIcons();
}

// ===== DASHBOARD =====
let activityPage = 1;
const ACTIVITY_LIMIT = 5;
let activityLogs = []; // Store logs for countdown
let countdownInterval = null;

async function loadDashboard() {
    try {
        const data = await apiCall('/dashboard/stats');
        const stats = data.data;
        
        // Update stats
        document.getElementById('statTotalContacts').textContent = stats.contacts.total;
        document.getElementById('statRegisteredContacts').textContent = stats.contacts.registered;
        document.getElementById('statTotalGroups').textContent = stats.groups;
        document.getElementById('statTotalTemplates').textContent = stats.templates;
        document.getElementById('statTodaySent').textContent = stats.blast.today.sent;
        document.getElementById('statTodayFailed').textContent = stats.blast.today.failed;
        document.getElementById('statTodaySkipped').textContent = stats.blast.today.skipped;
        
        // Update all time stats
        const totalAll = stats.blast.total.sent + stats.blast.total.failed + stats.blast.total.skipped;
        document.getElementById('statAllSent').textContent = stats.blast.total.sent;
        document.getElementById('statAllFailed').textContent = stats.blast.total.failed;
        document.getElementById('statAllSkipped').textContent = stats.blast.total.skipped;
        
        if (totalAll > 0) {
            document.getElementById('barSent').style.width = `${(stats.blast.total.sent / totalAll) * 100}%`;
            document.getElementById('barFailed').style.width = `${(stats.blast.total.failed / totalAll) * 100}%`;
            document.getElementById('barSkipped').style.width = `${(stats.blast.total.skipped / totalAll) * 100}%`;
        }
        
        // Update WA status
        updateWhatsAppStatus(stats.whatsapp);
        
        // Load recent activity with pagination
        await loadRecentActivity();
        
    } catch (error) {
        showToast('Gagal memuat dashboard', 'error');
    }
}

async function loadRecentActivity() {
    try {
        const data = await apiCall(`/dashboard/activity?page=${activityPage}&limit=${ACTIVITY_LIMIT}`);
        const { logs, pagination } = data.data;
        
        // Store logs with fetch timestamp for countdown calculation
        activityLogs = logs ? logs.map(log => ({
            ...log,
            fetchedAt: Date.now()
        })) : [];
        
        const logsEl = document.getElementById('recentLogs');
        const paginationEl = document.getElementById('activityPagination');
        const infoEl = document.getElementById('activityInfo');
        const pageInfoEl = document.getElementById('activityPageInfo');
        const btnPrev = document.getElementById('btnPrevActivity');
        const btnNext = document.getElementById('btnNextActivity');
        
        // Check if elements exist
        if (!logsEl) {
            console.warn('recentLogs element not found');
            return;
        }
        
        if (logs && logs.length > 0) {
            renderActivityList();
            
            // Start countdown timer
            startCountdownTimer();
            
            // Show pagination if elements exist
            if (paginationEl) {
                paginationEl.classList.remove('hidden');
            }
            if (infoEl) {
                infoEl.textContent = `${pagination.totalLogs} total`;
            }
            if (pageInfoEl) {
                pageInfoEl.textContent = `Hal ${pagination.page} dari ${pagination.totalPages}`;
            }
            
            // Update buttons
            if (btnPrev) {
                btnPrev.disabled = !pagination.hasPrev;
                btnPrev.onclick = () => { activityPage--; loadRecentActivity(); };
            }
            if (btnNext) {
                btnNext.disabled = !pagination.hasNext;
                btnNext.onclick = () => { activityPage++; loadRecentActivity(); };
            }
            
        } else {
            logsEl.innerHTML = '<p class="text-gray-500 text-sm text-center py-4">Belum ada aktivitas</p>';
            if (paginationEl) paginationEl.classList.add('hidden');
            if (infoEl) infoEl.textContent = '';
            stopCountdownTimer();
        }
        
    } catch (error) {
        console.error('Load activity error:', error);
        const logsEl = document.getElementById('recentLogs');
        if (logsEl) {
            logsEl.innerHTML = '<p class="text-gray-500 text-sm text-center py-4">Gagal memuat aktivitas</p>';
        }
        stopCountdownTimer();
    }
}

function renderActivityList() {
    const logsEl = document.getElementById('recentLogs');
    if (!logsEl) return;
    logsEl.innerHTML = activityLogs.map(log => renderActivityItem(log)).join('');
    lucide.createIcons();
}

function startCountdownTimer() {
    // Clear existing interval
    stopCountdownTimer();
    
    // Check if there are any pending logs
    const hasPending = activityLogs.some(log => log.status === 'pending' && log.timeLeftMs > 0);
    if (!hasPending) return;
    
    // Update countdown every second
    countdownInterval = setInterval(() => {
        let needsRerender = false;
        
        activityLogs = activityLogs.map(log => {
            if (log.status === 'pending' && log.timeLeftMs !== undefined) {
                const elapsed = Date.now() - log.fetchedAt;
                const newTimeLeft = Math.max(0, log.timeLeftMs - elapsed);
                
                // Check if status should change
                if (newTimeLeft <= 0 && log.timeLeftMs > 0) {
                    needsRerender = true;
                }
                
                return { ...log, currentTimeLeft: newTimeLeft };
            }
            return log;
        });
        
        // Update only the countdown elements (not full rerender)
        activityLogs.forEach(log => {
            if (log.status === 'pending') {
                const el = document.getElementById(`countdown-${log.id}`);
                if (el) {
                    const timeLeft = log.currentTimeLeft !== undefined ? log.currentTimeLeft : log.timeLeftMs;
                    if (timeLeft <= 0) {
                        el.textContent = 'Sedang dikirim...';
                        el.classList.add('text-green-600', 'animate-pulse');
                    } else {
                        el.textContent = `~${formatTimeLeft(timeLeft)}`;
                    }
                }
            }
        });
        
        // Check if all countdowns are done
        const stillPending = activityLogs.some(log => 
            log.status === 'pending' && (log.currentTimeLeft || log.timeLeftMs) > 0
        );
        if (!stillPending) {
            stopCountdownTimer();
        }
        
    }, 1000);
}

function stopCountdownTimer() {
    if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
    }
}

function renderActivityItem(log) {
    const statusConfig = getStatusConfig(log);
    const timeInfo = getTimeInfo(log);
    const isPending = log.status === 'pending';
    const countdownId = isPending ? `id="countdown-${log.id}"` : '';
    
    return `
        <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition">
            <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                    <p class="font-medium text-sm truncate">${log.name || log.phone}</p>
                    <span class="text-xs text-gray-400">#${log.id}</span>
                </div>
                <p class="text-xs text-gray-500 truncate">${log.campaign?.name || 'Campaign'}</p>
            </div>
            <div class="flex flex-col items-end ml-3">
                <span class="px-2 py-1 text-xs font-medium rounded flex items-center gap-1 ${statusConfig.badge}">
                    <i data-lucide="${statusConfig.icon}" class="w-3 h-3"></i>
                    ${statusConfig.label}
                </span>
                <span ${countdownId} class="text-xs text-gray-500 mt-1 ${isPending ? 'font-mono' : ''}">${timeInfo}</span>
            </div>
        </div>
    `;
}

function getStatusConfig(log) {
    const configs = {
        sent: {
            badge: 'bg-green-100 text-green-700',
            icon: 'check-circle',
            label: 'Terkirim'
        },
        failed: {
            badge: 'bg-red-100 text-red-700',
            icon: 'x-circle',
            label: 'Gagal'
        },
        skipped: {
            badge: 'bg-yellow-100 text-yellow-700',
            icon: 'skip-forward',
            label: 'Skip'
        },
        pending: {
            badge: 'bg-blue-100 text-blue-700',
            icon: 'clock',
            label: log.queuePosition ? `Antrian #${log.queuePosition}` : 'Menunggu'
        }
    };
    return configs[log.status] || configs.pending;
}

function getTimeInfo(log) {
    if (log.status === 'sent' && log.sent_at) {
        return `Dikirim ${formatTime(log.sent_at)}`;
    } else if (log.status === 'pending' && log.timeLeftMs !== undefined) {
        if (log.timeLeftMs <= 0) {
            return 'Sedang dikirim...';
        }
        return `~${formatTimeLeft(log.timeLeftMs)}`;
    } else if (log.status === 'failed') {
        return log.error_message ? log.error_message.substring(0, 30) : formatTime(log.created_at);
    } else if (log.status === 'skipped') {
        return log.skip_reason || formatTime(log.created_at);
    }
    return formatTime(log.created_at);
}

function formatTime(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    
    if (isToday) {
        return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    } else {
        return date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    }
}

function formatTimeLeft(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    
    if (hours > 0) {
        return `${hours}j ${minutes}m`;
    } else if (minutes > 0) {
        return `${minutes}m ${seconds}d`;
    } else {
        return `${seconds}d`;
    }
}

// ===== WHATSAPP =====
function updateWhatsAppStatus(data) {
    const dot = document.getElementById('waStatusDot');
    const text = document.getElementById('waStatusText');
    const icon = document.getElementById('waStatusIcon');
    const title = document.getElementById('waStatusTitle');
    const desc = document.getElementById('waStatusDesc');
    const qrContainer = document.getElementById('qrContainer');
    const qrCode = document.getElementById('qrCode');
    const connectedInfo = document.getElementById('connectedInfo');
    const btnScan = document.getElementById('btnScanQR');
    const btnDisconnect = document.getElementById('btnDisconnect');
    
    // Reset classes
    dot.className = 'status-dot';
    
    switch (data.status) {
        case 'connected':
            dot.classList.add('status-connected');
            text.textContent = 'Connected';
            if (title) title.textContent = 'WhatsApp Connected';
            if (desc) desc.textContent = 'WhatsApp terhubung dan siap digunakan';
            if (icon) icon.innerHTML = '<i data-lucide="check-circle" class="w-10 h-10 text-green-500"></i>';
            if (qrContainer) qrContainer.classList.add('hidden');
            if (connectedInfo) {
                connectedInfo.classList.remove('hidden');
                document.getElementById('waConnectedName').textContent = data.name || '-';
                document.getElementById('waConnectedPhone').textContent = data.phone ? `+${data.phone}` : '-';
            }
            if (btnScan) btnScan.classList.add('hidden');
            if (btnDisconnect) btnDisconnect.classList.remove('hidden');
            break;
        
        case 'syncing':
            dot.classList.add('status-connecting');
            text.textContent = 'Syncing...';
            if (title) title.textContent = 'Sinkronisasi dengan HP...';
            if (desc) desc.textContent = 'WA Business butuh ±90 detik untuk sync. JANGAN tutup WhatsApp di HP!';
            if (icon) icon.innerHTML = '<i data-lucide="refresh-cw" class="w-10 h-10 text-blue-500 animate-spin"></i>';
            if (qrContainer) qrContainer.classList.add('hidden');
            if (connectedInfo) {
                connectedInfo.classList.remove('hidden');
                document.getElementById('waConnectedName').textContent = data.name || 'Syncing...';
                document.getElementById('waConnectedPhone').textContent = data.phone ? `+${data.phone}` : 'Menunggu...';
            }
            if (btnScan) btnScan.classList.add('hidden');
            if (btnDisconnect) btnDisconnect.classList.add('hidden');
            break;
            
        case 'qr_ready':
            dot.classList.add('status-connecting');
            text.textContent = 'Scan QR';
            if (title) title.textContent = 'Scan QR Code';
            if (desc) desc.textContent = 'Buka WhatsApp di HP dan scan QR code';
            if (icon) icon.innerHTML = '<i data-lucide="qr-code" class="w-10 h-10 text-blue-500"></i>';
            if (data.qr && qrContainer && qrCode) {
                qrContainer.classList.remove('hidden');
                qrCode.src = data.qr;
            }
            if (connectedInfo) connectedInfo.classList.add('hidden');
            if (btnScan) btnScan.classList.add('hidden');
            if (btnDisconnect) btnDisconnect.classList.add('hidden');
            break;
            
        case 'connecting':
            dot.classList.add('status-connecting');
            text.textContent = 'Connecting...';
            if (title) title.textContent = 'Menghubungkan...';
            if (desc) desc.textContent = 'Sedang menghubungkan ke WhatsApp';
            if (icon) icon.innerHTML = '<i data-lucide="loader" class="w-10 h-10 text-yellow-500 animate-spin"></i>';
            if (qrContainer) qrContainer.classList.add('hidden');
            if (connectedInfo) connectedInfo.classList.add('hidden');
            break;
            
        default:
            dot.classList.add('status-disconnected');
            text.textContent = 'Disconnected';
            if (title) title.textContent = 'WhatsApp Disconnected';
            if (desc) desc.textContent = 'Scan QR code untuk menghubungkan WhatsApp';
            if (icon) icon.innerHTML = '<i data-lucide="smartphone" class="w-10 h-10 text-gray-400"></i>';
            if (qrContainer) qrContainer.classList.add('hidden');
            if (connectedInfo) connectedInfo.classList.add('hidden');
            if (btnScan) btnScan.classList.remove('hidden');
            if (btnDisconnect) btnDisconnect.classList.add('hidden');
    }
    
    lucide.createIcons();
}

async function loadWhatsAppStatus() {
    try {
        const data = await apiCall('/whatsapp/status');
        updateWhatsAppStatus(data.data);
    } catch (error) {
        console.error('Failed to load WA status:', error);
    }
}

async function handleScanQR() {
    try {
        await apiCall('/whatsapp/scan', { method: 'POST' });
        showToast('Memulai scan QR...', 'info');
    } catch (error) {
        showToast('Gagal memulai scan: ' + error.message, 'error');
    }
}

async function handleDisconnect() {
    if (!confirm('Yakin ingin disconnect WhatsApp?')) return;
    
    try {
        await apiCall('/whatsapp/disconnect', { method: 'POST' });
        showToast('WhatsApp disconnected', 'success');
    } catch (error) {
        showToast('Gagal disconnect: ' + error.message, 'error');
    }
}

async function handleRefreshWA() {
    try {
        await apiCall('/whatsapp/refresh', { method: 'POST' });
        showToast('Refresh session...', 'info');
    } catch (error) {
        showToast('Gagal refresh: ' + error.message, 'error');
    }
}

// ===== CONTACTS =====
let contactsPage = 1;

async function loadContacts() {
    const search = document.getElementById('searchContacts').value;
    const groupId = document.getElementById('filterGroup').value;
    const waStatus = document.getElementById('filterWaStatus').value;
    
    try {
        const params = new URLSearchParams({
            page: contactsPage,
            limit: 20
        });
        if (search) params.append('search', search);
        if (groupId) params.append('group_id', groupId);
        if (waStatus) params.append('wa_status', waStatus);
        
        const data = await apiCall(`/contacts?${params}`);
        renderContacts(data.data.contacts, data.data.pagination);
    } catch (error) {
        showToast('Gagal memuat kontak', 'error');
    }
}

function renderContacts(contacts, pagination) {
    const tbody = document.getElementById('contactsTable');
    
    if (contacts.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="px-6 py-8 text-center text-gray-500">Tidak ada kontak</td></tr>';
        return;
    }
    
    tbody.innerHTML = contacts.map(c => `
        <tr class="hover:bg-gray-50">
            <td class="px-6 py-4">
                <div class="font-medium text-gray-900">${c.name}</div>
            </td>
            <td class="px-6 py-4 text-gray-600">${c.phone}</td>
            <td class="px-6 py-4">
                ${c.group ? `<span class="px-2 py-1 rounded text-xs font-medium" style="background: ${c.group.color}20; color: ${c.group.color}">${c.group.name}</span>` : '-'}
            </td>
            <td class="px-6 py-4">
                <span class="px-2 py-1 rounded text-xs font-medium ${getWaStatusBadge(c.wa_status)}">${getWaStatusText(c.wa_status)}</span>
            </td>
            <td class="px-6 py-4">
                <div class="flex gap-2">
                    <button onclick="editContact(${c.id})" class="p-1 text-blue-600 hover:bg-blue-50 rounded">
                        <i data-lucide="edit-2" class="w-4 h-4"></i>
                    </button>
                    <button onclick="validateContact(${c.id})" class="p-1 text-yellow-600 hover:bg-yellow-50 rounded" title="Validasi WA">
                        <i data-lucide="check-circle" class="w-4 h-4"></i>
                    </button>
                    <button onclick="deleteContact(${c.id})" class="p-1 text-red-600 hover:bg-red-50 rounded">
                        <i data-lucide="trash-2" class="w-4 h-4"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
    
    // Pagination
    renderPagination('contactsPagination', pagination, (page) => {
        contactsPage = page;
        loadContacts();
    });
    
    lucide.createIcons();
}

function getWaStatusBadge(status) {
    const badges = {
        registered: 'bg-green-100 text-green-700',
        not_registered: 'bg-red-100 text-red-700',
        unknown: 'bg-gray-100 text-gray-700'
    };
    return badges[status] || badges.unknown;
}

function getWaStatusText(status) {
    const texts = {
        registered: 'Terdaftar',
        not_registered: 'Tidak Terdaftar',
        unknown: 'Belum Dicek'
    };
    return texts[status] || 'Unknown';
}

async function loadGroupsForFilter() {
    try {
        const data = await apiCall('/groups');
        const groups = data.data;
        
        ['filterGroup', 'contactGroup', 'importGroup', 'blastGroup'].forEach(id => {
            const select = document.getElementById(id);
            if (select) {
                const firstOption = select.querySelector('option');
                select.innerHTML = '';
                if (firstOption) select.appendChild(firstOption);
                groups.forEach(g => {
                    const opt = document.createElement('option');
                    opt.value = g.id;
                    opt.textContent = `${g.name} (${g.contact_count})`;
                    select.appendChild(opt);
                });
            }
        });
    } catch (error) {
        console.error('Failed to load groups for filter:', error);
    }
}

function openContactModal(contact = null) {
    document.getElementById('contactModalTitle').textContent = contact ? 'Edit Kontak' : 'Tambah Kontak';
    document.getElementById('contactId').value = contact?.id || '';
    document.getElementById('contactName').value = contact?.name || '';
    document.getElementById('contactPhone').value = contact?.phone || '';
    document.getElementById('contactGroup').value = contact?.group_id || '';
    openModal('contactModal');
}

async function editContact(id) {
    try {
        const data = await apiCall(`/contacts/${id}`);
        openContactModal(data.data);
    } catch (error) {
        showToast('Gagal memuat kontak', 'error');
    }
}

async function handleContactSubmit(e) {
    e.preventDefault();
    
    const id = document.getElementById('contactId').value;
    const payload = {
        name: document.getElementById('contactName').value,
        phone: document.getElementById('contactPhone').value,
        group_id: document.getElementById('contactGroup').value || null
    };
    
    try {
        if (id) {
            await apiCall(`/contacts/${id}`, {
                method: 'PUT',
                body: JSON.stringify(payload)
            });
            showToast('Kontak berhasil diupdate', 'success');
        } else {
            await apiCall('/contacts', {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            showToast('Kontak berhasil ditambahkan', 'success');
        }
        closeModal('contactModal');
        loadContacts();
    } catch (error) {
        showToast(error.message, 'error');
    }
}

async function deleteContact(id) {
    if (!confirm('Yakin ingin menghapus kontak ini?')) return;
    
    try {
        await apiCall(`/contacts/${id}`, { method: 'DELETE' });
        showToast('Kontak berhasil dihapus', 'success');
        loadContacts();
    } catch (error) {
        showToast('Gagal menghapus kontak', 'error');
    }
}

async function validateContact(id) {
    try {
        await apiCall(`/contacts/${id}/validate`, { method: 'POST' });
        showToast('Kontak dimasukkan ke antrian validasi', 'info');
    } catch (error) {
        showToast('Gagal memvalidasi: ' + error.message, 'error');
    }
}

async function handleValidateAll() {
    if (!confirm('Validasi semua kontak yang belum dicek? Proses ini bisa memakan waktu lama.')) return;
    
    try {
        const data = await apiCall('/contacts/validate-all', { method: 'POST' });
        showToast(data.message, 'success');
    } catch (error) {
        showToast('Gagal memvalidasi: ' + error.message, 'error');
    }
}

async function handleImport(e) {
    e.preventDefault();
    
    const fileInput = document.getElementById('importFile');
    const groupId = document.getElementById('importGroup').value;
    
    const formData = new FormData();
    formData.append('file', fileInput.files[0]);
    if (groupId) formData.append('group_id', groupId);
    
    try {
        const data = await apiUpload('/contacts/import', formData);
        showToast(data.message, 'success');
        closeModal('importModal');
        loadContacts();
        fileInput.value = '';
    } catch (error) {
        showToast('Import gagal: ' + error.message, 'error');
    }
}

// ===== GROUPS =====
async function loadGroups() {
    try {
        const data = await apiCall('/groups');
        renderGroups(data.data);
    } catch (error) {
        showToast('Gagal memuat grup', 'error');
    }
}

function renderGroups(groups) {
    const container = document.getElementById('groupsList');
    
    if (groups.length === 0) {
        container.innerHTML = '<p class="text-gray-500 col-span-full text-center py-8">Belum ada grup</p>';
        return;
    }
    
    container.innerHTML = groups.map(g => `
        <div class="border rounded-xl p-4 hover:shadow-md transition">
            <div class="flex items-center justify-between mb-3">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-lg flex items-center justify-center" style="background: ${g.color}20">
                        <i data-lucide="folder" class="w-5 h-5" style="color: ${g.color}"></i>
                    </div>
                    <div>
                        <h4 class="font-medium text-gray-800">${g.name}</h4>
                        <p class="text-sm text-gray-500">${g.contact_count} kontak</p>
                    </div>
                </div>
                <div class="flex gap-1">
                    <button onclick="editGroup(${g.id})" class="p-2 text-blue-600 hover:bg-blue-50 rounded">
                        <i data-lucide="edit-2" class="w-4 h-4"></i>
                    </button>
                    <button onclick="deleteGroup(${g.id})" class="p-2 text-red-600 hover:bg-red-50 rounded">
                        <i data-lucide="trash-2" class="w-4 h-4"></i>
                    </button>
                </div>
            </div>
            ${g.description ? `<p class="text-sm text-gray-600">${g.description}</p>` : ''}
        </div>
    `).join('');
    
    lucide.createIcons();
}

function openGroupModal(group = null) {
    document.getElementById('groupModalTitle').textContent = group ? 'Edit Grup' : 'Tambah Grup';
    document.getElementById('groupId').value = group?.id || '';
    document.getElementById('groupName').value = group?.name || '';
    document.getElementById('groupDesc').value = group?.description || '';
    document.getElementById('groupColor').value = group?.color || '#3B82F6';
    openModal('groupModal');
}

async function editGroup(id) {
    try {
        const data = await apiCall(`/groups/${id}`);
        openGroupModal(data.data);
    } catch (error) {
        showToast('Gagal memuat grup', 'error');
    }
}

async function handleGroupSubmit(e) {
    e.preventDefault();
    
    const id = document.getElementById('groupId').value;
    const payload = {
        name: document.getElementById('groupName').value,
        description: document.getElementById('groupDesc').value,
        color: document.getElementById('groupColor').value
    };
    
    try {
        if (id) {
            await apiCall(`/groups/${id}`, {
                method: 'PUT',
                body: JSON.stringify(payload)
            });
            showToast('Grup berhasil diupdate', 'success');
        } else {
            await apiCall('/groups', {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            showToast('Grup berhasil ditambahkan', 'success');
        }
        closeModal('groupModal');
        loadGroups();
        loadGroupsForFilter();
    } catch (error) {
        showToast(error.message, 'error');
    }
}

async function deleteGroup(id) {
    if (!confirm('Yakin ingin menghapus grup ini? Kontak tidak akan dihapus.')) return;
    
    try {
        await apiCall(`/groups/${id}`, { method: 'DELETE' });
        showToast('Grup berhasil dihapus', 'success');
        loadGroups();
        loadGroupsForFilter();
    } catch (error) {
        showToast('Gagal menghapus grup', 'error');
    }
}

// ===== TEMPLATES =====
async function loadTemplates() {
    try {
        const data = await apiCall('/templates');
        renderTemplates(data.data);
    } catch (error) {
        showToast('Gagal memuat template', 'error');
    }
}

function renderTemplates(templates) {
    const container = document.getElementById('templatesList');
    
    if (templates.length === 0) {
        container.innerHTML = '<p class="text-gray-500 text-center py-8">Belum ada template</p>';
        return;
    }
    
    container.innerHTML = templates.map(t => `
        <div class="border rounded-xl p-4 hover:shadow-md transition">
            <div class="flex items-center justify-between mb-3">
                <h4 class="font-medium text-gray-800">${t.name}</h4>
                <div class="flex gap-1">
                    <button onclick="editTemplate(${t.id})" class="p-2 text-blue-600 hover:bg-blue-50 rounded">
                        <i data-lucide="edit-2" class="w-4 h-4"></i>
                    </button>
                    <button onclick="deleteTemplate(${t.id})" class="p-2 text-red-600 hover:bg-red-50 rounded">
                        <i data-lucide="trash-2" class="w-4 h-4"></i>
                    </button>
                </div>
            </div>
            <p class="text-sm text-gray-600 bg-gray-50 rounded-lg p-3 whitespace-pre-wrap">${escapeHtml(t.content)}</p>
            <p class="text-xs text-gray-400 mt-2">Digunakan ${t.usage_count}x</p>
        </div>
    `).join('');
    
    lucide.createIcons();
}

function openTemplateModal(template = null) {
    document.getElementById('templateModalTitle').textContent = template ? 'Edit Template' : 'Tambah Template';
    document.getElementById('templateId').value = template?.id || '';
    document.getElementById('templateName').value = template?.name || '';
    document.getElementById('templateContent').value = template?.content || '';
    openModal('templateModal');
}

async function editTemplate(id) {
    try {
        const data = await apiCall(`/templates/${id}`);
        openTemplateModal(data.data);
    } catch (error) {
        showToast('Gagal memuat template', 'error');
    }
}

async function handleTemplateSubmit(e) {
    e.preventDefault();
    
    const id = document.getElementById('templateId').value;
    const payload = {
        name: document.getElementById('templateName').value,
        content: document.getElementById('templateContent').value
    };
    
    try {
        if (id) {
            await apiCall(`/templates/${id}`, {
                method: 'PUT',
                body: JSON.stringify(payload)
            });
            showToast('Template berhasil diupdate', 'success');
        } else {
            await apiCall('/templates', {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            showToast('Template berhasil ditambahkan', 'success');
        }
        closeModal('templateModal');
        loadTemplates();
        loadBlastData();
    } catch (error) {
        showToast(error.message, 'error');
    }
}

async function deleteTemplate(id) {
    if (!confirm('Yakin ingin menghapus template ini?')) return;
    
    try {
        await apiCall(`/templates/${id}`, { method: 'DELETE' });
        showToast('Template berhasil dihapus', 'success');
        loadTemplates();
    } catch (error) {
        showToast('Gagal menghapus template', 'error');
    }
}

function insertVariable(variable) {
    const textarea = document.getElementById('templateContent');
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    textarea.value = text.substring(0, start) + variable + text.substring(end);
    textarea.selectionStart = textarea.selectionEnd = start + variable.length;
    textarea.focus();
}

// ===== BLAST =====
async function loadBlastData() {
    try {
        // Load templates for select
        const templatesData = await apiCall('/templates');
        const templateSelect = document.getElementById('blastTemplate');
        templateSelect.innerHTML = '<option value="">Pilih Template</option>' + 
            templatesData.data.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
        
        // Load groups for select
        await loadGroupsForFilter();
        
        // Load campaigns
        await loadCampaigns();
    } catch (error) {
        showToast('Gagal memuat data blast', 'error');
    }
}

async function loadCampaigns() {
    try {
        const data = await apiCall('/blast/campaigns?limit=50');
        renderCampaigns(data.data.campaigns);
    } catch (error) {
        console.error('Failed to load campaigns:', error);
    }
}

function renderCampaigns(campaigns) {
    const container = document.getElementById('campaignsList');
    
    if (campaigns.length === 0) {
        container.innerHTML = '<p class="text-gray-500 text-center py-8">Belum ada campaign</p>';
        return;
    }
    
    container.innerHTML = campaigns.map(c => `
        <div class="p-4 hover:bg-gray-50 transition">
            <div class="flex items-center justify-between">
                <div>
                    <h4 class="font-medium text-gray-800">${c.name}</h4>
                    <p class="text-sm text-gray-500">
                        ${c.template?.name || 'Template'} • ${c.group?.name || 'Semua Kontak'} • ${c.interval_minutes} menit
                    </p>
                </div>
                <div class="flex items-center gap-3">
                    <span class="px-2 py-1 text-xs font-medium rounded ${getCampaignStatusBadge(c.status)}">${c.status}</span>
                    ${getCampaignActions(c)}
                </div>
            </div>
            <div class="mt-3">
                <div class="flex justify-between text-xs text-gray-500 mb-1">
                    <span>${c.sent_count + c.failed_count + c.skipped_count} / ${c.total_contacts}</span>
                    <span>${Math.round(((c.sent_count + c.failed_count + c.skipped_count) / c.total_contacts) * 100) || 0}%</span>
                </div>
                <div class="h-2 bg-gray-200 rounded-full overflow-hidden flex">
                    <div class="h-full bg-green-500" style="width: ${(c.sent_count / c.total_contacts) * 100}%"></div>
                    <div class="h-full bg-red-500" style="width: ${(c.failed_count / c.total_contacts) * 100}%"></div>
                    <div class="h-full bg-yellow-500" style="width: ${(c.skipped_count / c.total_contacts) * 100}%"></div>
                </div>
                <div class="flex gap-4 text-xs mt-1">
                    <span class="text-green-600">${c.sent_count} terkirim</span>
                    <span class="text-red-600">${c.failed_count} gagal</span>
                    <span class="text-yellow-600">${c.skipped_count} skip</span>
                </div>
            </div>
        </div>
    `).join('');
    
    lucide.createIcons();
}

function getCampaignStatusBadge(status) {
    const badges = {
        draft: 'bg-gray-100 text-gray-700',
        queued: 'bg-blue-100 text-blue-700',
        running: 'bg-green-100 text-green-700',
        paused: 'bg-yellow-100 text-yellow-700',
        completed: 'bg-purple-100 text-purple-700',
        stopped: 'bg-red-100 text-red-700',
        failed: 'bg-red-100 text-red-700'
    };
    return badges[status] || badges.draft;
}

function getCampaignActions(campaign) {
    const actions = [];
    
    if (campaign.status === 'running' || campaign.status === 'queued') {
        actions.push(`<button onclick="pauseCampaign(${campaign.id})" class="p-1 text-yellow-600 hover:bg-yellow-50 rounded" title="Pause"><i data-lucide="pause" class="w-4 h-4"></i></button>`);
        actions.push(`<button onclick="stopCampaign(${campaign.id})" class="p-1 text-red-600 hover:bg-red-50 rounded" title="Stop"><i data-lucide="square" class="w-4 h-4"></i></button>`);
    } else if (campaign.status === 'paused') {
        actions.push(`<button onclick="resumeCampaign(${campaign.id})" class="p-1 text-green-600 hover:bg-green-50 rounded" title="Resume"><i data-lucide="play" class="w-4 h-4"></i></button>`);
        actions.push(`<button onclick="stopCampaign(${campaign.id})" class="p-1 text-red-600 hover:bg-red-50 rounded" title="Stop"><i data-lucide="square" class="w-4 h-4"></i></button>`);
    }
    
    if (['completed', 'stopped', 'failed'].includes(campaign.status)) {
        actions.push(`<button onclick="deleteCampaign(${campaign.id})" class="p-1 text-red-600 hover:bg-red-50 rounded" title="Delete"><i data-lucide="trash-2" class="w-4 h-4"></i></button>`);
    }
    
    return `<div class="flex gap-1">${actions.join('')}</div>`;
}

async function handleBlastSubmit(e) {
    e.preventDefault();
    
    const payload = {
        name: document.getElementById('blastName').value,
        template_id: document.getElementById('blastTemplate').value,
        group_id: document.getElementById('blastGroup').value || null,
        interval_minutes: parseInt(document.getElementById('blastInterval').value)
    };
    
    try {
        const data = await apiCall('/blast/campaigns', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        showToast(data.message, 'success');
        document.getElementById('blastForm').reset();
        loadCampaigns();
    } catch (error) {
        showToast(error.message, 'error');
    }
}

async function pauseCampaign(id) {
    try {
        await apiCall(`/blast/campaigns/${id}/pause`, { method: 'POST' });
        showToast('Campaign dipaused', 'success');
        loadCampaigns();
    } catch (error) {
        showToast('Gagal pause campaign', 'error');
    }
}

async function resumeCampaign(id) {
    try {
        await apiCall(`/blast/campaigns/${id}/resume`, { method: 'POST' });
        showToast('Campaign dilanjutkan', 'success');
        loadCampaigns();
    } catch (error) {
        showToast('Gagal resume campaign', 'error');
    }
}

async function stopCampaign(id) {
    if (!confirm('Yakin ingin menghentikan campaign ini?')) return;
    
    try {
        await apiCall(`/blast/campaigns/${id}/stop`, { method: 'POST' });
        showToast('Campaign dihentikan', 'success');
        loadCampaigns();
    } catch (error) {
        showToast('Gagal stop campaign', 'error');
    }
}

async function deleteCampaign(id) {
    if (!confirm('Yakin ingin menghapus campaign ini?')) return;
    
    try {
        await apiCall(`/blast/campaigns/${id}`, { method: 'DELETE' });
        showToast('Campaign dihapus', 'success');
        loadCampaigns();
    } catch (error) {
        showToast('Gagal hapus campaign', 'error');
    }
}

// ===== UTILITIES =====
function openModal(id) {
    document.getElementById(id).classList.add('active');
}

function closeModal(id) {
    document.getElementById(id).classList.remove('active');
}

function showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    
    const colors = {
        success: 'bg-green-500',
        error: 'bg-red-500',
        warning: 'bg-yellow-500',
        info: 'bg-blue-500'
    };
    
    toast.className = `toast px-4 py-3 rounded-lg text-white ${colors[type]} shadow-lg`;
    toast.textContent = message;
    container.appendChild(toast);
    
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

function renderPagination(containerId, pagination, callback) {
    const container = document.getElementById(containerId);
    
    if (pagination.totalPages <= 1) {
        container.innerHTML = `<span class="text-sm text-gray-500">Total: ${pagination.total} data</span>`;
        return;
    }
    
    let html = `<span class="text-sm text-gray-500">Halaman ${pagination.page} dari ${pagination.totalPages} (${pagination.total} data)</span>`;
    html += '<div class="flex gap-2">';
    
    if (pagination.page > 1) {
        html += `<button onclick="window.paginationCallback${containerId}(${pagination.page - 1})" class="px-3 py-1 border rounded hover:bg-gray-50">Prev</button>`;
    }
    
    if (pagination.page < pagination.totalPages) {
        html += `<button onclick="window.paginationCallback${containerId}(${pagination.page + 1})" class="px-3 py-1 border rounded hover:bg-gray-50">Next</button>`;
    }
    
    html += '</div>';
    container.innerHTML = html;
    
    window[`paginationCallback${containerId}`] = callback;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}
