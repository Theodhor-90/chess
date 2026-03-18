import { useRef, useCallback, useEffect } from "react";

interface SwipeCallbacks {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
}

const SWIPE_THRESHOLD = 30;

export function useSwipeGesture(
  ref: React.RefObject<HTMLElement | null>,
  callbacks: SwipeCallbacks,
): void {
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  const swiped = useRef(false);

  const { onSwipeLeft, onSwipeRight } = callbacks;

  const handlePointerDown = useCallback((e: PointerEvent) => {
    // Only track primary pointer (left mouse / first finger)
    if (!e.isPrimary) return;
    startX.current = e.clientX;
    startY.current = e.clientY;
    swiped.current = false;
  }, []);

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      if (!e.isPrimary || startX.current === null || startY.current === null || swiped.current)
        return;

      const dx = e.clientX - startX.current;
      const dy = e.clientY - startY.current;

      // Check if vertical deviation exceeds threshold — cancel swipe tracking
      if (Math.abs(dy) >= SWIPE_THRESHOLD) {
        startX.current = null;
        startY.current = null;
        return;
      }

      // Check if horizontal distance exceeds threshold
      if (Math.abs(dx) >= SWIPE_THRESHOLD) {
        swiped.current = true;
        if (dx > 0) {
          onSwipeRight?.();
        } else {
          onSwipeLeft?.();
        }
      }
    },
    [onSwipeLeft, onSwipeRight],
  );

  const handlePointerUp = useCallback(() => {
    startX.current = null;
    startY.current = null;
    swiped.current = false;
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    el.addEventListener("pointerdown", handlePointerDown);
    el.addEventListener("pointermove", handlePointerMove);
    el.addEventListener("pointerup", handlePointerUp);
    el.addEventListener("pointercancel", handlePointerUp);

    return () => {
      el.removeEventListener("pointerdown", handlePointerDown);
      el.removeEventListener("pointermove", handlePointerMove);
      el.removeEventListener("pointerup", handlePointerUp);
      el.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [ref, handlePointerDown, handlePointerMove, handlePointerUp]);
}
