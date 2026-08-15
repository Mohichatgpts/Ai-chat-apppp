const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" },
    pingTimeout: 60000, // मोबाइल नेटवर्क में डिस्कनेक्ट होने से बचाएगा
    pingInterval: 25000
});

app.use(express.static(__dirname));

const DATA_FILE = path.join(__dirname, 'messages.json');
let chatRoomsData = {};

// 1. पुरानी चैट लोड करना
function loadData() {
    if (fs.existsSync(DATA_FILE)) {
        try {
            const raw = fs.readFileSync(DATA_FILE, 'utf8');
            chatRoomsData = JSON.parse(raw);
            console.log('✅ डेटा सफलतापूर्वक लोड हो गया');
        } catch (e) {
            console.error('⚠️ डेटा फ़ाइल पढ़ने में त्रुटि:', e);
            chatRoomsData = {};
        }
    }
}
loadData();

// 2. चैट फ़ाइल में लिखना
function saveData() {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(chatRoomsData, null, 2), 'utf8');
    } catch (e) {
        console.error('⚠️ फ़ाइल सेव करने में त्रुटि:', e);
    }
}

// रूम में यूज़र्स और उनके डिस्कनेक्ट टाइमर का ट्रैक
const roomUsers = {};
const disconnectTimers = {};

io.on('connection', (socket) => {
    let currentRoom = null;
    let currentUserId = null;

    socket.on('join_room', ({ roomId, userId }) => {
        currentRoom = roomId || 'default_room';
        currentUserId = userId;

        socket.join(currentRoom);

        // डिस्कनेक्ट टाइमर रद्द करें (अगर बंदा 3 सेकंड के अंदर वापस आ गया)
        if (disconnectTimers[currentUserId]) {
            clearTimeout(disconnectTimers[currentUserId]);
            delete disconnectTimers[currentUserId];
        }

        if (!chatRoomsData[currentRoom]) {
            chatRoomsData[currentRoom] = { history: [], title: '🙂' };
        }
        if (!roomUsers[currentRoom]) {
            roomUsers[currentRoom] = new Set();
        }

        roomUsers[currentRoom].add(currentUserId);

        // हिस्ट्री और हेडर भेजें
        socket.emit('load_history', chatRoomsData[currentRoom].history || []);
        socket.emit('title_updated', chatRoomsData[currentRoom].title || '🙂');

        // ऑनलाइन स्टेटस ब्रॉडकास्ट करें
        if (roomUsers[currentRoom].size >= 2) {
            io.to(currentRoom).emit('status_change', 'online');
        } else {
            socket.emit('status_change', 'offline');
        }
    });

    socket.on('change_title', (newTitle) => {
        if (!currentRoom) return;
        chatRoomsData[currentRoom].title = newTitle;
        saveData();
        io.to(currentRoom).emit('title_updated', newTitle);
    });

    socket.on('typing', () => {
        if (currentRoom) socket.to(currentRoom).emit('display_typing');
    });

    socket.on('stop_typing', () => {
        if (currentRoom) socket.to(currentRoom).emit('hide_typing');
    });

    // 📩 टेक्स्ट मैसेज
    socket.on('send_message', (data) => {
        if (!currentRoom) return;
        chatRoomsData[currentRoom].history.push(data);
        saveData();
        socket.to(currentRoom).emit('receive_message', data);
    });

    // 📷 इमेज
    socket.on('send_image', (data) => {
        if (!currentRoom) return;
        chatRoomsData[currentRoom].history.push(data);
        saveData();
        socket.to(currentRoom).emit('receive_image', data);
    });

    // 🎙️ ऑडियो
    socket.on('send_audio', (data) => {
        if (!currentRoom) return;
        chatRoomsData[currentRoom].history.push(data);
        saveData();
        socket.to(currentRoom).emit('receive_audio', data);
    });

    // रिएक्शन
    socket.on('send_reaction', (data) => {
        if (!currentRoom) return;
        const msg = chatRoomsData[currentRoom].history.find(m => m.id === data.msgId);
        if (msg) {
            msg.reaction = data.emoji;
            saveData();
        }
        socket.to(currentRoom).emit('receive_reaction', data);
    });

    // Delete Everyone
    socket.on('delete_message_everyone', (data) => {
        if (!currentRoom) return;
        const msg = chatRoomsData[currentRoom].history.find(m => m.id === data.msgId);
        if (msg) {
            msg.deleted = true;
            saveData();
        }
        io.to(currentRoom).emit('message_deleted_everyone', data);
    });

    // Delete For Me
    socket.on('delete_message_for_me', (data) => {
        if (!currentRoom) return;
        const msg = chatRoomsData[currentRoom].history.find(m => m.id === data.msgId);
        if (msg) {
            if (!msg.deletedFor) msg.deletedFor = [];
            if (!msg.deletedFor.includes(data.userId)) {
                msg.deletedFor.push(data.userId);
                saveData();
            }
        }
    });

    // Clear Chat
    socket.on('clear_chat_for_me', (data) => {
        if (!currentRoom) return;
        chatRoomsData[currentRoom].history.forEach(msg => {
            if (!msg.deletedFor) msg.deletedFor = [];
            if (!msg.deletedFor.includes(data.userId)) {
                msg.deletedFor.push(data.userId);
            }
        });
        saveData();
    });

    // 🛑 नेटवर्क फ्लिकर फ्री डिस्कनेक्ट (3 सेकंड का टाइमर)
    socket.on('disconnect', () => {
        if (currentRoom && currentUserId) {
            disconnectTimers[currentUserId] = setTimeout(() => {
                if (roomUsers[currentRoom]) {
                    roomUsers[currentRoom].delete(currentUserId);
                    if (roomUsers[currentRoom].size < 2) {
                        io.to(currentRoom).emit('status_change', 'offline');
                    }
                }
                delete disconnectTimers[currentUserId];
            }, 3000); // 3 सेकंड का ग्रेस टाइम
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});
