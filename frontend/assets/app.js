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

// --- SHOP SETTINGS LOCK GUARD ---
async function checkShopStatusLock() {
    // Only apply shop status lock to CASHIER/OPERATOR dashboards
    // Admin, db-admin, and public reservasi are exempt or handled separately
    const isCashierPage = 
        window.location.href.includes('index.html') || 
        window.location.href.includes('karaoke.html') ||
        window.location.href.includes('pos.html');
        
    if (isCashierPage) {
        try {
            const res = await fetch(`${API_BASE}/settings`);
            const settings = await res.json();
            if (settings && (settings.shopOpen === false || settings.shopOpen === 'false')) {
                // Cashier server/dashboard is turned off / locked!
                // Create a full page glassmorphic overlay that cannot be closed.
                const lockOverlay = document.createElement('div');
                lockOverlay.style.position = 'fixed';
                lockOverlay.style.top = '0';
                lockOverlay.style.left = '0';
                lockOverlay.style.width = '100vw';
                lockOverlay.style.height = '100vh';
                lockOverlay.style.background = 'rgba(10, 10, 20, 0.98)';
                lockOverlay.style.backdropFilter = 'blur(20px)';
                lockOverlay.style.display = 'flex';
                lockOverlay.style.flexDirection = 'column';
                lockOverlay.style.justifyContent = 'center';
                lockOverlay.style.alignItems = 'center';
                lockOverlay.style.zIndex = '999999';
                lockOverlay.style.color = '#ffffff';
                lockOverlay.style.textAlign = 'center';
                lockOverlay.style.padding = '2rem';
                
                lockOverlay.innerHTML = `
                    <div style="max-width: 600px; background: rgba(231, 76, 60, 0.05); border: 2px solid rgba(231, 76, 60, 0.4); border-radius: 24px; padding: 3rem 2rem; box-shadow: 0 0 50px rgba(231,76,60,0.25);">
                        <div style="font-size: 5rem; margin-bottom: 1.5rem; animation: pulse 2s infinite;">🔒</div>
                        <h1 style="color: #e74c3c; font-family: var(--font-heading); margin-bottom: 1.5rem; font-weight: 900; letter-spacing: 1px; font-size: 2rem; text-shadow: 0 0 20px rgba(231,76,60,0.3);">
                            SISTEM OPERASIONAL NONAKTIF
                        </h1>
                        <p style="font-size: 1.1rem; line-height: 1.6; color: #eceff1; margin-bottom: 1.5rem;">
                            Saat ini status toko diatur **TUTUP (Operasional Dinonaktifkan)** oleh Administrator / Manager.
                        </p>
                        <p style="font-size: 0.9rem; line-height: 1.5; color: var(--text-dim); margin-bottom: 2.5rem;">
                            Semua fitur kasir, pemesanan F&B, dan transaksi rental meja billiard/karaoke telah dikunci demi keamanan. Silakan hubungi Administrator untuk mengubah status menjadi BUKA agar sistem dapat digunakan kembali.
                        </p>
                        <div style="display: flex; gap: 1rem; justify-content: center;">
                            <button onclick="window.location.reload()" class="btn btn-outline" style="width: auto; padding: 0.6rem 1.5rem; font-weight: bold; border-color: rgba(255,255,255,0.2); color: white; cursor: pointer;">
                                ↻ Coba Muat Ulang
                            </button>
                            <button onclick="logout()" class="btn btn-primary" style="width: auto; padding: 0.6rem 1.5rem; font-weight: bold; background: #e74c3c; border-color: #e74c3c; cursor: pointer;">
                                🚪 Keluar Akun
                            </button>
                        </div>
                    </div>
                `;
                document.body.appendChild(lockOverlay);
            }
        } catch (e) {
            console.error("Failed to verify store operational lock status:", e);
        }
    }
}
checkShopStatusLock();

