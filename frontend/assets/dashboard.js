let activeSessions = [];
let tables = [];
let activeTimers = {};

const tableContainer = document.getElementById('table-container');
const startModal = document.getElementById('start-modal');
const stopModal = document.getElementById('stop-modal');
const startForm = document.getElementById('start-form');
const rentalType = document.getElementById('rental-type');
const durationGroup = document.getElementById('duration-group');

// Initialize
async function init() {
    await refreshData();
    setInterval(updateTimers, 1000);
    setInterval(refreshData, 10000); // Poll every 10s
}

let menuItems = [];

async function refreshData() {
    tables = await fetchData('/tables');
    activeSessions = await fetchData('/sessions');
    menuItems = await fetchData('/menu');
    const transactions = await fetchData(`/transactions?date=${new Date().toISOString().split('T')[0]}`);
    
    renderTables();
    updateStats(transactions);
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
                ${session && session.orders && session.orders.length > 0 ? 
                    `<div style="font-size: 0.85rem; color: var(--accent-gold); margin-top: 0.5rem;">+ ${session.orders.length} Pesanan F&B</div>` : ''
                }
            </div>
            <div class="table-footer" style="display: flex; gap: 0.5rem;">
                ${table.status === 'available' 
                    ? `<button class="btn btn-primary" onclick="openStartModal(${table.id})">Mulai Sewa</button>`
                    : `<button class="btn btn-outline" style="flex: 1;" onclick="openOrderModal(${session.id})">Order F&B</button>
                       <button class="btn btn-outline" style="flex: 1;" onclick="openStopModal(${session.id}, ${table.id})">Selesaikan</button>`
                }
            </div>
        `;
        tableContainer.appendChild(card);
    });
    updateTimers();
}

// --- ALARM SYSTEM ---
let audioCtx;
function playAlarm() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    // Create a loud annoying beep pattern
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    osc.type = 'square';
    osc.frequency.setValueAtTime(800, audioCtx.currentTime); // High pitch
    osc.frequency.setValueAtTime(1200, audioCtx.currentTime + 0.1);
    osc.frequency.setValueAtTime(800, audioCtx.currentTime + 0.2);
    
    // Volume control (very loud)
    gainNode.gain.setValueAtTime(1, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
    
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    osc.start();
    osc.stop(audioCtx.currentTime + 0.5);
}

// Track which sessions are already alarming so we don't spam
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
                    
                    // Trigger alarm if not already triggered for this session
                    if (!alarmingSessions.has(session.id)) {
                        alarmingSessions.add(session.id);
                        // Play alarm every 2 seconds while expired
                        const alarmInterval = setInterval(() => {
                            if (document.getElementById(`timer-${session.tableId}`) && 
                                document.getElementById(`timer-${session.tableId}`).classList.contains('pulse')) {
                                playAlarm();
                            } else {
                                clearInterval(alarmInterval);
                            }
                        }, 2000);
                        playAlarm(); // Play immediately first time
                    }
                } else {
                    timerEl.style.color = 'var(--accent-gold)';
                    timerEl.classList.remove('pulse');
                    alarmingSessions.delete(session.id);
                }
            } else {
                const diff = calculateTimeDiff(session.startTime);
                timerEl.textContent = diff.formatted;
                timerEl.style.color = 'var(--text-light)';
                timerEl.classList.remove('pulse');
            }
        }
    });
}

// Modal Logic
function openStartModal(tableId) {
    document.getElementById('modal-table-id').value = tableId;
    startModal.style.display = 'flex';
}

let currentSessionForOrder = null;

function openOrderModal(sessionId) {
    currentSessionForOrder = sessionId;
    const session = activeSessions.find(s => s.id == sessionId);
    
    // Populate Menu Select
    const select = document.getElementById('menu-select');
    select.innerHTML = '';
    if (menuItems.length === 0) {
        select.innerHTML = '<option disabled selected>Belum ada menu tersedia</option>';
    } else {
        menuItems.forEach(m => {
            select.innerHTML += `<option value="${m.id}">${m.name} - ${formatRupiah(m.price)}</option>`;
        });
    }

    // Populate Existing Orders
    const list = document.getElementById('session-orders-list');
    list.innerHTML = '';
    if (session.orders && session.orders.length > 0) {
        session.orders.forEach(o => {
            list.innerHTML += `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.05)">
                    <td style="padding: 0.5rem 0">${o.name}</td>
                    <td style="padding: 0.5rem 0; text-align: center;">x${o.quantity}</td>
                    <td style="padding: 0.5rem 0; text-align: right; color: var(--accent-gold);">${formatRupiah(o.subtotal)}</td>
                </tr>
            `;
        });
    } else {
        list.innerHTML = '<tr><td colspan="3" style="text-align:center; padding:1rem; color:var(--text-dim);">Belum ada pesanan</td></tr>';
    }

    document.getElementById('order-modal').style.display = 'flex';
}

async function addOrderToSession() {
    const itemId = document.getElementById('menu-select').value;
    const qty = document.getElementById('menu-qty').value;
    
    if (!itemId) return;

    const res = await postData(`/sessions/${currentSessionForOrder}/order`, {
        itemId: itemId,
        quantity: parseInt(qty)
    });

    if (res) {
        await refreshData();
        openOrderModal(currentSessionForOrder); // Refresh modal
    }
}

document.getElementById('close-order-modal').onclick = () => document.getElementById('order-modal').style.display = 'none';

async function openStopModal(sessionId, tableId) {
    const session = activeSessions.find(s => s.id == sessionId);
    const diff = calculateTimeDiff(session.startTime);
    
    // Calculate table duration cost
    const durationMs = new Date() - new Date(session.startTime);
    const durationHours = durationMs / (1000 * 60 * 60);
    const tableAmount = Math.ceil(durationHours * session.hourlyRate);

    // Calculate F&B orders cost
    const ordersAmount = session.orders ? session.orders.reduce((acc, o) => acc + o.subtotal, 0) : 0;
    const totalAmount = tableAmount + ordersAmount;

    const billDetails = document.getElementById('bill-details');
    billDetails.innerHTML = `
        <div style="display:flex; justify-content:space-between; margin-bottom:0.5rem">
            <span>Meja</span> <strong>${session.tableName}</strong>
        </div>
        <div style="display:flex; justify-content:space-between; margin-bottom:0.5rem">
            <span>Penyewa</span> <strong>${session.customerName}</strong>
        </div>
        <div style="display:flex; justify-content:space-between; margin-bottom:0.5rem">
            <span>Durasi</span> <strong>${diff.hours} jam ${diff.minutes} menit</strong>
        </div>
        <div style="display:flex; justify-content:space-between; margin-bottom:0.5rem">
            <span>Biaya Sewa</span> <strong>${formatRupiah(tableAmount)}</strong>
        </div>
        ${session.orders && session.orders.length > 0 ? `
        <div style="display:flex; justify-content:space-between; margin-bottom:0.5rem">
            <span>Biaya F&B</span> <strong>${formatRupiah(ordersAmount)}</strong>
        </div>
        ` : ''}
        <hr style="border:0; border-top:1px solid rgba(255,255,255,0.1); margin:1rem 0">
        <div style="display:flex; justify-content:space-between; font-size:1.2rem">
            <span>Total Tagihan</span> <strong style="color:var(--accent-gold)">${formatRupiah(totalAmount)}</strong>
        </div>
    `;

    document.getElementById('confirm-stop').onclick = () => stopSession(sessionId, session, diff, tableAmount, ordersAmount, totalAmount);
    
    // Hide print button here, it will be shown after payment
    const printBtn = document.getElementById('print-receipt-btn');
    if(printBtn) printBtn.style.display = 'none';

    stopModal.style.display = 'flex';
}

async function stopSession(sessionId, session, diff, tableAmount, ordersAmount, totalAmount) {
    const result = await postData(`/sessions/${sessionId}/stop`, {});
    if (result) {
        // Change Modal UI to "Berhasil" and show Print button
        document.querySelector('#stop-modal h2').textContent = "Pembayaran Berhasil!";
        document.getElementById('confirm-stop').style.display = 'none';
        
        const closeBtn = document.getElementById('close-stop-modal');
        closeBtn.textContent = 'Tutup';
        closeBtn.className = 'btn btn-primary';
        closeBtn.onclick = () => {
            stopModal.style.display = 'none';
            // Reset modal state
            document.querySelector('#stop-modal h2').textContent = "Selesaikan Sewa";
            document.getElementById('confirm-stop').style.display = 'block';
            closeBtn.textContent = 'Batal';
            closeBtn.className = 'btn btn-outline';
        };

        const printBtn = document.getElementById('print-receipt-btn');
        if (printBtn) {
            printBtn.style.display = 'block';
            printBtn.onclick = () => printReceipt(session, diff, tableAmount, ordersAmount, totalAmount);
        }

        refreshData();
    }
}

function printReceipt(session, diff, tableAmount, ordersAmount, totalAmount) {
    const printWindow = window.open('', '_blank', 'width=300,height=600');
    const now = new Date();
    
    let ordersHtml = '';
    if (session.orders && session.orders.length > 0) {
        ordersHtml = '<div class="divider"></div><div class="row" style="font-weight:bold; margin-bottom:5px;"><span>Pesanan F&B</span></div>';
        session.orders.forEach(o => {
            ordersHtml += `<div class="row"><span>${o.name} (x${o.quantity})</span> <span>${formatRupiah(o.subtotal)}</span></div>`;
        });
        ordersHtml += `<div class="row" style="margin-top:5px;"><span>Subtotal F&B:</span> <span>${formatRupiah(ordersAmount)}</span></div>`;
    }

    printWindow.document.write(`
        <html>
        <head>
            <title>Cetak Struk - Om Ben Billiard</title>
            <style>
                @page { margin: 0; size: 58mm auto; }
                body {
                    font-family: 'Courier New', Courier, monospace;
                    color: #000;
                    background: #fff;
                    margin: 0 auto;
                    padding: 5mm;
                    width: 48mm;
                    text-align: center;
                    font-size: 11px;
                }
                .header { margin-bottom: 10px; }
                .header h1 { margin: 0; font-size: 16px; font-weight: bold; }
                .header p { margin: 3px 0; font-size: 10px; }
                .divider { border-top: 1px dashed #000; margin: 8px 0; }
                .content { text-align: left; line-height: 1.4; }
                .row { display: flex; justify-content: space-between; }
                .total { font-weight: bold; font-size: 14px; margin-top: 5px; }
                .footer { margin-top: 15px; font-size: 10px; }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>OM BEN BILLIARD</h1>
                <p>X V3 KARAOKE</p>
                <p>${now.toLocaleDateString('id-ID')} ${now.toLocaleTimeString('id-ID')}</p>
            </div>
            
            <div class="divider"></div>
            
            <div class="content">
                <div class="row"><span>Meja:</span> <span>${session.tableName}</span></div>
                <div class="row"><span>Penyewa:</span> <span>${session.customerName}</span></div>
                <div class="row"><span>Mulai:</span> <span>${formatTime(session.startTime)}</span></div>
                <div class="row"><span>Selesai:</span> <span>${formatTime(now.toISOString())}</span></div>
                <div class="row"><span>Durasi:</span> <span>${diff.hours} jam ${diff.minutes} menit</span></div>
                
                <div class="divider"></div>
                <div class="row"><span>Biaya Sewa Meja:</span> <span>${formatRupiah(tableAmount)}</span></div>
                ${ordersHtml}
                
                <div class="divider"></div>
                
                <div class="row total"><span>TOTAL:</span> <span>${formatRupiah(totalAmount)}</span></div>
            </div>
            
            <div class="footer">
                <p>Terima Kasih Atas Kunjungan Anda!</p>
            </div>
            
            <script>
                window.onload = function() {
                    window.print();
                    setTimeout(() => window.close(), 500);
                }
            </script>
        </body>
        </html>
    `);
    printWindow.document.close();
}

// Event Listeners
document.getElementById('close-modal').onclick = () => startModal.style.display = 'none';
document.getElementById('close-stop-modal').onclick = () => stopModal.style.display = 'none';

rentalType.onchange = () => {
    durationGroup.style.display = rentalType.value === 'duration' ? 'block' : 'none';
};

startForm.onsubmit = async (e) => {
    e.preventDefault();
    const data = {
        tableId: document.getElementById('modal-table-id').value,
        customerName: document.getElementById('customer-name').value,
        type: rentalType.value,
        durationMinutes: document.getElementById('duration-minutes').value
    };
    
    const result = await postData('/sessions/start', data);
    if (result) {
        startModal.style.display = 'none';
        startForm.reset();
        refreshData();
    }
};

window.onclick = (e) => {
    if (e.target == startModal) startModal.style.display = 'none';
    if (e.target == stopModal) stopModal.style.display = 'none';
};

init();
