import { redirect } from "@/i18n/navigation";

export default async function SellerIndex({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect({ href: "/seller/dashboard", locale });
}
