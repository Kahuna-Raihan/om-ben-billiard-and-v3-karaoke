require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'frontend')));

const DB_PATH = path.join(__dirname, 'data', 'db.json');

// Helper to read/write DB
function readDB() {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}

function writeDB(data) {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

// Root redirect
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'frontend', 'login.html'));
});

// --- AUTH API ---
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const db = readDB();
    const user = db.users.find(u => u.username === username && u.password === password);
    
    if (user) {
        res.json({ success: true, role: user.role, username: user.username });
    } else {
        res.status(401).json({ success: false, message: 'Username atau password salah' });
    }
});

// --- TABLES API ---
app.get('/api/tables', (req, res) => {
    const db = readDB();
    res.json(db.tables);
});

app.post('/api/tables', (req, res) => {
    const db = readDB();
    const newTable = {
        id: Date.now(),
        ...req.body,
        status: 'available'
    };
    db.tables.push(newTable);
    writeDB(db);
    res.json(newTable);
});

// --- SESSIONS API ---
app.get('/api/sessions', (req, res) => {
    const db = readDB();
    res.json(db.sessions);
});

app.post('/api/sessions/start', (req, res) => {
    const { tableId, customerName, type, durationMinutes } = req.body;
    const db = readDB();
    
    const table = db.tables.find(t => t.id == tableId);
    if (!table || table.status !== 'available') return res.status(400).json({ message: 'Table busy' });

    const startTime = new Date();
    let endTime = null;
    if (type === 'duration' && durationMinutes) {
        endTime = new Date(startTime.getTime() + durationMinutes * 60000);
    }

    const newSession = {
        id: Date.now(),
        tableId,
        tableName: table.name,
        customerName,
        type,
        startTime,
        endTime,
        hourlyRate: table.hourlyRate,
        orders: []
    };

    db.sessions.push(newSession);
    table.status = 'occupied';
    writeDB(db);
    res.json(newSession);
});

app.post('/api/sessions/:id/stop', (req, res) => {
    const db = readDB();
    const sessionIdx = db.sessions.findIndex(s => s.id == req.params.id);
    if (sessionIdx === -1) return res.status(404).json({ message: 'Not found' });

    const session = db.sessions[sessionIdx];
    const stopTime = new Date();
    const durationMs = stopTime - new Date(session.startTime);
    const durationHours = durationMs / (1000 * 60 * 60);
    const tableAmount = Math.ceil(durationHours * session.hourlyRate);
    const ordersTotal = session.orders ? session.orders.reduce((acc, o) => acc + o.subtotal, 0) : 0;

    const transaction = {
        id: Date.now(),
        ...session,
        endTime: stopTime,
        durationMinutes: Math.round(durationMs / 60000),
        tableAmount,
        ordersAmount: ordersTotal,
        amount: tableAmount + ordersTotal,
        date: stopTime.toISOString().split('T')[0]
    };

    db.transactions.push(transaction);
    const table = db.tables.find(t => t.id == session.tableId);
    if (table) table.status = 'available';
    
    db.sessions.splice(sessionIdx, 1);
    writeDB(db);
    res.json(transaction);
});

// --- MENU & POS API ---
app.get('/api/menu', (req, res) => {
    const db = readDB();
    res.json(db.menu);
});

app.post('/api/transactions/pos', (req, res) => {
    const { customerName, orders, totalAmount } = req.body;
    const db = readDB();
    
    const transaction = {
        id: Date.now(),
        customerName: customerName || 'Pelanggan Umum',
        amount: totalAmount,
        orders: orders || [],
        date: new Date().toISOString().split('T')[0],
        type: 'pos'
    };

    db.transactions.push(transaction);
    writeDB(db);
    res.json(transaction);
});

// --- TRANSACTIONS API ---
app.get('/api/transactions', (req, res) => {
    const { date } = req.query;
    const db = readDB();
    let results = db.transactions;
    if (date) results = results.filter(t => t.date === date);
    res.json(results);
});

// --- EMPLOYEES & ATTENDANCE ---
app.get('/api/employees', (req, res) => {
    const db = readDB();
    res.json(db.employees);
});

app.post('/api/attendance', (req, res) => {
    const { employeeId, type } = req.body;
    const db = readDB();
    const emp = db.employees.find(e => e.id == employeeId);
    
    const record = {
        id: Date.now(),
        employeeId,
        employeeName: emp ? emp.name : 'Unknown',
        type,
        timestamp: new Date(),
        date: new Date().toISOString().split('T')[0]
    };
    db.attendance.push(record);
    writeDB(db);
    res.json(record);
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
