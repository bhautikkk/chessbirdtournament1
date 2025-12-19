const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files
app.use(express.static(path.join(__dirname, '.')));

const rooms = {};

// Helper to generate 6 digit code
function generateRoomCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // Create Room
    socket.on('create_room', (playerName) => {
        const roomCode = generateRoomCode();
        rooms[roomCode] = {
            code: roomCode,
            admin: socket.id,
            players: [{ id: socket.id, name: playerName, shineColor: null }],
            slots: {
                white: null,
                black: null
            },
            gameStarted: false,
            fen: 'start',
            turn: 'w',
            whiteTime: 600,
            blackTime: 600,
            lastMoveTime: 0
        };

        socket.join(roomCode);
        socket.emit('room_created', { roomCode, isAdmin: true });
        io.to(roomCode).emit('update_lobby', rooms[roomCode]);
        console.log(`Room ${roomCode} created by ${playerName}`);
    });

    // Join Room
    socket.on('join_room', ({ roomCode, playerName }) => {
        const room = rooms[roomCode];
        if (room) {
            // Check if already in room (simple check)
            const existingPlayer = room.players.find(p => p.id === socket.id);
            if (!existingPlayer) {
                room.players.push({ id: socket.id, name: playerName, shineColor: null });
            }

            socket.join(roomCode);
            // If this is the creator re-joining or just joining, check admin
            const isAdmin = (socket.id === room.admin);

            socket.emit('joined_room', { roomCode, isAdmin });
            io.to(roomCode).emit('update_lobby', room);

            // Reconnection Logic: If game is active, send full state
            if (room.gameStarted) {
                // Calculate current elapsed time for the active turn
                let currentWhiteTime = room.whiteTime;
                let currentBlackTime = room.blackTime;

                if (room.lastMoveTime > 0) {
                    const elapsed = (Date.now() - room.lastMoveTime) / 1000;
                    if (room.turn === 'w') {
                        currentWhiteTime = Math.max(0, currentWhiteTime - elapsed);
                    } else {
                        currentBlackTime = Math.max(0, currentBlackTime - elapsed);
                    }
                }

                socket.emit('reconnect_game', {
                    whitePlayerId: room.slots.white.id,
                    blackPlayerId: room.slots.black.id,
                    fen: room.fen,
                    whiteTime: currentWhiteTime,
                    blackTime: currentBlackTime,
                    turn: room.turn
                });
            }

            console.log(`${playerName} joined room ${roomCode}`);
        } else {
            socket.emit('error_message', 'Invalid Room Code');
        }
    });

    // Assign Slot (Admin Only)
    socket.on('assign_slot', ({ roomCode, playerId, slot }) => {
        const room = rooms[roomCode];
        if (room && room.admin === socket.id) {
            // Remove player from other slots if present
            if (room.slots.white && room.slots.white.id === playerId) room.slots.white = null;
            if (room.slots.black && room.slots.black.id === playerId) room.slots.black = null;

            // Find player details
            const player = room.players.find(p => p.id === playerId);
            if (player) {
                room.slots[slot] = player;
                io.to(roomCode).emit('update_lobby', room);
            }
        }
    });

    // Set Shine Color (Admin Only)
    socket.on('set_shine_color', ({ roomCode, playerId, color }) => {
        const room = rooms[roomCode];
        if (room && room.admin === socket.id) {
            const player = room.players.find(p => p.id === playerId);
            if (player) {
                // If color is present, set it. If null, remove it (disable shine)
                player.shineColor = color || null;
                // isShining can still be used as a simple boolean flag if needed by client,
                // but relying on shineColor being truthy is better.
                // Let's keep isShining synced for backward compatibility if we want, or just drop it.
                // Better: Client checks if (p.shineColor)
                io.to(roomCode).emit('update_lobby', room);
            }
        }
    });

    // Start Game (Admin Only)
    socket.on('start_game', (roomCode) => {
        const room = rooms[roomCode];
        if (room && room.admin === socket.id) {
            if (room.slots.white && room.slots.black) {
                room.gameStarted = true;
                room.fen = 'start';
                room.whiteTime = 600;
                room.blackTime = 600;
                room.turn = 'w';
                room.lastMoveTime = Date.now(); // Start clock now

                io.to(roomCode).emit('game_started', {
                    whitePlayerId: room.slots.white.id,
                    blackPlayerId: room.slots.black.id
                });
                console.log(`Game started in room ${roomCode}`);
            } else {
                socket.emit('error_message', 'Both slots must be filled to start.');
            }
        }
    });

    // Remove from Slot (Admin Only)
    socket.on('remove_from_slot', ({ roomCode, slot }) => {
        const room = rooms[roomCode];
        if (room && room.admin === socket.id) {
            if (room.slots[slot]) {
                room.slots[slot] = null;
                io.to(roomCode).emit('update_lobby', room);
            }
        }
    });

    // Kick Player (Admin Only)
    socket.on('kick_player', ({ roomCode, playerId }) => {
        const room = rooms[roomCode];
        if (room && room.admin === socket.id) {
            // Remove from slots if present
            if (room.slots.white && room.slots.white.id === playerId) room.slots.white = null;
            if (room.slots.black && room.slots.black.id === playerId) room.slots.black = null;

            // Remove from player list
            const index = room.players.findIndex(p => p.id === playerId);
            if (index !== -1) {
                room.players.splice(index, 1);
                // Notify kicked player
                io.to(playerId).emit('kicked');
                // Update room for others
                io.to(roomCode).emit('update_lobby', room);
            }
        }
    });

    // Resign
    socket.on('resign', (roomCode) => {
        const room = rooms[roomCode];
        if (room && room.gameStarted) {
            const resigningPlayer = room.players.find(p => p.id === socket.id);
            const winnerColor = (room.slots.white.id === socket.id) ? 'Black' : 'White';

            io.to(roomCode).emit('game_over', {
                reason: 'Resignation',
                winner: winnerColor,
                message: `${resigningPlayer.name} resigned. ${winnerColor} wins!`
            });
            room.gameStarted = false; // Or keep active for view? Better to stop.
            io.to(roomCode).emit('update_lobby', room); // SYNC FIX
        }
    });

    // Make Move
    socket.on('make_move', ({ roomCode, move, fen }) => {
        const room = rooms[roomCode];
        if (room && room.gameStarted) {
            const now = Date.now();
            const elapsed = (now - room.lastMoveTime) / 1000;

            // Identify player
            const isWhite = room.slots.white.id === socket.id;
            const isBlack = room.slots.black.id === socket.id;

            // Simple validation: Ensure it's the correct player's turn
            if ((isWhite && room.turn !== 'w') || (isBlack && room.turn !== 'b')) {
                // Ignore out of turn moves
                return;
            }

            // Update time
            if (room.turn === 'w') {
                room.whiteTime -= elapsed;
            } else {
                room.blackTime -= elapsed;
            }

            // Check for timeout
            if (room.whiteTime <= 0 || room.blackTime <= 0) {
                const winner = (room.whiteTime <= 0) ? 'Black' : 'White';
                io.to(roomCode).emit('game_over', {
                    reason: 'Timeout',
                    winner: winner,
                    message: `Time's up! ${winner} Wins!`
                });
                room.gameStarted = false;
                io.to(roomCode).emit('update_lobby', room); // SYNC FIX
                return;
            }

            // Update State
            room.fen = fen;
            room.turn = (room.turn === 'w') ? 'b' : 'w';
            room.lastMoveTime = now;

            // Broadcast to ALL (including sender) to ensure Time Sync is perfect
            io.to(roomCode).emit('move_made', { move, fen, whiteTime: room.whiteTime, blackTime: room.blackTime });
        }
    });

    // Draw Offer
    socket.on('offer_draw', (roomCode) => {
        const room = rooms[roomCode];
        if (room && room.gameStarted) {
            // Send to opponent
            socket.to(roomCode).emit('draw_offered', {
                roomCode
            });
        }
    });

    // Client claims Game Over (Checkmate/Draw detected locally)
    socket.on('claim_game_over', ({ roomCode, reason, winner, fen, lastMove }) => {
        const room = rooms[roomCode];
        if (room && room.gameStarted) {
            io.to(roomCode).emit('game_over', {
                reason: reason,
                winner: winner,
                message: (winner === 'Draw') ? `Game ended in a Draw (${reason})` : `Checkmate! ${winner} Wins!`,
                fen: fen, // Pass final board state
                lastMove: lastMove // Pass last move to preserve history if possible
            });
            room.gameStarted = false;
            io.to(roomCode).emit('update_lobby', room); // SYNC FIX
        }
    });

    socket.on('accept_draw', (roomCode) => {
        const room = rooms[roomCode];
        if (room && room.gameStarted) {
            io.to(roomCode).emit('game_over', {
                reason: 'Agreement',
                winner: 'Draw',
                message: 'Game ended in a Draw (Mutual Agreement)'
            });
            room.gameStarted = false;
            io.to(roomCode).emit('update_lobby', room); // SYNC FIX
        }
    });

    socket.on('reject_draw', (roomCode) => {
        const room = rooms[roomCode];
        // Find opponent socket
        // But broadcast is fine if we filter on client, or better: send to opponent only.
        // For simplicity in this structure: broadcast 'draw_rejected' to room, client filters self.
        socket.to(roomCode).emit('draw_rejected');
    });

    // Chat
    socket.on('send_chat', ({ roomCode, message }) => {
        const room = rooms[roomCode];
        if (room) {
            const player = room.players.find(p => p.id === socket.id);
            if (player) {
                const isAdmin = (room.admin === socket.id);
                io.to(roomCode).emit('receive_chat', {
                    name: player.name,
                    message,
                    isAdmin
                });
            }
        }
    });

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        // Remove player from all rooms they are in
        for (const roomCode in rooms) {
            const room = rooms[roomCode];

            // If Admin leaves -> Close Room
            if (room.admin === socket.id) {
                io.to(roomCode).emit('room_closed');
                delete rooms[roomCode];
                console.log(`Room ${roomCode} closed (Admin left)`);
                continue; // Stop processing this room
            }

            // Regular player leaves
            const index = room.players.findIndex(p => p.id === socket.id);
            if (index !== -1) {
                room.players.splice(index, 1);

                // Remove from slots if assigned
                if (room.slots.white && room.slots.white.id === socket.id) room.slots.white = null;
                if (room.slots.black && room.slots.black.id === socket.id) room.slots.black = null;

                // Send update if room still exists
                if (room.players.length === 0) {
                    delete rooms[roomCode];
                } else {
                    io.to(roomCode).emit('update_lobby', room);
                }
            }
        }
    });

});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
