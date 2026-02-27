// WhatsApp Blast Dashboard - Main JavaScript
// ==========================================

const API_BASE = '/api';
let token = localStorage.getItem('token');
let socket = null;
let activityFilter = '';

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
    document.getElementById('dashboardFooter').classList.add('hidden');
}

// Show dashboard
function showDashboard() {
    document.getElementById('loginPage').classList.add('hidden');
    document.getElementById('dashboardPage').classList.remove('hidden');
    document.getElementById('dashboardFooter').classList.remove('hidden');
}

// Initialize Socket.io
function initSocket() {
    socket = io();
    
    socket.on('connect', () => {
        console.log('Socket connected');
    });
    
    socket.on('whatsapp:status', (data) => {
        // Single session update - reload all sessions
        loadWhatsAppSessions();
    });
    
    socket.on('whatsapp:all-sessions', (data) => {
        // All sessions update
        if (currentPage === 'whatsapp') {
            renderWhatsAppSessions({ sessions: data, connectedCount: data.filter(s => s.status === 'connected').length, maxSessions: 5 });
        }
        updateHeaderWaStatus({ connectedCount: data.filter(s => s.status === 'connected').length });
    });
    
    socket.on('wa-error', (data) => {
        // Handle WhatsApp specific errors like conflict
        showToast(data.message, 'error', 10000);
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
    
    // WhatsApp buttons (optional - may not exist in multi-session UI)
    const btnScanQR = document.getElementById('btnScanQR');
    const btnDisconnect = document.getElementById('btnDisconnect');
    const btnRefresh = document.getElementById('btnRefresh');
    if (btnScanQR) btnScanQR.addEventListener('click', handleScanQR);
    if (btnDisconnect) btnDisconnect.addEventListener('click', handleDisconnect);
    if (btnRefresh) btnRefresh.addEventListener('click', handleRefreshWA);
    
    // Contact buttons
    document.getElementById('btnAddContact').addEventListener('click', () => openContactModal());
    const btnDeleteSelectedContacts = document.getElementById('btnDeleteSelectedContacts');
    if (btnDeleteSelectedContacts) btnDeleteSelectedContacts.addEventListener('click', handleDeleteSelectedContacts);
    const btnMoveSelectedToGroup = document.getElementById('btnMoveSelectedToGroup');
    if (btnMoveSelectedToGroup) btnMoveSelectedToGroup.addEventListener('click', handleMoveSelectedToGroup);
    const bulkMoveGroupSelect = document.getElementById('bulkMoveGroupSelect');
    if (bulkMoveGroupSelect) bulkMoveGroupSelect.addEventListener('change', updateContactsBulkDeleteButton);
    document.getElementById('btnImportContacts').addEventListener('click', () => {
        openModal('importModal');
        setTimeout(() => lucide.createIcons(), 100);
    });
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
    document.getElementById('editIntervalForm').addEventListener('submit', handleEditIntervalSubmit);

    // Process status
    document.getElementById('btnCheckProcess').addEventListener('click', openProcessStatus);
    document.getElementById('btnClearQueue').addEventListener('click', clearBlastQueue);

    // Activity filter
    const activityFilterEl = document.getElementById('activityFilter');
    if (activityFilterEl) {
        activityFilterEl.addEventListener('change', function(e) {
            console.log('Filter changed:', e.target.value);
            activityFilter = e.target.value;
            activityPage = 1; // Reset to first page
            loadRecentActivity();
        });
    }
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
        
        // Handle non-JSON responses
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            console.error('Non-JSON response:', await response.text());
            throw new Error('Server error - non-JSON response');
        }
        
        const data = await response.json();
        
        // Only logout on 401 if response explicitly says unauthorized
        if (response.status === 401 && !endpoint.includes('/auth/login')) {
            console.log('401 response:', data);
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
        
        // Update pie chart
        updatePieChart(stats.blast.total.sent, stats.blast.total.failed, stats.blast.total.skipped);
        
        if (totalAll > 0) {
            document.getElementById('barSent').style.width = `${(stats.blast.total.sent / totalAll) * 100}%`;
            document.getElementById('barFailed').style.width = `${(stats.blast.total.failed / totalAll) * 100}%`;
            document.getElementById('barSkipped').style.width = `${(stats.blast.total.skipped / totalAll) * 100}%`;
        }
        
        // Update WA status
        updateWhatsAppStatus(stats.whatsapp);
        
        // Render recent campaigns table
        renderRecentCampaigns(stats.recentCampaigns);
        
        // Load recent activity with pagination
        await loadRecentActivity();
        
    } catch (error) {
        showToast('Gagal memuat dashboard', 'error');
    }
}

function updatePieChart(sent, failed, skipped) {
    const total = sent + failed + skipped;
    const circumference = 2 * Math.PI * 40; // 251.2
    
    document.getElementById('pieTotalCount').textContent = total;
    
    if (total === 0) {
        document.getElementById('pieSent').setAttribute('stroke-dasharray', '0 251.2');
        document.getElementById('pieFailed').setAttribute('stroke-dasharray', '0 251.2');
        document.getElementById('pieSkipped').setAttribute('stroke-dasharray', '0 251.2');
        return;
    }
    
    const sentPct = (sent / total) * circumference;
    const failedPct = (failed / total) * circumference;
    const skippedPct = (skipped / total) * circumference;
    
    // Set pie segments
    document.getElementById('pieSent').setAttribute('stroke-dasharray', `${sentPct} ${circumference}`);
    document.getElementById('pieSent').setAttribute('stroke-dashoffset', '0');
    
    document.getElementById('pieFailed').setAttribute('stroke-dasharray', `${failedPct} ${circumference}`);
    document.getElementById('pieFailed').setAttribute('stroke-dashoffset', `-${sentPct}`);
    
    document.getElementById('pieSkipped').setAttribute('stroke-dasharray', `${skippedPct} ${circumference}`);
    document.getElementById('pieSkipped').setAttribute('stroke-dashoffset', `-${sentPct + failedPct}`);
}

function renderRecentCampaigns(campaigns) {
    const tbody = document.getElementById('recentCampaignsTable');
    if (!tbody) return;
    
    if (!campaigns || campaigns.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-gray-500">Belum ada campaign</td></tr>';
        return;
    }
    
    tbody.innerHTML = campaigns.map(campaign => {
        const total = campaign.total_contacts || 0;
        const processed = (campaign.sent_count || 0) + (campaign.failed_count || 0) + (campaign.skipped_count || 0);
        const progress = total > 0 ? Math.round((processed / total) * 100) : 0;
        
        // Calculate duration
        const duration = getCampaignDuration(campaign);
        
        // Status badge
        const statusBadge = getRecentCampaignStatusBadge(campaign, progress);
        
        return `
            <tr class="border-b hover:bg-gray-50">
                <td class="py-3 px-2">
                    <div class="font-medium text-gray-800">${campaign.name}</div>
                    <div class="text-xs text-gray-500">${campaign.group?.name || '-'}</div>
                </td>
                <td class="py-3 px-2 text-gray-600">${campaign.template?.name || '-'}</td>
                <td class="py-3 px-2">
                    <div class="text-gray-800">${processed}/${total}</div>
                    <div class="text-xs text-gray-500">
                        <span class="text-green-600">${campaign.sent_count || 0}✓</span>
                        <span class="text-red-600 ml-1">${campaign.failed_count || 0}✗</span>
                        <span class="text-yellow-600 ml-1">${campaign.skipped_count || 0}⊘</span>
                    </div>
                </td>
                <td class="py-3 px-2">
                    <div class="flex items-center gap-2">
                        <div class="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div class="h-full bg-blue-500 rounded-full" style="width: ${progress}%"></div>
                        </div>
                        <span class="text-xs text-gray-600">${progress}%</span>
                    </div>
                </td>
                <td class="py-3 px-2 text-gray-600">${duration}</td>
                <td class="py-3 px-2">${statusBadge}</td>
            </tr>
        `;
    }).join('');
}

function getCampaignDuration(campaign) {
    if (!campaign.started_at) return '-';
    
    const start = new Date(campaign.started_at);
    const end = campaign.completed_at ? new Date(campaign.completed_at) : new Date();
    const diff = Math.floor((end - start) / 1000); // in seconds
    
    if (diff < 60) return `${diff}d`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ${diff % 60}d`;
    const hours = Math.floor(diff / 3600);
    const mins = Math.floor((diff % 3600) / 60);
    return `${hours}j ${mins}m`;
}

function getRecentCampaignStatusBadge(campaign, progress) {
    const status = campaign.status;
    
    // Check if completed (100%)
    if (progress >= 100 || status === 'completed') {
        return '<span class="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs">Selesai</span>';
    }
    
    // Everything else is "Proses"
    return '<span class="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs animate-pulse">Proses</span>';
}

async function loadRecentActivity() {
    try {
        const filterParam = activityFilter ? `&filter=${activityFilter}` : '';
        console.log('Loading activity with filter:', activityFilter, 'URL:', `/dashboard/activity?page=${activityPage}&limit=${ACTIVITY_LIMIT}${filterParam}`);
        const data = await apiCall(`/dashboard/activity?page=${activityPage}&limit=${ACTIVITY_LIMIT}${filterParam}`);
        console.log('Activity response:', data);
        const { logs, pagination } = data.data;
        console.log('Logs count:', logs?.length, 'Total:', pagination?.totalLogs);
        
        // Store logs with fetch timestamp for countdown calculation
        activityLogs = logs ? logs.map(log => ({
            ...log,
            fetchedAt: Date.now()
        })) : [];
        
        const logsEl = document.getElementById('recentLogs');
        const paginationEl = document.getElementById('activityPagination');
        
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
                renderPagination('activityPagination', {
                    page: pagination.page,
                    totalPages: pagination.totalPages,
                    total: pagination.totalLogs
                }, (newPage) => {
                    activityPage = newPage;
                    loadRecentActivity();
                });
            }
            
        } else {
            logsEl.innerHTML = '<p class="text-gray-500 text-sm text-center py-4">Tidak ada data untuk filter ini</p>';
            if (paginationEl) paginationEl.classList.add('hidden');
            stopCountdownTimer();
        }
        
    } catch (error) {
        console.error('Load activity error:', error);
        const logsEl = document.getElementById('recentLogs');
        if (logsEl) {
            logsEl.innerHTML = '<p class="text-red-500 text-sm text-center py-4">Gagal memuat aktivitas</p>';
        }
        const paginationEl = document.getElementById('activityPagination');
        if (paginationEl) paginationEl.classList.add('hidden');
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
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    
    if (days > 0) {
        // More than 24 hours: show days and hours
        return `${days}h ${hours}j`;
    } else if (hours > 0) {
        // More than 1 hour: show hours and minutes
        return `${hours}j ${minutes}m`;
    } else if (minutes > 0) {
        // More than 1 minute: show minutes and seconds
        return `${minutes}m ${seconds}d`;
    } else {
        // Less than 1 minute: show seconds only
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

// ===== WHATSAPP MULTI-SESSION =====
async function loadWhatsAppSessions() {
    try {
        console.log('Loading WA sessions...');
        const data = await apiCall('/whatsapp/sessions');
        console.log('WA sessions data:', data);
        
        if (data.success && data.data) {
            renderWhatsAppSessions(data.data);
            updateHeaderWaStatus(data.data);
        } else {
            console.error('Invalid sessions data:', data);
            // Fallback: render empty sessions
            renderWhatsAppSessions({
                sessions: [
                    { sessionId: 'wa_1', status: 'disconnected', label: 'WhatsApp 1' },
                    { sessionId: 'wa_2', status: 'disconnected', label: 'WhatsApp 2' },
                    { sessionId: 'wa_3', status: 'disconnected', label: 'WhatsApp 3' },
                    { sessionId: 'wa_4', status: 'disconnected', label: 'WhatsApp 4' },
                    { sessionId: 'wa_5', status: 'disconnected', label: 'WhatsApp 5' }
                ],
                connectedCount: 0,
                maxSessions: 5
            });
        }
    } catch (error) {
        console.error('Failed to load WA sessions:', error);
        // Fallback: render empty sessions
        renderWhatsAppSessions({
            sessions: [
                { sessionId: 'wa_1', status: 'disconnected', label: 'WhatsApp 1' },
                { sessionId: 'wa_2', status: 'disconnected', label: 'WhatsApp 2' },
                { sessionId: 'wa_3', status: 'disconnected', label: 'WhatsApp 3' },
                { sessionId: 'wa_4', status: 'disconnected', label: 'WhatsApp 4' },
                { sessionId: 'wa_5', status: 'disconnected', label: 'WhatsApp 5' }
            ],
            connectedCount: 0,
            maxSessions: 5
        });
    }
}

function renderWhatsAppSessions(data) {
    const grid = document.getElementById('waSessionsGrid');
    const connectedCountEl = document.getElementById('connectedCount');
    const maxSessionsEl = document.getElementById('maxSessions');
    
    if (connectedCountEl) connectedCountEl.textContent = data.connectedCount;
    if (maxSessionsEl) maxSessionsEl.textContent = data.maxSessions;
    
    if (!grid) return;
    
    grid.innerHTML = data.sessions.map(session => `
        <div class="bg-white rounded-xl shadow-sm p-6 border-2 ${session.status === 'connected' ? 'border-green-300' : 'border-gray-200'}">
            <!-- Header -->
            <div class="flex items-center justify-between mb-4">
                <div class="flex items-center gap-2">
                    <span class="status-dot ${getSessionStatusClass(session.status)}"></span>
                    <span class="font-semibold text-gray-800">${session.label || session.sessionId}</span>
                </div>
                <span class="text-xs px-2 py-1 rounded-full ${getSessionStatusBadge(session.status)}">
                    ${getSessionStatusText(session.status)}
                </span>
            </div>
            
            <!-- Content based on status -->
            ${renderSessionContent(session)}
            
            <!-- Actions -->
            <div class="flex gap-2 mt-4">
                ${renderSessionActions(session)}
            </div>
        </div>
    `).join('');
    
    lucide.createIcons();
}

function renderSessionContent(session) {
    if (session.status === 'connected') {
        return `
            <div class="bg-green-50 rounded-lg p-4">
                <div class="flex items-center gap-3">
                    <div class="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center">
                        <i data-lucide="check" class="w-6 h-6 text-white"></i>
                    </div>
                    <div>
                        <p class="font-medium text-gray-800">${session.name || 'Unknown'}</p>
                        <p class="text-sm text-gray-600">+${session.phone || '-'}</p>
                    </div>
                </div>
                <div class="mt-3 text-sm text-gray-600">
                    <span class="font-medium">${session.messages_sent_today || 0}</span> pesan hari ini
                </div>
            </div>
        `;
    } else if (session.status === 'qr_ready' && session.qr) {
        return `
            <div class="flex justify-center">
                <div class="p-3 bg-white border-2 border-gray-200 rounded-lg">
                    <img src="${session.qr}" alt="QR Code" class="w-40 h-40">
                </div>
            </div>
            <p class="text-center text-sm text-gray-500 mt-2">Scan dengan WhatsApp</p>
        `;
    } else if (session.status === 'connecting' || session.isConnecting) {
        return `
            <div class="flex flex-col items-center py-6">
                <div class="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                <p class="text-gray-600 mt-3">Menghubungkan...</p>
            </div>
        `;
    } else {
        return `
            <div class="flex flex-col items-center py-6">
                <div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center">
                    <i data-lucide="smartphone" class="w-8 h-8 text-gray-400"></i>
                </div>
                <p class="text-gray-500 mt-3">Belum terhubung</p>
            </div>
        `;
    }
}

function renderSessionActions(session) {
    if (session.status === 'connected') {
        return `
            <button onclick="disconnectWaSession('${session.sessionId}')" class="flex-1 px-3 py-2 bg-red-100 text-red-600 rounded-lg text-sm font-medium hover:bg-red-200 transition flex items-center justify-center gap-1">
                <i data-lucide="power-off" class="w-4 h-4"></i>
                Disconnect
            </button>
        `;
    } else if (session.status === 'qr_ready' || session.status === 'connecting' || session.isConnecting) {
        return `
            <button onclick="refreshWaSession('${session.sessionId}')" class="flex-1 px-3 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-200 transition flex items-center justify-center gap-1">
                <i data-lucide="refresh-cw" class="w-4 h-4"></i>
                Refresh
            </button>
        `;
    } else {
        return `
            <button onclick="initWaSession('${session.sessionId}')" class="flex-1 px-3 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 transition flex items-center justify-center gap-1">
                <i data-lucide="qr-code" class="w-4 h-4"></i>
                Scan QR
            </button>
        `;
    }
}

function getSessionStatusClass(status) {
    const classes = {
        connected: 'status-connected',
        qr_ready: 'status-connecting',
        connecting: 'status-connecting',
        disconnected: 'status-disconnected'
    };
    return classes[status] || 'status-disconnected';
}

function getSessionStatusBadge(status) {
    const badges = {
        connected: 'bg-green-100 text-green-700',
        qr_ready: 'bg-blue-100 text-blue-700',
        connecting: 'bg-yellow-100 text-yellow-700',
        disconnected: 'bg-gray-100 text-gray-600'
    };
    return badges[status] || 'bg-gray-100 text-gray-600';
}

function getSessionStatusText(status) {
    const texts = {
        connected: 'Connected',
        qr_ready: 'Scan QR',
        connecting: 'Connecting...',
        disconnected: 'Disconnected'
    };
    return texts[status] || 'Disconnected';
}

function updateHeaderWaStatus(data) {
    const dot = document.getElementById('waStatusDot');
    const text = document.getElementById('waStatusText');
    
    if (!dot || !text) return;
    
    dot.classList.remove('status-connected', 'status-disconnected', 'status-connecting');
    
    if (data.connectedCount > 0) {
        dot.classList.add('status-connected');
        text.textContent = `${data.connectedCount} Connected`;
    } else {
        dot.classList.add('status-disconnected');
        text.textContent = 'Disconnected';
    }
}

async function initWaSession(sessionId) {
    try {
        await apiCall(`/whatsapp/sessions/${sessionId}/init`, { method: 'POST' });
        showToast(`Memulai scan QR untuk ${sessionId}...`, 'info');
    } catch (error) {
        showToast('Gagal memulai scan: ' + error.message, 'error');
    }
}

async function disconnectWaSession(sessionId) {
    if (!confirm(`Yakin ingin disconnect ${sessionId}?`)) return;
    
    try {
        await apiCall(`/whatsapp/sessions/${sessionId}/disconnect`, { method: 'POST' });
        showToast(`${sessionId} disconnected`, 'success');
    } catch (error) {
        showToast('Gagal disconnect: ' + error.message, 'error');
    }
}

async function refreshWaSession(sessionId) {
    try {
        await apiCall(`/whatsapp/sessions/${sessionId}/refresh`, { method: 'POST' });
        showToast(`Refresh ${sessionId}...`, 'info');
    } catch (error) {
        showToast('Gagal refresh: ' + error.message, 'error');
    }
}

// Backward compatible functions
async function loadWhatsAppStatus() {
    await loadWhatsAppSessions();
}

async function handleScanQR() {
    await initWaSession('wa_1');
}

async function handleDisconnect() {
    // Disconnect all connected sessions
    try {
        const data = await apiCall('/whatsapp/sessions');
        for (const session of data.data.sessions) {
            if (session.status === 'connected') {
                await apiCall(`/whatsapp/sessions/${session.sessionId}/disconnect`, { method: 'POST' });
            }
        }
        showToast('Semua session disconnected', 'success');
    } catch (error) {
        showToast('Gagal disconnect: ' + error.message, 'error');
    }
}

async function handleRefreshWA() {
    await loadWhatsAppSessions();
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
        tbody.innerHTML = '<tr><td colspan="6" class="px-6 py-8 text-center text-gray-500">Tidak ada kontak</td></tr>';
        updateContactsBulkDeleteButton();
        return;
    }
    
    tbody.innerHTML = contacts.map(c => {
        const name = escapeHtml(c.name || '');
        const phone = escapeHtml(c.phone || '');
        const groupName = c.group ? escapeHtml(c.group.name || '') : '';
        const groupColor = (c.group && c.group.color) ? String(c.group.color).replace(/[<>"']/g, '') : '#3B82F6';
        return `
        <tr class="hover:bg-gray-50">
            <td class="px-4 py-4 w-12 align-middle" style="min-width: 48px;">
                <input type="checkbox" class="contact-row-checkbox rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-4 h-4" value="${c.id}" data-id="${c.id}" aria-label="Pilih ${name}">
            </td>
            <td class="px-6 py-4 align-middle">
                <div class="font-medium text-gray-900">${name}</div>
            </td>
            <td class="px-6 py-4 text-gray-600 align-middle whitespace-nowrap">${phone}</td>
            <td class="px-6 py-4 align-middle">
                ${c.group ? `<span class="px-2 py-1 rounded text-xs font-medium" style="background: ${groupColor}20; color: ${groupColor}">${groupName}</span>` : '<span class="text-gray-400">-</span>'}
            </td>
            <td class="px-6 py-4 align-middle">
                <span class="px-2 py-1 rounded text-xs font-medium ${getWaStatusBadge(c.wa_status)}">${getWaStatusText(c.wa_status)}</span>
            </td>
            <td class="px-6 py-4 align-middle">
                <div class="flex gap-2">
                    <button type="button" onclick="editContact(${c.id})" class="p-1 text-blue-600 hover:bg-blue-50 rounded" title="Edit">
                        <i data-lucide="edit-2" class="w-4 h-4"></i>
                    </button>
                    <button type="button" onclick="validateContact(${c.id})" class="p-1 text-yellow-600 hover:bg-yellow-50 rounded" title="Validasi WA">
                        <i data-lucide="check-circle" class="w-4 h-4"></i>
                    </button>
                    <button type="button" onclick="deleteContact(${c.id})" class="p-1 text-red-600 hover:bg-red-50 rounded" title="Hapus">
                        <i data-lucide="trash-2" class="w-4 h-4"></i>
                    </button>
                </div>
            </td>
        </tr>`;
    }).join('');
    
    // Select-all & per-row checkbox behaviour
    const selectAll = document.getElementById('contactSelectAll');
    if (selectAll) {
        selectAll.checked = false;
        selectAll.indeterminate = false;
        selectAll.onclick = function() {
            document.querySelectorAll('.contact-row-checkbox').forEach(cb => {
                cb.checked = selectAll.checked;
            });
            updateContactsBulkDeleteButton();
        };
    }
    tbody.querySelectorAll('.contact-row-checkbox').forEach(cb => {
        cb.addEventListener('change', updateContactsBulkDeleteButton);
        cb.addEventListener('change', function() {
            const selectAllEl = document.getElementById('contactSelectAll');
            if (!selectAllEl) return;
            const total = document.querySelectorAll('.contact-row-checkbox').length;
            const checked = document.querySelectorAll('.contact-row-checkbox:checked').length;
            selectAllEl.checked = total > 0 && checked === total;
            selectAllEl.indeterminate = checked > 0 && checked < total;
        });
    });
    
    updateContactsBulkDeleteButton();
    
    // Pagination
    renderPagination('contactsPagination', pagination, (page) => {
        contactsPage = page;
        loadContacts();
    });
    
    lucide.createIcons();
}

function updateContactsBulkDeleteButton() {
    const checked = document.querySelectorAll('.contact-row-checkbox:checked');
    const count = checked.length;
    const deleteBtn = document.getElementById('btnDeleteSelectedContacts');
    const moveBtn = document.getElementById('btnMoveSelectedToGroup');
    const moveSelect = document.getElementById('bulkMoveGroupSelect');
    if (deleteBtn) {
        deleteBtn.disabled = count === 0;
        deleteBtn.title = count > 0 ? `Hapus ${count} kontak terpilih` : 'Pilih kontak terlebih dahulu';
    }
    if (moveBtn && moveSelect) {
        const hasGroup = moveSelect.value !== '';
        moveBtn.disabled = count === 0 || !hasGroup;
        moveBtn.title = !hasGroup ? 'Pilih grup tujuan' : count === 0 ? 'Pilih kontak terlebih dahulu' : `Pindah ${count} kontak ke grup`;
    }
}

async function handleMoveSelectedToGroup() {
    const checked = document.querySelectorAll('.contact-row-checkbox:checked');
    const ids = Array.from(checked).map(cb => parseInt(cb.dataset.id || cb.value, 10)).filter(Boolean);
    const select = document.getElementById('bulkMoveGroupSelect');
    if (ids.length === 0) {
        showToast('Pilih minimal satu kontak', 'warning');
        return;
    }
    if (!select || select.value === '') {
        showToast('Pilih grup tujuan terlebih dahulu', 'warning');
        return;
    }
    const groupId = select.value === 'none' ? null : parseInt(select.value, 10);
    const groupLabel = select.value === 'none' ? 'Tanpa grup' : select.options[select.selectedIndex]?.textContent || 'grup';
    if (!confirm(`Pindah ${ids.length} kontak ke "${groupLabel}"?`)) return;
    try {
        const data = await apiCall('/contacts/bulk-move-group', {
            method: 'POST',
            body: JSON.stringify({ ids, group_id: groupId })
        });
        showToast(data.message, 'success');
        document.getElementById('contactSelectAll').checked = false;
        select.value = '';
        updateContactsBulkDeleteButton();
        loadContacts();
    } catch (error) {
        showToast(error.message || 'Gagal memindah kontak', 'error');
    }
}

async function handleDeleteSelectedContacts() {
    const checked = document.querySelectorAll('.contact-row-checkbox:checked');
    const ids = Array.from(checked).map(cb => parseInt(cb.dataset.id || cb.value, 10)).filter(Boolean);
    if (ids.length === 0) {
        showToast('Pilih minimal satu kontak', 'warning');
        return;
    }
    if (!confirm(`Yakin ingin menghapus ${ids.length} kontak terpilih?`)) return;
    try {
        const data = await apiCall('/contacts/bulk-delete', {
            method: 'POST',
            body: JSON.stringify({ ids })
        });
        showToast(data.message, 'success');
        document.getElementById('contactSelectAll').checked = false;
        loadContacts();
    } catch (error) {
        showToast(error.message || 'Gagal menghapus kontak', 'error');
    }
}

function escapeHtml(text) {
    if (text == null || text === '') return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
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

        // Dropdown "Pindah ke grup" (opsi: placeholder, Tanpa grup, lalu daftar grup)
        const bulkMoveSelect = document.getElementById('bulkMoveGroupSelect');
        if (bulkMoveSelect) {
            bulkMoveSelect.innerHTML = '<option value="">Pindah ke grup...</option><option value="none">Tanpa grup</option>';
            groups.forEach(g => {
                const opt = document.createElement('option');
                opt.value = g.id;
                opt.textContent = g.name;
                bulkMoveSelect.appendChild(opt);
            });
        }
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
    
    container.innerHTML = campaigns.map(c => {
        const progress = c.total_contacts > 0 
            ? Math.round(((c.sent_count + c.failed_count + c.skipped_count) / c.total_contacts) * 100) 
            : 0;
        const isComplete = progress >= 100;
        const displayStatus = isComplete && c.status === 'running' ? 'completed' : c.status;
        const duration = getCampaignDuration(c);
        const estimation = getCampaignEstimation(c, progress);
        
        return `
        <div class="p-4 hover:bg-gray-50 transition">
            <div class="flex items-center justify-between">
                <div>
                    <h4 class="font-medium text-gray-800">${c.name}</h4>
                    <p class="text-sm text-gray-500">
                        ${c.template?.name || 'Template'} • ${c.group?.name || 'Semua Kontak'} • ${c.interval_minutes} menit
                    </p>
                </div>
                <div class="flex items-center gap-3">
                    <span class="px-2 py-1 text-xs font-medium rounded ${getCampaignStatusBadge(displayStatus)}">
                        ${getCampaignStatusLabel(displayStatus)}
                    </span>
                    ${getCampaignActions(c)}
                </div>
            </div>
            <div class="mt-3">
                <div class="flex justify-between text-xs text-gray-500 mb-1">
                    <span>${c.sent_count + c.failed_count + c.skipped_count} / ${c.total_contacts}</span>
                    <span class="flex items-center gap-2">
                        ${duration ? `<span class="text-gray-400"><i data-lucide="clock" class="w-3 h-3 inline"></i> ${duration}</span>` : ''}
                        <span>${progress}%</span>
                    </span>
                </div>
                <div class="h-2 bg-gray-200 rounded-full overflow-hidden flex">
                    <div class="h-full bg-green-500" style="width: ${(c.sent_count / c.total_contacts) * 100}%"></div>
                    <div class="h-full bg-red-500" style="width: ${(c.failed_count / c.total_contacts) * 100}%"></div>
                    <div class="h-full bg-yellow-500" style="width: ${(c.skipped_count / c.total_contacts) * 100}%"></div>
                </div>
                <div class="flex justify-between text-xs mt-1">
                    <div class="flex gap-4">
                        <span class="text-green-600">${c.sent_count} terkirim</span>
                        <span class="text-red-600">${c.failed_count} gagal</span>
                        <span class="text-yellow-600">${c.skipped_count} skip</span>
                    </div>
                    ${estimation ? `<span class="text-blue-600"><i data-lucide="timer" class="w-3 h-3 inline"></i> ${estimation}</span>` : ''}
                </div>
            </div>
        </div>
    `}).join('');
    
    lucide.createIcons();
}

function getCampaignEstimation(campaign, progress) {
    // Only show estimation for running/queued campaigns that are not complete
    if (!['running', 'queued'].includes(campaign.status) || progress >= 100) {
        return null;
    }
    
    const processed = campaign.sent_count + campaign.failed_count + campaign.skipped_count;
    const remaining = campaign.total_contacts - processed;
    
    if (remaining <= 0) return null;
    
    // Calculate estimated time: interval + avg random delay (60s)
    const avgDelayPerMessage = (campaign.interval_minutes * 60) + 60; // in seconds
    const totalSecondsRemaining = remaining * avgDelayPerMessage;
    
    // Calculate ETA
    const now = new Date();
    const eta = new Date(now.getTime() + (totalSecondsRemaining * 1000));
    
    // Format remaining time
    const hours = Math.floor(totalSecondsRemaining / 3600);
    const minutes = Math.floor((totalSecondsRemaining % 3600) / 60);
    
    let timeStr;
    if (hours > 24) {
        const days = Math.floor(hours / 24);
        const remHours = hours % 24;
        timeStr = `~${days}h ${remHours}j`;
    } else if (hours > 0) {
        timeStr = `~${hours}j ${minutes}m`;
    } else {
        timeStr = `~${minutes}m`;
    }
    
    // Format ETA time
    const etaStr = eta.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    
    return `${timeStr} (selesai ${etaStr})`;
}

function getCampaignDuration(campaign) {
    if (!campaign.started_at) return null;
    
    const start = new Date(campaign.started_at);
    const end = campaign.completed_at ? new Date(campaign.completed_at) : new Date();
    const diffMs = end - start;
    
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);
    
    if (hours > 0) {
        return `${hours}j ${minutes}m`;
    } else if (minutes > 0) {
        return `${minutes}m ${seconds}d`;
    } else {
        return `${seconds}d`;
    }
}

function getCampaignStatusLabel(status) {
    const labels = {
        draft: 'Draft',
        queued: 'Antrian',
        running: 'Berjalan',
        paused: 'Dijeda',
        completed: 'Selesai',
        stopped: 'Dihentikan',
        failed: 'Gagal'
    };
    return labels[status] || status;
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
        actions.push(`<button onclick="openEditIntervalModal(${campaign.id}, ${campaign.interval_minutes})" class="p-1 text-blue-600 hover:bg-blue-50 rounded" title="Edit Interval"><i data-lucide="settings" class="w-4 h-4"></i></button>`);
        actions.push(`<button onclick="pauseCampaign(${campaign.id})" class="p-1 text-yellow-600 hover:bg-yellow-50 rounded" title="Pause"><i data-lucide="pause" class="w-4 h-4"></i></button>`);
        actions.push(`<button onclick="stopCampaign(${campaign.id})" class="p-1 text-red-600 hover:bg-red-50 rounded" title="Stop"><i data-lucide="square" class="w-4 h-4"></i></button>`);
    } else if (campaign.status === 'paused') {
        actions.push(`<button onclick="openEditIntervalModal(${campaign.id}, ${campaign.interval_minutes})" class="p-1 text-blue-600 hover:bg-blue-50 rounded" title="Edit Interval"><i data-lucide="settings" class="w-4 h-4"></i></button>`);
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

// ===== EDIT INTERVAL =====
function openEditIntervalModal(campaignId, currentInterval) {
    document.getElementById('editCampaignId').value = campaignId;
    document.getElementById('editIntervalValue').value = currentInterval;
    openModal('editIntervalModal');
}

async function handleEditIntervalSubmit(e) {
    e.preventDefault();
    
    const campaignId = document.getElementById('editCampaignId').value;
    const newInterval = document.getElementById('editIntervalValue').value;
    
    console.log('Updating interval:', { campaignId, newInterval });
    
    try {
        const result = await apiCall(`/blast/campaigns/${campaignId}/interval`, {
            method: 'PATCH',
            body: JSON.stringify({ interval_minutes: parseInt(newInterval) })
        });
        
        console.log('Update result:', result);
        showToast(`Interval berhasil diubah ke ${newInterval} menit`, 'success');
        closeModal('editIntervalModal');
        loadCampaigns();
    } catch (error) {
        console.error('Update interval error:', error);
        showToast('Gagal mengubah interval: ' + error.message, 'error');
    }
}

// ===== UTILITIES =====
function openModal(id) {
    document.getElementById(id).classList.add('active');
}

function closeModal(id) {
    document.getElementById(id).classList.remove('active');
}

// ===== PROCESS STATUS FUNCTIONS =====
async function openProcessStatus() {
    openModal('processModal');
    await loadProcessStatus();
}

async function loadProcessStatus() {
    try {
        const data = await apiCall('/blast/process-status');
        const { queueStats, activeCampaigns, pendingLogs, waStatus } = data.data;
        
        // Also fetch WA sessions for detailed status
        let waSessionsData = null;
        try {
            const sessionsRes = await apiCall('/whatsapp/sessions');
            waSessionsData = sessionsRes.data;
        } catch (e) {
            console.error('Failed to load WA sessions:', e);
        }

        // Render WA Status (Multi-session)
        const waStatusEl = document.getElementById('processWaStatus');
        if (waSessionsData) {
            const connectedSessions = waSessionsData.sessions.filter(s => s.status === 'connected');
            waStatusEl.innerHTML = waSessionsData.sessions.map(session => {
                const statusColors = {
                    'connected': 'bg-green-500',
                    'connecting': 'bg-yellow-500',
                    'qr_ready': 'bg-blue-500',
                    'disconnected': 'bg-gray-400'
                };
                const statusTextColors = {
                    'connected': 'text-green-600',
                    'connecting': 'text-yellow-600',
                    'qr_ready': 'text-blue-600',
                    'disconnected': 'text-gray-500'
                };
                return `
                    <div class="p-2 bg-gray-50 rounded-lg flex items-center justify-between">
                        <div class="flex items-center gap-2">
                            <span class="w-2 h-2 rounded-full ${statusColors[session.status] || 'bg-gray-400'}"></span>
                            <span class="font-medium text-gray-700">${session.label || session.sessionId}</span>
                        </div>
                        <div class="text-right">
                            <span class="${statusTextColors[session.status] || 'text-gray-500'} text-sm">${session.status}</span>
                            ${session.phone ? `<span class="text-xs text-gray-500 ml-1">(+${session.phone})</span>` : ''}
                        </div>
                    </div>
                `;
            }).join('');
            
            // Add summary
            waStatusEl.innerHTML += `
                <div class="mt-2 p-2 bg-blue-50 rounded-lg text-center">
                    <span class="font-medium text-blue-700">${connectedSessions.length}/${waSessionsData.maxSessions}</span>
                    <span class="text-blue-600 text-sm"> session connected</span>
                </div>
            `;
        } else {
            // Fallback to old style
            const statusColors = {
                'connected': 'text-green-600',
                'connecting': 'text-yellow-600',
                'disconnected': 'text-red-600'
            };
            waStatusEl.innerHTML = `
                <div class="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
                    <span class="w-3 h-3 rounded-full ${waStatus.status === 'connected' ? 'bg-green-500' : waStatus.status === 'connecting' ? 'bg-yellow-500' : 'bg-red-500'}"></span>
                    <span class="${statusColors[waStatus.status] || 'text-gray-600'} font-medium">${waStatus.status.toUpperCase()}</span>
                    ${waStatus.phone ? `<span class="text-gray-500">(${waStatus.phone})</span>` : ''}
                </div>
            `;
        }

        // Render Active Campaigns
        const campaignsEl = document.getElementById('processActiveCampaigns');
        if (activeCampaigns.length === 0) {
            campaignsEl.innerHTML = '<div class="text-gray-500 text-sm p-3 bg-gray-50 rounded-lg">Tidak ada campaign aktif</div>';
        } else {
            campaignsEl.innerHTML = activeCampaigns.map(c => {
                const progress = c.total_contacts > 0 
                    ? Math.round(((c.sent_count + c.failed_count + c.skipped_count) / c.total_contacts) * 100) 
                    : 0;
                const statusBadges = {
                    'running': 'bg-green-100 text-green-700',
                    'queued': 'bg-blue-100 text-blue-700',
                    'paused': 'bg-yellow-100 text-yellow-700'
                };
                return `
                    <div class="p-3 bg-gray-50 rounded-lg flex items-center justify-between">
                        <div>
                            <div class="font-medium text-gray-800">${c.name}</div>
                            <div class="text-sm text-gray-500">${c.template?.name || '-'} • ${c.group?.name || 'Semua'}</div>
                        </div>
                        <div class="text-right">
                            <span class="px-2 py-1 rounded-full text-xs ${statusBadges[c.status]}">${c.status}</span>
                            <div class="text-sm text-gray-600 mt-1">${progress}% (${c.sent_count}/${c.total_contacts})</div>
                        </div>
                    </div>
                `;
            }).join('');
        }

        // Render Pending Logs
        const logsEl = document.getElementById('processPendingLogs');
        if (pendingLogs.length === 0) {
            logsEl.innerHTML = '<div class="text-gray-500 text-sm p-3 bg-gray-50 rounded-lg">Tidak ada pesan pending</div>';
        } else {
            logsEl.innerHTML = pendingLogs.map(log => {
                const scheduledAt = new Date(log.scheduled_at);
                const now = new Date();
                const diffMs = scheduledAt - now;
                const diffMins = Math.floor(diffMs / 60000);
                const diffSecs = Math.floor((diffMs % 60000) / 1000);
                const timeStr = diffMs > 0 ? `${diffMins}m ${diffSecs}s` : 'Segera';
                
                return `
                    <div class="p-2 bg-gray-50 rounded flex items-center justify-between text-sm">
                        <div>
                            <span class="font-medium">${log.contact?.name || '-'}</span>
                            <span class="text-gray-500 ml-2">${log.contact?.phone || '-'}</span>
                        </div>
                        <div class="text-right">
                            <span class="text-blue-600">${timeStr}</span>
                            <div class="text-xs text-gray-400">${log.campaign?.name || '-'}</div>
                        </div>
                    </div>
                `;
            }).join('');
        }

        // Render Queue Stats
        const statsEl = document.getElementById('processQueueStats');
        statsEl.innerHTML = `
            <div class="grid grid-cols-3 gap-4 text-center">
                <div>
                    <div class="text-2xl font-bold text-blue-600">${queueStats.blast?.waiting || 0}</div>
                    <div class="text-xs text-gray-500">Blast Queue</div>
                </div>
                <div>
                    <div class="text-2xl font-bold text-yellow-600">${queueStats.validation?.waiting || 0}</div>
                    <div class="text-xs text-gray-500">Validation Queue</div>
                </div>
                <div>
                    <div class="text-2xl font-bold text-green-600">${queueStats.activeCampaigns || 0}</div>
                    <div class="text-xs text-gray-500">Active Campaigns</div>
                </div>
            </div>
        `;

        // Reinitialize icons
        if (window.lucide) lucide.createIcons();

    } catch (error) {
        showToast('Gagal memuat status proses', 'error');
    }
}

async function clearBlastQueue() {
    if (!confirm('Apakah Anda yakin ingin menghentikan semua campaign dan menghapus semua pesan pending?')) {
        return;
    }

    try {
        const data = await apiCall('/blast/clear-queue', { method: 'POST' });
        showToast(data.message, 'success');
        await loadProcessStatus();
        loadCampaigns();
    } catch (error) {
        showToast('Gagal clear queue', 'error');
    }
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
    
    const { page, totalPages, total } = pagination;
    const callbackName = `paginationCallback${containerId}`;
    
    let html = `<span class="text-sm text-gray-500">Halaman ${page} dari ${totalPages} (${total} data)</span>`;
    html += '<div class="flex items-center gap-1">';
    
    // Prev button
    if (page > 1) {
        html += `<button onclick="window.${callbackName}(${page - 1})" class="px-2 py-1 border rounded hover:bg-gray-50 text-sm">
            <i data-lucide="chevron-left" class="w-4 h-4"></i>
        </button>`;
    } else {
        html += `<button disabled class="px-2 py-1 border rounded text-gray-300 cursor-not-allowed text-sm">
            <i data-lucide="chevron-left" class="w-4 h-4"></i>
        </button>`;
    }
    
    // Generate page numbers
    const pageNumbers = generatePageNumbers(page, totalPages);
    
    pageNumbers.forEach(p => {
        if (p === '...') {
            html += `<span class="px-2 py-1 text-gray-400 text-sm">...</span>`;
        } else if (p === page) {
            html += `<button class="px-3 py-1 bg-blue-500 text-white rounded text-sm font-medium">${p}</button>`;
        } else {
            html += `<button onclick="window.${callbackName}(${p})" class="px-3 py-1 border rounded hover:bg-gray-50 text-sm">${p}</button>`;
        }
    });
    
    // Next button
    if (page < totalPages) {
        html += `<button onclick="window.${callbackName}(${page + 1})" class="px-2 py-1 border rounded hover:bg-gray-50 text-sm">
            <i data-lucide="chevron-right" class="w-4 h-4"></i>
        </button>`;
    } else {
        html += `<button disabled class="px-2 py-1 border rounded text-gray-300 cursor-not-allowed text-sm">
            <i data-lucide="chevron-right" class="w-4 h-4"></i>
        </button>`;
    }
    
    html += '</div>';
    container.innerHTML = html;
    
    // Re-render icons
    if (window.lucide) lucide.createIcons();
    
    window[callbackName] = callback;
}

function generatePageNumbers(currentPage, totalPages) {
    const pages = [];
    const delta = 2; // Number of pages to show around current page
    
    if (totalPages <= 7) {
        // Show all pages if total is small
        for (let i = 1; i <= totalPages; i++) {
            pages.push(i);
        }
    } else {
        // Always show first page
        pages.push(1);
        
        if (currentPage > delta + 2) {
            pages.push('...');
        }
        
        // Pages around current
        const start = Math.max(2, currentPage - delta);
        const end = Math.min(totalPages - 1, currentPage + delta);
        
        for (let i = start; i <= end; i++) {
            if (!pages.includes(i)) {
                pages.push(i);
            }
        }
        
        if (currentPage < totalPages - delta - 1) {
            pages.push('...');
        }
        
        // Always show last page
        if (!pages.includes(totalPages)) {
            pages.push(totalPages);
        }
    }
    
    return pages;
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
