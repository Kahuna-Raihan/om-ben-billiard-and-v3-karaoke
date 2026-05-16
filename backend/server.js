const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;
const DB_PATH = path.join(__dirname, 'data', 'db.json');

app.use(cors());
app.use(express.json());

// Serve static files from the frontend directory
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// Root redirect to login.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'frontend', 'login.html'));
});

// Helper to read DB
const readDB = () => {
    const data = fs.readFileSync(DB_PATH, 'utf8');
    return JSON.parse(data);
};

// Helper to write DB
const writeDB = (data) => {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
};

// --- TABLES API ---
app.get('/api/tables', (req, res) => {
    const db = readDB();
    res.json(db.tables);
});

app.post('/api/tables', (req, res) => {
    const db = readDB();
    const newTable = {
        id: Date.now(),
        name: req.body.name || `Meja ${db.tables.length + 1}`,
        hourlyRate: req.body.hourlyRate || 15000,
        status: 'available',
        description: req.body.description || 'Standar'
    };
    db.tables.push(newTable);
    writeDB(db);
    res.json(newTable);
});

app.delete('/api/tables/:id', (req, res) => {
    const db = readDB();
    const index = db.tables.findIndex(t => t.id == req.params.id);
    if (index !== -1) {
        if (db.sessions.some(s => s.tableId == req.params.id)) {
            return res.status(400).json({ message: 'Cannot delete table with active session' });
        }
        db.tables.splice(index, 1);
        writeDB(db);
        res.json({ message: 'Table deleted' });
    } else {
        res.status(404).json({ message: 'Table not found' });
    }
});

app.put('/api/tables/:id', (req, res) => {
    const db = readDB();
    const index = db.tables.findIndex(t => t.id == req.params.id);
    if (index !== -1) {
        db.tables[index] = { ...db.tables[index], ...req.body };
        writeDB(db);
        res.json(db.tables[index]);
    } else {
        res.status(404).json({ message: 'Table not found' });
    }
});

// --- SESSIONS API (Rental Management) ---
app.get('/api/sessions', (req, res) => {
    const db = readDB();
    res.json(db.sessions);
});

app.post('/api/sessions/start', (req, res) => {
    const { tableId, customerName, type, durationMinutes } = req.body;
    const db = readDB();
    
    const tableIndex = db.tables.findIndex(t => t.id == tableId);
    if (tableIndex === -1 || db.tables[tableIndex].status !== 'available') {
        return res.status(400).json({ message: 'Table not available' });
    }

    const startTime = new Date();
    let endTime = null;
    
    if (type === 'duration' && durationMinutes) {
        endTime = new Date(startTime.getTime() + durationMinutes * 60000);
    }

    const newSession = {
        id: Date.now(),
        tableId,
        tableName: db.tables[tableIndex].name,
        customerName,
        type, // 'open' or 'duration'
        startTime: startTime.toISOString(),
        endTime: endTime ? endTime.toISOString() : null,
        hourlyRate: db.tables[tableIndex].hourlyRate
    };

    db.sessions.push(newSession);
    db.tables[tableIndex].status = 'occupied';
    writeDB(db);
    
    res.json(newSession);
});

app.post('/api/sessions/:id/stop', (req, res) => {
    const db = readDB();
    const sessionIndex = db.sessions.findIndex(s => s.id == req.params.id);
    
    if (sessionIndex === -1) {
        return res.status(404).json({ message: 'Session not found' });
    }

    const session = db.sessions[sessionIndex];
    const stopTime = new Date();
    const startTime = new Date(session.startTime);
    
    // Calculate duration in hours
    const durationMs = stopTime - startTime;
    const durationHours = durationMs / (1000 * 60 * 60);
    const tableAmount = Math.ceil(durationHours * session.hourlyRate);
    
    // Calculate orders total
    const ordersTotal = session.orders ? session.orders.reduce((acc, o) => acc + o.subtotal, 0) : 0;
    const totalAmount = tableAmount + ordersTotal;

    const transaction = {
        id: Date.now(),
        sessionId: session.id,
        tableId: session.tableId,
        tableName: session.tableName,
        customerName: session.customerName,
        startTime: session.startTime,
        endTime: stopTime.toISOString(),
        durationMinutes: Math.round(durationMs / 60000),
        tableAmount: tableAmount,
        ordersAmount: ordersTotal,
        amount: totalAmount,
        orders: session.orders || [],
        date: stopTime.toISOString().split('T')[0]
    };

    db.transactions.push(transaction);
    
    // Reset table status
    const tableIndex = db.tables.findIndex(t => t.id == session.tableId);
    if (tableIndex !== -1) {
        db.tables[tableIndex].status = 'available';
    }

    // Remove active session
    db.sessions.splice(sessionIndex, 1);
    
    writeDB(db);
    res.json(transaction);
});

