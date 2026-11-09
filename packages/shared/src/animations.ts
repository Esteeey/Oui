/**
 * Animations réglables depuis le panneau d'administration.
 * L'appli garde ces valeurs par défaut tant qu'aucun réglage n'est enregistré, ou si le serveur ne répond pas.
 */
export interface DuelInviteAnimation {
  /** Désactivée : l'invitation apparaît en simple fondu. */
  enabled: boolean;
  veilMs: number;
  tearMs: number;
  cardMs: number;
  contentMs: number;
  /** Flou de l'écran, en pixels. */
  blur: number;
  /** Assombrissement de l'écran, en %. */
  veil: number;
  /** Soulèvement de la barre du bas, en pixels. */
  navLift: number;
  /** Relief du tracé de la déchirure, en %. */
  irregularity: number;
  /** Ouverture au-delà du strict nécessaire pour la carte (100 = juste autour). */
  opening: number;
  /** Épaisseur de la matière déchirée, en %. */
  paperWidth: number;
  /** Nombre d'éclats de papier. */
  shards: number;
  /** Rebond de la carte, en %. */
  bounce: number;
  /** Flash à l'arrivée de la carte, en %. */
  flash: number;
  /** Lueur des bords, en %. */
  glow: number;
  backdropStart: string;
  backdropMiddle: string;
  backdropEnd: string;
  edgeTop: string;
  edgeBottom: string;
  paper: string;
}

export type DuelInviteNumberKey = {
  [K in keyof DuelInviteAnimation]: DuelInviteAnimation[K] extends number ? K : never;
}[keyof DuelInviteAnimation];
export type DuelInviteColorKey = {
  [K in keyof DuelInviteAnimation]: DuelInviteAnimation[K] extends string ? K : never;
}[keyof DuelInviteAnimation];

export const DUEL_INVITE_DEFAULTS: DuelInviteAnimation = {
  enabled: true,
  veilMs: 150,
  tearMs: 300,
  cardMs: 250,
  contentMs: 300,
  blur: 10,
  veil: 66,
  navLift: 11,
  irregularity: 100,
  opening: 100,
  paperWidth: 100,
  shards: 12,
  bounce: 100,
  flash: 45,
  glow: 20,
  backdropStart: '#4A1FB8',
  backdropMiddle: '#7B2FFF',
  backdropEnd: '#C81FB0',
  edgeTop: '#FF007A',
  edgeBottom: '#7B2FFF',
  paper: '#FFFFFF',
};

export const DUEL_INVITE_NUMBERS: { key: DuelInviteNumberKey; group: 'Durées' | 'Écran' | 'Déchirure' | 'Carte'; label: string; min: number; max: number; step: number; unit: string }[] = [
  { key: 'veilMs', group: 'Durées', label: 'Voile', min: 0, max: 1000, step: 25, unit: ' ms' },
  { key: 'tearMs', group: 'Durées', label: 'Déchirure', min: 100, max: 2000, step: 25, unit: ' ms' },
  { key: 'cardMs', group: 'Durées', label: 'Arrivée de la carte', min: 50, max: 1500, step: 25, unit: ' ms' },
  { key: 'contentMs', group: 'Durées', label: 'Apparition du contenu', min: 50, max: 1500, step: 25, unit: ' ms' },
  { key: 'blur', group: 'Écran', label: 'Flou', min: 0, max: 20, step: 1, unit: ' px' },
  { key: 'veil', group: 'Écran', label: 'Assombrissement', min: 0, max: 90, step: 2, unit: ' %' },
  { key: 'navLift', group: 'Écran', label: 'Soulèvement de la barre', min: 0, max: 30, step: 1, unit: ' px' },
  { key: 'irregularity', group: 'Déchirure', label: 'Relief du tracé', min: 0, max: 200, step: 10, unit: ' %' },
  { key: 'opening', group: 'Déchirure', label: 'Ouverture', min: 100, max: 140, step: 5, unit: ' %' },
  { key: 'paperWidth', group: 'Déchirure', label: 'Épaisseur du papier', min: 0, max: 250, step: 10, unit: ' %' },
  { key: 'shards', group: 'Déchirure', label: 'Éclats de papier', min: 0, max: 24, step: 1, unit: '' },
  { key: 'glow', group: 'Déchirure', label: 'Lueur des bords', min: 0, max: 80, step: 5, unit: ' %' },
  { key: 'bounce', group: 'Carte', label: 'Rebond', min: 0, max: 250, step: 10, unit: ' %' },
  { key: 'flash', group: 'Carte', label: 'Flash', min: 0, max: 100, step: 5, unit: ' %' },
];

export const DUEL_INVITE_COLORS: { key: DuelInviteColorKey; label: string }[] = [
  { key: 'backdropStart', label: 'Fond, début' },
  { key: 'backdropMiddle', label: 'Fond, milieu' },
  { key: 'backdropEnd', label: 'Fond, fin' },
  { key: 'edgeTop', label: 'Bord du haut' },
  { key: 'edgeBottom', label: 'Bord du bas' },
  { key: 'paper', label: 'Papier déchiré' },
];

export const isHexColor = (value: unknown): value is string => typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);

/** Réglages utilisables quoi qu'il arrive : bornés, arrondis au pas, et valeur par défaut pour ce qui manque. */
export function normalizeDuelInviteAnimation(raw: unknown): DuelInviteAnimation {
  const input = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out: DuelInviteAnimation = { ...DUEL_INVITE_DEFAULTS, enabled: input.enabled === undefined ? true : input.enabled === true };
  for (const field of DUEL_INVITE_NUMBERS) {
    const value = input[field.key];
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    out[field.key] = Math.min(field.max, Math.max(field.min, Math.round(value / field.step) * field.step));
  }
  for (const field of DUEL_INVITE_COLORS) {
    const value = input[field.key];
    if (isHexColor(value)) out[field.key] = value.toUpperCase();
  }
  return out;
}
