const API_BASE = '/api';

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
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        maximumFractionDigits: 0
    }).format(number);
};

const formatTime = (isoString) => {
    if (!isoString) return '--:--';
    return new Date(isoString).toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit'
    });
};

const calculateTimeDiff = (startTimeISO) => {
    const start = new Date(startTimeISO);
    const now = new Date();
    const diffMs = Math.max(0, now - start);
    
    const hours = Math.floor(diffMs / 3600000);
    const minutes = Math.floor((diffMs % 3600000) / 60000);
    const seconds = Math.floor((diffMs % 60000) / 1000);
    
    return {
        hours,
        minutes,
        seconds,
        formatted: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    };
};

const calculateCountdown = (endTimeISO) => {
    const end = new Date(endTimeISO);
    const now = new Date();
    const diffMs = Math.max(0, end - now);
    
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
        return []; // Return empty array instead of null to prevent crashes
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

async function putData(endpoint, data) {
    try {
        const response = await fetch(`${API_BASE}${endpoint}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        return await response.json();
    } catch (error) {
        console.error(`Error putting ${endpoint}:`, error);
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
            <li class="nav-label">ADMIN:</li>
            <li><a href="admin.html" class="${activePage === 'admin' ? 'active-admin' : ''}">Menu</a></li>
            <li><a href="karaoke-settings.html" class="${activePage === 'karaoke-settings' ? 'active-admin' : ''}">Ruang</a></li>
            <li><a href="rental.html" class="${activePage === 'rental' ? 'active-admin' : ''}">Meja</a></li>
            <li><a href="finance.html" class="${activePage === 'finance' ? 'active-admin' : ''}">Laporan</a></li>
            <li><a href="attendance-admin.html" class="${activePage === 'attendance-admin' ? 'active-admin' : ''}">Staf</a></li>
            
            <li class="nav-divider"></li>
            
            <li class="nav-label">KASIR:</li>
            <li><a href="index.html" class="${activePage === 'billiard' ? 'active' : ''}">Billiard</a></li>
            <li><a href="karaoke.html" class="${activePage === 'karaoke' ? 'active' : ''}">Karaoke</a></li>
            <li><a href="pos.html" class="${activePage === 'pos' ? 'active' : ''}">F&B</a></li>
            <li class="nav-divider"></li>
            <li><a href="#" onclick="confirmRestart()" style="color: var(--danger);">Restart</a></li>
        `;
    } else {
        navHtml += `
            <li class="nav-label">KASIR:</li>
            <li><a href="index.html" class="${activePage === 'billiard' ? 'active' : ''}">Billiard</a></li>
            <li><a href="karaoke.html" class="${activePage === 'karaoke' ? 'active' : ''}">Karaoke</a></li>
            <li><a href="pos.html" class="${activePage === 'pos' ? 'active' : ''}">F&B</a></li>
            <li><a href="attendance.html" class="${activePage === 'attendance' ? 'active' : ''}">Absensi</a></li>
            <li class="nav-divider"></li>
            <li><a href="#" onclick="confirmRestart()" style="color: var(--danger);">Restart</a></li>
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

function confirmRestart() {
    if (confirm('Apakah Anda yakin ingin me-restart sistem? Aplikasi akan berhenti sejenak dan menyala kembali.')) {
        fetch('/api/restart', { method: 'POST' })
            .then(() => {
                alert('Sistem sedang di-restart. Tunggu 5-10 detik lalu refresh halaman.');
            })
            .catch(() => {
                alert('Perintah restart dikirim. Tunggu beberapa saat.');
            });
    }
}

function printReceipt(data) {
    const printWindow = document.createElement('div');
    printWindow.className = 'thermal-receipt';
    
    const now = new Date();
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
                <p>Durasi: ${data.durationMinutes} menit</p>
            </div>
        `;
        if (data.orders && data.orders.length > 0) {
            itemsHtml += '<div class="divider"></div>';
            data.orders.forEach(item => {
                itemsHtml += `
                    <div class="item-row">
                        <span>${item.name} x${item.qty}</span>
                        <span>${formatRupiah(item.subtotal)}</span>
                    </div>
                `;
            });
        }
    } else {
        // F&B POS Receipt
        data.items.forEach(item => {
            itemsHtml += `
                <div class="item-row">
                    <span>${item.name} x${item.quantity}</span>
                    <span>${formatRupiah(item.price * item.quantity)}</span>
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
            <span>${formatRupiah(data.amount)}</span>
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
