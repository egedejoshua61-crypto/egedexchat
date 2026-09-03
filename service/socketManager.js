module.exports = (io) => {
    io.on('connection', (socket) => {
        socket.on('join-room', (userId) => {
            socket.join(userId);
            io.emit('user-online', userId);
        });

        // Private Messaging
        socket.on('send-message', (data) => {
            // data: { receiverId, message, senderId, type }
            io.to(data.receiverId).emit('new-message', data);
        });

        // WebRTC Signaling for Audio/Video Calls
        socket.on('call-user', (data) => {
            io.to(data.userToCall).emit('incoming-call', {
                signal: data.signalData,
                from: data.from,
                name: data.name,
                type: data.type // 'audio' or 'video'
            });
        });

        socket.on('answer-call', (data) => {
            io.to(data.to).emit('call-accepted', data.signal);
        });

        socket.on('disconnect', () => {
            // Handle offline status
        });
    });
};