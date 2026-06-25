import { db, isSqlConfigured } from "../db/index.ts";
import { users, rooms, matches, leaderboard, tournaments, transactions, chatMessages } from "../db/schema.ts";
import { eq, and, desc } from "drizzle-orm";
import admin from "firebase-admin";
import fs from "fs";
import path from "path";
import { UserProfile, GameRoom, ChatMessage, LeaderboardEntry, Tournament } from "../types.js";

// Initialize Firebase Admin SDK safely on server-side
let fstore: any = null;
try {
  const configPath = path.join(process.cwd(), "firebase-applet-config.json");
  if (fs.existsSync(configPath)) {
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    const adminAny = admin as any;
    // Safely support both standard app tracking and newer module definitions
    const apps = adminAny.apps || (adminAny.getApps ? adminAny.getApps() : []);
    if (apps.length === 0) {
      admin.initializeApp({
        projectId: config.projectId
      });
    }
    fstore = adminAny.firestore ? adminAny.firestore(config.firestoreDatabaseId || undefined) : null;
    console.log("Firebase Admin Firestore successfully connected and ready on backend.");
  }
} catch (err) {
  console.error("Backend Firebase Admin SDK initialization failed:", err);
}

// Memory database fallback cache
const memoryStore = {
  users: {} as Record<string, UserProfile>,
  rooms: {} as Record<string, GameRoom>,
  matches: [] as any[],
  leaderboard: [] as LeaderboardEntry[],
  tournaments: [] as Tournament[],
  transactions: [] as any[],
  chat_messages: [] as any[]
};

// Seed initial memory store defaults to keep things lively in fallback mode or first loads
const DOMINICAN_NAMES = [
  "El Tíguere de Bani", "La Rubia de Santiago", "Cibaeño Fino", "Don Manuel", 
  "Capitán Capicúa", "El Rubio de Herrera", "Doña Carmen", "Moreno de Haina"
];
const COUNTRIES = ["DO", "DO", "DO", "DO", "DO", "US", "ES", "PR"];

memoryStore.leaderboard = DOMINICAN_NAMES.map((name, i) => ({
  id: `seeded-user-${i}`,
  name,
  country: COUNTRIES[i],
  coins: 10000 - i * 1200,
  xp: 4500 - i * 500,
  won: 95 - i * 10,
  ratio: Number((85 - i * 4).toFixed(1)),
  nftAvatar: i % 3 === 0 ? "nft_avatar_classic_wood" : undefined
}));

memoryStore.tournaments = [
  {
    id: "tour-01",
    name: "Copa del Caribe: Santo Domingo",
    status: "ongoing",
    playersCount: 12,
    maxPlayers: 16,
    prizePool: 15000,
    startTime: new Date(Date.now() + 3600000).toISOString(),
    rounds: [
      {
        round: 1,
        matches: [
          { team1: ["Anacaona", "Cibaeño Fino"], team2: ["Don Manuel", "El Rubio"], score1: 100, score2: 85, winner: "Team 1" },
          { team1: ["El Tíguere", "Rubia de Santiago"], team2: ["Moreno", "Doña Carmen"], score1: 72, score2: 100, winner: "Team 2" }
        ]
      }
    ]
  },
  {
    id: "tour-02",
    name: "Torneo de Colmado 'La Esquina'",
    status: "upcoming",
    playersCount: 4,
    maxPlayers: 8,
    prizePool: 5000,
    startTime: new Date(Date.now() + 86400000).toISOString(),
    rounds: []
  }
];

// --- 1. USER PROFILE HELPER METHODS ---
export async function getProfile(userId: string): Promise<UserProfile | null> {
  // First, check Cloud SQL if available
  if (isSqlConfigured && db) {
    try {
      const results = await db.select().from(users).where(eq(users.id, userId));
      if (results.length > 0) {
        const row = results[0];
        const profile = {
          id: row.id,
          name: row.name,
          country: row.country || "DO",
          coins: row.coins ?? 2000,
          xp: row.xp ?? 0,
          level: row.level ?? 1,
          walletAddress: row.walletAddress || undefined,
          avatarUrl: row.avatarUrl,
          stats: (row.stats as any) || { played: 0, won: 0, lost: 0, capicuas: 0, pointsScored: 0 }
        };
        // Sync to Firestore in the background
        if (fstore) {
          fstore.collection("users").doc(userId).set(profile, { merge: true }).catch(() => {});
        }
        return profile;
      }
    } catch (err) {
      console.error(`Error loading profile for ${userId} from Cloud SQL:`, err);
    }
  }

  // Second, look up Firestore fallback
  if (fstore) {
    try {
      const docSnap = await fstore.collection("users").doc(userId).get();
      if (docSnap.exists) {
        const data = docSnap.data()!;
        return {
          id: userId,
          name: data.name,
          country: data.country || "DO",
          coins: data.coins ?? 2000,
          xp: data.xp ?? 0,
          level: data.level ?? 1,
          walletAddress: data.walletAddress || undefined,
          avatarUrl: data.avatarUrl,
          stats: data.stats || { played: 0, won: 0, lost: 0, capicuas: 0, pointsScored: 0 }
        };
      }
    } catch (err) {
      console.error(`Error loading profile for ${userId} from Firestore:`, err);
    }
  }

  return memoryStore.users[userId] || null;
}