// --- AUTH GUARD ---
if (!window.location.href.includes('login.html') && !window.location.href.includes('attendance.html') && !window.location.href.includes('reservasi.html')) {
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
async function putData(ep, data) { try { return await (await fetch(`${API_BASE}${ep}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data) })).json(); } catch(e){ return null; } }
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
            <li><a href="bookings.html" class="${active === 'bookings' ? 'active-admin' : ''}" style="color: var(--accent-gold)">📅 BOOKING</a></li>
            <li><a href="db-admin.html" class="${active === 'db-admin' ? 'active-admin' : ''}" style="color: #00f3ff">💾 BACKUP</a></li>
        `;
    } else {
        html += `
            <li class="nav-label">KASIR:</li>
            <li><a href="index.html" class="${active === 'billiard' ? 'active' : ''}">🎱 Billiard</a></li>
            <li><a href="karaoke.html" class="${active === 'karaoke' ? 'active' : ''}">🎤 Karaoke</a></li>
            <li><a href="pos.html" class="${active === 'pos' ? 'active' : ''}">🍔 F&B</a></li>
            <li><a href="bookings.html" class="${active === 'bookings' ? 'active' : ''}" style="color: var(--accent-gold)">📅 Booking</a></li>
        `;
    }
    
    const profilePic = localStorage.getItem('auth_profile_pic') || 'assets/logo.png';
    html += `
        <li class="nav-user-section">
            ${role === 'admin' ? `<a href="users-admin.html" class="${active === 'users-admin' ? 'active-admin' : ''}" style="color: var(--primary-color);">⚙️</a>` : ''}
            <a href="profile.html" class="profile-link ${active === 'profile' ? 'active' : ''}">
                <img src="${profilePic}" class="nav-avatar">
                <span class="nav-username">${user}</span>
            </a>
            <button onclick="logout()" class="logout-btn">🚪</button>
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
            <\/script>
        </body>
        </html>
    `);
    printWindow.document.close();
}

// --- CROSS-TAB ALARM SYSTEM & BROADCAST CHANNEL ---

// Define admin pages to bypass the alarm system completely
const isAdminPage = 
    window.location.href.includes('db-admin.html') || 
    window.location.href.includes('admin.html') || 
    window.location.href.includes('users-admin.html') || 
    window.location.href.includes('attendance-admin.html') || 
    window.location.href.includes('finance.html') || 
    window.location.href.includes('karaoke-settings.html') || 
    window.location.href.includes('rental.html') ||
    window.location.href.includes('stock-history.html') ||
    window.location.href.includes('monitoring.html') ||
    window.location.href.includes('cctv.html') ||
    window.location.href.includes('bookings.html');

if (!isAdminPage) {
    // Injection of Alarm Alert CSS
    const alarmStyle = document.createElement('style');
    alarmStyle.textContent = `
        @keyframes pulseAlarm {
            0% { transform: translate(-50%, 0) scale(1); box-shadow: 0 10px 30px rgba(255,0,0,0.5); }
            50% { transform: translate(-50%, 0) scale(1.05); box-shadow: 0 10px 50px rgba(255,0,0,0.8); }
            100% { transform: translate(-50%, 0) scale(1); box-shadow: 0 10px 30px rgba(255,0,0,0.5); }
        }
        .pulse-danger {
            animation: pulseDanger 1s infinite alternate;
        }
        @keyframes pulseDanger {
            from { background-color: rgba(255, 0, 0, 0.2); }
            to { background-color: rgba(255, 0, 0, 0.6); }
        }
    `;
    document.head.appendChild(alarmStyle);
}

let alarmAudioCtx = null;
let alarmInterval = null;

// Unlocking Web Audio API on mobile devices on first user gesture
function unlockAudioContext() {
    if (isAdminPage) return;
    if (!alarmAudioCtx) {
        alarmAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (alarmAudioCtx && alarmAudioCtx.state === 'suspended') {
        alarmAudioCtx.resume().then(() => {
            console.log("AudioContext successfully unlocked!");
        }).catch(e => console.error("AudioContext unlock failed:", e));
    }
    // Remove listeners once successfully initialized
    document.removeEventListener('click', unlockAudioContext);
    document.removeEventListener('touchstart', unlockAudioContext);
}

if (!isAdminPage) {
    document.addEventListener('click', unlockAudioContext, { passive: true });
    document.addEventListener('touchstart', unlockAudioContext, { passive: true });
}

function startAlarmSound() {
    if (isAdminPage) return;
    if (alarmInterval) return; // already running
    
    if (!alarmAudioCtx) {
        alarmAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    
    if (alarmAudioCtx.state === 'suspended') {
        alarmAudioCtx.resume();
    }

    const playBeep = (timeOffset, duration) => {
        const osc1 = alarmAudioCtx.createOscillator();
        const osc2 = alarmAudioCtx.createOscillator();
        const gainNode = alarmAudioCtx.createGain();

        osc1.type = 'sawtooth';
        osc1.frequency.setValueAtTime(880, alarmAudioCtx.currentTime + timeOffset); // A5 note (piercing)
        
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(1320, alarmAudioCtx.currentTime + timeOffset); // E6 note (Fifth harmonic, sharp)

        gainNode.gain.setValueAtTime(0.85, alarmAudioCtx.currentTime + timeOffset); // Very loud
        gainNode.gain.exponentialRampToValueAtTime(0.01, alarmAudioCtx.currentTime + timeOffset + duration - 0.02);

        osc1.connect(gainNode);
        osc2.connect(gainNode);
        gainNode.connect(alarmAudioCtx.destination);

        osc1.start(alarmAudioCtx.currentTime + timeOffset);
        osc1.stop(alarmAudioCtx.currentTime + timeOffset + duration);
        
        osc2.start(alarmAudioCtx.currentTime + timeOffset);
        osc2.stop(alarmAudioCtx.currentTime + timeOffset + duration);
    };

    // Rhythmic double-beep: Beep 1 at 0s, Beep 2 at 0.22s, repeats every 1.0s
    alarmInterval = setInterval(() => {
        try {
            playBeep(0, 0.18);
            playBeep(0.22, 0.18);
        } catch (e) {
            console.error("Audio alarm play error:", e);
        }
    }, 1000);
}

function stopAlarmSound() {
    if (alarmInterval) {
        clearInterval(alarmInterval);
        alarmInterval = null;
    }
}

// Global cross-tab tracking
const alarmedSessions = new Set();
const alarmChannel = new BroadcastChannel('v3-billiard-karaoke-alarms');

// Inject the custom notification banner UI
function injectAlarmBanner() {
    if (isAdminPage) return;
    if (document.getElementById('alarm-notification-banner')) return;
    const banner = document.createElement('div');
    banner.id = 'alarm-notification-banner';
    banner.style.cssText = `
        display: none;
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translate(-50%, 0);
        z-index: 10000;
        background: linear-gradient(135deg, #ff0844 0%, #ffb199 100%);
        border: 3px solid #fff;
        border-radius: 20px;
        padding: 1.5rem 2rem;
        box-shadow: 0 15px 40px rgba(255,0,0,0.6);
        width: 90%;
        max-width: 550px;
        text-align: center;
        color: white;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
        animation: pulseAlarm 1.2s infinite;
    `;
    
    banner.innerHTML = `
        <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">🚨</div>
        <h2 style="margin: 0 0 0.5rem 0; font-size: 1.6rem; font-weight: 800; letter-spacing: 1px; text-transform: uppercase;">Waktu Habis!</h2>
        <p id="alarm-banner-message" style="margin: 0 0 1.5rem 0; font-size: 1.2rem; font-weight: bold; line-height: 1.4; background: rgba(0,0,0,0.15); padding: 0.8rem; border-radius: 10px;"></p>
        <button id="dismiss-alarm-btn" style="background: white; color: #ff0844; border: none; padding: 0.8rem 2.5rem; border-radius: 50px; font-weight: 900; cursor: pointer; font-size: 1.1rem; box-shadow: 0 5px 15px rgba(0,0,0,0.3); transition: all 0.2s; text-transform: uppercase; letter-spacing: 0.5px;">MATIKAN ALARM 🔕</button>
    `;
    
    document.body.appendChild(banner);
    
    document.getElementById('dismiss-alarm-btn').onclick = () => {
        dismissActiveAlarm();
    };
}

if (!isAdminPage) {
    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', injectAlarmBanner);
    } else {
        injectAlarmBanner();
    }
}

function showExpirationAlert(tableName, customerName, targetType, sessionId) {
    if (isAdminPage) return;
    const banner = document.getElementById('alarm-notification-banner');
    const msgEl = document.getElementById('alarm-banner-message');
    if (banner && msgEl) {
        const typeLabel = (targetType === 'room') ? '🎤 KARAOKE' : '🎱 BILLIARD';
        msgEl.innerHTML = `<span style="color: #ffeb3b; font-weight: 900;">[${typeLabel}]</span><br>Sewa <strong style="font-size: 1.3rem;">${tableName}</strong> oleh <strong>${customerName || 'Pelanggan'}</strong> telah selesai!`;
        banner.style.display = 'block';
    }
    
    if (sessionId) alarmedSessions.add(sessionId);
    startAlarmSound();
}

function hideExpirationAlert() {
    const banner = document.getElementById('alarm-notification-banner');
    if (banner) {
        banner.style.display = 'none';
    }
}

// Public global triggers called by individual timers
function triggerSessionExpired(session) {
    if (isAdminPage) return;
    if (alarmedSessions.has(session.id)) return;
    
    // Play locally
    showExpirationAlert(session.tableName, session.customerName, session.targetType || 'table', session.id);
    
    // Broadcast to other tabs
    alarmChannel.postMessage({
        type: 'SESSION_EXPIRED',
        sessionId: session.id,
        tableName: session.tableName,
        customerName: session.customerName,
        targetType: session.targetType || 'table'
    });
}

function dismissActiveAlarm() {
    stopAlarmSound();
    hideExpirationAlert();
    
    // Broadcast dismiss to other tabs
    alarmChannel.postMessage({
        type: 'DISMISS_ALARM'
    });
}

// Listen to other tabs
if (!isAdminPage) {
    alarmChannel.onmessage = (event) => {
        const { type, sessionId, tableName, customerName, targetType } = event.data;
        if (type === 'SESSION_EXPIRED') {
            if (!alarmedSessions.has(sessionId)) {
                showExpirationAlert(tableName, customerName, targetType, sessionId);
            }
        } else if (type === 'DISMISS_ALARM') {
            stopAlarmSound();
            hideExpirationAlert();
        }
    };
}

// --- GLOBAL BACKGROUND ALARM POLLER ---
// Periodically checks the backend server so alarms trigger across different devices/browsers
let globalSessionPollInterval = null;

async function startGlobalAlarmPoller() {
    if (isAdminPage) return;
    if (globalSessionPollInterval) return;
    
    const checkSessions = async () => {
        try {
            const response = await fetch(`${API_BASE}/sessions`);
            if (!response.ok) return;
            const sessions = await response.json();
            
            let hasActiveAlarm = false;
            let currentExpiredSession = null;
            let anyExpiredActive = false;
            
            (sessions || []).forEach(session => {
                if (session.type === 'duration' && session.endTime) {
                    const end = new Date(session.endTime);
                    const now = new Date(Date.now() + serverTimeOffset);
                    const diff = end - now;
                    
                    if (diff <= 0) {
                        anyExpiredActive = true;
                        if (!alarmedSessions.has(session.id)) {
                            currentExpiredSession = session;
                            hasActiveAlarm = true;
                        }
                    }
                }
            });
            
            if (hasActiveAlarm && currentExpiredSession) {
                showExpirationAlert(
                    currentExpiredSession.tableName, 
                    currentExpiredSession.customerName, 
                    currentExpiredSession.targetType || 'table', 
                    currentExpiredSession.id
                );
            } else if (!anyExpiredActive && alarmInterval) {
                // If no expired sessions exist on backend (e.g. cashier stopped/saved transaction), auto-silence
                stopAlarmSound();
                hideExpirationAlert();
            }
        } catch (e) {
            console.error("Global alarm poller error:", e);
        }
    };
    
    checkSessions();
    globalSessionPollInterval = setInterval(checkSessions, 5000);
}

// Only start background poller on non-public, non-login, non-admin screens
if (!isAdminPage && !window.location.href.includes('reservasi.html') && !window.location.href.includes('login.html')) {
    startGlobalAlarmPoller();
}

