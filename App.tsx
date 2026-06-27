import React, { useState, useEffect, useRef } from "react";
import { 
  Trophy, Users, User, MessageSquare, Volume2, VolumeX, 
  Send, Crown, Award, Globe, Shield, RefreshCw, Layers, CheckCircle, Zap, Coins, Copy
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Tile, Player, GameRoom, ChatMessage, UserProfile, LeaderboardEntry, Tournament } from "./types.js";
import { playTileClack, playTileShuffle, playVictorySound } from "./utils/audio.js";
import { auth, googleProvider } from "./lib/firebase.js";
import { signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import WelcomeRegisterScreen from "./components/WelcomeRegisterScreen.js";

let soundEnabled = true;

const TILE_SKINS = [
  { id: "skin_classic", name: "Classic White", bg: "bg-white border-gray-300", pipsClass: "bg-gray-900", line: "bg-gray-200" },
  { id: "skin_mahogany", name: "Mahogany Gold (Premium)", bg: "bg-amber-950 border-yellow-600 border-2", pipsClass: "bg-yellow-400", line: "bg-yellow-600" },
  { id: "skin_neon", name: "Carbon Neon", bg: "bg-zinc-900 border-teal-400", pipsClass: "bg-teal-300", line: "bg-teal-500" }
];

const TABLE_SKINS = [
  { id: "table_wood", name: "Classic Wood", bg: "#1a0a00", felt: "#2d1200", border: "#5c2d00" },
  { id: "table_blue", name: "Midnight Blue", bg: "#001427", felt: "#0a2540", border: "#0f3057" },
  { id: "table_green", name: "Tournament Green", bg: "#021a0e", felt: "#0d3320", border: "#0e4429" }
];

export default function App() {
  const [activeTab, setActiveTab] = useState<string>("lobby");
  const [isRegistered, setIsRegistered] = useState<boolean>(() => {
    return localStorage.getItem("dominosfire_registered") === "true";
  });
  const [playerId, setPlayerId] = useState<string>(() => {
    const saved = localStorage.getItem("domino_player_id");
    if (saved) return saved;
    const newId = `player-${Math.floor(100000 + Math.random() * 900000)}`;
    localStorage.setItem("domino_player_id", newId);
    return newId;
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setPlayerId(user.uid);
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
  const [soundOn, setSoundOn] = useState(true);
  const [pendingChooseTile, setPendingChooseTile] = useState<{ tile: Tile; leftPlayable: boolean; rightPlayable: boolean } | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [geminiComment, setGeminiComment] = useState("");
  const [isSyncingComment, setIsSyncingComment] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement | null>(null); // kept for compat
  const [codeCopied, setCodeCopied] = useState(false);
  const reconnectTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetchProfile();
    fetchRooms();
    fetchLeaderboard();
    fetchTournaments();
    connectWebSocket();
    return () => {
      if (socketRef.current) socketRef.current.close();
      if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
    };
  }, [playerId]);

  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
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
    } catch (e) { console.error("Failed to load profile", e); }
  };

  const fetchRooms = async () => {
    try {
      const res = await fetch("/api/rooms");
      const data = await res.json();
      setRooms(Array.isArray(data) ? data : []);
    } catch (e) { console.error("Failed loading rooms", e); }
  };

  const fetchLeaderboard = async () => {
    try {
      const res = await fetch("/api/leaderboard");
      const data = await res.json();
      setLeaderboard(Array.isArray(data) ? data : []);
    } catch (e) { console.error("Failed loading leaderboard", e); }
  };

  const fetchTournaments = async () => {
    try {
      const res = await fetch("/api/tournaments");
      const data = await res.json();
      setTournaments(Array.isArray(data) ? data : []);
    } catch (e) { console.error("Failed loading tournaments", e); }
  };

  const connectWebSocket = () => {
    if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const socketUrl = `${wsProtocol}//${window.location.host}`;
    console.log("Connecting WebSocket to:", socketUrl);
    const ws = new WebSocket(socketUrl);
    socketRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      ws.send(JSON.stringify({ type: "register-socket", playerId }));
      console.log("WebSocket connected, registered player:", playerId);
    };

    ws.onclose = () => {
      setIsConnected(false);
      reconnectTimeout.current = setTimeout(connectWebSocket, 3000);
    };

    ws.onerror = (e) => {
      console.error("WebSocket error:", e);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        console.log("WS received:", msg.type, msg);

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
            // Update the room so player sees new tile count
            setActiveRoom(prev => {
              if (!prev) return null;
              return { ...prev };
            });
            if (soundOn) playTileShuffle();
            break;
          }
          case "player-passed": break;
          case "round-ended": {
            setActiveRoom(msg.room);
            if (msg.comment) setGeminiComment(msg.comment);
            if (soundOn) playVictorySound();
            fetchProfile();
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
              return { ...prev, messages: [...prev.messages, msg.message] };
            });
            break;
          }
          case "error": {
            alert(msg.message);
            break;
          }
          default: break;
        }
      } catch (e) { console.error("WS parse error", e); }
    };
  };

  const sendWS = (payload: object) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(payload));
      return true;
    }
    console.warn("WebSocket not open, state:", socketRef.current?.readyState);
    return false;
  };

  const handleCreateRoom = (mode: "1v1" | "2v2", stake: number, drawMode: "con_loma" | "sin_loma") => {
    if (!profile || profile.coins < stake) {
      alert("Insufficient coins to enter this table.");
      return;
    }
    sendWS({ type: "create-room", playerId, mode, drawMode, pointsToWin: 100, stakeAmount: stake, isPrivate: false });
  };

  const handleJoinByCode = (code: string) => {
    if (!code.trim()) return;
    sendWS({ type: "join-room", playerId, code: code.trim().toUpperCase() });
  };

  const handleJoinRoom = (roomId: string, stake: number) => {
    if (!profile || profile.coins < stake) { alert("Insufficient coins."); return; }
    sendWS({ type: "join-room", playerId, roomId });
  };

  const handleFillBots = () => {
    if (activeRoom) {
      console.log("Filling bots for room:", activeRoom.id);
      sendWS({ type: "fill-bots", roomId: activeRoom.id });
    }
  };

  const handleLeaveRoom = () => {
    sendWS({ type: "leave-room" });
    setActiveRoom(null);
    setActiveTab("lobby");
    fetchRooms();
  };

  const handlePlayTileClick = (tile: Tile) => {
    if (!activeRoom || activeRoom.status !== "playing") return;
    const currentTurnPlayer = activeRoom.players[activeRoom.currentPlayerIndex];
    if (currentTurnPlayer.id !== playerId) return;

    const leftVal = activeRoom.leftEnd;
    const rightVal = activeRoom.rightEnd;
    const matchesLeft = leftVal === null || tile[0] === leftVal || tile[1] === leftVal;
    const matchesRight = rightVal === null || tile[0] === rightVal || tile[1] === rightVal;

    if (!matchesLeft && !matchesRight) { alert("This tile does not match any open end."); return; }

    if (leftVal !== null && rightVal !== null && matchesLeft && matchesRight && leftVal !== rightVal) {
      setPendingChooseTile({ tile, leftPlayable: true, rightPlayable: true });
    } else {
      const end = matchesLeft ? "left" : "right";
      executePlayTile(tile, end);
    }
  };

  const executePlayTile = (tile: Tile, end: "left" | "right") => {
    if (activeRoom) {
      sendWS({ type: "play-tile", roomId: activeRoom.id, playerId, tile, end });
      setPendingChooseTile(null);
    }
  };

  const handleDrawTile = () => {
    if (activeRoom) sendWS({ type: "draw-tile", roomId: activeRoom.id, playerId });
  };

  const handlePassTurn = () => {
    if (activeRoom) sendWS({ type: "pass-turn", roomId: activeRoom.id, playerId });
  };

  const handleSendChat = (presetText?: string) => {
    const text = presetText || messageText;
    if (!text.trim() || !activeRoom) return;
    sendWS({ type: "send-chat", roomId: activeRoom.id, playerId, text, isPreset: !!presetText });
    if (!presetText) setMessageText("");
  };

  const handleConnectWalletSubmit = async () => {
    if (!mockWalletAddress.includes("0x") || mockWalletAddress.length < 30) {
      alert("Please enter a valid Ethereum / EVM wallet address.");
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
      alert("Wallet connected successfully. You received 500 bonus coins and unlocked the Mahogany Board.");
    } catch (e) { console.error(e); }
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
        alert(`Daily reward claimed! +1,000 Coins, +150 XP`);
        fetchProfile();
      }
    } catch (e) { alert("Error claiming reward."); }
  };

  const triggerGeminiComment = async () => {
    if (isSyncingComment) return;
    setIsSyncingComment(true);
    try {
      const res = await fetch("/api/gemini/commentate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context: "The player is thinking carefully about their next move in the domino match" })
      });
      const data = await res.json();
      setGeminiComment(data.comment);
    } catch (e) { console.error(e); }
    finally { setIsSyncingComment(false); }
  };

  const QUICK_SAYINGS = [
    "Well played!",
    "I'll pass this turn.",
    "Nice double!",
    "Good game so far.",
    "Let's go!",
    "That was close!"
  ];

  const myRoomState = activeRoom;
  const meAsPlayer = myRoomState?.players.find(p => p.id === playerId);
  const isMyTurn = myRoomState && myRoomState.players[myRoomState.currentPlayerIndex]?.id === playerId;
  const currentTableConfig = TABLE_SKINS.find(ts => ts.id === selectedTable) || TABLE_SKINS[0];

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
              body: JSON.stringify({ userId: googleUser.uid, name: googleUser.displayName || chosenName, avatarUrl: googleUser.photoURL || "" })
            }).then(() => fetchProfile());
          } else {
            const finalName = chosenApodo ? `${chosenName} "${chosenApodo}"` : chosenName;
            localStorage.setItem("domino_player_name", finalName);
            localStorage.setItem("dominosfire_registered", "true");
            setIsRegistered(true);
            fetch("/api/profile", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ userId: playerId, name: finalName })
            }).then(() => fetchProfile());
          }
        }}
      />
    );
  }

  return (
    <div className="min-h-screen max-w-[430px] mx-auto bg-neutral-950 text-neutral-100 font-sans flex flex-col antialiased relative">
      {/* Header */}
      <header className="bg-neutral-900 border-b border-neutral-800 py-3 px-4 flex justify-between items-center sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <div className="bg-gradient-to-tr from-amber-500 to-red-600 p-1.5 rounded-lg">
            <span className="text-lg font-bold text-black">🔥</span>
          </div>
          <div>
            <h1 className="font-extrabold text-sm tracking-tight text-transparent bg-gradient-to-r from-white via-amber-200 to-amber-500 bg-clip-text">Dominosfire</h1>
            <p className="font-mono text-[9px] text-amber-500 uppercase tracking-widest leading-none">Multiplayer Dominoes</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {profile && (
            <div className="flex items-center gap-1.5 bg-neutral-950 px-2.5 py-1.5 rounded-full border border-neutral-800 text-xs">
              <Coins className="w-3 h-3 text-yellow-400" />
              <span className="text-yellow-400 font-bold">{profile.coins.toLocaleString()}</span>
              <span className="text-neutral-500 text-[10px]">Lv.{profile.level}</span>
            </div>
          )}
          <div className={`w-2 h-2 rounded-full ${isConnected ? "bg-green-500" : "bg-red-500"}`} title={isConnected ? "Connected" : "Reconnecting..."} />
          <button onClick={() => setSoundOn(!soundOn)} className="p-1.5 bg-neutral-800 rounded-full text-neutral-400 hover:text-white transition-all cursor-pointer">
            {soundOn ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
          </button>
          {!profile?.walletAddress ? (
            <button onClick={() => { setMockWalletAddress(""); setShowWalletModal(true); }}
              className="px-2.5 py-1.5 bg-gradient-to-r from-teal-500 to-emerald-600 text-black font-semibold rounded-full text-[10px] cursor-pointer">
              Connect Wallet
            </button>
          ) : (
            <div className="flex items-center gap-1 text-[10px] bg-teal-950/40 text-teal-300 px-2 py-1 rounded-full border border-teal-800">
              <Shield className="w-3 h-3 text-teal-400" />
              <span>{profile.walletAddress.slice(0, 4)}...{profile.walletAddress.slice(-3)}</span>
            </div>
          )}
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 w-full px-3 py-4 flex flex-col">

        {/* LOBBY */}
        {activeTab === "lobby" && (
          <div className="space-y-4">
            {/* Daily reward */}
            {profile && (
              <div className="bg-gradient-to-r from-amber-600/20 via-red-600/10 to-neutral-900 rounded-2xl p-4 border border-amber-500/25 flex justify-between items-center relative overflow-hidden">
                <div className="absolute top-0 right-0 p-1 opacity-5"><Crown className="w-24 h-24 text-amber-500" /></div>
                <div className="space-y-0.5 relative z-10">
                  <span className="text-[9px] bg-amber-500/20 text-amber-300 font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">Daily Reward</span>
                  <h3 className="text-sm font-bold mt-1">Claim your daily bonus</h3>
                  <p className="text-[10px] text-neutral-400">+1,000 coins every 24 hours</p>
                </div>
                <button onClick={triggerDailyClaim}
                  className="relative z-10 cursor-pointer px-4 py-2 bg-amber-500 text-black font-extrabold text-xs rounded-xl hover:bg-amber-400 active:scale-95 transition-all">
                  CLAIM
                </button>
              </div>
            )}

            {/* Create game */}
            <div className="bg-neutral-900 rounded-2xl p-4 border border-neutral-800 space-y-3">
              <div className="flex gap-2 items-center">
                <Zap className="w-4 h-4 text-amber-500" />
                <h2 className="text-sm font-bold">Create a New Table</h2>
              </div>

              <div className="space-y-2">
                <button onClick={() => handleCreateRoom("1v1", 100, "con_loma")}
                  className="w-full bg-neutral-950 border border-neutral-800 p-3 rounded-xl text-left flex justify-between items-center hover:border-amber-500/40 transition-all cursor-pointer active:scale-[0.98]">
                  <div>
                    <p className="font-bold text-sm">Quick Match — 1v1</p>
                    <p className="text-[10px] text-neutral-500 mt-0.5">Draw mode enabled · Single opponent</p>
                  </div>
                  <span className="text-amber-500 font-bold text-xs">100 coins</span>
                </button>

                <button onClick={() => handleCreateRoom("2v2", 500, "sin_loma")}
                  className="w-full bg-gradient-to-r from-amber-500/10 to-red-600/10 border border-amber-500/30 p-3 rounded-xl text-left flex justify-between items-center hover:border-amber-500/60 transition-all cursor-pointer active:scale-[0.98]">
                  <div>
                    <p className="font-bold text-sm text-amber-400">Classic Teams — 2v2</p>
                    <p className="text-[10px] text-neutral-500 mt-0.5">No draw · Two teams of two</p>
                  </div>
                  <span className="text-amber-500 font-bold text-xs">500 coins</span>
                </button>

                <button onClick={() => handleCreateRoom("2v2", 1000, "sin_loma")}
                  className="w-full bg-red-600/10 border border-red-600/30 p-3 rounded-xl text-left flex justify-between items-center hover:border-red-500/60 transition-all cursor-pointer active:scale-[0.98]">
                  <div>
                    <p className="font-bold text-sm text-red-400">High Stakes — 2v2</p>
                    <p className="text-[10px] text-neutral-500 mt-0.5">No draw · Premium entry</p>
                  </div>
                  <span className="text-red-400 font-bold text-xs">1,000 coins</span>
                </button>
              </div>

              <div className="pt-2 border-t border-neutral-800 flex gap-2">
                <input type="text" placeholder="INVITE CODE" id="lobby_invite_code_input"
                  className="flex-1 bg-neutral-950 border border-neutral-800 text-center text-sm font-bold tracking-widest text-white px-3 py-2 rounded-lg outline-none focus:border-amber-500 uppercase h-9" />
                <button onClick={() => { const input = document.getElementById("lobby_invite_code_input") as HTMLInputElement; if (input) handleJoinByCode(input.value); }}
                  className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 font-bold text-xs rounded-lg transition-all h-9 cursor-pointer text-amber-400">
                  Join
                </button>
              </div>
            </div>

            {/* Active tables */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <h3 className="text-xs font-bold flex items-center gap-1.5 text-neutral-300">
                  <Users className="w-3.5 h-3.5 text-amber-500" /> Open Tables
                </h3>
                <button onClick={fetchRooms} className="p-1 px-2 bg-neutral-900 border border-neutral-800 rounded-lg text-[10px] hover:bg-neutral-800 transition-all flex items-center gap-1 cursor-pointer text-neutral-400">
                  <RefreshCw className="w-3 h-3" /> Refresh
                </button>
              </div>
              {rooms.length === 0 ? (
                <div className="bg-neutral-900/50 rounded-xl p-6 border border-neutral-800 text-center">
                  <p className="text-xs text-neutral-400">No open tables at the moment.</p>
                  <p className="text-[10px] text-neutral-500 mt-1">Create one above and invite players.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {rooms.map(room => (
                    <div key={room.id} className="bg-neutral-900 border border-neutral-800 p-3 rounded-xl flex justify-between items-center hover:border-amber-500/30 transition-all">
                      <div>
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-[9px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded uppercase font-bold">{room.mode}</span>
                          <h4 className="font-bold text-xs text-white">{room.name}</h4>
                        </div>
                        <p className="text-[10px] text-neutral-400">{room.stakeAmount} coins · {room.drawMode === "con_loma" ? "Draw" : "No draw"}</p>
                      </div>
                      <button onClick={() => handleJoinRoom(room.id, room.stakeAmount)}
                        className="px-3 py-1.5 bg-neutral-800 hover:bg-amber-500 hover:text-black font-bold text-xs rounded-lg transition-all text-amber-500 cursor-pointer">
                        Join
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Profile mini card */}
            {profile && (
              <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 space-y-3">
                <div className="flex gap-3 items-center">
                  <img src={profile.avatarUrl} alt="Avatar" className="w-10 h-10 rounded-xl bg-neutral-800 border-2 border-amber-500" />
                  <div>
                    <h3 className="font-bold text-sm text-white">{profile.name}</h3>
                    <p className="text-[10px] text-neutral-400">Level {profile.level} · {profile.stats.played} games played</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-xs bg-neutral-950 p-2.5 rounded-xl border border-neutral-800/60">
                  <div>
                    <span className="text-neutral-500 block text-[9px] uppercase">Played</span>
                    <strong className="text-sm font-bold text-white">{profile.stats.played}</strong>
                  </div>
                  <div>
                    <span className="text-neutral-500 block text-[9px] uppercase">Won</span>
                    <strong className="text-sm font-bold text-emerald-400">{profile.stats.won}</strong>
                  </div>
                  <div>
                    <span className="text-neutral-500 block text-[9px] uppercase">Win Rate</span>
                    <strong className="text-sm font-bold text-teal-400">
                      {profile.stats.played > 0 ? ((profile.stats.won / profile.stats.played) * 100).toFixed(0) : 0}%
                    </strong>
                  </div>
                </div>

                {/* Table customization */}
                <div>
                  <label className="text-[9px] uppercase tracking-wider text-neutral-500 font-bold block mb-2">Table Style</label>
                  <div className="grid grid-cols-3 gap-2">
                    {TABLE_SKINS.map(t => (
                      <button key={t.id} onClick={() => setSelectedTable(t.id)}
                        style={{ backgroundColor: t.felt, borderColor: selectedTable === t.id ? "#f59e0b" : t.border }}
                        className={`h-9 rounded-lg border-2 flex items-center justify-center text-[9px] font-bold transition-all cursor-pointer ${selectedTable === t.id ? "ring-1 ring-amber-400" : ""}`}>
                        <span className="text-white/70 truncate px-1">{t.name.split(" ")[0]}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* GAME */}
        {activeTab === "game" && myRoomState && (
          <div className="flex flex-col gap-3">
            {/* Game info bar */}
            <div className="bg-neutral-900 px-3 py-2.5 rounded-xl border border-neutral-800 flex justify-between items-center">
              <div>
                <p className="text-[10px] text-amber-500 font-bold uppercase tracking-wider">
                  {myRoomState.status === "playing" ? `Round ${myRoomState.roundNumber}` : "Game Over"}
                  {myRoomState.status === "waiting" && " · Waiting for players"}
                </p>
                <p className="text-xs text-neutral-300 font-semibold">{myRoomState.name} · {myRoomState.mode.toUpperCase()} · Target: {myRoomState.pointsToWin}pts</p>
              </div>
              <button onClick={handleLeaveRoom}
                className="px-3 py-1.5 bg-red-950 border border-red-900/60 hover:bg-red-900 rounded-lg text-[10px] font-bold text-red-400 transition-all cursor-pointer">
                Leave
              </button>
            </div>

            {/* TABLE — the main board */}
            <div
              className="w-full rounded-2xl relative overflow-hidden"
              style={{
                backgroundColor: currentTableConfig.felt,
                border: `4px solid ${currentTableConfig.border}`,
                boxShadow: `0 0 40px rgba(0,0,0,0.7), inset 0 0 60px rgba(0,0,0,0.3)`,
                minHeight: "380px"
              }}
            >
              {/* Felt texture overlay */}
              <div className="absolute inset-0 pointer-events-none opacity-20"
                style={{ backgroundImage: "radial-gradient(circle at 30% 30%, rgba(255,255,255,0.05) 0%, transparent 60%)" }} />

              {/* Top player */}
              <div className="flex justify-center pt-2">
                {myRoomState.players.length > 2 ? (
                  <PlayerCard player={myRoomState.players[2]} activeTurnIdx={myRoomState.currentPlayerIndex} myIndex={2} />
                ) : (
                  <div className="text-[10px] text-white/30 px-3 py-1 rounded-full border border-white/10 bg-black/20">
                    {myRoomState.mode === "1v1" ? "1v1 Match" : "Waiting..."}
                  </div>
                )}
              </div>

              {/* Middle row: left player, board, right player */}
              <div className="flex items-center justify-between px-2 my-2" style={{ minHeight: "200px" }}>
                {/* Left seat */}
                <div className="flex flex-col items-start">
                  {myRoomState.players.length > 1 ? (
                    <PlayerCard player={myRoomState.players[1]} activeTurnIdx={myRoomState.currentPlayerIndex} myIndex={1} vertical />
                  ) : <div className="w-16" />}
                </div>

                {/* BOARD CENTER */}
                <div className="flex-1 mx-2 flex flex-col items-center justify-center">
                  {myRoomState.board.length === 0 ? (
                    <div className="text-center p-4 bg-black/30 rounded-2xl border border-white/10 backdrop-blur-sm max-w-[200px]">
                      <p className="text-white/80 font-bold text-xs">
                        {myRoomState.roundNumber === 1 ? "Double 6 opens the game" : "Open play — any tile"}
                      </p>
                      {myRoomState.status === "waiting" && (
                        <button onClick={handleFillBots}
                          className="mt-3 px-3 py-1.5 bg-gradient-to-r from-teal-500 to-emerald-500 text-black font-extrabold text-[10px] rounded-lg active:scale-95 transition-all cursor-pointer w-full">
                          Play vs Bots 🤖
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="w-full">
                      <div className="flex items-center justify-center gap-1.5 text-[9px] font-mono py-1 px-2 bg-black/30 border border-white/10 rounded-full mb-2 w-fit mx-auto">
                        <span className="text-white/60">Left: <strong className="text-amber-400">{myRoomState.leftEnd}</strong></span>
                        <span className="text-white/30">·</span>
                        <span className="text-white/60">Right: <strong className="text-amber-400">{myRoomState.rightEnd}</strong></span>
                      </div>
                      {/* Domino tiles on board — horizontal scroll */}
                      <BoardZoom tileCount={myRoomState.board.length}>
                        {myRoomState.board.map((tile, idx) => {
                          const isDouble = tile[0] === tile[1];
                          const skin = TILE_SKINS.find(s => s.id === selectedSkin) || TILE_SKINS[0];
                          return (
                            <BoardTile key={idx} tile={tile} isDouble={isDouble} skin={skin} isFirst={idx === 0} isLast={idx === myRoomState.board.length - 1} />
                          );
                        })}
                      </BoardZoom>
                    </div>
                  )}
                </div>

                {/* Right seat */}
                <div className="flex flex-col items-end">
                  {myRoomState.players.length > 3 ? (
                    <PlayerCard player={myRoomState.players[3]} activeTurnIdx={myRoomState.currentPlayerIndex} myIndex={3} vertical />
                  ) : <div className="w-16" />}
                </div>
              </div>

              {/* Bottom player (me) */}
              <div className="flex justify-center pb-2">
                {myRoomState.players.length > 0 && (
                  <PlayerCard player={myRoomState.players[0]} activeTurnIdx={myRoomState.currentPlayerIndex} myIndex={0} isSelf />
                )}
              </div>
            </div>

            {/* Turn indicator */}
            {myRoomState.status === "playing" && (
              <div className={`rounded-xl px-3 py-2 text-center text-xs font-bold border ${isMyTurn ? "bg-amber-500/20 border-amber-500/50 text-amber-300" : "bg-neutral-900 border-neutral-800 text-neutral-400"}`}>
                {isMyTurn ? "⚡ Your turn — select a tile to play" : `Waiting for ${myRoomState.players[myRoomState.currentPlayerIndex]?.name || "opponent"}...`}
              </div>
            )}

            {/* My hand */}
            <div className="bg-neutral-900 rounded-2xl p-3 border border-neutral-800">
              <div className="flex justify-between items-center mb-2">
                <p className="text-xs font-bold text-neutral-300">Your Hand</p>
                <div className="flex gap-2">
                  {myRoomState.drawMode === "con_loma" && (
                    <button onClick={handleDrawTile} disabled={!isMyTurn || myRoomState.deck.length === 0}
                      className="px-3 py-1 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 font-bold text-[10px] text-neutral-300 hover:text-white rounded-lg transition-all cursor-pointer border border-neutral-700">
                      Draw ({myRoomState.deck.length})
                    </button>
                  )}
                  <button onClick={handlePassTurn} disabled={!isMyTurn}
                    className="px-3 py-1 bg-neutral-800 text-neutral-400 border border-neutral-700 hover:bg-amber-500 hover:text-black hover:border-amber-500 disabled:opacity-40 font-bold text-[10px] rounded-lg transition-all cursor-pointer">
                    Pass
                  </button>
                </div>
              </div>

              {/* Player tiles */}
              <div className="flex items-end justify-center gap-1.5 overflow-x-auto py-2" style={{ scrollbarWidth: "none" }}>
                {!meAsPlayer || meAsPlayer.tiles.length === 0 ? (
                  <p className="text-[10px] text-neutral-500 py-4">No tiles in hand.</p>
                ) : (
                  meAsPlayer.tiles.map((tile, index) => {
                    const skin = TILE_SKINS.find(s => s.id === selectedSkin) || TILE_SKINS[0];
                    const leftVal = myRoomState.leftEnd;
                    const rightVal = myRoomState.rightEnd;
                    const fits = isMyTurn && (
                      leftVal === null ||
                      tile[0] === leftVal || tile[1] === leftVal ||
                      tile[0] === rightVal || tile[1] === rightVal
                    );
                    return (
                      <HandTile key={index} tile={tile} skin={skin} fits={!!fits} onClick={() => handlePlayTileClick(tile)} />
                    );
                  })
                )}
              </div>
            </div>

            {/* Score / room info row */}
            <div className="grid grid-cols-2 gap-2">
              {/* Invite code */}
              <div className="bg-neutral-900 rounded-xl p-3 border border-neutral-800">
                <p className="text-[9px] text-neutral-500 uppercase tracking-wider mb-1">Invite Code</p>
                <div className="flex items-center gap-2">
                  <strong className="font-mono text-sm tracking-widest text-white">{myRoomState.code}</strong>
                  <button onClick={() => {
                    navigator.clipboard.writeText(myRoomState.code);
                    setCodeCopied(true);
                    setTimeout(() => setCodeCopied(false), 1500);
                  }} className="p-1 bg-neutral-800 rounded text-amber-500 cursor-pointer hover:bg-neutral-700">
                    {codeCopied ? <CheckCircle className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                  </button>
                </div>
              </div>

              {/* Scores */}
              <div className="bg-neutral-900 rounded-xl p-3 border border-neutral-800">
                <p className="text-[9px] text-neutral-500 uppercase tracking-wider mb-1">Scores</p>
                <div className="space-y-0.5">
                  {myRoomState.players.slice(0, 2).map((p, i) => (
                    <div key={i} className="flex justify-between text-[10px]">
                      <span className="text-neutral-400 truncate max-w-[80px]">{p.name}</span>
                      <span className="font-bold text-amber-400">{p.score}pts</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Commentary */}
            {geminiComment && (
              <div className="bg-neutral-900 border border-amber-500/15 p-3 rounded-xl flex items-start gap-2">
                <span className="text-base">🎙️</span>
                <p className="text-[11px] italic text-neutral-300 leading-relaxed flex-1">{geminiComment}</p>
                <button onClick={triggerGeminiComment} disabled={isSyncingComment}
                  className="text-[9px] text-teal-400 hover:text-white cursor-pointer disabled:opacity-50 shrink-0">
                  ↻
                </button>
              </div>
            )}

            {/* Chat */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-3 flex flex-col" style={{ maxHeight: "260px" }}>
              <div className="flex gap-2 items-center text-[10px] font-bold text-neutral-400 border-b border-neutral-800 pb-2 mb-2">
                <MessageSquare className="w-3.5 h-3.5 text-teal-400" /> Table Chat
              </div>
              <div ref={chatScrollRef} className="flex-1 overflow-y-auto space-y-2 mb-2" style={{ scrollbarWidth: "none" }}>
                {myRoomState.messages.length === 0 ? (
                  <p className="text-[10px] text-neutral-500 text-center py-3">No messages yet.</p>
                ) : (
                  myRoomState.messages.map(msg => {
                    const isMe = msg.senderId === playerId;
                    return (
                      <div key={msg.id} className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                        <span className="text-[9px] text-neutral-500 mb-0.5">{msg.senderName}</span>
                        <div className={`p-2 rounded-xl text-[10px] max-w-[80%] ${isMe ? "bg-amber-500 text-black font-semibold rounded-tr-none" : "bg-neutral-950 text-neutral-200 rounded-tl-none border border-neutral-800"}`}>
                          {msg.text}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="grid grid-cols-3 gap-1 mb-2">
                {QUICK_SAYINGS.slice(0, 3).map((s, i) => (
                  <button key={i} onClick={() => handleSendChat(s)}
                    className="p-1 bg-neutral-950 border border-neutral-800 hover:border-amber-500/30 text-neutral-400 hover:text-amber-400 text-[9px] rounded-lg truncate transition-all cursor-pointer">
                    {s}
                  </button>
                ))}
              </div>

              <div className="flex gap-2">
                <input type="text" value={messageText} onChange={(e) => setMessageText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleSendChat(); }}
                  placeholder="Type a message..." className="flex-1 bg-neutral-950 border border-neutral-800 text-[10px] text-white p-2 rounded-lg outline-none focus:border-amber-500 h-8" />
                <button onClick={() => handleSendChat()}
                  className="p-2 px-3 bg-amber-500 hover:bg-amber-400 text-black rounded-lg active:scale-95 transition-all text-xs font-semibold cursor-pointer h-8 flex items-center">
                  <Send className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TOURNAMENTS */}
        {activeTab === "tournaments" && (
          <div className="space-y-4">
            <div className="bg-gradient-to-r from-red-600/15 via-neutral-900 to-amber-500/15 p-5 rounded-2xl border border-neutral-800 text-center space-y-2">
              <span className="p-2 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xl inline-block">🏆</span>
              <h2 className="text-base font-bold text-white">Tournament System</h2>
              <p className="text-[11px] text-neutral-400 leading-relaxed">Compete in structured brackets against other players and bots.</p>
            </div>
            <div className="space-y-3">
              {tournaments.map(tour => (
                <div key={tour.id} className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 space-y-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-[9px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full uppercase font-bold">{tour.status}</span>
                      <h3 className="font-bold text-sm text-white mt-1">{tour.name}</h3>
                      <p className="text-[10px] text-neutral-400">Prize Pool: <span className="text-amber-500 font-bold">{tour.prizePool} coins</span></p>
                    </div>
                    <span className="text-[10px] text-neutral-400">{tour.playersCount}/{tour.maxPlayers}</span>
                  </div>
                  {joinedTournamentId === tour.id ? (
                    <div className="bg-teal-950/20 text-teal-400 text-[10px] font-bold text-center border border-teal-800 p-2 rounded-xl flex items-center justify-center gap-1">
                      <CheckCircle className="w-3.5 h-3.5" /> Registered — awaiting opponents
                    </div>
                  ) : (
                    <button onClick={() => { setJoinedTournamentId(tour.id); alert("You have been registered for this tournament."); }}
                      className="w-full py-2 bg-gradient-to-r from-amber-500 to-red-600 text-black font-extrabold text-xs rounded-xl hover:brightness-110 active:scale-95 transition-all cursor-pointer">
                      Register Free
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* LEADERBOARD */}
        {activeTab === "leaderboard" && (
          <div className="space-y-4">
            <div className="text-center space-y-1">
              <span className="inline-block text-2xl p-1 bg-gradient-to-tr from-amber-500 to-red-600 rounded-xl">🏅</span>
              <h2 className="text-base font-bold">Global Rankings</h2>
              <p className="text-[10px] text-neutral-400">Top players by XP, coins, and win rate.</p>
            </div>
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden">
              {leaderboard.map((entry, idx) => (
                <div key={entry.id} className={`flex items-center gap-3 px-3 py-2.5 ${idx !== leaderboard.length - 1 ? "border-b border-neutral-800" : ""} hover:bg-neutral-800/50 transition-all`}>
                  <span className="w-6 text-center font-mono text-xs text-neutral-400 font-bold">
                    {idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : idx + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-xs text-white truncate">{entry.name}</p>
                    <p className="text-[9px] text-neutral-500">{entry.country} · {entry.xp.toLocaleString()} XP</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold text-yellow-400">{entry.coins.toLocaleString()}</p>
                    <p className="text-[9px] text-emerald-400">{entry.ratio}% win</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* PROFILE */}
        {activeTab === "profile" && profile && (
          <div className="space-y-4">
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 space-y-4">
              <div className="flex gap-3 items-center">
                <img src={profile.avatarUrl} alt="Avatar" className="w-14 h-14 rounded-2xl bg-neutral-950 border-2 border-amber-500" />
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    {profile.name}
                    <span className="text-[9px] bg-amber-500/20 text-amber-300 font-bold px-1.5 py-0.5 rounded-full uppercase">Lv.{profile.level}</span>
                  </h3>
                  <p className="text-[10px] text-neutral-400 mt-0.5">ID: <span className="font-mono text-neutral-500">{profile.id.slice(0, 12)}...</span></p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="bg-neutral-950 p-3 rounded-xl border border-neutral-800 text-center">
                  <span className="text-[9px] text-neutral-500 block uppercase">Win Rate</span>
                  <strong className="text-lg font-bold text-emerald-400">{profile.stats.played > 0 ? ((profile.stats.won / profile.stats.played) * 100).toFixed(0) : 0}%</strong>
                </div>
                <div className="bg-neutral-950 p-3 rounded-xl border border-neutral-800 text-center">
                  <span className="text-[9px] text-neutral-500 block uppercase">Total Coins</span>
                  <strong className="text-lg font-bold text-yellow-500 flex items-center justify-center gap-0.5">
                    <Coins className="w-3.5 h-3.5" />{profile.coins.toLocaleString()}
                  </strong>
                </div>
              </div>

              {/* XP bar */}
              <div>
                <div className="flex justify-between text-[9px] text-neutral-400 mb-1">
                  <span>Level {profile.level} Progress</span>
                  <span>{profile.xp % 500} / 500 XP</span>
                </div>
                <div className="w-full h-1.5 bg-neutral-950 rounded-full overflow-hidden border border-neutral-800">
                  <div className="bg-gradient-to-r from-amber-500 to-red-500 h-full rounded-full transition-all" style={{ width: `${((profile.xp % 500) / 500) * 100}%` }} />
                </div>
              </div>

              {/* Tile skin selector */}
              <div>
                <label className="text-[9px] uppercase tracking-wider text-neutral-500 font-bold block mb-2">Tile Skin</label>
                <div className="space-y-1.5">
                  {TILE_SKINS.map(skin => (
                    <button key={skin.id} onClick={() => setSelectedSkin(skin.id)}
                      className={`w-full p-2 rounded-lg border text-left flex justify-between items-center transition-all cursor-pointer ${selectedSkin === skin.id ? "bg-neutral-800 border-amber-500" : "bg-neutral-950 border-neutral-800 hover:bg-neutral-900"}`}>
                      <p className="text-[11px] font-semibold text-white">{skin.name}</p>
                      <div className={`w-8 h-5 flex rounded gap-0.5 border p-0.5 ${skin.bg}`}>
                        <div className="flex-1 border-r border-neutral-400/30 flex justify-center items-center"><span className={`w-1 h-1 rounded-full ${skin.pipsClass}`} /></div>
                        <div className="flex-1 flex justify-center items-center"><span className={`w-1 h-1 rounded-full ${skin.pipsClass}`} /></div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <hr className="border-neutral-800" />

              {/* Firebase Auth */}
              <div className="bg-neutral-950 p-3 border border-violet-500/20 rounded-xl space-y-3">
                <h4 className="text-xs font-bold text-white flex items-center gap-1.5"><Shield className="w-3.5 h-3.5 text-violet-400" /> Cloud Save</h4>
                <p className="text-[10px] text-neutral-400">Sign in with Google to permanently save your progress across devices.</p>
                {auth.currentUser ? (
                  <div className="flex items-center justify-between bg-neutral-900 p-2.5 rounded-lg border border-neutral-800">
                    <div className="flex items-center gap-2">
                      {auth.currentUser.photoURL && <img src={auth.currentUser.photoURL} alt="Google" className="w-7 h-7 rounded-full border border-violet-500/50" referrerPolicy="no-referrer" />}
                      <div>
                        <p className="text-[10px] font-bold text-white">{auth.currentUser.displayName}</p>
                        <p className="text-[9px] text-neutral-400">{auth.currentUser.email}</p>
                      </div>
                    </div>
                    <button onClick={async () => { try { await signOut(auth); } catch (e: any) { alert(e.message); } }}
                      className="px-3 py-1 bg-neutral-800 hover:bg-red-950/40 hover:text-red-400 text-neutral-300 text-[10px] font-bold rounded-lg cursor-pointer">
                      Sign Out
                    </button>
                  </div>
                ) : (
                  <button onClick={async () => {
                    try {
                      const result = await signInWithPopup(auth, googleProvider);
                      await fetch("/api/profile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: result.user.uid, name: result.user.displayName || "", avatarUrl: result.user.photoURL || "" }) });
                      fetchProfile();
                    } catch (e: any) { alert(`Google sign-in error: ${e.message}`); }
                  }} className="w-full py-2 px-4 bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-bold text-xs rounded-xl transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer">
                    <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24"><path d="M12.24 10.285V13.4h6.887C18.2 15.614 15.645 18 12.24 18c-3.86 0-7-3.14-7-7s3.14-7 7-7c1.7 0 3.25.61 4.45 1.615l2.42-2.42C17.435 1.74 14.935 1 12.24 1c-5.52 0-10 4.48-10 10s4.48 10 10 10c5.77 0 10-4.06 10-10 0-.675-.075-1.32-.215-1.715H12.24z" /></svg>
                    Sign in with Google
                  </button>
                )}
              </div>

              {/* Edit nickname */}
              <div className="space-y-1.5">
                <label className="text-[9px] text-neutral-400 font-bold uppercase tracking-wider">Update Display Name</label>
                <div className="flex gap-2">
                  <input type="text" id="profile_nickname_input" placeholder="Enter new name..." defaultValue={profile.name}
                    className="flex-1 bg-neutral-950 border border-neutral-800 text-[10px] text-white p-2 px-3 rounded-lg outline-none focus:border-amber-500 h-9" />
                  <button onClick={async () => {
                    const val = (document.getElementById("profile_nickname_input") as HTMLInputElement).value;
                    if (!val.trim()) return;
                    localStorage.setItem("domino_player_name", val.trim());
                    try {
                      const res = await fetch("/api/profile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: playerId, name: val.trim() }) });
                      const data = await res.json();
                      setProfile(data);
                      alert("Name updated successfully.");
                    } catch (e) { console.error(e); }
                  }} className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-amber-500 text-[10px] font-bold rounded-lg cursor-pointer h-9">
                    Save
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Choose direction modal */}
      <AnimatePresence>
        {pendingChooseTile && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-end justify-center p-4">
            <motion.div initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }}
              className="bg-neutral-900 border border-amber-500/30 p-5 rounded-2xl w-full max-w-sm text-center space-y-4">
              <h3 className="font-bold text-sm text-white">Choose a side to play</h3>
              <p className="text-[10px] text-neutral-400">This tile matches both ends. Select where to place it:</p>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => executePlayTile(pendingChooseTile.tile, "left")}
                  className="py-3 bg-neutral-800 hover:bg-neutral-700 font-bold text-xs rounded-xl text-amber-400 transition-all cursor-pointer">
                  ← Left (End: {myRoomState?.leftEnd})
                </button>
                <button onClick={() => executePlayTile(pendingChooseTile.tile, "right")}
                  className="py-3 bg-neutral-800 hover:bg-neutral-700 font-bold text-xs rounded-xl text-amber-400 transition-all cursor-pointer">
                  Right (End: {myRoomState?.rightEnd}) →
                </button>
              </div>
              <button onClick={() => setPendingChooseTile(null)} className="text-[10px] text-neutral-500 hover:text-white cursor-pointer">Cancel</button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Wallet modal */}
      <AnimatePresence>
        {showWalletModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-end justify-center p-4">
            <motion.div initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }}
              className="bg-neutral-900 border border-teal-500/20 p-5 rounded-2xl w-full max-w-md space-y-4">
              <div>
                <h3 className="font-bold text-sm text-white flex items-center gap-2"><Shield className="w-4 h-4 text-teal-400" /> Connect Web3 Wallet</h3>
                <p className="text-[10px] text-neutral-400 mt-1">Enter your Ethereum/EVM wallet address to unlock NFT features and receive 500 bonus coins.</p>
              </div>
              <div>
                <label className="text-[9px] uppercase font-bold text-neutral-500 block mb-1">Public Ethereum Address</label>
                <input type="text" placeholder="0x..." value={mockWalletAddress} onChange={(e) => setMockWalletAddress(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 p-2.5 rounded-lg text-[11px] font-mono text-teal-300 outline-none focus:border-teal-400" />
              </div>
              <div className="bg-teal-950/20 text-[10px] text-teal-400 p-2.5 rounded-lg border border-teal-800/40">
                Wallet connection is optional. You can play without one.
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowWalletModal(false)} className="px-4 py-2 text-[10px] bg-neutral-800 text-neutral-400 rounded-lg cursor-pointer">Cancel</button>
                <button onClick={handleConnectWalletSubmit} className="px-4 py-2 text-[10px] bg-gradient-to-r from-teal-500 to-emerald-600 font-bold text-black rounded-lg active:scale-95 cursor-pointer">Connect</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Bottom nav */}
      <footer className="bg-neutral-900 border-t border-neutral-800 sticky bottom-0 z-40 py-2 px-4 flex justify-around items-center">
        {[
          { id: "lobby", icon: <Globe className="w-5 h-5" />, label: "Lobby" },
          ...(myRoomState ? [{ id: "game", icon: <div className="w-5 h-5 border-2 border-current rounded flex items-center justify-center text-[8px] font-bold">▣</div>, label: "Table", pulse: isMyTurn }] : []),
          { id: "tournaments", icon: <Trophy className="w-5 h-5" />, label: "Events" },
          { id: "leaderboard", icon: <Award className="w-5 h-5" />, label: "Ranks" },
          { id: "profile", icon: <User className="w-5 h-5" />, label: "Profile" },
        ].map((tab: any) => (
          <button key={tab.id} onClick={() => { setActiveTab(tab.id); if (tab.id === "lobby") fetchRooms(); }}
            className={`flex flex-col items-center gap-0.5 cursor-pointer transition-all relative ${activeTab === tab.id ? "text-amber-500 scale-105" : "text-neutral-500 hover:text-white"}`}>
            {tab.pulse && <span className="absolute -top-1 -right-1 bg-red-600 rounded-full w-2 h-2 animate-ping" />}
            {tab.icon}
            <span className="text-[9px] font-bold tracking-wide">{tab.label}</span>
          </button>
        ))}
      </footer>
    </div>
  );
}

// Auto-zoom board — shrinks tiles to fit all in view
function BoardZoom({ tileCount, children }: { tileCount: number; children: React.ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    if (!containerRef.current || !innerRef.current) return;
    const containerW = containerRef.current.offsetWidth;
    const innerW = innerRef.current.scrollWidth;
    if (innerW > containerW) {
      const newScale = Math.max(0.38, containerW / innerW);
      setScale(newScale);
    } else {
      setScale(1);
    }
  }, [tileCount]);

  return (
    <div ref={containerRef} className="w-full overflow-hidden flex items-center justify-center" style={{ minHeight: "60px" }}>
      <div
        ref={innerRef}
        className="flex flex-row items-center gap-1 px-1 py-1 origin-center transition-transform duration-300"
        style={{ transform: `scale(${scale})`, transformOrigin: "center center", whiteSpace: "nowrap" }}
      >
        {children}
      </div>
    </div>
  );
}

// Board tile component — tiles on the table
function BoardTile({ tile, isDouble, skin, isFirst, isLast }: { tile: Tile; isDouble: boolean; skin: typeof TILE_SKINS[0]; isFirst: boolean; isLast: boolean }) {
  return (
    <motion.div
      initial={{ scale: 0.5, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.2 }}
      className={`flex ${isDouble ? "flex-col w-8 h-14" : "flex-row w-14 h-8"} items-center justify-center rounded-md shadow-lg border shrink-0 ${skin.bg} ${isFirst ? "ring-1 ring-amber-500/40" : ""} ${isLast ? "ring-1 ring-amber-500/60" : ""}`}
      style={{ boxShadow: "0 4px 12px rgba(0,0,0,0.5), 0 1px 0 rgba(255,255,255,0.05)" }}
    >
      <div className={`flex-1 ${isDouble ? "w-full" : "h-full"} flex items-center justify-center p-0.5`}>
        <PipMatrix value={tile[0]} pipsClass={skin.pipsClass} small />
      </div>
      <div className={isDouble ? `h-[1px] w-full ${skin.line}` : `w-[1px] h-full ${skin.line}`} />
      <div className={`flex-1 ${isDouble ? "w-full" : "h-full"} flex items-center justify-center p-0.5`}>
        <PipMatrix value={tile[1]} pipsClass={skin.pipsClass} small />
      </div>
    </motion.div>
  );
}

// Hand tile component — tiles in the player's hand
function HandTile({ tile, skin, fits, onClick }: { tile: Tile; skin: typeof TILE_SKINS[0]; fits: boolean; onClick: () => void }) {
  return (
    <motion.button
      whileHover={fits ? { y: -6, scale: 1.05 } : {}}
      whileTap={fits ? { scale: 0.95 } : {}}
      onClick={onClick}
      disabled={!fits}
      className={`w-11 h-18 rounded-xl border-2 flex flex-col justify-between p-1 transition-all relative shrink-0 cursor-pointer ${skin.bg} ${fits ? "ring-2 ring-amber-400 shadow-[0_4px_12px_rgba(245,158,11,0.3)]" : "opacity-50"}`}
      style={{ height: "72px", boxShadow: fits ? "0 6px 16px rgba(0,0,0,0.4)" : "0 2px 8px rgba(0,0,0,0.3)" }}
    >
      <div className="flex-1 flex items-center justify-center">
        <PipMatrix value={tile[0]} pipsClass={skin.pipsClass} />
      </div>
      <div className={`h-[1px] w-full ${skin.line}`} />
      <div className="flex-1 flex items-center justify-center">
        <PipMatrix value={tile[1]} pipsClass={skin.pipsClass} />
      </div>
    </motion.button>
  );
}

// Player seat card
function PlayerCard({ player, activeTurnIdx, myIndex, isSelf = false, vertical = false }: {
  player?: Player; activeTurnIdx: number; myIndex: number; isSelf?: boolean; vertical?: boolean;
}) {
  if (!player) return <div className="w-16 h-12 bg-black/20 border border-dashed border-white/10 rounded-lg" />;
  const isCurrentTurn = activeTurnIdx === myIndex;

  return (
    <div className={`flex ${vertical ? "flex-col" : "flex-row"} items-center gap-1.5 px-2 py-1.5 rounded-xl border transition-all bg-black/40 backdrop-blur-sm ${isCurrentTurn ? "border-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.3)]" : "border-white/10"}`}>
      <div className="relative">
        <img src={player.avatarUrl} alt={player.name} className="w-8 h-8 rounded-lg border border-white/10" />
        {player.isBot && <span className="absolute -top-1 -right-1 bg-zinc-700 text-[7px] text-white px-0.5 rounded uppercase">AI</span>}
        {isCurrentTurn && <span className="absolute -top-1 -left-1 w-2 h-2 bg-amber-400 rounded-full animate-pulse" />}
      </div>
      <div className="text-center" style={{ minWidth: 0 }}>
        <p className={`text-[9px] font-bold text-white truncate max-w-[60px]`}>{isSelf ? "You" : player.name.split(" ")[0]}</p>
        <p className="text-[8px] text-amber-400 font-mono">{player.score}pt</p>
        <div className="flex items-center gap-0.5 justify-center">
          <div className="w-2 h-3 border border-white/20 rounded-sm bg-white/5" />
          <span className="text-[8px] text-white/50">{player.tiles.length}</span>
        </div>
      </div>
    </div>
  );
}

// Pip dot pattern
function PipMatrix({ value, pipsClass, small = false }: { value: number; pipsClass: string; small?: boolean }) {
  if (value === 0) return <div className={small ? "w-4 h-4" : "w-5 h-5"} />;
  const PATTERNS: Record<number, number[]> = {
    1: [4], 2: [0, 8], 3: [0, 4, 8],
    4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8]
  };
  const active = PATTERNS[value] || [];
  const size = small ? "w-4 h-4" : "w-5 h-5";
  const pipSize = small ? "w-[3px] h-[3px]" : "w-1 h-1";
  return (
    <div className={`grid grid-cols-3 grid-rows-3 ${size} gap-[1px] p-[1px] pointer-events-none`}>
      {Array.from({ length: 9 }).map((_, i) => (
        <div key={i} className={`self-center justify-self-center rounded-full ${active.includes(i) ? `${pipsClass} ${pipSize}` : `bg-transparent ${pipSize}`}`} />
      ))}
    </div>
  );
}
