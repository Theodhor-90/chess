import { useState, useCallback } from "react";
import { Chess } from "chess.js";
import { useImportRepertoirePgnMutation } from "../store/apiSlice.js";
import { Modal } from "./ui/Modal.js";
import { Button } from "./ui/Button.js";
import { useToast } from "./ui/ToastProvider.js";
import styles from "./RepertoirePgnImport.module.css";

interface RepertoirePgnImportProps {
  repertoireId: number;
  isOpen: boolean;
  onClose: () => void;
}

export function RepertoirePgnImport({ repertoireId, isOpen, onClose }: RepertoirePgnImportProps) {
  const [pgn, setPgn] = useState("");
  const [preview, setPreview] = useState<{ moveCount: number } | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [importPgn, { isLoading: isImporting }] = useImportRepertoirePgnMutation();
  const { showToast } = useToast();

  const handlePreview = useCallback(() => {
    setParseError(null);
    setPreview(null);
    setSuccessMessage(null);

    const trimmed = pgn.trim();
    if (!trimmed) {
      setParseError("Please paste PGN text first.");
      return;
    }

    try {
      const chess = new Chess();
      chess.loadPgn(trimmed);
      const history = chess.history();
      if (history.length === 0) {
        setParseError("No moves found in the PGN.");
        return;
      }
      setPreview({ moveCount: history.length });
    } catch {
      setParseError("Invalid PGN format. Please check and try again.");
    }
  }, [pgn]);

  const handleReset = useCallback(() => {
    setPgn("");
    setPreview(null);
    setParseError(null);
    setSuccessMessage(null);
  }, []);

  const handleImport = useCallback(async () => {
    setParseError(null);
    setSuccessMessage(null);

    const trimmed = pgn.trim();
    if (!trimmed) {
      setParseError("Please paste PGN text first.");
      return;
    }

    try {
      const result = await importPgn({ repertoireId, pgn: trimmed }).unwrap();
      setSuccessMessage(`Successfully imported ${result.imported} move(s).`);
      showToast(`Imported ${result.imported} move(s)`, "success");
      setTimeout(() => {
        handleReset();
        onClose();
      }, 1500);
    } catch {
      setParseError("Failed to import PGN. The server could not process the input.");
      showToast("Failed to import PGN", "error");
    }
  }, [pgn, repertoireId, importPgn, showToast, onClose, handleReset]);

  const handleClose = useCallback(() => {
    handleReset();
    onClose();
  }, [handleReset, onClose]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Import PGN"
      footer={
        <div className={styles.footer}>
          <Button variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button variant="secondary" onClick={handlePreview} disabled={!pgn.trim()}>
            Preview
          </Button>
          <Button
            onClick={handleImport}
            loading={isImporting}
            disabled={!pgn.trim() || isImporting}
          >
            Import
          </Button>
        </div>
      }
    >
      <div className={styles.form}>
        <textarea
          className={`${styles.textarea}${parseError ? ` ${styles.textareaError}` : ""}`}
          value={pgn}
          onChange={(e) => {
            setPgn(e.target.value);
            setPreview(null);
            setParseError(null);
            setSuccessMessage(null);
          }}
          placeholder="Paste PGN text here..."
          aria-label="PGN input"
        />
        {parseError && <p className={styles.error}>{parseError}</p>}
        {successMessage && <p className={styles.success}>{successMessage}</p>}
        {preview && (
          <div className={styles.preview}>
            <div className={styles.previewLabel}>Preview</div>
            <span>Found {preview.moveCount} move(s) in the PGN.</span>
          </div>
        )}
      </div>
    </Modal>
  );
}
