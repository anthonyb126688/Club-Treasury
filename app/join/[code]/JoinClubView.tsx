"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { normalizeJoinCode } from "@/lib/orgs/join-code";
import { OnboardingGate } from "../../_components/onboarding/OnboardingGate";
import { card, errorText, mutedText, primaryButton } from "../../_components/onboarding/styles";
import { useAuthFetch } from "../../_components/useAuthFetch";

type Lookup = {
  code: string;
  name: string;
  school: string;
  status: "active" | "pending" | "declined" | "removed" | null;
  orgId?: string;
};

export function JoinClubView() {
  const { code: raw } = useParams<{ code: string }>();
  const code = normalizeJoinCode(decodeURIComponent(raw ?? ""));
  return (
    <OnboardingGate loginHint="Log in to join your club.">
      {() => (code ? <ConfirmClub code={code} /> : <NotFound code={decodeURIComponent(raw ?? "")} />)}
    </OnboardingGate>
  );
}

function NotFound({ code }: { code: string }) {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">We couldn&apos;t find that club</h1>
      <p className={mutedText}>
        No club uses the code &ldquo;{code}&rdquo;. Check it with your treasurer and try again.
      </p>
      <Link href="/join" className={primaryButton}>
        Enter a code
      </Link>
    </div>
  );
}

function ConfirmClub({ code }: { code: string }) {
  const router = useRouter();
  const authFetch = useAuthFetch();
  const [club, setClub] = useState<Lookup | null>(null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authFetch(`/api/join/${encodeURIComponent(code)}`);
        if (cancelled) return;
        if (res.status === 404) return setMissing(true);
        if (!res.ok) return setError("We couldn't look up that club. Refresh to try again.");
        const body = (await res.json()) as Lookup;
        if (body.status === "pending" && body.orgId) return router.replace(`/waiting/${body.orgId}`);
        setClub(body);
      } catch {
        if (!cancelled) setError("We couldn't look up that club. Check your connection and refresh.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, authFetch, router]);

  async function requestToJoin() {
    setBusy(true);
    setError(null);
    try {
      const res = await authFetch(`/api/join/${encodeURIComponent(code)}`, { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { status?: string; orgId?: string };
      if (!res.ok || !body.orgId) {
        setError("We couldn't send your request. Try again.");
        return;
      }
      router.replace(body.status === "active" ? `/c/${body.orgId}` : `/waiting/${body.orgId}`);
    } catch {
      setError("We couldn't send your request. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (missing) return <NotFound code={code} />;
  if (!club) {
    return error ? (
      <p role="alert" className={errorText}>
        {error}
      </p>
    ) : (
      <p className={mutedText}>Finding your club…</p>
    );
  }

  if (club.status === "active" && club.orgId) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">You&apos;re already in {club.name}</h1>
        <Link href={`/c/${club.orgId}`} className={primaryButton}>
          Open {club.name}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-semibold tracking-tight">Is this your club?</h1>
      {/* Club-provided text: plain text only. */}
      <div className={card}>
        <p className="text-lg font-semibold break-words">{club.name}</p>
        <p className={`break-words ${mutedText}`}>{club.school}</p>
      </div>
      {(club.status === "declined" || club.status === "removed") && (
        <p className={`text-sm ${mutedText}`}>
          You&apos;re not in this club right now. You can ask the treasurer to let you in again.
        </p>
      )}
      <button type="button" onClick={requestToJoin} disabled={busy} className={primaryButton}>
        {busy ? "Sending request…" : "Request to join"}
      </button>
      {error && (
        <p role="alert" className={errorText}>
          {error}
        </p>
      )}
      <Link href="/join" className={`text-center text-sm underline ${mutedText}`}>
        Not my club, enter a different code
      </Link>
    </div>
  );
}