// --- KARAOKE ROOMS API ---
app.get('/api/rooms', (req, res) => {
    const db = readDB();
    res.json(db.rooms || []);
});

app.post('/api/rooms', (req, res) => {
    const db = readDB();
    const newRoom = {
        id: Date.now(),
        name: req.body.name || `Ruangan ${db.rooms.length + 1}`,
        hourlyRate: req.body.hourlyRate || 50000,
        status: 'available',
        description: req.body.description || 'Standar'
    };
    if (!db.rooms) db.rooms = [];
    db.rooms.push(newRoom);
    writeDB(db);
    res.json(newRoom);
});

app.put('/api/rooms/:id', (req, res) => {
    const db = readDB();
    const index = db.rooms.findIndex(r => r.id == req.params.id);
    if (index !== -1) {
        db.rooms[index] = { ...db.rooms[index], ...req.body };
        writeDB(db);
        res.json(db.rooms[index]);
    } else {
        res.status(404).json({ message: 'Room not found' });
    }
});

app.delete('/api/rooms/:id', (req, res) => {
    const db = readDB();
    const index = db.rooms.findIndex(r => r.id == req.params.id);
    if (index !== -1) {
        if (db.karaokeSessions && db.karaokeSessions.some(s => s.roomId == req.params.id)) {
            return res.status(400).json({ message: 'Cannot delete room with active session' });
        }
        db.rooms.splice(index, 1);
        writeDB(db);
        res.json({ message: 'Room deleted' });
    } else {
        res.status(404).json({ message: 'Room not found' });
    }
});

// --- KARAOKE SESSIONS API ---
app.get('/api/karaoke-sessions', (req, res) => {
    const db = readDB();
    res.json(db.karaokeSessions || []);
});

app.post('/api/karaoke-sessions/start', (req, res) => {
    const { roomId, customerName, type, durationMinutes } = req.body;
    const db = readDB();
    if (!db.karaokeSessions) db.karaokeSessions = [];
    
    const roomIndex = db.rooms.findIndex(r => r.id == roomId);
    if (roomIndex === -1 || db.rooms[roomIndex].status !== 'available') {
        return res.status(400).json({ message: 'Room not available' });
    }

    const startTime = new Date();
    let endTime = null;
    if (type === 'duration' && durationMinutes) {
        endTime = new Date(startTime.getTime() + durationMinutes * 60000);
    }

    const newSession = {
        id: Date.now(),
        roomId,
        roomName: db.rooms[roomIndex].name,
        hourlyRate: db.rooms[roomIndex].hourlyRate,
        customerName: customerName || 'Tamu',
        type,
        startTime: startTime.toISOString(),
        endTime: endTime ? endTime.toISOString() : null,
        durationMinutes,
        orders: []
    };

    db.karaokeSessions.push(newSession);
    db.rooms[roomIndex].status = 'occupied';
    writeDB(db);
    res.json(newSession);
});

app.post('/api/karaoke-sessions/:id/order', (req, res) => {
    const { itemId, quantity } = req.body;
    const db = readDB();
    
    const sessionIndex = db.karaokeSessions.findIndex(s => s.id == req.params.id);
    if (sessionIndex === -1) return res.status(404).json({ message: 'Session not found' });
    
    const menuItem = db.menu.find(m => m.id == itemId);
    if (!menuItem) return res.status(404).json({ message: 'Menu item not found' });

    const order = {
        id: Date.now(),
        itemId: menuItem.id,
        name: menuItem.name,
        price: menuItem.price,
        quantity: quantity,
        subtotal: menuItem.price * quantity,
        timestamp: new Date().toISOString()
    };

    if (!db.karaokeSessions[sessionIndex].orders) {
        db.karaokeSessions[sessionIndex].orders = [];
    }
    
    db.karaokeSessions[sessionIndex].orders.push(order);
    writeDB(db);
    res.json(db.karaokeSessions[sessionIndex]);
});

