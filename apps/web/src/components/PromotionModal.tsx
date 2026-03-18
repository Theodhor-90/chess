import styles from "./PromotionModal.module.css";

type PromotionPiece = "q" | "r" | "b" | "n";

interface PromotionModalProps {
  color: "white" | "black";
  onSelect: (piece: PromotionPiece) => void;
  onCancel: () => void;
}

const WHITE_PIECES: { piece: PromotionPiece; symbol: string; label: string }[] = [
  { piece: "q", symbol: "\u2655", label: "Queen" },
  { piece: "r", symbol: "\u2656", label: "Rook" },
  { piece: "b", symbol: "\u2657", label: "Bishop" },
  { piece: "n", symbol: "\u2658", label: "Knight" },
];

const BLACK_PIECES: { piece: PromotionPiece; symbol: string; label: string }[] = [
  { piece: "q", symbol: "\u265B", label: "Queen" },
  { piece: "r", symbol: "\u265C", label: "Rook" },
  { piece: "b", symbol: "\u265D", label: "Bishop" },
  { piece: "n", symbol: "\u265E", label: "Knight" },
];

export function PromotionModal({ color, onSelect, onCancel }: PromotionModalProps) {
  const pieces = color === "white" ? WHITE_PIECES : BLACK_PIECES;

  return (
    <div className={styles.overlay} data-testid="promotion-modal" onClick={onCancel}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <h4 className={styles.title}>Promote to:</h4>
        <div className={styles.pieces}>
          {pieces.map(({ piece, symbol, label }) => (
            <button
              key={piece}
              type="button"
              className={styles.pieceButton}
              data-testid={`promote-${piece}`}
              aria-label={`Promote to ${label}`}
              onClick={() => onSelect(piece)}
            >
              {symbol}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export type { PromotionPiece, PromotionModalProps };
