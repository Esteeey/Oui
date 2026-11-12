import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { CATEGORIES, RULES, THEMES, registerTheme, type Theme } from '@qu1z/shared';

import { AdminScreen, Field, Hint, Pills, adminStyles, type Notice } from '@/components/admin-ui';
import { Tap } from '@/components/tap';
import { AppText, Button, Card } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { api, apiBase, ApiError, errorMessage, invalidateAll, TOKEN_KEY, useApi } from '@/net/api';
import { pickImage, type PickedImage } from '@/net/media';

type Row = { line: number; text: string; choices: string[]; difficulty?: number };
type Report = { added: number; valid: number; duplicates: number; invalid: { line: number; reason: string }[]; total: number | null };
/** Nouveau thème créé directement depuis le CSV : pas besoin de taper des questions à la main. */
type Draft = { name: string; categoryId: string; icon: PickedImage | null; cover: PickedImage | null };

/** Contrôle local pour l'aperçu d'un thème qui n'existe pas encore (mêmes règles que le serveur). */
function checkRows(rows: Row[]) {
  const invalid: { line: number; reason: string }[] = [];
  const valid: Row[] = [];
  const seen = new Set<string>();
  let duplicates = 0;
  for (const r of rows) {
    const text = r.text.trim();
    const choices = r.choices.map((c) => c.trim());
    let reason = '';
    if (!text) reason = 'question vide';
    else if (text.length > RULES.maxQuestionLength) reason = `question trop longue (${text.length}/${RULES.maxQuestionLength})`;
    else if (choices.length !== 4 || choices.some((c) => !c)) reason = 'il faut 4 réponses';
    else if (new Set(choices.map((c) => c.toLocaleLowerCase())).size !== 4) reason = 'deux réponses identiques';
    if (reason) {
      invalid.push({ line: r.line, reason });
      continue;
    }
    if (seen.has(text.toLocaleLowerCase())) {
      duplicates++;
      continue;
    }
    seen.add(text.toLocaleLowerCase());
    valid.push({ ...r, text, choices });
  }
  return { valid, invalid, duplicates };
}

async function uploadAsset(themeId: string, kind: 'icon' | 'cover', image: PickedImage) {
  const token = await AsyncStorage.getItem(TOKEN_KEY);
  if (!token) throw new ApiError(401, 'not_connected');
  const blob = await (await fetch(image.uri)).blob();
  const response = await fetch(apiBase() + '/api/admin/themes/' + themeId + '/' + kind, {
    method: 'PUT',
    headers: { authorization: 'Bearer ' + token, 'content-type': image.mimeType ?? blob.type ?? 'application/octet-stream' },
    body: blob,
  });
  const data = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) throw new ApiError(response.status, data.error ?? 'error');
}

/** Découpe une ligne CSV (guillemets acceptés) avec le séparateur donné. */
function splitLine(line: string, sep: string): string[] {
  const cells: string[] = [];
  let cell = '', quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && !cell.trim()) { quoted = true; cell = ''; }
    else if (c === sep) { cells.push(cell.trim()); cell = ''; }
    else cell += c;
  }
  cells.push(cell.trim());
  return cells;
}

/** Format : question ; bonne réponse ; mauvaise 1 ; mauvaise 2 ; mauvaise 3 [; difficulté 1-3]. */
function parseCsv(content: string): Row[] {
  const lines = content.replace(/^﻿/, '').split(/\r?\n/);
  const first = lines.findIndex((l) => l.trim());
  if (first < 0) return [];
  const sample = lines[first];
  const sep = [';', '\t', ','].sort((a, b) => sample.split(b).length - sample.split(a).length)[0];
  const rows: Row[] = [];
  lines.forEach((raw, index) => {
    if (!raw.trim()) return;
    let cells = splitLine(raw, sep);
    // Colonne de numérotation en tête (« 40;Question;… ») : on l'ignore.
    if (cells.length >= 6 && /^\d+$/.test(cells[0] ?? '')) cells = cells.slice(1);
    if (index === first && /^question/i.test(cells[0] ?? '')) return; // ligne d'en-tête
    const difficulty = Number(cells[5]);
    rows.push({ line: index + 1, text: cells[0] ?? '', choices: cells.slice(1, 5), difficulty: [1, 2, 3].includes(difficulty) ? difficulty : undefined });
  });
  return rows;
}

