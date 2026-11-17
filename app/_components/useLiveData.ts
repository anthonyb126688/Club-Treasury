"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { hasError, initialLiveState, onFailure, onSuccess, type LiveState } from "@/lib/live/state";
import { useAuthFetch } from "./useAuthFetch";

// Live data without Supabase Realtime (our tables have RLS with no policies,
// so the browser can't subscribe). Instead:
//   * poll every `intervalMs`, but not while the tab is hidden;
//   * refetch right away when the tab comes back or the window gets focus;
//   * refetch right away when anything signals "club data changed" (a dues
//     payment, a receipt sent, an approve/deny/retry), in this tab or another.

const EVENT = "club-data-changed";
const CHANNEL = "club-data";

/** Tell every live screen (this tab and other tabs) to refresh now. */
export function signalDataChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(EVENT));
  try {
    const channel = new BroadcastChannel(CHANNEL);
    channel.postMessage("changed");
    channel.close();
  } catch {
    // Older browsers: this tab still updates.
  }
}

/** Run `fn` whenever club data changes (here or in another tab). */
export function useOnDataChanged(fn: () => void) {
  const ref = useRef(fn);
  useEffect(() => {
    ref.current = fn;
  }, [fn]);
  useEffect(() => {
    const run = () => ref.current();
    window.addEventListener(EVENT, run);
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(CHANNEL);
      channel.onmessage = run;
    } catch {
      channel = null;
    }
    return () => {
      window.removeEventListener(EVENT, run);
      channel?.close();
    };
  }, []);
}

export type LiveData<T> = {
  data: T | null;
  error: boolean; // only after two failures in a row
  loading: boolean; // nothing to show yet
  updatedAt: number | null;
  refresh: () => Promise<void>;
};

/**
 * GET a JSON API route (with the member's login) and keep it fresh.
 * Pass `null` as the url to pause (e.g. not a treasurer).
 */
export function useLiveData<T>(url: string | null, { intervalMs }: { intervalMs: number }): LiveData<T> {
  const authFetch = useAuthFetch();
  const [state, setState] = useState<LiveState<T>>(initialLiveState<T>());
  const inFlight = useRef(false);
  const again = useRef(false);
  const urlRef = useRef(url);
  const rerun = useRef<() => void>(() => {});

  const refresh = useCallback(async () => {
    const current = urlRef.current;
    if (!current) return;
    if (inFlight.current) {
      again.current = true; // run once more when this one finishes
      return;
    }
    inFlight.current = true;
    try {
      const res = await authFetch(current);
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as T;
      if (urlRef.current === current) setState((s) => onSuccess(s, body, Date.now()));
    } catch {
      if (urlRef.current === current) setState((s) => onFailure(s));
    } finally {
      inFlight.current = false;
      if (again.current) {
        again.current = false;
        rerun.current();
      }
    }
  }, [authFetch]);

  useEffect(() => {
    rerun.current = () => void refresh();
  }, [refresh]);

  // New url (e.g. another range): start fresh.
  useEffect(() => {
    urlRef.current = url;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset for the new url
    setState(initialLiveState<T>());
    if (url) void refresh();
  }, [url, refresh]);

  // Poll while visible; catch up when the tab comes back or gets focus.
  useEffect(() => {
    if (!url) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, intervalMs);
    const onVisible = () => document.visibilityState === "visible" && void refresh();
    const onFocus = () => void refresh();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
    };
  }, [url, intervalMs, refresh]);

  useOnDataChanged(refresh);

  return {
    data: state.data,
    error: hasError(state),
    loading: state.data === null && !hasError(state),
    updatedAt: state.updatedAt,
    refresh,
  };
}
