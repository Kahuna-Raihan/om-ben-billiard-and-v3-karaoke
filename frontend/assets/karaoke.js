let activeSessions = [];
let rooms = [];

const tableContainer = document.getElementById('table-container');
const startModal = document.getElementById('start-modal');
const stopModal = document.getElementById('stop-modal');
const startForm = document.getElementById('start-form');
const rentalType = document.getElementById('rental-type');
const durationGroup = document.getElementById('duration-group');

async function init() {
    await refreshData();
    setInterval(updateTimers, 1000);
    setInterval(refreshData, 5000); // REFRESH DATA SETIAP 5 DETIK
}

let menuItems = [];

async function refreshData() {
    rooms = await fetchData('/rooms');
    activeSessions = await fetchData('/sessions');
    menuItems = await fetchData('/menu');
    
    const todayStr = getSyncedNow().toISOString().split('T')[0];
    const allTransactions = await fetchData(`/transactions`);
    const todayTransactions = allTransactions.filter(t => t.date === todayStr);
    
    renderRooms();
    updateStats(todayTransactions);
}

function updateStats(transactions) {
    const available = rooms.filter(r => r.status === 'available').length;
    const occupied = rooms.filter(r => r.status === 'occupied').length;
    const revenue = transactions ? transactions.reduce((acc, t) => acc + t.amount, 0) : 0;

    document.getElementById('available-count').textContent = available;
    document.getElementById('occupied-count').textContent = occupied;
    document.getElementById('today-revenue').textContent = formatRupiah(revenue);
}

function renderRooms() {
    tableContainer.innerHTML = '';
    rooms.forEach(room => {
        const session = activeSessions.find(s => s.tableId == room.id);
        const card = document.createElement('div');
        card.className = `table-card ${room.status}`;
        
        card.innerHTML = `
            <div class="table-header">
                <div class="table-info">
                    <h2>${room.name}</h2>
                    <div class="rate">${formatRupiah(room.hourlyRate)} / jam • ${room.description}</div>
                </div>
                <div class="status-badge">${room.status === 'available' ? 'Tersedia' : 'Digunakan'}</div>
            </div>
            <div class="table-content">
                <div class="timer-display" id="timer-${room.id}">${session ? '--:--:--' : '00:00:00'}</div>
                <div class="table-details">
                    <span>${session ? 'Penyewa: ' + session.customerName : 'Ruangan Kosong'}</span>
                    <span>${session ? 'Mulai: ' + formatTime(session.startTime) : '-'}</span>
                </div>
            </div>
            <div class="table-footer" style="display: flex; gap: 0.5rem;">
                ${room.status === 'available' 
                    ? `<button class="btn btn-primary" onclick="openStartModal(${room.id})">Mulai Sewa Ruangan</button>`
                    : `<button class="btn btn-outline" style="flex: 1;" onclick="openOrderModal(${session.id})">Order F&B</button>
                       <button class="btn btn-outline" style="flex: 1;" onclick="openStopModal(${session.id}, ${room.id})">Selesaikan</button>`
                }
            </div>
        `;
        tableContainer.appendChild(card);
    });
    updateTimers();
}

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

function openStartModal(roomId) {
    document.getElementById('modal-table-id').value = roomId;
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
            list.innerHTML += `<tr><td>${o.name}</td><td>x${o.qty}</td><td>${formatRupiah(o.subtotal)}</td></tr>`;
        });
    } else {
        list.innerHTML = '<tr><td colspan="3" style="text-align:center;">Belum ada pesanan</td></tr>';
    }
    document.getElementById('order-modal').style.display = 'flex';
}

async function addOrderToSession() {
    const menuId = document.getElementById('menu-select').value;
    const qty = document.getElementById('menu-qty').value;
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
async function openStopModal(sessionId, roomId) {
    const session = activeSessions.find(s => s.id == sessionId);
    const diff = calculateTimeDiff(session.startTime);
    
    const durationMs = getSyncedNow() - new Date(session.startTime);
    const tableAmount = Math.ceil((durationMs / 3600000) * session.hourlyRate);
    const ordersAmount = session.orders ? session.orders.reduce((acc, o) => acc + o.subtotal, 0) : 0;
    const totalAmount = tableAmount + ordersAmount;

    document.getElementById('bill-details').innerHTML = `
        <div style="display:flex; justify-content:space-between;"><span>Ruangan</span> <strong>${session.tableName}</strong></div>
        <div style="display:flex; justify-content:space-between;"><span>Durasi</span> <strong>${diff.formatted}</strong></div>
        <div style="display:flex; justify-content:space-between;"><span>Total</span> <strong style="color:var(--accent-gold)">${formatRupiah(totalAmount)}</strong></div>
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
