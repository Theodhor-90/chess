export interface HealthResponse {
  status: "ok";
}

export interface RegisterRequest {
  username: string;
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
    username: string;
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
  username?: string;
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

export interface MoveAck {
  ok: boolean;
  error?: string;
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

export interface GameHistoryQuery {
  page?: number;
  limit?: number;
  result?: "win" | "loss" | "draw";
  sort?: "newest" | "oldest";
}

export interface GameHistoryItem {
  id: number;
  opponentUsername: string;
  opponentId: number;
  result: "win" | "loss" | "draw";
  resultReason: GameStatus;
  myColor: PlayerColor;
  timeControl: string;
  playedAt: number;
}

export interface GameHistoryResponse {
  items: GameHistoryItem[];
  total: number;
}

export interface RecentGameItem {
  gameId: number;
  opponentUsername: string;
  opponentId: number;
  result: "win" | "loss" | "draw";
  resultReason: GameStatus;
  myColor: PlayerColor;
  playedAt: number;
}

export interface PlayerStatsResponse {
  userId: number;
  username: string;
  totalGames: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  avgAccuracy: {
    white: number | null;
    black: number | null;
  };
  recentGames: RecentGameItem[];
}

// ---------------------------------------------------------------------------
// Socket.io event types (Phase 2.1)
// ---------------------------------------------------------------------------

export interface ClientToServerEvents {
  joinRoom: (data: { gameId: number }) => void;
  leaveRoom: (data: { gameId: number }) => void;
  move: (
    data: { gameId: number; from: string; to: string; promotion?: string; moveNumber: number },
    ack?: (response: MoveAck) => void,
  ) => void;
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

// ---------------------------------------------------------------------------
// Analysis types (Phase 4.1)
// ---------------------------------------------------------------------------

export type EvalScore = { type: "cp"; value: number } | { type: "mate"; value: number };

export interface EvaluationResult {
  score: EvalScore;
  bestLine: string[];
  depth: number;
  engineLines?: EngineLineInfo[];
}

export interface EngineLineInfo {
  score: EvalScore;
  moves: string[];
  depth: number;
}

export type MoveClassification = "best" | "good" | "inaccuracy" | "mistake" | "blunder";

export interface AnalyzedPosition {
  fen: string;
  evaluation: EvaluationResult;
  classification: MoveClassification | null;
  centipawnLoss: number | null;
}

// Move tree types (Phase 5.1)
// ---------------------------------------------------------------------------

export interface MoveTreeNode {
  fen: string;
  eval: EvalScore | null;
  bestLine: string[] | null;
  classification: MoveClassification | null;
  san: string | null;
  children: MoveTreeNode[];
  parent: MoveTreeNode | null;
}

export interface SerializedMoveTreeNode {
  fen: string;
  eval: EvalScore | null;
  bestLine: string[] | null;
  classification: MoveClassification | null;
  san: string | null;
  children: SerializedMoveTreeNode[];
}

// ---------------------------------------------------------------------------
// Analysis persistence types (Phase 6.1)
// ---------------------------------------------------------------------------

export interface SerializedAnalysisNode {
  fen: string;
  san: string | null;
  evaluation: EvaluationResult | null;
  classification: MoveClassification | null;
  children: SerializedAnalysisNode[];
}

export interface SaveAnalysisRequest {
  analysisTree: SerializedAnalysisNode;
  whiteAccuracy: number;
  blackAccuracy: number;
  engineDepth: number;
}

export interface SaveAnalysisResponse {
  gameId: number;
  createdAt: number;
}

export interface GetAnalysisResponse {
  gameId: number;
  analysisTree: SerializedAnalysisNode;
  whiteAccuracy: number;
  blackAccuracy: number;
  engineDepth: number;
  createdAt: number;
}
