import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "人還是 AI？ · REAL / AI",
  description: "3–10 人派對遊戲。亂作一句，找出 AI，睇吓邊個呃到你。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant">
      <body className="antialiased">{children}</body>
    </html>
  );
}
