const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    maxHttpBufferSize: 50e6
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// एक्टिव रूम और पेंडिंग मैसेज ट्रैक करने के लिए
let activeUsers = []; 
let pendingMessages = [];

io.on('connection', (socket) => {
    // नए यूजर को लिस्ट में जोड़ें
    activeUsers.push(socket);

    // अगर 2 लोग ऑनलाइन आ गए हैं और रूम नहीं बना है
    if (activeUsers.length >= 2) {
        const user1 = activeUsers[0];
        const user2 = activeUsers[1];

        const roomId = `room_${user1.id}_${user2.id}`;
        
        user1.join(roomId);
        user2.join(roomId);

        user1.roomId = roomId;
        user2.roomId = roomId;

        // दोनों को ऑनलाइन स्टेटस भेजें
        io.to(roomId).emit('chat_start', '2nd person is Online!');

        // अगर कोई पेंडिंग मैसेजेस थे, तो तुरंत भेजें
        if (pendingMessages.length > 0) {
            pendingMessages.forEach(msgData => {
                io.to(roomId).emit(msgData.event, msgData.data);
            });
            pendingMessages = []; // खाली करें
        }
    } else {
        // अगर सिर्फ 1 ही बंदा ऑनलाइन है
        socket.emit('waiting', 'Waiting for 2nd person to get Online...');
    }

    // टेक्स्ट मैसेज
    socket.on('send_message', (data) => {
        if (socket.roomId) {
            socket.to(socket.roomId).emit('receive_message', data);
        } else {
            // अगर दूसरा बंदा ऑनलाइन नहीं है, पेंडिंग में रखें
            pendingMessages.push({ event: 'receive_message', data: data });
        }
    });

    // फोटो मैसेज
    socket.on('send_image', (data) => {
        if (socket.roomId) {
            socket.to(socket.roomId).emit('receive_image', data);
        } else {
            pendingMessages.push({ event: 'receive_image', data: data });
        }
    });

    // ऑडियो मैसेज
    socket.on('send_audio', (data) => {
        if (socket.roomId) {
            socket.to(socket.roomId).emit('receive_audio', data);
        } else {
            pendingMessages.push({ event: 'receive_audio', data: data });
        }
    });

    // मैसेज डिलीट करना
    socket.on('delete_for_everyone', (msgId) => {
        if (socket.roomId) {
            socket.to(socket.roomId).emit('message_deleted', msgId);
        }
        pendingMessages = pendingMessages.filter(m => m.data.id !== msgId);
    });

    // टाइपिंग इंडिकेटर
    socket.on('typing', () => {
        if (socket.roomId) socket.to(socket.roomId).emit('display_typing');
    });

    socket.on('stop_typing', () => {
        if (socket.roomId) socket.to(socket.roomId).emit('hide_typing');
    });

    // जब कोई डिस्कनेक्ट या ऑफलाइन हो
    socket.on('disconnect', () => {
        // यूजर को एक्टिव लिस्ट से हटाएं
        activeUsers = activeUsers.filter(u => u.id !== socket.id);

        if (socket.roomId) {
            // दूसरे यूजर को ऑफलाइन की सूचना दें
            socket.to(socket.roomId).emit('user_left', '2nd person went Offline.');
            
            // बचे हुए यूजर का रूम रिसेट करें
            const clients = io.sockets.adapter.rooms.get(socket.roomId);
            if (clients) {
                for (const clientId of clients) {
                    const remainingSocket = io.sockets.sockets.get(clientId);
                    if (remainingSocket) {
                        remainingSocket.leave(socket.roomId);
                        delete remainingSocket.roomId;
                    }
                }
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
