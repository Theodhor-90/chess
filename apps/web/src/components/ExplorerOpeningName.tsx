import type { OpeningInfo } from "@chess/shared";
import { Badge } from "./ui/Badge.js";
import styles from "./ExplorerOpeningName.module.css";

interface ExplorerOpeningNameProps {
  opening: OpeningInfo | null;
}

function ExplorerOpeningName({ opening }: ExplorerOpeningNameProps) {
  if (!opening) {
    return (
      <div className={styles.container}>
        <span className={styles.unknown}>Unknown position</span>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <Badge variant="info" size="sm">
        {opening.eco}
      </Badge>
      <span className={styles.name}>{opening.name}</span>
    </div>
  );
}

export { ExplorerOpeningName };
export type { ExplorerOpeningNameProps };
