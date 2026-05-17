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
        if (!data.stockLogs) data.stockLogs = [];
        if (!data.bookings) data.bookings = [];
        if (!data.menu) data.menu = [];
        if (!data.settings) data.settings = { shopOpen: true };
        data.menu.forEach(item => { if (item.stock === undefined) item.stock = 0; });
        return data;
    } catch (err) {
        console.error('Error reading DB:', err);
        return { users: [], tables: [], rooms: [], sessions: [], transactions: [], menu: [], employees: [], attendance: [], stockLogs: [], settings: { shopOpen: true } };
    }
}

let lastBackupTime = 0;
function writeDB(data) {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
    
    // Auto rolling backup every 15 minutes of write activity
    const now = Date.now();
    if (now - lastBackupTime > 15 * 60 * 1000) {
        lastBackupTime = now;
        try {
            const backupDir = path.join(__dirname, 'data', 'backups');
            if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
            
            const d = new Date();
            const timestamp = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}_` +
                              `${String(d.getHours()).padStart(2,'0')}-${String(d.getMinutes()).padStart(2,'0')}-${String(d.getSeconds()).padStart(2,'0')}`;
                              
            fs.writeFileSync(path.join(backupDir, `db_backup_auto_${timestamp}.json`), JSON.stringify(data, null, 2));
            
            const files = fs.readdirSync(backupDir)
                .filter(f => f.startsWith('db_backup_') && f.endsWith('.json'))
                .map(f => ({ name: f, time: fs.statSync(path.join(backupDir, f)).mtime.getTime() }))
                .sort((a, b) => b.time - a.time);
            if (files.length > 30) {
                for (let i = 30; i < files.length; i++) {
                    fs.unlinkSync(path.join(backupDir, files[i].name));
                }
            }
        } catch (err) {
            console.error('Auto backup failed:', err);
        }
    }
}

// Logger for Stock
function logStock(db, itemName, type, delta, reason, user, category = 'Uncategorized') {
    const log = {
        id: Date.now(),
        itemName,
        itemCategory: category,
        type, // 'in' or 'out'
        delta,
        reason,
        user: user || 'System',
        timestamp: new Date().toISOString()
    };
    if (!db.stockLogs) db.stockLogs = [];
    db.stockLogs.push(log);
}

// Get local date string YYYY-MM-DD in UTC+7 (Indonesian WIB timezone)
function getWIBDateString(date = new Date()) {
    const wibOffset = 7 * 60 * 60 * 1000; // WIB is UTC+7
    const wibDate = new Date(date.getTime() + wibOffset);
    const yyyy = wibDate.getUTCFullYear();
    const mm = String(wibDate.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(wibDate.getUTCDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
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
app.get('/api/tables', (req, res) => {
    const db = readDB();
    const tables = db.tables.map(t => {
        // 1. Check if occupied by an active session
        const hasActiveSession = db.sessions.some(s => s.tableId == t.id && (s.targetType === 'table' || !s.targetType));
        if (hasActiveSession) {
            return { ...t, status: 'occupied' };
        }
        
        // 2. Check if there is a pending booking today
        const todayStr = getWIBDateString(); // timezone-safe local date string YYYY-MM-DD
        
        const hasBookingToday = (db.bookings || []).some(b => 
            b.targetType === 'table' && 
            b.targetId == t.id && 
            b.bookingTime && b.bookingTime.substring(0, 10) === todayStr
        );
        
        if (hasBookingToday) {
            return { ...t, status: 'booked' };
        }
        
        return { ...t, status: 'available' };
    });
    res.json(tables);
});
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
    db.tables = db.tables.filter(t => String(t.id) !== String(req.params.id));
    writeDB(db);
    res.json({ success: true });
});

// --- ROOMS API (Karaoke) ---
app.get('/api/rooms', (req, res) => {
    const db = readDB();
    const rooms = (db.rooms || []).map(r => {
        // 1. Check if occupied by an active session
        const hasActiveSession = db.sessions.some(s => s.tableId == r.id && s.targetType === 'room');
        if (hasActiveSession) {
            return { ...r, status: 'occupied' };
        }
        
        // 2. Check if there is a pending booking today
        const todayStr = getWIBDateString(); // timezone-safe local date string YYYY-MM-DD
        
        const hasBookingToday = (db.bookings || []).some(b => 
            b.targetType === 'room' && 
            b.targetId == r.id && 
            b.bookingTime && b.bookingTime.substring(0, 10) === todayStr
        );
        
        if (hasBookingToday) {
            return { ...r, status: 'booked' };
        }
        
        return { ...r, status: 'available' };
    });
    res.json(rooms);
});
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
    db.rooms = db.rooms.filter(r => String(r.id) !== String(req.params.id));
    writeDB(db);
    res.json({ success: true });
});

// --- MENU & STOCK API ---
app.get('/api/menu', (req, res) => res.json(readDB().menu));
app.post('/api/menu', (req, res) => {
    const db = readDB();
    const newItem = { id: Date.now(), ...req.body, price: parseInt(req.body.price), stock: parseInt(req.body.stock) || 0 };
    db.menu.push(newItem);
    logStock(db, newItem.name, 'in', newItem.stock, 'Initial/New Item', req.query.user);
    writeDB(db);
    res.json(newItem);
});
app.put('/api/menu/:id', (req, res) => {
    const db = readDB();
    const idx = db.menu.findIndex(m => String(m.id) === String(req.params.id));
    if (idx !== -1) {
        const oldItem = db.menu[idx];
        const price = req.body.price !== undefined ? parseInt(req.body.price) : oldItem.price;
        const stock = req.body.stock !== undefined ? parseInt(req.body.stock) : oldItem.stock;
        
        db.menu[idx] = { 
            ...oldItem, 
            ...req.body,
            price: price,
            stock: stock
        };
        
        if (req.body.stock !== undefined) {
            const diff = parseInt(req.body.stock) || 0;
            if (diff !== 0) {
                logStock(db, oldItem.name, 'in', diff, 'Update via Edit Menu Modal', req.body.user || req.query.user || 'Admin');
            }
        }
        
        writeDB(db);
        res.json(db.menu[idx]);
    } else {
        res.status(404).json({ message: 'Menu item not found' });
    }
});
app.post('/api/menu/:id/adjust-stock', (req, res) => {
    const db = readDB();
    const item = db.menu.find(m => String(m.id) === String(req.params.id));
    if (item) {
        const delta = parseInt(req.body.delta);
        item.stock = (item.stock || 0) + delta;
        logStock(db, item.name, delta > 0 ? 'in' : 'out', Math.abs(delta), req.body.reason || 'Manual Adjustment', req.body.user);
        writeDB(db);
        res.json({ success: true, newStock: item.stock });
    } else {
        res.status(404).json({ success: false });
    }
});
app.post('/api/menu/:id/set-stock', (req, res) => {
    const { stock, reason, user } = req.body;
    const db = readDB();
    const item = db.menu.find(m => m.id == req.params.id);
    if (!item) return res.status(404).json({ error: 'Item not found' });

    const newStock = parseInt(stock) || 0;
    
    // Set stock directly to the entered value
    item.stock = newStock;

    // Log the change starting from 0 (meaning delta is the exact newStock)
    db.stockLogs.push({
        id: Date.now(),
        itemId: item.id,
        itemName: item.name,
        itemCategory: item.category || 'Uncategorized',
        type: 'in',
        delta: newStock,
        reason: `${reason || 'Update Manual'}: (Direct set to ${newStock})`,
        user: user || 'Admin',
        timestamp: new Date().toISOString()
    });

    writeDB(db);
    res.json({ success: true, newStock: item.stock });
});
app.delete('/api/stock-logs/reset-all', (req, res) => {
    const db = readDB();
    const count = db.stockLogs.length;
    db.stockLogs = [];
    writeDB(db);
    res.json({ success: true, deletedCount: count });
});
app.delete('/api/stock-logs/:id', (req, res) => {
    const db = readDB();
    db.stockLogs = db.stockLogs.filter(l => String(l.id) !== String(req.params.id));
    writeDB(db);
    res.json({ success: true });
});
app.delete('/api/menu/:id', (req, res) => {
    const db = readDB();
    const initialCount = db.menu.length;
    db.menu = db.menu.filter(m => String(m.id) !== String(req.params.id));
    const finalCount = db.menu.length;
    console.log(`[DELETE MENU] ID: ${req.params.id} | Result: ${initialCount} -> ${finalCount}`);
    writeDB(db);
    res.json({ success: true });
});
app.get('/api/stock-logs', (req, res) => res.json(readDB().stockLogs || []));

// --- DATABASE BACKUP & MANAGEMENT API ---
app.get('/api/db/stats', (req, res) => {
    try {
        const db = readDB();
        const stats = {
            sizeBytes: fs.existsSync(DB_PATH) ? fs.statSync(DB_PATH).size : 0,
            counts: {
                menu: db.menu ? db.menu.length : 0,
                sessions: db.sessions ? db.sessions.length : 0,
                transactions: db.transactions ? db.transactions.length : 0,
                stockLogs: db.stockLogs ? db.stockLogs.length : 0,
                bookings: db.bookings ? db.bookings.length : 0,
                employees: db.employees ? db.employees.length : 0,
                attendance: db.attendance ? db.attendance.length : 0
            }
        };
        res.json(stats);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/db/download', (req, res) => {
    if (fs.existsSync(DB_PATH)) {
        res.download(DB_PATH, 'db.json');
    } else {
        res.status(404).send('Database file not found');
    }
});

app.post('/api/db/import', (req, res) => {
    try {
        const data = req.body;
        if (!data || typeof data !== 'object') {
            return res.status(400).json({ success: false, message: 'Invalid data format' });
        }
        if (!data.menu && !data.tables && !data.users) {
            return res.status(400).json({ success: false, message: 'Invalid database schema: Core keys missing' });
        }
        
        const backupDir = path.join(__dirname, 'data', 'backups');
        if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
        const d = new Date();
        const timestamp = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}_` +
                          `${String(d.getHours()).padStart(2,'0')}-${String(d.getMinutes()).padStart(2,'0')}-${String(d.getSeconds()).padStart(2,'0')}`;
        const currentDB = readDB();
        fs.writeFileSync(path.join(backupDir, `db_backup_preimport_${timestamp}.json`), JSON.stringify(currentDB, null, 2));

        writeDB(data);
        res.json({ success: true, message: 'Database imported successfully! Previous database backed up.' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.get('/api/backups', (req, res) => {
    try {
        const backupDir = path.join(__dirname, 'data', 'backups');
        if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
        
        const files = fs.readdirSync(backupDir)
            .filter(f => f.startsWith('db_backup_') && f.endsWith('.json'))
            .map(f => {
                const stat = fs.statSync(path.join(backupDir, f));
                return {
                    filename: f,
                    sizeBytes: stat.size,
                    createdAt: stat.mtime.toISOString()
                };
            })
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            
        res.json(files);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/backups/create', (req, res) => {
    try {
        const db = readDB();
        const backupDir = path.join(__dirname, 'data', 'backups');
        if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
        
        const d = new Date();
        const timestamp = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}_` +
                          `${String(d.getHours()).padStart(2,'0')}-${String(d.getMinutes()).padStart(2,'0')}-${String(d.getSeconds()).padStart(2,'0')}`;
        const filename = `db_backup_manual_${timestamp}.json`;
        
        fs.writeFileSync(path.join(backupDir, filename), JSON.stringify(db, null, 2));
        res.json({ success: true, filename });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/backups/:filename/restore', (req, res) => {
    try {
        const filename = req.params.filename;
        if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
            return res.status(400).json({ success: false, message: 'Invalid backup file name' });
        }
        
        const filePath = path.join(__dirname, 'data', 'backups', filename);
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ success: false, message: 'Backup file not found' });
        }
        
        const backupDir = path.join(__dirname, 'data', 'backups');
        const d = new Date();
        const timestamp = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}_` +
                          `${String(d.getHours()).padStart(2,'0')}-${String(d.getMinutes()).padStart(2,'0')}-${String(d.getSeconds()).padStart(2,'0')}`;
        const currentDB = readDB();
        fs.writeFileSync(path.join(backupDir, `db_backup_prerestore_${timestamp}.json`), JSON.stringify(currentDB, null, 2));

        const backupData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        writeDB(backupData);
        
        res.json({ success: true, message: 'Database successfully restored from backup!' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.delete('/api/backups/:filename', (req, res) => {
    try {
        const filename = req.params.filename;
        if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
            return res.status(400).json({ success: false, message: 'Invalid backup file name' });
        }
        
        const filePath = path.join(__dirname, 'data', 'backups', filename);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            res.json({ success: true });
        } else {
            res.status(404).json({ success: false, message: 'Backup file not found' });
        }
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// --- SESSIONS API ---
app.get('/api/sessions', (req, res) => res.json(readDB().sessions));
app.post('/api/sessions/start', (req, res) => {
    const { tableId, customerName, type, durationMinutes, targetType } = req.body;
    const db = readDB();
    
    let item = null;
    // Specifically search based on targetType if provided, otherwise fallback
    if (targetType === 'room') {
        item = db.rooms.find(r => r.id == tableId);
    } else if (targetType === 'table') {
        item = db.tables.find(t => t.id == tableId);
    } else {
        // Fallback for older frontend versions
        item = db.tables.find(t => t.id == tableId);
        if (!item) item = db.rooms.find(r => r.id == tableId);
    }

    if (!item || item.status !== 'available') return res.status(400).json({ message: 'Target busy or not found' });
    
    const startTime = new Date();
    let endTime = null;
    if (type === 'duration' && durationMinutes) {
        endTime = new Date(startTime.getTime() + durationMinutes * 60000);
    }
    const newSession = {
        id: Date.now(), 
        tableId, 
        tableName: item.name, 
        customerName, 
        type, 
        startTime, 
        endTime, 
        hourlyRate: item.hourlyRate, 
        orders: [],
        targetType: targetType || (db.tables.find(t => t.id == tableId) ? 'table' : 'room')
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
        const q = parseInt(qty);
        if ((menuItem.stock || 0) < q) {
            return res.status(400).json({ success: false, message: `Stok ${menuItem.name} tidak mencukupi` });
        }
        const order = { menuId, name: menuItem.name, price: menuItem.price, qty: q, subtotal: menuItem.price * q };
        if (!session.orders) session.orders = [];
        session.orders.push(order);
        menuItem.stock = (menuItem.stock || 0) - q;
        logStock(db, menuItem.name, 'out', q, `Order from ${session.tableName}`, req.body.user);
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
    const durationHours = Math.ceil(durationMs / (1000 * 60 * 60));
    const tableAmount = (durationMs <= 5 * 60 * 1000) ? 0 : durationHours * session.hourlyRate;
    const ordersTotal = session.orders ? session.orders.reduce((acc, o) => acc + o.subtotal, 0) : 0;
    const transaction = {
        id: Date.now(), ...session, endTime: stopTime, durationMinutes: Math.round(durationMs / 60000), tableAmount, ordersAmount: ordersTotal, amount: tableAmount + ordersTotal, date: getWIBDateString(stopTime), isArchived: false
    };
    db.transactions.push(transaction);
    
    // ENSURE CORRECT RESOURCE STATUS UPDATE
    let item = null;
    if (session.targetType === 'room') {
        item = db.rooms.find(r => r.id == session.tableId);
    } else {
        item = db.tables.find(t => t.id == session.tableId);
    }

    if (item) {
        item.status = 'available';
        console.log(`${session.targetType === 'room' ? 'Room' : 'Table'} ${item.name} status updated to available.`);
    }
    
    db.sessions.splice(sessionIdx, 1);
    writeDB(db);
    res.json(transaction);
});

// --- TRANSACTIONS API ---
app.get('/api/transactions', (req, res) => res.json(readDB().transactions));
app.delete('/api/transactions/reset-today', (req, res) => {
    const db = readDB();
    const today = getWIBDateString();
    const initialCount = db.transactions.length;
    db.transactions = db.transactions.filter(t => t.date !== today);
    const deletedCount = initialCount - db.transactions.length;
    writeDB(db);
    res.json({ success: true, deletedCount });
});
app.delete('/api/transactions/reset-all', (req, res) => {
    const db = readDB();
    const count = db.transactions.length;
    db.transactions = [];
    writeDB(db);
    res.json({ success: true, deletedCount: count });
});
app.delete('/api/transactions/:id', (req, res) => {
    const db = readDB();
    db.transactions = db.transactions.filter(t => String(t.id) !== String(req.params.id));
    writeDB(db);
    res.json({ success: true });
});
app.post('/api/transactions/pos', (req, res) => {
    const { customerName, orders, totalAmount, user } = req.body;
    const db = readDB();
    const transaction = {
        id: Date.now(),
        customerName: customerName || 'Pelanggan POS',
        type: 'pos',
        amount: totalAmount,
        orders: orders.map(o => ({ name: o.name, qty: o.quantity, price: o.price, subtotal: o.subtotal })),
        date: getWIBDateString(),
        timestamp: new Date(),
        isArchived: false
    };
    db.transactions.push(transaction);

    orders.forEach(order => {
        const menuItem = db.menu.find(m => m.id == order.itemId);
        if (menuItem) {
            menuItem.stock = (menuItem.stock || 0) - order.quantity;
            logStock(db, menuItem.name, 'out', order.quantity, 'F&B POS Direct Sale', user, menuItem.category);
        }
    });

    writeDB(db);
    res.json(transaction);
});

app.post('/api/transactions/close-shift', (req, res) => {
    const db = readDB();
    let count = 0;
    db.transactions.forEach(t => { if (!t.isArchived) { t.isArchived = true; count++; } });
    writeDB(db);
    res.json({ success: true, archivedCount: count });
});

// --- EMPLOYEES & USERS ---
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
    db.employees = db.employees.filter(e => String(e.id) !== String(req.params.id));
    writeDB(db);
    res.json({ success: true });
});
app.post('/api/employees/reset', (req, res) => {
    const db = readDB();
    db.employees = [];
    writeDB(db);
    res.json({ success: true });
});

// --- ATTENDANCE API ---
app.get('/api/attendance', (req, res) => res.json(readDB().attendance || []));
app.post('/api/attendance', (req, res) => {
    const db = readDB();
    if (!db.attendance) db.attendance = [];
    const newEntry = { 
        id: Date.now(), 
        ...req.body, 
        timestamp: new Date().toISOString() 
    };
    db.attendance.push(newEntry);
    writeDB(db);
    res.json(newEntry);
});
app.post('/api/attendance/close-shift', (req, res) => {
    const db = readDB();
    const today = getWIBDateString();
    // This was only for today, user wants GLOBAL reset too.
    db.attendance = db.attendance.filter(a => !a.timestamp.startsWith(today));
    writeDB(db);
    res.json({ success: true });
});
app.post('/api/attendance/reset-all', (req, res) => {
    const db = readDB();
    db.attendance = [];
    writeDB(db);
    res.json({ success: true });
});
app.get('/api/users', (req, res) => res.json(readDB().users.map(u => ({ id: u.id, username: u.username, role: u.role, profilePic: u.profilePic }))));
app.post('/api/users', (req, res) => {
    const db = readDB();
    const { username, password, role } = req.body;
    if (db.users.find(u => u.username === username)) return res.status(400).json({ success: false, message: 'Username sudah ada!' });
    db.users.push({ id: Date.now(), username, password, role: role || 'kasir' });
    writeDB(db);
    res.json({ success: true });
});
app.put('/api/users/update', (req, res) => {
    const db = readDB();
    const { oldUsername, newUsername, newPassword, profilePic } = req.body;
    
    // Find user in the database
    const userIndex = db.users.findIndex(u => u.username === oldUsername);
    if (userIndex === -1) return res.status(404).json({ success: false, message: 'User tidak ditemukan' });
    
    const user = db.users[userIndex];

    // Check if new password is same as old
    if (newPassword && user.password === newPassword) {
        return res.status(400).json({ success: false, message: 'Password tidak boleh sama dengan yg kemarin' });
    }

    // Update the username in the list
    if (newUsername && newUsername !== oldUsername) {
        // Check if new username already taken by another user
        const exists = db.users.find(u => u.username === newUsername && u.id !== user.id);
        if (exists) return res.status(400).json({ success: false, message: 'Username sudah digunakan orang lain su!' });
        
        user.username = newUsername;
    }
    
    if (newPassword) user.password = newPassword;
    if (profilePic) user.profilePic = profilePic;
    
    writeDB(db);
    res.json({ success: true, username: user.username, profilePic: user.profilePic });
});
app.delete('/api/users/:id', (req, res) => {
    const db = readDB();
    const user = db.users.find(u => String(u.id) === String(req.params.id));
    if (user && user.username === 'om ben') return res.status(403).json({ message: 'User utama tidak bisa dihapus' });
    db.users = db.users.filter(u => String(u.id) !== String(req.params.id));
    writeDB(db);
    res.json({ success: true });
});

// --- SHOP SETTINGS API ---
app.get('/api/settings', (req, res) => {
    const db = readDB();
    if (!db.settings) {
        db.settings = { shopOpen: true };
    }
    res.json(db.settings);
});

app.post('/api/settings', (req, res) => {
    const db = readDB();
    if (!db.settings) db.settings = { shopOpen: true };
    
    if (req.body.shopOpen !== undefined) {
        db.settings.shopOpen = req.body.shopOpen === true || req.body.shopOpen === 'true';
    }
    writeDB(db);
    res.json({ success: true, settings: db.settings });
});

// --- BOOKING API ---
app.get('/api/bookings', (req, res) => res.json(readDB().bookings || []));
app.post('/api/bookings', (req, res) => {
    const db = readDB();
    
    // Check if store settings block online bookings
    if (db.settings && (db.settings.shopOpen === false || db.settings.shopOpen === 'false')) {
        return res.status(400).json({
            success: false,
            message: 'Maaf su! Toko sedang tutup hari ini. Sistem tidak menerima reservasi online baru saat ini.'
        });
    }

    const { customerName, targetId, targetType, bookingTime, notes } = req.body;
    
    // Check if duplicate booking on same calendar day
    const targetDate = bookingTime ? bookingTime.substring(0, 10) : '';
    if (targetDate) {
        const isDuplicate = (db.bookings || []).some(b => 
            b.targetType === targetType && 
            b.targetId == targetId && 
            b.bookingTime && b.bookingTime.substring(0, 10) === targetDate
        );
        
        if (isDuplicate) {
            const unitName = targetType === 'room' ? 'Ruangan' : 'Meja';
            return res.status(400).json({ 
                success: false, 
                message: `Waduh! ${unitName} ${targetId} sudah dipesan oleh pelanggan lain pada tanggal tersebut (${targetDate}). Silakan pilih unit lain atau tanggal yang berbeda.` 
            });
        }
    }

    const newBooking = { id: Date.now(), customerName, targetId, targetType, bookingTime, notes, status: 'pending' };
    db.bookings.push(newBooking);
    
    writeDB(db);
    res.json({ success: true, ...newBooking });
});
app.delete('/api/bookings/:id', (req, res) => {
    const db = readDB();
    const booking = db.bookings.find(b => b.id == req.params.id);
    if (booking) {
        // Archive booking into bookingsHistory
        const actionType = req.query.action === 'checkin' ? 'checked_in' : 'cancelled';
        db.bookingsHistory = db.bookingsHistory || [];
        db.bookingsHistory.push({
            ...booking,
            status: actionType,
            archivedAt: new Date().toISOString()
        });
        
        db.bookings = db.bookings.filter(b => b.id != req.params.id);
        writeDB(db);
    }
    res.json({ success: true });
});

app.get('/api/bookings/history', (req, res) => {
    const db = readDB();
    res.json(db.bookingsHistory || []);
});

app.delete('/api/bookings/history/:id', (req, res) => {
    const db = readDB();
    if (!db.bookingsHistory) db.bookingsHistory = [];
    const initialCount = db.bookingsHistory.length;
    db.bookingsHistory = db.bookingsHistory.filter(h => String(h.id) !== String(req.params.id));
    
    if (db.bookingsHistory.length === initialCount) {
        return res.status(404).json({ success: false, message: 'Riwayat tidak ditemukan.' });
    }
    
    writeDB(db);
    res.json({ success: true });
});

app.post('/api/bookings/history/reset', (req, res) => {
    const db = readDB();
    db.bookingsHistory = [];
    writeDB(db);
    res.json({ success: true });
});

app.post('/api/bookings/reset', (req, res) => {
    const db = readDB();
    db.bookings = [];
    writeDB(db);
    res.json({ success: true });
});

app.listen(PORT, () => console.log(`Server running at port ${PORT}`));
