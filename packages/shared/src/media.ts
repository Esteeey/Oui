/** Médias : photos (messages, publications, photo de profil et de couverture), GIF d'un fournisseur externe, stickers originaux. */

/** Taille maximale d'un fichier envoyé. */
export const MEDIA_MAX_BYTES = 8 * 1024 * 1024;
/** Formats acceptés (vérifiés sur le contenu du fichier, pas sur l'extension). */
export const MEDIA_FORMATS = ['jpeg', 'png', 'webp', 'gif'] as const;
export type MediaPurpose = 'message' | 'post' | 'avatar' | 'group' | 'cover';

/** Image hébergée par Qu1z (déjà validée, nettoyée de ses métadonnées et redimensionnée). */
export interface MediaView {
  id: string;
  /** Chemin `/media/…` (relatif au serveur) ou URL absolue du stockage objet. */
  url: string;
  width: number;
  height: number;
  animated: boolean;
}

/** GIF du catalogue externe (GIPHY ou Tenor). */
export interface GifView {
  id: string;
  /** Version affichée dans la conversation. */
  url: string;
  /** Version légère pour la grille de sélection. */
  previewUrl: string;
  width: number;
  height: number;
  title: string;
}

/** Contenu visuel joint à un message ou à une publication. */
export type Attachment =
  | { kind: 'image'; media: MediaView }
  | { kind: 'gif'; gif: Pick<GifView, 'id' | 'url' | 'width' | 'height'> }
  | { kind: 'sticker'; stickerId: StickerId };

/** Pack de stickers originaux de Qu1z (dessinés dans l'application, aucun fournisseur externe). */
export const STICKERS = [
  { id: 'gg', label: 'GG' },
  { id: 'bravo', label: 'Bravo' },
  { id: 'revanche', label: 'Revanche ?' },
  { id: 'oups', label: 'Oups' },
  { id: 'en-feu', label: 'En feu' },
  { id: 'reflexion', label: 'Je réfléchis' },
  { id: 'mdr', label: 'MDR' },
  { id: 'champion', label: 'Champion' },
  { id: 'chrono', label: 'Vite !' },
  { id: 'coeur', label: 'Merci' },
  { id: 'salut', label: 'Salut' },
  { id: 'genie', label: 'Génie' },
] as const;
export type StickerId = (typeof STICKERS)[number]['id'];

export function isSticker(id: unknown): id is StickerId {
  return typeof id === 'string' && STICKERS.some((s) => s.id === id);
}

/** Libellé court d'un message non textuel (boîte de réception, aperçu de réponse). */
export function attachmentLabel(kind: string): string {
  switch (kind) {
    case 'image':
      return '📷 Photo';
    case 'gif':
      return 'GIF';
    case 'sticker':
      return 'Sticker';
    default:
      return '';
  }
}
