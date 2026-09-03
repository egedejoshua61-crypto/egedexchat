

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

// ============================================================
// APP CONFIGURATION
// ============================================================

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 5000;

const FRONTEND_URL =
    process.env.FRONTEND_URL || "*";

const ADMIN_EMAIL =
    process.env.ADMIN_EMAIL ||
    "egedejoshua61@gmail.com";

// Never hard-code a real password here.
const ADMIN_PASSWORD =
    process.env.ADMIN_PASSWORD || "";

// ============================================================
// SOCKET.IO
// ============================================================

const io = new Server(server, {
    cors: {
        origin: FRONTEND_URL,
        methods: [
            "GET",
            "POST",
            "PUT",
            "DELETE"
        ],
        credentials: true
    },

    transports: [
        "websocket",
        "polling"
    ]
});

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

// ============================================================
// BODY PARSERS
// ============================================================

app.use(
    express.json({
        limit: "10mb"
    })
);

app.use(
    express.urlencoded({
        extended: true,
        limit: "10mb"
    })
);

// ============================================================
// RATE LIMIT
// ============================================================

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,

    standardHeaders: true,
    legacyHeaders: false,

    message: {
        success: false,
        message:
            "Too many requests. Please try again later."
    }
});

app.use(
    "/api/",
    apiLimiter
);

// ============================================================
// UPLOADS
// ============================================================

const uploadsPath =
    path.join(__dirname, "uploads");

if (!fs.existsSync(uploadsPath)) {
    fs.mkdirSync(
        uploadsPath,
        {
            recursive: true
        }
    );
}

app.use(
    "/uploads",
    express.static(uploadsPath)
);

// ============================================================
// FRONTEND
// ============================================================

const frontendPath =
    path.join(
        __dirname,
        "../frontend"
    );

if (fs.existsSync(frontendPath)) {
    app.use(
        express.static(frontendPath)
    );
}

// ============================================================
// DATABASE
// ============================================================

if (!process.env.DATABASE_URL) {

    console.error(
        "❌ DATABASE_URL is missing."
    );

} else {

    mongoose
        .connect(
            process.env.DATABASE_URL
        )

        .then(() => {

            console.log(
                "✅ BLOOD SOCIAL Database Connected"
            );

        })

        .catch((error) => {

            console.error(
                "❌ MongoDB connection error:",
                error.message
            );

        });
}

// ============================================================
// DATABASE EVENTS
// ============================================================

mongoose.connection.on(
    "connected",
    () => {

        console.log(
            "🗄️ MongoDB connected"
        );

    }
);

mongoose.connection.on(
    "error",
    (error) => {

        console.error(
            "❌ MongoDB error:",
            error.message
        );

    }
);

mongoose.connection.on(
    "disconnected",
    () => {

        console.log(
            "⚠️ MongoDB disconnected"
        );

    }
);

// ============================================================
// ONLINE USERS
// ============================================================

// userId -> Set of socket IDs

const onlineUsers =
    new Map();

// ============================================================
// ONLINE USER FUNCTIONS
// ============================================================

function addOnlineUser(
    userId,
    socketId
) {

    if (
        !onlineUsers.has(userId)
    ) {

        onlineUsers.set(
            userId,
            new Set()
        );

    }

    onlineUsers
        .get(userId)
        .add(socketId);
}

