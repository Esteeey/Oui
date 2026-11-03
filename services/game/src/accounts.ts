import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto';

import type { Database } from './db/database';
import { emailHash } from './moderation';
import type { RateLimiter } from './rate-limit';
import { SocialError } from './social';

/** Envoi des e-mails : un service réel (Resend) en production, la console en développement, la mémoire en test. */
export interface EmailSender {
  readonly name: string;
  send(to: string, subject: string, text: string): Promise<void>;
}

/** Développement : le code s'affiche dans le terminal du serveur. */
export class ConsoleEmailSender implements EmailSender {
  readonly name = 'console';
  async send(to: string, subject: string, text: string) {
    console.log(`\n--- E-mail pour ${to} : ${subject}\n${text}\n---\n`);
  }
}

export class MemoryEmailSender implements EmailSender {
  readonly name = 'memory';
  readonly sent: { to: string; subject: string; text: string }[] = [];
  async send(to: string, subject: string, text: string) {
    this.sent.push({ to, subject, text });
  }
}

/** Resend (RESEND_API_KEY, MAIL_FROM). */
export class ResendEmailSender implements EmailSender {
  readonly name = 'resend';
  constructor(
    private readonly key: string,
    private readonly from: string,
  ) {}
  async send(to: string, subject: string, text: string) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${this.key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: this.from, to: [to], subject, text }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new SocialError(502, 'email_failed');
  }
}

export function emailSenderFromEnv(env = process.env): EmailSender {
  if (env.RESEND_API_KEY) return new ResendEmailSender(env.RESEND_API_KEY, env.MAIL_FROM ?? 'Qu1z <no-reply@qu1z.app>');
  return new ConsoleEmailSender();
}

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;
const CODE_TTL_MS = 15 * 60_000;
const MAX_ATTEMPTS = 5;
const hashCode = (code: string) => createHash('sha256').update(code).digest('hex');
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export interface AccountView {
  email: string | null;
  emailVerified: boolean;
  /** La messagerie, les publications et les groupes exigent un e-mail vérifié (si activé). */
  emailRequired: boolean;
}

/**
 * Comptes e-mail : connexion sans mot de passe par code à 6 chiffres (ou lien magique qui le contient).
 * Une adresse inconnue est ajoutée au compte courant ; une adresse déjà vérifiée connecte à ce compte
 * (nouvel appareil). Une adresse bannie est refusée.
 */
export class Accounts {
  constructor(
    private readonly db: Database,
    private readonly limiter: RateLimiter,
    private readonly mailer: EmailSender,
    readonly emailRequired: boolean,
    /** Adresse de l'application pour le lien magique (ex. https://qu1z.app ou qu1z://). */
    private readonly appUrl = process.env.QU1Z_APP_URL ?? 'qu1z://',
  ) {}

  async account(userId: string): Promise<AccountView> {
    const [u] = await this.db.query<{ email: string | null; email_verified_at: Date | null }>('SELECT email, email_verified_at FROM users WHERE id = $1', [
      userId,
    ]);
    return { email: u?.email ?? null, emailVerified: !!u?.email_verified_at, emailRequired: this.emailRequired };
  }

  async hasVerifiedEmail(userId: string): Promise<boolean> {
    const [u] = await this.db.query<{ ok: boolean }>('SELECT email_verified_at IS NOT NULL AS ok FROM users WHERE id = $1', [userId]);
    return !!u?.ok;
  }

