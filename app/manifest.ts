import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Agendinha",
    short_name: "Agendinha",
    description: "Sua rotina, tarefas, hábitos e planos em um lugar leve e organizado.",
    start_url: "/",
    display: "standalone",
    background_color: "#fffdf9",
    theme_color: "#8fb6a6",
    orientation: "portrait",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