export async function saveProfile(profile: UserProfile): Promise<UserProfile> {
  // Always update local memory store for instant sync
  memoryStore.users[profile.id] = { ...profile };

  // Sync to local memory leaderboard as well
  const idx = memoryStore.leaderboard.findIndex(l => l.id === profile.id);
  const lbEntry: LeaderboardEntry = {
    id: profile.id,
    name: profile.name,
    country: profile.country,
    coins: profile.coins,
    xp: profile.xp,
    won: profile.stats.won,
    ratio: profile.stats.played > 0 ? Number(((profile.stats.won / profile.stats.played) * 100).toFixed(1)) : 0,
    nftAvatar: profile.nftAsset?.type === 'avatar' ? profile.nftAsset.id : undefined
  };
  if (idx !== -1) {
    memoryStore.leaderboard[idx] = lbEntry;
  } else {
    memoryStore.leaderboard.push(lbEntry);
  }

  // Write to Firestore database directly
  if (fstore) {
    try {
      await fstore.collection("users").doc(profile.id).set(profile, { merge: true });
      await fstore.collection("leaderboard").doc(profile.id).set(lbEntry, { merge: true });
    } catch (err) {
      console.error("Error saving profile to Firestore:", err);
    }
  }

  if (!isSqlConfigured || !db) return profile;

  try {
    // 1. Save base profile in users table (upsert)
    await db.insert(users).values({
      id: profile.id,
      name: profile.name,
      country: profile.country,
      coins: profile.coins,
      xp: profile.xp,
      level: profile.level,
      avatarUrl: profile.avatarUrl,
      walletAddress: profile.walletAddress || null,
      stats: profile.stats,
    }).onConflictDoUpdate({
      target: users.id,
      set: {
        name: profile.name,
        country: profile.country,
        coins: profile.coins,
        xp: profile.xp,
        level: profile.level,
        avatarUrl: profile.avatarUrl,
        walletAddress: profile.walletAddress || null,
        stats: profile.stats,
      }
    });

    // 2. Refresh or update leaderboard table (upsert)
    await db.insert(leaderboard).values({
      id: profile.id,
      name: profile.name,
      country: profile.country,
      coins: profile.coins,
      xp: profile.xp,
      wonGames: profile.stats.won,
      totalGames: profile.stats.played,
      winRate: lbEntry.ratio.toString(),
    }).onConflictDoUpdate({
      target: leaderboard.id,
      set: {
        name: profile.name,
        country: profile.country,
        coins: profile.coins,
        xp: profile.xp,
        wonGames: profile.stats.won,
        totalGames: profile.stats.played,
        winRate: lbEntry.ratio.toString(),
      }
    });

  } catch (err) {
    console.error("Error upserting profile in Cloud SQL:", err);
  }

  return profile;
}

// --- 2. ROOMS STATE MANIPULATOR HELPER METHODS ---
export async function dbSaveRoom(room: GameRoom): Promise<void> {
  memoryStore.rooms[room.id] = { ...room };

  if (fstore) {
    try {
      await fstore.collection("rooms").doc(room.id).set(room);
    } catch (err) {
      console.error(`Error saving room ${room.id} to Firestore:`, err);
    }
  }

  if (!isSqlConfigured || !db) return;

  try {
    await db.insert(rooms).values({
      id: room.id,
      name: room.name,
      creatorId: room.creatorId || null,
      mode: room.mode,
      drawMode: room.drawMode,
      pointsToWin: room.pointsToWin,
      stakeAmount: room.stakeAmount,
      status: room.status,
      code: room.code || null,
      isPrivate: room.isPrivate,
      roomData: room,
    }).onConflictDoUpdate({
      target: rooms.id,
      set: {
        name: room.name,
        creatorId: room.creatorId || null,
        mode: room.mode,
        drawMode: room.drawMode,
        pointsToWin: room.pointsToWin,
        stakeAmount: room.stakeAmount,
        status: room.status,
        code: room.code || null,
        isPrivate: room.isPrivate,
        roomData: room,
        updatedAt: new Date(),
      }
    });
  } catch (err) {
    console.error(`Error saving room ${room.id} to Cloud SQL:`, err);
  }
}

