const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");
const fs = require("fs");
require("dotenv").config();

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 5000;
const FRONTEND_URL = process.env.FRONTEND_URL || "*";

// ============================================================
// SECURITY
// ============================================================

app.use(
    helmet({
        contentSecurityPolicy: false
    })
);

app.use(
    cors({
        origin: FRONTEND_URL,
        credentials: true
    })
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({
    extended: true,
    limit: "10mb"
}));

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false
});

app.use("/api/", apiLimiter);

// ============================================================
// UPLOADS
// ============================================================

const uploadsPath = path.join(__dirname, "uploads");

if (!fs.existsSync(uploadsPath)) {
    fs.mkdirSync(uploadsPath, {
        recursive: true
    });
}

app.use(
    "/uploads",
    express.static(uploadsPath)
);

// ============================================================
// FRONTEND
// ============================================================

const frontendPath = path.join(
    __dirname,
    "../frontend"
);

if (fs.existsSync(frontendPath)) {
    app.use(
        express.static(frontendPath)
    );
}

// ============================================================
// SOCKET.IO
// ============================================================

const io = new Server(server, {
    cors: {
        origin: FRONTEND_URL,
        methods: ["GET", "POST"],
        credentials: true
    }
});

// ============================================================
// DATABASE
// ============================================================

if (!process.env.DATABASE_URL) {
    console.error(
        "❌ DATABASE_URL is missing."
    );
} else {
    mongoose
        .connect(process.env.DATABASE_URL)
        .then(() => {
            console.log(
                "✅ MongoDB connected"
            );
        })
        .catch((error) => {
            console.error(
                "❌ MongoDB error:",
                error.message
            );
        });
}

mongoose.connection.on(
    "connected",
    () => console.log("🗄️ Database ready")
);

mongoose.connection.on(
    "disconnected",
    () => console.log("⚠️ Database disconnected")
);

// ============================================================
// ROUTES
// ============================================================

app.use(
    "/api/auth",
    require("./routes/auth")
);

app.use(
    "/api/users",
    require("./routes/users")
);

app.use(
    "/api/chat",
    require("./routes/chat")
);

app.use(
    "/api/posts",
    require("./routes/posts")
);

app.use(
    "/api/notifications",
    require("./routes/notifications")
);

app.use(
    "/api/admin",
    require("./routes/admin")
);

// ============================================================
// HEALTH
// ============================================================

app.get("/api/health", (req, res) => {
    res.json({
        success: true,
        app: "BLOOD SOCIAL",
        status: "online",
        database:
            mongoose.connection.readyState === 1
                ? "connected"
                : "disconnected",
        socketIO: true,
        timestamp: new Date().toISOString()
    });
});

app.get("/api", (req, res) => {
    res.json({
        success: true,
        name: "BLOOD SOCIAL",
        version: "1.0.0",
        message: "API is running"
    });
});

// ============================================================
// ONLINE USERS
// ============================================================

const onlineUsers = new Map();

function addUser(userId, socketId) {
    if (!onlineUsers.has(userId)) {
        onlineUsers.set(
            userId,
            new Set()
        );
    }

    onlineUsers
        .get(userId)
        .add(socketId);
}

function removeUser(userId, socketId) {
    const sockets =
        onlineUsers.get(userId);

    if (!sockets) return false;

    sockets.delete(socketId);

    if (sockets.size === 0) {
        onlineUsers.delete(userId);
        return true;
    }

    return false;
}

function sendToUser(
    userId,
    event,
    data
) {
    const sockets =
        onlineUsers.get(
            String(userId)
        );

    if (!sockets) return;

    for (const socketId of sockets) {
        io.to(socketId).emit(
            event,
            data
        );
    }
}

// ============================================================
// SOCKET.IO
// ============================================================

