import { useEffect, useRef, useCallback, useMemo, useState } from "react";
import { Chessground } from "chessground";
import { Chess } from "chess.js";
import type { Api } from "chessground/api";
import type { Key } from "chessground/types";
import "chessground/assets/chessground.base.css";
import "chessground/assets/chessground.brown.css";
import "chessground/assets/chessground.cburnett.css";
import styles from "./GameBoard.module.css";
import { useAppSelector, useAppDispatch } from "../store/index.js";
import { socketActions } from "../store/socketMiddleware.js";
import { PromotionModal } from "./PromotionModal.js";
import type { PromotionPiece } from "./PromotionModal.js";
import type { PlayerColor } from "@chess/shared";

function toDests(fen: string): Map<Key, Key[]> {
  const chess = new Chess(fen);
  const dests = new Map<Key, Key[]>();
  for (const move of chess.moves({ verbose: true })) {
    const from = move.from as Key;
    const existing = dests.get(from);
    if (existing) {
      existing.push(move.to as Key);
    } else {
      dests.set(from, [move.to as Key]);
    }
  }
  return dests;
}

function toColor(turn: PlayerColor): "white" | "black" {
  return turn;
}

export function GameBoard({
  gameId,
  playerColor,
}: {
  gameId: number;
  playerColor: PlayerColor | null;
}) {
  const dispatch = useAppDispatch();
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<Api | null>(null);

  const game = useAppSelector((state) => state.game.currentGame);
  const fen = game?.fen ?? "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  const currentTurn = game?.currentTurn ?? "white";
  const status = game?.status ?? "waiting";
  const isGameActive = status === "active";
  const isMyTurn = playerColor !== null && currentTurn === playerColor;

  const [pendingPromotion, setPendingPromotion] = useState<{
    orig: Key;
    dest: Key;
  } | null>(null);

  const dests = useMemo(() => {
    if (!isGameActive || !isMyTurn) return new Map<Key, Key[]>();
    return toDests(fen);
  }, [fen, isGameActive, isMyTurn]);

  const onMove = useCallback(
    (orig: Key, dest: Key) => {
      const chess = new Chess(fen);
      const piece = chess.get(orig as Parameters<typeof chess.get>[0]);
      const isPromotion = piece?.type === "p" && (dest[1] === "8" || dest[1] === "1");

      if (isPromotion) {
        setPendingPromotion({ orig, dest });
        return;
      }

      dispatch(
        socketActions.sendMove({
          gameId,
          from: orig,
          to: dest,
        }),
      );
    },
    [dispatch, gameId, fen],
  );

  function handlePromotionSelect(piece: PromotionPiece) {
    if (!pendingPromotion) return;
    dispatch(
      socketActions.sendMove({
        gameId,
        from: pendingPromotion.orig,
        to: pendingPromotion.dest,
        promotion: piece,
      }),
    );
    setPendingPromotion(null);
  }

  function handlePromotionCancel() {
    setPendingPromotion(null);
    // Reset the board position to undo the Chessground move animation
    if (apiRef.current) {
      apiRef.current.set({
        fen,
        turnColor: toColor(currentTurn),
        movable: {
          free: false,
          color: playerColor ?? undefined,
          dests,
          showDests: true,
          events: {
            after: onMove,
          },
        },
      });
    }
  }

  // Initialize Chessground once on mount
  useEffect(() => {
    if (!containerRef.current) return;
    apiRef.current = Chessground(containerRef.current, {
      fen,
      orientation: playerColor ?? "white",
      turnColor: toColor(currentTurn),
      viewOnly: !isGameActive || !playerColor,
      movable: {
        free: false,
        color: playerColor ?? undefined,
        dests,
        showDests: true,
        events: {
          after: onMove,
        },
      },
      animation: { enabled: true, duration: 200 },
    });
    return () => {
      apiRef.current?.destroy();
      apiRef.current = null;
    };
    // Only run on mount/unmount — updates happen via api.set() below
  }, []);

  // Update Chessground when state changes
  useEffect(() => {
    if (!apiRef.current) return;
    apiRef.current.set({
      fen,
      orientation: playerColor ?? "white",
      turnColor: toColor(currentTurn),
      viewOnly: !isGameActive || !playerColor,
      movable: {
        free: false,
        color: playerColor ?? undefined,
        dests,
        showDests: true,
        events: {
          after: onMove,
        },
      },
    });
  }, [fen, currentTurn, isGameActive, playerColor, dests, onMove]);

  // Redraw Chessground when container resizes
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver(() => {
      apiRef.current?.redrawAll();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <div ref={containerRef} data-testid="game-board" className={styles.boardContainer} />
      {pendingPromotion && (
        <PromotionModal
          color={playerColor ?? "white"}
          onSelect={handlePromotionSelect}
          onCancel={handlePromotionCancel}
        />
      )}
    </>
  );
}
