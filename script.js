const socket = io();

// HTML Elements
const screens = {
    login: document.getElementById('loginScreen'),
    menu: document.getElementById('menuScreen'),
    join: document.getElementById('joinScreen'),
    lobby: document.getElementById('lobbyScreen'),
    game: document.getElementById('gameScreen')
};

// Inputs & Buttons
const playerNameInput = document.getElementById('playerNameInput');
const loginBtn = document.getElementById('loginBtn');
const createRoomBtn = document.getElementById('createRoomBtn');
const joinRoomMenuBtn = document.getElementById('joinRoomMenuBtn');
const joinRoomBtn = document.getElementById('joinRoomBtn');
const backToMenuBtn = document.getElementById('backToMenuBtn');
const roomCodeInput = document.getElementById('roomCodeInput');
const joinError = document.getElementById('joinError');
const copyLinkBtn = document.getElementById('copyLinkBtn');

// Check URL Params
const urlParams = new URLSearchParams(window.location.search);
const urlRoomCode = urlParams.get('room');

// Lobby Elements
const displayRoomCode = document.getElementById('displayRoomCode');
const timeControlSelect = document.getElementById('timeControlSelect');

// Modal Elements
const customModal = document.getElementById('customModal');
const modalTitle = document.getElementById('modalTitle');
const modalMessage = document.getElementById('modalMessage');
const btnModalCancel = document.getElementById('btnModalCancel');
const btnModalOk = document.getElementById('btnModalOk');

function showModal(message, onOk, showCancel = false, onCancel = null) {
    modalMessage.innerText = message;
    modalTitle.innerText = showCancel ? "Confirmation" : "Notice";

    customModal.classList.remove('hidden');

    if (showCancel) {
        btnModalCancel.classList.remove('hidden');
    } else {
        btnModalCancel.classList.add('hidden');
    }

    // Clone buttons to remove old event listeners
    const newOk = btnModalOk.cloneNode(true);
    btnModalOk.parentNode.replaceChild(newOk, btnModalOk);

    const newCancel = btnModalCancel.cloneNode(true);
    btnModalCancel.parentNode.replaceChild(newCancel, btnModalCancel);

    // Re-assign global variables to new elements
    const currentOk = document.getElementById('btnModalOk');
    const currentCancel = document.getElementById('btnModalCancel');

    currentOk.onclick = () => {
        customModal.classList.add('hidden');
        if (onOk) onOk();
    };

    currentCancel.onclick = () => {
        customModal.classList.add('hidden');
        if (onCancel) onCancel();
    };
}

// Admin Context Menu
function showPlayerActions(player, x, y, inSlot = false) {
    // Remove existing menu
    const existing = document.querySelector('.admin-menu');
    if (existing) existing.remove();

    const menu = document.createElement('div');
    menu.className = 'admin-menu';
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;

    const title = document.createElement('div');
    title.className = 'menu-title';
    title.innerText = player.name;
    menu.appendChild(title);

    // Section 1: Movement / Assignment
    if (inSlot) {
        // Option: Move to Lobby (Unassign)
        const btnUnassign = document.createElement('button');
        btnUnassign.innerText = "Move to Lobby";
        btnUnassign.onclick = () => {
            // Find which slot they are in
            const slot = (currentRoom.slots.white && currentRoom.slots.white.id === player.id) ? 'white' : 'black';
            socket.emit('remove_from_slot', { roomCode: currentRoom.code, slot: slot });
            menu.remove();
        };
        menu.appendChild(btnUnassign);
    } else {
        // Option: Set White
        const btnWhite = document.createElement('button');
        btnWhite.innerText = "Set as White";
        btnWhite.onclick = () => {
            socket.emit('assign_slot', { roomCode: currentRoom.code, playerId: player.id, slot: 'white' });
            menu.remove();
        };
        menu.appendChild(btnWhite);

        // Option: Set Black
        const btnBlack = document.createElement('button');
        btnBlack.innerText = "Set as Black";
        btnBlack.onclick = () => {
            socket.emit('assign_slot', { roomCode: currentRoom.code, playerId: player.id, slot: 'black' });
            menu.remove();
        };
        menu.appendChild(btnBlack);
    }

    // Section 2: Shine Colors
    const shineSection = document.createElement('div');
    shineSection.style.borderTop = "1px solid rgba(255,255,255,0.1)";
    shineSection.style.marginTop = "5px";
    shineSection.style.paddingTop = "5px";

    const shineLabel = document.createElement('div');
    shineLabel.innerText = "Set Shine Color:";
    shineLabel.style.fontSize = "0.8rem";
    shineLabel.style.color = "#aaa";
    shineLabel.style.marginBottom = "5px";
    shineSection.appendChild(shineLabel);

    const colors = [
        { name: 'Gold', hex: '#ffd700' },
        { name: 'Red', hex: '#ff4b4b' },
        { name: 'Blue', hex: '#4488ff' },
        { name: 'Green', hex: '#81b64c' },
        { name: 'Purple', hex: '#9b59b6' },
        { name: 'Cyan', hex: '#00cec9' }
    ];

    const colorGrid = document.createElement('div');
    colorGrid.style.display = "grid";
    colorGrid.style.gridTemplateColumns = "repeat(3, 1fr)";
    colorGrid.style.gap = "5px";

    colors.forEach(c => {
        const btn = document.createElement('div');
        btn.style.backgroundColor = c.hex;
        btn.style.height = "20px";
        btn.style.borderRadius = "4px";
        btn.style.cursor = "pointer";
        btn.title = c.name;
        btn.onclick = () => {
            socket.emit('set_shine_color', { roomCode: currentRoom.code, playerId: player.id, color: c.hex });
            menu.remove();
        };
        colorGrid.appendChild(btn);
    });
    shineSection.appendChild(colorGrid);

    // Remove Shine Button
    if (player.shineColor || player.isShining) {
        const btnRemove = document.createElement('button');
        btnRemove.innerText = "Remove Shine";
        btnRemove.style.width = "100%";
        btnRemove.style.marginTop = "5px";
        btnRemove.style.background = "rgba(255, 68, 68, 0.2)";
        btnRemove.style.color = "#ff4444";
        btnRemove.onclick = () => {
            socket.emit('set_shine_color', { roomCode: currentRoom.code, playerId: player.id, color: null });
            menu.remove();
        };
        shineSection.appendChild(btnRemove);
    }
    menu.appendChild(shineSection);

    // Section 3: Kick Player (Red)
    // Don't allow kicking yourself (Admin)
    if (player.id !== currentRoom.admin) {
        const btnKick = document.createElement('button');
        btnKick.innerText = "Kick Player";
        btnKick.style.marginTop = "8px";
        btnKick.style.background = "#ff4444";
        btnKick.style.color = "white";
        btnKick.style.fontWeight = "bold";
        btnKick.onclick = () => {
            showModal(`Are you sure you want to kick ${player.name}?`, () => {
                socket.emit('kick_player', { roomCode: currentRoom.code, playerId: player.id });
            }, true);
            menu.remove();
        };
        menu.appendChild(btnKick);
    }

    document.body.appendChild(menu);

    // Close on click outside
    setTimeout(() => {
        document.addEventListener('click', function closeMenu(e) {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        });
    }, 0);
}

