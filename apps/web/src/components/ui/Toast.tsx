import styles from "./Toast.module.css";

type ToastType = "success" | "error" | "warning" | "info";

interface ToastProps {
  id: string;
  message: string;
  type: ToastType;
  onDismiss: (id: string) => void;
}

function Toast({ id, message, type, onDismiss }: ToastProps) {
  const classNames = [styles.toast, styles[type]].filter(Boolean).join(" ");

  return (
    <div className={classNames} role="alert">
      <span className={styles.message}>{message}</span>
      <button
        type="button"
        className={styles.closeButton}
        onClick={() => onDismiss(id)}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}

export { Toast };
export type { ToastProps, ToastType };
