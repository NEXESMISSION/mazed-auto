import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { clientMessages, type Area } from "@/i18n/areas";

/**
 * Gives the client components below it the messages of `areas`, on top of the
 * core and the global areas the [locale] layout already sends. Put it in the
 * layout of the routes that use them. A nested provider replaces the outer
 * one rather than adding to it, which is why the core is sent again here.
 */
export async function AreaMessages({ areas, children }: { areas: readonly Area[]; children: React.ReactNode }) {
  const messages = await getMessages();
  return <NextIntlClientProvider messages={clientMessages(messages, areas)}>{children}</NextIntlClientProvider>;
}
