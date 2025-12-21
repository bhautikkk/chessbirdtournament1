const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const ROOMS_FILE = path.join(__dirname, 'rooms.json');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files
app.use(express.static(path.join(__dirname, '.')));

let rooms = {};

// Helper to strip non-serializable objects (Timers) for Saving/Sending
function safeRoom(room) {
    if (!room) return null;
    const cleanRoom = { ...room };
    // Remove Timeout Objects
    if (cleanRoom.disconnectTimeout) cleanRoom.disconnectTimeout = null;

    // Clean Players
    cleanRoom.players = room.players.map(p => {
        const cleanP = { ...p };
        if (cleanP.disconnectGameTimeout) cleanP.disconnectGameTimeout = null;
        return cleanP;
    });

    return cleanRoom;
}

// Persistence Helpers
function saveRooms() {
    try {
        const cleanRooms = {};
        for (const key in rooms) {
            cleanRooms[key] = safeRoom(rooms[key]);
        }
        fs.writeFileSync(ROOMS_FILE, JSON.stringify(cleanRooms, null, 2));
    } catch (err) {
        console.error("Failed to save rooms:", err);
    }
}

function loadRooms() {
    try {
        if (fs.existsSync(ROOMS_FILE)) {
            const data = fs.readFileSync(ROOMS_FILE, 'utf8');
            rooms = JSON.parse(data);
            console.log("Loaded rooms from execution persistence.");
        }
    } catch (err) {
        console.error("Failed to load rooms:", err);
        rooms = {};
    }
}

// Load on Startup
loadRooms();

// Game Loop: Check for timeouts every second
setInterval(() => {
    const now = Date.now();
    for (const roomCode in rooms) {
        const room = rooms[roomCode];
        if (room.gameStarted) {
            const elapsed = (now - room.lastMoveTime) / 1000;
            // Note: We don't decrement strictly every second in state, 
            // we calculate based on elapsed since last move. 
            // But we need to check if limit exceeded.

            let currentWhiteTime = room.whiteTime;
            let currentBlackTime = room.blackTime;

            if (room.turn === 'w') {
                currentWhiteTime -= elapsed;
            } else {
                currentBlackTime -= elapsed;
            }

            if (currentWhiteTime <= 0 || currentBlackTime <= 0) {
                // Timeout!
                const winner = (currentWhiteTime <= 0) ? 'Black' : 'White';
                io.to(roomCode).emit('game_over', {
                    reason: 'Timeout',
                    winner: winner,
                    message: `Time's up! ${winner} Wins!`
                });
                room.gameStarted = false;

                // Reset times to 0 for neatness
                if (currentWhiteTime <= 0) room.whiteTime = 0;
                if (currentBlackTime <= 0) room.blackTime = 0;

                io.to(roomCode).emit('update_lobby', safeRoom(room));
                saveRooms(); // Save on Timeout
            }
        }
    }
}, 1000);

// Helper to generate 6 digit code
function generateRoomCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

function generateAdminToken() {
    return Math.random().toString(36).substr(2) + Math.random().toString(36).substr(2);
}

