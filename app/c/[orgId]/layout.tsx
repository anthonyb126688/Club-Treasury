import { Suspense, type ReactNode } from "react";
import { LoadingScreen } from "@/app/_components/Mark";
import { ClubShell } from "./ClubShell";

// Every page inside a club. The shell reads the club id from the URL, so it
// sits inside <Suspense> (required with cacheComponents).
export default function ClubLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <ClubShell>{children}</ClubShell>
    </Suspense>
  );
}
