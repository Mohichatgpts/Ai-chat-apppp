const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Static files (HTML, CSS, JS) serve करने के लिए
app.use(express.static(path.join(__dirname, 'public')));

// चैट की हिस्ट्री स्टोर करने के लिए ऐरे (Array)
let chatHistory = [];
let connectedUsers = 0;
let roomTitle = "Mohit the secret animator boy";

io.on('connection', (socket) => {
    connectedUsers++;
    
    // नए यूजर के जुड़ने पर पुरानी हिस्ट्री और टाइटल भेजें
    socket.emit('title_updated', roomTitle);
    socket.emit('load_history', chatHistory);

    if (connectedUsers >= 2) {
        io.emit('chat_start');
    } else {
        socket.emit('waiting');
    }

    // 1. नाम/टाइटल बदलना
    socket.on('change_title', (newTitle) => {
        roomTitle = newTitle;
        io.emit('title_updated', roomTitle);
    });

    // 2. टेक्स्ट मैसेज भेजना
    socket.on('send_message', (data) => {
        chatHistory.push(data); // सर्वर पर सेव रहेगा
        socket.broadcast.emit('receive_message', data); // केवल दूसरे यूजर को भेजें
    });

    // 3. फोटो भेजना
    socket.on('send_image', (data) => {
        chatHistory.push(data);
        socket.broadcast.emit('receive_image', data);
    });

    // 4. वॉइस ऑडियो भेजना
    socket.on('send_audio', (data) => {
        chatHistory.push(data);
        socket.broadcast.emit('receive_audio', data);
    });

    // 5. टाइपिंग इंडिकेटर
    socket.on('typing', () => {
        socket.broadcast.emit('display_typing');
    });

    socket.on('stop_typing', () => {
        socket.broadcast.emit('hide_typing');
    });

    // डिसकनेक्ट होने पर
    socket.on('disconnect', () => {
        connectedUsers--;
        io.emit('user_left');
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
