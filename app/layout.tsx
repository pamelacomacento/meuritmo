import type { Metadata } from "next";
import "./globals.css";
import CloudSync from "./cloud-sync";

export const metadata: Metadata = {
  title: "Agendinha",
  description: "Sua rotina, tarefas, hábitos e planos em um lugar leve e organizado.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Agendinha", statusBarStyle: "default" },
  icons: { icon: "/icon-192.png", apple: "/icon-192.png" },
};

export const viewport = { themeColor: "#8fb6a6", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>
        <CloudSync />
        {children}
        <script src="/backup-tools.js" defer />
      </body>
    </html>
  );
}