function generatePlayerToken() {
    return Math.random().toString(36).substr(2) + Math.random().toString(36).substr(2);
}

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // Create Room
    socket.on('create_room', (playerName) => {
        const roomCode = generateRoomCode();
        const adminToken = generateAdminToken(); // SECURE TOKEN
        rooms[roomCode] = {
            code: roomCode,
            admin: socket.id,
            adminToken: adminToken, // Store locally
            disconnectTimeout: null, // Grace period timer for Admin (Room Closure)
            players: [{ id: socket.id, name: playerName, shineColor: null, token: adminToken, disconnectGameTimeout: null }],
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
        // Send token ONLY to the creator (Admin uses same token for Player ID)
        socket.emit('room_created', { roomCode, isAdmin: true, adminToken, playerToken: adminToken });
        io.to(roomCode).emit('update_lobby', safeRoom(rooms[roomCode]));
        console.log(`Room ${roomCode} created by ${playerName}`);
        saveRooms(); // Save on Create
    });

    // Helper: Safe Handler Wrapper (Prevents Crashes)
    const safeHandler = (handler) => {
        return (...args) => {
            try {
                handler(...args);
            } catch (err) {
                console.error("CRITICAL SERVER ERROR (Caught):", err);
            }
        };
    };

    // Join Room
    socket.on('join_room', safeHandler(({ roomCode, playerName, adminToken, playerToken }) => {
        const room = rooms[roomCode];
        if (room) {
            let player = null;
            let isReconnecting = false;

            // 1. Try to find existing player by Token or ID
            if (playerToken) {
                player = room.players.find(p => p.token === playerToken);
            }
            // Fallback: Check ID (not persistent across refreshes, but good for simple disconnects)
            if (!player) {
                player = room.players.find(p => p.id === socket.id);
            }

            if (player) {
                // RECONNECTING PLAYER
                console.log(`Player ${player.name} reconnected to ${roomCode}`);
                player.id = socket.id; // Update Socket ID
                isReconnecting = true;

                // Handle Game Disconnect Timer
                if (player.disconnectGameTimeout) {
                    clearTimeout(player.disconnectGameTimeout);
                    player.disconnectGameTimeout = null;
                    console.log(`Game abandonment timer cancelled for ${player.name}`);

                    // Notify Game of Reconnection
                    if (room.gameStarted) {
                        const isWhite = (room.slots.white && room.slots.white.token === player.token);
                        const isBlack = (room.slots.black && room.slots.black.token === player.token);
                        const color = isWhite ? 'White' : (isBlack ? 'Black' : null);

                        if (color) {
                            io.to(roomCode).emit('player_reconnected_game', { color });
                        }
                    }
                }

                // If they were in a slot, update the slot's ID too
                if (room.slots.white && room.slots.white.token === player.token) room.slots.white = player;
                if (room.slots.black && room.slots.black.token === player.token) room.slots.black = player;

            } else {
                // NEW PLAYER
                const newToken = generatePlayerToken();
                player = { id: socket.id, name: playerName, shineColor: null, token: newToken, disconnectGameTimeout: null };
                room.players.push(player);
                // We will send this new token back
                playerToken = newToken;
                saveRooms(); // Save on New Player Join
            }

            socket.join(roomCode);

            // Check Admin Reconnection
            let isAdmin = false;
            // 1. Standard ID check
            if (socket.id === room.admin) {
                isAdmin = true;
            }
            // 2. Token Check (Admin Token)
            else if (adminToken && adminToken === room.adminToken) {
                console.log(`Admin reconnected to room ${roomCode}`);
                room.admin = socket.id;
                isAdmin = true;
                if (room.disconnectTimeout) {
                    clearTimeout(room.disconnectTimeout);
                    room.disconnectTimeout = null;
                    console.log(`Grace period cancelled for room ${roomCode}`);
                }
                saveRooms(); // Save on Admin Reconnect
            }

            // Send response (include playerToken for storage)
            socket.emit('joined_room', {
                roomCode,
                isAdmin,
                adminToken: (isAdmin ? room.adminToken : null),
                playerToken: player['token']
            });

            io.to(roomCode).emit('update_lobby', safeRoom(room));

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

                // Check if any player is currently disconnected (in grace period)
                const whiteP = room.slots.white;
                const blackP = room.slots.black;

                // SAFETY CHECK: Use optional chaining or defaults
                const whiteId = whiteP ? whiteP.id : null;
                const blackId = blackP ? blackP.id : null;

                const whiteDisconnected = (whiteP && whiteP.disconnectGameTimeout !== null);
                const blackDisconnected = (blackP && blackP.disconnectGameTimeout !== null);

                socket.emit('reconnect_game', {
                    roomCode: roomCode,
                    whitePlayerId: whiteId,
                    blackPlayerId: blackId,
                    whiteName: whiteP ? whiteP.name : 'White',
                    blackName: blackP ? blackP.name : 'Black',
                    fen: room.fen,
                    whiteTime: currentWhiteTime,
                    blackTime: currentBlackTime,
                    turn: room.turn,
                    whiteDisconnected,
                    blackDisconnected,
                    pgn: room.pgn // Sync PGN for history
                });
            }

            console.log(`${playerName} joined room ${roomCode}`);
        } else {
            socket.emit('error_message', 'Invalid Room Code');
        }
    }));

    // Assign Slot (Admin Only)
    socket.on('assign_slot', safeHandler(({ roomCode, playerId, slot }) => {
        const room = rooms[roomCode];
        if (room && room.admin === socket.id) {
            // Remove player from other slots if present
            if (room.slots.white && room.slots.white.id === playerId) room.slots.white = null;
            if (room.slots.black && room.slots.black.id === playerId) room.slots.black = null;

            // Find player details
            const player = room.players.find(p => p.id === playerId);
            if (player) {
                room.slots[slot] = player;
                io.to(roomCode).emit('update_lobby', safeRoom(room));
                saveRooms();
            }
        }
    }));

    // Set Shine Color (Admin Only)
    socket.on('set_shine_color', safeHandler(({ roomCode, playerId, color }) => {
        const room = rooms[roomCode];
        if (room && room.admin === socket.id) {
            const player = room.players.find(p => p.id === playerId);
            if (player) {
                player.shineColor = color || null;
                io.to(roomCode).emit('update_lobby', safeRoom(room));
                saveRooms();
            }
        }
    }));

    // Start Game (Admin Only)
    // Start Game (Admin Only)
    socket.on('start_game', safeHandler((payload) => {
        // Support both old (string roomCode) and new ({roomCode, duration}) formats
        let roomCode, duration;
        if (typeof payload === 'object') {
            roomCode = payload.roomCode;
            duration = payload.duration;
        } else {
            roomCode = payload;
            duration = 7; // Default fallback
        }

        const room = rooms[roomCode];
        if (room && room.admin === socket.id) {
            if (room.slots.white && room.slots.black) {
                // Validate duration (3, 5, or 7) - Default to 7
                const validDurations = [3, 5, 7];
                const finalDuration = validDurations.includes(duration) ? duration : 7;
                const timeInSeconds = finalDuration * 60;

                room.gameStarted = true;
                room.fen = 'start';
                room.whiteTime = timeInSeconds;
                room.blackTime = timeInSeconds;
                room.turn = 'w';
                room.pgn = ''; // Initialize PGN
                room.lastMoveTime = Date.now(); // Start clock now

                io.to(roomCode).emit('game_started', {
                    whitePlayerId: room.slots.white.id,
                    blackPlayerId: room.slots.black.id,
                    whiteTime: room.whiteTime,
                    blackTime: room.blackTime
                });
                console.log(`Game started in room ${roomCode} with ${finalDuration} min duration`);
                saveRooms(); // Save on Start Game
            } else {
                socket.emit('error_message', 'Both slots must be filled to start.');
            }
        }
    }));

    // Remove from Slot (Admin Only)
    socket.on('remove_from_slot', safeHandler(({ roomCode, slot }) => {
        const room = rooms[roomCode];
        if (room && room.admin === socket.id) {
            if (room.slots[slot]) {
                const removedPlayer = room.slots[slot];
                room.slots[slot] = null;

                // SAFETY: If game was active, removing a player must END the game
                if (room.gameStarted) {
                    const winner = (slot === 'white') ? 'Black' : 'White';
                    io.to(roomCode).emit('game_over', {
                        reason: 'Admin Removal',
                        winner: winner,
                        message: `Admin removed ${removedPlayer.name} from slot. ${winner} Wins!`
                    });
                    room.gameStarted = false;
                }

                io.to(roomCode).emit('update_lobby', safeRoom(room));
                saveRooms();
            }
        }
    }));

    // Kick Player (Admin Only)
    socket.on('kick_player', safeHandler(({ roomCode, playerId }) => {
        const room = rooms[roomCode];
        if (room && room.admin === socket.id) {

            // Check if player is in a slot
            let removedFromSlot = false;
            let wasInGame = false;
            let slotColor = null;

            if (room.slots.white && room.slots.white.id === playerId) {
                room.slots.white = null;
                removedFromSlot = true;
                if (room.gameStarted) { wasInGame = true; slotColor = 'white'; }
            }
            if (room.slots.black && room.slots.black.id === playerId) {
                room.slots.black = null;
                removedFromSlot = true;
                if (room.gameStarted) { wasInGame = true; slotColor = 'black'; }
            }

            // Remove from player list
            const index = room.players.findIndex(p => p.id === playerId);
            if (index !== -1) {
                const kickedPlayer = room.players[index];
                room.players.splice(index, 1);

                // Notify kicked player
                io.to(playerId).emit('kicked');

                // If they were in an active game, END IT
                if (wasInGame) {
                    const winner = (slotColor === 'white') ? 'Black' : 'White';
                    io.to(roomCode).emit('game_over', {
                        reason: 'Admin Kick',
                        winner: winner,
                        message: `Admin kicked ${kickedPlayer.name}. ${winner} Wins!`
                    });
                    room.gameStarted = false;
                }

                // Update room for others
                io.to(roomCode).emit('update_lobby', safeRoom(room));
                saveRooms();
            }
        }
    }));

    // Resign
    socket.on('resign', safeHandler((roomCode) => {
        const room = rooms[roomCode];
        if (room && room.gameStarted) {
            const resigningPlayer = room.players.find(p => p.id === socket.id);
            if (!resigningPlayer) return; // Safety

            // Determine winner based on who resigned. 
            // Safety: Check slots exist
            if (!room.slots.white || !room.slots.black) {
                // Corruption check: Game started but slots empty?
                room.gameStarted = false;
                io.to(roomCode).emit('update_lobby', safeRoom(room));
                return;
            }

            const winnerColor = (room.slots.white.id === socket.id) ? 'Black' : 'White';

            io.to(roomCode).emit('game_over', {
                reason: 'Resignation',
                winner: winnerColor,
                message: `${resigningPlayer.name} resigned. ${winnerColor} wins!`
            });
            room.gameStarted = false;
            io.to(roomCode).emit('update_lobby', safeRoom(room));
            saveRooms(); // Save on Resign
        }
    }));

    // Make Move
    socket.on('make_move', safeHandler(({ roomCode, move, fen, pgn }) => {
        const room = rooms[roomCode];
        if (room && room.gameStarted) {
            // SAFETY: Check slots
            if (!room.slots.white || !room.slots.black) {
                console.error("Game active but slots missing! Aborting game.");
                room.gameStarted = false;
                io.to(roomCode).emit('update_lobby', safeRoom(room));
                return;
            }

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
                io.to(roomCode).emit('update_lobby', safeRoom(room)); // SYNC FIX
                saveRooms(); // Save on Timeout (Move Check)
                return;
            }

            // Update State
            room.fen = fen;
            room.pgn = pgn; // Store PGN
            room.turn = (room.turn === 'w') ? 'b' : 'w';
            room.lastMoveTime = now;

            // Broadcast to ALL (including sender) to ensure Time Sync is perfect
            io.to(roomCode).emit('move_made', { move, fen, whiteTime: room.whiteTime, blackTime: room.blackTime });
            saveRooms(); // Save on Move
        }
    }));

    // Draw Offer
    socket.on('offer_draw', safeHandler((roomCode) => {
        const room = rooms[roomCode];
        if (room && room.gameStarted) {
            // Send to opponent
            socket.to(roomCode).emit('draw_offered', {
                roomCode
            });
        }
    }));

    // Client claims Game Over (Checkmate/Draw detected locally)
    socket.on('claim_game_over', safeHandler(({ roomCode, reason, winner, fen, lastMove }) => {
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
            io.to(roomCode).emit('update_lobby', safeRoom(room)); // SYNC FIX
        }
    }));

    socket.on('accept_draw', safeHandler((roomCode) => {
        const room = rooms[roomCode];
        if (room && room.gameStarted) {
            io.to(roomCode).emit('game_over', {
                reason: 'Agreement',
                winner: 'Draw',
                message: 'Game ended in a Draw (Mutual Agreement)'
            });
            room.gameStarted = false;
            io.to(roomCode).emit('update_lobby', safeRoom(room)); // SYNC FIX
            saveRooms();
        }
    }));

    socket.on('reject_draw', safeHandler((roomCode) => {
        const room = rooms[roomCode];
        // Broadcast generic message to everyone.
        // Client side will handle "Your offer" vs "Draw offer" differentiation if possible, 
        // or we just show a neutral "Draw offer rejected" to everyone.
        io.to(roomCode).emit('draw_rejected');
    }));

    // Chat
    socket.on('send_chat', safeHandler(({ roomCode, message }) => {
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
    }));

    socket.on('disconnect', safeHandler(() => {
        console.log(`User disconnected: ${socket.id}`);
        // Remove player from all rooms they are in
        for (const roomCode in rooms) {
            const room = rooms[roomCode];

            // 1. Handle Admin Disconnect (Room Closure)
            if (room.admin === socket.id) {
                console.log(`Admin disconnected from Room ${roomCode}. CHECKING STATUS...`);
                // CHANGE: Only close room if NO GAME is active.
                // If game is active, we should keep room alive for the players to finish.
                // But if Admin leaves, who controls?
                // For now, let's keep it alive. Admin can reconnect.

                if (!room.gameStarted) {
                    console.log(`No active game. Starting 60s grace period for Admin.`);
                    room.disconnectTimeout = setTimeout(() => {
                        if (rooms[roomCode] && rooms[roomCode].admin === socket.id && !rooms[roomCode].gameStarted) {
                            io.to(roomCode).emit('room_closed');
                            delete rooms[roomCode];
                            console.log(`Room ${roomCode} closed (Admin left - Grace period ended)`);
                            saveRooms(); // Save on Room Close
                        }
                    }, 60000); // 60 Seconds
                } else {
                    console.log(`Active Game in progress. Room will NOT close immediately.`);
                    // We might want to set a flag that Admin is gone, but for now just keep it.
                }
            }

            // 2. Check if this user is an Active Player in a Game
            let activeColor = null;
            if (room.gameStarted) {
                if (room.slots.white && room.slots.white.id === socket.id) activeColor = 'White';
                if (room.slots.black && room.slots.black.id === socket.id) activeColor = 'Black';
            }

            if (activeColor) {
                // GAME ABANDONMENT LOGIC
                console.log(`${activeColor} disconnected during game! Starting 60s abort timer.`);

                // Broadcast Warning
                io.to(roomCode).emit('player_disconnected_game', { color: activeColor, time: 60 });

                // Find player object
                const player = room.players.find(p => p.id === socket.id);
                if (player) {
                    player.disconnectGameTimeout = setTimeout(() => {
                        // Check if they came back? (Timeout is cleared on reconnect)
                        // If we are here, they didn't come back.
                        console.log(`Player ${player.name} (${activeColor}) abandoned the game.`);

                        const winner = (activeColor === 'White') ? 'Black' : 'White';
                        io.to(roomCode).emit('game_over', {
                            reason: 'Abandonment',
                            winner: winner,
                            message: `${activeColor} disconnected. ${winner} wins!`
                        });
                        room.gameStarted = false;

                        // Now that game is over, we check if we should close room?
                        // If Admin is also gone, maybe?
                        // For now, just reset game.

                        // Remove player completely now
                        const idx = room.players.indexOf(player);
                        if (idx !== -1) {
                            room.players.splice(idx, 1);
                            if (room.slots.white === player) room.slots.white = null;
                            if (room.slots.black === player) room.slots.black = null;
                        }

                        io.to(roomCode).emit('update_lobby', safeRoom(room));
                        saveRooms(); // Save on Abandonment Update


                        // If room is empty now, close it
                        if (room.players.length === 0) {
                            delete rooms[roomCode];
                            console.log(`Room ${roomCode} deleted (Game ended via abandonment & empty)`);
                            saveRooms(); // Save on Room Delete
                        }

                    }, 60000); // 60 Seconds
                }
            }

            // 3. Regular Player Logic (Only remove if NOT keeping spot)
            const player = room.players.find(p => p.id === socket.id);
            if (player) {
                // If Admin or Active Player with timeout, DO NOT REMOVE from array yet.
                const isAdmin = (room.admin === socket.id);
                const isProtected = isAdmin || (activeColor !== null);

                if (!isProtected) {
                    // Ordinary spectator or lobby player -> Bye
                    console.log(`Spectator/Old ID ${player.name} left.`);
                    const index = room.players.indexOf(player);
                    if (index !== -1) {
                        room.players.splice(index, 1);
                        // Clean slots (non-game time)
                        if (room.slots.white === player) room.slots.white = null;
                        if (room.slots.black === player) room.slots.black = null;

                        if (room.players.length === 0) {
                            // ONLY delete if NO game started (Double check)
                            if (!room.gameStarted) {
                                delete rooms[roomCode];
                                console.log(`Room ${roomCode} deleted (Last player left)`);
                                saveRooms(); // Save on Delete
                            } else {
                                console.log(`Room ${roomCode} retained causing pending game timeouts.`);
                            }
                        } else {
                            io.to(roomCode).emit('update_lobby', safeRoom(room));
                            saveRooms(); // Save on Player Left
                        }
                    }
                } else {
                    console.log(`Protected player ${player.name} disconnected. Kept in room.`);
                }
            }
        }
    }));

});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