function removeOnlineUser(
    userId,
    socketId
) {

    if (
        !onlineUsers.has(userId)
    ) {

        return false;

    }

    const sockets =
        onlineUsers.get(userId);

    sockets.delete(socketId);

    if (
        sockets.size === 0
    ) {

        onlineUsers.delete(
            userId
        );

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
        onlineUsers.get(userId);

    if (!sockets) {
        return;
    }

    for (
        const socketId
        of sockets
    ) {

        io.to(socketId)
            .emit(
                event,
                data
            );

    }
}

// ============================================================
// SOCKET.IO
// ============================================================

io.on(
    "connection",
    (socket) => {

        console.log(
            "🔌 User connected:",
            socket.id
        );

        // ====================================================
        // JOIN
        // ====================================================

        socket.on(
            "join",
            (userId) => {

                if (!userId) {
                    return;
                }

                userId =
                    String(userId);

                socket.userId =
                    userId;

                socket.join(
                    userId
                );

                addOnlineUser(
                    userId,
                    socket.id
                );

                io.emit(
                    "user_status",
                    {
                        userId,
                        status:
                            "online"
                    }
                );

                socket.emit(
                    "joined",
                    {
                        success: true,
                        userId
                    }
                );

                console.log(
                    `🟢 User ${userId} online`
                );
            }
        );

        // ====================================================
        // PRIVATE MESSAGE
        // ====================================================

        socket.on(
            "private_message",
            (data) => {

                if (!data) {
                    return;
                }

                const {
                    senderId,
                    receiverId,
                    message,
                    type,
                    timestamp
                } = data;

                if (
                    !senderId ||
                    !receiverId
                ) {
                    return;
                }

                const messageData = {

                    senderId,

                    receiverId,

                    message:
                        message || "",

                    type:
                        type || "text",

                    timestamp:
                        timestamp ||
                        new Date()
                            .toISOString()
                };

                sendToUser(
                    receiverId,
                    "new_message",
                    messageData
                );

                socket.emit(
                    "message_sent",
                    messageData
                );
            }
        );

        // ====================================================
        // TYPING
        // ====================================================

        socket.on(
            "typing",
            (data) => {

                if (!data) {
                    return;
                }

                const {
                    senderId,
                    receiverId
                } = data;

                if (
                    !senderId ||
                    !receiverId
                ) {
                    return;
                }

                sendToUser(
                    receiverId,
                    "user_typing",
                    {
                        userId:
                            senderId
                    }
                );
            }
        );

        // ====================================================
        // STOP TYPING
        // ====================================================

        socket.on(
            "stop_typing",
            (data) => {

                if (!data) {
                    return;
                }

                const {
                    senderId,
                    receiverId
                } = data;

                if (
                    !senderId ||
                    !receiverId
                ) {
                    return;
                }

                sendToUser(
                    receiverId,
                    "user_stopped_typing",
                    {
                        userId:
                            senderId
                    }
                );
            }
        );

        // ====================================================
        // AUDIO / VIDEO CALL
        // ====================================================

        socket.on(
            "call_request",
            (data) => {

                if (!data) {
                    return;
                }

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
                ) {
                    return;
                }

                sendToUser(
                    receiverId,
                    "incoming_call",
                    {
                        signal,

                        from:
                            senderId,

                        callerName:
                            callerName ||
                            "BLOOD SOCIAL User",

                        type:
                            type ===
                            "video"
                                ? "video"
                                : "audio"
                    }
                );
            }
        );

        // ====================================================
        // ANSWER CALL
        // ====================================================

        socket.on(
            "answer_call",
            (data) => {

                if (!data) {
                    return;
                }

                const {
                    to,
                    signal
                } = data;

                if (!to) {
                    return;
                }

                sendToUser(
                    to,
                    "call_accepted",
                    signal
                );
            }
        );

        // ====================================================
        // ICE CANDIDATE
        // ====================================================

        socket.on(
            "ice_candidate",
            (data) => {

                if (!data) {
                    return;
                }

                const {
                    to,
                    candidate
                } = data;

                if (!to) {
                    return;
                }

                sendToUser(
                    to,
                    "ice_candidate",
                    candidate
                );
            }
        );

        // ====================================================
        // END CALL
        // ====================================================

        socket.on(
            "end_call",
            (data) => {

                if (!data) {
                    return;
                }

                const {
                    to
                } = data;

                if (!to) {
                    return;
                }

                sendToUser(
                    to,
                    "call_ended",
                    {
                        from:
                            socket.userId ||
                            null
                    }
                );
            }
        );

        // ====================================================
        // REJECT CALL
        // ====================================================

        socket.on(
            "reject_call",
            (data) => {

                if (!data) {
                    return;
                }

                const {
                    to
                } = data;

                if (!to) {
                    return;
                }

                sendToUser(
                    to,
                    "call_rejected",
                    {
                        from:
                            socket.userId ||
                            null
                    }
                );
            }
        );

        // ====================================================
        // NOTIFICATION
        // ====================================================

        socket.on(
            "send_notification",
            (data) => {

                if (!data) {
                    return;
                }

                const {
                    receiverId,
                    notification
                } = data;

                if (!receiverId) {
                    return;
                }

                sendToUser(
                    receiverId,
                    "notification",
                    notification
                );
            }
        );

        // ====================================================
        // DISCONNECT
        // ====================================================

        socket.on(
            "disconnect",
            () => {

                const userId =
                    socket.userId;

                if (userId) {

                    const becameOffline =
                        removeOnlineUser(
                            userId,
                            socket.id
                        );

                    if (
                        becameOffline
                    ) {

                        io.emit(
                            "user_status",
                            {
                                userId,
                                status:
                                    "offline"
                            }
                        );

                        console.log(
                            `🔴 User ${userId} offline`
                        );
                    }
                }

                console.log(
                    "🔌 Socket disconnected:",
                    socket.id
                );
            }
        );
    }
);

