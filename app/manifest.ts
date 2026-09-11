import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Meu Ritmo",
    short_name: "Meu Ritmo",
    description: "Planejamento pessoal, foco, hábitos e equilíbrio em um só lugar.",
    start_url: "/",
    display: "standalone",
    background_color: "#fffdf9",
    theme_color: "#24364b",
    orientation: "portrait",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
