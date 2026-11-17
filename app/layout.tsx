import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PrivyClientProvider } from "@/lib/wallets/PrivyClientProvider";

export const metadata: Metadata = {
  title: "Club Treasury",
  description: "Pay dues and get reimbursed for club expenses in seconds.",
};

export const viewport: Viewport = {
  // Lets pages pad around the iPhone home bar with env(safe-area-inset-*).
  viewportFit: "cover",
  themeColor: "#e9e9ec",
  colorScheme: "light",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        {/* Soft blurred gray shapes behind everything, for the glass to frost. */}
        <div aria-hidden className="backdrop-shapes">
          <span style={{ width: 520, height: 520, top: -160, left: -140, background: "#d4d4da" }} />
          <span style={{ width: 460, height: 460, top: "35%", right: -160, background: "#f7f7f9" }} />
          <span style={{ width: 420, height: 420, bottom: -180, left: "20%", background: "#cfcfd6" }} />
          <span style={{ width: 300, height: 300, top: "15%", left: "45%", background: "#ffffff" }} />
        </div>
        <PrivyClientProvider>{children}</PrivyClientProvider>
      </body>
    </html>
  );
}
