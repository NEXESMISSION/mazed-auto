import { AreaMessages } from "@/components/i18n/AreaMessages";

/** The signup form opens the terms and the privacy policy in a dialog. */
export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return <AreaMessages areas={["legal"]}>{children}</AreaMessages>;
}
