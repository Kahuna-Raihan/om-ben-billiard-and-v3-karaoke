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
    try {
        return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    } catch (err) {
        console.error('Error reading DB:', err);
        return { users: [], tables: [], sessions: [], transactions: [], menu: [], employees: [], attendance: [] };
    }
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
    try {
        const { username, password } = req.body;
        const db = readDB();
        const user = db.users.find(u => u.username === username && u.password === password);
        
        if (user) {
            res.json({ success: true, role: user.role, username: user.username });
        } else {
            res.status(401).json({ success: false, message: 'Username atau password salah' });
        }
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server Error: ' + err.message });
    }
});

// --- BASIC GET API ---
app.get('/api/tables', (req, res) => res.json(readDB().tables));
app.get('/api/sessions', (req, res) => res.json(readDB().sessions));
app.get('/api/menu', (req, res) => res.json(readDB().menu));

app.listen(PORT, () => {
    console.log(`Server running at port ${PORT}`);
});