app.post('/api/karaoke-sessions/:id/stop', (req, res) => {
    const db = readDB();
    const sessionIndex = db.karaokeSessions.findIndex(s => s.id == req.params.id);
    
    if (sessionIndex === -1) {
        return res.status(404).json({ message: 'Session not found' });
    }

    const session = db.karaokeSessions[sessionIndex];
    const stopTime = new Date();
    const startTime = new Date(session.startTime);
    const durationMs = stopTime - startTime;
    const durationMinutes = Math.ceil(durationMs / 60000);
    const durationHours = durationMs / (1000 * 60 * 60);
    
    const roomAmount = Math.ceil(durationHours * session.hourlyRate);
    const ordersAmount = session.orders ? session.orders.reduce((acc, o) => acc + o.subtotal, 0) : 0;
    const totalAmount = roomAmount + ordersAmount;

    const transaction = {
        id: Date.now(),
        sessionId: session.id,
        tableId: null, // Billiard table id
        roomId: session.roomId, // Karaoke room id
        tableName: session.roomName, // Reuse field for simplicity or rename in frontend
        customerName: session.customerName,
        startTime: session.startTime,
        endTime: stopTime.toISOString(),
        durationMinutes,
        tableAmount: roomAmount, // Room amount
        ordersAmount: ordersAmount,
        amount: totalAmount,
        type: 'karaoke',
        date: stopTime.toISOString().split('T')[0]
    };

    if (!db.transactions) db.transactions = [];
    db.transactions.push(transaction);
    
    const roomIndex = db.rooms.findIndex(r => r.id == session.roomId);
    if (roomIndex !== -1) {
        db.rooms[roomIndex].status = 'available';
    }

    db.karaokeSessions.splice(sessionIndex, 1);
    writeDB(db);
    res.json(transaction);
});

// --- STANDALONE POS (F&B) API ---
app.post('/api/transactions/pos', (req, res) => {
    const { customerName, orders, totalAmount } = req.body;
    const db = readDB();
    
    const transaction = {
        id: Date.now(),
        sessionId: null,
        tableId: 'POS',
        tableName: 'Pesanan Langsung',
        customerName: customerName || 'Pelanggan Umum',
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString(),
        durationMinutes: 0,
        tableAmount: 0,
        ordersAmount: totalAmount,
        amount: totalAmount,
        orders: orders || [],
        date: new Date().toISOString().split('T')[0]
    };

    if (!db.transactions) db.transactions = [];
    db.transactions.push(transaction);
    writeDB(db);
    res.json(transaction);
});

// --- TRANSACTIONS API ---
app.get('/api/transactions', (req, res) => {
    const db = readDB();
    const { date } = req.query;
    if (date) {
        const filtered = db.transactions.filter(t => t.date === date);
        return res.json(filtered);
    }
    res.json(db.transactions);
});

app.post('/api/transactions/close-shift', (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    const db = readDB();
    let count = 0;
    db.transactions.forEach(t => {
        if (t.date === today && !t.isArchived) {
            t.isArchived = true;
            count++;
        }
    });
    writeDB(db);
    res.json({ success: true, archivedCount: count });
});

app.delete('/api/transactions/:id', (req, res) => {
    const db = readDB();
    const index = db.transactions.findIndex(t => t.id == req.params.id);
    if (index !== -1) {
        db.transactions.splice(index, 1);
        writeDB(db);
        res.json({ message: 'Transaction deleted' });
    } else {
        res.status(404).json({ message: 'Transaction not found' });
    }
});

// --- EMPLOYEES & ATTENDANCE API ---
app.get('/api/employees', (req, res) => {
    const db = readDB();
    res.json(db.employees);
});

app.post('/api/employees', (req, res) => {
    const { name, role, phone } = req.body;
    if (!name) return res.status(400).json({ message: 'Name is required' });

    const db = readDB();
    const newEmployee = {
        id: Date.now(),
        name,
        role: role || 'Pegawai',
        phone: phone || '',
        createdAt: new Date().toISOString()
    };
    
    db.employees.push(newEmployee);
    writeDB(db);
    res.json(newEmployee);
});

app.delete('/api/employees/:id', (req, res) => {
    const db = readDB();
    const index = db.employees.findIndex(e => e.id == req.params.id);
    if (index !== -1) {
        db.employees.splice(index, 1);
        writeDB(db);
        res.json({ success: true });
    } else {
        res.status(404).json({ message: 'Employee not found' });
    }
});

app.post('/api/attendance', (req, res) => {
    const { employeeId, type } = req.body; // type: 'in' or 'out'
    const db = readDB();
    const employee = db.employees.find(e => e.id == employeeId);
    
    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    const record = {
        id: Date.now(),
        employeeId,
        employeeName: employee.name,
        type,
        timestamp: new Date().toISOString(),
        date: new Date().toISOString().split('T')[0]
    };

    db.attendance.push(record);
    writeDB(db);
    res.json(record);
});

app.post('/api/attendance/close-shift', (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    const db = readDB();
    let count = 0;
    db.attendance.forEach(a => {
        if (a.date === today && !a.isArchived) {
            a.isArchived = true;
            count++;
        }
    });
    writeDB(db);
    res.json({ success: true, archivedCount: count });
});

