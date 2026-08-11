const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname));

const DATA_FILE = path.join(__dirname, 'messages.json');
let chatHistory = [];

// 1. सर्वर शुरू होते ही पुरानी चैट फ़ाइल से लोड करना
if (fs.existsSync(DATA_FILE)) {
    try {
        const fileData = fs.readFileSync(DATA_FILE, 'utf8');
        chatHistory = JSON.parse(fileData);
        console.log('✅ पुरानी चैट सफलतापूर्वक लोड हो गई!');
    } catch (err) {
        console.error('⚠️ फ़ाइल पढ़ने में त्रुटि:', err);
        chatHistory = [];
    }
}

// 2. हर नए मैसेज पर चैट को हार्ड डिस्क में सेव करने का फ़ंक्शन
function saveHistoryToFile() {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(chatHistory, null, 2), 'utf8');
    } catch (err) {
        console.error('⚠️ चैट सेव करने में त्रुटि:', err);
    }
}

let connectedUsersCount = 0;

io.on('connection', (socket) => {
    connectedUsersCount++;

    // ऑनलाइन/वेटिंग स्टेटस
    if (connectedUsersCount >= 2) {
        io.emit('chat_start');
    } else {
        socket.emit('waiting');
    }

    // यूज़र के आते ही उसे पूरी चैट हिस्ट्री भेजना (चाहे वो देर से ऑनलाइन आया हो)
    socket.emit('load_history', chatHistory);

    // हेडर टाइटल
    socket.on('change_title', (newTitle) => {
        io.emit('title_updated', newTitle);
    });

    // टाइपिंग इंडिकेटर
    socket.on('typing', () => socket.broadcast.emit('display_typing'));
    socket.on('stop_typing', () => socket.broadcast.emit('hide_typing'));

    // 📩 मैसेज भेजना + permanent save
    socket.on('send_message', (data) => {
        chatHistory.push(data);
        saveHistoryToFile(); // Disk पर सेव हुआ
        socket.broadcast.emit('receive_message', data);
    });

    // 📷 इमेज भेजना + permanent save
    socket.on('send_image', (data) => {
        chatHistory.push(data);
        saveHistoryToFile();
        socket.broadcast.emit('receive_image', data);
    });

    // 🎙️ ऑडियो भेजना + permanent save
    socket.on('send_audio', (data) => {
        chatHistory.push(data);
        saveHistoryToFile();
        socket.broadcast.emit('receive_audio', data);
    });

    // रिएक्शन
    socket.on('send_reaction', (data) => {
        const msg = chatHistory.find(m => m.id === data.msgId);
        if (msg) {
            msg.reaction = data.emoji;
            saveHistoryToFile();
        }
        socket.broadcast.emit('receive_reaction', data);
    });

    // Delete for Everyone
    socket.on('delete_message_everyone', (data) => {
        const msg = chatHistory.find(m => m.id === data.msgId);
        if (msg) {
            msg.deleted = true;
            saveHistoryToFile();
        }
        io.emit('message_deleted_everyone', data);
    });

    // Delete for Me
    socket.on('delete_message_for_me', (data) => {
        const msg = chatHistory.find(m => m.id === data.msgId);
        if (msg) {
            if (!msg.deletedFor) msg.deletedFor = [];
            if (!msg.deletedFor.includes(data.userId)) {
                msg.deletedFor.push(data.userId);
                saveHistoryToFile();
            }
        }
    });

    // Clear Chat
    socket.on('clear_chat_for_me', (data) => {
        chatHistory.forEach(msg => {
            if (!msg.deletedFor) msg.deletedFor = [];
            if (!msg.deletedFor.includes(data.userId)) {
                msg.deletedFor.push(data.userId);
            }
        });
        saveHistoryToFile();
    });

    socket.on('disconnect', () => {
        connectedUsersCount--;
        if (connectedUsersCount < 2) {
            io.emit('user_left');
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});
