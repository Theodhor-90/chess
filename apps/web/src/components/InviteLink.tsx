import { useState } from "react";

interface InviteLinkProps {
  inviteToken: string;
}

export function InviteLink({ inviteToken }: InviteLinkProps) {
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}/join/${inviteToken}`;

  async function handleCopy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div data-testid="invite-link" style={{ display: "flex", gap: "8px", alignItems: "center" }}>
      <input
        type="text"
        readOnly
        value={url}
        data-testid="invite-url"
        style={{ flex: 1, padding: "8px", fontFamily: "monospace" }}
      />
      <button data-testid="copy-link-button" onClick={handleCopy}>
        {copied ? "Copied!" : "Copy Link"}
      </button>
    </div>
  );
}
