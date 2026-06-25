export type Tile = [number, number];

export interface Player {
  id: string;
  name: string;
  isBot: boolean;
  avatarUrl?: string;
  walletAddress?: string;
  nftId?: string;
  country: string;
  coins: number;
  xp: number;
  level: number;
  tiles: Tile[];
  ready: boolean;
  team: 1 | 2; // Team 1: players at index 0 & 2, Team 2: players at index 1 & 3
  score: number; // Cumulative match score (e.g. up to 100/200 points)
  socketId?: string;
}

export type GameMode = '1v1' | '2v2';
export type DrawMode = 'con_loma' | 'sin_loma';

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  isPreset: boolean;
  timestamp: number;
}

export interface GameRoom {
  id: string;
  name: string;
  creatorId: string;
  mode: GameMode;
  drawMode: DrawMode;
  pointsToWin: number;
  status: 'waiting' | 'playing' | 'ended';
  players: Player[];
  board: Tile[]; // Ordered tiles on the table.
  leftEnd: number | null;
  rightEnd: number | null;
  currentPlayerIndex: number;
  deck: Tile[]; // Remaining tiles for drawing (con loma)
  starterIndex: number; // Who made the opening play
  roundNumber: number;
  winnerPlayerId: string | null;
  winnerTeam: 1 | 2 | null;
  isBlocked: boolean;
  messages: ChatMessage[];
  code: string; // Invite code
  isPrivate: boolean;
  stakeAmount: number; // Entry coins
}

export interface UserProfile {
  id: string;
  name: string;
  country: string;
  coins: number;
  xp: number;
  level: number;
  walletAddress?: string;
  avatarUrl: string;
  nftAsset?: {
    id: string;
    type: 'avatar' | 'table' | 'tiles';
    name: string;
    image: string;
  };
  stats: {
    played: number;
    won: number;
    lost: number;
    capicuas: number;
    pointsScored: number;
  };
}

export interface LeaderboardEntry {
  id: string;
  name: string;
  country: string;
  coins: number;
  xp: number;
  won: number;
  ratio: number;
  nftAvatar?: string;
}

export interface Tournament {
  id: string;
  name: string;
  status: 'upcoming' | 'ongoing' | 'completed';
  playersCount: number;
  maxPlayers: number;
  prizePool: number;
  startTime: string;
  rounds: {
    round: number;
    matches: {
      team1: string[];
      team2: string[];
      score1?: number;
      score2?: number;
      winner?: string;
    }[];
  }[];
}
