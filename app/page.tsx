"use client";

import { usePrivy } from "@privy-io/react-auth";
import { LoginForm } from "./_components/LoginForm";
import { MemberHome } from "./_components/MemberHome";

export default function Home() {
  const { ready, authenticated } = usePrivy();

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-8 px-4 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Club Treasury</h1>
      {!ready ? (
        <p className="text-zinc-600 dark:text-zinc-400">Loading…</p>
      ) : authenticated ? (
        <MemberHome />
      ) : (
        <LoginForm />
      )}
    </main>
  );
}
