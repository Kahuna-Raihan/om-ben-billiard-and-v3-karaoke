let activeSessions = [];
let tables = [];

const tableContainer = document.getElementById('table-container');
const startModal = document.getElementById('start-modal');
const stopModal = document.getElementById('stop-modal');
const startForm = document.getElementById('start-form');
const rentalType = document.getElementById('rental-type');
const durationGroup = document.getElementById('duration-group');

async function init() {
    await refreshData();
    setInterval(updateTimers, 1000);
    setInterval(refreshData, 1000); // REFRESH DATA SETIAP 1 DETIK
}

let menuItems = [];

async function refreshData() {
    tables = await fetchData('/tables');
    activeSessions = await fetchData('/sessions');
    menuItems = await fetchData('/menu');
    
    const todayStr = getSyncedNow().toISOString().split('T')[0];
    const allTransactions = await fetchData(`/transactions`);
    const todayTransactions = allTransactions.filter(t => t.date === todayStr);
    
    renderTables();
    updateStats(todayTransactions);
}

function updateStats(transactions) {
    const available = tables.filter(t => t.status === 'available').length;
    const occupied = tables.filter(t => t.status === 'occupied').length;
    const revenue = transactions ? transactions.reduce((acc, t) => acc + t.amount, 0) : 0;

    document.getElementById('available-count').textContent = available;
    document.getElementById('occupied-count').textContent = occupied;
    document.getElementById('today-revenue').textContent = formatRupiah(revenue);
}

function renderTables() {
    tableContainer.innerHTML = '';
    tables.forEach(table => {
        const session = activeSessions.find(s => s.tableId == table.id);
        const card = document.createElement('div');
        card.className = `table-card ${table.status}`;
        
        card.innerHTML = `
            <div class="table-header">
                <div class="table-info">
                    <h2>${table.name}</h2>
                    <div class="rate">${formatRupiah(table.hourlyRate)} / jam • ${table.description}</div>
                </div>
                <div class="status-badge">${table.status === 'available' ? 'Tersedia' : 'Digunakan'}</div>
            </div>
            <div class="table-content">
                <div class="timer-display" id="timer-${table.id}">${session ? '--:--:--' : '00:00:00'}</div>
                <div class="table-details">
                    <span>${session ? 'Penyewa: ' + session.customerName : 'Meja Kosong'}</span>
                    <span>${session ? 'Mulai: ' + formatTime(session.startTime) : '-'}</span>
                </div>
            </div>
            <div class="table-footer" style="display: flex; gap: 0.5rem;">
                ${table.status === 'available' 
                    ? `<button class="btn btn-primary" onclick="openStartModal(${table.id})">Mulai Sewa Meja</button>`
                    : `<button class="btn btn-outline" style="flex: 1;" onclick="openOrderModal(${session.id})">Order F&B</button>
                       <button class="btn btn-outline" style="flex: 1;" onclick="openStopModal(${session.id}, ${table.id})">Selesaikan</button>`
                }
            </div>
        `;
        tableContainer.appendChild(card);
    });
    updateTimers();
}

let audioCtx;
function playAlarm() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(800, audioCtx.currentTime);
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    gainNode.gain.setValueAtTime(0.5, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.3);
}

const alarmingSessions = new Set();

function updateTimers() {
    activeSessions.forEach(session => {
        const timerEl = document.getElementById(`timer-${session.tableId}`);
        if (timerEl) {
            if (session.type === 'duration' && session.endTime) {
                const countdown = calculateCountdown(session.endTime);
                timerEl.textContent = countdown.formatted;
                if (countdown.isExpired) {
                    timerEl.style.color = 'var(--danger)';
                    timerEl.classList.add('pulse');
                    if (!alarmingSessions.has(session.id)) {
                        alarmingSessions.add(session.id);
                        playAlarm();
                    }
                } else {
                    timerEl.style.color = 'var(--accent-gold)';
                    timerEl.classList.remove('pulse');
                }
            } else {
                const diff = calculateTimeDiff(session.startTime);
                timerEl.textContent = diff.formatted;
                timerEl.style.color = 'var(--text-light)';
            }
        }
    });
}

function openStartModal(tableId) {
    document.getElementById('modal-table-id').value = tableId;
    startModal.style.display = 'flex';
}

