import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Meu Ritmo",
  description: "Planejamento pessoal, foco, hábitos e equilíbrio em um só lugar.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Meu Ritmo", statusBarStyle: "default" },
  icons: { icon: "/icon-192.png", apple: "/icon-192.png" },
};

export const viewport = { themeColor: "#24364b", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>
        {children}
        <script src="/backup-tools.js" defer />
      </body>
    </html>
  );
}
