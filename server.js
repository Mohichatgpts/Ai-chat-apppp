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
let chatRoomsData = {}; // Room wise data store

// 1. सर्वर स्टार्ट होने पर चैट लोड करें
if (fs.existsSync(DATA_FILE)) {
    try {
        const fileData = fs.readFileSync(DATA_FILE, 'utf8');
        chatRoomsData = JSON.parse(fileData);
        console.log('✅ फाइल से डेटा सफलतापूर्वक लोड हो गया!');
    } catch (err) {
        console.error('⚠️ फाइल लोड करने में गड़बड़:', err);
        chatRoomsData = {};
    }
}

// 2. फाइल में चैट सेव करने का फंक्शन
function saveDataToFile() {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(chatRoomsData, null, 2), 'utf8');
    } catch (err) {
        console.error('⚠️ फाइल सेव करने में त्रुटि:', err);
    }
}

// रूम में मौजूद एक्टिव यूज़र्स का ट्रैक रखने के लिए
const roomUsers = {};

io.on('connection', (socket) => {
    let currentRoom = null;
    let currentUserId = null;

    // 🚪 यूज़र का रूम जॉइन करना
    socket.on('join_room', ({ roomId, userId }) => {
        currentRoom = roomId || 'default_room';
        currentUserId = userId;

        socket.join(currentRoom);

        if (!chatRoomsData[currentRoom]) {
            chatRoomsData[currentRoom] = { history: [], title: '🙂' };
        }

        if (!roomUsers[currentRoom]) {
            roomUsers[currentRoom] = new Set();
        }
        roomUsers[currentRoom].add(currentUserId);

        // 1. चैट हिस्ट्री भेजें
        socket.emit('load_history', chatRoomsData[currentRoom].history || []);
        // 2. वर्तमान हेडर टाइटल भेजें
        socket.emit('title_updated', chatRoomsData[currentRoom].title || '🙂');

        // 3. रूम में 1 से ज़्यादा लोग हैं तो 'online' दिखाएँ
        const onlineCount = roomUsers[currentRoom].size;
        if (onlineCount > 1) {
            io.to(currentRoom).emit('status_change', 'online');
        } else {
            socket.emit('status_change', 'offline');
        }
    });

    // हेडर टाइटल अपडेट
    socket.on('change_title', (newTitle) => {
        if (!currentRoom) return;
        chatRoomsData[currentRoom].title = newTitle;
        saveDataToFile();
        io.to(currentRoom).emit('title_updated', newTitle);
    });

    // टाइपिंग स्टेटस
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
        saveDataToFile();
        socket.to(currentRoom).emit('receive_message', data);
    });

    // 📷 इमेज मैसेज
    socket.on('send_image', (data) => {
        if (!currentRoom) return;
        chatRoomsData[currentRoom].history.push(data);
        saveDataToFile();
        socket.to(currentRoom).emit('receive_image', data);
    });

    // 🎙️ ऑडियो मैसेज
    socket.on('send_audio', (data) => {
        if (!currentRoom) return;
        chatRoomsData[currentRoom].history.push(data);
        saveDataToFile();
        socket.to(currentRoom).emit('receive_audio', data);
    });

    // रिएक्शन
    socket.on('send_reaction', (data) => {
        if (!currentRoom) return;
        const msg = chatRoomsData[currentRoom].history.find(m => m.id === data.msgId);
        if (msg) {
            msg.reaction = data.emoji;
            saveDataToFile();
        }
        socket.to(currentRoom).emit('receive_reaction', data);
    });

    // Delete Everyone
    socket.on('delete_message_everyone', (data) => {
        if (!currentRoom) return;
        const msg = chatRoomsData[currentRoom].history.find(m => m.id === data.msgId);
        if (msg) {
            msg.deleted = true;
            saveDataToFile();
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
                saveDataToFile();
            }
        }
    });

    // Clear Chat For Me
    socket.on('clear_chat_for_me', (data) => {
        if (!currentRoom) return;
        chatRoomsData[currentRoom].history.forEach(msg => {
            if (!msg.deletedFor) msg.deletedFor = [];
            if (!msg.deletedFor.includes(data.userId)) {
                msg.deletedFor.push(data.userId);
            }
        });
        saveDataToFile();
    });

    // डिस्कनेक्ट होने पर
    socket.on('disconnect', () => {
        if (currentRoom && roomUsers[currentRoom]) {
            roomUsers[currentRoom].delete(currentUserId);
            if (roomUsers[currentRoom].size <= 1) {
                io.to(currentRoom).emit('status_change', 'offline');
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});
