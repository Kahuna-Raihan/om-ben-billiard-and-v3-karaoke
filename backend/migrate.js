require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const models = require('./models');

const DB_PATH = path.join(__dirname, 'data', 'db.json');

async function migrate() {
    if (!process.env.MONGO_URL || process.env.MONGO_URL.includes('Masukkan_URL')) {
        console.error('Silakan isi MONGO_URL di file .env terlebih dahulu!');
        process.exit(1);
    }

    try {
        await mongoose.connect(process.env.MONGO_URL);
        console.log('Terhubung ke MongoDB...');

        const data = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));

        // Clear existing data
        await Promise.all(Object.values(models).map(model => model.deleteMany({})));
        console.log('Database dibersihkan...');

        // 1. Migrate Users
        if (data.users) {
            await models.User.insertMany(data.users);
            console.log('Users dimigrasikan.');
        }

        // 2. Migrate Menu Categories
        if (data.menuCategories) {
            await models.MenuCategory.insertMany(data.menuCategories.map(c => ({ name: c.name })));
            console.log('Menu Categories dimigrasikan.');
        }

        // 3. Migrate Menu Items
        if (data.menu) {
            await models.Menu.insertMany(data.menu.map(m => ({
                name: m.name,
                category: m.category,
                price: m.price,
                stock: m.stock || 0
            })));
            console.log('Menu Items dimigrasikan.');
        }

        // 4. Migrate Employees
        let employeeMap = {};
        if (data.employees) {
            for (const emp of data.employees) {
                const newEmp = await models.Employee.create({
                    name: emp.name,
                    role: emp.role,
                    phone: emp.phone,
                    createdAt: emp.createdAt
                });
                employeeMap[emp.id] = newEmp._id;
            }
            console.log('Employees dimigrasikan.');
        }

        // 5. Migrate Tables
        let tableMap = {};
        if (data.tables) {
            for (const table of data.tables) {
                const newTable = await models.Table.create({
                    name: table.name,
                    hourlyRate: table.hourlyRate,
                    status: table.status,
                    description: table.description
                });
                tableMap[table.id] = newTable._id;
            }
            console.log('Tables dimigrasikan.');
        }

        // 6. Migrate Rooms
        let roomMap = {};
        if (data.rooms) {
            for (const room of data.rooms) {
                const newRoom = await models.Room.create({
                    name: room.name,
                    hourlyRate: room.hourlyRate,
                    status: room.status,
                    description: room.description
                });
                roomMap[room.id] = newRoom._id;
            }
            console.log('Rooms dimigrasikan.');
        }

        // 7. Migrate Sessions
        if (data.sessions) {
            for (const session of data.sessions) {
                await models.Session.create({
                    tableId: tableMap[session.tableId],
                    tableName: session.tableName,
                    customerName: session.customerName,
                    type: session.type,
                    startTime: session.startTime,
                    endTime: session.endTime,
                    hourlyRate: session.hourlyRate,
                    orders: session.orders || []
                });
            }
        }

        // 8. Migrate Karaoke Sessions
        if (data.karaokeSessions) {
            for (const ks of data.karaokeSessions) {
                await models.KaraokeSession.create({
                    roomId: roomMap[ks.roomId],
                    roomName: ks.roomName,
                    customerName: ks.customerName,
                    type: ks.type,
                    startTime: ks.startTime,
                    endTime: ks.endTime,
                    hourlyRate: ks.hourlyRate,
                    durationMinutes: ks.durationMinutes,
                    orders: ks.orders || []
                });
            }
        }

        // 9. Migrate Transactions
        if (data.transactions) {
            await models.Transaction.insertMany(data.transactions.map(t => ({
                ...t,
                tableId: t.tableId ? (tableMap[t.tableId] || t.tableId) : null,
                roomId: t.roomId ? (roomMap[t.roomId] || t.roomId) : null
            })));
            console.log('Transactions dimigrasikan.');
        }

        // 10. Migrate Attendance
        if (data.attendance) {
            await models.Attendance.insertMany(data.attendance.map(a => ({
                ...a,
                employeeId: employeeMap[a.employeeId]
            })));
            console.log('Attendance dimigrasikan.');
        }

        console.log('MIGRASI SELESAI BERHASIL!');
        process.exit(0);
    } catch (err) {
        console.error('Terjadi kesalahan saat migrasi:', err);
        process.exit(1);
    }
}

migrate();
