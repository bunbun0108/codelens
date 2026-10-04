import type { Metadata } from "next";
import { JetBrains_Mono, Orbitron } from "next/font/google";
import "./globals.css";

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

const orbitron = Orbitron({
  variable: "--font-orbitron",
  subsets: ["latin"],
  weight: "800",
});

export const metadata: Metadata = {
  title: "CodeLens",
  description: "Browse GitHub repositories instantly",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${jetbrainsMono.variable} ${orbitron.variable} h-full dark`}
    >
      <body className="min-h-full flex flex-col font-mono">{children}</body>
    </html>
  );
}
