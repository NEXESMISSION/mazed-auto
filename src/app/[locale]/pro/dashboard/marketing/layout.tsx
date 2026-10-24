import { AreaMessages } from "@/components/i18n/AreaMessages";

/**
 * The Social Publisher's client components read `social`. A nested provider
 * replaces the one of /pro/layout.tsx rather than adding to it, so the pro
 * areas are restated (PostButton, the tabs above).
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return <AreaMessages areas={["social", "pro", "shops", "myAccount"]}>{children}</AreaMessages>;
}
