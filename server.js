const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    maxHttpBufferSize: 15e6 // 15MB size limit
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

let waitingUser = null;
let pendingMessages = []; // स्टोर करने के लिए मेमोरी

io.on('connection', (socket) => {
    if (waitingUser) {
        const roomId = `room_${waitingUser.id}_${socket.id}`;
        socket.join(roomId);
        waitingUser.join(roomId);

        socket.roomId = roomId;
        waitingUser.roomId = roomId;

        io.to(roomId).emit('chat_start', '2nd person is Online!');

        // अगर पहले से कोई पेंडिंग मैसेज थे, तो नए बंदे को भेज दो
        if (pendingMessages.length > 0) {
            pendingMessages.forEach(msgData => {
                socket.emit(msgData.event, msgData.data);
            });
            pendingMessages = []; // मैसेज डिलीवर होने के बाद खाली कर दो
        }

        waitingUser = null;
    } else {
        waitingUser = socket;
        pendingMessages = []; // नए वेटिंग यूज़र के लिए लिस्ट रीसेट
        socket.emit('waiting', 'Waiting for 2nd person to get Online...');
    }

    // Text Message
    socket.on('send_message', (msg) => {
        if (socket.roomId) {
            socket.to(socket.roomId).emit('receive_message', msg);
        } else if (socket === waitingUser) {
            pendingMessages.push({ event: 'receive_message', data: msg });
        }
    });

    // Image Message
    socket.on('send_image', (imageData) => {
        if (socket.roomId) {
            socket.to(socket.roomId).emit('receive_image', imageData);
        } else if (socket === waitingUser) {
            pendingMessages.push({ event: 'receive_image', data: imageData });
        }
    });

    // Audio Message
    socket.on('send_audio', (audioData) => {
        if (socket.roomId) {
            socket.to(socket.roomId).emit('receive_audio', audioData);
        } else if (socket === waitingUser) {
            pendingMessages.push({ event: 'receive_audio', data: audioData });
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
