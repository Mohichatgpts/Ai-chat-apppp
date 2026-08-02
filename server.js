const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    maxHttpBufferSize: 50e6 // 50MB Limit
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

let waitingUser = null;
let pendingMessages = [];

io.on('connection', (socket) => {
    if (waitingUser && waitingUser.id !== socket.id) {
        const roomId = `room_${waitingUser.id}_${socket.id}`;
        
        socket.join(roomId);
        waitingUser.join(roomId);

        socket.roomId = roomId;
        waitingUser.roomId = roomId;

        io.to(roomId).emit('chat_start', '2nd person is Online!');

        if (pendingMessages.length > 0) {
            pendingMessages.forEach(msgData => {
                socket.emit(msgData.event, msgData.data);
            });
            pendingMessages = [];
        }

        waitingUser = null;
    } else {
        waitingUser = socket;
        pendingMessages = [];
        socket.emit('waiting', 'Waiting for 2nd person to get Online...');
    }

    socket.on('send_message', (data) => {
        if (socket.roomId) {
            socket.to(socket.roomId).emit('receive_message', data);
        } else if (socket === waitingUser) {
            pendingMessages.push({ event: 'receive_message', data: data });
        }
    });

    socket.on('send_image', (data) => {
        if (socket.roomId) {
            socket.to(socket.roomId).emit('receive_image', data);
        } else if (socket === waitingUser) {
            pendingMessages.push({ event: 'receive_image', data: data });
        }
    });

    socket.on('send_audio', (data) => {
        if (socket.roomId) {
            socket.to(socket.roomId).emit('receive_audio', data);
        } else if (socket === waitingUser) {
            pendingMessages.push({ event: 'receive_audio', data: data });
        }
    });

    // Delete for Everyone Event
    socket.on('delete_for_everyone', (msgId) => {
        if (socket.roomId) {
            socket.to(socket.roomId).emit('message_deleted', msgId);
        }
        // Remove from pending if present
        pendingMessages = pendingMessages.filter(m => m.data.id !== msgId);
    });

    socket.on('typing', () => {
        if (socket.roomId) {
            socket.to(socket.roomId).emit('display_typing');
        }
    });

    socket.on('stop_typing', () => {
        if (socket.roomId) {
            socket.to(socket.roomId).emit('hide_typing');
        }
    });

    socket.on('disconnect', () => {
        if (waitingUser === socket) {
            waitingUser = null;
            pendingMessages = [];
        }
        if (socket.roomId) {
            socket.to(socket.roomId).emit('user_left', '2nd person went Offline.');
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
