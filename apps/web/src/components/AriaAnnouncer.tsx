import { useState, useRef, useEffect } from "react";
import styles from "./AriaAnnouncer.module.css";

interface AriaAnnouncerProps {
  message: string;
}

function AriaAnnouncer({ message }: AriaAnnouncerProps) {
  const [displayMessage, setDisplayMessage] = useState("");
  const toggleRef = useRef(false);

  useEffect(() => {
    if (!message) {
      setDisplayMessage("");
      return;
    }
    toggleRef.current = !toggleRef.current;
    setDisplayMessage(message + (toggleRef.current ? "\u200B" : ""));
  }, [message]);

  return (
    <div
      data-testid="aria-announcer"
      className={styles.visuallyHidden}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {displayMessage}
    </div>
  );
}

export { AriaAnnouncer };
export type { AriaAnnouncerProps };
