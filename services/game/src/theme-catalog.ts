import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { CATEGORIES, QUESTIONS, RULES, THEMES, registerTheme, registerThemeQuestions, type CategoryId, type Question, type Theme } from '@qu1z/shared';
import type { Database } from './db/database';
import type { MediaStore } from './media';
import { SocialError } from './social';

type QuestionInput = { text: string; choices: [string, string, string, string]; difficulty: number };
type Row = { id: string; category_id: CategoryId; name: string; description: string; questions: QuestionInput[]; icon_key: string | null; cover_key: string | null; published: boolean; titles: Theme['titles'] };
type AssetKind = 'icon' | 'cover';
const slug = (id: string) => 'custom-' + id;
const imageKey = (kind: AssetKind) => 'theme' + (kind === 'icon' ? 'icons' : 'covers') + '/' + randomUUID().replaceAll('-', '') + '.webp';

export class ThemeCatalog {
  constructor(private readonly db: Database, private readonly store: MediaStore) {}
  private async requireAdmin(userId: string) {
    const [user] = await this.db.query<{ role: string }>('SELECT role FROM users WHERE id = $1', [userId]);
    if (user?.role !== 'admin') throw new SocialError(403, 'forbidden');
  }
  private theme(row: Row): Theme {
    return { id: slug(row.id), categoryId: row.category_id, name: row.name, description: row.description,
      iconUrl: row.icon_key ? this.store.url(row.icon_key) : null, coverUrl: row.cover_key ? this.store.url(row.cover_key) : null,
      questionCount: row.questions.length, titles: row.titles };
  }
  private questions(row: Row): Question[] {
    return row.questions.map((question, index) => ({ id: slug(row.id) + '-' + String(index + 1).padStart(3, '0'),
      themeId: slug(row.id), text: question.text, choices: question.choices, difficulty: question.difficulty as 1 | 2 | 3 }));
  }
  async load(): Promise<void> {
    const rows = await this.db.query<Row>('SELECT * FROM custom_themes WHERE published = true ORDER BY created_at');
    for (const row of rows) { registerTheme(this.theme(row)); registerThemeQuestions(slug(row.id), this.questions(row)); }
    const overrides = await this.db.query<{ theme_id: string; icon_key: string | null; cover_key: string | null }>('SELECT theme_id, icon_key, cover_key FROM theme_asset_overrides');
    for (const override of overrides) {
      const base = THEMES.find((theme) => theme.id === override.theme_id && !theme.id.startsWith('custom-'));
      if (base) registerTheme({ ...base, iconUrl: override.icon_key ? this.store.url(override.icon_key) : base.iconUrl, coverUrl: override.cover_key ? this.store.url(override.cover_key) : base.coverUrl });
    }
    const imported = await this.db.query<{ theme_id: string }>('SELECT DISTINCT theme_id FROM imported_questions');
    for (const { theme_id } of imported) await this.refreshImported(theme_id);
  }
  /** Ajoute (ou retire) les questions importées d'un thème à sa banque en mémoire. */
  private async refreshImported(themeId: string): Promise<number> {
    const rows = await this.db.query<{ id: string; text: string; choices: string[]; difficulty: number }>(
      'SELECT id, text, choices, difficulty FROM imported_questions WHERE theme_id = $1 ORDER BY created_at, id', [themeId]);
    const base = QUESTIONS.filter((q) => q.themeId === themeId && !q.id.startsWith('imp-'));
    const extra: Question[] = rows.map((row) => ({ id: row.id, themeId, text: row.text, choices: row.choices as Question['choices'], difficulty: row.difficulty as 1 | 2 | 3 }));
    registerThemeQuestions(themeId, [...base, ...extra]);
    const theme = THEMES.find((t) => t.id === themeId);
    if (theme) registerTheme({ ...theme, questionCount: base.length + extra.length });
    return base.length + extra.length;
  }
  /**
   * Import CSV (déjà découpé par l'appli) : `choices[0]` est la bonne réponse.
   * `dryRun` ne fait que l'analyse, pour l'aperçu.
   */
  async importQuestions(admin: string, themeId: string, input: Record<string, unknown>) {
    await this.requireAdmin(admin);
    if (!THEMES.some((t) => t.id === themeId)) throw new SocialError(404, 'not_found');
    const raw = Array.isArray(input.questions) ? input.questions : [];
    if (!raw.length || raw.length > 1000) throw new SocialError(400, 'invalid_questions');
    const norm = (text: string) => text.toLocaleLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[^a-z0-9]+/g, ' ').trim();
    const seen = new Set(QUESTIONS.filter((q) => q.themeId === themeId).map((q) => norm(q.text)));
    const valid: QuestionInput[] = [], invalid: { line: number; reason: string }[] = [];
    let duplicates = 0;
    raw.forEach((item, index) => {
      const q = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
      const line = Number(q.line ?? index + 1), text = String(q.text ?? '').trim();
      const choices = Array.isArray(q.choices) ? q.choices.map((c) => String(c).trim()) : [];
      const difficulty = [1, 2, 3].includes(Number(q.difficulty)) ? Number(q.difficulty) : 2;
      let reason = '';
      if (!text) reason = 'question vide';
      else if (text.length > RULES.maxQuestionLength) reason = `question trop longue (${text.length}/${RULES.maxQuestionLength})`;
      else if (choices.length !== 4 || choices.some((c) => !c)) reason = 'il faut 4 réponses';
      else if (choices.some((c) => c.length > 120)) reason = 'réponse trop longue';
      else if (new Set(choices.map((c) => c.toLocaleLowerCase())).size !== 4) reason = 'deux réponses identiques';
      if (reason) return void invalid.push({ line, reason });
      if (seen.has(norm(text))) return void duplicates++;
      seen.add(norm(text));
      valid.push({ text, choices: choices as QuestionInput['choices'], difficulty });
    });
    if (input.dryRun) return { added: 0, valid: valid.length, duplicates, invalid, total: null };
    for (const q of valid) {
      await this.db.query('INSERT INTO imported_questions (id, theme_id, text, choices, difficulty, created_by) VALUES ($1, $2, $3, $4, $5, $6)',
        ['imp-' + randomUUID(), themeId, q.text, JSON.stringify(q.choices), q.difficulty, admin]);
    }
    const total = await this.refreshImported(themeId);
    return { added: valid.length, valid: valid.length, duplicates, invalid, total };
  }
  async list(): Promise<Theme[]> {
    const rows = await this.db.query<Row>('SELECT * FROM custom_themes WHERE published = true ORDER BY created_at');
    const custom = rows.map((row) => this.theme(row));
    const overrides = await this.db.query<{ theme_id: string; icon_key: string | null; cover_key: string | null }>('SELECT theme_id, icon_key, cover_key FROM theme_asset_overrides');
    const builtIn = overrides.flatMap((override) => {
      const base = THEMES.find((theme) => theme.id === override.theme_id && !theme.id.startsWith('custom-'));
      return base ? [{ ...base, iconUrl: override.icon_key ? this.store.url(override.icon_key) : base.iconUrl, coverUrl: override.cover_key ? this.store.url(override.cover_key) : base.coverUrl }] : [];
    });
    return [...custom, ...builtIn];
  }
  async create(admin: string, input: Record<string, unknown>): Promise<{ id: string }> {
    await this.requireAdmin(admin);
    const categoryId = String(input.categoryId ?? ''), name = String(input.name ?? '').trim(), description = String(input.description ?? '').trim();
    const rawQuestions = Array.isArray(input.questions) ? input.questions : [];
    if (!CATEGORIES.some((category) => category.id === categoryId)) throw new SocialError(400, 'invalid_category');
    if (!name || name.length > 60 || !description || description.length > 180) throw new SocialError(400, 'invalid_theme');
    if (rawQuestions.length < RULES.questionsPerDuel || rawQuestions.length > 100) throw new SocialError(400, 'invalid_questions');
    const questions = rawQuestions.map((raw): QuestionInput => {
      if (!raw || typeof raw !== 'object') throw new SocialError(400, 'invalid_questions');
      const q = raw as Record<string, unknown>, text = String(q.text ?? '').trim();
      const choices = Array.isArray(q.choices) ? q.choices.map((choice) => String(choice).trim()) : [];
      const difficulty = Number(q.difficulty ?? 1);
      if (!text || text.length > RULES.maxQuestionLength || choices.length !== 4 || choices.some((choice) => !choice || choice.length > 120) ||
        new Set(choices.map((choice) => choice.toLocaleLowerCase())).size !== 4 || ![1, 2, 3].includes(difficulty)) throw new SocialError(400, 'invalid_questions');
      return { text, choices: choices as QuestionInput['choices'], difficulty };
    });
    // Les 5 titres sont facultatifs : sans eux, le thème utilise la liste générique.
    const titles = Array.isArray(input.titles) ? input.titles.map((title) => String(title).trim()) : [];
    if (titles.some(Boolean) && (titles.length !== 5 || titles.some((title) => !title || title.length > 24) || new Set(titles).size !== 5)) throw new SocialError(400, 'invalid_titles');
    const id = randomUUID();
    await this.db.query('INSERT INTO custom_themes (id, category_id, name, description, questions, created_by, titles) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [id, categoryId, name, description, JSON.stringify(questions), admin, titles.some(Boolean) ? JSON.stringify(titles) : null]);
    return { id: slug(id) };
  }
  async setAsset(admin: string, themeId: string, kind: AssetKind, data: Buffer): Promise<void> {
    await this.requireAdmin(admin);
    const custom = themeId.startsWith('custom-');
    const id = custom ? this.uuid(themeId) : themeId;
    if (!custom && !THEMES.some((theme) => theme.id === themeId && !theme.id.startsWith('custom-'))) throw new SocialError(404, 'not_found');
    if (!data.length || data.length > 8 * 1024 * 1024) throw new SocialError(413, 'too_large');
    let normalized: Buffer;
    try { normalized = await sharp(data, { limitInputPixels: 40_000_000 }).rotate().resize(kind === 'icon' ? 512 : { width: 1500, height: 700, fit: 'cover' }).webp({ quality: 82 }).toBuffer(); }
    catch { throw new SocialError(415, 'unsupported_format'); }
    const key = imageKey(kind);
    await this.store.put(key, normalized, 'image/webp');
    if (custom) {
      await this.db.query('UPDATE custom_themes SET ' + (kind === 'icon' ? 'icon_key' : 'cover_key') + ' = $2 WHERE id = $1', [id, key]);
      return;
    }
    const [old] = await this.db.query<{ icon_key: string | null; cover_key: string | null }>('SELECT icon_key, cover_key FROM theme_asset_overrides WHERE theme_id = $1', [themeId]);
    const iconKey = kind === 'icon' ? key : old?.icon_key ?? null;
    const coverKey = kind === 'cover' ? key : old?.cover_key ?? null;
    await this.db.query(`INSERT INTO theme_asset_overrides (theme_id, icon_key, cover_key, updated_by) VALUES ($1, $2, $3, $4)
      ON CONFLICT (theme_id) DO UPDATE SET icon_key = EXCLUDED.icon_key, cover_key = EXCLUDED.cover_key, updated_by = EXCLUDED.updated_by, updated_at = now()`,
    [themeId, iconKey, coverKey, admin]);
  }
  async publish(admin: string, themeId: string): Promise<Theme> {
    await this.requireAdmin(admin);
    const id = this.uuid(themeId), [row] = await this.db.query<Row>('SELECT * FROM custom_themes WHERE id = $1', [id]);
    if (!row) throw new SocialError(404, 'not_found');
    if (!row.icon_key || !row.cover_key) throw new SocialError(400, 'missing_theme_images');
    await this.db.query('UPDATE custom_themes SET published = true WHERE id = $1', [id]);
    const theme = this.theme({ ...row, published: true });
    registerTheme(theme); registerThemeQuestions(theme.id, this.questions(row));
    return theme;
  }
  async file(themeId: string, kind: AssetKind) {
    const id = this.uuid(themeId), [row] = await this.db.query<Row>('SELECT * FROM custom_themes WHERE id = $1 AND published = true', [id]);
    const key = kind === 'icon' ? row?.icon_key : row?.cover_key;
    return key ? this.store.get(key) : null;
  }
  private uuid(themeId: string): string {
    const id = themeId.replace(/^custom-/, '');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new SocialError(404, 'not_found');
    return id;
  }
}
