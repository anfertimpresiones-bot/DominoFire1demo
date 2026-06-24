-- Supabase PostgreSQL Database Schema
-- Optimized for high horizontal scalability and up to 100,000+ concurrent players.
-- Domino Dominicano - El Clásico Real

-- 1. USERS TABLE
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(100) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    country VARCHAR(10) DEFAULT 'DO',
    coins INT DEFAULT 2000 CHECK (coins >= 0),
    xp INT DEFAULT 0,
    level INT DEFAULT 1,
    avatar_url VARCHAR(500) NOT NULL,
    wallet_address VARCHAR(100) UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index user wallet addresses for instant Web3 auth lookup
CREATE INDEX IF NOT EXISTS idx_users_wallet ON users(wallet_address);

-- 2. ROOMS TABLE (Active game lobbies and state preservation)
CREATE TABLE IF NOT EXISTS rooms (
    id VARCHAR(100) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    creator_id VARCHAR(100) REFERENCES users(id) ON DELETE SET NULL,
    mode VARCHAR(10) DEFAULT '1v1', -- '1v1' or '2v2'
    draw_mode VARCHAR(15) DEFAULT 'con_loma', -- 'con_loma' or 'sin_loma'
    points_to_win INT DEFAULT 100,
    stake_amount INT DEFAULT 100,
    status VARCHAR(20) DEFAULT 'waiting', -- 'waiting', 'playing', 'ended'
    code VARCHAR(10) UNIQUE, -- Invite code
    is_private BOOLEAN DEFAULT FALSE,
    room_data JSONB, -- Deep JSON state of the grid, players, board, and queue
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_rooms_code ON rooms(code);
CREATE INDEX IF NOT EXISTS idx_rooms_status ON rooms(status);

-- 3. MATCHES TABLE (Match / Game history log)
CREATE TABLE IF NOT EXISTS matches (
    id VARCHAR(100) PRIMARY KEY,
    mode VARCHAR(10) NOT NULL,
    draw_mode VARCHAR(15) NOT NULL,
    points_to_win INT DEFAULT 100,
    stake_amount INT DEFAULT 100,
    winner_team INT, -- 1 or 2
    room_name VARCHAR(100),
    played_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    details JSONB -- Summary statistics of the hands and players involved
);

-- 4. LEADERBOARD TABLE (Cached or structured global rating)
CREATE TABLE IF NOT EXISTS leaderboard (
    id VARCHAR(100) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    country VARCHAR(10) NOT NULL,
    coins INT DEFAULT 0,
    xp INT DEFAULT 0,
    won_games INT DEFAULT 0,
    total_games INT DEFAULT 0,
    win_rate NUMERIC(5, 2) DEFAULT 0.00
);

CREATE INDEX IF NOT EXISTS idx_leaderboard_xp ON leaderboard(xp DESC);
CREATE INDEX IF NOT EXISTS idx_leaderboard_coins ON leaderboard(coins DESC);

-- 5. TOURNAMENTS TABLE (Automated tournament system data)
CREATE TABLE IF NOT EXISTS tournaments (
    id VARCHAR(100) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    status VARCHAR(20) DEFAULT 'upcoming', -- 'upcoming', 'ongoing', 'completed'
    players_count INT DEFAULT 0,
    max_players INT DEFAULT 8,
    prize_pool INT DEFAULT 5000,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    rounds_data JSONB -- Matches tree configuration and results
);

-- 6. TRANSACTIONS TABLE (Virtual coins ledger for audits or balance changes)
CREATE TABLE IF NOT EXISTS transactions (
    id BIGSERIAL PRIMARY KEY,
    user_id VARCHAR(100) REFERENCES users(id) ON DELETE CASCADE,
    amount INT NOT NULL, -- positive for rewards, negative for entry bets
    type VARCHAR(50) NOT NULL, -- 'daily_reward', 'bet', 'win', 'wallet_connect'
    description VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);

-- 7. CHAT MESSAGES TABLE
CREATE TABLE IF NOT EXISTS chat_messages (
    id VARCHAR(100) PRIMARY KEY,
    room_id VARCHAR(100) REFERENCES rooms(id) ON DELETE CASCADE,
    sender_id VARCHAR(100) REFERENCES users(id) ON DELETE CASCADE,
    sender_name VARCHAR(100) NOT NULL,
    text TEXT NOT NULL,
    is_preset BOOLEAN DEFAULT FALSE,
    timestamp BIGINT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_chat_room ON chat_messages(room_id);
