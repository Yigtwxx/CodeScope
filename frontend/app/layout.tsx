import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ErrorBoundary } from "@/components/ErrorBoundary";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CodeScope",
  description: "AI-powered intelligent coding assistant for exploring and understanding your codebase",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-[#0f1117] h-screen flex items-center justify-center overflow-hidden p-4 sm:p-8`}
      >
        {/* MacBook Window Container */}
        <div className="relative w-full max-w-[1400px] h-full max-h-[900px] bg-[#1a1b26]/90 backdrop-blur-xl rounded-xl border border-white/10 shadow-2xl flex flex-col overflow-hidden">

          {/* Window Header / Title Bar */}
          <div className="h-10 bg-white/5 border-b border-white/5 flex items-center px-4 justify-between shrink-0">
            {/* Traffic Lights */}
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-[#ff5f56] border border-[#e0443e]"></div>
              <div className="w-3 h-3 rounded-full bg-[#ffbd2e] border border-[#dea123]"></div>
              <div className="w-3 h-3 rounded-full bg-[#27c93f] border border-[#1aab29]"></div>
            </div>

            {/* Window Title */}
            <div className="text-xs text-white/40 font-medium">CodeScope - Intelligent Coding Assistant</div>

            {/* Spacer for symmetry */}
            <div className="w-10"></div>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 overflow-hidden flex flex-col relative text-slate-200">
            <ErrorBoundary>{children}</ErrorBoundary>
          </div>
        </div>
      </body>
    </html>
  );
}
