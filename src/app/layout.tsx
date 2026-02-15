import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
// KaTeX CSS moved to MarkdownRenderer for lazy loading - saves ~300KB on initial load

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { Toaster } from "@/components/ui/sonner";
import { ServiceWorkerRegistration } from "@/components/pwa/ServiceWorkerRegistration";

const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: "MaiaChat - Self-Hosted AI Assistant | Open Source Clawdbot Alternative",
    template: "%s | MaiaChat",
  },
  description:
    "MaiaChat is a self-hosted, open source AI assistant platform supporting 40+ models from OpenAI, Anthropic, Google & more. Multi-channel (Telegram, Discord, Slack, Web), RAG search, autonomous agents, scheduled tasks. The best Clawdbot & OpenClaw alternative for privacy-first teams.",
  keywords: [
    "clawdbot alternative",
    "openclaw alternative",
    "moltbot alternative",
    "self-hosted AI assistant",
    "open source AI agent platform",
    "multi-provider AI chat",
    "AI assistant telegram discord slack",
    "best AI chat platform 2026",
    "self-hosted chatgpt alternative",
    "multi-channel AI assistant",
  ],
  openGraph: {
    type: "website",
    url: appUrl,
    title: "MaiaChat - Self-Hosted AI Assistant Platform",
    description:
      "Open source, self-hosted AI assistant with 40+ models, multi-channel support, RAG search, and autonomous agents. The best Clawdbot alternative.",
    siteName: "MaiaChat",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "MaiaChat - Self-Hosted AI Assistant Platform" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "MaiaChat - Self-Hosted AI Assistant Platform",
    description:
      "Open source, self-hosted AI assistant with 40+ models, multi-channel support, RAG search, and autonomous agents.",
    images: ["/opengraph-image"],
  },
  robots: {
    index: true,
    follow: true,
    "max-image-preview": "large" as const,
  },
  manifest: "/manifest.json",
  other: {
    "theme-color-light": "#ffffff",
    "theme-color-dark": "#0a0a0a",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "MaiaChat",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="google-site-verification" content="4kIsJEpf1leNCo-nd2P27M_L9vuyVWDQ00FNaV29er8" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="theme-color" content="#0a0a0a" media="(prefers-color-scheme: dark)" />
        <meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)" />
        <link rel="apple-touch-icon" href="/icon-192.svg" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        suppressHydrationWarning
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster />
          <ServiceWorkerRegistration />
        </ThemeProvider>
      </body>
    </html>
  );
}
