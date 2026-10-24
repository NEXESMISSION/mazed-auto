/**
 * Arabic names for the things the database stores in French: governorates
 * (listings keep the French name, "Gabès"), categories (`label_fr`, with a
 * `label_ar` column only some rows filled), and the catalogue's attributes
 * (`category_attributes.label`, select options, units).
 *
 * Kept in code rather than in the messages because they are data names, keyed
 * by what the database holds, and server code (metadata, JSON-LD, the feed)
 * needs them as much as components do. Anything not listed falls back to the
 * database's own French — an attribute an admin adds tomorrow still shows,
 * just untranslated, instead of disappearing.
 */

const GOVERNORATE_AR: Record<string, string> = {
  Tunis: "تونس",
  Ariana: "أريانة",
  "Ben Arous": "بن عروس",
  Manouba: "منوبة",
  Nabeul: "نابل",
  Bizerte: "بنزرت",
  Zaghouan: "زغوان",
  Sousse: "سوسة",
  Monastir: "المنستير",
  Mahdia: "المهدية",
  Sfax: "صفاقس",
  "Béja": "باجة",
  Jendouba: "جندوبة",
  Kef: "الكاف",
  Siliana: "سليانة",
  Kairouan: "القيروان",
  Kasserine: "القصرين",
  "Sidi Bouzid": "سيدي بوزيد",
  "Gabès": "قابس",
  "Médenine": "مدنين",
  Tataouine: "تطاوين",
  Gafsa: "قفصة",
  Tozeur: "توزر",
  Kebili: "قبلي",
  // Not a governorate: what some shops put as their address.
  Tunisie: "تونس",
};

/** A governorate's name in `locale`. The value stored and filtered on stays French. */
export function governorateLabel(name: string | null | undefined, locale: string): string {
  if (!name) return "";
  return locale === "ar" ? (GOVERNORATE_AR[name] ?? name) : name;
}

const CATEGORY_AR: Record<string, string> = {
  vehicules: "مركبات",
  "pieces-rechange": "قطع الغيار",
  voitures: "سيارات",
  utilitaires: "سيارات نفعية",
  motos: "دراجات نارية",
  camions: "شاحنات",
  engins: "آليات ثقيلة",
  scooters: "سكوتر",
  "bus-minibus": "حافلات وميني باص",
  "remorques-caravanes": "مقطورات وكرافانات",
  "quads-buggys": "كواد وباغي",
  "tracteurs-agricole": "جرّارات وآلات فلاحية",
  moteur: "المحرّك",
  transmission: "علبة السرعة وناقل الحركة",
  freinage: "الفرامل",
  suspension: "التعليق والمقود",
  electricite: "الكهرباء والبطارية",
  carrosserie: "الهيكل والأضواء",
  interieur: "الداخلية",
  "pneus-jantes": "العجلات والجنوط",
  filtration: "الفلاتر والصيانة",
  accessoires: "الإكسسوارات",
  echappement: "العادم",
  refroidissement: "التبريد والمكيّف",
  embrayage: "القابض",
  "vitrage-retroviseurs": "البلّور والمرايا",
  multimedia: "الوسائط المتعددة والملاحة",
  "pieces-moto": "قطع الدراجات والسكوتر",
  "securite-antivol": "الأمان ومانع السرقة",
  attelage: "القطر والجرّ",
  "huiles-liquides": "الزيوت والسوائل",
  outillage: "الأدوات والمعدّات",
};

export type CategoryNames = { slug?: string | null; label_fr: string; label_ar?: string | null };

/** A category's name in `locale`: the list above, else the row's `label_ar`, else French. */
export function categoryLabel(category: CategoryNames | null | undefined, locale: string): string {
  if (!category) return "";
  if (locale !== "ar") return category.label_fr;
  return (category.slug ? CATEGORY_AR[category.slug] : undefined) || category.label_ar || category.label_fr;
}

const ATTRIBUTE_AR: Record<string, string> = {
  make: "الماركة",
  model: "الطراز",
  year: "السنة",
  mileage: "عدد الكيلومترات",
  fuel: "الوقود",
  transmission: "علبة السرعة",
  color: "اللون",
  condition: "الحالة",
  brand: "الماركة",
  reference: "المرجع (OEM)",
  warranty_months: "الضمان",
  quantity: "الكمية المتوفّرة",
};

const OPTION_AR: Record<string, Record<string, string>> = {
  fuel: { gasoline: "بنزين", diesel: "ديزل", hybrid: "هجين", electric: "كهربائي", lpg: "غاز (GPL)" },
  transmission: { manual: "يدوية", automatic: "أوتوماتيكية" },
  condition: {
    new: "جديد",
    excellent: "ممتاز",
    good: "جيّد",
    fair: "مقبول",
    damaged: "متضرّر (حادث)",
    used: "مستعمل",
    refurbished: "مُجدَّد",
  },
};

const UNIT_AR: Record<string, string> = { km: "كم", mois: "شهر", cv: "حصان", ch: "حصان" };

/** An attribute's label (`category_attributes.label` is the French fallback). */
export function attributeLabel(fieldKey: string, fallback: string, locale: string): string {
  return locale === "ar" ? (ATTRIBUTE_AR[fieldKey] ?? fallback) : fallback;
}

/** A select option's label for `fieldKey`. */
export function attributeOptionLabel(fieldKey: string, value: string, fallback: string, locale: string): string {
  return locale === "ar" ? (OPTION_AR[fieldKey]?.[value] ?? fallback) : fallback;
}

/** A unit ("km", "mois") in `locale`. */
export function unitLabel(unit: string | null | undefined, locale: string): string {
  if (!unit) return "";
  return locale === "ar" ? (UNIT_AR[unit.toLowerCase()] ?? unit) : unit;
}
