const express = require('express');
const app = express();
const http = require('http').createServer(app);
const fs = require('fs');
const path = require('path');

// Socket.io limit raised to 100MB for safe file transfers
const io = require('socket.io')(http, {
    maxHttpBufferSize: 1e8
});

app.use(express.static(path.join(__dirname)));

const DATA_FILE = path.join(__dirname, 'chat_data.json');
let chatHistory = [];
let roomTitle = "🙂";

// 1. सर्वर शुरू होते ही पुरानी सेव्ड चैट फाइल लोड करें
function loadSavedData() {
    if (fs.existsSync(DATA_FILE)) {
        try {
            const rawData = fs.readFileSync(DATA_FILE, 'utf8');
            const parsed = JSON.parse(rawData);
            chatHistory = parsed.chatHistory || [];
            roomTitle = parsed.roomTitle || "🙂";
            console.log(`✅ Loaded ${chatHistory.length} messages from permanent storage.`);
        } catch (err) {
            console.error("Error reading storage file:", err);
        }
    }
}

// 2. हर नए मैसेज या बदलाव पर फाइल में ऑटो-सेव करें
function saveToStorage() {
    try {
        const dataToSave = {
            roomTitle: roomTitle,
            chatHistory: chatHistory
        };
        fs.writeFileSync(DATA_FILE, JSON.stringify(dataToSave, null, 2), 'utf8');
    } catch (err) {
        console.error("Error saving data:", err);
    }
}

loadSavedData();

io.on('connection', (socket) => {
    // यूजर के कनेक्ट होते ही पूरी हिस्ट्री भेजें
    socket.emit('title_updated', roomTitle);
    socket.emit('load_history', chatHistory);
    socket.broadcast.emit('chat_start');

    socket.on('change_title', (newTitle) => {
        roomTitle = newTitle;
        saveToStorage();
        io.emit('title_updated', roomTitle);
    });

    socket.on('send_message', (data) => {
        data.deletedFor = [];
        chatHistory.push(data);
        saveToStorage();
        socket.broadcast.emit('receive_message', data);
    });

    socket.on('send_image', (data) => {
        data.deletedFor = [];
        chatHistory.push(data);
        saveToStorage();
        socket.broadcast.emit('receive_image', data);
    });

    socket.on('send_audio', (data) => {
        data.deletedFor = [];
        chatHistory.push(data);
        saveToStorage();
        socket.broadcast.emit('receive_audio', data);
    });

    socket.on('typing', () => socket.broadcast.emit('display_typing'));
    socket.on('stop_typing', () => socket.broadcast.emit('hide_typing'));

    socket.on('send_reaction', (data) => {
        const msg = chatHistory.find(m => m.id === data.msgId);
        if (msg) {
            msg.reaction = data.emoji;
            saveToStorage();
        }
        socket.broadcast.emit('receive_reaction', data);
    });

    socket.on('delete_message_everyone', (data) => {
        const index = chatHistory.findIndex(m => m.id === data.msgId);
        if (index !== -1) {
            chatHistory[index].deleted = true;
            chatHistory[index].text = "🚫 यह संदेश हटा दिया गया है";
            delete chatHistory[index].image;
            delete chatHistory[index].audio;
            delete chatHistory[index].reaction;
            saveToStorage();
        }
        io.emit('message_deleted_everyone', { msgId: data.msgId });
    });

    socket.on('delete_message_for_me', (data) => {
        const msg = chatHistory.find(m => m.id === data.msgId);
        if (msg) {
            if (!msg.deletedFor) msg.deletedFor = [];
            if (!msg.deletedFor.includes(data.userId)) {
                msg.deletedFor.push(data.userId);
            }
            if (msg.deletedFor.length >= 2) {
                chatHistory = chatHistory.filter(m => m.id !== data.msgId);
            }
            saveToStorage();
        }
    });

    socket.on('clear_chat_for_me', (data) => {
        chatHistory.forEach(msg => {
            if (!msg.deletedFor) msg.deletedFor = [];
            if (!msg.deletedFor.includes(data.userId)) {
                msg.deletedFor.push(data.userId);
            }
        });
        chatHistory = chatHistory.filter(msg => msg.deletedFor.length < 2);
        saveToStorage();
    });

    socket.on('disconnect', () => socket.broadcast.emit('user_left'));
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Server running on port ${PORT}`));
