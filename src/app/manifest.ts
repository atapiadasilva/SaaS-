import type { MetadataRoute } from "next";

/**
 * Manifiesto de la app instalable. iOS lo lee parcialmente (name, icons,
 * display), por eso en el layout van además las meta `apple-*`.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Hilo Digital",
    short_name: "Hilo",
    description:
      "Visualización de modelo BIM y reporte de terreno bajo metodología AWP",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#ffffff",
    theme_color: "#ff0000",
    lang: "es",
    dir: "ltr",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
