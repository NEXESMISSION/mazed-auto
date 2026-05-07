import { redirect } from "@/i18n/navigation";

export default async function BuyerIndex({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect({ href: "/buyer/dashboard", locale });
}
