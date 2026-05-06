import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Mazed Auto — La plateforme intelligente d'enchères automobiles",
    short_name: "Mazed Auto",
    description:
      "Plateforme d'enchères automobiles de confiance en Tunisie — vérification multi-couches, enchères en temps réel, transparence totale.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    lang: "fr",
    dir: "ltr",
    categories: ["business", "shopping", "auto"],
    icons: [
      {
        src: "/logo.png",
        sizes: "300x300",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/logo.png",
        sizes: "300x300",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Parcourir les enchères",
        short_name: "Enchères",
        url: "/auctions",
      },
      {
        name: "Nouvelle enchère",
        short_name: "Vendre",
        url: "/seller/new/step-1",
      },
      {
        name: "Notifications",
        short_name: "Notifs",
        url: "/notifications",
      },
    ],
  };
}