  /** Étape 1 : envoie un code à l'adresse. La réponse ne révèle pas si l'adresse a déjà un compte. */
  async start(requester: string, rawEmail: unknown): Promise<{ sent: true }> {
    const email = String(rawEmail ?? '').trim().toLowerCase();
    if (!EMAIL.test(email) || email.length > 254) throw new SocialError(400, 'invalid_email');
    if (!this.limiter.allow('emailCode', requester) || !this.limiter.allow('emailCodeTo', email)) throw new SocialError(429, 'rate_limited');
    if ((await this.db.query('SELECT 1 FROM banned_emails WHERE email_hash = $1', [emailHash(email)])).length) {
      throw new SocialError(403, 'email_banned');
    }
    const [owner] = await this.db.query<{ id: string }>('SELECT id FROM users WHERE lower(email) = $1 AND email_verified_at IS NOT NULL', [email]);
    if (owner?.id === requester) throw new SocialError(409, 'already_verified');
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.db.query(
      `INSERT INTO email_codes (id, requester_id, email, code_hash, purpose, target_user_id, expires_at) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [randomUUID(), requester, email, hashCode(code), owner ? 'login' : 'link', owner?.id ?? null, new Date(Date.now() + CODE_TTL_MS)],
    );
    const link = `${this.appUrl.replace(/\/$/, '')}/account?email=${encodeURIComponent(email)}&code=${code}`;
    const text = owner
      ? `Voici ton code pour te connecter à Qu1z : ${code}\n\nOu ouvre ce lien sur ton appareil : ${link}\n\nIl est valable 15 minutes. Si tu n’as rien demandé, ignore cet e-mail.`
      : `Voici ton code pour confirmer ton adresse sur Qu1z : ${code}\n\nOu ouvre ce lien sur ton appareil : ${link}\n\nIl est valable 15 minutes. Si tu n’as rien demandé, ignore cet e-mail.`;
    await this.mailer.send(email, owner ? 'Ton code de connexion Qu1z' : 'Confirme ton adresse e-mail Qu1z', text);
    return { sent: true };
  }

  /**
   * Étape 2 : vérifie le code. `link` : l'adresse est ajoutée au compte courant.
   * `login` : un nouveau jeton de session est créé pour le compte qui possède l'adresse.
   */
  async verify(requester: string, rawEmail: unknown, rawCode: unknown): Promise<{ result: 'linked' } | { result: 'login'; token: string; userId: string }> {
    const email = String(rawEmail ?? '').trim().toLowerCase();
    const code = String(rawCode ?? '').trim();
    if (!/^\d{6}$/.test(code)) throw new SocialError(400, 'invalid_code');
    const [row] = await this.db.query<{ id: string; code_hash: string; purpose: 'link' | 'login'; target_user_id: string | null; attempts: number }>(
      `SELECT id, code_hash, purpose, target_user_id, attempts FROM email_codes
       WHERE requester_id = $1 AND email = $2 AND used_at IS NULL AND expires_at > now()
       ORDER BY created_at DESC LIMIT 1`,
      [requester, email],
    );
    if (!row || row.attempts >= MAX_ATTEMPTS) throw new SocialError(400, 'invalid_code');
    if (row.code_hash !== hashCode(code)) {
      // Compté hors transaction : un essai raté n'est jamais annulé.
      await this.db.query('UPDATE email_codes SET attempts = attempts + 1 WHERE id = $1', [row.id]);
      throw new SocialError(400, 'invalid_code');
    }
    return this.db.transaction(async (tx) => {
      // Usage unique, même en cas de double envoi simultané.
      const used = await tx.query('UPDATE email_codes SET used_at = now() WHERE id = $1 AND used_at IS NULL AND attempts < $2 RETURNING id', [
        row.id,
        MAX_ATTEMPTS,
      ]);
      if (!used.length) throw new SocialError(400, 'invalid_code');
      if ((await tx.query('SELECT 1 FROM banned_emails WHERE email_hash = $1', [emailHash(email)])).length) throw new SocialError(403, 'email_banned');
      if (row.purpose === 'login' && row.target_user_id) {
        const [target] = await tx.query<{ status: string }>('SELECT status FROM users WHERE id = $1', [row.target_user_id]);
        if (!target) throw new SocialError(400, 'invalid_code');
        if (target.status === 'banned') throw new SocialError(403, 'banned');
        const token = randomBytes(32).toString('hex');
        await tx.query('INSERT INTO sessions (token_hash, user_id) VALUES ($1, $2)', [hashToken(token), row.target_user_id]);
        return { result: 'login' as const, token, userId: row.target_user_id };
      }
      // L'adresse a pu être vérifiée par un autre compte entre-temps.
      const taken = await tx.query('SELECT 1 FROM users WHERE lower(email) = $1 AND email_verified_at IS NOT NULL AND id <> $2', [email, requester]);
      if (taken.length) throw new SocialError(409, 'email_taken');
      await tx.query('UPDATE users SET email = NULL WHERE lower(email) = $1 AND email_verified_at IS NULL AND id <> $2', [email, requester]);
      await tx.query('UPDATE users SET email = $2, email_verified_at = now() WHERE id = $1', [requester, email]);
      return { result: 'linked' as const };
    });
  }

  /** Déconnexion de cet appareil (le jeton est révoqué ; les jetons push de l'appareil aussi). */
  async logout(userId: string, token: string, pushToken?: string): Promise<void> {
    // Sans e-mail vérifié, se déconnecter ferait perdre le compte pour toujours.
    if (!(await this.hasVerifiedEmail(userId))) throw new SocialError(409, 'email_required_to_logout');
    const h = hashToken(token);
    await this.db.query('DELETE FROM sessions WHERE token_hash = $1', [h]);
    // Jeton d'origine du compte : remplacé par une valeur impossible à retrouver.
    await this.db.query('UPDATE users SET token_hash = $2 WHERE id = $1 AND token_hash = $3', [userId, hashToken(randomBytes(32).toString('hex')), h]);
    if (pushToken) await this.db.query('DELETE FROM push_tokens WHERE token = $1 AND user_id = $2', [pushToken, userId]);
  }
}