export async function dbDeleteRoom(roomId: string): Promise<void> {
  delete memoryStore.rooms[roomId];

  if (fstore) {
    try {
      await fstore.collection("rooms").doc(roomId).delete();
    } catch (err) {
      console.error(`Error deleting room ${roomId} from Firestore:`, err);
    }
  }

  if (!isSqlConfigured || !db) return;

  try {
    await db.delete(rooms).where(eq(rooms.id, roomId));
  } catch (err) {
    console.error(`Error deleting room ${roomId} from Cloud SQL:`, err);
  }
}

export async function dbGetPublicRooms(): Promise<any[]> {
  // 1. Try Cloud SQL first if enabled
  if (isSqlConfigured && db) {
    try {
      const results = await db.select()
        .from(rooms)
        .where(
          and(
            eq(rooms.status, "waiting"),
            eq(rooms.isPrivate, false)
          )
        );

      return results.map((row) => {
        const room = row.roomData as any as GameRoom;
        return {
          id: row.id,
          name: row.name,
          mode: row.mode || "1v1",
          drawMode: row.drawMode || "con_loma",
          pointsToWin: row.pointsToWin ?? 100,
          playersCount: room?.players?.length || 1,
          maxPlayers: row.mode === "1v1" ? 2 : 4,
          stakeAmount: row.stakeAmount ?? 100
        };
      });
    } catch (err) {
      console.error("Error retrieving public rooms from Cloud SQL, will try Firestore:", err);
    }
  }

  // 2. Try Firestore fallback
  if (fstore) {
    try {
      const snap = await fstore.collection("rooms")
        .where("isPrivate", "==", false)
        .where("status", "==", "waiting")
        .get();
      return snap.docs.map((doc: any) => {
        const r = doc.data() as GameRoom;
        return {
          id: r.id,
          name: r.name,
          mode: r.mode,
          drawMode: r.drawMode,
          pointsToWin: r.pointsToWin,
          playersCount: r.players?.length || 0,
          maxPlayers: r.mode === "1v1" ? 2 : 4,
          stakeAmount: r.stakeAmount
        };
      });
    } catch (err) {
      console.error("Error retrieving public rooms from Firestore:", err);
    }
  }

  // 3. Try local memory state fallback
  return Object.values(memoryStore.rooms)
    .filter(r => !r.isPrivate && r.status === "waiting")
    .map(r => ({
      id: r.id,
      name: r.name,
      mode: r.mode,
      drawMode: r.drawMode,
      pointsToWin: r.pointsToWin,
      playersCount: r.players?.length || 0,
      maxPlayers: r.mode === "1v1" ? 2 : 4,
      stakeAmount: r.stakeAmount
    }));
}

// --- 3. TOURNAMENTS MANIPULATOR HELPER METHODS ---
export async function dbGetTournaments(): Promise<Tournament[]> {
  // 1. Try Cloud SQL first
  if (isSqlConfigured && db) {
    try {
      const results = await db.select().from(tournaments);

      if (results.length > 0) {
        return results.map((t) => ({
          id: t.id,
          name: t.name,
          status: t.status as any,
          playersCount: t.playersCount ?? 0,
          maxPlayers: t.maxPlayers ?? 8,
          prizePool: t.prizePool ?? 15000,
          startTime: t.startTime.toISOString(),
          rounds: (t.roundsData as any) || []
        }));
      }
    } catch (err) {
      console.error("Error getting tournaments from Cloud SQL, will try Firestore:", err);
    }
  }

  // 2. Try Firebase fallback
  if (fstore) {
    try {
      const snap = await fstore.collection("tournaments").get();
      if (snap.size > 0) {
        return snap.docs.map((doc: any) => doc.data() as Tournament);
      } else {
        // Seed tournaments in Firestore
        for (const t of memoryStore.tournaments) {
          await fstore.collection("tournaments").doc(t.id).set(t).catch(() => {});
        }
        return memoryStore.tournaments;
      }
    } catch (err) {
      console.error("Error retrieving tournaments from Firestore:", err);
    }
  }

  // 3. Try local memory state fallback
  return memoryStore.tournaments;
}

