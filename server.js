const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    maxHttpBufferSize: 15e6 // 15MB size limit for large images & voice notes
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

let waitingUser = null;

io.on('connection', (socket) => {
    if (waitingUser) {
        const roomId = `room_${waitingUser.id}_${socket.id}`;
        socket.join(roomId);
        waitingUser.join(roomId);

        socket.roomId = roomId;
        waitingUser.roomId = roomId;

        io.to(roomId).emit('chat_start', '2nd person is Online!');
        waitingUser = null;
    } else {
        waitingUser = socket;
        socket.emit('waiting', 'Waiting for 2nd person to get Online...');
    }

    // Text Message
    socket.on('send_message', (msg) => {
        if (socket.roomId) {
            socket.to(socket.roomId).emit('receive_message', msg);
        }
    });

    // Image Message
    socket.on('send_image', (imageData) => {
        if (socket.roomId) {
            socket.to(socket.roomId).emit('receive_image', imageData);
        }
    });

    // Audio Message
    socket.on('send_audio', (audioData) => {
        if (socket.roomId) {
            socket.to(socket.roomId).emit('receive_audio', audioData);
        }
    });

    // Typing Events
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
        if (waitingUser === socket) waitingUser = null;
        if (socket.roomId) {
            socket.to(socket.roomId).emit('user_left', '2nd person went Offline.');
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
