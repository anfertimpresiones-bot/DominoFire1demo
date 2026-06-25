import React, { useState, useEffect, useRef } from "react";
import { 
  Trophy, Users, User, CreditCard, MessageSquare, Plus, Volume2, VolumeX, 
  Send, Crown, Award, Globe, Shield, RefreshCw, Layers, CheckCircle, Zap, Coins
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Tile, Player, GameRoom, ChatMessage, UserProfile, LeaderboardEntry, Tournament } from "./types.js";
import { playTileClack, playTileShuffle, playVictorySound } from "./utils/audio.js";
import { auth, googleProvider } from "./lib/firebase.js";
import { signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import WelcomeRegisterScreen from "./components/WelcomeRegisterScreen.js";

// Audio state
let soundEnabled = true;

// Preselected Dominó Skin packs
const TILE_SKINS = [
  { id: "skin_classic", name: "Socio Clásico", bg: "bg-white border-gray-400", pips: "bg-gray-950", line: "bg-gray-300" },
  { id: "skin_mahogany", name: "Oro Caoba (Premium NFT)", bg: "bg-amber-950 border-yellow-600 border-2", pips: "bg-yellow-400", line: "bg-yellow-500" },
  { id: "skin_neon", name: "Neon Carbón (Cyber DO)", bg: "bg-zinc-900 border-teal-400", pips: "bg-teal-300 shadow-[0_0_5px_rgba(45,212,191,0.5)]", line: "bg-teal-500" }
];

const TABLE_SKINS = [
  { id: "table_wood", name: "Colmado Caoba Clásico", style: "radial-gradient(circle, #3d1c02 0%, #170700 100%)", text: "text-amber-100" },
  { id: "table_blue", name: "Copa Malecón Azul", style: "radial-gradient(circle, #0f3057 0%, #001427 100%)", text: "text-blue-100" },
  { id: "table_green", name: "Plaza España Club", style: "radial-gradient(circle, #0e4429 0%, #021a0e 100%)", text: "text-emerald-100" }
];

export default function App() {
  // Navigation tabs: 'lobby' | 'game' | 'tournaments' | 'leaderboard' | 'profile'
  const [activeTab, setActiveTab] = useState<string>("lobby");
  
  // Custom registration check for welcome/registration landing page
  const [isRegistered, setIsRegistered] = useState<boolean>(() => {
    return localStorage.getItem("dominosfire_registered") === "true";
  });
  
  // Custom generated player ID stored securely in localStorage
  const [playerId, setPlayerId] = useState<string>(() => {
    const saved = localStorage.getItem("domino_player_id");
    if (saved) return saved;
    const newId = `player-${Math.floor(100000 + Math.random() * 900000)}`;
    localStorage.setItem("domino_player_id", newId);
    return newId;
  });

  // Listen to Firebase Auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setPlayerId(user.uid);
        // Save current name or use display name
        const currentName = localStorage.getItem("domino_player_name");
        if (!currentName && user.displayName) {
          localStorage.setItem("domino_player_name", user.displayName);
        }
        setIsRegistered(true);
        localStorage.setItem("dominosfire_registered", "true");
      } else {
        const saved = localStorage.getItem("domino_player_id");
        if (saved) {
          setPlayerId(saved);
        } else {
          const newId = `player-${Math.floor(100000 + Math.random() * 900000)}`;
          localStorage.setItem("domino_player_id", newId);
          setPlayerId(newId);
        }
      }
    });
    return () => unsubscribe();
  }, []);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [mockWalletAddress, setMockWalletAddress] = useState("");
  const [rooms, setRooms] = useState<any[]>([]);
  const [activeRoom, setActiveRoom] = useState<GameRoom | null>(null);
  const [messageText, setMessageText] = useState("");
  const [selectedSkin, setSelectedSkin] = useState("skin_classic");
  const [selectedTable, setSelectedTable] = useState("table_wood");
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [joinedTournamentId, setJoinedTournamentId] = useState<string | null>(null);
  
  // Audio state
  const [soundOn, setSoundOn] = useState(true);

  // In-game selection overlay when tile can be played on BOTH left and right ends
  const [pendingChooseTile, setPendingChooseTile] = useState<{ tile: Tile; leftPlayable: boolean; rightPlayable: boolean } | null>(null);

  // Web Socket reference
  const socketRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // Gemini Commentator state
  const [geminiComment, setGeminiComment] = useState("");
  const [isSyncingComment, setIsSyncingComment] = useState(false);

  // Chat message scroller reference
  const chatBottomRef = useRef<HTMLDivElement | null>(null);

  // Fetch profiles on start
  useEffect(() => {
    fetchProfile();
    fetchRooms();
    fetchLeaderboard();
    fetchTournaments();
    connectWebSocket();

    return () => {
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, [playerId]);

  useEffect(() => {
    if (chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [activeRoom?.messages]);

  const fetchProfile = async () => {
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: playerId, name: localStorage.getItem("domino_player_name") || "" })
      });
      const data = await res.json();
      setProfile(data);
    } catch (e) {
      console.error("Failed to load profile", e);
    }
  };

  const fetchRooms = async () => {
    try {
      const res = await fetch("/api/rooms");
      const data = await res.json();
      setRooms(data);
    } catch (e) {
      console.error("Failed loading rooms", e);
    }
  };

  const fetchLeaderboard = async () => {
    try {
      const res = await fetch("/api/leaderboard");
      const data = await res.json();
      setLeaderboard(data);
    } catch (e) {
      console.error("Failed loading leaderboard", e);
    }
  };

  const fetchTournaments = async () => {
    try {
      const res = await fetch("/api/tournaments");
      const data = await res.json();
      setTournaments(data);
    } catch (e) {
      console.error("Failed loading tournaments", e);
    }
  };

  const connectWebSocket = () => {
    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const socketUrl = `${wsProtocol}//${window.location.host}`;
    
    console.log("Connecting Web Socket to:", socketUrl);
    const ws = new WebSocket(socketUrl);
    socketRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      ws.send(JSON.stringify({
        type: "register-socket",
        playerId
      }));
    };

    ws.onclose = () => {
      setIsConnected(false);
      // Auto reconnect after 3 seconds
      setTimeout(connectWebSocket, 3000);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        console.log("WS Received event:", msg);

        switch (msg.type) {
          case "room-created":
          case "room-updated":
          case "round-started": {
            setActiveRoom(msg.room);
            setActiveTab("game");
            if (soundOn) playTileShuffle();
            break;
          }

          case "play-success": {
            if (soundOn) playTileClack();
            break;
          }

          case "tile-drawn": {
            if (soundOn) playTileShuffle();
            break;
          }

          case "player-passed": {
            // Highlighting Dominican "Paso!" visual
            break;
          }

          case "round-ended": {
            setActiveRoom(msg.room);
            if (msg.comment) {
              setGeminiComment(msg.comment);
            }
            if (soundOn) playVictorySound();
            fetchProfile(); // update profiles balances
            break;
          }

          case "game-over": {
            setActiveRoom(msg.room);
            fetchProfile();
            break;
          }

          case "chat-received": {
            setActiveRoom(prev => {
              if (!prev) return null;
              return {
                ...prev,
                messages: [...prev.messages, msg.message]
              };
            });
            break;
          }

          case "error": {
            alert(msg.message);
            break;
          }

          default:
            break;
        }
      } catch (e) {
        console.error("WS parse error", e);
      }
    };
  };

  const handleCreateRoom = (mode: "1v1" | "2v2", stake: number, drawMode: "con_loma" | "sin_loma") => {
    if (!profile || profile.coins < stake) {
      alert("No tienes suficientes monedas para entrar en esta mesa de apuesta.");
      return;
    }
    
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: "create-room",
        playerId,
        mode,
        drawMode,
        pointsToWin: 100,
        stakeAmount: stake,
        isPrivate: false
      }));
    }
  };

  const handleJoinByCode = (code: string) => {
    if (!code.trim()) return;
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: "join-room",
        playerId,
        code: code.trim().toUpperCase()
      }));
    }
  };

  const handleJoinRoom = (roomId: string, stake: number) => {
    if (!profile || profile.coins < stake) {
      alert("Monedas insuficientes.");
      return;
    }
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: "join-room",
        playerId,
        roomId
      }));
    }
  };

  const handleFillBots = () => {
    if (activeRoom && socketRef.current) {
      socketRef.current.send(JSON.stringify({
        type: "fill-bots",
        roomId: activeRoom.id
      }));
    }
  };

  const handleLeaveRoom = () => {
    if (activeRoom && socketRef.current) {
      socketRef.current.send(JSON.stringify({
        type: "leave-room"
      }));
    }
    setActiveRoom(null);
    setActiveTab("lobby");
    fetchRooms();
  };

  const handlePlayTileClick = (tile: Tile) => {
    if (!activeRoom || activeRoom.status !== "playing") return;
    
    // Check if it is current player's turn
    const currentTurnPlayer = activeRoom.players[activeRoom.currentPlayerIndex];
    if (currentTurnPlayer.id !== playerId) return;

    const leftVal = activeRoom.leftEnd;
    const rightVal = activeRoom.rightEnd;

    const matchesLeft = leftVal === null || tile[0] === leftVal || tile[1] === leftVal;
    const matchesRight = rightVal === null || tile[0] === rightVal || tile[1] === rightVal;

    if (!matchesLeft && !matchesRight) {
      alert("Ficha no cuadra con ninguna de las cabezas.");
      return;
    }

    if (leftVal !== null && rightVal !== null && matchesLeft && matchesRight) {
      // Must prompt choose left or right play
      setPendingChooseTile({ tile, leftPlayable: true, rightPlayable: true });
    } else {
      // Plays automatically on the single matching edge
      const end = matchesLeft ? "left" : "right";
      executePlayTile(tile, end);
    }
  };

  const executePlayTile = (tile: Tile, end: "left" | "right") => {
    if (socketRef.current && activeRoom) {
      socketRef.current.send(JSON.stringify({
        type: "play-tile",
        roomId: activeRoom.id,
        playerId,
        tile,
        end
      }));
      setPendingChooseTile(null);
    }
  };

  const handleDrawTile = () => {
    if (activeRoom && socketRef.current) {
      socketRef.current.send(JSON.stringify({
        type: "draw-tile",
        roomId: activeRoom.id,
        playerId
      }));
    }
  };

  const handlePassTurn = () => {
    if (activeRoom && socketRef.current) {
      socketRef.current.send(JSON.stringify({
        type: "pass-turn",
        roomId: activeRoom.id,
        playerId
      }));
    }
  };

  const handleSendChat = (presetText?: string) => {
    const text = presetText || messageText;
    if (!text.trim() || !activeRoom) return;

    if (socketRef.current) {
      socketRef.current.send(JSON.stringify({
        type: "send-chat",
        roomId: activeRoom.id,
        playerId,
        text,
        isPreset: !!presetText
      }));
    }
    if (!presetText) setMessageText("");
  };

  const handleConnectWalletSubmit = async () => {
    if (!mockWalletAddress.includes("0x") || mockWalletAddress.length < 30) {
      alert("Por favor introduce una dirección Ethereum / EVM válida.");
      return;
    }
    
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: playerId, walletAddress: mockWalletAddress })
      });
      const data = await res.json();
      setProfile(data);
      setShowWalletModal(false);
      alert("¡Wallet Web3 asociada con éxito! Desbloqueaste el Tablero de Caoba y un bono de 500 monedas Quisqueya.");
    } catch (e) {
      console.error(e);
    }
  };

  const triggerDailyClaim = async () => {
    try {
      const res = await fetch("/api/daily-claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: playerId })
      });
      const data = await res.json();
      if (data.success) {
        alert(`¡Recompensa Diaria Cobrada! +1,000 Monedas Quisqueya, +150 EXP.`);
        fetchProfile();
      }
    } catch (e) {
      alert("Error cobrando recompensa.");
    }
  };

  const triggerGeminiTrolling = async () => {
    if (isSyncingComment) return;
    setIsSyncingComment(true);
    try {
      const res = await fetch("/api/gemini/commentate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context: "El jugador está perdiendo la paciencia en la mesa de dominó del colmado" })
      });
      const data = await res.json();
      setGeminiComment(data.comment);
    } catch (e) {
      console.error(e);
    } finally {
      setIsSyncingComment(false);
    }
  };

  // Preset Traditional Dominican Sayings for instant high-fidelity feedback Chat popup
  const QUICK_COMMENT_SAYINGS = [
    "¡Me fui con el doble seis!",
    "¡Eso e' capicúa señores!",
    "¡Trancao por estar pensando tanto!",
    "¡Paso, no tengo nada de nada!",
    "¡La cabeza del mudo vale oro!",
    "¿Que lo que con esa jugada concho?"
  ];

  // UI state variables
  const myRoomState = activeRoom;
  const meAsPlayer = myRoomState?.players.find(p => p.id === playerId);
  const isMyTurn = myRoomState && myRoomState.players[myRoomState.currentPlayerIndex]?.id === playerId;

  if (!isRegistered) {
    return (
      <WelcomeRegisterScreen 
        onRegisterComplete={(chosenName, chosenApodo, googleUser = null) => {
          if (googleUser) {
            setPlayerId(googleUser.uid);
            localStorage.setItem("dominosfire_registered", "true");
            setIsRegistered(true);
            
            fetch("/api/profile", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ 
                userId: googleUser.uid, 
                name: googleUser.displayName || chosenName,
                avatarUrl: googleUser.photoURL || "" 
              })
            }).then(() => {
              fetchProfile();
            });
          } else {
            const finalName = chosenApodo ? `${chosenName} "${chosenApodo}"` : chosenName;
            localStorage.setItem("domino_player_name", finalName);
            localStorage.setItem("dominosfire_registered", "true");
            setIsRegistered(true);
            
            fetch("/api/profile", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ 
                userId: playerId, 
                name: finalName 
              })
            }).then(() => {
              fetchProfile();
            });
          }
        }} 
      />
    );
  }

  return (
    <div id="pwa_root" className="min-h-screen bg-neutral-950 text-neutral-100 font-sans flex flex-col antialiased">
      {/* Universal Top Header */}
      <header id="main_header" className="bg-neutral-900 border-b border-neutral-800 py-3 px-4 flex justify-between items-center sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <div className="bg-gradient-to-tr from-amber-500 to-red-600 p-1.5 rounded-lg shadow-inner">
            <span className="text-xl font-bold tracking-wider text-black">🔥</span>
          </div>
          <div>
            <h1 className="font-sans font-extrabold text-sm tracking-tight md:text-md text-transparent bg-gradient-to-r from-white via-amber-200 to-amber-500 bg-clip-text">Dominosfire</h1>
            <p className="font-mono text-[9px] text-amber-500 uppercase tracking-widest leading-none">El Mambo del Dominó</p>
          </div>
        </div>

        {/* Global Stats bar */}
        <div className="flex items-center gap-3">
          {profile && (
            <div className="hidden sm:flex items-center gap-3 bg-neutral-950 px-3 py-1.5 rounded-full border border-neutral-800 text-xs text-neutral-300">
              <span className="flex items-center gap-1 text-yellow-400 font-bold">
                <Coins className="w-3.5 h-3.5" />
                {profile.coins.toLocaleString()}
              </span>
              <span className="text-neutral-500">|</span>
              <span className="text-teal-400 font-medium">Nivel {profile.level}</span>
            </div>
          )}

          <button 
            onClick={() => setSoundOn(!soundOn)}
            className="p-2 bg-neutral-800 hover:bg-neutral-700 rounded-full text-neutral-400 hover:text-white transition-all cursor-pointer"
            title="Toggle Sounds"
          >
            {soundOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

          {/* Firebase user account badge / progress indicator */}
          {auth.currentUser ? (
            <div className="flex items-center gap-1 bg-violet-950/40 text-violet-300 px-3 py-1.5 rounded-full border border-violet-800/80 text-xs">
              <Shield className="w-3.5 h-3.5 text-violet-400 animate-pulse" />
              <span>{auth.currentUser.displayName || "Socio"}</span>
            </div>
          ) : (
            <button
              onClick={() => setActiveTab("profile")}
              className="hidden lg:flex items-center gap-1.5 bg-neutral-800 hover:bg-violet-950 hover:text-violet-300 text-neutral-400 px-3 py-1.5 rounded-full border border-neutral-700 transition-all text-xs cursor-pointer"
            >
              <Shield className="w-3.5 h-3.5 text-violet-500" />
              Guardar Progreso Cloud
            </button>
          )}

          {!profile?.walletAddress ? (
            <button 
              onClick={() => {
                setMockWalletAddress("");
                setShowWalletModal(true);
              }}
              className="px-3.5 py-1.5 bg-gradient-to-r from-teal-500 to-emerald-600 text-black font-semibold rounded-full text-xs hover:shadow-[0_0_15px_rgba(20,184,166,0.4)] transition-all cursor-pointer"
            >
              Conectar Wallet EVM
            </button>
          ) : (
            <div className="hidden md:flex items-center gap-1 text-[11px] bg-teal-950/40 text-teal-300 px-3 py-1 rounded-full border border-teal-800">
              <Shield className="w-3 h-3 text-teal-400" />
              <span>{profile.walletAddress.slice(0, 6)}...{profile.walletAddress.slice(-4)}</span>
            </div>
          )}
        </div>
      </header>

      {/* Main Core View Router Container */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 py-6 flex flex-col">
        {activeTab === "lobby" && (
          <div id="lobby_panel" className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fadeIn">
            {/* Left Column: Direct Launcher and Options */}
            <div className="lg:col-span-2 space-y-6">
              
              {/* Daily Reward claim section */}
              {profile && (
                <div className="bg-gradient-to-r from-amber-600/30 via-red-600/20 to-neutral-900 rounded-2xl p-5 border border-amber-500/30 flex justify-between items-center shadow-lg relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-1 opacity-10">
                    <Crown className="w-32 h-32 text-amber-500" />
                  </div>
                  <div className="space-y-1 relative z-10">
                    <span className="text-[10px] bg-amber-500/20 text-amber-300 font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">Premio Diario</span>
                    <h3 className="text-lg font-bold">¡Reclama tu bono Quisqueya diaria!</h3>
                    <p className="text-xs text-neutral-400">Sumérgete en la partida y reclama de forma gratuita 1,000 monedas cada 24 horas.</p>
                  </div>
                  <button
                    onClick={triggerDailyClaim}
                    className="relative z-10 cursor-pointer px-5 py-2.5 bg-amber-500 text-black font-extrabold text-sm rounded-xl hover:bg-amber-400 active:scale-95 transition-all shadow-[0_4px_10px_rgba(245,158,11,0.2)]"
                  >
                    COBRAR 1,000 COINS
                  </button>
                </div>
              )}

              {/* Quick Game Creator Dashboard */}
              <div className="bg-neutral-900 rounded-2xl p-6 border border-neutral-800 space-y-5">
                <div className="flex gap-2 items-center">
                  <Zap className="w-5 h-5 text-amber-500" />
                  <h2 className="text-lg font-bold">Crear Nueva Mesa de Juego</h2>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="bg-neutral-950 p-4 rounded-xl border border-neutral-800 text-center flex flex-col justify-between space-y-3">
                    <div>
                      <h4 className="font-bold text-sm">Partida Rápida 1v1</h4>
                      <p className="text-xs text-neutral-500 mt-1">Con loma, juega contra un rival u oponente bot.</p>
                      <p className="text-amber-500 font-bold text-xs mt-2">Apuesta: 100 Monedas</p>
                    </div>
                    <button
                      onClick={() => handleCreateRoom("1v1", 100, "con_loma")}
                      className="w-full py-2 bg-neutral-800 hover:bg-neutral-700 text-amber-400 hover:text-white font-bold text-xs rounded-lg transition-all cursor-pointer"
                    >
                      Lanzar 1 vs 1
                    </button>
                  </div>

                  <div className="bg-neutral-950 p-4 rounded-xl border border-neutral-800 text-center flex flex-col justify-between space-y-3">
                    <div>
                      <h4 className="font-bold text-sm">Team Tradicional 2v2</h4>
                      <p className="text-xs text-neutral-500 mt-1">Clásico dominicano a 4 jugadores (2 parejas).</p>
                      <p className="text-amber-500 font-bold text-xs mt-2">Apuesta: 500 Monedas</p>
                    </div>
                    <button
                      onClick={() => handleCreateRoom("2v2", 500, "sin_loma")}
                      className="w-full py-2 bg-gradient-to-r from-amber-500 to-red-600 text-black font-extrabold text-xs rounded-lg hover:brightness-110 transition-all cursor-pointer"
                    >
                      Mesa Clásica 2 vs 2
                    </button>
                  </div>

                  <div className="bg-neutral-950 p-4 rounded-xl border border-neutral-800 text-center flex flex-col justify-between space-y-3">
                    <div>
                      <h4 className="font-bold text-sm">Mesa de Alta Apuesta (Big Boss)</h4>
                      <p className="text-xs text-neutral-500 mt-1">Copa Caoba. El campamento definitivo, sin loma.</p>
                      <p className="text-amber-500 font-bold text-xs mt-2">Apuesta: 1,000 Monedas</p>
                    </div>
                    <button
                      onClick={() => handleCreateRoom("2v2", 1000, "sin_loma")}
                      className="w-full py-2 bg-red-600 hover:bg-red-500 text-white font-bold text-xs rounded-lg transition-all cursor-pointer"
                    >
                      Torneo Big Boss
                    </button>
                  </div>
                </div>

                {/* Invite Code joining portal */}
                <div className="pt-3 border-t border-neutral-800 flex flex-col sm:flex-row gap-3 items-center">
                  <div className="w-full">
                    <label className="text-xs text-neutral-400 font-medium">¿Tienes un código de invitación?</label>
                    <p className="text-[10px] text-neutral-500">Introduce el código para unirte a una sala privada de tus amigos.</p>
                  </div>
                  <div className="w-full sm:w-auto flex gap-2">
                    <input 
                      type="text" 
                      placeholder="CÓDIGO (E.X. R5X8P)" 
                      id="lobby_invite_code_input"
                      className="bg-neutral-950 border border-neutral-800 text-center text-sm font-bold tracking-widest text-white px-3 py-2 rounded-lg outline-none focus:border-amber-500 uppercase h-10 w-44"
                    />
                    <button
                      onClick={() => {
                        const input = document.getElementById("lobby_invite_code_input") as HTMLInputElement;
                        if (input) handleJoinByCode(input.value);
                      }}
                      className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 font-bold text-xs rounded-lg transition-all h-10 cursor-pointer text-amber-400"
                    >
                      Aceptar
                    </button>
                  </div>
                </div>
              </div>

              {/* Public active rooms lobby catalog */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <h3 className="text-md font-bold flex items-center gap-2">
                    <Users className="w-4 h-4 text-amber-500" />
                    Mesas Disponibles en Tiempo Real
                  </h3>
                  <button 
                    onClick={fetchRooms}
                    className="p-1 px-3 bg-neutral-900 border border-neutral-800 rounded-lg text-xs hover:bg-neutral-800 transition-all flex items-center gap-1.5 cursor-pointer text-neutral-400 hover:text-white"
                  >
                    <RefreshCw className="w-3 h-3" /> Actualizar
                  </button>
                </div>

                {rooms.length === 0 ? (
                  <div className="bg-neutral-900/50 rounded-xl p-8 border border-neutral-800 text-center space-y-2">
                    <p className="text-sm text-neutral-400 font-semibold">No hay salas de juego activas públicas en este momento.</p>
                    <p className="text-xs text-neutral-500">¿Qué tal si abres una mesa propia Quisqueyana arriba e invitas bots u otros jugadores?</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {rooms.map(room => (
                      <div key={room.id} className="bg-neutral-900 border border-neutral-800 p-4 rounded-xl flex justify-between items-center hover:border-amber-500/40 transition-all shadow-sm">
                        <div className="space-y-1">
                          <span className="text-[10px] bg-red-500/20 text-red-300 px-2 py-0.5 rounded-full font-bold uppercase">{room.mode}</span>
                          <h4 className="font-bold text-sm text-white">{room.name}</h4>
                          <p className="text-[11px] text-neutral-400 text-left">
                            Apuesta: <span className="text-amber-500 font-bold">{room.stakeAmount} Coins</span> • {room.drawMode === "con_loma" ? "Con Loma" : "Sin Loma"}
                          </p>
                        </div>
                        <div className="text-right space-y-2">
                          <span className="block text-xs text-neutral-400 font-mono tracking-wider">{room.playersCount}/{room.maxPlayers} Jugadores</span>
                          <button
                            onClick={() => handleJoinRoom(room.id, room.stakeAmount)}
                            className="px-3.5 py-1.5 bg-neutral-800 hover:bg-amber-500 hover:text-black font-extrabold text-xs rounded-lg transition-all text-amber-500 cursor-pointer"
                          >
                            Unirse
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: User Mini Dashboard, Web3 Customizations shop */}
            <div className="space-y-6">
              {profile && (
                <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 space-y-4">
                  <div className="flex gap-3 items-center">
                    <img 
                      src={profile.avatarUrl} 
                      alt="Avatar" 
                      className="w-12 h-12 rounded-xl bg-neutral-800 border-2 border-amber-500"
                    />
                    <div>
                      <h3 className="font-bold text-md text-white">{profile.name}</h3>
                      <div className="flex gap-2 items-center text-xs text-neutral-400">
                        <span className="flex items-center gap-0.5 text-xs">🇩🇴 Quisqueya DO</span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center text-xs bg-neutral-950 p-3 rounded-xl border border-neutral-800/60">
                    <div>
                      <span className="text-neutral-500 block text-[9.5px] uppercase">Partidas</span>
                      <strong className="text-md font-bold text-white">{profile.stats.played}</strong>
                    </div>
                    <div>
                      <span className="text-neutral-500 block text-[9.5px] uppercase">Ganadas</span>
                      <strong className="text-md font-bold text-emerald-400">{profile.stats.won}</strong>
                    </div>
                    <div>
                      <span className="text-neutral-500 block text-[9.5px] uppercase">Efectividad</span>
                      <strong className="text-md font-bold text-teal-400">
                        {profile.stats.played > 0 ? ((profile.stats.won / profile.stats.played) * 100).toFixed(0) : 0}%
                      </strong>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-xs text-neutral-400">
                      <span>Progreso Nivel {profile.level}</span>
                      <span>{profile.xp % 500} / 500 XP</span>
                    </div>
                    <div className="w-full h-1.5 bg-neutral-950 rounded-full overflow-hidden border border-neutral-800">
                      <div 
                        className="bg-gradient-to-r from-amber-500 to-red-500 h-full rounded-full"
                        style={{ width: `${((profile.xp % 500) / 500) * 100}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              )}

              {/* Skins & Customizations Shop */}
              <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 space-y-4">
                <div className="flex gap-2 items-center text-md font-bold">
                  <Layers className="w-4 h-4 text-emerald-400" />
                  <h4>Skins & Customización Web3</h4>
                </div>
                <p className="text-xs text-neutral-400 leading-relaxed">
                  Personaliza tu experiencia de juego. Usa tus Monedas o asocia tu wallet de MetaMask para lucir tus fichas Quisqueyanas de colección.
                </p>

                <div className="space-y-3">
                  <div>
                    <label className="text-[11px] uppercase tracking-wider text-neutral-500 font-bold block mb-2">Diseño de Fichas (Skins)</label>
                    <div className="space-y-2">
                      {TILE_SKINS.map(skin => (
                        <button
                          key={skin.id}
                          onClick={() => {
                            setSelectedSkin(skin.id);
                            if (soundOn) playTileClack();
                          }}
                          className={`w-full p-2.5 rounded-lg border text-left flex justify-between items-center transition-all cursor-pointer ${
                            selectedSkin === skin.id ? "bg-neutral-800 border-amber-500" : "bg-neutral-950 border-neutral-800/80 hover:bg-neutral-900"
                          }`}
                        >
                          <div>
                            <p className="text-xs font-semibold text-white">{skin.name}</p>
                            <p className="text-[10px] text-neutral-500">
                              {skin.id === "skin_classic" ? "Gratis de fábrica" : "Premio de Temporada"}
                            </p>
                          </div>
                          <div className={`w-8 h-5 flex p-0.5 rounded gap-0.5 border ${skin.bg}`}>
                            <div className="flex-1 bg-transparent border-r border-neutral-500/50 flex justify-center items-center">
                              <span className={`w-1 h-1 rounded-full ${skin.pips}`}></span>
                            </div>
                            <div className="flex-1 bg-transparent flex justify-center items-center">
                              <span className={`w-1 h-1 rounded-full ${skin.pips}`}></span>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="pt-2">
                    <label className="text-[11px] uppercase tracking-wider text-neutral-500 font-bold block mb-2">Paño de la Mesa</label>
                    <div className="grid grid-cols-3 gap-2">
                      {TABLE_SKINS.map(t => (
                        <button
                          key={t.id}
                          onClick={() => {
                            setSelectedTable(t.id);
                            if (soundOn) playTileShuffle();
                          }}
                          style={{ background: t.style }}
                          className={`h-11 rounded-lg border flex flex-col justify-end p-1 hover:brightness-110 active:scale-95 transition-all text-[8px] font-bold tracking-widest leading-none text-center cursor-pointer ${
                            selectedTable === t.id ? "border-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.3)]" : "border-neutral-800"
                          }`}
                        >
                          <span className={`${t.text} truncate w-full filter drop-shadow`}>{t.name.split(" ")[0]}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Global Active Arena Panel */}
        {activeTab === "game" && myRoomState && (
          <div id="game_arena" className="grid grid-cols-1 lg:grid-cols-4 gap-6 animate-fadeIn">
            
            {/* Left 3 Columns: Wooden Dominoes Playing Board */}
            <div className="lg:col-span-3 flex flex-col gap-4">
              
              {/* Game state and match point info bar */}
              <div className="bg-neutral-900 px-4 py-3 rounded-xl border border-neutral-800 flex justify-between items-center">
                <div className="space-y-1">
                  <span className="text-[10px] uppercase font-bold text-amber-500 tracking-wider">
                    Fase: {myRoomState.status === "playing" ? `Mano Ronda #${myRoomState.roundNumber}` : "Fin de Partida"}
                  </span>
                  <div className="flex gap-3 text-xs text-neutral-300">
                    <p>Mesa: <span className="font-bold text-white">{myRoomState.name}</span></p>
                    <p>• Mode: <span className="font-bold text-amber-500">{myRoomState.mode === "1v1" ? "1 vs 1" : "2 vs 2 Clásico"}</span></p>
                    <p>• Meta: <span className="font-bold text-teal-400">{myRoomState.pointsToWin} Puntos</span></p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={handleLeaveRoom}
                    className="p-1.5 px-3 bg-red-950 border border-red-900/60 hover:bg-red-900 hover:text-white rounded-lg text-xs font-bold text-red-400 transition-all cursor-pointer"
                  >
                    Salir de Sala
                  </button>
                </div>
              </div>

              {/* Core Domino Colmado Table */}
              <div 
                id="colmado_table"
                style={{ background: TABLE_SKINS.find(ts => ts.id === selectedTable)?.style }}
                className="aspect-video w-full rounded-2xl relative border-4 border-amber-950 hover:border-amber-900/40 shadow-2xl flex flex-col justify-between p-6 overflow-hidden md:min-h-[460px]"
              >
                {/* Visual Ambient overlay dropshadow */}
                <div className="absolute inset-0 bg-black/10 pointer-events-none"></div>

                {/* Seat Top Player (Team 2 partner if 2v2 or spectator/bot in 1v1) */}
                <div className="w-full flex justify-center z-10">
                  {myRoomState.players.length > 2 ? (
                    <PlayerTab seatPosition="top" player={myRoomState.players[2]} activeTurnIdx={myRoomState.currentPlayerIndex} myIndex={2} />
                  ) : (
                    <div className="text-[10px] bg-neutral-950/40 text-neutral-400 px-3 py-1 rounded-full border border-neutral-800">
                      Mesa de Juego 1 vs 1
                    </div>
                  )}
                </div>

                {/* Left Seat & Line Of Play Arena & Right Seat */}
                <div className="flex-1 w-full grid grid-cols-4 items-center gap-2">
                  
                  {/* Seat Left Player (Seat index 1) */}
                  <div className="flex justify-start">
                    {myRoomState.players.length > 1 ? (
                      <PlayerTab seatPosition="left" player={myRoomState.players[1]} activeTurnIdx={myRoomState.currentPlayerIndex} myIndex={1} />
                    ) : <div />}
                  </div>

                  {/* Line of Play Center Scroll Board (Domino pieces) */}
                  <div className="col-span-2 flex flex-col justify-center items-center h-full">
                    {myRoomState.board.length === 0 ? (
                      <div className="text-center p-6 bg-black/40 rounded-xl max-w-xs border border-amber-500/20 shadow-lg backdrop-blur">
                        <p className="text-amber-500 font-bold text-sm">Ronda de Inicio Libre</p>
                        <p className="text-xs text-neutral-400 mt-1">
                          {myRoomState.roundNumber === 1 
                            ? "El que tenga el Doble Seis [6,6] abre la partida Quisqueyana de una vez." 
                            : "¡Salida Libre! El ganador de la ronda previa juega cualquier ficha primero."
                          }
                        </p>
                        
                        {myRoomState.status === "waiting" && (
                          <button
                            onClick={handleFillBots}
                            className="mt-4 px-4 py-2 bg-gradient-to-r from-teal-500 to-emerald-500 text-black font-extrabold text-xs rounded-lg active:scale-95 transition-all shadow cursor-pointer"
                          >
                            Rellenar con Bots AI 🤖
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="w-full flex flex-col items-center justify-center space-y-4">
                        {/* Outer Head value numbers for guide */}
                        <div className="flex gap-4 text-xs font-mono py-1 px-3 bg-black/40 border border-neutral-800 rounded-full">
                          <span>Cabeza Izq: <strong className="text-amber-500">{myRoomState.leftEnd}</strong></span>
                          <span>Cabeza Der: <strong className="text-amber-500">{myRoomState.rightEnd}</strong></span>
                        </div>

                        {/* Interactive Domino Sequence Canvas row */}
                        <div className="flex flex-row items-center justify-center gap-2 max-w-full overflow-x-auto px-4 py-3 custom-scrollbar scroll-smooth">
                          {myRoomState.board.map((tile, idx) => {
                            const isDouble = tile[0] === tile[1];
                            const tileConfig = TILE_SKINS.find(s => s.id === selectedSkin) || TILE_SKINS[0];
                            
                            return (
                              <div 
                                key={idx} 
                                className={`flex ${isDouble ? "flex-col w-10 h-16" : "flex-row w-16 h-10"} items-center justify-center rounded-lg shadow-md border ${tileConfig.bg} transform hover:scale-105 transition-all shrink-0`}
                              >
                                {/* Half Side 1 */}
                                <div className={`flex-1 ${isDouble ? "w-full" : "h-full"} flex items-center justify-center p-0.5`}>
                                  <PipMatrix value={tile[0]} pipsClass={tileConfig.pips} />
                                </div>

                                {/* Divider Line */}
                                <div className={isDouble ? `h-[1px] w-full ${tileConfig.line}` : `w-[1px] h-full ${tileConfig.line}`}></div>

                                {/* Half Side 2 */}
                                <div className={`flex-1 ${isDouble ? "w-full" : "h-full"} flex items-center justify-center p-0.5`}>
                                  <PipMatrix value={tile[1]} pipsClass={tileConfig.pips} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Seat Right Player (Seat index 3) */}
                  <div className="flex justify-end">
                    {myRoomState.players.length > 3 ? (
                      <PlayerTab seatPosition="right" player={myRoomState.players[3]} activeTurnIdx={myRoomState.currentPlayerIndex} myIndex={3} />
                    ) : (
                      <div className="text-[10px] bg-neutral-950/40 text-neutral-400 px-3 py-1 rounded-full border border-neutral-800">
                        1v1 sin loma / con loma
                      </div>
                    )}
                  </div>
                </div>

                {/* Seat Bottom Player (The actual local User) */}
                <div className="w-full flex justify-center z-10">
                  {myRoomState.players.length > 0 ? (
                    <PlayerTab seatPosition="bottom" player={myRoomState.players[0]} activeTurnIdx={myRoomState.currentPlayerIndex} myIndex={0} isSelf={true} />
                  ) : <div />}
                </div>
              </div>

              {/* Dominican Humorous Commentary Banner (Gemini AI Agent) */}
              <div className="bg-neutral-900 border border-amber-500/20 p-4 rounded-xl flex items-start gap-3 w-full animate-fadeIn shadow-md">
                <div className="bg-amber-500/10 p-2 rounded-lg shrink-0 border border-amber-500/20">
                  <span className="text-xl">🎙️</span>
                </div>
                <div className="flex-1 space-y-1">
                  <header className="flex justify-between items-center">
                    <h5 className="font-bold text-xs text-amber-500 uppercase tracking-widest leading-none">Narrador de Colmado Santo Domingo</h5>
                    <button 
                      onClick={triggerGeminiTrolling}
                      disabled={isSyncingComment}
                      className="text-[10px] text-teal-400 hover:text-white flex items-center gap-1 cursor-pointer disabled:opacity-50"
                    >
                      🗣️ Molestar Narrador
                    </button>
                  </header>
                  <p className="text-xs italic text-neutral-300 leading-relaxed">
                    {geminiComment || "¡Abran paso señores, que este dominó está por ponerse caliente!"}
                  </p>
                </div>
              </div>

              {/* Interactive Player Hand Control Bar */}
              <div className="bg-neutral-900 rounded-2xl p-5 border border-neutral-800 space-y-4">
                <div className="flex flex-col sm:flex-row justify-between items-center gap-3">
                  <div>
                    <h3 className="font-bold text-sm text-neutral-200">Mis Fichas Disponibles</h3>
                    <p className="text-[11px] text-neutral-500">Haz clic en una ficha que coincida para colocarla de inmediato sobre la mesa dominicana.</p>
                  </div>

                  <div className="flex gap-2 w-full sm:w-auto">
                    {myRoomState.drawMode === "con_loma" && (
                      <button
                        onClick={handleDrawTile}
                        disabled={!isMyTurn || myRoomState.deck.length === 0}
                        className="flex-1 sm:flex-none px-4 py-2 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 font-bold text-xs text-neutral-300 hover:text-white rounded-lg transition-all h-9 cursor-pointer border border-neutral-800"
                      >
                        Robar de Loma ({myRoomState.deck.length})
                      </button>
                    )}
                    <button
                      onClick={handlePassTurn}
                      disabled={!isMyTurn}
                      className="flex-1 sm:flex-none px-4 py-2 bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500 hover:text-black hover:border-amber-500 disabled:opacity-50 font-bold text-xs rounded-lg transition-all h-9 cursor-pointer"
                    >
                      Dar un Paso ("PASA")
                    </button>
                  </div>
                </div>

                {/* Drawn pieces scroll container horizontal */}
                <div className="bg-neutral-950 p-4 rounded-xl border border-neutral-800/80 min-h-24 flex items-center justify-center gap-4 overflow-x-auto custom-scrollbar">
                  {meAsPlayer?.tiles.length === 0 ? (
                    <p className="text-xs text-neutral-500">¿No posees fichas? Ronda terminada o sin repartir de loma.</p>
                  ) : (
                    meAsPlayer?.tiles.map((tile, index) => {
                      const skinDef = TILE_SKINS.find(s => s.id === selectedSkin) || TILE_SKINS[0];
                      const leftVal = myRoomState.leftEnd;
                      const rightVal = myRoomState.rightEnd;
                      
                      const fits = isMyTurn && (
                        leftVal === null || 
                        tile[0] === leftVal || 
                        tile[1] === leftVal || 
                        tile[0] === rightVal || 
                        tile[1] === rightVal
                      );

                      return (
                        <button
                          key={index}
                          onClick={() => handlePlayTileClick(tile)}
                          disabled={!fits}
                          className={`w-12 h-20 rounded-xl border-2 flex flex-col justify-between p-1 transition-all transform hover:-translate-y-2 active:scale-95 cursor-pointer relative ${skinDef.bg} ${
                            fits ? "ring-2 ring-amber-500 shadow-[0_5px_15px_rgba(245,158,11,0.25)] scale-105" : "opacity-60 grayscale-[10%]"
                          }`}
                        >
                          {/* Top Pip panel */}
                          <div className="flex-1 w-full flex items-center justify-center">
                            <PipMatrix value={tile[0]} pipsClass={skinDef.pips} />
                          </div>

                          {/* Line */}
                          <div className={`h-[1px] w-full ${skinDef.line}`}></div>

                          {/* Bottom Pip panel */}
                          <div className="flex-1 w-full flex items-center justify-center">
                            <PipMatrix value={tile[1]} pipsClass={skinDef.pips} />
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* Right Column Grid 4: Real-time Arena chat, invite keys details */}
            <div className="space-y-4 flex flex-col h-[650px] lg:h-auto">
              
              {/* Room details card details info */}
              <div className="bg-neutral-900 rounded-xl p-4 border border-neutral-800 space-y-3">
                <h4 className="font-bold text-xs text-neutral-400 uppercase tracking-wider">Detalles de Invitación</h4>
                <div className="flex justify-between items-center bg-neutral-950 p-2.5 rounded-lg border border-neutral-800/80">
                  <div>
                    <span className="text-[10px] text-neutral-500 block leading-none mb-1">CÓDIGO DE INVITACIÓN</span>
                    <strong className="font-mono text-sm tracking-widest text-white">{myRoomState.code}</strong>
                  </div>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(myRoomState.code);
                      alert("¡Código Quisqueya copiado al portapapeles! Envíalo a un contrincante para jugar.");
                    }}
                    className="p-1 px-3 bg-neutral-800 hover:bg-neutral-700 text-amber-500 rounded text-[10px] font-bold tracking-wider cursor-pointer"
                  >
                    COPIAR
                  </button>
                </div>
              </div>

              {/* Chat Container area */}
              <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 flex-1 flex flex-col justify-between overflow-hidden">
                <div className="flex gap-2 items-center text-xs font-bold text-neutral-400 border-b border-neutral-800 pb-3 mb-3">
                  <MessageSquare className="w-4 h-4 text-teal-400" />
                  <h4>Chat Multiusuario Activo</h4>
                </div>

                {/* Scroller chats list messages */}
                <div className="flex-1 space-y-3 overflow-y-auto pr-1 mb-3 custom-scrollbar">
                  {myRoomState.messages.length === 0 ? (
                    <div className="h-full flex flex-col justify-center items-center text-center p-3">
                      <p className="text-[11px] text-neutral-500">No hay chats en la mesa de dominó todavía.</p>
                      <p className="text-[10px] text-neutral-600 mt-1">Envía una ocurrencia dominicana instantánea con los atajos abajo.</p>
                    </div>
                  ) : (
                    myRoomState.messages.map(msg => {
                      const isMe = msg.senderId === playerId;
                      return (
                        <div key={msg.id} className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] text-neutral-500 font-bold">{msg.senderName}</span>
                          </div>
                          <div className={`p-2.5 rounded-xl text-xs max-w-[90%] mt-1 ${
                            isMe ? "bg-amber-500 text-black font-semibold rounded-tr-none" : "bg-neutral-950 text-neutral-200 rounded-tl-none border border-neutral-800/80"
                          }`}>
                            {msg.text}
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={chatBottomRef} />
                </div>

                {/* Atajo Preset Dominican commentaries row */}
                <div className="py-2 border-t border-neutral-800">
                  <span className="text-[10px] text-neutral-400 uppercase tracking-wider font-bold block mb-1.5">Atajos Dominicanos:</span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {QUICK_COMMENT_SAYINGS.slice(0, 4).map((saying, i) => (
                      <button
                        key={i}
                        onClick={() => handleSendChat(saying)}
                        className="p-1 px-1.5 bg-neutral-950 hover:bg-neutral-800 border border-neutral-800 hover:border-amber-500/20 text-neutral-300 hover:text-amber-400 text-[10px] text-left rounded truncate transition-all cursor-pointer"
                        title={saying}
                      >
                        🗣️ {saying}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Typing form elements and input */}
                <form 
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSendChat();
                  }}
                  className="flex gap-2 pt-2 border-t border-neutral-800"
                >
                  <input 
                    type="text"
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    placeholder="Escribe que lo que..."
                    className="flex-1 bg-neutral-950 border border-neutral-800 text-xs text-white p-2 rounded-lg outline-none focus:border-amber-500 h-9"
                  />
                  <button
                    type="submit"
                    className="p-2 px-3 bg-amber-500 hover:bg-amber-400 text-black rounded-lg hover:brightness-110 active:scale-95 transition-all text-xs font-semibold shrink-0 cursor-pointer h-9 flex items-center justify-center"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* Global Automated Tournament simulator view */}
        {activeTab === "tournaments" && (
          <div id="tourneys_panel" className="space-y-6 animate-fadeIn">
            <div className="bg-gradient-to-r from-red-600/20 via-neutral-900 to-amber-500/20 p-6 rounded-2xl border border-neutral-800/80 text-center max-w-2xl mx-auto space-y-3">
              <span className="p-2 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xl inline-block">🏆</span>
              <h2 className="text-xl font-sans font-bold text-white tracking-tight">Sistema de Torneos Dominicanos Digitales</h2>
              <p className="text-xs text-neutral-300 max-w-lg mx-auto leading-relaxed">
                Apúntate en nuestra Copa Quisqueya Regional. Compite contra parejas y oponentes bot que avanzan de forma automatizada por llaves de campeonato eliminatorio (Bracket).
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {tournaments.map(tour => (
                <div key={tour.id} className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 space-y-4">
                  <header className="flex justify-between items-start">
                    <div>
                      <span className="text-[10px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full uppercase font-bold tracking-wider">{tour.status}</span>
                      <h3 className="font-bold text-md text-white mt-1">{tour.name}</h3>
                      <p className="text-xs text-neutral-400">Premio Pool: <span className="text-amber-500 font-bold">{tour.prizePool} Monedas</span></p>
                    </div>
                    <span className="text-xs text-neutral-400 font-mono tracking-wide">{tour.playersCount}/{tour.maxPlayers} Inscritos</span>
                  </header>

                  <div className="bg-neutral-950 p-4 rounded-xl border border-neutral-800/80 space-y-3">
                    <span className="text-[10px] text-neutral-500 uppercase font-bold block mb-1">Llaves de Clasificación (Ronda 1)</span>
                    {tour.rounds.length > 0 ? (
                      <div className="space-y-2">
                        {tour.rounds[0].matches.map((m, idx) => (
                          <div key={idx} className="bg-neutral-900 p-2.5 rounded-lg border border-neutral-800 flex justify-between items-center text-xs">
                            <div className="space-y-1">
                              <p className="font-semibold text-neutral-400">Teammates 1: <strong className="text-white">{m.team1.join(" & ")}</strong></p>
                              <p className="font-semibold text-neutral-400">Teammates 2: <strong className="text-white">{m.team2.join(" & ")}</strong></p>
                            </div>
                            <div className="text-right">
                              <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 font-bold block">
                                {m.score1} - {m.score2}
                              </span>
                              <span className="text-[9px] text-neutral-500 mt-1 block">Ganador: {m.winner}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-neutral-500 italic">Llaves listas cuando inicie la campana del torneo.</p>
                    )}
                  </div>

                  {joinedTournamentId === tour.id ? (
                    <div className="bg-teal-950/20 text-teal-400 text-xs font-bold text-center border border-teal-800 p-3 rounded-xl flex items-center justify-center gap-2">
                      <CheckCircle className="w-4 h-4 text-teal-400" />
                      <span>¡Apuntado en este Torneo con éxito! Esperando oponentes.</span>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setJoinedTournamentId(tour.id);
                        alert("¡Inscrito en el torneo! Recibirás una alerta cuando el bracket esté completo.");
                      }}
                      className="w-full py-2.5 bg-gradient-to-r from-amber-500 to-red-600 text-black font-extrabold text-xs rounded-xl hover:brightness-110 active:scale-95 transition-all cursor-pointer"
                    >
                      Inscribirse gratis
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Global Leaderboard Center view */}
        {activeTab === "leaderboard" && (
          <div id="leader_panel" className="space-y-6 animate-fadeIn">
            <div className="text-center space-y-2 max-w-sm mx-auto">
              <span className="inline-block text-2xl p-1 bg-gradient-to-tr from-amber-500 to-red-600 rounded-xl">🇩🇴</span>
              <h2 className="text-lg font-bold">Clasificación Global Dominicana</h2>
              <p className="text-xs text-neutral-400 leading-relaxed">
                Rank de honor Quisqueyano. Los jugadores de mayor XP, coins y efectividad de juego.
              </p>
            </div>

            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 max-w-3xl mx-auto overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-neutral-300">
                  <thead className="bg-neutral-950 text-neutral-400 uppercase tracking-widest text-[9.5px]">
                    <tr>
                      <th className="p-3 pl-4 rounded-l-lg">POSICIÓN</th>
                      <th className="p-3">JUGADOR</th>
                      <th className="p-3">PAÍS</th>
                      <th className="p-3">MONEDAS</th>
                      <th className="p-3">XP TOTAL</th>
                      <th className="p-3 text-right pr-4 rounded-r-lg">Efecto WIN</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800/80">
                    {leaderboard.map((entry, idx) => (
                      <tr key={entry.id} className="hover:bg-neutral-950/40 transition-all">
                        <td className="p-3 pl-4 font-mono font-bold text-neutral-400">
                          {idx === 0 ? "🥇 1" : idx === 1 ? "🥈 2" : idx === 2 ? "🥉 3" : `${idx + 1}`}
                        </td>
                        <td className="p-3 font-semibold text-white flex items-center gap-2">
                          {entry.nftAvatar && <span className="bg-amber-500/15 border border-amber-500/30 text-amber-500 text-[9px] px-1 rounded uppercase">NFT</span>}
                          <span>{entry.name}</span>
                        </td>
                        <td className="p-3 text-neutral-400">{entry.country === "DO" ? "🇩🇴 DO" : entry.country === "US" ? "🇺🇸 US" : "🇵🇷 PR"}</td>
                        <td className="p-3 text-yellow-400 font-bold flex items-center gap-0.5">
                          <Coins className="w-3.5 h-3.5" />
                          {entry.coins.toLocaleString()}
                        </td>
                        <td className="p-3 font-medium text-teal-400">{entry.xp.toLocaleString()} XP</td>
                        <td className="p-3 text-right pr-4 text-emerald-400 font-extrabold">{entry.ratio}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Global User Profile view & Web3 custom properties */}
        {activeTab === "profile" && profile && (
          <div id="profile_panel" className="max-w-2xl mx-auto space-y-6 animate-fadeIn">
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 space-y-5">
              <div className="flex gap-4 items-center">
                <img 
                  src={profile.avatarUrl} 
                  alt="My Avatar"
                  className="w-16 h-16 rounded-2xl bg-neutral-950 border-2 border-amber-500"
                />
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    {profile.name}
                    <span className="text-xs bg-amber-500/20 text-amber-300 font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">Level {profile.level}</span>
                  </h3>
                  <p className="text-xs text-neutral-400 mt-1">Socio de Oro Quisqueyano • ID: <span className="font-mono text-neutral-500">{profile.id}</span></p>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2">
                <div className="bg-neutral-950 p-3 rounded-xl border border-neutral-800/80 text-center">
                  <span className="text-[10px] text-neutral-500 block uppercase">Porcentaje de Victoria</span>
                  <strong className="text-xl font-bold text-emerald-400">
                    {profile.stats.played > 0 ? ((profile.stats.won / profile.stats.played) * 100).toFixed(0) : 0}%
                  </strong>
                </div>

                <div className="bg-neutral-950 p-3 rounded-xl border border-neutral-800/80 text-center">
                  <span className="text-[10px] text-neutral-500 block uppercase">Partidas Jugadas</span>
                  <strong className="text-xl font-bold text-white">{profile.stats.played}</strong>
                </div>

                <div className="bg-neutral-950 p-3 rounded-xl border border-neutral-800/80 text-center">
                  <span className="text-[10px] text-neutral-500 block uppercase">Premio Acumulado</span>
                  <strong className="text-xl font-bold text-yellow-500 flex items-center justify-center gap-0.5">
                    <Coins className="w-4 h-4" />
                    {profile.coins.toLocaleString()}
                  </strong>
                </div>

                <div className="bg-neutral-950 p-3 rounded-xl border border-neutral-800/80 text-center">
                  <span className="text-[10px] text-neutral-500 block uppercase">Capicúa de Platino</span>
                  <strong className="text-xl font-bold text-teal-400">0</strong>
                </div>
              </div>

              <hr className="border-neutral-800" />

              {/* Firebase Authentication Integration */}
              <div id="firebase_auth_section" className="bg-neutral-950 p-4 border border-violet-500/20 rounded-xl space-y-3 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-1 opacity-5">
                  <Shield className="w-24 h-24 text-violet-400" />
                </div>
                <div className="space-y-1 relative z-10">
                  <span className="text-[9px] bg-violet-500/20 text-violet-300 font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">Seguridad Firebase</span>
                  <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
                    <Shield className="w-4 h-4 text-violet-400" />
                    Progreso Sincronizado en la Nube
                  </h4>
                  <p className="text-xs text-neutral-400 leading-relaxed">
                    Inicia sesión con Google para guardar de forma permanente tu ranking, monedas de colmado, nivel y trofeos en caso de borrar el historial del navegador.
                  </p>
                </div>
                
                <div className="pt-1 relative z-10">
                  {auth.currentUser ? (
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-neutral-900/60 p-3 rounded-lg border border-neutral-800">
                      <div className="flex items-center gap-2">
                        {auth.currentUser.photoURL ? (
                          <img 
                            src={auth.currentUser.photoURL} 
                            alt="Google Avatar" 
                            className="w-8 h-8 rounded-full border border-violet-500/50" 
                            referrerPolicy="no-referrer" 
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-violet-600 flex items-center justify-center text-white text-xs font-bold">G</div>
                        )}
                        <div className="text-left">
                          <p className="text-xs font-bold text-white">{auth.currentUser.displayName || "Usuario verificado"}</p>
                          <p className="text-[10px] text-neutral-400">{auth.currentUser.email}</p>
                        </div>
                      </div>
                      <button
                        onClick={async () => {
                          try {
                            await signOut(auth);
                            alert("¡Sesión cerrada con éxito! Volviendo al modo de juego como invitado.");
                          } catch (e: any) {
                            console.error(e);
                            alert(e.message || e);
                          }
                        }}
                        className="w-full sm:w-auto px-4 py-1.5 bg-neutral-800 hover:bg-red-950/40 hover:text-red-400 text-neutral-300 text-xs font-bold rounded-lg transition-all cursor-pointer"
                      >
                        Cerrar Sesión
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={async () => {
                        try {
                          const result = await signInWithPopup(auth, googleProvider);
                          // Sync profile with server immediately
                          await fetch("/api/profile", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ 
                              userId: result.user.uid, 
                              name: result.user.displayName || "", 
                              avatarUrl: result.user.photoURL || "" 
                            })
                          });
                          fetchProfile();
                          alert(`¡Sincronización exitosa! Bienvenido, ${result.user.displayName}.`);
                        } catch (e: any) {
                          console.error("Firebase Login Error:", e);
                          alert(`Error al conectar con Google: ${e.message || e}`);
                        }
                      }}
                      className="w-full py-2.5 px-4 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-extrabold text-xs rounded-xl transition-all shadow-[0_4px_12px_rgba(109,40,217,0.3)] hover:shadow-[0_4px_18px_rgba(109,40,217,0.5)] active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <svg className="w-4 h-4 fill-current mr-1" viewBox="0 0 24 24">
                        <path d="M12.24 10.285V13.4h6.887C18.2 15.614 15.645 18 12.24 18c-3.86 0-7-3.14-7-7s3.14-7 7-7c1.7 0 3.25.61 4.45 1.615l2.42-2.42C17.435 1.74 14.935 1 12.24 1c-5.52 0-10 4.48-10 10s4.48 10 10 10c5.77 0 10-4.06 10-10 0-.675-.075-1.32-.215-1.715H12.24z"/>
                      </svg>
                      SINCRONIZAR CON GOOGLE ACCENT
                    </button>
                  )}
                </div>
              </div>

              <hr className="border-neutral-800" />

              {/* Edit nickname and save profiles */}
              <div className="space-y-2">
                <label className="text-xs text-neutral-400 font-bold uppercase tracking-wider">Actualizar Apodo Dominicano</label>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    id="profile_nickname_input"
                    placeholder="Apodo tradicional dominicano..."
                    defaultValue={profile.name}
                    className="flex-1 bg-neutral-950 border border-neutral-800 text-xs text-white p-2 px-3 rounded-lg outline-none focus:border-amber-500 h-10"
                  />
                  <button
                    onClick={async () => {
                      const val = (document.getElementById("profile_nickname_input") as HTMLInputElement).value;
                      if (!val.trim()) return;
                      localStorage.setItem("domino_player_name", val.trim());
                      try {
                        const res = await fetch("/api/profile", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ userId: playerId, name: val.trim() })
                        });
                        const data = await res.json();
                        setProfile(data);
                        alert("¡Nombre de jugador guardado correctamente!");
                      } catch (e) {
                        console.error(e);
                      }
                    }}
                    className="px-5 py-2 bg-neutral-800 hover:bg-neutral-700 text-amber-500 hover:text-white text-xs font-bold rounded-lg transition-all"
                  >
                    Guardar Apodo
                  </button>
                </div>
              </div>

              {/* NFT Collection Assets */}
              <div className="space-y-3 pt-2">
                <h4 className="font-bold text-xs text-neutral-400 uppercase tracking-wider">Colecciones y Activos Web3 Disponibles</h4>
                
                <div className="bg-neutral-950 p-4 border border-neutral-800/80 rounded-xl space-y-4">
                  {profile.walletAddress ? (
                    <div className="space-y-3">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-neutral-400">Contrato Verificado (Quisqueya NFT ERC-721)</span>
                        <span className="text-emerald-400 font-bold">● Wallet Asociada</span>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-neutral-900 p-3 rounded-lg border border-neutral-800 text-center">
                          <span className="text-[19px]">🪵</span>
                          <strong className="text-xs block text-white mt-1">Paño de Caoba Quisqueya</strong>
                          <span className="text-[9px] text-teal-400">DESBLOQUEADO</span>
                        </div>
                        <div className="bg-neutral-900 p-3 rounded-lg border border-neutral-800 text-center opacity-40">
                          <span className="text-[19px]">🏆</span>
                          <strong className="text-xs block text-white mt-1">Fichas de Oro de Bani</strong>
                          <span className="text-[9px] text-neutral-500">Colección Próximamente</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center p-3 space-y-2">
                      <p className="text-xs text-neutral-500">Asocia tu wallet EVM con el botón superior para habilitar la propiedad de tus activos NFT de dominó.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Choose left/right play direction modal when tile can match both edge lines */}
      <AnimatePresence>
        {pendingChooseTile && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-neutral-900 border border-amber-500/30 p-6 rounded-2xl w-full max-w-sm text-center space-y-5"
            >
              <h3 className="font-bold text-md text-white">¿Cuál cabeza juegas?</h3>
              <p className="text-xs text-neutral-400">La ficha matches both sides. Selecciona en cuál punta deseas anexar tu ficha dominicana:</p>
              
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => executePlayTile(pendingChooseTile.tile, "left")}
                  className="py-3 bg-neutral-800 hover:bg-neutral-700 font-bold text-xs rounded-xl hover:text-white text-amber-400 transition-all cursor-pointer"
                >
                  ◀️ JUGAR IZQUIERDA (Cabeza {myRoomState?.leftEnd})
                </button>
                <button
                  onClick={() => executePlayTile(pendingChooseTile.tile, "right")}
                  className="py-3 bg-neutral-800 hover:bg-neutral-700 font-bold text-xs rounded-xl hover:text-white text-amber-400 transition-all cursor-pointer"
                >
                  JUGAR DERECHA (Cabeza {myRoomState?.rightEnd}) ▶️
                </button>
              </div>

              <button
                onClick={() => setPendingChooseTile(null)}
                className="text-[11px] text-neutral-500 hover:text-white transition-all cursor-pointer"
              >
                Cancelar jugada
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Simulated Connect Web3 Wallet popup */}
      <AnimatePresence>
        {showWalletModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-neutral-900 border border-teal-500/20 p-6 rounded-2xl w-full max-w-md space-y-5"
            >
              <div>
                <h3 className="font-sans font-bold text-md text-white flex items-center gap-2">
                  <Shield className="w-5 h-5 text-teal-400" />
                  MetaMask / WalletConnect Web3 Portal
                </h3>
                <p className="text-xs text-neutral-400 mt-1">
                  Ingresa tu dirección de billetera EVM (Ethereum / Polygon). Habilitarás la propiedad de aspectos NFT premium en tu perfil y recibirás un trato de bienvenida.
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] uppercase font-bold text-neutral-500 block">Dirección Ethereum Pública</label>
                <input 
                  type="text"
                  placeholder="0x937f... (o tu clave EVM pública)"
                  value={mockWalletAddress}
                  onChange={(e) => setMockWalletAddress(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 p-2.5 rounded-lg text-xs font-mono text-teal-300 outline-none focus:border-teal-400"
                />
              </div>

              <div className="bg-teal-950/20 text-[11px] text-teal-400 p-3 rounded-lg border border-teal-800/40">
                ⚠️ <strong>Nota:</strong> Los usuarios pueden jugar sin conectar billetera, garantizando la diversión de libre acceso. Las opciones Web3 son opcionales.
              </div>

              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setShowWalletModal(false)}
                  className="px-4 py-2 text-xs bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white rounded-lg transition-all cursor-pointer"
                >
                  Cerrar
                </button>
                <button
                  type="button"
                  onClick={handleConnectWalletSubmit}
                  className="px-4 py-2 text-xs bg-gradient-to-r from-teal-500 to-emerald-600 font-extrabold text-black rounded-lg hover:brightness-110 active:scale-95 transition-all cursor-pointer"
                >
                  Asociar Wallet
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Nav Tab Sticky Footer Bar */}
      <footer id="bottom_navbar" className="bg-neutral-900 border-t border-neutral-800 sticky bottom-0 z-40 py-2.5 px-4 flex justify-around items-center">
        <button
          onClick={() => {
            setActiveTab("lobby");
            fetchRooms();
          }}
          className={`flex flex-col items-center gap-1 cursor-pointer transition-all ${activeTab === 'lobby' ? 'text-amber-500 scale-105' : 'text-neutral-500 hover:text-white'}`}
        >
          <Globe className="w-5 h-5" />
          <span className="text-[9.5px] font-bold tracking-wider">Lobby</span>
        </button>

        {myRoomState && (
          <button
            onClick={() => setActiveTab("game")}
            className={`flex flex-col items-center gap-1 cursor-pointer transition-all relative ${activeTab === 'game' ? 'text-amber-500 scale-105' : 'text-neutral-500 hover:text-white'}`}
          >
            <div className="w-5 h-5 flex p-0.5 rounded gap-0.5 border border-current">
              <div className="flex-1 bg-transparent border-r border-current flex justify-center items-center">
                <span className="w-0.5 h-0.5 bg-current rounded-full"></span>
              </div>
              <div className="flex-1 bg-transparent flex justify-center items-center font-bold">
                <span className="w-0.5 h-0.5 bg-current rounded-full"></span>
              </div>
            </div>
            {isMyTurn && (
              <span className="absolute -top-1 -right-1 bg-red-600 border-2 border-neutral-900 rounded-full w-2.5 h-2.5 animate-ping"></span>
            )}
            <span className="text-[9.5px] font-bold tracking-wider">Mesa</span>
          </button>
        )}

        <button
          onClick={() => {
            setActiveTab("tournaments");
            fetchTournaments();
          }}
          className={`flex flex-col items-center gap-1 cursor-pointer transition-all ${activeTab === 'tournaments' ? 'text-amber-500 scale-105' : 'text-neutral-500 hover:text-white'}`}
        >
          <Trophy className="w-5 h-5" />
          <span className="text-[9.5px] font-bold tracking-wider">Torneos</span>
        </button>

        <button
          onClick={() => {
            setActiveTab("leaderboard");
            fetchLeaderboard();
          }}
          className={`flex flex-col items-center gap-1 cursor-pointer transition-all ${activeTab === 'leaderboard' ? 'text-amber-500 scale-105' : 'text-neutral-500 hover:text-white'}`}
        >
          <Award className="w-5 h-5" />
          <span className="text-[9.5px] font-bold tracking-wider">Líderes</span>
        </button>

        <button
          onClick={() => {
            setActiveTab("profile");
            fetchProfile();
          }}
          className={`flex flex-col items-center gap-1 cursor-pointer transition-all ${activeTab === 'profile' ? 'text-amber-500 scale-105' : 'text-neutral-500 hover:text-white'}`}
        >
          <User className="w-5 h-5" />
          <span className="text-[9.5px] font-bold tracking-wider">Perfil</span>
        </button>
      </footer>
    </div>
  );
}

// Seat Tag Widget Component
function PlayerTab({ seatPosition, player, activeTurnIdx, myIndex, isSelf = false }: { 
  seatPosition: 'top' | 'left' | 'right' | 'bottom'; 
  player?: Player; 
  activeTurnIdx: number; 
  myIndex: number;
  isSelf?: boolean;
}) {
  if (!player) {
    return (
      <div className="bg-black/35 border border-dashed border-neutral-800 p-2.5 rounded-xl text-center text-[10px] text-neutral-500 w-24">
        Asiento vacío
      </div>
    );
  }

  const isCurrentTurn = activeTurnIdx === myIndex;

  return (
    <div className={`p-2 rounded-xl border flex flex-col items-center text-center w-28 bg-neutral-950/80 transition-all ${
      isCurrentTurn ? "border-amber-500 ring-2 ring-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.2)]" : "border-neutral-800"
    }`}>
      <div className="relative">
        <img 
          src={player.avatarUrl} 
          alt={player.name}
          className="w-10 h-10 rounded-lg bg-neutral-900 border-2 border-neutral-800" 
        />
        {player.isBot && (
          <span className="absolute -top-1.5 -right-1.5 bg-zinc-800 border border-neutral-700 text-neutral-300 text-[8px] font-semibold px-1 rounded uppercase scale-90">
            BOT
          </span>
        )}
      </div>

      <div className="w-full mt-1.5">
        <p className="font-bold text-[10px] text-white truncate w-full">{player.name}</p>
        <p className="text-[9.5px] text-teal-400 uppercase font-semibold">Pareja: Equipo {player.team}</p>
        <p className="text-[10px] text-amber-500 font-bold font-mono">Match: {player.score} pts</p>
      </div>

      {/* Hand tiles visual indicators and count */}
      <div className="flex gap-0.5 items-center mt-1 bg-black/40 px-2 py-0.5 rounded-full border border-neutral-800/80">
        <div className="w-2.5 h-3 flex p-[1px] rounded gap-[0.5px] border border-neutral-500/60 bg-neutral-900">
          <div className="flex-1 bg-neutral-500/10 border-r border-neutral-500/30"></div>
          <div className="flex-1 bg-neutral-500/10"></div>
        </div>
        <span className="text-[9px] font-mono font-bold text-neutral-300 leading-none">{player.tiles.length}</span>
      </div>
    </div>
  );
}

// Domino Pip visual geometry matrix selector
function PipMatrix({ value, pipsClass }: { value: number; pipsClass: string }) {
  if (value === 0) return <div className="w-full h-full"></div>;

  const PIP_PATTERNS: Record<number, number[]> = {
    1: [4],
    2: [0, 8],
    3: [0, 4, 8],
    4: [0, 2, 6, 8],
    5: [0, 2, 4, 6, 8],
    6: [0, 2, 3, 5, 6, 8]
  };

  const gridActiveArray = PIP_PATTERNS[value] || [];

  return (
    <div className="grid grid-cols-3 grid-rows-3 w-6 h-6 p-[2px] gap-[1.5px] shrink-0 pointer-events-none">
      {Array.from({ length: 9 }).map((_, index) => {
        const active = gridActiveArray.includes(index);
        return (
          <div 
            key={index} 
            className={`w-1 h-1 rounded-full transition-all self-center justify-self-center ${active ? pipsClass : "bg-transparent"}`}
          ></div>
        );
      })}
    </div>
  );
}
