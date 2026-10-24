import { AreaMessages } from "@/components/i18n/AreaMessages";

/**
 * The storefront reuses the annonce page's « Afficher le numéro » control
 * (ContactReveal), whose words live in the `listing` area.
 */
export default function BoutiquesLayout({ children }: { children: React.ReactNode }) {
  return <AreaMessages areas={["shops", "listing"]}>{children}</AreaMessages>;
}
