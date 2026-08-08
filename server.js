const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

app.use(express.static(path.join(__dirname)));

let chatHistory = [];
let roomTitle = "Friends😇🙂";

io.on('connection', (socket) => {
    socket.emit('title_updated', roomTitle);
    socket.emit('load_history', chatHistory);
    socket.broadcast.emit('chat_start');

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

    // REAL-TIME REACTION SYNC
    socket.on('send_reaction', (data) => {
        socket.broadcast.emit('receive_reaction', data);
    });

    socket.on('disconnect', () => {
        socket.broadcast.emit('user_left');
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