// ============================================================
// HEALTH CHECK
// ============================================================

app.get(
    "/api/health",
    (req, res) => {

        res.json({

            success: true,

            application:
                "BLOOD SOCIAL",

            status:
                "online",

            database:
                mongoose.connection
                    .readyState === 1
                    ? "connected"
                    : "disconnected",

            socketIO:
                "enabled",

            webRTC:
                "enabled",

            timestamp:
                new Date()
                    .toISOString()

        });

    }
);

// ============================================================
// API HOME
// ============================================================

app.get(
    "/api",
    (req, res) => {

        res.json({

            success: true,

            name:
                "BLOOD SOCIAL",

            version:
                "1.0.0",

            message:
                "BLOOD SOCIAL API is running.",

            adminEmail:
                ADMIN_EMAIL,

            endpoints: {

                health:
                    "/api/health",

                auth:
                    "/api/auth",

                users:
                    "/api/users",

                chat:
                    "/api/chat",

                posts:
                    "/api/posts",

                notifications:
                    "/api/notifications",

                payments:
                    "/api/payments",

                admin:
                    "/api/admin"

            }

        });

    }
);

// ============================================================
// ROUTES
// ============================================================

const routes = [

    {
        path:
            "/api/auth",

        file:
            "./routes/auth"
    },

    {
        path:
            "/api/users",

        file:
            "./routes/users"
    },

    {
        path:
            "/api/chat",

        file:
            "./routes/chat"
    },

    {
        path:
            "/api/posts",

        file:
            "./routes/posts"
    },

    {
        path:
            "/api/notifications",

        file:
            "./routes/notifications"
    },

    {
        path:
            "/api/payments",

        file:
            "./routes/payments"
    },

    {
        path:
            "/api/admin",

        file:
            "./routes/admin"
    }

];

for (
    const route
    of routes
) {

    try {

        const router =
            require(route.file);

        app.use(
            route.path,
            router
        );

        console.log(
            `✅ Loaded ${route.path}`
        );

    } catch (error) {

        console.log(
            `ℹ️ ${route.path} not loaded yet`
        );

    }
}

// ============================================================
// 404
// ============================================================

app.use(
    (req, res) => {

        res.status(404)
            .json({

                success: false,

                message:
                    "Endpoint not found",

                path:
                    req.originalUrl

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
            "❌ Server Error:",
            error
        );

        res.status(
            error.statusCode || 500
        )
        .json({

            success: false,

            message:
                process.env.NODE_ENV ===
                "production"

                    ? "Internal server error"

                    : error.message

        });

    }
);

// ==============