let currentSessionForOrder = null;
function openOrderModal(sessionId) {
    currentSessionForOrder = sessionId;
    const session = activeSessions.find(s => s.id == sessionId);
    const select = document.getElementById('menu-select');
    select.innerHTML = '';
    menuItems.forEach(m => {
        select.innerHTML += `<option value="${m.id}">${m.name} - ${formatRupiah(m.price)}</option>`;
    });

    const list = document.getElementById('session-orders-list');
    list.innerHTML = '';
    if (session.orders && session.orders.length > 0) {
        session.orders.forEach(o => {
            list.innerHTML += `<tr><td style="padding:0.5rem 0">${o.name}</td><td style="text-align:center">x${o.qty}</td><td style="text-align:right">${formatRupiah(o.subtotal)}</td></tr>`;
        });
    } else {
        list.innerHTML = '<tr><td colspan="3" style="text-align:center; padding:1rem;">Belum ada pesanan</td></tr>';
    }
    document.getElementById('order-modal').style.display = 'flex';
}

async function addOrderToSession() {
    const menuId = document.getElementById('menu-select').value;
    const qty = document.getElementById('menu-qty').value;
    if (!menuId) return;

    const res = await postData(`/sessions/${currentSessionForOrder}/order`, { 
        menuId, 
        qty,
        user: localStorage.getItem('auth_user') 
    });
    if (res) {
        await refreshData();
        openOrderModal(currentSessionForOrder);
    }
}

document.getElementById('close-order-modal').onclick = () => document.getElementById('order-modal').style.display = 'none';

let lastStopTransaction = null;
async function openStopModal(sessionId, tableId) {
    const session = activeSessions.find(s => s.id == sessionId);
    const diff = calculateTimeDiff(session.startTime);
    
    const durationMs = getSyncedNow() - new Date(session.startTime);
    const tableAmount = Math.ceil((durationMs / 3600000) * session.hourlyRate);
    const ordersAmount = session.orders ? session.orders.reduce((acc, o) => acc + o.subtotal, 0) : 0;
    const totalAmount = tableAmount + ordersAmount;

    document.getElementById('bill-details').innerHTML = `
        <div style="display:flex; justify-content:space-between; margin-bottom:0.5rem"><span>Meja</span> <strong>${session.tableName}</strong></div>
        <div style="display:flex; justify-content:space-between; margin-bottom:0.5rem"><span>Penyewa</span> <strong>${session.customerName}</strong></div>
        <div style="display:flex; justify-content:space-between; margin-bottom:0.5rem"><span>Durasi</span> <strong>${diff.formatted}</strong></div>
        <div style="display:flex; justify-content:space-between; margin-bottom:0.5rem"><span>Biaya Sewa</span> <strong>${formatRupiah(tableAmount)}</strong></div>
        ${ordersAmount > 0 ? `<div style="display:flex; justify-content:space-between;"><span>F&B</span> <strong>${formatRupiah(ordersAmount)}</strong></div>` : ''}
        <hr style="border:0; border-top:1px solid rgba(255,255,255,0.1); margin:1rem 0">
        <div style="display:flex; justify-content:space-between; font-size:1.2rem"><span>Total</span> <strong style="color:var(--accent-gold)">${formatRupiah(totalAmount)}</strong></div>
    `;

    document.getElementById('confirm-stop').onclick = async () => {
        const result = await postData(`/sessions/${sessionId}/stop`, {});
        if (result) {
            lastStopTransaction = result;
            document.querySelector('#stop-modal h2').textContent = "Berhasil!";
            document.getElementById('confirm-stop').style.display = 'none';
            document.getElementById('print-receipt-btn').style.display = 'block';
            refreshData();
        }
    };
    
    document.getElementById('print-receipt-btn').style.display = 'none';
    document.getElementById('print-receipt-btn').onclick = () => printReceipt(lastStopTransaction);
    document.getElementById('confirm-stop').style.display = 'block';
    document.querySelector('#stop-modal h2').textContent = "Selesaikan Sewa";
    stopModal.style.display = 'flex';
}

document.getElementById('close-modal').onclick = () => startModal.style.display = 'none';
document.getElementById('close-stop-modal').onclick = () => {
    stopModal.style.display = 'none';
    refreshData();
};

rentalType.onchange = () => {
    durationGroup.style.display = rentalType.value === 'duration' ? 'block' : 'none';
};

startForm.onsubmit = async (e) => {
    e.preventDefault();
    const data = {
        tableId: document.getElementById('modal-table-id').value,
        customerName: document.getElementById('customer-name').value,
        type: rentalType.value,
        durationMinutes: parseInt(document.getElementById('duration-minutes').value) || 0
    };
    const result = await postData('/sessions/start', data);
    if (result) {
        startModal.style.display = 'none';
        startForm.reset();
        refreshData();
    }
};

init();
