import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { GameState, ClockState, PlayerColor, GameStatus, MoveRequest } from "@chess/shared";

export interface GameSliceState {
  currentGame: GameState | null;
  connectionStatus: "disconnected" | "connecting" | "connected";
  pendingMove: MoveRequest | null;
  error: string | null;
  drawOffer: PlayerColor | null;
  opponentConnected: boolean;
}

const initialState: GameSliceState = {
  currentGame: null,
  connectionStatus: "disconnected",
  pendingMove: null,
  error: null,
  drawOffer: null,
  opponentConnected: true,
};

const gameSlice = createSlice({
  name: "game",
  initialState,
  reducers: {
    setGameState(state, action: PayloadAction<GameState & { clock: ClockState }>) {
      const payload = action.payload;
      state.currentGame = {
        ...payload,
        clockState: {
          white: payload.clock.white,
          black: payload.clock.black,
          activeColor: payload.clock.activeColor,
          lastUpdate: payload.clock.lastUpdate,
        },
      };
      state.drawOffer = payload.drawOffer;
    },
    applyMove(
      state,
      action: PayloadAction<{
        fen: string;
        san: string;
        pgn: string;
        status: GameStatus;
        result?: GameState["result"];
        clock: ClockState;
      }>,
    ) {
      if (!state.currentGame) return;
      const { fen, san, pgn, status, result, clock } = action.payload;
      state.currentGame.fen = fen;
      state.currentGame.pgn = pgn;
      state.currentGame.moves = [...state.currentGame.moves, san];
      state.currentGame.status = status;
      state.currentGame.currentTurn = state.currentGame.currentTurn === "white" ? "black" : "white";
      state.currentGame.clockState = clock;
      if (result) {
        state.currentGame.result = result;
      }
    },
    setOptimisticMove(state, action: PayloadAction<MoveRequest>) {
      state.pendingMove = action.payload;
    },
    clearOptimisticMove(state) {
      state.pendingMove = null;
    },
    rollbackMove(state, action: PayloadAction<string | undefined>) {
      if (state.currentGame && action.payload) {
        state.currentGame.fen = action.payload;
      }
      state.pendingMove = null;
    },
    setGameOver(
      state,
      action: PayloadAction<{
        status: GameStatus;
        result: NonNullable<GameState["result"]>;
        clock: ClockState;
      }>,
    ) {
      if (!state.currentGame) return;
      const { status, result, clock } = action.payload;
      state.currentGame.status = status;
      state.currentGame.result = result;
      state.currentGame.clockState = clock;
    },
    setDrawOffer(state, action: PayloadAction<PlayerColor>) {
      state.drawOffer = action.payload;
    },
    clearDrawOffer(state) {
      state.drawOffer = null;
    },
    setOpponentConnected(state, action: PayloadAction<boolean>) {
      state.opponentConnected = action.payload;
    },
    setConnectionStatus(state, action: PayloadAction<"disconnected" | "connecting" | "connected">) {
      state.connectionStatus = action.payload;
    },
    setError(state, action: PayloadAction<string>) {
      state.error = action.payload;
    },
    clearError(state) {
      state.error = null;
    },
    updateClock(state, action: PayloadAction<ClockState>) {
      if (!state.currentGame) return;
      state.currentGame.clockState = action.payload;
    },
    clearGame(state) {
      state.currentGame = null;
      state.pendingMove = null;
      state.error = null;
      state.drawOffer = null;
      state.opponentConnected = true;
    },
  },
});

export const {
  setGameState,
  applyMove,
  setOptimisticMove,
  clearOptimisticMove,
  rollbackMove,
  setGameOver,
  setDrawOffer,
  clearDrawOffer,
  setOpponentConnected,
  setConnectionStatus,
  setError,
  clearError,
  updateClock,
  clearGame,
} = gameSlice.actions;

export const gameReducer = gameSlice.reducer;
