const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

app.use(express.static(path.join(__dirname)));

let chatHistory = [];
let roomTitle = "🙂";

io.on('connection', (socket) => {
    socket.emit('title_updated', roomTitle);
    socket.emit('load_history', chatHistory);
    socket.broadcast.emit('chat_start');

    socket.on('change_title', (newTitle) => {
        roomTitle = newTitle;
        io.emit('title_updated', roomTitle);
    });

    socket.on('send_message', (data) => {
        data.deletedFor = [];
        chatHistory.push(data);
        socket.broadcast.emit('receive_message', data);
    });

    socket.on('send_image', (data) => {
        data.deletedFor = [];
        chatHistory.push(data);
        socket.broadcast.emit('receive_image', data);
    });

    socket.on('send_audio', (data) => {
        data.deletedFor = [];
        chatHistory.push(data);
        socket.broadcast.emit('receive_audio', data);
    });

    socket.on('typing', () => socket.broadcast.emit('display_typing'));
    socket.on('stop_typing', () => socket.broadcast.emit('hide_typing'));

    socket.on('send_reaction', (data) => {
        const msg = chatHistory.find(m => m.id === data.msgId);
        if (msg) msg.reaction = data.emoji;
        socket.broadcast.emit('receive_reaction', data);
    });

    // DELETE FOR EVERYONE
    socket.on('delete_message_everyone', (data) => {
        const index = chatHistory.findIndex(m => m.id === data.msgId);
        if (index !== -1) {
            chatHistory[index].deleted = true;
            chatHistory[index].text = "🚫 यह संदेश हटा दिया गया है";
            delete chatHistory[index].image;
            delete chatHistory[index].audio;
            delete chatHistory[index].reaction;
        }
        io.emit('message_deleted_everyone', { msgId: data.msgId });
    });

    // DELETE FOR ME (RAM सफाई 2 यूज़र्स के लिए)
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
        }
    });

    // CLEAR CHAT FOR ME
    socket.on('clear_chat_for_me', (data) => {
        chatHistory.forEach(msg => {
            if (!msg.deletedFor) msg.deletedFor = [];
            if (!msg.deletedFor.includes(data.userId)) {
                msg.deletedFor.push(data.userId);
            }
        });
        chatHistory = chatHistory.filter(msg => msg.deletedFor.length < 2);
    });

    socket.on('disconnect', () => socket.broadcast.emit('user_left'));
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Server running on port ${PORT}`));
