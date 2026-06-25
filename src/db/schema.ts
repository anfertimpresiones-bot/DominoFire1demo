import { pgTable, text, integer, boolean, timestamp, bigint, jsonb, decimal, serial } from "drizzle-orm/pg-core";

// 1. USERS TABLE
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  country: text("country").default("DO"),
  coins: integer("coins").default(2000),
  xp: integer("xp").default(0),
  level: integer("level").default(1),
  avatarUrl: text("avatar_url").notNull(),
  walletAddress: text("wallet_address").unique(),
  stats: jsonb("stats"), // stores played, won, lost, capicuas, pointsScored
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow()
});

// 2. ROOMS TABLE (Active game lobbies and state preservation)
export const rooms = pgTable("rooms", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  creatorId: text("creator_id").references(() => users.id, { onDelete: "set null" }),
  mode: text("mode").default("1v1"), // '1v1' or '2v2'
  drawMode: text("draw_mode").default("con_loma"), // 'con_loma' or 'sin_loma'
  pointsToWin: integer("points_to_win").default(100),
  stakeAmount: integer("stake_amount").default(100),
  status: text("status").default("waiting"), // 'waiting', 'playing', 'ended'
  code: text("code").unique(),
  isPrivate: boolean("is_private").default(false),
  roomData: jsonb("room_data"), // Deep state of board/players/queue
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow()
});

// 3. MATCHES TABLE (Match / Game history log)
export const matches = pgTable("matches", {
  id: text("id").primaryKey(),
  mode: text("mode").notNull(),
  drawMode: text("draw_mode").notNull(),
  pointsToWin: integer("points_to_win").default(100),
  stakeAmount: integer("stake_amount").default(100),
  winnerTeam: integer("winner_team"), // 1 or 2
  roomName: text("room_name"),
  playedAt: timestamp("played_at", { withTimezone: true }).defaultNow(),
  details: jsonb("details") // summary statistics of hands
});

// 4. LEADERBOARD TABLE (Cached or structured global rating)
export const leaderboard = pgTable("leaderboard", {
  id: text("id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  country: text("country").notNull(),
  coins: integer("coins").default(0),
  xp: integer("xp").default(0),
  wonGames: integer("won_games").default(0),
  totalGames: integer("total_games").default(0),
  winRate: decimal("win_rate", { precision: 5, scale: 2 }).default("0.00")
});

// 5. TOURNAMENTS TABLE (Automated tournament system data)
export const tournaments = pgTable("tournaments", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  status: text("status").default("upcoming"), // 'upcoming', 'ongoing', 'completed'
  playersCount: integer("players_count").default(0),
  maxPlayers: integer("max_players").default(8),
  prizePool: integer("prize_pool").default(5000),
  startTime: timestamp("start_time", { withTimezone: true }).notNull(),
  roundsData: jsonb("rounds_data") // matches tree results
});

// 6. TRANSACTIONS TABLE (Virtual coins ledger)
export const transactions = pgTable("transactions", {
  id: serial("id").primaryKey(),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  amount: integer("amount").notNull(), // positive for rewards, negative for bets
  type: text("type").notNull(), // 'signup_bonus', 'daily_reward', 'bet', 'win', 'wallet_connect'
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow()
});

// 7. CHAT MESSAGES TABLE
export const chatMessages = pgTable("chat_messages", {
  id: text("id").primaryKey(),
  roomId: text("room_id").references(() => rooms.id, { onDelete: "cascade" }),
  senderId: text("sender_id").references(() => users.id, { onDelete: "cascade" }),
  senderName: text("sender_name").notNull(),
  text: text("text").notNull(),
  isPreset: boolean("is_preset").default(false),
  timestamp: bigint("timestamp", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow()
});
