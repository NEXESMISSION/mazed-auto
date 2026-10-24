import { AreaMessages } from "@/components/i18n/AreaMessages";

/**
 * /pro, /pro/creer and the dashboard: their client components read `pro` and
 * `shops`, and the dashboard's annonces tab reuses the account area's renew and
 * withdraw buttons (`myAccount`).
 */
export default function ProLayout({ children }: { children: React.ReactNode }) {
  return <AreaMessages areas={["pro", "shops", "myAccount"]}>{children}</AreaMessages>;
}
