const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Bina public folder ke index.html aur doosri files load karne ke liye
app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

let chatHistory = [];
let connectedUsers = 0;
let roomTitle = "Friends 😇😊";

io.on('connection', (socket) => {
    connectedUsers++;
    
    socket.emit('title_updated', roomTitle);
    socket.emit('load_history', chatHistory);

    if (connectedUsers >= 2) {
        io.emit('chat_start');
    } else {
        socket.emit('waiting⏳ for 2nd friend');
    }

    socket.on('change_title', (newTitle) => {
        roomTitle = newTitle;
        io.emit('title_updated', roomTitle);
    });

    socket.on('send_message', (data) => {
        chatHistory.push(data);
        socket.broadcast.emit('receive_message', data);
    });

    socket.on('send_image', (data) => {
        chatHistory.push(data);
        socket.broadcast.emit('receive_image', data);
    });

    socket.on('send_audio', (data) => {
        chatHistory.push(data);
        socket.broadcast.emit('receive_audio', data);
    });

    socket.on('typing', () => {
        socket.broadcast.emit('display_typing');
    });

    socket.on('stop_typing', () => {
        socket.broadcast.emit('hide_typing');
    });

    socket.on('disconnect', () => {
        connectedUsers--;
        io.emit('user_left');
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
