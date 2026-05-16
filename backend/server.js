require('dotenv').config();
if (typeof global.crypto === 'undefined') {
    global.crypto = require('crypto');
}
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const models = require('./models');

const app = express();
const PORT = process.env.PORT || 3001;

// MongoDB Connection
const MONGO_URL = process.env.MONGO_URL;
if (MONGO_URL && !MONGO_URL.includes('Masukkan_URL')) {
    mongoose.connect(MONGO_URL)
        .then(() => console.log('Terhubung ke MongoDB'))
        .catch(err => console.error('Gagal koneksi MongoDB:', err));
} else {
    console.warn('PERINGATAN: MONGO_URL tidak ditemukan di .env. Aplikasi mungkin tidak berjalan dengan benar.');
}

app.use(cors());
app.use(express.json());

// Serve static files from the frontend directory
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// Root redirect to login.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'frontend', 'login.html'));
});

// --- TABLES API ---
app.get('/api/tables', async (req, res) => {
    const tables = await models.Table.find();
    res.json(tables);
});

app.post('/api/tables', async (req, res) => {
    const newTable = new models.Table({
        name: req.body.name,
        hourlyRate: req.body.hourlyRate,
        status: 'available',
        description: req.body.description
    });
    await newTable.save();
    res.json(newTable);
});

app.delete('/api/tables/:id', async (req, res) => {
    try {
        const activeSession = await models.Session.findOne({ tableId: req.params.id });
        if (activeSession) {
            return res.status(400).json({ message: 'Cannot delete table with active session' });
        }
        await models.Table.findByIdAndDelete(req.params.id);
        res.json({ message: 'Table deleted' });
    } catch (err) {
        res.status(404).json({ message: 'Table not found' });
    }
});

app.put('/api/tables/:id', async (req, res) => {
    try {
        const updated = await models.Table.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json(updated);
    } catch (err) {
        res.status(404).json({ message: 'Table not found' });
    }
});

// --- SESSIONS API (Rental Management) ---
app.get('/api/sessions', async (req, res) => {
    const sessions = await models.Session.find();
    res.json(sessions);
});

app.post('/api/sessions/start', async (req, res) => {
    const { tableId, customerName, type, durationMinutes } = req.body;
    
    const table = await models.Table.findById(tableId);
    if (!table || table.status !== 'available') {
        return res.status(400).json({ message: 'Table not available' });
    }

    const startTime = new Date();
    let endTime = null;
    if (type === 'duration' && durationMinutes) {
        endTime = new Date(startTime.getTime() + durationMinutes * 60000);
    }

    const newSession = new models.Session({
        tableId,
        tableName: table.name,
        customerName,
        type,
        startTime,
        endTime,
        hourlyRate: table.hourlyRate
    });

    await newSession.save();
    table.status = 'occupied';
    await table.save();
    
    res.json(newSession);
});

app.post('/api/sessions/:id/stop', async (req, res) => {
    const session = await models.Session.findById(req.params.id);
    if (!session) return res.status(404).json({ message: 'Session not found' });

    const stopTime = new Date();
    const startTime = new Date(session.startTime);
    const durationMs = stopTime - startTime;
    const durationHours = durationMs / (1000 * 60 * 60);
    const tableAmount = Math.ceil(durationHours * session.hourlyRate);
    const ordersTotal = session.orders ? session.orders.reduce((acc, o) => acc + o.subtotal, 0) : 0;
    const totalAmount = tableAmount + ordersTotal;

    const transaction = new models.Transaction({
        sessionId: session._id,
        tableId: session.tableId,
        tableName: session.tableName,
        customerName: session.customerName,
        startTime: session.startTime,
        endTime: stopTime,
        durationMinutes: Math.round(durationMs / 60000),
        tableAmount: tableAmount,
        ordersAmount: ordersTotal,
        amount: totalAmount,
        orders: session.orders || [],
        date: stopTime.toISOString().split('T')[0]
    });

    await transaction.save();
    
    // Reset table status
    await models.Table.findByIdAndUpdate(session.tableId, { status: 'available' });
    // Remove active session
    await models.Session.findByIdAndDelete(req.params.id);
    
    res.json(transaction);
});

// --- KARAOKE ROOMS API ---
app.get('/api/rooms', async (req, res) => {
    const rooms = await models.Room.find();
    res.json(rooms);
});

app.post('/api/rooms', async (req, res) => {
    const newRoom = new models.Room({
        name: req.body.name,
        hourlyRate: req.body.hourlyRate,
        status: 'available',
        description: req.body.description
    });
    await newRoom.save();
    res.json(newRoom);
});

app.put('/api/rooms/:id', async (req, res) => {
    try {
        const updated = await models.Room.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json(updated);
    } catch (err) {
        res.status(404).json({ message: 'Room not found' });
    }
});