const playerListEl = document.getElementById('playerList');
const slotWhite = document.getElementById('slotWhite');
const slotBlack = document.getElementById('slotBlack');
const startGameBtn = document.getElementById('startGameBtn');
const adminMsg = document.getElementById('adminMsg');
const waitingText = document.getElementById('waitingText');

// Game Elements
const boardElement = document.getElementById('chessBoard');
const turnIndicator = document.getElementById('turnIndicator');
const gameRoomCode = document.getElementById('gameRoomCode');
const playerRoleDisplay = document.getElementById('playerRoleDisplay');

// State
let myName = '';
let myId = '';
let currentRoom = null;
let isAdmin = false;
let selectedPlayerId = null; // For Admin assignment
let myColor = null; // 'w' or 'b' or null (spectator)
let isGameActive = false;
let hasGameEnded = false; // NEW: Track if game finished to show "View Last Grame"
let game = new Chess();
let adminToken = null; // Store locally for reconnection
let playerToken = null; // Store locally for reconnection

const pieceSymbols = {
    'k': 'https://upload.wikimedia.org/wikipedia/commons/f/f0/Chess_kdt45.svg',
    'q': 'https://upload.wikimedia.org/wikipedia/commons/4/47/Chess_qdt45.svg',
    'r': 'https://upload.wikimedia.org/wikipedia/commons/f/ff/Chess_rdt45.svg',
    'b': 'https://upload.wikimedia.org/wikipedia/commons/9/98/Chess_bdt45.svg',
    'n': 'https://upload.wikimedia.org/wikipedia/commons/e/ef/Chess_ndt45.svg',
    'p': 'https://upload.wikimedia.org/wikipedia/commons/c/c7/Chess_pdt45.svg',
    'K': 'https://upload.wikimedia.org/wikipedia/commons/4/42/Chess_klt45.svg',
    'Q': 'https://upload.wikimedia.org/wikipedia/commons/1/15/Chess_qlt45.svg',
    'R': 'https://upload.wikimedia.org/wikipedia/commons/7/72/Chess_rlt45.svg',
    'B': 'https://upload.wikimedia.org/wikipedia/commons/b/b1/Chess_blt45.svg',
    'N': 'https://upload.wikimedia.org/wikipedia/commons/7/70/Chess_nlt45.svg',
    'P': 'https://upload.wikimedia.org/wikipedia/commons/4/45/Chess_plt45.svg'
};

// Audio Effects
const sounds = {
    move: new Audio('move.mp3'),
    capture: new Audio('capture.mp3'),
    castle: new Audio('castle.mp3'),
    checkmate: new Audio('checkmate.mp3')
};

const pieceValues = {
    'p': 1,
    'n': 3,
    'b': 3,
    'r': 5,
    'q': 9, // User requested 9
    'k': 0  // King value not counted for material
};

// Dashboard Elements
const oppNameDisplay = document.getElementById('oppNameDisplay');
const oppCaptured = document.getElementById('oppCaptured');
const oppAdvantage = document.getElementById('oppAdvantage');
const oppTimer = document.getElementById('oppTimer');

const myNameDisplay = document.getElementById('myNameDisplay');
const myCaptured = document.getElementById('myCaptured');
const myAdvantage = document.getElementById('myAdvantage');
const myTimer = document.getElementById('myTimer');

const gameRoomCodeDisplay = document.getElementById('gameRoomCodeDisplay');

// Controls Elements
const btnPrev = document.getElementById('btnPrev');
const btnNext = document.getElementById('btnNext');
const actionControls = document.getElementById('actionControls');
const btnDraw = document.getElementById('btnDraw');
const btnResign = document.getElementById('btnResign');
const btnPGN = document.getElementById('btnPGN');
const returnToLobbyBtn = document.getElementById('returnToLobbyBtn');
const backToGameBtn = document.getElementById('backToGameBtn');

let selectedSquare = null;
let timerInterval = null;
let whiteTime = 600; // 10 minutes in seconds
let blackTime = 600;
let lastMoveTime = Date.now();

// History State
let currentViewIndex = -1; // -1 means live. 0 to N-1 for history.

// History Listeners
btnPrev.addEventListener('click', () => goToMove(currentViewIndex - 1));
btnNext.addEventListener('click', () => goToMove(currentViewIndex + 1));

// PGN Button Listener
if (btnPGN) {
    btnPGN.addEventListener('click', () => {
        const pgn = game.pgn();
        navigator.clipboard.writeText(pgn).then(() => {
            showToast("PGN Copied to Clipboard!");
        }).catch(err => {
            console.error('Failed to copy PGN: ', err);
            showToast("Failed to copy PGN");
        });
    });
}

if (returnToLobbyBtn) {
    returnToLobbyBtn.addEventListener('click', () => {
        showScreen('lobby');
        // Optional: Notify server to reset 'gameStarted' completely if not already?
        // Actually server resets it on game_over.
        // But maybe we want to enable lobby controls for admin again
        // renderLobby is driven by socket updates.
    });
}

if (backToGameBtn) {
    backToGameBtn.addEventListener('click', () => {
        showScreen('game');
    });
}

function goLive() {
    currentViewIndex = -1;
    renderBoard();
}

function goToMove(index) {
    const history = game.history();
    const maxIndex = history.length - 1;

    // Bounds check
    // If index < -1, set to -1 (live) or clamp?
    // Let's say index -1 is start (nothing)? No.
    // Standard: 
    // -1 = Live (All moves).
    // 0 = After 1st move.
    // -1 logic is complex. Let's use:
    // viewIndex: number of moves to show.
    // Max = history.length.
    // If viewIndex == history.length, it's LIVE.

    // Redefine:
    // currentViewIndex = -1 (Flag for LIVE Tracking).
    // specific number = Showing that many moves.

    // When clicking Prev from Live:
    if (currentViewIndex === -1) {
        currentViewIndex = history.length - 1;
    } else {
        currentViewIndex = index;
    }

    // Clamp
    if (currentViewIndex < 0) currentViewIndex = 0; // Show start board? 0 moves = empty board?
    // Let's say 0 = initial position.

    if (currentViewIndex > history.length) {
        currentViewIndex = -1; // Go Live
    }

    renderBoard();
}

function playSound(move) {
    if (!move) return;

    // Checkmate has priority
    if (game.in_checkmate()) {
        sounds.checkmate.currentTime = 0;
        sounds.checkmate.play().catch(e => console.warn("Audio blocked", e));
        return;
    }

    // Capture (flags contains 'c' or 'e')
    if (move.flags.includes('c') || move.flags.includes('e')) {
        sounds.capture.currentTime = 0;
        sounds.capture.play().catch(e => console.warn("Audio blocked", e));
        return;
    }

    // Castle (flags contains 'k' or 'q')
    if (move.flags.includes('k') || move.flags.includes('q')) {
        sounds.castle.currentTime = 0;
        sounds.castle.play().catch(e => console.warn("Audio blocked", e));
        return;
    }

    // Standard Move
    sounds.move.currentTime = 0;
    sounds.move.play().catch(e => console.warn("Audio blocked", e));
}

