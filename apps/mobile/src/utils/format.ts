/** Nombre au format français (espaces des milliers ordinaires, pour un rendu identique partout). */
export function formatCount(n: number): string {
  return n.toLocaleString('fr-FR').replace(/ | /g, ' ');
}
