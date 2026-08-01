const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

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

        io.to(roomId).emit('chat_start', 'Connected with a stranger!');
        waitingUser = null;
    } else {
        waitingUser = socket;
        socket.emit('waiting', 'Waiting for someone to join...');
    }

    socket.on('send_message', (msg) => {
        if (socket.roomId) {
            socket.to(socket.roomId).emit('receive_message', msg);
        }
    });

    socket.on('disconnect', () => {
        if (waitingUser === socket) waitingUser = null;
        if (socket.roomId) {
            socket.to(socket.roomId).emit('user_left', 'Stranger left the chat.');
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