io.on("connection", (socket) => {

    console.log(
        "🔌 Socket connected:",
        socket.id
    );

    // --------------------------------------------------------
    // JOIN
    // --------------------------------------------------------

    socket.on("join", (userId) => {

        if (!userId) return;

        userId = String(userId);

        socket.userId = userId;

        socket.join(userId);

        addUser(
            userId,
            socket.id
        );

        io.emit(
            "user_status",
            {
                userId,
                status: "online"
            }
        );
    });

    // --------------------------------------------------------
    // PRIVATE MESSAGE
    // --------------------------------------------------------

    socket.on(
        "private_message",
        async (data) => {

            try {

                if (!data) return;

                const {
                    senderId,
                    receiverId,
                    message,
                    type
                } = data;

                if (
                    !senderId ||
                    !receiverId ||
                    !message
                ) {
                    return;
                }

                const Message =
                    require(
                        "./models/Message"
                    );

                const saved =
                    await Message.create({
                        senderId,
                        receiverId,
                        message,
                        type:
                            type || "text"
                    });

                const payload = {
                    _id: saved._id,
                    senderId,
                    receiverId,
                    message,
                    type:
                        type || "text",
                    createdAt:
                        saved.createdAt
                };

                sendToUser(
                    receiverId,
                    "new_message",
                    payload
                );

                socket.emit(
                    "message_sent",
                    payload
                );

            } catch (error) {

                console.error(
                    "Message error:",
                    error.message
                );

            }
        }
    );

    // --------------------------------------------------------
    // TYPING
    // --------------------------------------------------------

    socket.on(
        "typing",
        (data) => {

            if (!data) return;

            const {
                senderId,
                receiverId
            } = data;

            if (
                !senderId ||
                !receiverId
            ) return;

            sendToUser(
                receiverId,
                "user_typing",
                {
                    userId: senderId
                }
            );
        }
    );

    socket.on(
        "stop_typing",
        (data) => {

            if (!data) return;

            const {
                senderId,
                receiverId
            } = data;

            if (
                !senderId ||
                !receiverId
            ) return;

            sendToUser(
                receiverId,
                "user_stopped_typing",
                {
                    userId: senderId
                }
            );
        }
    );

    // ========================================================
    // WEBRTC
    // ========================================================

    socket.on(
        "call_request",
        (data) => {

            if (!data) return;

            const {
                senderId,
                receiverId,
                signal,
                callerName,
                type
            } = data;

            if (
                !senderId ||
                !receiverId
            ) return;

            sendToUser(
                receiverId,
                "incoming_call",
                {
                    signal,
                    from: senderId,
                    callerName:
                        callerName ||
                        "BLOOD SOCIAL User",
                    type:
                        type === "video"
                            ? "video"
                            : "audio"
                }
            );
        }
    );

    socket.on(
        "answer_call",
        (data) => {

            if (!data) return;

            const {
                to,
                signal
            } = data;

            if (!to) return;

            sendToUser(
                to,
                "call_accepted",
                signal
            );
        }
    );

    socket.on(
        "ice_candidate",
        (data) => {

            if (!data) return;

            const {
                to,
                candidate
            } = data;

            if (!to) return;

            sendToUser(
                to,
                "ice_candidate",
                candidate
            );
        }
    );

    socket.on(
        "end_call",
        (data) => {

            if (!data?.to) return;

            sendToUser(
                data.to,
                "call_ended",
                {
                    from:
                        socket.userId
                }
            );
        }
    );

    socket.on(
        "reject_call",
        (data) => {

            if (!data?.to) return;

            sendToUser(
                data.to,
                "call_rejected",
                {
                    from:
                        socket.userId
                }
            );
        }
    );

    // --------------------------------------------------------
    // DISCONNECT
    // --------------------------------------------------------

    socket.on(
        "disconnect",
        () => {

            if (!socket.userId) {
                return;
            }

            const offline =
                removeUser(
                    socket.userId,
                    socket.id
                );

            if (offline) {

                io.emit(
                    "user_status",
                    {
                        userId:
                            socket.userId,
                        status:
                            "offline"
                    }
                );
            }

            console.log(
                "🔌 Socket disconnected:",
                socket.id
            );
        }
    );
});

// ============================================================
// 404
// ============================================================

app.use(
    (req, res) => {

        res.status(404).json({
            success: false,
            message:
                "Route not found"
        });

    }
);

// ============================================================
// ERROR HANDLER
// ============================================================

app.use(
    (
        error,
        req,
        res,
        next
    ) => {

        console.error(
            error
        );

        res.status(
            error.status || 500
        ).json({
            success: false,
            message:
                process.env.NODE_ENV ===
                "production"
                    ? "Internal server error"
                    : error.message
        });
    }
);

// ============================================================
// START
// ============================================================

server.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log(`
🩸 ========================================
           BLOOD SOCIAL SERVER
============================================

🚀 Port: ${PORT}
🔌 Socket.IO: ENABLED
📞 WebRTC: ENABLED
🗄️ MongoDB: ENABLED
🔐 Authentication: ENABLED
👑 Admin System: ENABLED
📝 Posts: ENABLED
💬 Messaging: ENABLED
🔔 Notifications: ENABLED
🛡️ Security: ENABLED

============================================
       BLOOD SOCIAL IS RUNNING 🩸
============================================
        `);

    }
);