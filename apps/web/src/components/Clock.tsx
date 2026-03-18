import { useEffect, useRef, useState } from "react";
import styles from "./Clock.module.css";
import { playSound } from "../services/sounds.js";

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
  const lowTimeSoundPlayed = useRef(false);

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

  // Play low-time sound once when active clock drops below 30s
  useEffect(() => {
    if (isActive && displayTime < 30000 && displayTime > 0 && !lowTimeSoundPlayed.current) {
      lowTimeSoundPlayed.current = true;
      playSound("lowTime");
    }
    // Reset the flag when the clock goes back above 30s (e.g., time added via increment)
    if (displayTime >= 30000) {
      lowTimeSoundPlayed.current = false;
    }
  }, [isActive, displayTime]);

  const isLowTime = displayTime < 30000;
  const formatted = formatTime(displayTime);
  const className = [
    styles.clock,
    isActive && styles.active,
    isLowTime && styles.lowTime,
    isActive && isLowTime && styles.urgentPulse,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div data-testid="clock" className={className}>
      {formatted}
    </div>
  );
}
