require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, '..', 'frontend')));

const DB_PATH = path.join(__dirname, 'data', 'db.json');

// Helper to read/write DB
function readDB() {
    try {
        const data = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
        if (!data.rooms) data.rooms = [];
        if (!data.users) data.users = [];
        return data;
    } catch (err) {
        console.error('Error reading DB:', err);
        return { users: [], tables: [], rooms: [], sessions: [], transactions: [], menu: [], employees: [], attendance: [] };
    }
}

function writeDB(data) {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

// Root redirect
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'frontend', 'login.html'));
});

// --- TIME SYNC API ---
app.get('/api/time', (req, res) => {
    res.json({ serverTime: Date.now() });
});

// --- AUTH API ---
app.post('/api/login', (req, res) => {
    try {
        const { username, password } = req.body;
        const db = readDB();
        const user = db.users.find(u => u.username === username && u.password === password);
        if (user) {
            res.json({ success: true, role: user.role, username: user.username, profilePic: user.profilePic });
        } else {
            res.status(401).json({ success: false, message: 'Username atau password salah' });
        }
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// --- TABLES API (Billiard) ---
app.get('/api/tables', (req, res) => res.json(readDB().tables));
app.post('/api/tables', (req, res) => {
    const db = readDB();
    const newTable = { id: Date.now(), ...req.body, status: 'available' };
    db.tables.push(newTable);
    writeDB(db);
    res.json(newTable);
});
app.put('/api/tables/:id', (req, res) => {
    const db = readDB();
    const idx = db.tables.findIndex(t => t.id == req.params.id);
    if (idx !== -1) {
        db.tables[idx] = { ...db.tables[idx], ...req.body };
        writeDB(db);
        res.json(db.tables[idx]);
    } else {
        res.status(404).json({ message: 'Table not found' });
    }
});
app.delete('/api/tables/:id', (req, res) => {
    const db = readDB();
    db.tables = db.tables.filter(t => t.id != req.params.id);
    writeDB(db);
    res.json({ success: true });
});

// --- ROOMS API (Karaoke) ---
app.get('/api/rooms', (req, res) => res.json(readDB().rooms || []));
app.post('/api/rooms', (req, res) => {
    const db = readDB();
    const newRoom = { id: Date.now(), ...req.body, status: 'available' };
    if (!db.rooms) db.rooms = [];
    db.rooms.push(newRoom);
    writeDB(db);
    res.json(newRoom);
});
app.put('/api/rooms/:id', (req, res) => {
    const db = readDB();
    const idx = db.rooms.findIndex(r => r.id == req.params.id);
    if (idx !== -1) {
        db.rooms[idx] = { ...db.rooms[idx], ...req.body };
        writeDB(db);
        res.json(db.rooms[idx]);
    } else {
        res.status(404).json({ message: 'Room not found' });
    }
});
app.delete('/api/rooms/:id', (req, res) => {
    const db = readDB();
    db.rooms = db.rooms.filter(r => r.id != req.params.id);
    writeDB(db);
    res.json({ success: true });
});

// --- MENU API ---
app.get('/api/menu', (req, res) => res.json(readDB().menu));
app.get('/api/menu-categories', (req, res) => {
    const db = readDB();
    const categories = [...new Set(db.menu.map(m => m.category))].map(name => ({ name }));
    res.json(categories);
});
app.post('/api/menu', (req, res) => {
    const db = readDB();
    const newItem = { id: Date.now(), ...req.body, price: parseInt(req.body.price), stock: parseInt(req.body.stock) || 0 };
    db.menu.push(newItem);
    writeDB(db);
    res.json(newItem);
});
app.post('/api/menu/:id/adjust-stock', (req, res) => {
    const db = readDB();
    const item = db.menu.find(m => m.id == req.params.id);
    if (item) {
        item.stock = (item.stock || 0) + req.body.delta;
        writeDB(db);
        res.json({ success: true, newStock: item.stock });
    } else {
        res.status(404).json({ success: false });
    }
});
app.post('/api/menu/:id/set-stock', (req, res) => {
    const db = readDB();
    const item = db.menu.find(m => m.id == req.params.id);
    if (item) {
        item.stock = req.body.stock;
        writeDB(db);
        res.json({ success: true });
    } else {
        res.status(404).json({ success: false });
    }
});
app.delete('/api/menu/:id', (req, res) => {
    const db = readDB();
    db.menu = db.menu.filter(m => m.id != req.params.id);
    writeDB(db);
    res.json({ success: true });
});

// --- SESSIONS API ---
app.get('/api/sessions', (req, res) => res.json(readDB().sessions));
app.post('/api/sessions/start', (req, res) => {
    const { tableId, customerName, type, durationMinutes } = req.body;
    const db = readDB();
    let item = db.tables.find(t => t.id == tableId);
    if (!item) item = db.rooms.find(r => r.id == tableId);
    if (!item || item.status !== 'available') return res.status(400).json({ message: 'Target busy or not found' });
    const startTime = new Date();
    let endTime = null;
    if (type === 'duration' && durationMinutes) {
        endTime = new Date(startTime.getTime() + durationMinutes * 60000);
    }
    const newSession = {
        id: Date.now(), tableId, tableName: item.name, customerName, type, startTime, endTime, hourlyRate: item.hourlyRate, orders: []
    };
    db.sessions.push(newSession);
    item.status = 'occupied';
    writeDB(db);
    res.json(newSession);
});

app.post('/api/sessions/:id/order', (req, res) => {
    const { menuId, qty } = req.body;
    const db = readDB();
    const session = db.sessions.find(s => s.id == req.params.id);
    const menuItem = db.menu.find(m => m.id == menuId);
    if (session && menuItem) {
        const order = { menuId, name: menuItem.name, price: menuItem.price, qty: parseInt(qty), subtotal: menuItem.price * parseInt(qty) };
        if (!session.orders) session.orders = [];
        session.orders.push(order);
        menuItem.stock = (menuItem.stock || 0) - qty;
        writeDB(db);
        res.json({ success: true });
    } else {
        res.status(404).json({ message: 'Session or Menu not found' });
    }
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
        id: Date.now(), ...session, endTime: stopTime, durationMinutes: Math.round(durationMs / 60000), tableAmount, ordersAmount: ordersTotal, amount: tableAmount + ordersTotal, date: stopTime.toISOString().split('T')[0], isArchived: false
    };
    db.transactions.push(transaction);
    let item = db.tables.find(t => t.id == session.tableId);
    if (!item) item = db.rooms.find(r => r.id == session.tableId);
    if (item) item.status = 'available';
    db.sessions.splice(sessionIdx, 1);
    writeDB(db);
    res.json(transaction);
});

// --- TRANSACTIONS API ---
app.get('/api/transactions', (req, res) => res.json(readDB().transactions));
app.delete('/api/transactions/:id', (req, res) => {
    const db = readDB();
    db.transactions = db.transactions.filter(t => t.id != req.params.id);
    writeDB(db);
    res.json({ success: true });
});

app.post('/api/transactions/pos', (req, res) => {
    const { customerName, orders, totalAmount } = req.body;
    const db = readDB();
    
    // Create transaction
    const transaction = {
        id: Date.now(),
        customerName: customerName || 'Pelanggan POS',
        type: 'pos',
        amount: totalAmount,
        orders: orders.map(o => ({
            name: o.name,
            qty: o.quantity,
            price: o.price,
            subtotal: o.subtotal
        })),
        date: new Date().toISOString().split('T')[0],
        timestamp: new Date(),
        isArchived: false
    };

    db.transactions.push(transaction);

    // Reduce stock
    orders.forEach(order => {
        const menuItem = db.menu.find(m => m.id == order.itemId);
        if (menuItem) {
            menuItem.stock = (menuItem.stock || 0) - order.quantity;
        }
    });

    writeDB(db);
    res.json(transaction);
});

app.post('/api/transactions/close-shift', (req, res) => {
    const db = readDB();
    let count = 0;
    db.transactions.forEach(t => {
        if (!t.isArchived) { t.isArchived = true; count++; }
    });
    writeDB(db);
    res.json({ success: true, archivedCount: count });
});

// --- EMPLOYEES & ATTENDANCE ---
app.get('/api/employees', (req, res) => res.json(readDB().employees));
app.post('/api/employees', (req, res) => {
    const db = readDB();
    const newEmp = { id: Date.now(), ...req.body };
    db.employees.push(newEmp);
    writeDB(db);
    res.json(newEmp);
});
app.delete('/api/employees/:id', (req, res) => {
    const db = readDB();
    db.employees = db.employees.filter(e => e.id != req.params.id);
    writeDB(db);
    res.json({ success: true });
});
app.get('/api/attendance', (req, res) => res.json(readDB().attendance));
app.post('/api/attendance', (req, res) => {
    const { employeeId, type } = req.body;
    const db = readDB();
    const emp = db.employees.find(e => e.id == employeeId);
    const record = { id: Date.now(), employeeId, employeeName: emp ? emp.name : 'Unknown', type, timestamp: new Date(), date: new Date().toISOString().split('T')[0] };
    db.attendance.push(record);
    writeDB(db);
    res.json(record);
});

// --- USERS MANAGEMENT ---
app.get('/api/users', (req, res) => {
    const users = readDB().users.map(u => ({ id: u.id, username: u.username, role: u.role, profilePic: u.profilePic }));
    res.json(users);
});
app.post('/api/users', (req, res) => {
    const db = readDB();
    const { username, password, role } = req.body;
    if (db.users.find(u => u.username === username)) return res.status(400).json({ success: false, message: 'Username sudah ada!' });
    const newUser = { id: Date.now(), username, password, role: role || 'kasir' };
    db.users.push(newUser);
    writeDB(db);
    res.json({ success: true });
});
app.put('/api/users/update', (req, res) => {
    const db = readDB();
    const { oldUsername, newUsername, newPassword, profilePic } = req.body;
    const user = db.users.find(u => u.username === oldUsername);
    if (!user) return res.status(404).json({ success: false, message: 'User tidak ditemukan' });
    
    if (newUsername && newUsername !== oldUsername) {
        if (db.users.find(u => u.username === newUsername)) return res.status(400).json({ success: false, message: 'Username baru sudah dipakai' });
        user.username = newUsername;
    }
    if (newPassword) user.password = newPassword;
    if (profilePic) user.profilePic = profilePic;
    
    writeDB(db);
    res.json({ success: true, username: user.username, profilePic: user.profilePic });
});
app.delete('/api/users/:id', (req, res) => {
    const db = readDB();
    const user = db.users.find(u => u.id == req.params.id);
    if (user && user.username === 'om ben') return res.status(403).json({ message: 'User utama tidak bisa dihapus' });
    db.users = db.users.filter(u => u.id != req.params.id);
    writeDB(db);
    res.json({ success: true });
});
app.put('/api/users/:id/password', (req, res) => {
    const db = readDB();
    const user = db.users.find(u => u.id == req.params.id);
    if (user) {
        user.password = req.body.newPassword;
        writeDB(db);
        res.json({ success: true });
    } else res.status(404).json({ message: 'User not found' });
});

app.listen(PORT, () => {
    console.log(`Server running at port ${PORT}`);
});
