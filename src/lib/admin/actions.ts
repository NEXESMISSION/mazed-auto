/**
 * Action codes in the operator's words.
 *
 * Shared by the dashboard's "derniers gestes" strip and the full journal, so
 * the same event cannot be called two different things on two screens.
 *
 * Unmapped codes deliberately fall through to the raw value at the call site:
 * a new action showing up as `listing.foo` is a prompt to label it, whereas
 * hiding it makes the audit trail quietly incomplete.
 *
 * French and Arabic side by side, keyed by the stored code (codes contain
 * dots, which a messages key cannot): `actionLabel(code, locale)`.
 */
export const ACTION_LABEL: Record<string, string> = {
  // Seller-side
  "listing.create": "Annonce créée",
  "listing.submit.free": "Annonce soumise (gratuite)",
  "listing.submit.payment": "Annonce soumise (payante)",
  "listing.renew": "Annonce renouvelée",
  logout: "Déconnexion",

  // Moderation
  "admin.listing.approve": "Annonce publiée",
  "admin.listing.republish": "Annonce remise en ligne",
  "admin.listing.reject": "Annonce refusée",
  "admin.listing.archive": "Annonce archivée",
  "admin.listing.extend": "Publication prolongée",
  "admin.listing.feature": "Mise en avant sur l'accueil",
  "admin.listing.unfeature": "Retirée de l'accueil",
  "admin.listing.mark_sold": "Annonce marquée vendue",
  "admin.listing.mark_paid": "Paiement enregistré",
  "admin.listing.waive_fee": "Publication offerte",
  "admin.listing.edit": "Annonce modifiée",
  "admin.listing.delete": "Annonce supprimée",
  "admin.listing.create": "Annonce créée par l'admin",
  "admin.listing.bulk_approve": "Publication groupée",
  "admin.listing.bulk_archive": "Archivage groupé",
  "admin.listing.bulk_extend": "Prolongation groupée",

  // Money
  "admin.payment.accept": "Reçu validé",
  "admin.payment.reject": "Reçu refusé",
  "payment.captured": "Paiement validé",
  "payment.failed": "Paiement refusé",
  "payment.manual": "Paiement manuel enregistré",

  // Offers
  "admin.product.create": "Offre créée",
  "admin.product.update": "Offre modifiée",
  "admin.product.deactivate": "Offre retirée de la vente",

  // People
  "admin.user.set_role": "Rôle modifié",
  "admin.user.ban": "Compte suspendu",
  "admin.user.unban": "Compte réactivé",
  "admin.seller.grant_credits": "Forfait crédité",
  "admin.seller.grant_badge": "Badge accordé",
  "admin.seller.revoke_badge": "Badge retiré",
  "user.admin_update": "Compte modifié",

  // Catalogue + site
  "admin.category.create": "Catégorie créée",
  "admin.category.update": "Catégorie modifiée",
  "admin.category.toggle": "Catégorie activée / désactivée",
  "admin.attribute.create": "Caractéristique ajoutée",
  "admin.attribute.update": "Caractéristique modifiée",
  "admin.attribute.delete": "Caractéristique supprimée",
  "admin.settings.update": "Réglages modifiés",
  "home.feature": "Mise en avant sur l'accueil",

  // Social Publisher (a shop posting its annonces to Facebook / Instagram)
  "social.request": "Publication sociale préparée",
  "social.publish": "Publication sociale envoyée",
  "social.accounts_connected": "Comptes sociaux connectés",
  "social.account_disconnected": "Compte social déconnecté",
  "social.job.check": "Publication sociale vérifiée",
  "social.job.retry": "Publication sociale relancée",
  "social.job.cancel": "Publication sociale annulée",
};

const ACTION_LABEL_AR: Record<string, string> = {
  "listing.create": "إنشاء إعلان",
  "listing.submit.free": "إرسال إعلان (مجاني)",
  "listing.submit.payment": "إرسال إعلان (مدفوع)",
  "listing.renew": "تجديد إعلان",
  logout: "تسجيل الخروج",

  "admin.listing.approve": "نشر إعلان",
  "admin.listing.republish": "إعادة نشر إعلان",
  "admin.listing.reject": "رفض إعلان",
  "admin.listing.archive": "أرشفة إعلان",
  "admin.listing.extend": "تمديد النشر",
  "admin.listing.feature": "إبراز في الصفحة الرئيسية",
  "admin.listing.unfeature": "سحب من الصفحة الرئيسية",
  "admin.listing.mark_sold": "تعليم الإعلان كمُباع",
  "admin.listing.mark_paid": "تسجيل دفعة",
  "admin.listing.waive_fee": "نشر مجاني (هدية)",
  "admin.listing.edit": "تعديل إعلان",
  "admin.listing.delete": "حذف إعلان",
  "admin.listing.create": "إعلان أنشأه المشرف",
  "admin.listing.bulk_approve": "نشر جماعي",
  "admin.listing.bulk_archive": "أرشفة جماعية",
  "admin.listing.bulk_extend": "تمديد جماعي",

  "admin.payment.accept": "تأكيد وصل",
  "admin.payment.reject": "رفض وصل",
  "payment.captured": "دفعة مؤكَّدة",
  "payment.failed": "دفعة مرفوضة",
  "payment.manual": "تسجيل دفعة يدويًا",

  "admin.product.create": "إنشاء عرض",
  "admin.product.update": "تعديل عرض",
  "admin.product.deactivate": "سحب عرض من البيع",

  "admin.user.set_role": "تغيير الدور",
  "admin.user.ban": "تعليق حساب",
  "admin.user.unban": "إعادة تفعيل حساب",
  "admin.seller.grant_credits": "إضافة رصيد باقة",
  "admin.seller.grant_badge": "منح الشارة",
  "admin.seller.revoke_badge": "سحب الشارة",
  "user.admin_update": "تعديل حساب",

  "admin.category.create": "إنشاء صنف",
  "admin.category.update": "تعديل صنف",
  "admin.category.toggle": "تفعيل / تعطيل صنف",
  "admin.attribute.create": "إضافة خاصية",
  "admin.attribute.update": "تعديل خاصية",
  "admin.attribute.delete": "حذف خاصية",
  "admin.settings.update": "تعديل الإعدادات",
  "home.feature": "إبراز في الصفحة الرئيسية",

  "social.request": "تحضير منشور على الشبكات",
  "social.publish": "إرسال منشور على الشبكات",
  "social.accounts_connected": "ربط حسابات التواصل",
  "social.account_disconnected": "فصل حساب تواصل",
  "social.job.check": "التحقق من منشور على الشبكات",
  "social.job.retry": "إعادة محاولة منشور على الشبكات",
  "social.job.cancel": "إلغاء منشور على الشبكات",
};

export function actionLabel(action: string, locale: string = "fr"): string {
  return (locale === "ar" ? ACTION_LABEL_AR[action] : ACTION_LABEL[action]) ?? action;
}
