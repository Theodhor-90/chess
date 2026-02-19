export type GameErrorCode =
  | "GAME_NOT_FOUND"
  | "INVALID_STATUS"
  | "NOT_YOUR_TURN"
  | "NOT_A_PLAYER"
  | "ILLEGAL_MOVE"
  | "INVALID_INVITE_TOKEN"
  | "CANNOT_JOIN_OWN_GAME";

export class GameError extends Error {
  public readonly code: GameErrorCode;

  constructor(code: GameErrorCode, message: string) {
    super(message);
    this.name = "GameError";
    this.code = code;
  }
}
