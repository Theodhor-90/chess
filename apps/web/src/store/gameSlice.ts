import { createSlice } from "@reduxjs/toolkit";
import type { GameState, ClockState, PlayerColor } from "@chess/shared";

export interface GameSliceState {
  currentGame: GameState | null;
  clockState: ClockState | null;
  connectionStatus: "disconnected" | "connecting" | "connected";
  drawOffer: PlayerColor | null;
  opponentConnected: boolean;
}

const initialState: GameSliceState = {
  currentGame: null,
  clockState: null,
  connectionStatus: "disconnected",
  drawOffer: null,
  opponentConnected: true,
};

const gameSlice = createSlice({
  name: "game",
  initialState,
  reducers: {},
});

export const gameReducer = gameSlice.reducer;
