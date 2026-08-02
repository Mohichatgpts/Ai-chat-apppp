const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Ping और Timeout सेटिंग्स जिससे कनेक्शन बना रहे
const io = new Server(server, {
    maxHttpBufferSize: 50e6,
    pingInterval: 5000,  // हर 5 सेकंड में चेक करेगा
    pingTimeout: 10000   // 10 सेकंड तक रिस्पॉन्स न मिलने पर ही ऑफलाइन मानेगा
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

let activeUsers = []; 
let pendingMessages = [];

io.on('connection', (socket) => {
    // एक्टिव यूज़र्स में जोड़ें (Duplicates से बचें)
    if (!activeUsers.some(u => u.id === socket.id)) {
        activeUsers.push(socket);
    }

    if (activeUsers.length >= 2) {
        const user1 = activeUsers[0];
        const user2 = activeUsers[1];

        const roomId = `room_${user1.id}_${user2.id}`;
        
        user1.join(roomId);
        user2.join(roomId);

        user1.roomId = roomId;
        user2.roomId = roomId;

        io.to(roomId).emit('chat_start', '2nd person is Online!');

        if (pendingMessages.length > 0) {
            pendingMessages.forEach(msgData => {
                io.to(roomId).emit(msgData.event, msgData.data);
            });
            pendingMessages = [];
        }
    } else {
        socket.emit('waiting', 'Waiting for 2nd person to get Online...');
    }

    socket.on('send_message', (data) => {
        if (socket.roomId) {
            socket.to(socket.roomId).emit('receive_message', data);
        } else {
            pendingMessages.push({ event: 'receive_message', data: data });
        }
    });

    socket.on('send_image', (data) => {
        if (socket.roomId) {
            socket.to(socket.roomId).emit('receive_image', data);
        } else {
            pendingMessages.push({ event: 'receive_image', data: data });
        }
    });

    socket.on('send_audio', (data) => {
        if (socket.roomId) {
            socket.to(socket.roomId).emit('receive_audio', data);
        } else {
            pendingMessages.push({ event: 'receive_audio', data: data });
        }
    });

    socket.on('delete_for_everyone', (msgId) => {
        if (socket.roomId) {
            socket.to(socket.roomId).emit('message_deleted', msgId);
        }
        pendingMessages = pendingMessages.filter(m => m.data.id !== msgId);
    });

    socket.on('typing', () => {
        if (socket.roomId) socket.to(socket.roomId).emit('display_typing');
    });

    socket.on('stop_typing', () => {
        if (socket.roomId) socket.to(socket.roomId).emit('hide_typing');
    });

    socket.on('disconnect', () => {
        activeUsers = activeUsers.filter(u => u.id !== socket.id);

        if (socket.roomId) {
            socket.to(socket.roomId).emit('user_left', '2nd person went Offline.');
            
            const clients = io.sockets.adapter.rooms.get(socket.roomId);
            if (clients) {
                for (const clientId of clients) {
                    const remainingSocket = io.sockets.sockets.get(clientId);
                    if (remainingSocket) {
                        remainingSocket.leave(socket.roomId);
                        delete remainingSocket.roomId;
                    }
                }
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