// Toast Helper
function showToast(msg, duration = 2000) {
    const toast = document.createElement('div');
    toast.innerText = msg;
    toast.style.position = 'absolute';
    toast.style.top = '10%'; // Top center
    toast.style.left = '50%';
    toast.style.transform = 'translate(-50%, 0)';
    toast.style.background = 'rgba(0,0,0,0.85)';
    toast.style.color = '#fff';
    toast.style.padding = '10px 20px';
    toast.style.borderRadius = '8px';
    toast.style.border = '1px solid #81b64c';
    toast.style.zIndex = '1000';
    toast.style.fontWeight = 'bold';
    toast.style.boxShadow = '0 0 15px rgba(0,0,0,0.5)';
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.transition = 'opacity 0.5s';
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 500);
    }, duration);
}

// Resign/Draw Listeners
btnResign.addEventListener('click', () => {
    // Custom Resign Modal
    const modal = document.createElement('div');
    modal.className = 'screen active';
    modal.style.background = 'rgba(0,0,0,0.8)';
    modal.style.zIndex = '200';
    modal.innerHTML = `
        <div class="glass-card" style="min-width: 300px;">
            <h2>Resign Game?</h2>
            <p style="margin: 15px 0 20px; color: #ccc;">Are you sure you want to give up?</p>
            <div style="display: flex; gap: 15px; justify-content: center;">
                <button id="btnCancelResign" class="glow-btn outline" style="border-color: #888; color: #ccc;">Cancel</button>
                <button id="btnConfirmResign" class="glow-btn" style="background: linear-gradient(135deg, #ff4b4b, #d42e2e); box-shadow: 0 0 10px #ff4b4b;">Resign</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('btnCancelResign').onclick = () => {
        modal.remove();
    };

    document.getElementById('btnConfirmResign').onclick = () => {
        socket.emit('resign', currentRoom.code);
        modal.remove();
    };
});

let lastDrawOfferTime = 0;

btnDraw.addEventListener('click', () => {
    const now = Date.now();
    const cooldown = 15000; // 15 Seconds
    const elapsed = now - lastDrawOfferTime;

    if (elapsed < cooldown) {
        const remaining = Math.ceil((cooldown - elapsed) / 1000);
        showToast(`Wait ${remaining}s to offer draw again.`);
        return;
    }

    lastDrawOfferTime = now;
    socket.emit('offer_draw', currentRoom.code);
    showToast("Offer sent", 2000);
});


// ============================================
// UI NAVIGATION
// ============================================

// ... (existing code) ...

// AFTER move_made in socket events:

socket.on('draw_offered', () => {
    if (!myColor) return; // Ignore spectators

    // Custom Modal for Accept/Reject
    const modal = document.createElement('div');
    modal.className = 'screen active';
    modal.style.background = 'rgba(0,0,0,0.8)';
    modal.style.zIndex = '200';
    modal.innerHTML = `
        <div class="glass-card" style="min-width: 300px;">
            <h2>Finish the game?</h2>
            <p style="margin: 15px 0 20px;">Opponent wants to draw.</p>
            <div style="display: flex; gap: 10px; justify-content: center;">
                <button class="glow-btn outline btn-reject" style="border-color: #ff6b6b; color: #ff6b6b;">Reject</button>
                <button class="glow-btn btn-accept">Accept</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    // Use scoped selectors to avoid ID conflicts
    modal.querySelector('.btn-reject').onclick = () => {
        if (currentRoom && currentRoom.code) {
            socket.emit('reject_draw', currentRoom.code);
        }
        modal.remove();
    };

    modal.querySelector('.btn-accept').onclick = () => {
        if (currentRoom && currentRoom.code) {
            socket.emit('accept_draw', currentRoom.code);
        }
        modal.remove();
    };
});

socket.on('draw_rejected', () => {
    // Neutral message for everyone
    showToast("Draw offer was rejected", 2000);
});

socket.on('game_over', ({ reason, winner, message, fen, lastMove }) => {
    // If final state provided, ensure we are consistent.
    if (fen && game.fen() !== fen) {
        // Try to apply last move to preserve history (NON-DESTRUCTIVE)
        let moveApplied = false;
        if (lastMove) {
            try {
                const result = game.move(lastMove);
                if (result) moveApplied = true;
            } catch (e) {
                // Ignore error, fallback to load
            }
        }

        // If move failed or didn't reach final state, force load (DESTRUCTIVE fallback)
        if (!moveApplied || game.fen() !== fen) {
            console.warn("Syncing board state (History may be reset)");
            game.load(fen);
        }

        renderBoard();
        currentViewIndex = -1; // Ensure live
    }

    isGameActive = false;
    hasGameEnded = true;
    if (timerInterval) clearInterval(timerInterval);

    // Show PGN Button & Return to Lobby
    if (btnPGN) btnPGN.classList.remove('hidden');
    if (returnToLobbyBtn) returnToLobbyBtn.classList.remove('hidden');

    // Standard Message for Popup (2s)
    let title = "";
    if (winner === 'Draw') {
        title = "Draw!";
    } else {
        title = `${winner} Wins!`;
    }

    // Personal subtext for context, but Title is uniform as requested
    let subtext = reason;

    turnIndicator.innerText = `${title} (${subtext})`;

    // If Disconnect (Warning), Do NOT show popup
    // BUT if reason is 'Abandonment', we DO want to show popup now.
    // 'disconnect' logic usually came from `player_disconnected_game` event for warnings.
    // The `game_over` reason 'Abandonment' means they actually lost.

    // We only skip if it's the *Warning* phase (which isn't game_over).
    // So actually, if reason is 'Abandonment', let it fall through to popup.
    // If reason is just "Player Disconnected" (Warning) - that's not a game_over event usually.
    // server.js emits 'game_over' only on Abandonment or Resignation/Checkmate/Timeout.

    // So we remove the block:
    // if (reason.toLowerCase().includes('disconnect')) return; 

    // However, let's keep it safe. If reason says "Abandonment", show popup.
    if (reason.toLowerCase().includes('disconnect') && !reason.toLowerCase().includes('abandonment')) return;

    // STEP 1: Show Winner Popup (2 Seconds)
    const postGameModal = document.createElement('div');
    postGameModal.className = 'screen active';
    postGameModal.style.background = 'rgba(0,0,0,0.85)';
    postGameModal.style.zIndex = '100';

    // Initial Content
    const titleColor = (winner === 'White') ? '#fff' : (winner === 'Black' ? '#aaa' : '#ffcc00');

    postGameModal.innerHTML = `
        <div class="glass-card" id="postGameCard">
            <h1 style="font-size: 3rem; margin-bottom: 10px; color: ${titleColor};">${title}</h1>
            <h2 style="color: #aaa;">${subtext}</h2>
        </div>
    `;
    document.body.appendChild(postGameModal);

    // STEP 2: Auto-close popup after 2 seconds, STAY ON BOARD.
    setTimeout(() => {
        if (postGameModal.parentNode) postGameModal.parentNode.removeChild(postGameModal);
        // User stays on board. No navigation options added.
    }, 2000);
});

