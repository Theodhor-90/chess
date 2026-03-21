import type { OpeningInfo } from "./openings.js";

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
  botLevel?: number | null;
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
  botLevel?: number | null;
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
  botLevel?: number | null;
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
  botLevel?: number | null;
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
  startAnalysis: (data: { gameId: number }) => void;
  cancelAnalysis: (data: { gameId: number }) => void;
  evaluatePosition: (data: { fen: string; requestId: string }) => void;
  cancelEvaluation: (data: { requestId: string }) => void;
  analyzePgn: (data: { pgn: string; requestId: string }) => void;
  cancelPgnAnalysis: (data: { requestId: string }) => void;
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
  analysisProgress: (data: AnalysisProgressPayload) => void;
  analysisComplete: (data: AnalysisProgressPayload) => void;
  analysisError: (data: { gameId: number; error: string }) => void;
  positionEvaluation: (data: {
    requestId: string;
    result: EvaluationResult;
    depth: number;
    final: boolean;
  }) => void;
  positionEvalError: (data: { requestId: string; error: string }) => void;
  pgnAnalysisProgress: (data: PgnAnalysisProgressPayload) => void;
  pgnAnalysisComplete: (data: PgnAnalysisProgressPayload) => void;
  pgnAnalysisError: (data: { requestId: string; error: string }) => void;
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

// ---------------------------------------------------------------------------
// Progressive analysis types
// ---------------------------------------------------------------------------

export const ANALYSIS_DEPTH_THRESHOLDS = [10, 13, 16, 18, 20] as const;

export interface AnalysisProgressPayload {
  gameId: number;
  positions: AnalyzedPosition[];
  whiteAccuracy: number;
  blackAccuracy: number;
  completedPositions: number;
  totalPositions: number;
}

export interface PgnAnalysisProgressPayload {
  requestId: string;
  positions: AnalyzedPosition[];
  whiteAccuracy: number;
  blackAccuracy: number;
  completedPositions: number;
  totalPositions: number;
}

// ---------------------------------------------------------------------------
// Engine API types (Phase 9.1)
// ---------------------------------------------------------------------------

export interface ServerEvaluateRequest {
  fen: string;
  depth?: number;
}

export interface ServerAnalyzeResponse {
  positions: AnalyzedPosition[];
  whiteAccuracy: number;
  blackAccuracy: number;
}

// ---------------------------------------------------------------------------
// Analysis utility functions (moved from apps/web/src/services/analysis.ts)
// ---------------------------------------------------------------------------

export function mateScoreToCp(mateValue: number): number {
  if (mateValue === 0) return 0;
  const sign = mateValue > 0 ? 1 : -1;
  return sign * Math.round(100000 / Math.abs(mateValue));
}

export function evalToAbsoluteCp(score: EvalScore, isWhiteTurn: boolean): number {
  const raw = score.type === "mate" ? mateScoreToCp(score.value) : score.value;
  return isWhiteTurn ? raw : -raw;
}

export function classifyMove(
  evalBefore: EvalScore,
  evalAfter: EvalScore,
  bestMoveSan: string,
  playedMoveSan: string,
  isWhiteTurn: boolean,
): MoveClassification {
  if (playedMoveSan === bestMoveSan) return "best";

  const cpBefore = evalToAbsoluteCp(evalBefore, isWhiteTurn);
  const cpAfter = evalToAbsoluteCp(evalAfter, !isWhiteTurn);
  const loss = isWhiteTurn ? cpBefore - cpAfter : cpAfter - cpBefore;

  if (loss <= 30) return "good";
  if (loss <= 100) return "inaccuracy";
  if (loss <= 250) return "mistake";
  return "blunder";
}

