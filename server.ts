import express from "express";
import http from "http";
import path from "path";
import fs from "fs";
import { WebSocketServer, WebSocket } from "ws";
import { GoogleGenAI } from "@google/genai";
import { createServer as createViteServer } from "vite";
import { Tile, Player, GameRoom, ChatMessage, UserProfile, LeaderboardEntry, Tournament } from "./src/types.js";
import {
  getProfile,
  saveProfile,
  dbSaveRoom,
  dbDeleteRoom,
  dbGetPublicRooms,
  dbGetTournaments,
  dbGetLeaderboard,
  dbRecordMatch,
  dbRecordTransaction,
  dbSaveChatMessage
} from "./src/lib/supabase.js";

const PORT = 3000;
const app = express();
app.use(express.json());

// Initialize Gemini Client safely
let ai: GoogleGenAI | null = null;
if (process.env.GEMINI_API_KEY) {
  try {
    ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
    console.log("Gemini API Client successfully initialized");
  } catch (err) {
    console.error("Failed to initialize Gemini Client:", err);
  }
}


// Smart local Dominican phrases fallback engine matching game contexts
function getDominicanFallback(context: string): string {
  const normCtx = (context || "").toLowerCase();
  
  if (normCtx.includes("dominó") || normCtx.includes("fichas") || normCtx.includes("ganando") || normCtx.includes("jugando todas")) {
    const wins = [
      "¡Manín, qué golpazo! Ese gallo cantó claro y los dejó frisao' de una vez.",
      "¡Mejórate ahí! Los acostó a toditos sin dudarlo, ¡vayan a llorar al monte!",
      "¡Qué canillera! Le metieron el agua y dominó limpio en la cara del tíguere.",
      "¡Dominó limpio! Eso dolió más que una fría sin gas en pleno mediodía."
    ];
    return wins[Math.floor(Math.random() * wins.length)];
  }
  
  if (normCtx.includes("trancó") || normCtx.includes("trancando") || normCtx.includes("sobrantes") || normCtx.includes("blocked")) {
    const blocks = [
      "¡Ay mi madre! Se trancó el juego en el colmado. ¡Jueguen callao' que los cuartos se quedan ahí!",
      "¡Trancao por tacaño! Ese juego se cerró hermético como caja de hierro.",
      "¡Tranquito lindo! Se trancó ese dominó y ahora a contar punticos con el sudor en la frente.",
      "¡Trancao y sin freno! Nadie pasa de ahí, saquen la calculadora de una vez."
    ];
    return blocks[Math.floor(Math.random() * blocks.length)];
  }
  
  if (normCtx.includes("iniciando") || normCtx.includes("comenzar") || normCtx.includes("nueva partida") || normCtx.includes("arrancar")) {
    const starts = [
      "¡Suelten la primera ficha! El dominó lo inventó un mudo, ¡así que jueguen sin cotilleo!",
      "¡Saca la fría del freezer que ya arrancó esto! Juegue con flow, tíguere.",
      "¡Se prendió el colmado! Vamos a ver quién es el verdadero duro de la mesa hoy.",
      "¡Coloque' la mano ahí! Arrancó el mambo y de aquí salimos coronados o vacíos."
    ];
    return starts[Math.floor(Math.random() * starts.length)];
  }

  const defaults = [
    "¡El dominó lo inventó un mudo, juegue callao!",
    "¡Ay mi madre, te fuiste con el doble seis en la mano!",
    "¡Trancao por estar pensando demasiado!",
    "¡Capicúa! Eso dolió hasta en Cotuí.",
    "¡Ahí viene el hombre de la cabeza grande!",
    "¡Ese juego está cerrado por mantenimiento!",
    "¡Al duro, tíguere! Juegue rápido y sin mirar pa' lo' lao'."
  ];
  return defaults[Math.floor(Math.random() * defaults.length)];
}

