/**
 * Pays du joueur, choisi par lui (jamais déduit de sa position) et facultatif.
 * Il ne sert qu'au classement « Pays ».
 */
export interface Country {
  /** Code ISO 3166-1 alpha-2. */
  code: string;
  name: string;
}

export const COUNTRIES: Country[] = [
  { code: 'FR', name: 'France' },
  { code: 'BE', name: 'Belgique' },
  { code: 'CH', name: 'Suisse' },
  { code: 'CA', name: 'Canada' },
  { code: 'LU', name: 'Luxembourg' },
  { code: 'MC', name: 'Monaco' },
  { code: 'MA', name: 'Maroc' },
  { code: 'DZ', name: 'Algérie' },
  { code: 'TN', name: 'Tunisie' },
  { code: 'SN', name: 'Sénégal' },
  { code: 'CI', name: 'Côte d’Ivoire' },
  { code: 'CM', name: 'Cameroun' },
  { code: 'CD', name: 'RD Congo' },
  { code: 'CG', name: 'Congo' },
  { code: 'ML', name: 'Mali' },
  { code: 'BF', name: 'Burkina Faso' },
  { code: 'NE', name: 'Niger' },
  { code: 'GN', name: 'Guinée' },
  { code: 'BJ', name: 'Bénin' },
  { code: 'TG', name: 'Togo' },
  { code: 'GA', name: 'Gabon' },
  { code: 'MG', name: 'Madagascar' },
  { code: 'MU', name: 'Maurice' },
  { code: 'HT', name: 'Haïti' },
  { code: 'LB', name: 'Liban' },
  { code: 'DE', name: 'Allemagne' },
  { code: 'AT', name: 'Autriche' },
  { code: 'ES', name: 'Espagne' },
  { code: 'IT', name: 'Italie' },
  { code: 'PT', name: 'Portugal' },
  { code: 'NL', name: 'Pays-Bas' },
  { code: 'GB', name: 'Royaume-Uni' },
  { code: 'IE', name: 'Irlande' },
  { code: 'DK', name: 'Danemark' },
  { code: 'SE', name: 'Suède' },
  { code: 'NO', name: 'Norvège' },
  { code: 'FI', name: 'Finlande' },
  { code: 'PL', name: 'Pologne' },
  { code: 'CZ', name: 'Tchéquie' },
  { code: 'RO', name: 'Roumanie' },
  { code: 'GR', name: 'Grèce' },
  { code: 'TR', name: 'Turquie' },
  { code: 'UA', name: 'Ukraine' },
  { code: 'US', name: 'États-Unis' },
  { code: 'MX', name: 'Mexique' },
  { code: 'BR', name: 'Brésil' },
  { code: 'AR', name: 'Argentine' },
  { code: 'CL', name: 'Chili' },
  { code: 'CO', name: 'Colombie' },
  { code: 'EG', name: 'Égypte' },
  { code: 'ZA', name: 'Afrique du Sud' },
  { code: 'NG', name: 'Nigeria' },
  { code: 'IN', name: 'Inde' },
  { code: 'CN', name: 'Chine' },
  { code: 'JP', name: 'Japon' },
  { code: 'KR', name: 'Corée du Sud' },
  { code: 'VN', name: 'Viêt Nam' },
  { code: 'AU', name: 'Australie' },
  { code: 'NZ', name: 'Nouvelle-Zélande' },
].sort((a, b) => a.name.localeCompare(b.name, 'fr'));

export function isCountryCode(code: unknown): code is string {
  return typeof code === 'string' && COUNTRIES.some((c) => c.code === code);
}

export function countryName(code: string | null | undefined): string | null {
  return COUNTRIES.find((c) => c.code === code)?.name ?? null;
}

/** Drapeau emoji à partir du code (lettres « indicateur régional »). */
export function countryFlag(code: string): string {
  return String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}