app.delete('/api/rooms/:id', async (req, res) => {
    try {
        const activeSession = await models.KaraokeSession.findOne({ roomId: req.params.id });
        if (activeSession) {
            return res.status(400).json({ message: 'Cannot delete room with active session' });
        }
        await models.Room.findByIdAndDelete(req.params.id);
        res.json({ message: 'Room deleted' });
    } catch (err) {
        res.status(404).json({ message: 'Room not found' });
    }
});

// --- KARAOKE SESSIONS API ---
app.get('/api/karaoke-sessions', async (req, res) => {
    const sessions = await models.KaraokeSession.find();
    res.json(sessions);
});

app.post('/api/karaoke-sessions/start', async (req, res) => {
    const { roomId, customerName, type, durationMinutes } = req.body;
    
    const room = await models.Room.findById(roomId);
    if (!room || room.status !== 'available') {
        return res.status(400).json({ message: 'Room not available' });
    }

    const startTime = new Date();
    let endTime = null;
    if (type === 'duration' && durationMinutes) {
        endTime = new Date(startTime.getTime() + durationMinutes * 60000);
    }

    const newSession = new models.KaraokeSession({
        roomId,
        roomName: room.name,
        hourlyRate: room.hourlyRate,
        customerName: customerName || 'Tamu',
        type,
        startTime,
        endTime,
        durationMinutes
    });

    await newSession.save();
    room.status = 'occupied';
    await room.save();
    res.json(newSession);
});

app.post('/api/karaoke-sessions/:id/order', async (req, res) => {
    const { itemId, quantity } = req.body;
    const session = await models.KaraokeSession.findById(req.params.id);
    if (!session) return res.status(404).json({ message: 'Session not found' });
    
    const menuItem = await models.Menu.findById(itemId);
    if (!menuItem) return res.status(404).json({ message: 'Menu item not found' });

    const order = {
        itemId: menuItem._id,
        name: menuItem.name,
        price: menuItem.price,
        quantity: quantity,
        subtotal: menuItem.price * quantity,
        timestamp: new Date()
    };

    session.orders.push(order);
    await session.save();
    res.json(session);
});

app.post('/api/karaoke-sessions/:id/stop', async (req, res) => {
    const session = await models.KaraokeSession.findById(req.params.id);
    if (!session) return res.status(404).json({ message: 'Session not found' });

    const stopTime = new Date();
    const startTime = new Date(session.startTime);
    const durationMs = stopTime - startTime;
    const durationMinutes = Math.ceil(durationMs / 60000);
    const durationHours = durationMs / (1000 * 60 * 60);
    
    const roomAmount = Math.ceil(durationHours * session.hourlyRate);
    const ordersAmount = session.orders ? session.orders.reduce((acc, o) => acc + o.subtotal, 0) : 0;
    const totalAmount = roomAmount + ordersAmount;

    const transaction = new models.Transaction({
        sessionId: session._id,
        roomId: session.roomId,
        tableName: session.roomName,
        customerName: session.customerName,
        startTime: session.startTime,
        endTime: stopTime,
        durationMinutes,
        tableAmount: roomAmount,
        ordersAmount: ordersAmount,
        amount: totalAmount,
        type: 'karaoke',
        date: stopTime.toISOString().split('T')[0]
    });

    await transaction.save();
    await models.Room.findByIdAndUpdate(session.roomId, { status: 'available' });
    await models.KaraokeSession.findByIdAndDelete(req.params.id);
    res.json(transaction);
});

// --- STANDALONE POS (F&B) API ---
app.post('/api/transactions/pos', async (req, res) => {
    const { customerName, orders, totalAmount } = req.body;
    
    const transaction = new models.Transaction({
        tableId: 'POS',
        tableName: 'Pesanan Langsung',
        customerName: customerName || 'Pelanggan Umum',
        startTime: new Date(),
        endTime: new Date(),
        durationMinutes: 0,
        tableAmount: 0,
        ordersAmount: totalAmount,
        amount: totalAmount,
        orders: orders || [],
        date: new Date().toISOString().split('T')[0],
        type: 'pos'
    });

    await transaction.save();
    res.json(transaction);
});

// --- TRANSACTIONS API ---
app.get('/api/transactions', async (req, res) => {
    const { date } = req.query;
    let query = {};
    if (date) query.date = date;
    const transactions = await models.Transaction.find(query);
    res.json(transactions);
});

app.post('/api/transactions/close-shift', async (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    const result = await models.Transaction.updateMany(
        { date: today, isArchived: false },
        { isArchived: true }
    );
    res.json({ success: true, archivedCount: result.modifiedCount });
});

app.delete('/api/transactions/:id', async (req, res) => {
    try {
        await models.Transaction.findByIdAndDelete(req.params.id);
        res.json({ message: 'Transaction deleted' });
    } catch (err) {
        res.status(404).json({ message: 'Transaction not found' });
    }
});

// --- EMPLOYEES & ATTENDANCE API ---
app.get('/api/employees', async (req, res) => {
    const employees = await models.Employee.find();
    res.json(employees);
});

