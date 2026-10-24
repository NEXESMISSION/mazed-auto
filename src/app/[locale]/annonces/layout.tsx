import { AreaMessages } from "@/components/i18n/AreaMessages";

/** The catalogue's filters and the reels feed are client components reading `catalog`. */
export default function AnnoncesLayout({ children }: { children: React.ReactNode }) {
  return <AreaMessages areas={["catalog"]}>{children}</AreaMessages>;
}
