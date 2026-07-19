import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "VitalCowork — Coworking médico",
    short_name: "VitalCowork",
    description:
      "Tu prestigio y experiencia médica, ahora respaldados por el espacio perfecto.",
    start_url: "/inicio",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f4f9f9",
    theme_color: "#0e7490",
    lang: "es",
    icons: [
      { src: "/iconos/icono-192.png", sizes: "192x192", type: "image/png" },
      { src: "/iconos/icono-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/iconos/icono-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
