require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Serve static files from frontend
app.use(express.static(path.join(__dirname, 'frontend')));

// DB Path (pointing to backend/data/db.json)
const DB_PATH = path.join(__dirname, 'backend', 'data', 'db.json');

function readDB() {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}

function writeDB(data) {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend', 'login.html'));
});

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
        res.status(500).json({ success: false, message: err.message });
    }
});

// --- BASIC API FOR DASHBOARD ---
app.get('/api/tables', (req, res) => res.json(readDB().tables));
app.get('/api/sessions', (req, res) => res.json(readDB().sessions));
app.get('/api/menu', (req, res) => res.json(readDB().menu));
app.get('/api/transactions', (req, res) => {
    const { date } = req.query;
    let results = readDB().transactions;
    if (date) results = results.filter(t => t.date === date);
    res.json(results);
});

app.listen(PORT, () => {
    console.log(`Server running at port ${PORT}`);
});
