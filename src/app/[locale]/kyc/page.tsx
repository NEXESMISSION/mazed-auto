import { redirect } from "@/i18n/navigation";

export default async function KYCIndex({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect({ href: "/kyc/start", locale });
}