function showScreen(screenName) {
    Object.values(screens).forEach(s => {
        s.classList.remove('active');
        s.classList.add('hidden');
    });
    screens[screenName].classList.remove('hidden');
    screens[screenName].classList.add('active');
}

// ============================================
// EVENT LISTENERS (UI)
// ============================================

loginBtn.addEventListener('click', () => {
    const name = playerNameInput.value.trim();
    if (name) {
        myName = name;

        if (urlRoomCode) {
            // Joiner Flow: Skip Menu, go to Join
            roomCodeInput.value = urlRoomCode;
            roomCodeInput.disabled = true; // Lock it
            backToMenuBtn.style.display = 'none'; // No going back to menu
            showScreen('join');
            // Auto click join? Maybe let them click join to confirm name.
        } else {
            // Creator Flow: Normal Menu
            showScreen('menu');
        }
    }
});

createRoomBtn.addEventListener('click', () => {
    socket.emit('create_room', myName);
});

joinRoomMenuBtn.addEventListener('click', () => {
    showScreen('join');
});

backToMenuBtn.addEventListener('click', () => {
    showScreen('menu');
});

joinRoomBtn.addEventListener('click', () => {
    const code = roomCodeInput.value.trim();
    if (code.length === 6) {
        // Try to retrieve tokens
        const storedAdminToken = localStorage.getItem(`adminToken_${code}`);
        const storedPlayerToken = localStorage.getItem(`playerToken_${code}`);

        socket.emit('join_room', {
            roomCode: code,
            playerName: myName,
            adminToken: storedAdminToken,
            playerToken: storedPlayerToken
        });
    } else {
        joinError.innerText = "Please enter a valid 6-digit code";
    }
});

if (copyLinkBtn) {
    copyLinkBtn.addEventListener('click', () => {
        if (currentRoom) {
            const link = `${window.location.origin}/?room=${currentRoom.code}`;
            navigator.clipboard.writeText(link).then(() => {
                showToast("Link Copied!");
            }).catch(err => {
                console.error('Failed to copy: ', err);
                showToast("Failed to copy");
            });
        }
    });
}

// Admin Lobby Controls
if (returnToLobbyBtn) {
    returnToLobbyBtn.onclick = () => {
        showScreen('lobby');
        // Re-render lobby to ensure everything is fresh
        if (currentRoom) {
            renderLobby(currentRoom);
        }
    };
}

startGameBtn.addEventListener('click', () => {
    if (isAdmin && currentRoom) {
        const duration = parseInt(timeControlSelect.value) || 7; // Default 7
        socket.emit('start_game', { roomCode: currentRoom.code, duration });
    }
});

// Slot Click Handling (Assignment & Unified Menu)
function handleSlotClick(slotColor, event) {
    if (!isAdmin) return;

    // Check if slot is already filled
    const playerInSlot = currentRoom.slots[slotColor];

    if (playerInSlot) {
        // Open Unified Admin Menu for this player (inSlot = true)
        showPlayerActions(playerInSlot, event.pageX, event.pageY, true);
    } else {
        // Assign selected player
        if (!selectedPlayerId) {
            alert("Select a player from the list first!");
            return;
        }
        socket.emit('assign_slot', {
            roomCode: currentRoom.code,
            playerId: selectedPlayerId,
            slot: slotColor
        });
        // Deselect after assign
        selectedPlayerId = null;
        renderLobby(currentRoom);
    }
}

slotWhite.addEventListener('click', (e) => handleSlotClick('white', e));
slotBlack.addEventListener('click', (e) => handleSlotClick('black', e));


// ============================================
// SOCKET EVENTS
// ============================================

socket.on('connect', () => {
    myId = socket.id;
    console.log('Connected with ID:', myId);

    // Auto-Rejoin if we were already in a room (Network Glitch / Reconnect)
    if (currentRoom && myName) {
        console.log("Attempting to auto-rejoin...", currentRoom.code);
        const storedAdminToken = localStorage.getItem(`adminToken_${currentRoom.code}`);
        const storedPlayerToken = localStorage.getItem(`playerToken_${currentRoom.code}`);

        socket.emit('join_room', {
            roomCode: currentRoom.code,
            playerName: myName, // Re-send name
            adminToken: storedAdminToken,
            playerToken: storedPlayerToken
        });
    }
});

socket.on('room_created', ({ roomCode, isAdmin: adminStatus, adminToken: aToken, playerToken: pToken }) => {
    isAdmin = adminStatus;
    // Save Admin Token
    if (aToken) {
        adminToken = aToken;
        localStorage.setItem(`adminToken_${roomCode}`, aToken);
    }
    // Save Player Token (Everyone gets one)
    if (pToken) {
        playerToken = pToken;
        localStorage.setItem(`playerToken_${roomCode}`, pToken);
    }
    showScreen('lobby');
});

socket.on('joined_room', ({ roomCode, isAdmin: adminStatus, adminToken: aToken, playerToken: pToken }) => {
    isAdmin = adminStatus;
    // Save Admin Token if provided (reclaimed)
    if (aToken) {
        adminToken = aToken;
        localStorage.setItem(`adminToken_${roomCode}`, aToken);
    }
    // Save Player Token
    if (pToken) {
        playerToken = pToken;
        localStorage.setItem(`playerToken_${roomCode}`, pToken);
    }
    showScreen('lobby');
});

// NEW: Player Disconnect Warning
socket.on('player_disconnected_game', ({ color, time }) => {
    showToast(`${color} has disconnected. Waiting ${time}s...`, 5000);

    // Add a visual countdown on the board or info panel
    // Simple approach: Update the Name Display temporarily
    const displayEl = (color === 'White') ? document.getElementById('myNameDisplay') : document.getElementById('oppNameDisplay');
    // Note: This depends on perspective. 
    // We should ideally check myColor vs color.

    let targetEl = null;
    // If I am White, opponent is Black. 
    if (myColor === 'w') {
        if (color === 'Black') targetEl = oppNameDisplay;
    } else if (myColor === 'b') {
        if (color === 'White') targetEl = oppNameDisplay;
    } else {
        // Spectator
        if (color === 'White') targetEl = myNameDisplay; // White uses bottom slots in spectator
        if (color === 'Black') targetEl = oppNameDisplay;
    }

    if (targetEl) {
        const originalText = targetEl.innerText;
        targetEl.dataset.originalText = originalText; // Store original

        let timeLeft = time;
        targetEl.innerText = `${originalText} (Reconnecting... ${timeLeft})`;
        targetEl.style.color = '#ff4444'; // Red warning

        // Clear any existing interval on this element
        if (targetEl.disconnectInterval) clearInterval(targetEl.disconnectInterval);

        targetEl.disconnectInterval = setInterval(() => {
            timeLeft--;
            if (timeLeft <= 0) {
                targetEl.innerText = `${originalText} (Abandoned)`;
                clearInterval(targetEl.disconnectInterval);
            } else {
                targetEl.innerText = `${originalText} (Reconnecting... ${timeLeft})`;
            }
        }, 1000);
    }
});

