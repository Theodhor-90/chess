import { useEffect, useRef, useState } from "react";

function formatTime(ms: number): string {
  if (ms < 10000) {
    const totalSeconds = Math.max(Math.floor(ms / 1000), 0);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    // Show tenths: M:SS.t
    const tenths = Math.max(Math.floor((ms % 1000) / 100), 0);
    return `${minutes}:${seconds.toString().padStart(2, "0")}.${tenths}`;
  }

  // Show MM:SS
  const totalSeconds = Math.max(Math.ceil(ms / 1000), 0);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function Clock({
  timeMs,
  isActive,
  lastUpdate,
}: {
  timeMs: number;
  isActive: boolean;
  lastUpdate: number;
}) {
  const [displayTime, setDisplayTime] = useState(timeMs);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!isActive) {
      setDisplayTime(timeMs);
      return;
    }

    function tick() {
      const elapsed = Date.now() - lastUpdate;
      const remaining = Math.max(timeMs - elapsed, 0);
      setDisplayTime(remaining);
      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
    };
  }, [timeMs, isActive, lastUpdate]);

  const isLowTime = displayTime < 30000;
  const formatted = formatTime(displayTime);

  return (
    <div
      data-testid="clock"
      style={{
        padding: "8px 16px",
        fontSize: "24px",
        fontFamily: "monospace",
        fontWeight: isActive ? "bold" : "normal",
        backgroundColor: isActive ? "#e8e8e8" : "transparent",
        color: isLowTime ? "#c00" : "#000",
        borderRadius: "4px",
        minWidth: "100px",
        textAlign: "center",
      }}
    >
      {formatted}
    </div>
  );
}
