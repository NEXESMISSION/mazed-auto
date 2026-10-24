import { AreaMessages } from "@/components/i18n/AreaMessages";

/** The account pages' client components read the `myAccount` messages. */
export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return <AreaMessages areas={["myAccount"]}>{children}</AreaMessages>;
}
