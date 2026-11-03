import { getTheme } from './catalog';
import type { NotificationView } from './notifications';

const OUTCOME: Record<string, string> = { win: 'une victoire', loss: 'une défaite', draw: 'une égalité' };

/** Qui : « Thomas », « Thomas et Paul », « Thomas et 14 autres personnes ». */
function who(n: NotificationView): string {
  const [first, second] = n.actors;
  if (!first) return '';
  if (n.actorCount <= 1) return first.pseudo;
  if (n.actorCount === 2 && second) return `${first.pseudo} et ${second.pseudo}`;
  const others = n.actorCount - 1;
  return `${first.pseudo} et ${others} autre${others > 1 ? 's' : ''} personne${others > 1 ? 's' : ''}`;
}

/** Texte explicite d'une notification, en français. */
export function notificationText(n: NotificationView): string {
  const theme = typeof n.data.themeId === 'string' ? getTheme(n.data.themeId)?.name : undefined;
  const plural = n.actorCount > 1;
  switch (n.type) {
    case 'like':
      return `${who(n)} ${plural ? 'aiment' : 'aime'} ta publication`;
    case 'comment':
      return `${who(n)} ${plural ? 'ont commenté' : 'a commenté'} ta publication`;
    case 'reply':
      return `${who(n)} ${plural ? 'ont répondu' : 'a répondu'} à ton commentaire`;
    case 'mention':
      return `${who(n)} t’a mentionné`;
    case 'follow_request':
      return `${who(n)} souhaite s’abonner à toi`;
    case 'follow_accepted':
      return `${who(n)} a accepté ta demande d’abonnement`;
    case 'new_follower':
      return `${who(n)} s’est abonné à toi`;
    case 'friend_online':
      return `${who(n)} vient de se connecter`;
    case 'level_up':
      return `Bravo ! Tu passes au niveau ${n.data.level}`;
    case 'title_unlocked':
      return `Nouveau titre débloqué : « ${n.data.title} »`;
    case 'theme_level_up':
      return `Niveau ${n.data.level} atteint en ${theme ?? 'ce thème'}`;
    case 'challenge_received':
      return `${who(n)} te défie en ${theme ?? 'duel'}`;
    case 'rematch_request':
      return `${who(n)} te propose une revanche en ${theme ?? 'duel'}`;
    case 'challenge_accepted':
      return `${who(n)} a accepté ton défi en ${theme ?? 'duel'}`;
    case 'challenge_declined':
      return `${who(n)} a refusé ton défi en ${theme ?? 'duel'}`;
    case 'opponent_forfeit':
      return `${who(n)} a abandonné votre duel en ${theme ?? 'duel'} : victoire !`;
    case 'duel_finished':
      return `Ton duel en ${theme ?? 'duel'} s’est terminé pendant ton absence : ${OUTCOME[String(n.data.outcome)] ?? 'résultat disponible'}`;
    case 'rank_top100':
      return `Tu entres dans le Top 100 en ${theme} (${n.data.rank}e)`;
    case 'rank_top10':
      return `Tu entres dans le Top 10 en ${theme} (${n.data.rank}e)`;
    case 'rank_first':
      return `Tu es n°1 en ${theme} !`;
    case 'rank_lost_first':
      return `${who(n)} t’a pris la 1re place en ${theme}`;
    case 'rank_left_top10':
      return `Tu sors du Top 10 en ${theme} (${n.data.rank}e)`;
    case 'announcement':
      return `Annonce : ${n.data.title}`;
    case 'sanction':
      return n.data.level === 'warning'
        ? 'Tu as reçu un avertissement de l’équipe de modération'
        : 'Ton compte est suspendu temporairement par l’équipe de modération';
    case 'appeal_decision':
      return n.data.status === 'accepted' ? 'Ton appel a été accepté : la sanction est levée' : 'Ton appel a été examiné : la sanction est maintenue';
    case 'report_closed':
      return 'Ton signalement a été examiné par l’équipe de modération. Merci !';
  }
}
