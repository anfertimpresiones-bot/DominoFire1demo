-- Database schema for Domino Dominicano - El Clásico Real (PostgreSQL)
-- Optimized for high horizontal scalability and up to 100,000+ concurrent players.

-- Enums
CREATE TYPE game_mode AS ENUM ('1v1', '2v2');
CREATE TYPE draw_mode AS ENUM ('con_loma', 'sin_loma');
CREATE TYPE tour_status AS ENUM ('upcoming', 'ongoing', 'completed');

-- Users & Players state
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

-- Index user wallet addresses for instant Web3 auth
CREATE INDEX idx_users_wallet ON users(wallet_address);

-- User Statistics
CREATE TABLE IF NOT EXISTS user_stats (
    user_id VARCHAR(100) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    played INT DEFAULT 0,
    won INT DEFAULT 0,
    lost INT DEFAULT 0,
    capicuas INT DEFAULT 0,
    points_scored INT DEFAULT 0,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Daily Rewards tracking
CREATE TABLE IF NOT EXISTS daily_rewards (
    user_id VARCHAR(100) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    last_claimed_at TIMESTAMP WITH TIME ZONE,
    current_streak INT DEFAULT 0
);

-- NFTs owned by users
CREATE TABLE IF NOT EXISTS owned_nfts (
    id VARCHAR(100) PRIMARY KEY,
    user_id VARCHAR(100) REFERENCES users(id) ON DELETE CASCADE,
    nft_type VARCHAR(50) NOT NULL, -- 'avatar', 'table', 'tiles'
    name VARCHAR(100) NOT NULL,
    image_url VARCHAR(500) NOT NULL,
    token_id VARCHAR(100),
    blockchain_id VARCHAR(10) DEFAULT 'polygon',
    acquired_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Match / Game History
CREATE TABLE IF NOT EXISTS game_history (
    id VARCHAR(100) PRIMARY KEY,
    mode game_mode NOT NULL,
    draw_mode draw_mode NOT NULL,
    points_to_win INT DEFAULT 100,
    stake_amount INT DEFAULT 100,
    winner_team INT, -- 1 or 2
    is_blocked BOOLEAN DEFAULT FALSE,
    duration_seconds INT,
    played_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Match Players (Associative table for multi-player games)
CREATE TABLE IF NOT EXISTS game_history_players (
    game_history_id VARCHAR(100) REFERENCES game_history(id) ON DELETE CASCADE,
    user_id VARCHAR(100) REFERENCES users(id) ON DELETE CASCADE,
    team_number INT CHECK (team_number IN (1, 2)),
    end_score INT DEFAULT 0,
    points_contributed INT DEFAULT 0,
    is_winner BOOLEAN DEFAULT FALSE,
    PRIMARY KEY (game_history_id, user_id)
);

-- Leaderboard Cached View
CREATE TABLE IF NOT EXISTS global_leaderboard (
    id VARCHAR(100) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    country VARCHAR(10) NOT NULL,
    won_games INT DEFAULT 0,
    total_games INT DEFAULT 0,
    coins INT DEFAULT 0,
    xp INT DEFAULT 0,
    win_rate NUMERIC(5, 2) DEFAULT 0.00
);

-- Create leaderboard indices for fast sub-millisecond querying
CREATE INDEX idx_leaderboard_xp ON global_leaderboard(xp DESC);
CREATE INDEX idx_leaderboard_coins ON global_leaderboard(coins DESC);