// Utility for making Dominican comments with Gemini (with resilient retry and smart fallback)
async function getGeminiCommentary(context: string): Promise<string> {
  if (!ai) {
    return getDominicanFallback(context);
  }

  const systemInstruction = "Eres un narrador dominicano clásico y animado de partidas de dominó en un colmado de Santo Domingo. Usa palabras típicas dominicanas (tíguere, capicúa, trancao, de una vez, concho, que lo que, colmado, fría). Genera una sola frase humorística, corta, picante y ocurrente sobre esta situación del juego.";
  const prompt = `Comenta sobre esta situación actual de la partida de dominó: "${context}". Genera solo la frase corta de comentario humorístico del narrador. Sin comillas ni explicaciones extras.`;

  // Attempt 1: Try the primary model "gemini-3.5-flash"
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        systemInstruction,
        maxOutputTokens: 100,
        temperature: 0.95,
      }
    });
    if (response.text) {
      return response.text.trim();
    }
  } catch (err) {
    console.warn("Primary Gemini model (gemini-3.5-flash) failed or busy. Trying backup model 'gemini-flash-latest'...", err);
  }

  // Attempt 2: Try the legacy/standard alias "gemini-flash-latest" as secondary backup
  try {
    const response = await ai.models.generateContent({
      model: "gemini-flash-latest",
      contents: prompt,
      config: {
        systemInstruction,
        maxOutputTokens: 100,
        temperature: 0.95,
      }
    });
    if (response.text) {
      return response.text.trim();
    }
  } catch (err) {
    console.error("Secondary Gemini model (gemini-flash-latest) also failed. Resorting to local Dominican fallback engine:", err);
  }

  // Absolute fallback: intelligent, context-aware local Dominican commentary generator
  return getDominicanFallback(context);
}

// REST Api endpoints
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", time: new Date() });
});

