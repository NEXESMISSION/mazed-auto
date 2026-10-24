import { AreaMessages } from "@/components/i18n/AreaMessages";

/** The checkout's client component reads the `payment` messages. */
export default function PaymentLayout({ children }: { children: React.ReactNode }) {
  return <AreaMessages areas={["payment"]}>{children}</AreaMessages>;
}
