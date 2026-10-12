import type { Metadata, Viewport } from "next";
import { DemoProvider } from "@/state/DemoProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "TIGERIS AI OS — Stage 1 demonstration",
  description: "Investor-demonstration prototype of an AI-native sovereign capital intelligence operating system. Fictional demonstration data.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full"><DemoProvider>{children}</DemoProvider></body>
    </html>
  );
}
