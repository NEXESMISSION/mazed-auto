/**
 * The 24 Tunisian governorates, in the order people expect to see them:
 * Grand Tunis first, then the coast, then the interior and the south.
 *
 * Alphabetical order puts Ariana above Tunis and Zaghouan next to Tozeur,
 * which reads as a database dump. This is a picker a seller uses once per
 * listing; ordering it the way the country is actually grouped costs nothing
 * and saves a scan every time.
 */
export const GOVERNORATES = [
  // Grand Tunis
  "Tunis", "Ariana", "Ben Arous", "Manouba",
  // Nord-Est / Cap Bon
  "Nabeul", "Bizerte", "Zaghouan",
  // Sahel
  "Sousse", "Monastir", "Mahdia", "Sfax",
  // Nord-Ouest
  "Béja", "Jendouba", "Kef", "Siliana",
  // Centre
  "Kairouan", "Kasserine", "Sidi Bouzid",
  // Sud
  "Gabès", "Médenine", "Tataouine", "Gafsa", "Tozeur", "Kebili",
] as const;

export type Governorate = (typeof GOVERNORATES)[number];
