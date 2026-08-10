const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// HTML फ़ाइलें सर्व करने के लिए
app.use(express.static(__dirname));

let chatHistory = [];
let connectedUsersCount = 0;

io.on('connection', (socket) => {
    connectedUsersCount++;

    // ऑनलाइन/वेटिंग स्टेटस हैंडलर
    if (connectedUsersCount >= 2) {
        io.emit('chat_start'); // दोनों ऑनलाइन हैं
    } else {
        socket.emit('waiting'); // अकेला यूज़र है
    }

    // चैट हिस्ट्री भेजना
    socket.emit('load_history', chatHistory);

    // हेडर नाम/टाइटल बदलना
    socket.on('change_title', (newTitle) => {
        io.emit('title_updated', newTitle);
    });

    // टाइपिंग इंडिकेटर इवेंट्स
    socket.on('typing', () => {
        socket.broadcast.emit('display_typing');
    });

    socket.on('stop_typing', () => {
        socket.broadcast.emit('hide_typing');
    });

    // मैसेज भेजना
    socket.on('send_message', (data) => {
        chatHistory.push(data);
        socket.broadcast.emit('receive_message', data);
    });

    // इमेज भेजना
    socket.on('send_image', (data) => {
        chatHistory.push(data);
        socket.broadcast.emit('receive_image', data);
    });

    // ऑडियो भेजना
    socket.on('send_audio', (data) => {
        chatHistory.push(data);
        socket.broadcast.emit('receive_audio', data);
    });

    // रिएक्शन हैंडलर
    socket.on('send_reaction', (data) => {
        const msg = chatHistory.find(m => m.id === data.msgId);
        if (msg) msg.reaction = data.emoji;
        socket.broadcast.emit('receive_reaction', data);
    });

    // मैसेज डिलीट करना (Everyone)
    socket.on('delete_message_everyone', (data) => {
        const msg = chatHistory.find(m => m.id === data.msgId);
        if (msg) msg.deleted = true;
        io.emit('message_deleted_everyone', data);
    });

    // मैसेज डिलीट करना (Delete for me)
    socket.on('delete_message_for_me', (data) => {
        const msg = chatHistory.find(m => m.id === data.msgId);
        if (msg) {
            if (!msg.deletedFor) msg.deletedFor = [];
            msg.deletedFor.push(data.userId);
        }
    });

    // क्लियर चैट (Clear Chat for me)
    socket.on('clear_chat_for_me', (data) => {
        chatHistory.forEach(msg => {
            if (!msg.deletedFor) msg.deletedFor = [];
            if (!msg.deletedFor.includes(data.userId)) {
                msg.deletedFor.push(data.userId);
            }
        });
    });

    // यूज़र का डिस्कनेक्ट होना (Offline Status)
    socket.on('disconnect', () => {
        connectedUsersCount--;
        if (connectedUsersCount < 2) {
            io.emit('user_left'); // सामने वाले को Offline दिखाएगा
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
