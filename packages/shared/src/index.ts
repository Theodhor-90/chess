export interface HealthResponse {
  status: "ok";
}

export interface RegisterRequest {
  email: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: {
    id: number;
    email: string;
  };
}

export interface ErrorResponse {
  error: string;
}

// ---------------------------------------------------------------------------
// Game types (Phase 1.2)
// ---------------------------------------------------------------------------

export type GameStatus =
  | "waiting"
  | "active"
  | "checkmate"
  | "stalemate"
  | "resigned"
  | "draw"
  | "timeout"
  | "aborted";

export type PlayerColor = "white" | "black";

export interface MoveRequest {
  from: string;
  to: string;
  promotion?: string;
}

export interface GamePlayer {
  userId: number;
  color: PlayerColor;
}

export interface ClockConfig {
  initialTime: number;
  increment: number;
}

export interface GameState {
  id: number;
  inviteToken: string;
  status: GameStatus;
  players: { white?: GamePlayer; black?: GamePlayer };
  fen: string;
  pgn: string;
  moves: string[];
  currentTurn: PlayerColor;
  clock: ClockConfig;
  drawOffer: PlayerColor | null;
  result?: { winner?: PlayerColor; reason: GameStatus };
  createdAt: number;
}

export interface CreateGameRequest {
  clock?: ClockConfig;
}

export interface CreateGameResponse {
  gameId: number;
  inviteToken: string;
  color: PlayerColor;
}

export interface JoinGameRequest {
  inviteToken: string;
}

export type GameResponse = GameState;

export interface MoveResponse {
  fen: string;
  pgn: string;
  san: string;
  status: GameStatus;
  result?: GameState["result"];
}

// ---------------------------------------------------------------------------
// Game list types (Phase 1.3)
// ---------------------------------------------------------------------------

export interface GameListItem {
  id: number;
  status: GameStatus;
  players: { white?: GamePlayer; black?: GamePlayer };
  clock: ClockConfig;
  result?: { winner?: PlayerColor; reason: GameStatus };
  createdAt: number;
  playerColor: PlayerColor;
}

export interface GameListResponse {
  games: GameListItem[];
}