socket.on('player_reconnected_game', ({ color }) => {
    showToast(`${color} has reconnected!`, 3000);

    // Restore Name Display
    let targetEl = null;
    if (myColor === 'w') {
        if (color === 'Black') targetEl = oppNameDisplay;
    } else if (myColor === 'b') {
        if (color === 'White') targetEl = oppNameDisplay;
    } else {
        if (color === 'White') targetEl = myNameDisplay;
        if (color === 'Black') targetEl = oppNameDisplay;
    }

    if (targetEl && targetEl.dataset.originalText) {
        clearInterval(targetEl.disconnectInterval);
        targetEl.innerText = targetEl.dataset.originalText;
        targetEl.style.color = ''; // Reset color
    }
});

socket.on('error_message', (msg) => {
    if (msg === 'Invalid Room Code') {
        if (isGameActive) {
            isGameActive = false;
            if (timerInterval) clearInterval(timerInterval);
            showModal("Game Session Terminated: Room no longer exists (Server may have restarted).", () => {
                location.reload(); // Reload to clear state
            });
        } else {
            // If in lobby/join screen
            if (screens.join.classList.contains('active')) {
                joinError.innerText = msg;
            } else {
                alert(msg);
            }
        }
        return;
    }

    if (screens.join.classList.contains('active')) {
        joinError.innerText = msg;
    } else {
        alert(msg);
    }
});

socket.on('join_error', (msg) => {
    joinError.innerText = msg;
});

socket.on('kicked', () => {
    showModal("You have been kicked from the room.", () => {
        location.reload();
    });
});

socket.on('room_closed', () => {
    showModal("The Admin has left. The room is closed.", () => {
        location.reload();
    });
});

function resetToMain() {
    mainMenu.classList.remove('hidden');
    lobbyScreen.classList.add('hidden');
    gameScreen.classList.add('hidden');
    joinError.innerText = "";
    currentRoom = null;
    currentViewIndex = 0;
}

socket.on('update_lobby', (room) => {
    currentRoom = room;

    // SYNC FIX: Failsafe Game Over ID detection
    if (isGameActive && !room.gameStarted) {
        console.warn("Client Game Active but Server says Game Over. Forcing Sync.");
        // Force cleanup if we missed the game_over event
        isGameActive = false;
        hasGameEnded = true;
        if (timerInterval) clearInterval(timerInterval);

        turnIndicator.innerText = "Game Over (Sync)";
        if (btnPGN) btnPGN.classList.remove('hidden');
        showToast("Game Ended (synced with server)");
    }

    renderLobby(room);
});

socket.on('game_started', ({ whitePlayerId, blackPlayerId, whiteTime: wT, blackTime: bT }) => {
    isGameActive = true;
    showScreen('game');
    gameRoomCodeDisplay.innerText = "Room: " + currentRoom.code;

    // Determine Role & Names
    let opponentId = null;
    let myRoleStr = '';

    if (myId === whitePlayerId) {
        myColor = 'w';
        myRoleStr = "Playing as White";
        opponentId = blackPlayerId;
    } else if (myId === blackPlayerId) {
        myColor = 'b';
        myRoleStr = "Playing as Black";
        opponentId = whitePlayerId;
    } else {
        myColor = null;
        myRoleStr = "Spectating";
        // Spectator view: White bottom, Black top
        opponentId = blackPlayerId; // "Opponent" is Black
        // Needs adjustment for spectator names but simpler MVP:
    }

    // Set Names
    if (myColor === null) {
        // Spectator View: White at bottom, Black at top
        const whiteP = currentRoom.players.find(p => p.id === whitePlayerId);
        const blackP = currentRoom.players.find(p => p.id === blackPlayerId);

        myNameDisplay.innerText = whiteP ? whiteP.name : "White";
        oppNameDisplay.innerText = blackP ? blackP.name : "Black";

        // Optional: Update avatars or labels to indicate these aren't "Me"
        // But for now, names are critical.
        if (actionControls) actionControls.classList.add('hidden');
    } else {
        // Player View
        const myPlayer = currentRoom.players.find(p => p.id === myId);
        if (myPlayer) myNameDisplay.innerText = myPlayer.name;
        if (actionControls) actionControls.classList.remove('hidden');

        if (opponentId) {
            const oppPlayer = currentRoom.players.find(p => p.id === opponentId);
            if (oppPlayer) oppNameDisplay.innerText = oppPlayer.name;
        }
    }



    game.reset();
    if (btnPGN) btnPGN.classList.add('hidden'); // Hide PGN at start of new game
    if (returnToLobbyBtn) returnToLobbyBtn.classList.add('hidden'); // Hide Lobby Btn
    whiteTime = wT || 420; // Default to 7m if missing
    blackTime = bT || 420;
    updateTurnIndicator();
    renderBoard();
    updateMaterial();     // NEW
    startTimers();        // NEW
    updateDashboardUI();  // NEW
});

socket.on('reconnect_game', ({ roomCode, whitePlayerId, blackPlayerId, whiteName, blackName, fen, whiteTime: wT, blackTime: bT, turn, whiteDisconnected, blackDisconnected, pgn }) => {
    isGameActive = true;
    showScreen('game');

    // SAFETY: Use payload roomCode, avoid crashing if currentRoom is null
    gameRoomCodeDisplay.innerText = "Room: " + roomCode;
    if (!currentRoom) {
        currentRoom = { code: roomCode, players: [] };
        console.log("Recovered currentRoom from reconnect payload");
    }

    // Determine Role
    let myRoleStr = '';
    if (myId === whitePlayerId) {
        myColor = 'w';
    } else if (myId === blackPlayerId) {
        myColor = 'b';
    } else {
        myColor = null; // Spectator
    }

    // Helper for Name Formatting
    const formatName = (name, isDisc) => isDisc ? `${name} (Reconnecting...)` : name;

    const wNameDisplay = formatName(whiteName, whiteDisconnected);
    const bNameDisplay = formatName(blackName, blackDisconnected);

    // Update UI based on Role
    if (myColor === null) {
        // SPECTATOR: White at bottom, Black at top
        myNameDisplay.innerText = wNameDisplay; // "My" side (Bottom)
        myNameDisplay.dataset.originalText = whiteName; // Fix: Store Original

        oppNameDisplay.innerText = bNameDisplay; // "Opp" side (Top)
        oppNameDisplay.dataset.originalText = blackName; // Fix: Store Original

        if (whiteDisconnected) myNameDisplay.style.color = '#ff4444';
        else myNameDisplay.style.color = '';

        if (blackDisconnected) oppNameDisplay.style.color = '#ff4444';
        else oppNameDisplay.style.color = '';

        if (actionControls) actionControls.classList.add('hidden');
    }
    else if (myColor === 'w') {
        // I AM WHITE
        myNameDisplay.innerText = wNameDisplay;
        myNameDisplay.dataset.originalText = whiteName; // Fix: Store Original

        oppNameDisplay.innerText = bNameDisplay;
        oppNameDisplay.dataset.originalText = blackName; // Fix: Store Original

        if (whiteDisconnected) myNameDisplay.style.color = '#ff4444';
        else myNameDisplay.style.color = '';

        if (blackDisconnected) oppNameDisplay.style.color = '#ff4444';
        else oppNameDisplay.style.color = '';

        if (actionControls) actionControls.classList.remove('hidden');
    }
    else if (myColor === 'b') {
        // I AM BLACK
        myNameDisplay.innerText = bNameDisplay;
        myNameDisplay.dataset.originalText = blackName; // Fix: Store Original

        oppNameDisplay.innerText = wNameDisplay; // Opp is White
        oppNameDisplay.dataset.originalText = whiteName; // Fix: Store Original

        if (blackDisconnected) myNameDisplay.style.color = '#ff4444';
        else myNameDisplay.style.color = '';

        if (whiteDisconnected) oppNameDisplay.style.color = '#ff4444';
        else oppNameDisplay.style.color = '';

        if (actionControls) actionControls.classList.remove('hidden');
    }

    // Restore State
    // FIX: Try to load PGN first (for history), fallback to FEN
    if (pgn) {
        console.log("Loading game from PGN (History enabled)");
        const result = game.load_pgn(pgn);
        if (!result) {
            console.warn("PGN Load failed, falling back to FEN");
            game.load(fen);
        }
    } else {
        console.warn("No PGN provided, loading exact state from FEN (No history)");
        game.load(fen);
    }

    whiteTime = wT;
    blackTime = bT;

    updateTurnIndicator();
    renderBoard();
    updateMaterial();
    startTimers();
    updateDashboardUI();
});