// Get or Create profile
app.post("/api/profile", async (req, res) => {
  const { userId, name, walletAddress, avatarUrl } = req.body;
  
  if (!userId) {
    res.status(400).json({ error: "userId is required" });
    return;
  }

  try {
    let profile = await getProfile(userId);
    if (!profile) {
      profile = {
        id: userId,
        name: name || `Tíguere-${Math.floor(1000 + Math.random() * 9000)}`,
        country: "DO",
        coins: 2000,
        xp: 100,
        level: 1,
        walletAddress: walletAddress || undefined,
        avatarUrl: avatarUrl || `https://api.dicebear.com/7.x/pixel-art/svg?seed=${userId}`,
        stats: {
          played: 0,
          won: 0,
          lost: 0,
          capicuas: 0,
          pointsScored: 0
        }
      };
      await saveProfile(profile);
      await dbRecordTransaction(userId, 2000, "signup_bonus", "Bonus de registro inicial");
    } else if (walletAddress && !profile.walletAddress) {
      profile.walletAddress = walletAddress;
      // Award 500 bonus coins for connecting wallet
      if (!profile.nftAsset) {
        profile.coins += 500;
        profile.nftAsset = {
          id: "nft_table_classic_wood",
          type: "table",
          name: "Tablero Caoba Quisqueya",
          image: "classic_wood"
        };
      }
      await saveProfile(profile);
      await dbRecordTransaction(userId, 500, "wallet_connect", "Bonus por conectar billetera crypto");
    }

    res.json(profile);
  } catch (error) {
    console.error("Profile endpoint error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Get Leaderboard
app.get("/api/leaderboard", async (req, res) => {
  try {
    const list = await dbGetLeaderboard();
    res.json(list);
  } catch (error) {
    console.error("Leaderboard endpoint error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Tournaments list
app.get("/api/tournaments", async (req, res) => {
  try {
    const list = await dbGetTournaments();
    res.json(list);
  } catch (error) {
    console.error("Tournaments endpoint error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Daily claim rewards
app.post("/api/daily-claim", async (req, res) => {
  const { userId } = req.body;
  try {
    const profile = await getProfile(userId);
    if (!profile) {
      res.status(404).json({ error: "Profile not found" });
      return;
    }

    profile.coins += 1000;
    profile.xp += 150;
    if (profile.xp >= profile.level * 500) {
      profile.level += 1;
    }
    await saveProfile(profile);
    await dbRecordTransaction(userId, 1000, "daily_reward", "Recompensa diaria reclamada");

    res.json({
      success: true,
      addedCoins: 1000,
      addedXp: 150,
      newBalance: profile.coins,
      newLevel: profile.level
    });
  } catch (error) {
    console.error("Daily claim error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Chat AI Commentary endpoint
app.post("/api/gemini/commentate", async (req, res) => {
  const { context } = req.body;
  const comment = await getGeminiCommentary(context || "Iniciando una nueva partida de dominó");
  res.json({ comment });
});

// Domino tile generator (Full Double-Six Double 28 tiles)
function generateDominoDeck(): Tile[] {
  const deck: Tile[] = [];
  for (let i = 0; i <= 6; i++) {
    for (let j = i; j <= 6; j++) {
      deck.push([i, j]);
    }
  }
  return deck;
}

function shuffleTiles(deck: Tile[]): Tile[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Domino game mechanical helper
function canPlayTile(tile: Tile, leftEnd: number | null, rightEnd: number | null): boolean {
  if (leftEnd === null || rightEnd === null) return true; // Empty board, anything can play
  return (
    tile[0] === leftEnd ||
    tile[1] === leftEnd ||
    tile[0] === rightEnd ||
    tile[1] === rightEnd
  );
}

// Initialize HTTP server
const server = http.createServer(app);

// WebSocket management
const wss = new WebSocketServer({ server });
const clientSockets = new Map<string, WebSocket>(); // map playerId to socket
const activeRooms = new Map<string, GameRoom>(); // map roomId to room state

function broadcastToRoom(roomId: string, message: any) {
  const room = activeRooms.get(roomId);
  if (!room) return;

  const payload = JSON.stringify(message);
  room.players.forEach(p => {
    if (!p.isBot) {
      const socket = clientSockets.get(p.id);
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(payload);
      }
    }
  });
}

function checkAndTriggerBotPlays(roomId: string) {
  const room = activeRooms.get(roomId);
  if (!room || room.status !== "playing") return;

  const currentPlayer = room.players[room.currentPlayerIndex];
  if (!currentPlayer || !currentPlayer.isBot) return;

  // Simulate Dominican Bot thinking time for hyper-real feel
  setTimeout(async () => {
    const updatedRoom = activeRooms.get(roomId);
    if (!updatedRoom || updatedRoom.status !== "playing") return;
    const bot = updatedRoom.players[updatedRoom.currentPlayerIndex];
    if (!bot || !bot.isBot) return;

    // Analyze moves
    const leftVal = updatedRoom.leftEnd;
    const rightVal = updatedRoom.rightEnd;

    const playableIndices: { index: number; end: 'left' | 'right'; flip: boolean }[] = [];
    bot.tiles.forEach((tile, index) => {
      if (leftVal === null || rightVal === null) {
        // First turn
        playableIndices.push({ index, end: 'left', flip: false });
      } else {
        if (tile[0] === leftVal) playableIndices.push({ index, end: 'left', flip: true });
        else if (tile[1] === leftVal) playableIndices.push({ index, end: 'left', flip: false });
        
        if (tile[0] === rightVal) playableIndices.push({ index, end: 'right', flip: false });
        else if (tile[1] === rightVal) playableIndices.push({ index, end: 'right', flip: flipResult(tile, rightVal) });
      }
    });

    function flipResult(tile: Tile, edge: number): boolean {
      return tile[1] === edge; 
    }

    if (playableIndices.length > 0) {
      // Prioritize moves: Double tiles first (especially high doubles) to "desahogarse"
      playableIndices.sort((a, b) => {
        const tileA = bot.tiles[a.index];
        const tileB = bot.tiles[b.index];
        const isDoubleA = tileA[0] === tileA[1];
        const isDoubleB = tileB[0] === tileB[1];

        if (isDoubleA && !isDoubleB) return -1;
        if (!isDoubleA && isDoubleB) return 1;

        // Otherwise highest points total
        return (tileB[0] + tileB[1]) - (tileA[0] + tileA[1]);
      });

      const choice = playableIndices[0];
      const selectedTile = bot.tiles[choice.index];

      // Remove from hand
      bot.tiles.splice(choice.index, 1);

      // Play tile
      let alignedTile = [...selectedTile] as Tile;
      if (updatedRoom.leftEnd === null) {
        updatedRoom.board = [alignedTile];
        updatedRoom.leftEnd = alignedTile[0];
        updatedRoom.rightEnd = alignedTile[1];
      } else if (choice.end === 'left') {
        if (alignedTile[1] !== updatedRoom.leftEnd) {
          alignedTile = [alignedTile[1], alignedTile[0]] as Tile;
        }
        updatedRoom.board.unshift(alignedTile);
        updatedRoom.leftEnd = alignedTile[0];
      } else {
        if (alignedTile[0] !== updatedRoom.rightEnd) {
          alignedTile = [alignedTile[1], alignedTile[0]] as Tile;
        }
        updatedRoom.board.push(alignedTile);
        updatedRoom.rightEnd = alignedTile[1];
      }

      // Check win
      if (bot.tiles.length === 0) {
        // Bot wins round!
        handleRoundEnd(updatedRoom, bot.id);
      } else {
        // Next Turn
        advanceTurn(updatedRoom);
      }
    } else {
      // No playable tiles. Must draw con loma or pass.
      if (updatedRoom.drawMode === "con_loma" && updatedRoom.deck.length > 0) {
        const drawn = updatedRoom.deck.pop()!;
        bot.tiles.push(drawn);
        broadcastToRoom(roomId, {
          type: "tile-drawn",
          playerId: bot.id,
          tilesCount: bot.tiles.length,
          deckCount: updatedRoom.deck.length
        });
        
        // Check if playable now
        if (canPlayTile(drawn, updatedRoom.leftEnd, updatedRoom.rightEnd)) {
          // Play automatically in next micro second
          checkAndTriggerBotPlays(roomId);
        } else {
          // Draw again or trigger bot loop
          checkAndTriggerBotPlays(roomId);
        }
      } else {
        // Pass
        broadcastToRoom(roomId, {
          type: "player-passed",
          playerId: bot.id,
          playerName: bot.name
        });
        advanceTurn(updatedRoom);
      }
    }
  }, 1200);
}

function advanceTurn(room: GameRoom) {
  room.currentPlayerIndex = (room.currentPlayerIndex + 1) % room.players.length;

  // Detect general Block ("Trancao")
  let isBlocked = true;
  for (const player of room.players) {
    const hasMove = player.tiles.some(t => canPlayTile(t, room.leftEnd, room.rightEnd));
    if (hasMove) {
      isBlocked = false;
      break;
    }
  }

  // If con_loma, block is only valid if deck is empty
  if (room.drawMode === "con_loma" && room.deck.length > 0) {
    isBlocked = false;
  }

  if (isBlocked) {
    handleBlockEnd(room);
  } else {
    // Sync room board
    broadcastToRoom(room.id, {
      type: "room-updated",
      room
    });
    checkAndTriggerBotPlays(room.id);
  }
}

function calculateHandPoints(players: Player[]): number {
  return players.reduce((sum, p) => sum + p.tiles.reduce((tSum, tile) => tSum + tile[0] + tile[1], 0), 0);
}

// Round end on normal domino plays
function handleRoundEnd(room: GameRoom, winnerId: string) {
  const winner = room.players.find(p => p.id === winnerId)!;
  const lostPlayers = room.players.filter(p => p.team !== winner.team);
  
  // Calculate score total of unplayed tiles of losing team/players
  const points = lostPlayers.reduce((acc, p) => {
    return acc + p.tiles.reduce((sum, tile) => sum + tile[0] + tile[1], 0);
  }, 0);

  // Dominican custom commentaries triggering
  const context = `El jugador ${winner.name} dominó jugando todas sus fichas y ganando ${points} puntos.`;
  getGeminiCommentary(context).then(async (aiComment) => {
    // Accrue match score to team
    room.players.forEach(p => {
      if (p.team === winner.team) {
        p.score += points;
      }
    });

    const isMatchEnded = room.players.some(p => p.score >= room.pointsToWin);
    
    // Broadcast event
    broadcastToRoom(room.id, {
      type: "round-ended",
      winnerId,
      winType: "normal",
      points,
      comment: aiComment,
      room
    });

    await dbSaveRoom(room);

    // Handle full game completion or queue fresh round
    if (isMatchEnded) {
      await finalizeMatch(room, winner.team);
    } else {
      setTimeout(async () => {
        await resetGameRound(room, room.players.indexOf(winner));
      }, 5000);
    }
  });
}

function handleBlockEnd(room: GameRoom) {
  // Sum remaining tiles points per player
  const playerScores = room.players.map(p => {
    const sum = p.tiles.reduce((acc, t) => acc + t[0] + t[1], 0);
    return { playerId: p.id, team: p.team, sum };
  });

  // Calculate team total score
  const team1Points = playerScores.filter(ps => ps.team === 1).reduce((acc, ps) => acc + ps.sum, 0);
  const team2Points = playerScores.filter(ps => ps.team === 2).reduce((acc, ps) => acc + ps.sum, 0);

  let winnerTeam: 1 | 2 = 1;
  let points = 0;
  let tie = false;

  if (team1Points < team2Points) {
    winnerTeam = 1;
    points = team2Points; // Wins losing team's remaining points
  } else if (team2Points < team1Points) {
    winnerTeam = 2;
    points = team1Points;
  } else {
    tie = true;
    points = 0;
  }

  const context = `La partida de dominó se trancó. El equipo 1 tiene ${team1Points} puntos sobrantes. El equipo 2 tiene ${team2Points} puntos sobrantes.`;
  getGeminiCommentary(context).then(async (aiComment) => {
    if (!tie) {
      room.players.forEach(p => {
        if (p.team === winnerTeam) p.score += points;
      });
    }

    const isMatchEnded = room.players.some(p => p.score >= room.pointsToWin);

    broadcastToRoom(room.id, {
      type: "round-ended",
      winType: "blocked",
      winnerTeam: tie ? null : winnerTeam,
      points,
      comment: tie ? "¡Trancao parejo! Juego trancado en empate total." : aiComment,
      room
    });

    await dbSaveRoom(room);

    if (isMatchEnded && !tie) {
      await finalizeMatch(room, winnerTeam);
    } else {
      setTimeout(async () => {
        // Dealer next clockwise
        await resetGameRound(room, (room.starterIndex + 1) % room.players.length);
      }, 5000);
    }
  });
}

async function finalizeMatch(room: GameRoom, winningTeam: 1 | 2) {
  room.status = "ended";
  room.winnerTeam = winningTeam;

  // Accrue coins, win stats to real user profiles
  for (const p of room.players) {
    if (p.isBot) continue;
    const profile = await getProfile(p.id);
    if (profile) {
      profile.stats.played += 1;
      if (p.team === winningTeam) {
        profile.stats.won += 1;
        profile.coins += room.stakeAmount * 2; // Return stake + prize pool share
        profile.xp += 300;
        await dbRecordTransaction(p.id, room.stakeAmount * 2, "win", `Ganancia de partida en sala ${room.id}`);
      } else {
        profile.stats.lost += 1;
        profile.xp += 50;
      }
      if (profile.xp >= profile.level * 500) {
        profile.level += 1;
      }
      await saveProfile(profile);
    }
  }
  
  await dbSaveRoom(room);

  // Archive Match history in Supabase Matches table
  const matchId = `match-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  await dbRecordMatch(
    matchId,
    room.mode,
    room.drawMode,
    room.pointsToWin,
    room.stakeAmount,
    winningTeam,
    room.name,
    { players: room.players.map(pl => ({ id: pl.id, name: pl.name, score: pl.score })) }
  );

  broadcastToRoom(room.id, {
    type: "game-over",
    winnerTeam: winningTeam,
    room
  });
}

async function resetGameRound(room: GameRoom, starterIndex: number) {
  const fullDeck = generateDominoDeck();
  const shuffled = shuffleTiles(fullDeck);

  room.board = [];
  room.leftEnd = null;
  room.rightEnd = null;
  room.currentPlayerIndex = starterIndex;
  room.starterIndex = starterIndex;
  room.roundNumber += 1;

  // Re-deal tiles: 7 tiles per player
  if (room.mode === "1v1") {
    room.players[0].tiles = shuffled.splice(0, 7);
    room.players[1].tiles = shuffled.splice(0, 7);
    room.deck = shuffled; // Con loma deck size remains 14
  } else {
    room.players[0].tiles = shuffled.splice(0, 7);
    room.players[1].tiles = shuffled.splice(0, 7);
    room.players[2].tiles = shuffled.splice(0, 7);
    room.players[3].tiles = shuffled.splice(0, 7);
    room.deck = [];
  }

  // If first round, player holding Doble Seis [6, 6] plays first
  if (room.roundNumber === 1) {
    let doubleSixHolder = 0;
    room.players.forEach((p, idx) => {
      const hasDoble6 = p.tiles.some(t => t[0] === 6 && t[1] === 6);
      if (hasDoble6) doubleSixHolder = idx;
    });
    room.currentPlayerIndex = doubleSixHolder;
    room.starterIndex = doubleSixHolder;
  }

  await dbSaveRoom(room);

  broadcastToRoom(room.id, {
    type: "round-started",
    room
  });

  checkAndTriggerBotPlays(room.id);
}

// Generate Bots to fill room
const MOCK_BOTS = [
  { name: "Doña Caridad", country: "DO", avatarUrl: "https://api.dicebear.com/7.x/pixel-art/svg?seed=caridad" },
  { name: "El Tíguere Juan", country: "DO", avatarUrl: "https://api.dicebear.com/7.x/pixel-art/svg?seed=juan" },
  { name: "Papi Chulo", country: "DO", avatarUrl: "https://api.dicebear.com/7.x/pixel-art/svg?seed=papi" },
  { name: "Bari el Cibaeño", country: "DO", avatarUrl: "https://api.dicebear.com/7.x/pixel-art/svg?seed=bari" }
];

async function fillWithBots(room: GameRoom) {
  const targetCount = room.mode === "1v1" ? 2 : 4;
  let botIndex = 0;

  while (room.players.length < targetCount) {
    const seedBot = MOCK_BOTS[botIndex % MOCK_BOTS.length];
    const botId = `bot-${Math.floor(Math.random() * 100000)}`;

    const botPlayer: Player = {
      id: botId,
      name: `${seedBot.name} 🤖`,
      isBot: true,
      country: seedBot.country,
      avatarUrl: seedBot.avatarUrl,
      coins: 1000,
      xp: 250,
      level: 3,
      tiles: [],
      ready: true,
      team: (room.players.length % 2 === 0) ? 1 : 2,
      score: 0
    };

    room.players.push(botPlayer);
    botIndex++;
  }

  // Check if all players are ready or bots entered, trigger deal
  if (room.players.every(p => p.ready)) {
    room.status = "playing";
    await resetGameRound(room, 0);
  } else {
    await dbSaveRoom(room);
    broadcastToRoom(room.id, {
      type: "room-updated",
      room
    });
  }
}

// Websocket Events processing loop
wss.on("connection", (ws) => {
  let authenticatedPlayerId: string | null = null;
  let activeRoomId: string | null = null;

  ws.on("message", async (raw) => {
    try {
      const data = JSON.parse(raw.toString());

      switch (data.type) {
        case "register-socket": {
          const { playerId } = data;
          authenticatedPlayerId = playerId;
          clientSockets.set(playerId, ws);
          console.log(`Connected player ${playerId} on web socket`);
          break;
        }

        case "create-room": {
          const { playerId, name, mode, drawMode, pointsToWin, isPrivate, stakeAmount } = data;
          
          const creatorProfile = await getProfile(playerId);
          if (!creatorProfile) return;

          // Charge entry stakes
          if (creatorProfile.coins < stakeAmount) {
            ws.send(JSON.stringify({ type: "error", message: "Monedas insuficientes para la apuesta." }));
            return;
          }
          creatorProfile.coins -= stakeAmount;
          await saveProfile(creatorProfile);
          await dbRecordTransaction(playerId, -stakeAmount, "bet", `Apuesta de mesa dominó ${name || 'Clásica'}`);

          const roomId = `room-${Math.floor(100000 + Math.random() * 900000)}`;
          const inviteCode = Math.random().toString(36).substring(2, 7).toUpperCase();

          const player: Player = {
            id: playerId,
            name: creatorProfile.name,
            isBot: false,
            country: creatorProfile.country,
            avatarUrl: creatorProfile.avatarUrl,
            walletAddress: creatorProfile.walletAddress,
            coins: creatorProfile.coins,
            xp: creatorProfile.xp,
            level: creatorProfile.level,
            tiles: [],
            ready: true,
            team: 1,
            score: 0
          };

          const room: GameRoom = {
            id: roomId,
            name: name || `Mesa de ${creatorProfile.name}`,
            creatorId: playerId,
            mode,
            drawMode,
            pointsToWin: Number(pointsToWin) || 100,
            status: "waiting",
            players: [player],
            board: [],
            leftEnd: null,
            rightEnd: null,
            currentPlayerIndex: 0,
            deck: [],
            starterIndex: 0,
            roundNumber: 0,
            winnerPlayerId: null,
            winnerTeam: null,
            isBlocked: false,
            messages: [],
            code: inviteCode,
            isPrivate: isPrivate || false,
            stakeAmount: Number(stakeAmount) || 100
          };

          activeRooms.set(roomId, room);
          activeRoomId = roomId;

          await dbSaveRoom(room);

          ws.send(JSON.stringify({
            type: "room-created",
            room
          }));
          break;
        }

        case "join-room": {
          const { playerId, roomId, code } = data;
          
          let targetRoom = activeRooms.get(roomId);
          if (!targetRoom && code) {
            // Find room by invite code
            targetRoom = Array.from(activeRooms.values()).find(r => r.code === code);
          }

          if (!targetRoom) {
            ws.send(JSON.stringify({ type: "error", message: "Sala no encontrada." }));
            return;
          }

          if (targetRoom.status !== "waiting") {
            ws.send(JSON.stringify({ type: "error", message: "La partida ya ha comenzado." }));
            return;
          }

          const maxCapacity = targetRoom.mode === "1v1" ? 2 : 4;
          if (targetRoom.players.length >= maxCapacity) {
            ws.send(JSON.stringify({ type: "error", message: "La sala está llena." }));
            return;
          }

          const existingPlayer = targetRoom.players.find(p => p.id === playerId);
          if (!existingPlayer) {
            const profile = await getProfile(playerId);
            if (!profile) return;

            // Charge stake entries
            if (profile.coins < targetRoom.stakeAmount) {
              ws.send(JSON.stringify({ type: "error", message: "Monedas insuficientes para la apuesta." }));
              return;
            }
            profile.coins -= targetRoom.stakeAmount;
            await saveProfile(profile);
            await dbRecordTransaction(playerId, -targetRoom.stakeAmount, "bet", `Apuesta ingreso mesa dominó ${targetRoom.name}`);

            const newPlayer: Player = {
              id: playerId,
              name: profile.name,
              isBot: false,
              country: profile.country,
              avatarUrl: profile.avatarUrl,
              walletAddress: profile.walletAddress,
              coins: profile.coins,
              xp: profile.xp,
              level: profile.level,
              tiles: [],
              ready: true,
              team: (targetRoom.players.length % 2 === 0) ? 1 : 2,
              score: 0
            };

            targetRoom.players.push(newPlayer);
          }

          activeRoomId = targetRoom.id;

          await dbSaveRoom(targetRoom);

          broadcastToRoom(targetRoom.id, {
            type: "room-updated",
            room: targetRoom
          });

          // If room gets full, trigger bots or deal immediately
          const activeLimit = targetRoom.mode === "1v1" ? 2 : 4;
          if (targetRoom.players.length === activeLimit) {
            targetRoom.status = "playing";
            await resetGameRound(targetRoom, 0);
          }
          break;
        }

        case "fill-bots": {
          const { roomId } = data;
          const room = activeRooms.get(roomId);
          if (room && room.status === "waiting") {
            await fillWithBots(room);
          }
          break;
        }

        case "play-tile": {
          const { roomId, playerId, tile, end } = data;
          const room = activeRooms.get(roomId);
          if (!room || room.status !== "playing") return;

          const player = room.players[room.currentPlayerIndex];
          if (!player || player.id !== playerId) return;

          // Remove tile from index
          const tileIdx = player.tiles.findIndex(t => t[0] === tile[0] && t[1] === tile[1]);
          if (tileIdx === -1) return;

          player.tiles.splice(tileIdx, 1);

          // Position matching ends logic
          let orientedTile = [...tile] as Tile;
          if (room.leftEnd === null) {
            room.board = [orientedTile];
            room.leftEnd = orientedTile[0];
            room.rightEnd = orientedTile[1];
          } else if (end === 'left') {
            if (orientedTile[1] !== room.leftEnd) {
              orientedTile = [orientedTile[1], orientedTile[0]] as Tile;
            }
            room.board.unshift(orientedTile);
            room.leftEnd = orientedTile[0];
          } else {
            if (orientedTile[0] !== room.rightEnd) {
              orientedTile = [orientedTile[1], orientedTile[0]] as Tile;
            }
            room.board.push(orientedTile);
            room.rightEnd = orientedTile[1];
          }

          // Audio clack broadcast triggering trigger
          broadcastToRoom(room.id, {
            type: "play-success",
            playerId,
            tile,
            end
          });

          // Check Win hand
          if (player.tiles.length === 0) {
            handleRoundEnd(room, player.id);
          } else {
            advanceTurn(room);
          }
          break;
        }

        case "draw-tile": {
          const { roomId, playerId } = data;
          const room = activeRooms.get(roomId);
          if (!room || room.status !== "playing") return;

          const player = room.players[room.currentPlayerIndex];
          if (!player || player.id !== playerId) return;

          if (room.drawMode === "con_loma" && room.deck.length > 0) {
            const drawn = room.deck.pop()!;
            player.tiles.push(drawn);

            broadcastToRoom(room.id, {
              type: "tile-drawn",
              playerId,
              tilesCount: player.tiles.length,
              deckCount: room.deck.length
            });

            await dbSaveRoom(room);

            // If drawn tile playable, let client know
            broadcastToRoom(room.id, {
              type: "room-updated",
              room
            });
          }
          break;
        }

        case "pass-turn": {
          const { roomId, playerId } = data;
          const room = activeRooms.get(roomId);
          if (!room || room.status !== "playing") return;

          const player = room.players[room.currentPlayerIndex];
          if (!player || player.id !== playerId) return;

          broadcastToRoom(room.id, {
            type: "player-passed",
            playerId,
            playerName: player.name
          });

          advanceTurn(room);
          break;
        }

        case "send-chat": {
          const { roomId, playerId, text, isPreset } = data;
          const room = activeRooms.get(roomId);
          if (!room) return;

          const sender = room.players.find(p => p.id === playerId);
          if (!sender) return;

          const messageId = `msg-${Date.now()}-${Math.floor(Math.random()*1000)}`;
          const newMessage: ChatMessage = {
            id: messageId,
            senderId: playerId,
            senderName: sender.name,
            text,
            isPreset: isPreset || false,
            timestamp: Date.now()
          };

          room.messages.push(newMessage);
          if (room.messages.length > 50) room.messages.shift();

          await dbSaveChatMessage(
            messageId,
            roomId,
            playerId,
            sender.name,
            text,
            isPreset || false,
            newMessage.timestamp
          );
          await dbSaveRoom(room);

          broadcastToRoom(room.id, {
            type: "chat-received",
            message: newMessage
          });
          break;
        }

        case "leave-room": {
          if (!activeRoomId || !authenticatedPlayerId) return;
          console.log(`Player ${authenticatedPlayerId} left ${activeRoomId}`);
          
          const room = activeRooms.get(activeRoomId);
          if (room) {
            // Remove from player list
            room.players = room.players.filter(p => p.id !== authenticatedPlayerId);
            
            if (room.players.length === 0 || room.players.every(p => p.isBot)) {
              activeRooms.delete(activeRoomId);
              await dbDeleteRoom(activeRoomId);
            } else {
              await dbSaveRoom(room);
              broadcastToRoom(room.id, {
                type: "room-updated",
                room
              });
            }
          }
          activeRoomId = null;
          break;
        }

        default:
          break;
      }
    } catch (e) {
      console.error("Failed processing ws raw socket statement:", e);
    }
  });

  ws.on("close", async () => {
    if (authenticatedPlayerId) {
      clientSockets.delete(authenticatedPlayerId);
      
      const room = activeRooms.get(activeRoomId || "");
      if (room) {
        room.players = room.players.filter(p => p.id !== authenticatedPlayerId);
        if (room.players.length === 0 || room.players.every(p => p.isBot)) {
          activeRooms.delete(activeRoomId || "");
          await dbDeleteRoom(activeRoomId || "");
        } else {
          await dbSaveRoom(room);
          broadcastToRoom(room.id, {
            type: "room-updated",
            room
          });
        }
      }
    }
  });
});

// Setup public lobby finder endpoint
app.get("/api/rooms", async (req, res) => {
  try {
    const roomsList = await dbGetPublicRooms();
    res.json(roomsList);
  } catch (error) {
    console.error("Rooms endpoint error:", error);
    res.json([]);
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Domino Dominicano Classico full-stack server active on port ${PORT}!`);
  });
}

startServer();
