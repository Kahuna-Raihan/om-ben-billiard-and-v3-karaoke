const API_BASE = '/api';

// --- TIME SYNC SYSTEM ---
let serverTimeOffset = 0;
async function syncTime() {
    try {
        const start = Date.now();
        const response = await fetch(`${API_BASE}/time`);
        const { serverTime } = await response.json();
        const end = Date.now();
        const latency = (end - start) / 2;
        serverTimeOffset = (serverTime + latency) - end;
        console.log('Time synced. Offset:', serverTimeOffset, 'ms');
    } catch (e) {
        console.error('Time sync failed', e);
    }
}
syncTime();
setInterval(syncTime, 60000); // Sync every minute

function getSyncedNow() {
    return new Date(Date.now() + serverTimeOffset);
}

// --- AUTH GUARD ---
if (!window.location.href.includes('login.html')) {
    const role = localStorage.getItem('auth_role');
    if (!role) {
        window.location.href = 'login.html';
    }
}

function logout() {
    localStorage.removeItem('auth_role');
    localStorage.removeItem('auth_user');
    localStorage.removeItem('auth_profile_pic');
    window.location.href = 'login.html';
}

const formatRupiah = (number) => {
    if (number === undefined || number === null) return 'Rp -';
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        maximumFractionDigits: 0
    }).format(number);
};

const formatTime = (isoString) => {
    if (!isoString) return '--:--';
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return '--:--';
    return date.toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit'
    });
};

const calculateTimeDiff = (startTimeISO) => {
    if (!startTimeISO) return { hours: 0, minutes: 0, seconds: 0, formatted: '00:00:00' };
    const start = new Date(startTimeISO);
    const now = getSyncedNow();
    const diffMs = Math.max(0, now.getTime() - start.getTime());
    
    const hours = Math.floor(diffMs / 3600000);
    const minutes = Math.floor((diffMs % 3600000) / 60000);
    const seconds = Math.floor((diffMs % 60000) / 1000);
    
    return {
        hours,
        minutes,
        seconds,
        totalMinutes: Math.floor(diffMs / 60000),
        formatted: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    };
};

const calculateCountdown = (endTimeISO) => {
    if (!endTimeISO) return { hours: 0, minutes: 0, seconds: 0, isExpired: true, formatted: '00:00:00' };
    const end = new Date(endTimeISO);
    const now = getSyncedNow();
    const diffMs = Math.max(0, end.getTime() - now.getTime());
    
    const hours = Math.floor(diffMs / 3600000);
    const minutes = Math.floor((diffMs % 3600000) / 60000);
    const seconds = Math.floor((diffMs % 60000) / 1000);
    
    return {
        hours,
        minutes,
        seconds,
        isExpired: diffMs <= 0,
        formatted: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    };
};

async function fetchData(endpoint) {
    try {
        const response = await fetch(`${API_BASE}${endpoint}`);
        if (!response.ok) throw new Error('Network response was not ok');
        return await response.json();
    } catch (error) {
        console.error(`Error fetching ${endpoint}:`, error);
        return [];
    }
}