app.get('/api/attendance', (req, res) => {
    const db = readDB();
    res.json(db.attendance);
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

app.put('/api/users/update', (req, res) => {
    const { oldUsername, newUsername, newPassword } = req.body;
    const db = readDB();
    const userIndex = db.users.findIndex(u => u.username === oldUsername);
    
    if (userIndex !== -1) {
        if (newUsername) db.users[userIndex].username = newUsername;
        if (newPassword) db.users[userIndex].password = newPassword;
        writeDB(db);
        res.json({ success: true, message: 'Profil berhasil diperbarui' });
    } else {
        res.status(404).json({ success: false, message: 'User tidak ditemukan' });
    }
});

// --- MENU (F&B) API ---
app.get('/api/menu', (req, res) => {
    const db = readDB();
    res.json(db.menu || []);
});

app.post('/api/menu', (req, res) => {
    const { name, category, price } = req.body;
    const db = readDB();
    const newItem = {
        id: Date.now(),
        name,
        category,
        price: parseInt(price)
    };
    if (!db.menu) db.menu = [];
    db.menu.push(newItem);
    writeDB(db);
    res.json(newItem);
});

app.delete('/api/menu/:id', (req, res) => {
    const db = readDB();
    if (!db.menu) db.menu = [];
    const index = db.menu.findIndex(m => m.id == req.params.id);
    if (index !== -1) {
        db.menu.splice(index, 1);
        writeDB(db);
        res.json({ success: true });
    } else {
        res.status(404).json({ message: 'Menu not found' });
    }
});

app.get('/api/menu-categories', (req, res) => {
    const db = readDB();
    res.json(db.menuCategories || []);
});

// --- SESSION ORDERS API ---
app.post('/api/sessions/:id/order', (req, res) => {
    const { itemId, quantity } = req.body;
    const db = readDB();
    const sessionIndex = db.sessions.findIndex(s => s.id == req.params.id);
    
    if (sessionIndex === -1) return res.status(404).json({ message: 'Session not found' });
    
    const menuItem = db.menu.find(m => m.id == itemId);
    if (!menuItem) return res.status(404).json({ message: 'Menu item not found' });

    if (!db.sessions[sessionIndex].orders) db.sessions[sessionIndex].orders = [];
    
    // Check if order already exists
    const existingOrder = db.sessions[sessionIndex].orders.find(o => o.itemId == itemId);
    if (existingOrder) {
        existingOrder.quantity += quantity;
        existingOrder.subtotal = existingOrder.quantity * existingOrder.price;
    } else {
        db.sessions[sessionIndex].orders.push({
            id: Date.now(),
            itemId,
            name: menuItem.name,
            price: menuItem.price,
            quantity,
            subtotal: menuItem.price * quantity,
            timestamp: new Date().toISOString()
        });
    }
    
    // Deduct stock
    const menuIndex = db.menu.findIndex(m => m.id == itemId);
    if (menuIndex !== -1) {
        db.menu[menuIndex].stock = Math.max(0, (db.menu[menuIndex].stock || 0) - quantity);
    }
    
    writeDB(db);
    res.json(db.sessions[sessionIndex]);
});

app.post('/api/menu/:id/adjust-stock', (req, res) => {
    const { delta } = req.body;
    const db = readDB();
    const index = db.menu.findIndex(m => m.id == req.params.id);
    if (index !== -1) {
        db.menu[index].stock = (db.menu[index].stock || 0) + delta;
        if (db.menu[index].stock < 0) db.menu[index].stock = 0;
        writeDB(db);
        res.json({ success: true, newStock: db.menu[index].stock });
    } else {
        res.status(404).json({ message: 'Menu not found' });
    }
});

app.post('/api/menu/:id/set-stock', (req, res) => {
    const { stock } = req.body;
    const db = readDB();
    const index = db.menu.findIndex(m => m.id == req.params.id);
    if (index !== -1) {
        db.menu[index].stock = Math.max(0, stock);
        writeDB(db);
        res.json({ success: true, newStock: db.menu[index].stock });
    } else {
        res.status(404).json({ message: 'Menu not found' });
    }
});

app.post('/api/transactions/pos', (req, res) => {
    const { customerName, orders, totalAmount } = req.body;
    const db = readDB();
    
    // Deduct stock
    orders.forEach(order => {
        const menuIndex = db.menu.findIndex(m => m.id == order.itemId);
        if (menuIndex !== -1) {
            db.menu[menuIndex].stock = Math.max(0, (db.menu[menuIndex].stock || 0) - order.quantity);
        }
    });

    const newTransaction = {
        id: Date.now(),
        customerName: customerName || 'Customer POS',
        amount: totalAmount,
        type: 'pos',
        orders: orders,
        timestamp: new Date().toISOString(),
        isArchived: false
    };
    db.transactions.push(newTransaction);
    writeDB(db);
    res.json(newTransaction);
});

app.post('/api/restart', (req, res) => {
    res.json({ success: true, message: 'Restarting system...' });
    setTimeout(() => {
        process.exit(1);
    }, 1000);
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
