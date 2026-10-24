import { AreaMessages } from "@/components/i18n/AreaMessages";

/** The publish wizard is a client component: it reads the `publish` messages. */
export default function NewListingLayout({ children }: { children: React.ReactNode }) {
  return <AreaMessages areas={["publish"]}>{children}</AreaMessages>;
}
