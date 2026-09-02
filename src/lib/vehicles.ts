/**
 * The makes and models sold in Tunisia, for the publish flow to offer instead
 * of a free-text box.
 *
 * This exists because free text is how a catalog rots. The location column
 * already proved it: sellers typed "Sahloul", "La Marsa", "Cité Ennasr 2"
 * where a governorate was expected, and fourteen cars became invisible to the
 * filter — nobody noticed until someone counted. `make` and `model` are worse,
 * because they are what buyers search on: "Volkswagen", "VW", "volkswagen" and
 * "Volswagen" are four different cars to a database.
 *
 * The list is a starting point, not a wall: a seller can still type a make we
 * do not list (there are always imports and oddities). What matters is that the
 * common 95% land on the same spelling without anyone having to think about it.
 *
 * Ordered by what actually sells here — Renault, Volkswagen, Peugeot and
 * Citroën lead the current catalog — then alphabetically.
 */

export type Make = { name: string; models: string[] };

export const CAR_MAKES: Make[] = [
  { name: "Renault", models: ["Clio", "Symbol", "Megane", "Captur", "Kadjar", "Kangoo", "Express", "Talisman", "Austral", "Twingo", "Duster"] },
  { name: "Volkswagen", models: ["Polo", "Golf", "Passat", "Tiguan", "T-Roc", "T-Cross", "Touareg", "Caddy", "Jetta", "Arteon", "ID.4"] },
  { name: "Peugeot", models: ["108", "208", "301", "308", "2008", "3008", "5008", "407", "508", "Partner", "Rifter", "Expert"] },
  { name: "Citroën", models: ["C3", "C4", "C4X", "C5 Aircross", "C-Elysée", "Berlingo", "DS3", "DS4", "DS7", "Jumpy"] },
  { name: "Dacia", models: ["Sandero", "Logan", "Duster", "Dokker", "Lodgy", "Spring", "Jogger"] },
  { name: "Seat", models: ["Ibiza", "Leon", "Arona", "Ateca", "Tarraco", "Toledo"] },
  { name: "Skoda", models: ["Fabia", "Octavia", "Superb", "Kamiq", "Karoq", "Kodiaq", "Scala", "Rapid"] },
  { name: "Cupra", models: ["Formentor", "Leon", "Ateca", "Born"] },
  { name: "Ford", models: ["Fiesta", "Focus", "Kuga", "Puma", "EcoSport", "Ranger", "Transit", "Mondeo"] },
  { name: "Toyota", models: ["Yaris", "Corolla", "RAV4", "C-HR", "Hilux", "Land Cruiser", "Auris", "Avensis"] },
  { name: "Hyundai", models: ["i10", "i20", "i30", "Accent", "Tucson", "Kona", "Santa Fe", "Creta", "Elantra"] },
  { name: "Kia", models: ["Picanto", "Rio", "Ceed", "Sportage", "Stonic", "Seltos", "Xceed", "Sorento"] },
  { name: "Nissan", models: ["Micra", "Juke", "Qashqai", "X-Trail", "Navara", "Sunny", "Kicks"] },
  { name: "Fiat", models: ["Panda", "500", "Tipo", "Doblo", "Punto", "Fiorino"] },
  { name: "Opel", models: ["Corsa", "Astra", "Mokka", "Crossland", "Grandland", "Combo", "Insignia"] },
  { name: "BMW", models: ["Série 1", "Série 2", "Série 3", "Série 4", "Série 5", "Série 7", "X1", "X2", "X3", "X4", "X5", "X6"] },
  { name: "Mercedes-Benz", models: ["Classe A", "Classe B", "Classe C", "Classe E", "Classe S", "CLA", "GLA", "GLB", "GLC", "GLE", "Vito", "Sprinter"] },
  { name: "Audi", models: ["A1", "A3", "A4", "A5", "A6", "Q2", "Q3", "Q5", "Q7", "Q8"] },
  { name: "Chery", models: ["Tiggo 2", "Tiggo 4", "Tiggo 7", "Tiggo 8", "Arrizo"] },
  { name: "Jetour", models: ["X70", "X90", "Dashing", "T2"] },
  { name: "Suzuki", models: ["Swift", "Baleno", "Vitara", "Jimny", "Celerio", "S-Presso"] },
  { name: "Mahindra", models: ["KUV100", "XUV300", "Scorpio", "Pik Up", "Bolero"] },
  { name: "Ssangyong", models: ["Tivoli", "Korando", "Rexton", "Musso"] },
  { name: "Mitsubishi", models: ["Space Star", "ASX", "Outlander", "L200", "Pajero"] },
  { name: "Honda", models: ["Jazz", "Civic", "CR-V", "HR-V"] },
  { name: "Isuzu", models: ["D-Max", "MU-X"] },
  { name: "Chevrolet", models: ["Spark", "Aveo", "Cruze", "Captiva"] },
  { name: "Land Rover", models: ["Defender", "Discovery", "Range Rover", "Evoque", "Velar"] },
  { name: "Jeep", models: ["Renegade", "Compass", "Wrangler", "Cherokee"] },
  { name: "Mini", models: ["Cooper", "Countryman", "Clubman"] },
  { name: "Volvo", models: ["XC40", "XC60", "XC90", "S60", "V40"] },
  { name: "MG", models: ["MG3", "MG5", "ZS", "HS"] },
  { name: "Haval", models: ["Jolion", "H6", "Dargo"] },
  { name: "Geely", models: ["Coolray", "Emgrand", "Tugella"] },
  { name: "Iveco", models: ["Daily", "Eurocargo"] },
  { name: "Wallyscar", models: ["Iris", "Estafette", "419"] },
];

