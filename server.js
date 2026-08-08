const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 50e6 });

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// रूम्स और उनका डेटा स्टोर करने के लिए
const chatRooms = {}; 
const MASTER_PASSWORD = "secret"; // एडमिन (आप) के लिए मास्टर पासवर्ड

io.on('connection', (socket) => {
    
    // यूजर जब रूम जॉइन करे
    socket.on('join_room', ({ username, roomName, password }) => {
        // अगर रूम पहले से नहीं है, तो नया बनाओ
        if (!chatRooms[roomName]) {
            chatRooms[roomName] = {
                password: password, // जो पहला इंसान आएगा, वो पासवर्ड सेट करेगा
                history: [],
                users: []
            };
        } else {
            // अगर रूम है, तो पासवर्ड चेक करो (मास्टर पासवर्ड से भी एंट्री मिलेगी)
            const roomPass = chatRooms[roomName].password;
            if (roomPass !== "" && roomPass !== password && password !== MASTER_PASSWORD) {
                socket.emit('login_error', 'Wrong Room Password!');
                return;
            }
        }

        // सक्सेसफुल जॉइन
        socket.join(roomName);
        socket.username = username;
        socket.roomName = roomName;

        chatRooms[roomName].users.push({ id: socket.id, name: username });

        socket.emit('login_success', chatRooms[roomName].history);
        
        // सबको बताओ कौन आया
        io.to(roomName).emit('system_message', `${username} joined the room!`);
    });

    // मैसेज सेव और ब्रॉडकास्ट
    function saveAndBroadcast(msgData, eventName) {
        if (!socket.roomName) return;
        const room = chatRooms[socket.roomName];
        
        const finalMsg = { ...msgData, event: eventName, senderName: socket.username };
        room.history.push(finalMsg);
        
        socket.to(socket.roomName).emit(eventName, finalMsg);
    }

    socket.on('send_message', (data) => saveAndBroadcast(data, 'receive_message'));
    socket.on('send_image', (data) => saveAndBroadcast(data, 'receive_image'));
    socket.on('send_audio', (data) => saveAndBroadcast(data, 'receive_audio'));

    // मैसेज डिलीट
    socket.on('delete_for_everyone', (msgId) => {
        if (!socket.roomName) return;
        let room = chatRooms[socket.roomName];
        room.history = room.history.filter(m => m.id !== msgId);
        io.to(socket.roomName).emit('message_deleted', msgId);
    });

    // रूम की पूरी चैट साफ़ करना
    socket.on('clear_all_chat', () => {
        if (!socket.roomName) return;
        chatRooms[socket.roomName].history = [];
        io.to(socket.roomName).emit('chat_cleared');
    });

    socket.on('disconnect', () => {
        if (socket.roomName && chatRooms[socket.roomName]) {
            let room = chatRooms[socket.roomName];
            room.users = room.users.filter(u => u.id !== socket.id);
            io.to(socket.roomName).emit('system_message', `${socket.username} left the room.`);
            
            // अगर रूम खाली हो गया, तो रूम डिलीट कर दो (मेमोरी बचाने के लिए)
            if (room.users.length === 0) {
                delete chatRooms[socket.roomName];
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