/** Import rapide de questions depuis un CSV (par ex. généré par une IA), avec aperçu avant d'enregistrer. */
export default function ImportQuestionsScreen() {
  const me = useApi<{ role: string }>('/api/me');
  const admin = me.data?.role === 'admin';
  const [search, setSearch] = useState('');
  const [theme, setTheme] = useState<Theme | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [content, setContent] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const rows = useMemo(() => parseCsv(content), [content]);
  const matches = useMemo(() => {
    const q = search.trim().toLocaleLowerCase();
    const plain = (t: string) => t.toLocaleLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
    return q ? THEMES.filter((t) => plain(t.name).includes(plain(q))).slice(0, 8) : [];
  }, [search]);

  const reset = () => { setPreview(null); setNotice(null); };
  const pickFile = async () => {
    const picked = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
    if (picked.canceled || !picked.assets[0]) return;
    const file = picked.assets[0];
    const text = file.file ? await file.file.text() : await (await fetch(file.uri)).text();
    setFileName(file.name); setContent(text); reset();
  };
  const chooseImage = async (kind: 'icon' | 'cover') => {
    try {
      const image = await pickImage('library', kind === 'icon' ? { square: true } : { aspect: [3, 1] });
      if (image) setDraft((d) => (d ? { ...d, [kind]: image } : d));
    } catch (e) {
      setNotice({ ok: false, text: errorMessage(e) });
    }
  };
  const draftError = !draft
    ? null
    : !draft.name.trim()
      ? 'Écris le nom du thème.'
      : !draft.icon || !draft.cover
        ? 'Choisis l’icône et la photo de couverture du thème.'
        : null;

  const createTheme = async (dryRun: boolean) => {
    if (!draft) return;
    const { valid, invalid, duplicates } = checkRows(rows);
    if (dryRun) return setPreview({ added: 0, valid: valid.length, duplicates, invalid, total: null });
    if (valid.length < RULES.questionsPerDuel || draftError || !draft.icon || !draft.cover) return;
    setBusy(true);
    setNotice(null);
    try {
      const asInput = (r: Row) => ({ text: r.text, choices: r.choices, difficulty: r.difficulty ?? 2 });
      const name = draft.name.trim();
      const created = await api<{ id: string }>('POST', '/api/admin/themes', {
        name,
        description: `Questions sur ${name}`.slice(0, 180),
        categoryId: draft.categoryId,
        titles: [],
        questions: valid.slice(0, 100).map(asInput),
      });
      await uploadAsset(created.id, 'icon', draft.icon);
      await uploadAsset(created.id, 'cover', draft.cover);
      const { theme: published } = await api<{ theme: Theme }>('POST', '/api/admin/themes/' + created.id + '/publish');
      registerTheme(published);
      let total = Math.min(valid.length, 100);
      // La création accepte 100 questions au plus : le reste passe par l'import.
      if (valid.length > 100) {
        const rest = await api<Report>('POST', `/api/admin/themes/${published.id}/questions/import`, { questions: valid.slice(100) });
        total = rest.total ?? total;
      }
      invalidateAll();
      setPreview(null);
      setContent('');
      setFileName(null);
      setDraft(null);
      setTheme(published);
      setNotice({ ok: true, text: `Thème « ${name} » créé avec ${total} questions. Il est jouable tout de suite.` });
    } catch (e) {
      setNotice({ ok: false, text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  const send = async (dryRun: boolean) => {
    if (draft) return createTheme(dryRun);
    if (!theme || !rows.length) return;
    setBusy(true); setNotice(null);
    try {
      const report = await api<Report>('POST', `/api/admin/themes/${theme.id}/questions/import`, { questions: rows, dryRun });
      if (dryRun) setPreview(report);
      else {
        setPreview(null); setContent(''); setFileName(null);
        invalidateAll();
        setNotice({ ok: true, text: `${report.added} question${report.added > 1 ? 's' : ''} ajoutée${report.added > 1 ? 's' : ''} à « ${theme.name} » (${report.total} au total).` });
      }
    } catch (e) { setNotice({ ok: false, text: errorMessage(e) }); }
    finally { setBusy(false); }
  };

  if (me.data && !admin) {
    return <AdminScreen title="Importer des questions"><AppText muted>Accès réservé aux administrateurs.</AppText></AdminScreen>;
  }

  return (
    <AdminScreen title="Importer des questions">
      <View style={adminStyles.stack}>
        <Card style={styles.gap}>
          <AppText variant="label">Format attendu (une question par ligne)</AppText>
          <AppText style={styles.mono}>question;bonne réponse;mauvaise 1;mauvaise 2;mauvaise 3</AppText>
          <Hint>La bonne réponse est toujours en 2e colonne : l'ordre est mélangé pendant le duel. Une 6e colonne facultative donne la difficulté (1, 2 ou 3). Séparateur « ; », « , » ou tabulation.</Hint>
        </Card>

        <Field label="1. Thème">
          {draft ? (
            <View style={styles.gap}>
              <TextInput value={draft.name} onChangeText={(name) => setDraft({ ...draft, name })} maxLength={60} placeholder="Nom du nouveau thème" placeholderTextColor={Colors.textMuted} style={adminStyles.input} accessibilityLabel="Nom du nouveau thème" />
              <Hint>Catégorie</Hint>
              <Pills value={draft.categoryId} onChange={(categoryId) => setDraft({ ...draft, categoryId })} options={CATEGORIES.map((c) => ({ value: c.id as string, label: `${c.icon} ${c.name}`, color: c.color }))} />
              <View style={styles.pickRow}>
                <Tap accessibilityRole="button" accessibilityLabel="Choisir l’icône" onPress={() => void chooseImage('icon')} style={[styles.pick, styles.pickIcon]}>
                  {draft.icon ? <Image source={{ uri: draft.icon.uri }} contentFit="cover" style={StyleSheet.absoluteFill} /> : <AppText variant="caption" muted>Icône</AppText>}
                </Tap>
                <Tap accessibilityRole="button" accessibilityLabel="Choisir la photo de couverture" onPress={() => void chooseImage('cover')} style={[styles.pick, styles.pickCover]}>
                  {draft.cover ? <Image source={{ uri: draft.cover.uri }} contentFit="cover" style={StyleSheet.absoluteFill} /> : <AppText variant="caption" muted>Photo de couverture</AppText>}
                </Tap>
              </View>
              <Button small variant="outline" label="Annuler, choisir un thème existant" onPress={() => { setDraft(null); reset(); }} />
            </View>
          ) : theme ? (
            <View style={styles.chosen}>
              <AppText style={{ flex: 1 }} variant="label">{theme.name}</AppText>
              <Button small variant="outline" label="Changer" onPress={() => { setTheme(null); reset(); }} />
            </View>
          ) : (
            <View style={styles.gap}>
              <TextInput value={search} onChangeText={setSearch} placeholder="Chercher un thème…" placeholderTextColor={Colors.textMuted} style={adminStyles.input} accessibilityLabel="Chercher un thème" />
              {matches.map((t) => (
                <Tap key={t.id} onPress={() => { setTheme(t); setSearch(''); reset(); }} style={styles.match} accessibilityRole="button">
                  <AppText>{t.name}</AppText>
                  <AppText muted variant="caption">{t.questionCount} questions</AppText>
                </Tap>
              ))}
              {search.trim().length > 1 && (
                <Button small variant="outline" label={`+ Créer le thème « ${search.trim()} »`} onPress={() => { setDraft({ name: search.trim(), categoryId: CATEGORIES[0].id, icon: null, cover: null }); setSearch(''); reset(); }} />
              )}
            </View>
          )}
        </Field>

        <Field label="2. Questions">
          <View style={styles.gap}>
            <Button variant="outline" label={fileName ? `Fichier : ${fileName}` : 'Choisir un fichier CSV'} onPress={pickFile} />
            <Hint>… ou colle directement le texte donné par l'IA :</Hint>
            <TextInput value={content} onChangeText={(t) => { setContent(t); setFileName(null); reset(); }} multiline placeholder="Colle les lignes ici" placeholderTextColor={Colors.textMuted} style={[adminStyles.input, styles.area]} accessibilityLabel="Contenu CSV" />
            {!!rows.length && <Hint>{rows.length} ligne{rows.length > 1 ? 's' : ''} lue{rows.length > 1 ? 's' : ''}.</Hint>}
          </View>
        </Field>

        {preview && (
          <Card style={styles.gap}>
            <AppText variant="label">Aperçu</AppText>
            <AppText>✅ {preview.valid} prête{preview.valid > 1 ? 's' : ''} à ajouter</AppText>
            {!!preview.duplicates && <AppText muted>↩︎ {preview.duplicates} en double (ignorée{preview.duplicates > 1 ? 's' : ''})</AppText>}
            {draft && preview.valid < RULES.questionsPerDuel && <AppText color={Colors.accentInk}>Il faut au moins {RULES.questionsPerDuel} questions valides pour créer un thème.</AppText>}
            {draft && draftError && <AppText color={Colors.accentInk}>{draftError}</AppText>}
            {!!preview.invalid.length && <AppText color={Colors.accentInk}>⚠️ {preview.invalid.length} ligne{preview.invalid.length > 1 ? 's' : ''} en erreur</AppText>}
            {preview.invalid.slice(0, 20).map((e) => <Hint key={e.line}>Ligne {e.line} : {e.reason}</Hint>)}
            {rows.slice(0, 3).map((r) => (
              <View key={r.line} style={styles.sample}>
                <AppText variant="label">{r.text}</AppText>
                <AppText variant="caption" color="#1E9E5A">✓ {r.choices[0]}</AppText>
                <AppText variant="caption" muted>✗ {r.choices.slice(1).join(' · ')}</AppText>
              </View>
            ))}
          </Card>
        )}

        {notice && <AppText color={notice.ok ? '#1E9E5A' : Colors.accentInk}>{notice.text}</AppText>}

        {!preview && !theme && !draft && !!rows.length && <AppText color={Colors.accentInk}>Choisis d'abord le thème (étape 1) : tape son nom, puis touche-le dans la liste ou crée-le.</AppText>}
        {preview ? (
          <Button
            label={busy ? (draft ? 'Création…' : 'Ajout…') : draft ? `Créer le thème avec ${preview.valid} questions` : `Ajouter ${preview.valid} question${preview.valid > 1 ? 's' : ''}`}
            disabled={busy || !preview.valid || (!!draft && (!!draftError || preview.valid < RULES.questionsPerDuel))}
            onPress={() => send(false)}
          />
        ) : (
          <Button label={busy ? 'Analyse…' : 'Vérifier'} disabled={busy || (!theme && !draft) || !rows.length} onPress={() => send(true)} />
        )}
      </View>
    </AdminScreen>
  );
}

const styles = StyleSheet.create({
  gap: { gap: Spacing.xs },
  mono: { fontFamily: 'monospace', fontSize: 12 },
  chosen: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  match: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, paddingHorizontal: 12, borderRadius: Radius.md, backgroundColor: Colors.surfaceRaised },
  area: { minHeight: 140, textAlignVertical: 'top' },
  pickRow: { flexDirection: 'row', gap: Spacing.sm },
  pick: { overflow: 'hidden', borderRadius: Radius.md, backgroundColor: Colors.surfaceRaised, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
  pickIcon: { width: 80, height: 80 },
  pickCover: { flex: 1, height: 80 },
  sample: { gap: 2, paddingTop: Spacing.xs, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border },
});