export const MOTO_MAKES: Make[] = [
  { name: "Yamaha", models: ["NMAX", "XMAX", "MT-07", "MT-09", "TMAX", "YZF-R3"] },
  { name: "Honda", models: ["PCX", "Forza", "CB500", "CBR", "SH125"] },
  { name: "Piaggio", models: ["Vespa", "Liberty", "Medley", "Beverly"] },
  { name: "SYM", models: ["Symphony", "Jet", "Cruisym", "Fiddle"] },
  { name: "Kymco", models: ["Agility", "Like", "People", "Xciting"] },
  { name: "Vespa", models: ["Primavera", "Sprint", "GTS"] },
  { name: "Kuba", models: ["Nova", "Sprint", "Vision"] },
  { name: "Peugeot", models: ["Kisbee", "Django", "Metropolis"] },
  { name: "KTM", models: ["Duke 125", "Duke 390", "RC 390"] },
  { name: "Bajaj", models: ["Boxer", "Pulsar", "Discover"] },
];

/** Parts brands, for the same reason: "bosh" and "BOSCH" are one brand. */
export const PART_BRANDS = [
  "Bosch", "Valeo", "Continental", "Denso", "Delphi", "Mahle", "Mann-Filter",
  "Sachs", "Monroe", "Brembo", "Ferodo", "TRW", "SKF", "Gates", "NGK",
  "Michelin", "Bridgestone", "Goodyear", "Pirelli", "Hankook", "Kumho",
  "Varta", "Exide", "Febi", "Hella", "Luk", "Optimal", "Autre",
];

export const FUELS = [
  { value: "gasoline", label: "Essence" },
  { value: "diesel", label: "Diesel" },
  { value: "hybrid", label: "Hybride" },
  { value: "electric", label: "Électrique" },
  { value: "lpg", label: "GPL" },
] as const;

export const TRANSMISSIONS = [
  { value: "manual", label: "Manuelle" },
  { value: "automatic", label: "Automatique" },
] as const;

export const CONDITIONS = [
  { value: "used", label: "Occasion" },
  { value: "new", label: "Neuf" },
  { value: "refurbished", label: "Reconditionné" },
] as const;

/** Model list for a make, across cars and motorbikes. Empty when unknown. */
export function modelsFor(make: string, kind: "car" | "moto" = "car"): string[] {
  const list = kind === "moto" ? MOTO_MAKES : CAR_MAKES;
  const hit = list.find((m) => m.name.toLowerCase() === make.trim().toLowerCase());
  return hit ? hit.models : [];
}

/**
 * Model years, newest first. Cars from the 1980s still change hands here, so
 * the range is deliberately long — but the list starts at next year, because
 * dealers list the coming model year before it arrives.
 */
export function modelYears(now = 2026): number[] {
  const years: number[] = [];
  for (let y = now + 1; y >= 1980; y--) years.push(y);
  return years;
}
