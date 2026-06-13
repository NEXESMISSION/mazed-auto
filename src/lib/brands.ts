/**
 * Static car-brand catalogue powering the home "Parcourir par marque"
 * logo grid. The logos live in /public/marques/*.png (copied from the
 * curated set we shot/optimised for v1). This is intentionally a static
 * directory of the FULL brand line-up — not just the makes that happen to
 * have a live lot — so the grid is a stable, complete brand wall. Live lot
 * counts are merged in at render time via {@link brandCounts}.
 *
 * `query` is the free-text token deep-linked into /properties?q=… (the
 * canonical browse route). `match` lists the normalised first-word tokens a
 * listing title can start with that should map back to this brand, so the
 * count badge lands on the right tile even for compound names
 * (e.g. a "Mercedes …" or "Range Rover …" title).
 */
export interface CarBrand {
  /** Display + alt text. */
  name: string;
  /** Public path to the logo PNG. */
  logo: string;
  /** Free-text token used for the /properties?q= deep link. */
  query: string;
  /** Normalised tokens (see {@link normBrand}) that map a live make here. */
  match: string[];
}

/** Lowercase, strip everything but a–z0–9 — used on both sides of matching. */
export function normBrand(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** file basename + display name; `query`/`match` default to the name. */
function b(name: string, file: string, query?: string, match?: string[]): CarBrand {
  return {
    name,
    logo: `/marques/${file}.png`,
    query: query ?? name,
    match: (match ?? [name]).map(normBrand),
  };
}

/**
 * The full line-up, ordered so the most recognised mass-market makes lead
 * (they carry the visual weight at the top of the wall), then the rest
 * alphabetically. Every entry has a real logo asset in /public/marques.
 */
export const CAR_BRANDS: CarBrand[] = [
  b("Volkswagen", "volkswagen", "Volkswagen", ["volkswagen", "vw"]),
  b("Mercedes-Benz", "mercedes-benz", "Mercedes", ["mercedes", "mercedesbenz", "merco"]),
  b("BMW", "bmw", "BMW", ["bmw"]),
  b("Audi", "audi", "Audi", ["audi"]),
  b("Toyota", "toyota", "Toyota", ["toyota"]),
  b("Peugeot", "peugeot", "Peugeot", ["peugeot"]),
  b("Renault", "renault", "Renault", ["renault"]),
  b("Citroën", "citroen", "Citroen", ["citroen", "citroën"]),
  b("Hyundai", "hyundai", "Hyundai", ["hyundai"]),
  b("Kia", "kia", "Kia", ["kia"]),
  b("Ford", "ford", "Ford", ["ford"]),
  b("Nissan", "nissan", "Nissan", ["nissan"]),
  b("Fiat", "fiat", "Fiat", ["fiat"]),
  b("Seat", "seat", "Seat", ["seat"]),
  b("Skoda", "skoda", "Skoda", ["skoda", "škoda"]),
  b("Opel", "opel", "Opel", ["opel"]),
  b("Dacia", "dacia", "Dacia", ["dacia"]),
  b("Suzuki", "suzuki", "Suzuki", ["suzuki"]),
  b("Honda", "honda", "Honda", ["honda"]),
  b("Mitsubishi", "mitsubishi", "Mitsubishi", ["mitsubishi"]),
  b("Volvo", "volvo", "Volvo", ["volvo"]),
  b("Jeep", "jeep", "Jeep", ["jeep"]),
  b("Land Rover", "land-rover", "Land Rover", ["land", "landrover", "range", "rangerover"]),
  b("Jaguar", "jaguar", "Jaguar", ["jaguar"]),
  b("Porsche", "porsche", "Porsche", ["porsche"]),
  b("Mini", "mini", "Mini", ["mini"]),
  b("Cupra", "cupra", "Cupra", ["cupra"]),
  b("MG", "mg", "MG", ["mg"]),
  b("BYD", "byd", "BYD", ["byd"]),
  b("Chery", "chery", "Chery", ["chery"]),
  b("Geely", "geely", "Geely", ["geely"]),
  b("GWM", "gwm", "GWM", ["gwm", "greatwall"]),
  b("Changan", "changan", "Changan", ["changan"]),
  b("Chevrolet", "chevrolet", "Chevrolet", ["chevrolet", "chevy"]),
  b("Jetour", "jetour", "Jetour", ["jetour"]),
  b("Omoda & Jaecoo", "omoda-and-jaecoo", "Omoda", ["omoda", "jaecoo"]),
  b("Deepal", "deepal", "Deepal", ["deepal"]),
  b("XPeng", "xpeng", "XPeng", ["xpeng"]),
  b("Lynk & Co", "lynk-and-co", "Lynk", ["lynk", "lynkco"]),
  b("IM Motors", "im-motors", "IM", ["im", "immotors"]),
  b("DFSK", "dfsk", "DFSK", ["dfsk"]),
  b("Dongfeng", "dongfeng", "Dongfeng", ["dongfeng"]),
  b("FAW", "faw", "FAW", ["faw"]),
  b("Foton", "foton", "Foton", ["foton"]),
  b("GAC", "gac", "GAC", ["gac"]),
  b("JAC", "jac", "JAC", ["jac"]),
  b("JMC", "jmc", "JMC", ["jmc"]),
  b("JMEV", "jmev", "JMEV", ["jmev"]),
  b("Mahindra", "mahindra", "Mahindra", ["mahindra"]),
  b("SsangYong", "ssangyong", "SsangYong", ["ssangyong"]),
  b("Tata", "tata", "Tata", ["tata"]),
  b("Cenntro", "cenntro", "Cenntro", ["cenntro"]),
  b("Foday", "foday", "Foday", ["foday"]),
  b("Avantier", "avantier", "Avantier", ["avantier"]),
  b("Bako", "bako", "Bako", ["bako"]),
  b("Wallyscar", "wallyscar", "Wallyscar", ["wallyscar", "wallys"]),
];

/**
 * Merge live make counts (each `name` is a listing title's leading token)
 * onto brands. Returns brandName → total live lots. Tokens that don't map to
 * a known brand are ignored (the grid is logo-only, no orphan tiles).
 */
export function brandCounts(
  makes: { name: string; count: number }[],
): Map<string, number> {
  const tokenToBrand = new Map<string, string>();
  for (const brand of CAR_BRANDS) {
    for (const tok of brand.match) tokenToBrand.set(tok, brand.name);
  }
  const out = new Map<string, number>();
  for (const m of makes) {
    const brand = tokenToBrand.get(normBrand(m.name));
    if (!brand) continue;
    out.set(brand, (out.get(brand) ?? 0) + m.count);
  }
  return out;
}
