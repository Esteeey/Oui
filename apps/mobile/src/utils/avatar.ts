const PALETTE = ['#FF8FB1', '#7AB8FF', '#B68CFF', '#FFB547', '#5FE3D0', '#9BE15D', '#FF7A59', '#E7C26B', '#4FD1C5', '#FF5C7A'];

/** Couleur d'avatar stable pour un joueur (en attendant les photos de profil). */
export function avatarColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