socket.on('move_made', ({ move, fen, whiteTime: wT, blackTime: bT }) => {
    // 1. Attempt to apply the move locally (for animation/sound)
    // We try this regardless of FEN check to ensure animation fires if possible.
    try {
        const result = game.move(move);
        if (result) playSound(result);
    } catch (e) {
        // Move might be invalid if we are the sender (already moved) or desynced
    }

    // 2. Strong Sync Validation
    // If our state does not match the server's authoritative FEN, force load.
    if (fen && game.fen() !== fen) {
        console.warn("Syncing board state to server FEN");
        game.load(fen);
    }

    // 3. Sync Timers (Authoritative from Server)
    if (wT !== undefined) whiteTime = wT; // Keep precise float
    if (bT !== undefined) blackTime = bT;

    // 4. Reset Timer Loop to align with this receipt time
    startTimers();

    // 5. Update UI
    currentViewIndex = -1; // Snap to live
    updateTurnIndicator();
    renderBoard();
    updateMaterial();
    updateDashboardUI();
});


// ============================================
// RENDER LOBBY
// ============================================

function renderLobby(room) {
    // Ensure admin state is current
    if (socket && socket.id) {
        isAdmin = (room.admin === socket.id);
    }
    console.log("Rendering Lobby. Room:", room);
    console.log("Players:", room.players);
    console.log("Slots:", room.slots);

    displayRoomCode.innerText = room.code;

    // Player List
    playerListEl.innerHTML = '';
    room.players.forEach(p => {
        // FILTER: Don't show if assigned to a slot
        const isWhite = room.slots.white && room.slots.white.id === p.id;
        const isBlack = room.slots.black && room.slots.black.id === p.id;
        if (isWhite || isBlack) return;

        const li = document.createElement('li');
        li.innerText = p.name + (p.id === room.admin ? ' (Admin)' : '');

        if (p.shineColor) {
            li.classList.add('shining');
            li.style.setProperty('--shine-color', p.shineColor);
        } else if (p.isShining) {
            // Backwards compatibility or default "Gold" if old toggle used
            li.classList.add('shining');
            li.style.setProperty('--shine-color', '#ffd700');
        }

        // Selection Logic for Admin (Context Menu)
        if (isAdmin) {
            li.style.cursor = 'pointer';
            li.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent bubbling
                showPlayerActions(p, e.clientX, e.clientY);
            });
        }
        playerListEl.appendChild(li);
    });

    // Slots
    updateSlotUI(slotWhite, room.slots.white);
    updateSlotUI(slotBlack, room.slots.black);

    // Slots
    updateSlotUI(slotWhite, room.slots.white);
    updateSlotUI(slotBlack, room.slots.black);

    // Controls
    if (isAdmin) {
        adminMsg.style.display = 'block';
        waitingText.style.display = 'none';
        startGameBtn.style.display = 'inline-block';
        timeControlSelect.style.display = 'inline-block'; // Show dropdown

        // Enable start only if both slots filled
        if (room.slots.white && room.slots.black) {
            startGameBtn.disabled = false;
            startGameBtn.classList.remove('disabled');
        } else {
            startGameBtn.disabled = true;
            startGameBtn.classList.add('disabled');
        }
    } else {
        adminMsg.style.display = 'none';
        waitingText.style.display = 'block';
        startGameBtn.style.display = 'none';
        timeControlSelect.style.display = 'none'; // Hide dropdown
    }

    // Back to Game Button Logic
    if (backToGameBtn) {
        if (room.gameStarted) {
            backToGameBtn.classList.remove('hidden');
        } else {
            backToGameBtn.classList.add('hidden');
        }
    }
}

function updateSlotUI(slotEl, player) {
    const nameEl = slotEl.querySelector('.slot-player');
    if (player) {
        slotEl.classList.add('filled');
        nameEl.innerText = player.name;
    } else {
        slotEl.classList.remove('filled');
        nameEl.innerText = 'Empty';
    }
}


// ============================================
// TIMER & MATERIAL LOGIC
// ============================================

// Timer & Material Logic
let lastTimerSync = 0; // Timestamp of last server sync

function startTimers() {
    if (timerInterval) clearInterval(timerInterval);
    lastTimerSync = Date.now();

    timerInterval = setInterval(() => {
        if (!isGameActive || game.game_over()) {
            clearInterval(timerInterval);
            return;
        }

        const turn = game.turn();
        const now = Date.now();
        const elapsed = (now - lastTimerSync) / 1000;

        let curWhite = whiteTime;
        let curBlack = blackTime;

        if (turn === 'w') {
            curWhite = Math.max(0, whiteTime - elapsed);
        } else {
            curBlack = Math.max(0, blackTime - elapsed);
        }

        updateDashboardUI(curWhite, curBlack);

        if (curWhite <= 0 || curBlack <= 0) {
            clearInterval(timerInterval);
            handleFlagFall(curWhite <= 0 ? 'white' : 'black');
        }
    }, 100);
}

function handleFlagFall(loser) {
    // Passive Logic: Do NOT end game locally. Wait for server.
    // Just show a status that we are waiting.
    // isGameActive = false; // keep it active so we don't freeze interaction if it's lag
    // However, timer is stopped at 0.

    // Check if I am the one who lost?
    // If local time says I lost, I probably lost.
    // If local time says Opponent lost, it might be lag.

    // We just update the text and wait.
    let possibleWinner = (loser === 'white') ? 'Black' : 'White';
    turnIndicator.innerHTML = `Time Expired. Syncing with Server...`;
}

