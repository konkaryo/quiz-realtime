import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Synapz — Culture générale en direct",
  description: "Un jeu de culture générale multijoueur, rapide et sans choix multiples.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `try{const saved=localStorage.getItem("synapz-theme")||localStorage.getItem("aparte-theme");const theme=saved||(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");document.documentElement.dataset.theme=theme}catch{}` }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
