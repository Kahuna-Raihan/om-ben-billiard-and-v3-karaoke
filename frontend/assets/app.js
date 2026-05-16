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
    } catch (e) {}
}
syncTime();
setInterval(syncTime, 60000);

function getSyncedNow() {
    return new Date(Date.now() + serverTimeOffset);
}

// --- AUTH GUARD ---
if (!window.location.href.includes('login.html')) {
    if (!localStorage.getItem('auth_role')) window.location.href = 'login.html';
}

function logout() {
    localStorage.clear();
    window.location.href = 'login.html';
}

const formatRupiah = (n) => {
    if (n === undefined || n === null) return 'Rp -';
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n);
};

const formatTime = (iso) => {
    if (!iso) return '--:--';
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '--:--' : d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
};

const calculateTimeDiff = (startISO) => {
    const start = new Date(startISO);
    const diff = Math.max(0, getSyncedNow() - start);
    const h = Math.floor(diff / 3600000), m = Math.floor((diff % 3600000) / 60000), s = Math.floor((diff % 60000) / 1000);
    return { h, m, s, formatted: `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}` };
};

const calculateCountdown = (endISO) => {
    const end = new Date(endISO);
    const diff = Math.max(0, end - getSyncedNow());
    const h = Math.floor(diff / 3600000), m = Math.floor((diff % 3600000) / 60000), s = Math.floor((diff % 60000) / 1000);
    return { h, m, s, isExpired: diff <= 0, formatted: `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}` };
};

async function fetchData(ep) { try { return await (await fetch(`${API_BASE}${ep}`)).json(); } catch(e){ return []; } }
async function postData(ep, data) { try { return await (await fetch(`${API_BASE}${ep}`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data) })).json(); } catch(e){ return null; } }
async function deleteData(ep) { try { return await (await fetch(`${API_BASE}${ep}`, { method: 'DELETE' })).json(); } catch(e){ return null; } }

function renderNavbar(active) {
    const role = localStorage.getItem('auth_role');
    const user = localStorage.getItem('auth_user') || 'User';
    const nav = document.querySelector('nav');
    if (!nav) return;

    let html = '<ul>';
    if (role === 'admin') {
        html += `
            <li class="nav-label">ADMIN PANEL:</li>
            <li><a href="admin.html" class="${active === 'admin' ? 'active-admin' : ''}">🍔 Menu</a></li>
            <li><a href="karaoke-settings.html" class="${active === 'karaoke-settings' ? 'active-admin' : ''}">🎤 Ruang</a></li>
            <li><a href="rental.html" class="${active === 'rental' ? 'active-admin' : ''}">🎱 Meja</a></li>
            <li class="nav-divider"></li>
            <li><a href="monitoring.html" class="${active === 'monitoring' ? 'active-admin' : ''}" style="color:var(--primary-color)">📡 LIVE</a></li>
            <li><a href="cctv.html" class="${active === 'cctv' ? 'active-admin' : ''}" style="color:var(--primary-color)">📹 CCTV</a></li>
            <li><a href="stock-history.html" class="${active === 'stock-history' ? 'active-admin' : ''}" style="color:var(--secondary-color)">📦 STOK</a></li>
            <li><a href="finance.html" class="${active === 'finance' ? 'active-admin' : ''}">📊 LAPORAN</a></li>
            <li><a href="attendance-admin.html" class="${active === 'attendance-admin' ? 'active-admin' : ''}">👥 STAF</a></li>
        `;
    } else {
        html += `
            <li class="nav-label">KASIR:</li>
            <li><a href="index.html" class="${active === 'billiard' ? 'active' : ''}">Billiard</a></li>
            <li><a href="karaoke.html" class="${active === 'karaoke' ? 'active' : ''}">Karaoke</a></li>
            <li><a href="pos.html" class="${active === 'pos' ? 'active' : ''}">F&B</a></li>
        `;
    }
    html += `
        <li style="margin-left: auto; display: flex; align-items: center; gap: 1rem;">
            ${role === 'admin' ? `<a href="users-admin.html" class="${active === 'users-admin' ? 'active-admin' : ''}" style="color: var(--primary-color); font-size: 0.8rem;">⚙️ User</a>` : ''}
            <a href="profile.html" class="${active === 'profile' ? 'active' : ''}" style="display: flex; align-items: center; gap: 0.5rem; text-decoration: none; color: white;">
                <img src="${localStorage.getItem('auth_profile_pic') || 'assets/logo.png'}" style="width: 24px; height: 24px; border-radius: 50%; border: 1px solid var(--primary-color);">
                <span>${user}</span>
            </a>
            <a href="#" onclick="logout()" style="color: var(--danger); font-size: 0.8rem;">Logout</a>
        </li>
    </ul>`;
    nav.innerHTML = html;
}

// --- NEW ROBUST PRINT SYSTEM ---
function printReceipt(data) {
    if (!data) return alert('Data struk tidak tersedia!');
    
    const printWindow = window.open('', '_blank', 'width=300,height=600');
    const now = getSyncedNow();
    
    let itemsHtml = '';
    if (data.tableName) {
        itemsHtml = `
            <div class="row"><span>Sewa ${data.tableName}</span> <span>${formatRupiah(data.tableAmount || data.amount)}</span></div>
            <div class="row"><small>Durasi: ${data.durationMinutes || 0} Menit</small></div>
        `;
        if (data.orders && data.orders.length > 0) {
            itemsHtml += '<div class="divider"></div>';
            data.orders.forEach(o => {
                itemsHtml += `<div class="row"><span>${o.name} x${o.qty}</span> <span>${formatRupiah(o.subtotal)}</span></div>`;
            });
        }
    } else if (data.orders) {
        data.orders.forEach(o => {
            itemsHtml += `<div class="row"><span>${o.name} x${o.qty || o.quantity}</span> <span>${formatRupiah(o.subtotal)}</span></div>`;
        });
    }

    printWindow.document.write(`
        <html>
        <head>
            <title>Struk Pembayaran</title>
            <style>
                @page { margin: 0; size: 58mm auto; }
                body { font-family: 'Courier New', monospace; padding: 5mm; width: 48mm; font-size: 11px; line-height: 1.4; }
                .text-center { text-align: center; }
                .divider { border-top: 1px dashed #000; margin: 5px 0; }
                .row { display: flex; justify-content: space-between; }
                .bold { font-weight: bold; }
                .total { font-size: 14px; margin-top: 5px; border-top: 1px solid #000; padding-top: 5px; }
            </style>
        </head>
        <body>
            <div class="text-center">
                <h2 style="margin:0; font-size:16px;">OM BEN BILLIARD</h2>
                <p style="margin:2px 0;">X V3 KARAOKE</p>
                <p style="font-size:9px;">${now.toLocaleString('id-ID')}</p>
            </div>
            <div class="divider"></div>
            <div class="row"><span>Kasir:</span> <span>${localStorage.getItem('auth_user')}</span></div>
            <div class="row"><span>Pelanggan:</span> <span>${data.customerName || 'Customer'}</span></div>
            <div class="divider"></div>
            ${itemsHtml}
            <div class="divider"></div>
            <div class="row bold total"><span>TOTAL</span> <span>${formatRupiah(data.amount || data.totalAmount)}</span></div>
            <div class="divider"></div>
            <div class="text-center" style="margin-top:10px;">
                <p>Terima Kasih!</p>
                <p>Selamat Datang Kembali</p>
            </div>
            <script>
                window.onload = function() { window.print(); setTimeout(() => window.close(), 500); }
            </script>
        </body>
        </html>
    `);
    printWindow.document.close();
}