// --- 4. LEADERBOARD RETRIEVER METHODS ---
export async function dbGetLeaderboard(): Promise<LeaderboardEntry[]> {
  // 1. Try Cloud SQL first
  if (isSqlConfigured && db) {
    try {
      const results = await db.select()
        .from(leaderboard)
        .orderBy(desc(leaderboard.xp))
        .limit(50);

      if (results.length > 0) {
        return results.map((row) => ({
          id: row.id,
          name: row.name,
          country: row.country,
          coins: row.coins ?? 0,
          xp: row.xp ?? 0,
          won: row.wonGames ?? 0,
          ratio: Number(row.winRate) || 0,
          nftAvatar: undefined
        }));
      }
    } catch (err) {
      console.error("Error fetching leaderboard from Cloud SQL, will try Firestore:", err);
    }
  }

  // 2. Try Firebase fallback
  if (fstore) {
    try {
      const snap = await fstore.collection("leaderboard")
        .orderBy("xp", "desc")
        .limit(50)
        .get();
      if (snap.size > 0) {
        return snap.docs.map((doc: any) => doc.data() as LeaderboardEntry);
      } else {
        // Sync existing seeds
        for (const entry of memoryStore.leaderboard) {
          await fstore.collection("leaderboard").doc(entry.id).set(entry).catch(() => {});
        }
        return memoryStore.leaderboard;
      }
    } catch (err) {
      console.error("Error reading leaderboard from Firestore:", err);
    }
  }

  // 3. Try local memory state fallback
  return [...memoryStore.leaderboard].sort((a, b) => b.xp - a.xp).slice(0, 50);
}

// --- 5. MATCH LOGGER HELPER METHODS ---
export async function dbRecordMatch(
  id: string,
  mode: string,
  drawMode: string,
  pointsToWin: number,
  stakeAmount: number,
  winnerTeam: number,
  roomName: string,
  detailsObj: any
): Promise<void> {
  const matchRow = {
    id,
    mode,
    drawMode,
    pointsToWin,
    stakeAmount,
    winnerTeam,
    roomName,
    playedAt: new Date().toISOString(),
    details: detailsObj
  };

  memoryStore.matches.push(matchRow);

  if (fstore) {
    try {
      await fstore.collection("matches").doc(id).set(matchRow);
    } catch (err) {
      console.error(`Error logging match to Firestore:`, err);
    }
  }

  if (!isSqlConfigured || !db) return;

  try {
    await db.insert(matches).values({
      ...matchRow,
      playedAt: new Date(matchRow.playedAt)
    });
  } catch (err) {
    console.error("Error inserting match history into Cloud SQL:", err);
  }
}

// --- 6. TRANSACTIONS LEDGER HELPER METHODS ---
export async function dbRecordTransaction(
  userId: string,
  amount: number,
  type: string,
  description: string
): Promise<void> {
  const transRow = {
    userId,
    amount,
    type,
    description,
    createdAt: new Date().toISOString()
  };

  memoryStore.transactions.push(transRow);

  if (fstore) {
    try {
      await fstore.collection("transactions").add(transRow);
    } catch (err) {
      console.error("Error in transaction Firestore logging:", err);
    }
  }

  if (!isSqlConfigured || !db) return;

  try {
    await db.insert(transactions).values({
      ...transRow,
      createdAt: new Date(transRow.createdAt)
    });
  } catch (err) {
    console.error("Error inserting transaction into Cloud SQL:", err);
  }
}

// --- 7. CHAT MESSAGES PERSISTENCE HELPER METHODS ---
export async function dbSaveChatMessage(
  id: string,
  roomId: string,
  senderId: string,
  senderName: string,
  text: string,
  isPreset: boolean,
  timestamp: number
): Promise<void> {
  const msgRow = {
    id,
    roomId,
    senderId,
    senderName,
    text,
    isPreset,
    timestamp
  };

  memoryStore.chat_messages.push(msgRow);

  if (fstore) {
    try {
      await fstore.collection("chat_messages").doc(id).set(msgRow);
    } catch (err) {
      console.error("Error logging chat message to Firestore:", err);
    }
  }

  if (!isSqlConfigured || !db) return;

  try {
    await db.insert(chatMessages).values(msgRow);
  } catch (err) {
    console.error("Error logging chat message to Cloud SQL:", err);
  }
}