app.post('/api/employees', async (req, res) => {
    const { name, role, phone } = req.body;
    if (!name) return res.status(400).json({ message: 'Name is required' });

    const newEmployee = new models.Employee({
        name,
        role: role || 'Pegawai',
        phone: phone || ''
    });
    await newEmployee.save();
    res.json(newEmployee);
});

app.delete('/api/employees/:id', async (req, res) => {
    try {
        await models.Employee.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(404).json({ message: 'Employee not found' });
    }
});

app.post('/api/attendance', async (req, res) => {
    const { employeeId, type } = req.body;
    const employee = await models.Employee.findById(employeeId);
    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    const record = new models.Attendance({
        employeeId,
        employeeName: employee.name,
        type,
        timestamp: new Date(),
        date: new Date().toISOString().split('T')[0]
    });

    await record.save();
    res.json(record);
});

app.post('/api/attendance/close-shift', async (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    const result = await models.Attendance.updateMany(
        { date: today, isArchived: false },
        { isArchived: true }
    );
    res.json({ success: true, archivedCount: result.modifiedCount });
});

app.get('/api/attendance', async (req, res) => {
    const records = await models.Attendance.find();
    res.json(records);
});

// --- AUTH API ---
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    const user = await models.User.findOne({ username, password });
    
    if (user) {
        res.json({ success: true, role: user.role, username: user.username });
    } else {
        res.status(401).json({ success: false, message: 'Username atau password salah' });
    }
});

app.put('/api/users/update', async (req, res) => {
    const { oldUsername, newUsername, newPassword } = req.body;
    let update = {};
    if (newUsername) update.username = newUsername;
    if (newPassword) update.password = newPassword;

    const user = await models.User.findOneAndUpdate({ username: oldUsername }, update);
    if (user) {
        res.json({ success: true, message: 'Profil berhasil diperbarui' });
    } else {
        res.status(404).json({ success: false, message: 'User tidak ditemukan' });
    }
});

// --- MENU (F&B) API ---
app.get('/api/menu', async (req, res) => {
    const menu = await models.Menu.find();
    res.json(menu);
});

app.post('/api/menu', async (req, res) => {
    const { name, category, price } = req.body;
    const newItem = new models.Menu({
        name,
        category,
        price: parseInt(price)
    });
    await newItem.save();
    res.json(newItem);
});

app.delete('/api/menu/:id', async (req, res) => {
    try {
        await models.Menu.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(404).json({ message: 'Menu not found' });
    }
});

app.get('/api/menu-categories', async (req, res) => {
    const categories = await models.MenuCategory.find();
    res.json(categories);
});

// --- SESSION ORDERS API ---
app.post('/api/sessions/:id/order', async (req, res) => {
    const { itemId, quantity } = req.body;
    const session = await models.Session.findById(req.params.id);
    if (!session) return res.status(404).json({ message: 'Session not found' });
    
    const menuItem = await models.Menu.findById(itemId);
    if (!menuItem) return res.status(404).json({ message: 'Menu item not found' });

    // Check if order already exists
    const existingOrder = session.orders.find(o => o.itemId.toString() === itemId);
    if (existingOrder) {
        existingOrder.quantity += quantity;
        existingOrder.subtotal = existingOrder.quantity * existingOrder.price;
    } else {
        session.orders.push({
            itemId,
            name: menuItem.name,
            price: menuItem.price,
            quantity,
            subtotal: menuItem.price * quantity,
            timestamp: new Date()
        });
    }
    
    // Deduct stock
    menuItem.stock = Math.max(0, (menuItem.stock || 0) - quantity);
    await menuItem.save();
    await session.save();
    
    res.json(session);
});

app.post('/api/menu/:id/adjust-stock', async (req, res) => {
    const { delta } = req.body;
    try {
        const menu = await models.Menu.findById(req.params.id);
        if (menu) {
            menu.stock = Math.max(0, (menu.stock || 0) + delta);
            await menu.save();
            res.json({ success: true, newStock: menu.stock });
        } else {
            res.status(404).json({ message: 'Menu not found' });
        }
    } catch (err) {
        res.status(404).json({ message: 'Menu not found' });
    }
});

app.post('/api/menu/:id/set-stock', async (req, res) => {
    const { stock } = req.body;
    try {
        const updated = await models.Menu.findByIdAndUpdate(req.params.id, { stock: Math.max(0, stock) }, { new: true });
        res.json({ success: true, newStock: updated.stock });
    } catch (err) {
        res.status(404).json({ message: 'Menu not found' });
    }
});

app.post('/api/transactions/pos', async (req, res) => {
    const { customerName, orders, totalAmount } = req.body;
    
    // Deduct stock
    for (const order of orders) {
        await models.Menu.findByIdAndUpdate(order.itemId, { $inc: { stock: -order.quantity } });
    }

    const newTransaction = new models.Transaction({
        customerName: customerName || 'Customer POS',
        amount: totalAmount,
        type: 'pos',
        orders: orders,
        startTime: new Date(),
        endTime: new Date(),
        date: new Date().toISOString().split('T')[0]
    });
    await newTransaction.save();
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
