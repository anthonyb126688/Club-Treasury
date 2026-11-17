"use client";

import { toDataURL } from "qrcode";
import { useEffect, useState } from "react";
import { inviteUrl } from "@/lib/orgs/onboarding";
import { card, mutedText, secondaryButton } from "./styles";

/** The club's join code, invite link (with Copy), and a QR code of the link. */
export function InviteCard({ joinCode }: { joinCode: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const link = inviteUrl(window.location.origin, joinCode);
    toDataURL(link, { margin: 1, width: 240 })
      .then((image) => {
        setUrl(link);
        setQr(image);
      })
      .catch(() => setUrl(link)); // no QR code; the code and link still work
  }, [joinCode]);

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className={`${card} flex flex-col items-center gap-3 text-center`}>
      <p className={`text-sm ${mutedText}`}>Join code</p>
      <p className="font-mono text-3xl font-semibold tracking-widest">{joinCode}</p>
      {qr && (
        // eslint-disable-next-line @next/next/no-img-element -- generated data URL
        <img src={qr} alt={`QR code to join with ${joinCode}`} width={200} height={200} className="rounded-lg bg-white p-2" />
      )}
      {url && <p className={`break-all text-sm ${mutedText}`}>{url}</p>}
      <button type="button" onClick={copy} disabled={!url} className={secondaryButton}>
        {copied ? "Copied!" : "Copy invite link"}
      </button>
    </div>
  );
}
