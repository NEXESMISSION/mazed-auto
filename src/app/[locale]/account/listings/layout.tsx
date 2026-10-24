import { AreaMessages } from "@/components/i18n/AreaMessages";

/**
 * « Mes annonces » also shows the pro space's payment check (PaymentStatus,
 * after a Konnect return), whose words live in the `pro` messages.
 */
export default function MyListingsLayout({ children }: { children: React.ReactNode }) {
  return <AreaMessages areas={["myAccount", "pro"]}>{children}</AreaMessages>;
}
