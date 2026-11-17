"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useCallback } from "react";

/** fetch() that sends the member's Privy login, for our own API routes. */
export function useAuthFetch() {
  const { getAccessToken } = usePrivy();
  return useCallback(
    async (input: string, init: RequestInit = {}) => {
      const token = await getAccessToken();
      const headers = new Headers(init.headers);
      if (token) headers.set("Authorization", `Bearer ${token}`);
      if (init.body && typeof init.body === "string" && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
      }
      return fetch(input, { ...init, headers });
    },
    [getAccessToken],
  );
}
