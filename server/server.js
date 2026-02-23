require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const fs = require('fs');

const app = express();

// ── Security Middleware ──
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            "default-src": ["'self'"],
            "script-src": ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://unpkg.com", "https://checkout.razorpay.com"],
            "style-src": ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://fonts.googleapis.com"],
            "font-src": ["'self'", "https://fonts.gstatic.com", "https://cdn.jsdelivr.net"],
            "img-src": ["'self'", "data:", "https://images.unsplash.com", "blob:"],
            "connect-src": ["'self'", "https://api.razorpay.com", "https://lumberjack.razorpay.com"]
        }
    }
}));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname, '..', 'client')));
// Serve uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Create uploads directory if not exists
if (!fs.existsSync('./uploads')) {
    fs.mkdirSync('./uploads');
}

// ── Database Connection ──
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/college-events')
    .then(() => console.log('✅ MongoDB Connected'))
    .catch(err => console.error('❌ MongoDB Connection Error:', err));

// ── Routes ──
app.use('/api/auth', require('./routes/auth'));
app.use('/api/events', require('./routes/events'));
app.use('/api/registrations', require('./routes/registrations'));
app.use('/api/admin', require('./routes/admin'));

// ── Frontend Page Routing ──
app.get('/', (req, res) => res.sendFile(path.join(__dirname, '..', 'client', 'index.html')));
app.get('/register', (req, res) => res.sendFile(path.join(__dirname, '..', 'client', 'register.html')));
app.get('/student', (req, res) => res.sendFile(path.join(__dirname, '..', 'client', 'student.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, '..', 'client', 'admin.html')));
app.get('/scanner', (req, res) => res.sendFile(path.join(__dirname, '..', 'client', 'scanner.html')));

// Token-based Gate entry route
app.get('/gate/:token', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'client', 'gate.html'));
});

// 404 handler
app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, '..', 'client', 'index.html'));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