async function postData(endpoint, data) {
    try {
        const response = await fetch(`${API_BASE}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        return await response.json();
    } catch (error) {
        console.error(`Error posting ${endpoint}:`, error);
        return null;
    }
}

async function deleteData(endpoint) {
    try {
        const response = await fetch(`${API_BASE}${endpoint}`, {
            method: 'DELETE'
        });
        return await response.json();
    } catch (error) {
        console.error(`Error deleting ${endpoint}:`, error);
        return null;
    }
}

function renderNavbar(activePage) {
    const role = localStorage.getItem('auth_role');
    const username = localStorage.getItem('auth_user') || 'User';
    const nav = document.querySelector('nav');
    if (!nav) return;

    let navHtml = '<ul>';
    
    if (role === 'admin') {
        navHtml += `
            <li class="nav-label">ADMIN PANEL:</li>
            <li><a href="admin.html" class="${activePage === 'admin' ? 'active-admin' : ''}">🍔 Menu F&B</a></li>
            <li><a href="karaoke-settings.html" class="${activePage === 'karaoke-settings' ? 'active-admin' : ''}">🎤 Ruangan</a></li>
            <li><a href="rental.html" class="${activePage === 'rental' ? 'active-admin' : ''}">🎱 Meja</a></li>
            <li class="nav-divider"></li>
            <li><a href="monitoring.html" class="${activePage === 'monitoring' ? 'active-admin' : ''}" style="color:var(--primary-color)">📡 LIVE MONITOR</a></li>
            <li><a href="cctv.html" class="${activePage === 'cctv' ? 'active-admin' : ''}" style="color:var(--primary-color)">📹 CCTV</a></li>
            <li><a href="stock-history.html" class="${activePage === 'stock-history' ? 'active-admin' : ''}" style="color:var(--secondary-color)">📦 STOK</a></li>
            <li><a href="finance.html" class="${activePage === 'finance' ? 'active-admin' : ''}">📊 LAPORAN</a></li>
            <li><a href="attendance-admin.html" class="${activePage === 'attendance-admin' ? 'active-admin' : ''}">👥 STAF</a></li>
        `;
    } else {
        navHtml += `
            <li class="nav-label">KASIR:</li>
            <li><a href="index.html" class="${activePage === 'billiard' ? 'active' : ''}">Billiard</a></li>
            <li><a href="karaoke.html" class="${activePage === 'karaoke' ? 'active' : ''}">Karaoke</a></li>
            <li><a href="pos.html" class="${activePage === 'pos' ? 'active' : ''}">F&B</a></li>
            <li><a href="attendance.html" class="${activePage === 'attendance' ? 'active' : ''}">Absensi</a></li>
        `;
    }

    navHtml += `
        <li class="nav-divider"></li>
        <li style="margin-left: auto; display: flex; align-items: center; gap: 1rem;">
            ${role === 'admin' ? `<a href="users-admin.html" class="${activePage === 'users-admin' ? 'active-admin' : ''}" style="color: var(--primary-color); font-size: 0.8rem;">⚙️ Manajemen User</a>` : ''}
            <a href="profile.html" class="${activePage === 'profile' ? 'active' : ''}" style="color: var(--secondary-color); display: flex; align-items: center; gap: 0.5rem; text-decoration: none;">
                <img src="${localStorage.getItem('auth_profile_pic') || 'assets/logo.png'}" style="width: 24px; height: 24px; border-radius: 50%; object-fit: cover; border: 1px solid var(--primary-color);">
                <span>${username}</span>
            </a>
            <a href="#" onclick="logout()" style="color: var(--danger); font-size: 0.8rem; border: 1px solid rgba(231,76,60,0.2); padding: 4px 10px; border-radius: 8px;">Logout</a>
        </li>
    </ul>`;
    
    nav.innerHTML = navHtml;
}

function printReceipt(data) {
    if (!data) return;
    const printWindow = document.createElement('div');
    printWindow.className = 'thermal-receipt';
    
    const now = getSyncedNow();
    const dateStr = now.toLocaleDateString('id-ID');
    const timeStr = now.toLocaleTimeString('id-ID');

    let itemsHtml = '';
    if (data.type === 'billiard' || data.type === 'karaoke' || data.tableName) {
        itemsHtml = `
            <div class="item-row">
                <span>Sewa ${data.tableName || 'Ruangan'}</span>
                <span>${formatRupiah(data.tableAmount || data.amount)}</span>
            </div>
            <div class="item-row">
                <p>Durasi: ${data.durationMinutes || 0} menit</p>
            </div>
        `;
        if (data.orders && data.orders.length > 0) {
            itemsHtml += '<div class="divider"></div>';
            data.orders.forEach(item => {
                itemsHtml += `
                    <div class="item-row">
                        <span>${item.name} x${item.qty || item.quantity}</span>
                        <span>${formatRupiah(item.subtotal)}</span>
                    </div>
                `;
            });
        }
    } else if (data.orders || data.items) {
        const items = data.orders || data.items;
        items.forEach(item => {
            itemsHtml += `
                <div class="item-row">
                    <span>${item.name} x${item.qty || item.quantity}</span>
                    <span>${formatRupiah(item.subtotal || (item.price * item.quantity))}</span>
                </div>
            `;
        });
    }

    printWindow.innerHTML = `
        <div style="text-align:center; margin-bottom: 2mm;">
            <h2 style="margin:0; font-size: 14pt;">OM BEN BILLIARD</h2>
            <p style="margin:0; font-size: 10pt;">X V3 KARAOKE</p>
        </div>
        <div class="divider"></div>
        <p>No: TR-${Date.now().toString().slice(-6)}</p>
        <p>Tgl: ${dateStr} ${timeStr}</p>
        <p>Kasir: ${localStorage.getItem('auth_user') || 'Staff'}</p>
        <p>Plgn: ${data.customerName || 'Customer'}</p>
        <div class="divider"></div>
        ${itemsHtml}
        <div class="divider"></div>
        <div class="total-row">
            <span>TOTAL</span>
            <span>${formatRupiah(data.amount || data.totalAmount)}</span>
        </div>
        <div class="divider"></div>
        <div class="footer">
            <p>Terima Kasih Atas Kunjungan Anda</p>
            <p>Selamat Datang Kembali!</p>
        </div>
    `;

    document.body.appendChild(printWindow);
    window.print();
    document.body.removeChild(printWindow);
}
