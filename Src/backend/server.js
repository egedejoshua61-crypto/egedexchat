const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

// 1. SOCKET.IO SETUP (Real-time Engine)
const io = new Server(server, {
    cors: {
        origin: "*", // In production, replace with your actual domain
        methods: ["GET", "POST"]
    }
});

// 2. MIDDLEWARE
app.use(helmet({ contentSecurityPolicy: false })); // Security headers
app.use(cors()); // Allow cross-origin requests
app.use(express.json()); // Parse JSON bodies
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files (Images/Videos/Voice)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Serve Frontend (if you put your HTML files in a 'public' folder)
app.use(express.static(path.join(__dirname, '../frontend')));

// 3. DATABASE CONNECTION
mongoose.connect(process.env.DATABASE_URL)
    .then(() => console.log('✅ BLOOD SOCIAL Database Connected'))
    .catch((err) => console.error('❌ Database Connection Error:', err));

// 4. REAL-TIME LOGIC (Socket.IO)
const users = new Map(); // Track online users

io.on('connection', (socket) => {
    console.log('User Connected:', socket.id);

    // User joins with their Account ID
    socket.on('join', (userId) => {
        socket.join(userId);
        users.set(userId, socket.id);
        io.emit('user_status', { userId, status: 'online' });
    });

    // Handle Private Messages
    socket.on('private_message', (data) => {
        // data: { senderId, receiverId, message, type, timestamp }
        io.to(data.receiverId).emit('new_message', data);
    });

    // Typing Indicator
    socket.on('typing', (data) => {
        io.to(data.receiverId).emit('user_typing', { userId: data.senderId });
    });

    // WebRTC Signaling (Audio/Video Calls)
    socket.on('call_request', (data) => {
        io.to(data.receiverId).emit('incoming_call', {
            signal: data.signal,
            from: data.senderId,
            callerName: data.callerName,
            type: data.type // 'audio' or 'video'
        });
    });

    socket.on('answer_call', (data) => {
        io.to(data.to).emit('call_accepted', data.signal);
    });

    socket.on('ice_candidate', (data) => {
        io.to(data.to).emit('ice_candidate', data.candidate);
    });

    // Disconnect
    socket.on('disconnect', () => {
        let disconnectedUser = "";
        for (let [userId, socketId] of users.entries()) {
            if (socketId === socket.id) {
                disconnectedUser = userId;
                users.delete(userId);
                break;
            }
        }
        io.emit('user_status', { userId: disconnectedUser, status: 'offline' });
        console.log('User Disconnected');
    });
});

// 5. API ROUTES (To be created in the routes folder)
// app.use('/api/auth', require('./routes/auth'));
// app.use('/api/chat', require('./routes/chat'));
// app.use('/api/payments', require('./routes/payments'));
// app.use('/api/admin', require('./routes/admin'));

// 6. START SERVER
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`
    🩸 BLOOD SOCIAL SERVER RUNNING
    ------------------------------
    Port: ${PORT}
    Admin: egedejoshua61@gmail.com
    Status: Production-Ready
    `);
});