"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useAuthFetch } from "./useAuthFetch";

// The club currently open (/c/[orgId]/...) and the person's role in it, plus
// all their clubs (for the header switcher). Pages read it with useOrg().

export type ClubSummary = {
  id: string;
  name: string;
  school: string;
  role: "member" | "treasurer";
  status: "active" | "pending";
  joinCode?: string; // only for clubs where you're an active treasurer
};

export type Me = {
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  lastOrgId: string | null;
  clubs: ClubSummary[];
};

type OrgState = {
  orgId: string;
  club: ClubSummary | null; // null if not an active member of this club
  me: Me | null;
  loading: boolean;
  isTreasurer: boolean;
  refresh: () => Promise<void>;
};

const OrgContext = createContext<OrgState | null>(null);

export function OrgProvider({ orgId, children }: { orgId: string; children: ReactNode }) {
  const authFetch = useAuthFetch();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await authFetch("/api/me");
      if (res.ok) setMe((await res.json()) as Me);
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const club = me?.clubs.find((c) => c.id === orgId && c.status === "active") ?? null;
  return (
    <OrgContext.Provider
      value={{ orgId, club, me, loading, isTreasurer: club?.role === "treasurer", refresh }}
    >
      {children}
    </OrgContext.Provider>
  );
}

export function useOrg(): OrgState {
  const state = useContext(OrgContext);
  if (!state) throw new Error("useOrg must be used inside <OrgProvider>");
  return state;
}