function updateDashboardUI(curWhite = whiteTime, curBlack = blackTime) {
    const wStr = formatTime(Math.ceil(curWhite));
    const bStr = formatTime(Math.ceil(curBlack));

    if (myColor === 'b') {
        myTimer.innerText = bStr;
        oppTimer.innerText = wStr;

        myTimer.classList.toggle('active', game.turn() === 'b');
        oppTimer.classList.toggle('active', game.turn() === 'w');

        myTimer.classList.toggle('low-time', curBlack < 30);
        oppTimer.classList.toggle('low-time', curWhite < 30);
    } else {
        myTimer.innerText = wStr;
        oppTimer.innerText = bStr;

        myTimer.classList.toggle('active', game.turn() === 'w');
        oppTimer.classList.toggle('active', game.turn() === 'b');

        myTimer.classList.toggle('low-time', curWhite < 30);
        oppTimer.classList.toggle('low-time', curBlack < 30);
    }
}

function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
}

function updateMaterial() {
    const board = game.board();
    let whiteMaterial = 0;
    let blackMaterial = 0;

    // Count material on board
    const currentPieces = { w: [], b: [] };

    board.forEach(row => {
        row.forEach(piece => {
            if (piece) {
                const val = pieceValues[piece.type] || 0;
                if (piece.color === 'w') {
                    whiteMaterial += val;
                    currentPieces.w.push(piece.type);
                } else {
                    blackMaterial += val;
                    currentPieces.b.push(piece.type);
                }
            }
        });
    });

    // Calculate Captured Pieces (Start set - Current set)
    // Standard set: 8P, 2N, 2B, 2R, 1Q, 1K (K ignored)
    const startSet = ['p', 'p', 'p', 'p', 'p', 'p', 'p', 'p', 'n', 'n', 'b', 'b', 'r', 'r', 'q'];

    // Helper to find diff
    const getCaptured = (current, color) => {
        const captured = [];
        const currentCounts = {};
        current.forEach(t => currentCounts[t] = (currentCounts[t] || 0) + 1);

        const startCounts = { 'p': 8, 'n': 2, 'b': 2, 'r': 2, 'q': 1 };

        for (let type in startCounts) {
            const count = currentCounts[type] || 0;
            const lost = startCounts[type] - count;
            for (let i = 0; i < lost; i++) captured.push(type);
        }
        // sort by value
        captured.sort((a, b) => pieceValues[a] - pieceValues[b]);
        return captured;
    };

    const whiteCaptured = getCaptured(currentPieces.w); // Pieces White lost (displayed on Black's side usually? Or captured BY Black)
    const blackCaptured = getCaptured(currentPieces.b); // Pieces Black lost

    // Display Logic: 
    // Captured pieces are usually shown on the opponent's side (pieces I have eaten).
    // So "My Captured" area should show Black pieces I captured.

    const renderCaptured = (container, types, colorOfPieces) => {
        container.innerHTML = '';
        let lastType = null;
        types.forEach((type, index) => {
            const img = document.createElement('img');
            // Get SVG for that piece color
            const key = (colorOfPieces === 'w') ? type.toUpperCase() : type.toLowerCase();
            img.src = pieceSymbols[key];
            img.classList.add('captured-piece-icon');

            // Add gap between different piece groups
            if (lastType && lastType !== type) {
                img.style.marginLeft = "-2px";
            }

            container.appendChild(img);
            lastType = type;
        });
    };

    // Advantage
    const scoreDiff = whiteMaterial - blackMaterial;
    let whiteAdvText = '';
    let blackAdvText = '';

    if (scoreDiff > 0) whiteAdvText = '+' + scoreDiff;
    if (scoreDiff < 0) blackAdvText = '+' + Math.abs(scoreDiff);

    // Update UI based on perspective
    if (myColor === 'b') {
        // I am Black
        // My Captured area = White pieces I killed (whiteCaptured serves calculation of what White LOST)
        renderCaptured(myCaptured, whiteCaptured, 'w');
        renderCaptured(oppCaptured, blackCaptured, 'b');

        myAdvantage.innerText = blackAdvText;
        oppAdvantage.innerText = whiteAdvText;

        myAdvantage.className = 'score-advantage' + (blackAdvText ? ' plus' : '');
        oppAdvantage.className = 'score-advantage' + (whiteAdvText ? ' plus' : '');

    } else {
        // I am White
        renderCaptured(myCaptured, blackCaptured, 'b'); // I captured Black pieces
        renderCaptured(oppCaptured, whiteCaptured, 'w'); // Opponent captured White pieces

        myAdvantage.innerText = whiteAdvText;
        oppAdvantage.innerText = blackAdvText;

        myAdvantage.className = 'score-advantage' + (whiteAdvText ? ' plus' : '');
        oppAdvantage.className = 'score-advantage' + (blackAdvText ? ' plus' : '');
    }
}


// ============================================
// CHESS GAME LOGIC (Adapted)
// ============================================

function updateTurnIndicator() {
    const turn = game.turn() === 'w' ? 'White' : 'Black';

    let reason = '';
    let winner = '';

    if (game.in_checkmate()) {
        const winnerColor = (game.turn() === 'w') ? 'Black' : 'White';
        reason = 'Checkmate';
        winner = winnerColor;
        turnIndicator.innerHTML = `Game Over: <span class="${game.turn() === 'w' ? 'black' : 'white'}-turn">${winner} Wins!</span>`;
    }
    else if (game.in_draw() || game.in_stalemate() || game.in_threefold_repetition() || game.insufficient_material()) {
        reason = 'Draw';
        winner = 'Draw';
        turnIndicator.innerText = 'Game Over: Draw';
    }

    if (reason && isGameActive) {
        // Game just ended locally.
        // Emit claim to server to broadcast Game Over modal.
        // To prevent double emit, maybe only the winner claims? Or both is fine, server handles idempotency?
        // Emit claim to server to broadcast Game Over modal.
        // To prevent double emit, maybe only the winner claims? Or both is fine, server handles idempotency?
        // Simpler: Just emit. Server can just broadcast.
        const lastMove = game.history({ verbose: true }).pop();
        socket.emit('claim_game_over', { roomCode: currentRoom.code, reason, winner, fen: game.fen(), lastMove });
        isGameActive = false; // Stop local checks
        return;
    }

    let statusText = `Current Turn: <span class="${turn.toLowerCase()}-turn">${turn}</span>`;
    if (game.in_check()) {
        statusText += " (Check!)";
    }
    turnIndicator.innerHTML = statusText;
}

