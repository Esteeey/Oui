import type { UserSummary } from './social';

/** Signalements, sanctions, appels et journal de modération. */

export type ReportTargetType = 'message' | 'media' | 'user' | 'group' | 'post' | 'comment';
export type ReportReason = 'spam' | 'harassment' | 'hate' | 'sexual' | 'violence' | 'cheating' | 'impersonation' | 'other';
export type ReportStatus = 'open' | 'in_review' | 'closed';

export const REPORT_REASONS: { id: ReportReason; label: string }[] = [
  { id: 'spam', label: 'Spam ou publicité' },
  { id: 'harassment', label: 'Harcèlement ou intimidation' },
  { id: 'hate', label: 'Propos haineux' },
  { id: 'sexual', label: 'Contenu sexuel' },
  { id: 'violence', label: 'Violence ou menaces' },
  { id: 'cheating', label: 'Triche' },
  { id: 'impersonation', label: 'Usurpation d’identité' },
  { id: 'other', label: 'Autre' },
];
export const MAX_REPORT_DETAILS = 500;

/** Signalement d'une question du jeu (erreur de contenu), distinct de la modération des joueurs. */
export type QuestionReportReason = 'wrong_answer' | 'several_answers' | 'wording' | 'outdated' | 'other';
export const QUESTION_REPORT_REASONS: { id: QuestionReportReason; label: string }[] = [
  { id: 'wrong_answer', label: 'La bonne réponse est fausse' },
  { id: 'several_answers', label: 'Plusieurs réponses sont possibles' },
  { id: 'wording', label: 'Faute ou question mal formulée' },
  { id: 'outdated', label: 'La question n’est plus à jour' },
  { id: 'other', label: 'Autre' },
];
export const MAX_QUESTION_REPORT_DETAILS = 300;

/** Question signalée, vue par un administrateur : tous les signalements ouverts regroupés. */
export interface QuestionReportView {
  questionId: string;
  themeId: string;
  text: string;
  answer: string;
  count: number;
  reasons: { id: string; count: number }[];
  details: string[];
  lastAt: number;
}

export const reasonLabel = (r: string) => REPORT_REASONS.find((x) => x.id === r)?.label ?? r;

export type SanctionLevel = 'warning' | 'suspension' | 'ban';
/** Ce qu'une suspension peut restreindre (choisi par l'équipe de modération). */
export type Restriction = 'messages' | 'posts' | 'interactions';
export const RESTRICTIONS: { id: Restriction; label: string }[] = [
  { id: 'messages', label: 'Messages privés et groupes' },
  { id: 'posts', label: 'Publications et commentaires' },
  { id: 'interactions', label: 'Abonnements, likes, défis et invitations' },
];
export const SANCTION_LABEL: Record<SanctionLevel, string> = {
  warning: 'Avertissement',
  suspension: 'Suspension temporaire',
  ban: 'Bannissement définitif',
};

export type AppealStatus = 'pending' | 'in_review' | 'accepted' | 'rejected';
export const APPEAL_STATUS_LABEL: Record<AppealStatus, string> = {
  pending: 'En attente',
  in_review: 'En cours d’examen',
  accepted: 'Accepté',
  rejected: 'Refusé',
};

export interface AppealView {
  id: string;
  status: AppealStatus;
  text: string;
  evidence: string | null;
  decisionText: string | null;
  createdAt: number;
  decidedAt: number | null;
}

/** Une sanction telle que la voit le joueur concerné. */
export interface SanctionView {
  id: string;
  level: SanctionLevel;
  reason: string;
  restrictions: Restriction[];
  startsAt: number;
  endsAt: number | null;
  /** En vigueur (non levée, non expirée). */
  active: boolean;
  revokedAt: number | null;
  appeal: AppealView | null;
}

/** Signalement vu par l'équipe de modération. */
export interface ReportSummary {
  id: string;
  targetType: ReportTargetType;
  targetId: string;
  reason: ReportReason;
  status: ReportStatus;
  priority: boolean;
  createdAt: number;
  reporter: UserSummary;
  targetUser: UserSummary | null;
  /** Aperçu court du contenu signalé. */
  preview: string;
}

export interface ReportDetail extends ReportSummary {
  details: string | null;
  conversationId: string | null;
  /** Contenu et contexte figés au moment du signalement. */
  snapshot: Record<string, unknown>;
  resolution: string | null;
  handledBy: UserSummary | null;
  /** Historique des sanctions du joueur visé. */
  targetSanctions: (SanctionView & { createdBy: string })[];
  /** Signalements déjà déposés contre ce joueur, et par ce signalant (repère d'abus). */
  targetReportCount: number;
  reporterReportCount: number;
  /** Comptes vus sur le même réseau que le joueur visé (indice seulement, jamais de bannissement automatique). */
  linkedAccounts: { user: UserSummary; status: string }[];
}

export interface AppealSummary {
  id: string;
  status: AppealStatus;
  createdAt: number;
  user: UserSummary;
  sanction: SanctionView;
  text: string;
  evidence: string | null;
  decisionText: string | null;
}

export interface ModerationLogEntry {
  id: string;
  actor: UserSummary | null;
  actorRole: 'moderator' | 'admin' | 'group_admin' | 'group_creator';
  action: string;
  targetType: string;
  targetId: string | null;
  details: Record<string, unknown>;
  createdAt: number;
}
