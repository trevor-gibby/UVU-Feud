const _ = require('lodash');
const express = require('express');
const http = require('http');
const path = require('path');
const logger = require('morgan');
const favicon = require('serve-favicon');
const mongoose = require('mongoose');
const { Server } = require("socket.io");

const https = require('https');
const questionAPI = 'https://s3-us-west-2.amazonaws.com/s.cdpn.io/40041/FF3.json';

const PORT = 3000;
const app = express();
const server = http.createServer(app);
const io = new Server(server);

const chars = ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z'];

// Connect to Database
// -------------------
// Database Schema and Models
// --------------------------
const dbURL = 'mongodb://127.0.0.1:27017/uvu-feud-questions';
const Schema = mongoose.Schema;

const questionSchema = new Schema({
    question: { type: String, unique: true },
    answers: Array
});
const questionsModel = mongoose.model('questions', questionSchema);
// -------------------
// End Database Schema

mongoose.connect(dbURL, {useNewUrlParser: true});
const db = mongoose.connection;
db.once('open', () => {
    console.log('Database Connected: ', dbURL);
    // Replace Data in Model with Data from API
    https.get(questionAPI,(res) => {
        let body = "";
    
        res.on("data", (chunk) => {
            body += chunk;
        });
    
        res.on("end", () => {
            try {
                let allQuestions = JSON.parse(body.replace(/^\ufeff/g,""));
                // Remove items from db collection
                questionsModel.deleteMany({}, async () => {
                    // Add all questions to db collection
                    for (let q in allQuestions)
                    {
                        let insertQ = new questionsModel({question: q, answers: allQuestions[q]});
                        await insertQ.save();
                    }
                });
            } catch (error) {
                console.error(error.message);
            };
        });
    
    }).on("error", (error) => {
        console.error(error.message);
    });
});
db.on('error', err => {
    console.error('DB Connection error: ', err);
});
// ----------------------
// End Database Connection



// App Middleware
// --------------
// Use morgan for logging server requests
app.use(logger('dev'));
// parse requests of content-type: application/json or urlencoded
app.use(express.json());
app.use(express.urlencoded({
    extended: true
}));
// Serve Favicon
app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')))
// ------------------
// End App Middleware

// Add Routes
// ----------
// Root
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '/public', 'index.html'));
});
// Static Files
app.use(express.static('public'));
// Request Question Object
app.get('/api/v1/question', async (req, res) => {
    // Get array of all questions
    let allQuestions = await questionsModel.find();
    // Get random question from array
    let question = allQuestions[Math.floor(Math.random()*allQuestions.length)];
    res.send(question);
});
// ----------
// End Routes

// Sockets
// -------
io.on('connection', (socket) => {
    // On initial connection do nothing
    console.log('a user connected');

    // Handle create room event
    socket.on('create-room', () => {
        let code = '';
        
        do {
            // Generate random 4 character key
            code = _.sample(chars) + _.sample(chars) + _.sample(chars) + _.sample(chars);
            // Check that key doesn't exist for another room already
            var roomExists = socket.adapter.rooms.get(code);
        } while (roomExists);
        socket.join(code);
        socket.data.playerName = 'presenter';
        socket.data.roomCode = code;
        // return the key to the client
        io.to(code).emit('created-room', code);
    });

    // Handle Join Room Event
    socket.on('join-room', (code) => {
        // Check that room exists already
        let roomExists = socket.adapter.rooms.get(code);
        // If it does then join the room and return status of true
        if (roomExists) {
            socket.join(code);
            socket.data.roomCode = code;
            io.to(code).emit('joined-room', true);
        }
        // If it does not then return status of false
        else {
            io.to(socket.id).emit('joined-room', false);
        }
    });

    // Handle re-join room event
    socket.on('re-join-room', (code, playerName, playerType) => {
        // Check that room exists already
        let roomExists = socket.adapter.rooms.get(code);
        // If it does then join the room and return status of true
        if (roomExists) {
            socket.join(code);
            socket.data.roomCode = code;
            socket.data.playerName = playerName;
            io.to(code).emit('reconnected-to-room', playerName, playerType);
        }
        // If it does not then return status of false
        else {
            io.to(socket.id).emit('reconnect-failed');
        }
    });

    // Handle game state changes
    socket.on('update-game-state', (gameState, newPlayerName) => {
        if (newPlayerName)
            socket.data.playerName = newPlayerName;
        
        let roomId = socket.data.roomCode;
        io.to(roomId).emit('update-game-state', gameState);
    });

    // Handle leaving room
    socket.on('leave-room', (announce) => {
        let roomId = socket.data.roomCode;
        socket.leaveAll();
        socket.data.roomCode = undefined;
        if (announce)
            io.to(roomId).emit('player-left-room', socket.data.playerName);
    });

    // Handle room destruction
    socket.on('destroy-room', () => {
        let roomId = socket.data.roomCode;
        io.to(roomId).emit('room-destroyed');
        socket.adapter.rooms.delete(roomId);
    });

    // Handle Start Game
    socket.on('start-game', (gameState) => {
        let roomId = socket.data.roomCode;
        // Emits start game that sends initial game state to everyone and queues them to change screen
        io.to(roomId).emit('start-game', gameState);
    });

    // Handle Face-off
    socket.on('face-off-btn', playerType => {
        let roomId = socket.data.roomCode;

        io.to(roomId).emit('face-off-btn', playerType);
    });

    // Handle Host Tapping Correct Answer

    // Handle Host Tapping Wrong Answer
    socket.on('show-strikes', numStrikes => {
        let roomId = socket.data.roomCode;

        io.to(roomId).emit('show-strikes', numStrikes);
    });

    // Handle User Disconnect
    socket.on('disconnect', () => {
        console.log('user disconnected ', socket.data.playerName);
        let roomId = socket.data.roomCode;
        io.to(roomId).emit('player-disconnected', socket.data.playerName);
    });
});





// -----------
// End Sockets

// Start Server
// ------------
server.listen(PORT, () => {
    console.log(`listening at http://localhost:${PORT}`);
});
// ----------------
// End Start Server

// Graceful Shutdown
// -----------------
function gracefulShutdown(SIG) {
    console.log(`Received POSIX ${SIG}: closing HTTP server`);
    server.close(() => {
        console.log('HTTP server closed');
        process.exit();
    });
}

process.once('SIGTERM', gracefulShutdown, 'SIGTERM'); //shell command kill (not kill 9) on mac/linux
process.once('SIGINT', gracefulShutdown, 'SIGINT'); //ctrl-C on all
process.once('SIGBREAK', gracefulShutdown, 'SIGBREAK'); //ctrl-break on Windows
// ---------------------
// End Graceful Shutdown
