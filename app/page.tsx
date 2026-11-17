"use client";

import { usePrivy } from "@privy-io/react-auth";
import { HomeRouter } from "./_components/HomeRouter";
import { LoginForm } from "./_components/LoginForm";
import { Wordmark } from "./_components/Mark";

export default function Home() {
  const { ready, authenticated } = usePrivy();

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-10 px-4 pt-10 pb-12">
      <Wordmark />
      <div className="flex flex-1 flex-col justify-center gap-8">
        {!(ready && authenticated) && (
          <div>
            <h1 className="text-4xl leading-[1.05] font-semibold sm:text-5xl">
              Dues in one tap. Paid back in seconds.
            </h1>
            <p className="mt-4 text-lg text-zinc-600 dark:text-zinc-400">
              The money side of your student club: pay dues, get reimbursed for club costs, and see where every dollar
              goes.
            </p>
          </div>
        )}
        <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-[0_18px_40px_-28px_rgb(13_18_16/0.35)] dark:border-zinc-800 dark:bg-zinc-900">
          {!ready ? (
            <p className="text-zinc-600 dark:text-zinc-400">Loading…</p>
          ) : authenticated ? (
            <HomeRouter />
          ) : (
            <LoginForm />
          )}
        </div>
      </div>
    </main>
  );
}
