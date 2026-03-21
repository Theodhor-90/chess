import { Chess } from "chess.js";
import { normalizeFen } from "@chess/shared";
import type { RepertoireNode } from "@chess/shared";

export interface ParsedMove {
  positionFen: string;
  moveSan: string;
  moveUci: string;
  resultFen: string;
  isMainLine: boolean;
  comment: string | null;
}

function tokenize(moveText: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  const len = moveText.length;

  while (i < len) {
    // Skip whitespace
    if (
      moveText[i] === " " ||
      moveText[i] === "\t" ||
      moveText[i] === "\n" ||
      moveText[i] === "\r"
    ) {
      i++;
      continue;
    }

    // Comment
    if (moveText[i] === "{") {
      const end = moveText.indexOf("}", i);
      if (end === -1) {
        // Unclosed comment — take rest of string
        tokens.push(moveText.slice(i));
        break;
      }
      tokens.push(moveText.slice(i, end + 1)); // includes { and }
      i = end + 1;
      continue;
    }

    // Variation open/close
    if (moveText[i] === "(" || moveText[i] === ")") {
      tokens.push(moveText[i]);
      i++;
      continue;
    }

    // Read a word (non-whitespace, non-special)
    let j = i;
    while (
      j < len &&
      moveText[j] !== " " &&
      moveText[j] !== "\t" &&
      moveText[j] !== "\n" &&
      moveText[j] !== "\r" &&
      moveText[j] !== "{" &&
      moveText[j] !== "(" &&
      moveText[j] !== ")"
    ) {
      j++;
    }
    if (j > i) {
      tokens.push(moveText.slice(i, j));
      i = j;
    }
  }

  return tokens;
}

export function parsePgnToMoves(pgn: string): ParsedMove[] {
  // Strip headers
  const lines = pgn.split("\n");
  const moveTextLines: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) continue;
    if (trimmed === "") continue;
    moveTextLines.push(trimmed);
  }
  const moveText = moveTextLines.join(" ");

  // Tokenize
  const tokens = tokenize(moveText);

  const result: ParsedMove[] = [];
  const seen = new Set<string>(); // "positionFen|moveSan" for dedup

  function addMove(move: ParsedMove): void {
    const key = `${move.positionFen}|${move.moveSan}`;
    if (seen.has(key)) return;
    seen.add(key);
    result.push(move);
  }

  function parseTokens(tokens: string[], chess: Chess, isMainLine: boolean): void {
    let i = 0;
    let lastMove: ParsedMove | null = null;
    // Track the FEN before the last SAN move was played, so variations
    // can fork from the correct position without relying on undo().
    let lastPreMoveFen: string = chess.fen();

    while (i < tokens.length) {
      const token = tokens[i];

      // Comment — attach to the most recently parsed move (standard PGN: comments annotate the preceding move)
      if (token.startsWith("{")) {
        const commentText = token.slice(1, -1).trim() || null;
        if (lastMove && commentText) {
          lastMove.comment = commentText;
        }
        i++;
        continue;
      }

      // NAG — skip
      if (token.startsWith("$")) {
        i++;
        continue;
      }

      // Move number — skip (e.g., "1.", "1...", "12.")
      if (/^\d+\./.test(token)) {
        i++;
        continue;
      }

      // Game result — skip
      if (token === "1-0" || token === "0-1" || token === "1/2-1/2" || token === "*") {
        i++;
        continue;
      }

      // Variation start
      if (token === "(") {
        // Find matching close paren
        let depth = 1;
        let j = i + 1;
        while (j < tokens.length && depth > 0) {
          if (tokens[j] === "(") depth++;
          if (tokens[j] === ")") depth--;
          j++;
        }
        // tokens[i+1 .. j-2] are the variation tokens (excluding outer parens)
        const varTokens = tokens.slice(i + 1, j - 1);

        // Fork from the position BEFORE the last move was played.
        // A variation is an alternative to the preceding move.
        const varChess = new Chess(lastPreMoveFen);

        parseTokens(varTokens, varChess, false);

        i = j; // skip past closing paren
        continue;
      }

      // Variation end — shouldn't happen since we extract inner tokens
      if (token === ")") {
        i++;
        continue;
      }

      // It's a SAN move — save the pre-move FEN before playing
      lastPreMoveFen = chess.fen();
      const positionFen = normalizeFen(chess.fen());
      let moveResult;
      try {
        moveResult = chess.move(token);
      } catch {
        // Invalid move — skip
        i++;
        continue;
      }

      const moveUci = moveResult.from + moveResult.to + (moveResult.promotion ?? "");
      const resultFen = normalizeFen(chess.fen());

      const parsedMove: ParsedMove = {
        positionFen,
        moveSan: moveResult.san,
        moveUci,
        resultFen,
        isMainLine,
        comment: null,
      };

      addMove(parsedMove);
      lastMove = parsedMove;
      i++;
    }
  }

  const chess = new Chess();
  parseTokens(tokens, chess, true);

  return result;
}

export function treeToMoves(tree: RepertoireNode): string {
  const parts: string[] = [];

  function isWhiteTurn(fen: string): boolean {
    const fenParts = fen.split(" ");
    return fenParts.length >= 2 ? fenParts[1] === "w" : true;
  }

  function serializeNode(node: RepertoireNode, moveNum: number, needsMoveNumber: boolean): void {
    if (node.children.length === 0) return;

    // Determine the parent position's side to move from the node's fen
    const whiteTurn = isWhiteTurn(node.fen);

    // Main line child is first
    const mainChild = node.children[0];
    const sidelines = node.children.slice(1);

    // Emit main line move
    if (whiteTurn) {
      parts.push(`${moveNum}.`);
      parts.push(mainChild.san!);
    } else {
      if (needsMoveNumber) {
        parts.push(`${moveNum}...`);
      }
      parts.push(mainChild.san!);
    }

    // Emit comment for main line move
    if (mainChild.comment) {
      parts.push(`{${mainChild.comment}}`);
    }

    // Emit sidelines
    for (const sideline of sidelines) {
      parts.push("(");

      // Sideline starts with the same move number context
      if (whiteTurn) {
        parts.push(`${moveNum}.`);
      } else {
        parts.push(`${moveNum}...`);
      }
      parts.push(sideline.san!);

      if (sideline.comment) {
        parts.push(`{${sideline.comment}}`);
      }

      // Continue the sideline recursively
      const nextMoveNum = whiteTurn ? moveNum : moveNum + 1;
      serializeNode(sideline, nextMoveNum, !whiteTurn);

      parts.push(")");
    }

    // Continue main line
    const nextMoveNum = whiteTurn ? moveNum : moveNum + 1;
    // After any sideline interruption OR a comment on the main child,
    // the continuation always needs a move number indicator for clarity.
    const needsNum = sidelines.length > 0 || mainChild.comment != null;
    serializeNode(mainChild, nextMoveNum, needsNum);
  }

  serializeNode(tree, 1, true);

  return parts.join(" ");
}
