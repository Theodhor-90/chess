import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { Toast } from "./Toast.js";
import type { ToastType } from "./Toast.js";
import styles from "./Toast.module.css";

const EXIT_DURATION = 300;

interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
  duration: number;
}

interface ToastContextValue {
  showToast: (message: string, type: ToastType, duration?: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [exitingIds, setExitingIds] = useState<Set<string>>(new Set());
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const removeToast = useCallback((id: string) => {
    setExitingIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const dismissToast = useCallback(
    (id: string) => {
      const timer = timersRef.current.get(id);
      if (timer) {
        clearTimeout(timer);
        timersRef.current.delete(id);
      }
      // Start exit animation
      setExitingIds((prev) => new Set(prev).add(id));
      // Remove from DOM after animation completes
      const exitTimer = setTimeout(() => {
        removeToast(id);
      }, EXIT_DURATION);
      timersRef.current.set(`exit-${id}`, exitTimer);
    },
    [removeToast],
  );

  const showToast = useCallback(
    (message: string, type: ToastType, duration = 4000) => {
      const id = crypto.randomUUID();
      const toast: ToastItem = { id, message, type, duration };
      setToasts((prev) => [...prev, toast]);

      const timer = setTimeout(() => {
        timersRef.current.delete(id);
        dismissToast(id);
      }, duration);
      timersRef.current.set(id, timer);
    },
    [dismissToast],
  );

  // Cleanup all timers on unmount
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
      timers.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {createPortal(
        <div className={styles.container}>
          {toasts.map((toast) => (
            <Toast
              key={toast.id}
              id={toast.id}
              message={toast.message}
              type={toast.type}
              isExiting={exitingIds.has(toast.id)}
              onDismiss={dismissToast}
            />
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (context === null) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}

export { ToastProvider, useToast };