function renderBoard() {
    boardElement.innerHTML = '';

    let boardToRender;
    let isHistoryMode = (currentViewIndex !== -1);

    // Handle History Logic
    if (isHistoryMode) {
        // Validation: If viewIndex is beyond actual history (new move made), snap to live?
        // Logic handled in update.

        // Reconstruct Game at specific index
        const history = game.history();
        // If index is valid
        // Create temp game
        const tempGame = new Chess();
        for (let i = 0; i < currentViewIndex; i++) {
            tempGame.move(history[i]);
        }
        boardToRender = tempGame.board();

        boardElement.classList.add('history-mode');

        // Check if we reached the end while navigating forward
        if (currentViewIndex >= history.length) {
            currentViewIndex = -1;
            isHistoryMode = false;
            boardToRender = game.board();
            boardElement.classList.remove('history-mode');
        }
    } else {
        boardToRender = game.board();
        boardElement.classList.remove('history-mode');
    }

    // Determine Last Move for Highlighting
    let lastMove = null;
    const history = game.history({ verbose: true });

    if (isHistoryMode) {
        // In history mode, show move leading to current state
        // currentViewIndex is the number of moves shown.
        // So the last move made was at index currentViewIndex - 1
        if (currentViewIndex > 0 && history[currentViewIndex - 1]) {
            lastMove = history[currentViewIndex - 1];
        }
    } else {
        // Live mode: Show latest move
        if (history.length > 0) {
            lastMove = history[history.length - 1];
        }
    }

    // Orientation
    let isFlipped = (myColor === 'b');

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            // Adjust row/col based on flip
            const row = isFlipped ? 7 - r : r;
            const col = isFlipped ? 7 - c : c;

            const square = document.createElement('div');
            square.classList.add('square');
            // Color based on logical coordinates
            square.classList.add((row + col) % 2 === 0 ? 'white' : 'black');

            const squareId = String.fromCharCode('a'.charCodeAt(0) + col) + (8 - row);
            square.dataset.square = squareId;

            // Highlight Last Move
            if (lastMove && (squareId === lastMove.from || squareId === lastMove.to)) {
                square.classList.add('highlight-last-move');
            }

            // Coordinates Logic
            if (c === 0) {
                const rankSpan = document.createElement('span');
                rankSpan.classList.add('coord-rank');
                rankSpan.innerText = (8 - row);
                square.appendChild(rankSpan);
            }

            if (r === 7) {
                const fileSpan = document.createElement('span');
                fileSpan.classList.add('coord-file');
                fileSpan.innerText = String.fromCharCode('a'.charCodeAt(0) + col);
                square.appendChild(fileSpan);
            }

            const piece = boardToRender[row][col];
            if (piece) {
                const pieceImg = document.createElement('img');
                const symbolKey = piece.color === 'w' ? piece.type.toUpperCase() : piece.type.toLowerCase();
                pieceImg.src = pieceSymbols[symbolKey];
                pieceImg.classList.add('piece');
                pieceImg.draggable = false;
                square.appendChild(pieceImg);

                // Show check only if live? Or historic check is fine too.
                // tempGame inside loop scope? No. 
                // For simplified history check highlight, we might skip or need tempGame reference.
                // Keeping it simple: Highlight check on live only for now or recompute.
                if (!isHistoryMode && piece.type === 'k' && piece.color === game.turn() && game.in_check()) {
                    square.classList.add('in-check');
                }
            }

            // Highlights & Interaction
            // Disable interaction if in History Mode
            if (!isHistoryMode) {
                if (selectedSquare === squareId) {
                    square.classList.add('selected');
                }

                // Valid moves highlight
                if (selectedSquare) {
                    const moves = game.moves({ square: selectedSquare, verbose: true });
                    const move = moves.find(m => m.to === squareId);
                    if (move) {
                        if (move.flags.includes('c') || move.flags.includes('e')) {
                            square.classList.add('capture-move');
                        } else {
                            square.classList.add('valid-move');
                        }
                    }
                }
                square.addEventListener('click', () => handleSquareClick(squareId));
            } else {
                // History Mode: No Click Listener
                square.style.cursor = 'default';
            }

            boardElement.appendChild(square);
        }
    }
}

function handleSquareClick(squareId) {
    // 1. Check if game is active
    if (!isGameActive) return;

    // 2. Check turn
    if (game.game_over()) return;

    // 3. Check if it's my turn
    // Spectators cannot move. Players can only move on their turn.
    if ((game.turn() !== myColor) && (myColor !== null)) {
        // Not my turn
        // But maybe I want to select a piece just to see? 
        // For now, adhere to strict control: can only interact if my turn
        return;
    }
    if (myColor === null) return; // Spectators do nothing

    // Logic for move
    if (selectedSquare) {
        if (selectedSquare === squareId) {
            selectedSquare = null;
            renderBoard();
            return;
        }

        // Try move
        const moveAttempt = {
            from: selectedSquare,
            to: squareId,
            promotion: 'q'
        };

        const move = game.move(moveAttempt);
        if (move) {
            playSound(move); // Play sound locally
            selectedSquare = null;

            // OPTIMISTIC TIMER UPDATE
            // 1. Calculate time spent on this turn
            const now = Date.now();
            const spent = (now - lastTimerSync) / 1000;

            // 2. Deduct from My Time permanently (locally) to freeze it until server sync
            if (myColor === 'w') {
                whiteTime = Math.max(0, whiteTime - spent);
            } else {
                blackTime = Math.max(0, blackTime - spent);
            }

            // 3. Reset Anchor so the NEXT turn (Opponent) starts counting from 0 elapsed
            lastTimerSync = now;

            updateTurnIndicator();
            renderBoard();

            // Emit move
            socket.emit('make_move', {
                roomCode: currentRoom.code,
                move: moveAttempt,
                fen: game.fen(),
                pgn: game.pgn() // Send PGN for history sync
            });
            updateMaterial();     // NEW
            updateDashboardUI();  // NEW
            return;
        }
    }

    // Select Piece
    const piece = game.get(squareId);
    if (piece && piece.color === game.turn()) {
        // Allow selection only if it matches my color
        if (piece.color === myColor) {
            selectedSquare = squareId;
            renderBoard();
        }
    } else {
        selectedSquare = null;
        renderBoard();
    }
}


// ============================================
// CHAT & POST-GAME UI LOGIC
// ============================================

const chatInput = document.getElementById('chatInput');
const sendChatBtn = document.getElementById('sendChatBtn');
const chatMessages = document.getElementById('chatMessages');
const chatCooldownMsg = document.getElementById('chatCooldownMsg');

let lastChatTime = 0;
const CHAT_COOLDOWN = 15000; // 15s

if (sendChatBtn) {
    sendChatBtn.addEventListener('click', sendChat);
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendChat();
    });
}

function sendChat() {
    const msg = chatInput.value.trim();
    if (!msg) return;

    // Cooldown Check (Skip if Admin)
    const now = Date.now();
    if (!isAdmin) {
        if (now - lastChatTime < CHAT_COOLDOWN) {
            const left = Math.ceil((CHAT_COOLDOWN - (now - lastChatTime)) / 1000);
            chatCooldownMsg.innerText = `Wait ${left}s to chat.`;
            return;
        }
    }

    lastChatTime = now;
    chatCooldownMsg.innerText = '';
    socket.emit('send_chat', { roomCode: currentRoom.code, message: msg });
    chatInput.value = '';
}

socket.on('receive_chat', ({ name, message, isAdmin: senderIsAdmin }) => {
    const div = document.createElement('div');
    div.classList.add('chat-msg');

    // Style based on sender
    if (senderIsAdmin) div.classList.add('admin');
    if (name === myName) div.classList.add('self');

    const label = senderIsAdmin ? `[Admin] ${name}` : name;
    div.innerHTML = `<strong>${label}:</strong> ${message}`; // Sanitize in real app

    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
});


