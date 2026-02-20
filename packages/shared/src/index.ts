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

export interface ClockState {
  white: number; // remaining time in milliseconds
  black: number; // remaining time in milliseconds
  activeColor: PlayerColor | null; // null when game not active or game over
  lastUpdate: number; // server timestamp in ms (Date.now()) for client interpolation
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
  clockState?: ClockState;
  clockWhiteRemaining?: number | null;
  clockBlackRemaining?: number | null;
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

export interface ResolveInviteResponse {
  gameId: number;
  status: GameStatus;
}

export interface GameListItem {
  id: number;
  status: GameStatus;
  players: { white?: GamePlayer; black?: GamePlayer };
  clock: ClockConfig;
  result?: { winner?: PlayerColor; reason: GameStatus };
  createdAt: number;
}

export type GameListResponse = GameListItem[];

// ---------------------------------------------------------------------------
// Socket.io event types (Phase 2.1)
// ---------------------------------------------------------------------------

export interface ClientToServerEvents {
  joinRoom: (data: { gameId: number }) => void;
  leaveRoom: (data: { gameId: number }) => void;
  move: (data: { gameId: number; from: string; to: string; promotion?: string }) => void;
  resign: (data: { gameId: number }) => void;
  offerDraw: (data: { gameId: number }) => void;
  acceptDraw: (data: { gameId: number }) => void;
  abort: (data: { gameId: number }) => void;
  pong: (data: { timestamp: number }) => void;
}

export interface ServerToClientEvents {
  gameState: (data: GameState & { clock: ClockState }) => void;
  moveMade: (data: {
    fen: string;
    san: string;
    pgn: string;
    status: GameStatus;
    result?: GameState["result"];
    clock: ClockState;
  }) => void;
  gameOver: (data: {
    status: GameStatus;
    result: NonNullable<GameState["result"]>;
    clock: ClockState;
  }) => void;
  opponentJoined: (data: { userId: number; color: PlayerColor }) => void;
  opponentDisconnected: (data: Record<string, never>) => void;
  opponentReconnected: (data: Record<string, never>) => void;
  drawOffered: (data: { by: PlayerColor }) => void;
  drawDeclined: (data: Record<string, never>) => void;
  clockUpdate: (data: ClockState) => void;
  error: (data: { message: string }) => void;
  ping: (data: { timestamp: number }) => void;
}

export interface ServerSocketData {
  userId: number;
  rtt: number; // latest round-trip time in ms
}
