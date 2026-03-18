import { Button } from "./ui/Button.js";
import { useToast } from "./ui/ToastProvider.js";
import styles from "./InviteLink.module.css";

interface InviteLinkProps {
  inviteToken: string;
}

export function InviteLink({ inviteToken }: InviteLinkProps) {
  const { showToast } = useToast();
  const url = `${window.location.origin}/join/${inviteToken}`;

  async function handleCopy() {
    await navigator.clipboard.writeText(url);
    showToast("Link copied to clipboard!", "success", 3000);
  }

  return (
    <div data-testid="invite-link" className={styles.container}>
      <input
        type="text"
        readOnly
        value={url}
        data-testid="invite-url"
        className={styles.urlInput}
      />
      <Button variant="secondary" size="sm" onClick={handleCopy} data-testid="copy-link-button">
        Copy Link
      </Button>
    </div>
  );
}
