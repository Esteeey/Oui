import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { CATEGORIES, RULES, registerTheme, registerThemeQuestions, type CategoryId, type Question, type Theme } from '@qu1z/shared';
import type { Database } from './db/database';
import type { MediaStore } from './media';
import { SocialError } from './social';

type QuestionInput = { text: string; choices: [string, string, string, string]; difficulty: number };
type Row = { id: string; category_id: CategoryId; name: string; description: string; questions: QuestionInput[]; icon_key: string | null; cover_key: string | null; published: boolean };
type AssetKind = 'icon' | 'cover';
const slug = (id: string) => 'custom-' + id;
const imageKey = (id: string, kind: AssetKind) => 'theme' + (kind === 'icon' ? 'icons' : 'covers') + '/' + id.replaceAll('-', '') + '.webp';

export class ThemeCatalog {
  constructor(private readonly db: Database, private readonly store: MediaStore) {}
  private async requireAdmin(userId: string) {
    const [user] = await this.db.query<{ role: string }>('SELECT role FROM users WHERE id = $1', [userId]);
    if (user?.role !== 'admin') throw new SocialError(403, 'forbidden');
  }
  private theme(row: Row): Theme {
    return { id: slug(row.id), categoryId: row.category_id, name: row.name, description: row.description,
      iconUrl: row.icon_key ? this.store.url(row.icon_key) : null, coverUrl: row.cover_key ? this.store.url(row.cover_key) : null,
      questionCount: row.questions.length };
  }
  private questions(row: Row): Question[] {
    return row.questions.map((question, index) => ({ id: slug(row.id) + '-' + String(index + 1).padStart(3, '0'),
      themeId: slug(row.id), text: question.text, choices: question.choices, difficulty: question.difficulty as 1 | 2 | 3 }));
  }
  async load(): Promise<void> {
    const rows = await this.db.query<Row>('SELECT * FROM custom_themes WHERE published = true ORDER BY created_at');
    for (const row of rows) { registerTheme(this.theme(row)); registerThemeQuestions(slug(row.id), this.questions(row)); }
  }
  async list(): Promise<Theme[]> {
    const rows = await this.db.query<Row>('SELECT * FROM custom_themes WHERE published = true ORDER BY created_at');
    return rows.map((row) => this.theme(row));
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
      if (!text || text.length > 240 || choices.length !== 4 || choices.some((choice) => !choice || choice.length > 120) ||
        new Set(choices.map((choice) => choice.toLocaleLowerCase())).size !== 4 || ![1, 2, 3].includes(difficulty)) throw new SocialError(400, 'invalid_questions');
      return { text, choices: choices as QuestionInput['choices'], difficulty };
    });
    const id = randomUUID();
    await this.db.query('INSERT INTO custom_themes (id, category_id, name, description, questions, created_by) VALUES ($1, $2, $3, $4, $5, $6)',
      [id, categoryId, name, description, JSON.stringify(questions), admin]);
    return { id: slug(id) };
  }
  async setAsset(admin: string, themeId: string, kind: AssetKind, data: Buffer): Promise<void> {
    await this.requireAdmin(admin);
    const id = this.uuid(themeId);
    if (!data.length || data.length > 8 * 1024 * 1024) throw new SocialError(413, 'too_large');
    let normalized: Buffer;
    try { normalized = await sharp(data, { limitInputPixels: 40_000_000 }).rotate().resize(kind === 'icon' ? 512 : { width: 1500, height: 700, fit: 'cover' }).webp({ quality: 82 }).toBuffer(); }
    catch { throw new SocialError(415, 'unsupported_format'); }
    const key = imageKey(id, kind);
    await this.store.put(key, normalized, 'image/webp');
    await this.db.query('UPDATE custom_themes SET ' + (kind === 'icon' ? 'icon_key' : 'cover_key') + ' = $2 WHERE id = $1', [id, key]);
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