export function computeAccuracy(centipawnLosses: number[]): number {
  if (centipawnLosses.length === 0) return 100;
  const total = centipawnLosses.reduce(
    (sum, loss) => sum + Math.min(100, Math.max(0, 100 - loss)),
    0,
  );
  return total / centipawnLosses.length;
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

// ---------------------------------------------------------------------------
// Database Browser Types (Phase 10.1)
// ---------------------------------------------------------------------------

export interface DatabaseGame {
  id: number;
  white: string;
  black: string;
  whiteElo: number;
  blackElo: number;
  result: string;
  eco: string | null;
  opening: string | null;
  date: string | null;
  timeControl: string | null;
  termination: string | null;
  lichessUrl: string;
  pgn: string;
}

export interface DatabaseGameFilter {
  player?: string;
  white?: string;
  black?: string;
  minElo?: number;
  maxElo?: number;
  result?: string;
  eco?: string;
  opening?: string;
  dateFrom?: string;
  dateTo?: string;
  timeControl?: string;
  termination?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export type DatabaseGameSortField = "date" | "whiteElo" | "blackElo" | "opening" | "eco";

export type SortOrder = "asc" | "desc";

export interface DatabaseGamesQuery extends DatabaseGameFilter {
  page?: number;
  limit?: number;
  sort?: DatabaseGameSortField;
  order?: SortOrder;
}

// ---------------------------------------------------------------------------
// User Preferences Types (Phase 14.1)
// ---------------------------------------------------------------------------

export interface UserPreferences {
  theme: "light" | "dark" | "system";
  boardTheme: "brown" | "blue" | "green" | "ic";
  pieceTheme: "cburnett" | "merida" | "alpha" | "california";
}

export interface UserPreferencesResponse {
  preferences: UserPreferences;
}

// ---------------------------------------------------------------------------
// Bot Types (Phase 15.1)
// ---------------------------------------------------------------------------

export interface BotProfile {
  id: number;
  name: string;
  level: number;
  estimatedElo: number;
  depth: number;
  errorRate: number;
  thinkTimeMin: number;
  thinkTimeMax: number;
}

export interface BotGameRequest {
  level: number;
  clock?: ClockConfig;
}

export interface BotGameResponse {
  gameId: number;
  color: PlayerColor;
  botProfile: BotProfile;
}

export const BOT_PROFILES: readonly BotProfile[] = [
  {
    id: 1,
    name: "Patzer Pete",
    level: 1,
    estimatedElo: 400,
    depth: 3,
    errorRate: 0.6,
    thinkTimeMin: 200,
    thinkTimeMax: 800,
  },
  {
    id: 2,
    name: "Casual Carol",
    level: 2,
    estimatedElo: 800,
    depth: 6,
    errorRate: 0.4,
    thinkTimeMin: 300,
    thinkTimeMax: 1200,
  },
  {
    id: 3,
    name: "Club Charlie",
    level: 3,
    estimatedElo: 1200,
    depth: 10,
    errorRate: 0.2,
    thinkTimeMin: 500,
    thinkTimeMax: 2000,
  },
  {
    id: 4,
    name: "Expert Eva",
    level: 4,
    estimatedElo: 1600,
    depth: 14,
    errorRate: 0.08,
    thinkTimeMin: 800,
    thinkTimeMax: 3000,
  },
  {
    id: 5,
    name: "Master Max",
    level: 5,
    estimatedElo: 2000,
    depth: 18,
    errorRate: 0.0,
    thinkTimeMin: 1000,
    thinkTimeMax: 4000,
  },
] as const;

// ---------------------------------------------------------------------------
// Puzzle Types (M16)
// ---------------------------------------------------------------------------

export interface Puzzle {
  puzzleId: string;
  fen: string;
  moves: string[];
  rating: number;
  ratingDeviation: number;
  popularity: number;
  nbPlays: number;
  themes: string[];
  gameUrl: string;
  openingTags: string | null;
}

export interface PuzzleNextResponse {
  puzzle: Puzzle;
}

export interface PuzzleAttemptRequest {
  moves: string[];
}

export interface PuzzleAttemptResponse {
  correct: boolean;
  solution: string[];
  ratingBefore: number;
  ratingAfter: number;
  ratingDelta: number;
}

export interface PuzzleAttemptSummary {
  puzzleId: string;
  puzzleRating: number;
  solved: boolean;
  ratingAfter: number;
  attemptedAt: number;
}

export interface PuzzleStatsResponse {
  rating: number;
  ratingDeviation: number;
  totalAttempts: number;
  totalSolved: number;
  solveRate: number;
  recentAttempts: PuzzleAttemptSummary[];
}

// ---------------------------------------------------------------------------
// Opening Explorer Types (M17)
// ---------------------------------------------------------------------------

export type { OpeningInfo } from "./openings.js";
export { normalizeFen, loadOpenings, classifyPosition, classifyGame } from "./openings.js";

export type RatingBracket =
  | "0-1000"
  | "1000-1200"
  | "1200-1400"
  | "1400-1600"
  | "1600-1800"
  | "1800-2000"
  | "2000-2200"
  | "2200+";

export type SpeedCategory = "bullet" | "blitz" | "rapid" | "classical";

export interface PositionMoveStats {
  white: number;
  draws: number;
  black: number;
  totalGames: number;
  avgRating: number;
}

export interface ExplorerMove {
  san: string;
  uci: string;
  white: number;
  draws: number;
  black: number;
  totalGames: number;
  avgRating: number;
  opening: OpeningInfo | null;
}

export interface ExplorerTopGame {
  id: number;
  white: string;
  black: string;
  whiteRating: number;
  blackRating: number;
  result: string;
  year: number;
}

export interface ExplorerResponse {
  opening: OpeningInfo | null;
  white: number;
  draws: number;
  black: number;
  moves: ExplorerMove[];
  topGames: ExplorerTopGame[];
}

export interface ExplorerFilter {
  ratings?: RatingBracket[];
  speeds?: SpeedCategory[];
  since?: string;
  until?: string;
}

export function getRatingBracket(avgRating: number): RatingBracket {
  if (avgRating < 1000) return "0-1000";
  if (avgRating < 1200) return "1000-1200";
  if (avgRating < 1400) return "1200-1400";
  if (avgRating < 1600) return "1400-1600";
  if (avgRating < 1800) return "1600-1800";
  if (avgRating < 2000) return "1800-2000";
  if (avgRating < 2200) return "2000-2200";
  return "2200+";
}

export function getSpeedCategory(clockSeconds: number): SpeedCategory {
  if (clockSeconds <= 120) return "bullet";
  if (clockSeconds <= 600) return "blitz";
  if (clockSeconds <= 1800) return "rapid";
  return "classical";
}

export interface ExplorerEngineResponse {
  score: EvalScore;
  lines: EngineLineInfo[];
  depth: number;
}

export interface ExplorerPlayerResponse extends ExplorerResponse {
  partial: boolean;
}

export interface PersonalExplorerQuery {
  fen: string;
  color: "white" | "black";
  speeds?: string;
  since?: string;
  until?: string;
}

// ---------------------------------------------------------------------------
// Repertoire Types (M18)
// ---------------------------------------------------------------------------

export interface Repertoire {
  id: number;
  userId: number;
  name: string;
  color: "white" | "black";
  description: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface RepertoireListItem {
  id: number;
  name: string;
  color: "white" | "black";
  description: string | null;
  moveCount: number;
  updatedAt: number;
}

export interface RepertoireNode {
  id: number | null;
  fen: string;
  san: string | null;
  uci: string | null;
  isMainLine: boolean;
  comment: string | null;
  opening: OpeningInfo | null;
  children: RepertoireNode[];
}

export interface RepertoireTree {
  id: number;
  name: string;
  color: "white" | "black";
  description: string | null;
  tree: RepertoireNode;
}

export interface CreateRepertoireRequest {
  name: string;
  color: "white" | "black";
  description?: string;
}

export interface UpdateRepertoireRequest {
  name?: string;
  description?: string;
}

export interface CreateRepertoireResponse {
  id: number;
  name: string;
  color: "white" | "black";
  description: string | null;
  createdAt: number;
}

export interface AddRepertoireMoveResponse {
  id: number;
  positionFen: string;
  moveSan: string;
  moveUci: string;
  resultFen: string;
  isMainLine: boolean;
  comment: string | null;
}

export interface DeleteRepertoireMoveResponse {
  deleted: number;
}

export interface RepertoireImportResponse {
  imported: number;
}

export interface RepertoireExportResponse {
  pgn: string;
}
