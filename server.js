const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    maxHttpBufferSize: 50e6,
    pingInterval: 5000,
    pingTimeout: 10000
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

let activeUsers = []; 
let chatHistory = []; 
let currentTitle = "Mohit the secret animator boy"; // डिफ़ॉल्ट नाम

io.on('connection', (socket) => {
    if (!activeUsers.some(u => u.id === socket.id)) {
        activeUsers.push(socket);
    }

    // यूजर को हिस्ट्री और करंट टाइटल भेजना
    socket.emit('load_history', chatHistory);
    socket.emit('title_updated', currentTitle);

    if (activeUsers.length >= 2) {
        const user1 = activeUsers[0];
        const user2 = activeUsers[1];
        const roomId = `room_${user1.id}_${user2.id}`;
        
        user1.join(roomId);
        user2.join(roomId);
        user1.roomId = roomId;
        user2.roomId = roomId;

        io.to(roomId).emit('chat_start', 'Online');
    } else {
        socket.emit('waiting', 'Waiting for someone to get online...');
    }

    // नाम अपडेट करने का इवेंट
    socket.on('change_title', (newTitle) => {
        currentTitle = newTitle || "Secret Chat";
        io.emit('title_updated', currentTitle);
    });

    function saveAndBroadcast(msgData, eventName) {
        chatHistory.push({ ...msgData, event: eventName });
        if (socket.roomId) {
            socket.to(socket.roomId).emit(eventName, msgData);
        }
    }

    socket.on('send_message', (data) => saveAndBroadcast(data, 'receive_message'));
    socket.on('send_image', (data) => saveAndBroadcast(data, 'receive_image'));
    socket.on('send_audio', (data) => saveAndBroadcast(data, 'receive_audio'));

    socket.on('delete_for_everyone', (msgId) => {
        chatHistory = chatHistory.filter(m => m.id !== msgId);
        io.emit('message_deleted', msgId);
    });

    socket.on('clear_all_chat', () => {
        chatHistory = [];
        io.emit('chat_cleared');
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
            socket.to(socket.roomId).emit('user_left', 'Offline');
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
